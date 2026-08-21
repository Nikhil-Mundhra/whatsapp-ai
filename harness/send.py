#!/usr/bin/env python3
"""Autonomous texting engine with OpenRouter (Qwen 3.8 27B / Qwen 2.5), reasoning, and persona style mirroring.

Pulls the last N messages of a 1:1 chat, generates a reply using OpenRouter/Ollama
with thinking/reasoning token support, and sends it to the contact.

Usage:
    uv run harness/send.py <recipient> [--limit 20] [--model qwen/qwen3.8-27b]
                           [--draft-only] [--loop] [--interval SECONDS]
"""

import argparse
import json
import os
import re
import sys
import time

import requests
from dotenv import load_dotenv

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(REPO_ROOT, ".env"))

if os.environ.get("PYTHONUNBUFFERED") or not sys.stdout.isatty():
    sys.stdout.reconfigure(line_buffering=True)

sys.path.insert(0, os.path.join(REPO_ROOT, "whatsapp-mcp-server"))

from whatsapp import (  # noqa: E402
    get_direct_chat_by_contact,
    get_sender_name,
    list_messages,
    send_message,
)

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/chat")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("AI_API_KEY") or ""
DEFAULT_MODEL = os.environ.get("AI_MODEL") or "qwen/qwen3.8-27b"


def _parse_recipients(raw: str):
    """Parse ALLOWED_RECIPIENTS env as a JSON array, falling back to CSV."""
    raw = (raw or "").strip()
    if not raw:
        return []
    if raw.startswith("["):
        try:
            return [str(r) for r in json.loads(raw)]
        except ValueError:
            pass
    return [r.strip() for r in raw.split(",") if r.strip()]


ALLOWED_RECIPIENTS = {
    re.sub(r"\D", "", r)
    for r in _parse_recipients(os.environ.get("ALLOWED_RECIPIENTS", ""))
    if re.sub(r"\D", "", r).strip()
}


def normalize_recipient(recipient: str) -> str:
    digits = re.sub(r"\D", "", recipient)
    if digits.startswith("00"):
        digits = digits[2:]
    return digits.lstrip("0") or recipient


def get_owner_name() -> str:
    explicit = os.environ.get("OWNER_NAME", "").strip()
    if explicit:
        return explicit
    owner_phone = re.sub(r"\D", "", os.environ.get("OWNER_PHONE", ""))
    if owner_phone:
        name = get_sender_name(owner_phone)
        if name and not name.isdigit() and not name.endswith("@lid") and not name.endswith("@s.whatsapp.net"):
            return name
    return ""


def get_system_prompt() -> str:
    owner_name = get_owner_name()
    if owner_name:
        identity = (
            f"You are {owner_name}, the person who writes the messages labeled 'From: Me' in the "
            f"conversation history below. Your name is {owner_name}."
        )
    else:
        identity = (
            "You are the person who writes the messages labeled 'From: Me' in the "
            "conversation history below."
        )

    return (
        f"{identity} That is your own writing style: mirror your "
        "own message length, tone, capitalization, punctuation, slang, and emoji "
        "usage. If your messages are one-liners, reply with one-liners. If you "
        "use emojis, use emojis; if you don't, don't.\n\n"
        "LANGUAGE PREFERENCE:\n"
        "- If the other person or the chat history uses non-English languages, regional dialects, "
        "vernacular phrases, or code-mixed speech (e.g. Hindi/Hinglish, Telugu/Tanglish, etc. written in Latin/English script), "
        "ALWAYS prefer and reply in that language or code-mixed style over plain English, even if English is commonly used in the chat.\n"
        "- Match the casual Romanized transliteration style naturally (e.g., respond in natural regional vernacular/slang instead of reverting to formal English).\n\n"
        "READ THE ROOM:\n"
        "- The last message from the other person is the one you are replying to. "
        "Answer what THEY just said and stay on that topic. Never reply with a "
        "generic or off-topic one-liner.\n"
        "- Never repeat a message you already sent in the history, and never send "
        "the same text twice in a row.\n"
        "- Never continue your own monologue: if the other person has not spoken "
        "since your last message, you have nothing to reply to.\n"
        "- Reply naturally and human. Don't mention that you're an AI. Don't use "
        "markdown. Output only the message text and nothing else."
    )


THINK_MIN_WORDS = 5
THINK_LIMIT = 20
FAST_LIMIT = 8


def generate_reply(history: str, model: str = DEFAULT_MODEL, think: bool = True) -> str:
    """Generate reply via OpenRouter (with reasoning enabled) or local Ollama."""
    api_key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("AI_API_KEY") or ""
    system_prompt = get_system_prompt()

    # 1. OpenRouter / Cloud API
    if api_key:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/Nikhil-Mundhra/whatsapp-ai",
            "X-Title": "WhatsApp TakeOver AI",
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": history},
            ],
            "max_tokens": 2000,
            "reasoning": {"effort": "low"} if think else None,
        }

        try:
            resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            choice = data["choices"][0]["message"]
            content = choice.get("content", "").strip()

            # If reasoning details were returned, log them for transparency
            if choice.get("reasoning_details"):
                print(f"[reasoning] {choice['reasoning_details']}")
            elif choice.get("reasoning"):
                print(f"[reasoning] {choice['reasoning']}")

            if "</think>" in content:
                content = content.split("</think>")[-1].strip()

            return content
        except Exception as e:
            print(f"[warn] OpenRouter request failed: {e}. Falling back...")

    # 2. Local Ollama Fallback
    try:
        resp = requests.post(
            OLLAMA_URL,
            json={
                "model": model,
                "think": think,
                "stream": False,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": history},
                ],
            },
            timeout=300,
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"].strip()
    except Exception as e:
        raise RuntimeError(f"Failed to generate reply: {e}")


def last_incoming_words(history: str) -> int:
    """Word count of the most recent incoming (non-Me) message, ignoring metadata brackets."""
    for line in history.strip().splitlines():
        if "From: " not in line or "From: Me:" in line:
            continue
        content = line.split("From: ", 1)[1]
        content = content.split(": ", 1)[1] if ": " in content else content
        # Strip metadata tags like [image - Message ID: ...] or [replied to: ...]
        clean_content = re.sub(r"\[.*?\]", "", content).strip()
        return len(clean_content.split())
    return 0


def should_think(history: str) -> bool:
    """Turn on thinking mode when the last incoming text is > 5 words."""
    return last_incoming_words(history) > THINK_MIN_WORDS


def send_reply(recipient: str, model: str = DEFAULT_MODEL, draft_only: bool = False) -> tuple:
    """Fetch history for a recipient, compose a reply, and send it.

    Returns (reply_text, (ok, status)) — status is None when draft_only.
    """
    chat = get_direct_chat_by_contact(recipient)
    if chat:
        history = list_messages(chat_jid=chat.jid, limit=THINK_LIMIT, include_context=False)
    else:
        print(f"Note: no synced chat history for {recipient} yet — sending without context.")
        history = ""

    think = should_think(history)
    if think:
        context = history
        print(f"[thinking/reasoning mode] last incoming > {THINK_MIN_WORDS} words — using {THINK_LIMIT} msgs")
    else:
        lines = [l for l in history.strip().splitlines() if l.strip()][:FAST_LIMIT]
        context = "\n".join(lines)
        print(f"[fast mode] using {len(lines)} msgs")

    reply = generate_reply(context, model, think=think)
    print(f"[drafted reply] {reply}")
    if draft_only:
        return reply, None

    ok, status = send_message(recipient, reply)
    print(f"Sent: {ok} - {status}")
    return reply, (ok, status)


def count_recent_me(history: str, window: int = 5) -> int:
    """Count 'From: Me' messages among the most recent `window` messages.

    History is newest-first (line 0 = most recent), so take the *front*
    of the list, not the tail.
    """
    lines = [l for l in history.strip().splitlines() if "From: " in l]
    return sum(1 for l in lines[:window] if "From: Me:" in l)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recipient", help="Phone number (country code, no +) or JID")
    parser.add_argument("--limit", type=int, default=20, help="Messages of context to use")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--draft-only", action="store_true", help="Print reply without sending")
    parser.add_argument("--loop", action="store_true", help="Keep drafting and sending recursively")
    parser.add_argument("--interval", type=float, default=3.0, help="Seconds between loop iterations")
    args = parser.parse_args()

    recipient = normalize_recipient(args.recipient)
    if ALLOWED_RECIPIENTS and recipient not in ALLOWED_RECIPIENTS:
        print(
            f"Blocked: {args.recipient} is not in ALLOWED_RECIPIENTS. "
            f"Allowed: {', '.join(sorted(ALLOWED_RECIPIENTS))}"
        )
        sys.exit(1)

    def get_history() -> str:
        chat = get_direct_chat_by_contact(recipient)
        if chat:
            return list_messages(chat_jid=chat.jid, limit=args.limit, include_context=False)
        print(f"Note: no synced chat history for {args.recipient} yet — sending without context.")
        return ""

    def wait_for_their_turn(max_recent_me: int = 2) -> None:
        """Wait until it's natural to send: the other person has the floor and
        we haven't dominated the recent conversation."""
        while True:
            history = get_history()
            if count_recent_me(history) <= max_recent_me:
                return
            time.sleep(args.interval)

    def send_once() -> str:
        reply, _ = send_reply(recipient, args.model, draft_only=args.draft_only)
        return reply

    if args.loop:
        while True:
            try:
                wait_for_their_turn()
                send_once()
                time.sleep(args.interval)
            except KeyboardInterrupt:
                print("\nStopped.")
                return

    send_once()


if __name__ == "__main__":
    main()

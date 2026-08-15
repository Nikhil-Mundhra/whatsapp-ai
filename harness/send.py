#!/usr/bin/env python3
"""Basic harness: text "her" using a local LLM (qwen3.5-32k via Ollama).

Pulls the last N messages of a 1:1 chat, generates a reply with the local
model, prints it, and sends it immediately.

Usage:
    uv run harness/send.py <recipient> [--limit 20] [--model qwen3.5-32k]
                           [--draft-only] [--loop] [--interval SECONDS]
"""

import argparse
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
    list_messages,
    send_message,
)

OLLAMA_URL = "http://localhost:11434/api/chat"

ALLOWED_RECIPIENTS = {
    re.sub(r"\D", "", r)
    for r in os.environ.get("ALLOWED_RECIPIENTS", "").split(",")
    if r.strip()
}


def normalize_recipient(recipient: str) -> str:
    digits = re.sub(r"\D", "", recipient)
    if digits.startswith("00"):
        digits = digits[2:]
    return digits.lstrip("0") or recipient

SYSTEM_PROMPT = (
    "You are the person who writes the messages labeled 'From: Me' in the "
    "conversation history below. That is your own writing style: mirror your "
    "own message length, tone, capitalization, punctuation, slang, and emoji "
    "usage. If your messages are one-liners, reply with one-liners. If you "
    "use emojis, use emojis; if you don't, don't. Stay in the same language "
    "you use. Do NOT copy or mirror the other person's style.\n\n"
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


def generate_reply(history: str, model: str, think: bool = False) -> str:
    resp = requests.post(
        OLLAMA_URL,
        json={
            "model": model,
            "think": think,
            "stream": False,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": history},
            ],
        },
        timeout=300,
    )
    resp.raise_for_status()
    return resp.json()["message"]["content"].strip()


def last_incoming_words(history: str) -> int:
    """Word count of the most recent incoming (non-Me) message."""
    for line in history.strip().splitlines():
        if "From: " not in line or "From: Me:" in line:
            continue
        content = line.split("From: ", 1)[1]
        content = content.split(": ", 1)[1] if ": " in content else content
        return len(content.split())
    return 0


def should_think(history: str) -> bool:
    """Turn on thinking mode when the last incoming text is > 5 words."""
    return last_incoming_words(history) > THINK_MIN_WORDS


def send_reply(recipient: str, model: str = "qwen3.5-32k", draft_only: bool = False) -> tuple:
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
        print(f"[thinking mode] last incoming > {THINK_MIN_WORDS} words — using {THINK_LIMIT} msgs")
    else:
        lines = [l for l in history.strip().splitlines() if l.strip()][:FAST_LIMIT]
        context = "\n".join(lines)
        print(f"[fast mode] using {len(lines)} msgs")

    reply = generate_reply(context, model, think=think)
    print(reply)
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
    parser.add_argument("--model", default="qwen3.5-32k")
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

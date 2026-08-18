#!/usr/bin/env python3
"""Endless controller for take-over polls + AI texting.

Watches each allowed contact's chat. On a new incoming message it sends the
owner a real WhatsApp poll ("take over": 1 text / 5 min / 2 h / deny). While
the owner's grant is active the AI replies to the contact automatically. If
the owner manually texts the contact, the poll/grant expires and the owner is
notified.

Usage:
    uv run harness/controller.py [--interval SECONDS]
"""

import argparse
import json
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timedelta

import requests
from dotenv import load_dotenv

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(REPO_ROOT, ".env"))

if os.environ.get("PYTHONUNBUFFERED") or not sys.stdout.isatty():
    sys.stdout.reconfigure(line_buffering=True)

sys.path.insert(0, os.path.join(REPO_ROOT, "whatsapp-mcp-server"))

from whatsapp import (  # noqa: E402
    MESSAGES_DB_PATH,
    get_direct_chat_by_contact,
    get_poll_vote,
    get_sender_name,
    list_messages,
    send_message,
    send_poll,
)
from send import count_recent_me, send_reply  # noqa: E402


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


OWNER_PHONE = re.sub(r"\D", "", os.environ.get("OWNER_PHONE", ""))
ALLOWED_RECIPIENTS = {
    re.sub(r"\D", "", r)
    for r in _parse_recipients(os.environ.get("ALLOWED_RECIPIENTS", ""))
    if r.strip()
}

STATE_PATH = os.path.join(REPO_ROOT, "harness", "controller_state.json")

POLL_OPTIONS = ["Send 1 text", "5 minutes", "2 hours", "Deny"]
GRANT_DURATIONS = {"5 minutes": timedelta(minutes=5), "2 hours": timedelta(hours=2)}

STATE_DEFAULTS = {
    "last_rowids": {},
    "mode": "idle",  # idle | polling | granted
    "poll_id": None,
    "grant_kind": None,  # count | duration
    "grant_remaining": 0,
    "grant_expires_at": None,
}


def load_state() -> dict:
    if os.path.exists(STATE_PATH):
        try:
            with open(STATE_PATH) as f:
                return json.load(f)
        except Exception:
            pass
    return dict(STATE_DEFAULTS)


def save_state(state: dict) -> None:
    dirname = os.path.dirname(STATE_PATH)
    os.makedirs(dirname, exist_ok=True)
    temp_path = f"{STATE_PATH}.tmp.{os.getpid()}"
    try:
        with open(temp_path, "w") as f:
            json.dump(state, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_path, STATE_PATH)
    except Exception as e:
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass
        print(f"[error] saving state: {e}")


def chat_name(recipient: str) -> str:
    chat = get_direct_chat_by_contact(recipient)
    if chat:
        resolved = get_sender_name(chat.jid)
        if resolved and not resolved.isdigit():
            return resolved
        if chat.name and not chat.name.isdigit():
            return chat.name
    return recipient


def contact_chat_jid(recipient: str) -> str:
    chat = get_direct_chat_by_contact(recipient)
    return chat.jid if chat else None


def max_rowid(chat_jid: str) -> int:
    """Current highest rowid for a chat, used to seed the watcher so history isn't replayed."""
    try:
        conn = sqlite3.connect(MESSAGES_DB_PATH)
        row = conn.execute(
            "SELECT MAX(rowid) FROM messages WHERE chat_jid = ?", (chat_jid,)
        ).fetchone()
        conn.close()
        return row[0] if row and row[0] else 0
    except sqlite3.Error as e:
        print(f"[error] reading max rowid: {e}")
        return 0


def new_messages(chat_jid: str, after_rowid: int) -> list:
    """Return messages in this chat with rowid > after_rowid, oldest first."""
    try:
        conn = sqlite3.connect(MESSAGES_DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT rowid, id, content, is_from_me, origin, timestamp "
            "FROM messages WHERE chat_jid = ? AND rowid > ? "
            "ORDER BY rowid ASC",
            (chat_jid, after_rowid),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except sqlite3.Error as e:
        print(f"[error] reading messages: {e}")
        return []


def contact_has_floor(recipient: str) -> bool:
    """True when the most recent message in the chat isn't ours (AI/owner)."""
    chat = get_direct_chat_by_contact(recipient)
    if not chat:
        return True
    history = list_messages(chat_jid=chat.jid, limit=1, include_context=False)
    return count_recent_me(history, window=1) == 0


def is_grant_active(state: dict, now: datetime) -> bool:
    if state["mode"] != "granted":
        return False
    if state["grant_kind"] == "duration":
        expires = state.get("grant_expires_at")
        if expires and now < datetime.fromisoformat(expires):
            return True
        return False
    if state["grant_kind"] == "count":
        return state.get("grant_remaining", 0) > 0
    return False


def expire_grant(state: dict) -> None:
    state["mode"] = "idle"
    state["poll_id"] = None
    state["grant_kind"] = None
    state["grant_remaining"] = 0
    state["grant_expires_at"] = None


def notify_owner_manual_text(contact_display: str) -> None:
    text = f"You just texted {contact_display}: Closing request"
    ok, status = send_message(OWNER_PHONE, text)
    print(f"[owner] {text} -> {ok} {status}")


def send_take_over_poll(contact_display: str, state: dict) -> None:
    ok, status, poll_id = send_poll(
        OWNER_PHONE,
        f"{contact_display} texted you. Take over?",
        POLL_OPTIONS,
        1,
    )
    print(f"[poll] {ok} {status} id={poll_id}")
    if ok and poll_id:
        state["mode"] = "polling"
        state["poll_id"] = poll_id


def handle_vote(state: dict, contact_display: str, recipient: str, model: str, now: datetime) -> None:
    vote = get_poll_vote(state["poll_id"]) if state["poll_id"] else None
    if not vote:
        return
    print(f"[poll] vote: {vote!r}")
    granted = False
    norm_vote = (vote or "").strip().lower()
    if "5 min" in norm_vote:
        state["mode"] = "granted"
        state["grant_kind"] = "duration"
        state["grant_expires_at"] = (now + timedelta(minutes=5)).isoformat()
        state["poll_id"] = None
        granted = True
        print(f"[grant] 5 minutes until {state['grant_expires_at']}")
    elif "2 hour" in norm_vote or "2 hr" in norm_vote:
        state["mode"] = "granted"
        state["grant_kind"] = "duration"
        state["grant_expires_at"] = (now + timedelta(hours=2)).isoformat()
        state["poll_id"] = None
        granted = True
        print(f"[grant] 2 hours until {state['grant_expires_at']}")
    elif "1 text" in norm_vote or "1" in norm_vote or "send 1 text" in norm_vote:
        state["mode"] = "granted"
        state["grant_kind"] = "count"
        state["grant_remaining"] = 1
        state["poll_id"] = None
        granted = True
        print("[grant] 1 text remaining")
    elif "deny" in norm_vote:
        expire_grant(state)
        print("[deny] no grant")
    if granted:
        if contact_has_floor(recipient):
            print("[incoming] answering pending message -> AI reply")
            reply, _ = send_reply(recipient, model)
            if state["grant_kind"] == "count":
                state["grant_remaining"] -= 1
                if state["grant_remaining"] <= 0:
                    print("[grant] 1 text used -> idle")
                    expire_grant(state)
            print(f"[reply] {reply!r}")
        else:
            print("[guard] we already have the floor — not replying")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interval", type=float, default=2.0, help="Seconds between checks")
    parser.add_argument("--model", default="qwen3.5-32k")
    args = parser.parse_args()

    if not OWNER_PHONE:
        print("OWNER_PHONE not set in .env")
        sys.exit(1)
    if not ALLOWED_RECIPIENTS:
        print("ALLOWED_RECIPIENTS not set in .env")
        sys.exit(1)

    state = load_state()
    recipients = sorted(ALLOWED_RECIPIENTS)

    # Seed watcher position per chat so pre-existing history isn't treated as new.
    for recipient in recipients:
        jid = contact_chat_jid(recipient)
        if jid:
            state.setdefault("last_rowids", {})[jid] = max_rowid(jid)

    print(f"controller running: owner={OWNER_PHONE} contacts={recipients}")
    print(f"state file: {STATE_PATH}")
    print(f"watcher positions: {state['last_rowids']}")

    while True:
        try:
            now = datetime.now()
            for recipient in recipients:
                jid = contact_chat_jid(recipient)
                if not jid:
                    continue
                display = chat_name(recipient)
                last_rowid = state.get("last_rowids", {}).get(jid, 0)
                msgs = new_messages(jid, last_rowid)
                for msg in msgs:
                    state.setdefault("last_rowids", {})[jid] = msg["rowid"]
                    if msg["origin"] == "phone":
                        print(f"[owner-manual] {msg['content']!r}")
                        if state["mode"] in ("polling", "granted"):
                            expire_grant(state)
                            notify_owner_manual_text(display)
                            save_state(state)
                        continue
                    if msg["origin"] != "remote":
                        continue

                    if state["mode"] == "idle":
                        send_take_over_poll(display, state)
                        save_state(state)
                    elif state["mode"] == "polling":
                        print("[polling] waiting for owner vote...")
                    elif state["mode"] == "granted" and is_grant_active(state, now):
                        if not contact_has_floor(recipient):
                            print("[guard] we already have the floor — waiting for their reply")
                            break
                        print(f"[incoming] {msg['content']!r} -> AI reply")
                        reply, _ = send_reply(recipient, args.model)
                        if state["grant_kind"] == "count":
                            state["grant_remaining"] -= 1
                        print(f"[reply] {reply!r}")
                        if not is_grant_active(state, now):
                            print("[grant] exhausted -> idle")
                            expire_grant(state)
                        save_state(state)
                        break
                    else:
                        if state["mode"] == "granted":
                            print("[grant] expired -> idle")
                            expire_grant(state)
                            save_state(state)
                        send_take_over_poll(display, state)
                        save_state(state)

                if state["mode"] == "polling":
                    handle_vote(state, display, recipient, args.model, now)
                    save_state(state)

            save_state(state)
            time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\nStopped.")
            return
        except Exception as e:
            print(f"[error] {e}")
            time.sleep(args.interval)


if __name__ == "__main__":
    main()

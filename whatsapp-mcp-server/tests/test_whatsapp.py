"""Comprehensive unit test suite for whatsapp.py."""

from datetime import datetime
import json
import os
import sqlite3
import sys
import unittest
from unittest.mock import MagicMock, patch
import requests

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import whatsapp
from whatsapp import (
    Chat,
    Contact,
    Message,
    MessageContext,
    download_media,
    format_message,
    format_messages_list,
    get_chat,
    get_contact_chats,
    get_direct_chat_by_contact,
    get_last_interaction,
    get_lid_for_phone,
    get_message_context,
    get_poll_vote,
    get_sender_name,
    list_chats,
    list_messages,
    search_contacts,
    send_audio_message,
    send_file,
    send_message,
    send_poll,
)


class TestWhatsAppDataclasses(unittest.TestCase):
    """Test dataclasses in whatsapp.py."""

    def test_message_dataclass(self):
        dt = datetime(2026, 8, 19, 10, 0, 0)
        # Default optional fields
        msg = Message(
            timestamp=dt,
            sender="12345@s.whatsapp.net",
            content="Hello",
            is_from_me=True,
            chat_jid="12345@s.whatsapp.net",
            id="msg1"
        )
        self.assertEqual(msg.timestamp, dt)
        self.assertEqual(msg.sender, "12345@s.whatsapp.net")
        self.assertEqual(msg.content, "Hello")
        self.assertTrue(msg.is_from_me)
        self.assertEqual(msg.chat_jid, "12345@s.whatsapp.net")
        self.assertEqual(msg.id, "msg1")
        self.assertIsNone(msg.chat_name)
        self.assertIsNone(msg.media_type)
        self.assertIsNone(msg.replied_to)
        self.assertIsNone(msg.origin)

        # Full fields
        msg_full = Message(
            timestamp=dt,
            sender="12345@s.whatsapp.net",
            content="Photo caption",
            is_from_me=False,
            chat_jid="12345-group@g.us",
            id="msg2",
            chat_name="Group Chat",
            media_type="image",
            replied_to="msg1",
            origin="web"
        )
        self.assertEqual(msg_full.chat_name, "Group Chat")
        self.assertEqual(msg_full.media_type, "image")
        self.assertEqual(msg_full.replied_to, "msg1")
        self.assertEqual(msg_full.origin, "web")

    def test_chat_dataclass_and_is_group_property(self):
        dt = datetime(2026, 8, 19, 10, 0, 0)
        group_chat = Chat(
            jid="123456789@g.us",
            name="Developers Group",
            last_message_time=dt,
            last_message="Let's release",
            last_sender="alice@s.whatsapp.net",
            last_is_from_me=False
        )
        self.assertTrue(group_chat.is_group)

        direct_chat = Chat(
            jid="123456789@s.whatsapp.net",
            name="Bob",
            last_message_time=None
        )
        self.assertFalse(direct_chat.is_group)
        self.assertIsNone(direct_chat.last_message)
        self.assertIsNone(direct_chat.last_sender)
        self.assertIsNone(direct_chat.last_is_from_me)

        lid_chat = Chat(jid="123456789@lid", name="Charlie", last_message_time=dt)
        self.assertFalse(lid_chat.is_group)

    def test_contact_dataclass(self):
        contact = Contact(phone_number="1234567890", name="Alice", jid="1234567890@s.whatsapp.net")
        self.assertEqual(contact.phone_number, "1234567890")
        self.assertEqual(contact.name, "Alice")
        self.assertEqual(contact.jid, "1234567890@s.whatsapp.net")

    def test_message_context_dataclass(self):
        dt = datetime(2026, 8, 19, 10, 0, 0)
        target = Message(dt, "1@s.whatsapp.net", "Target", True, "1@s.whatsapp.net", "t1")
        before_msg = Message(dt, "1@s.whatsapp.net", "Before", False, "1@s.whatsapp.net", "b1")
        after_msg = Message(dt, "1@s.whatsapp.net", "After", False, "1@s.whatsapp.net", "a1")

        ctx = MessageContext(message=target, before=[before_msg], after=[after_msg])
        self.assertEqual(ctx.message, target)
        self.assertEqual(len(ctx.before), 1)
        self.assertEqual(len(ctx.after), 1)


class TestWhatsAppDatabaseFunctions(unittest.TestCase):
    """Test SQLite database operations and helper functions in whatsapp.py."""

    def test_get_lid_for_phone_found(self):
        """Should resolve phone number to LID JID when found in whatsmeow_lid_map."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.fetchone.return_value = ("987654321",)

        with patch("sqlite3.connect", return_value=mock_conn) as mock_connect:
            result = get_lid_for_phone("+1 (234) 567-8900")
            self.assertEqual(result, "987654321@lid")
            mock_connect.assert_called_once_with(whatsapp.WHATSAPP_DB_PATH)
            mock_cursor.execute.assert_called_once_with(
                "SELECT lid FROM whatsmeow_lid_map WHERE pn = ?", ("12345678900",)
            )
            mock_conn.close.assert_called_once()

    def test_get_lid_for_phone_not_found(self):
        """Should return None when phone number is not found in whatsmeow_lid_map."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.fetchone.return_value = None

        with patch("sqlite3.connect", return_value=mock_conn):
            result = get_lid_for_phone("12345")
            self.assertIsNone(result)
            mock_conn.close.assert_called_once()

    def test_get_lid_for_phone_sqlite_error(self):
        """Should return None and close connection safely when SQLite error occurs."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.execute.side_effect = sqlite3.OperationalError("Table not found")

        with patch("sqlite3.connect", return_value=mock_conn):
            result = get_lid_for_phone("12345")
            self.assertIsNone(result)
            mock_conn.close.assert_called_once()

    def test_get_sender_name_with_contacts_full_name(self):
        """Should resolve sender name from whatsmeow_contacts with full_name."""
        msg_conn = MagicMock()
        msg_cur = MagicMock()
        msg_conn.cursor.return_value = msg_cur
        msg_cur.fetchone.return_value = ("Bare Chat Name",)

        wa_conn = MagicMock()
        wa_cur = MagicMock()
        wa_conn.cursor.return_value = wa_cur
        wa_cur.fetchone.side_effect = [
            ("123456789",),  # lid_map query
            ("Alice Smith", "Alice", "AS"),  # contacts query
        ]

        def fake_connect(db_path):
            if "messages.db" in db_path:
                return msg_conn
            return wa_conn

        with patch("sqlite3.connect", side_effect=fake_connect):
            name = get_sender_name("123456789@lid")
            self.assertEqual(name, "Alice Smith")

    def test_get_sender_name_with_contacts_fallback_names(self):
        """Should pick first non-empty name from (full_name, first_name, push_name)."""
        msg_conn = MagicMock()
        msg_cur = MagicMock()
        msg_conn.cursor.return_value = msg_cur
        msg_cur.fetchone.return_value = None

        wa_conn = MagicMock()
        wa_cur = MagicMock()
        wa_conn.cursor.return_value = wa_cur
        wa_cur.fetchone.side_effect = [
            None,  # lid_map query returns None -> search = digits
            (None, "BobFirst", "BobPush"),  # contacts query
        ]

        def fake_connect(db_path):
            if "messages.db" in db_path:
                return msg_conn
            return wa_conn

        with patch("sqlite3.connect", side_effect=fake_connect):
            name = get_sender_name("99887766@s.whatsapp.net")
            self.assertEqual(name, "BobFirst")

    def test_get_sender_name_fallback_to_chats_exact_jid(self):
        """Should fallback to chats table exact JID match if no contact name found."""
        msg_conn = MagicMock()
        msg_cur = MagicMock()
        msg_conn.cursor.return_value = msg_cur
        msg_cur.fetchone.return_value = ("Project Alpha Group",)

        wa_conn = MagicMock()
        wa_cur = MagicMock()
        wa_conn.cursor.return_value = wa_cur
        wa_cur.fetchone.side_effect = [None, None]

        def fake_connect(db_path):
            if "messages.db" in db_path:
                return msg_conn
            return wa_conn

        with patch("sqlite3.connect", side_effect=fake_connect):
            name = get_sender_name("12036302@g.us")
            self.assertEqual(name, "Project Alpha Group")

    def test_get_sender_name_fallback_to_chats_like_jid(self):
        """Should fallback to chats table LIKE match when exact JID is not found."""
        msg_conn = MagicMock()
        msg_cur = MagicMock()
        msg_conn.cursor.return_value = msg_cur
        # First fetchone (exact) is None, second fetchone (LIKE) is ("Charlie",)
        msg_cur.fetchone.side_effect = [None, ("Charlie",)]

        wa_conn = MagicMock()
        wa_cur = MagicMock()
        wa_conn.cursor.return_value = wa_cur
        wa_cur.fetchone.side_effect = [None, None]

        def fake_connect(db_path):
            if "messages.db" in db_path:
                return msg_conn
            return wa_conn

        with patch("sqlite3.connect", side_effect=fake_connect):
            name = get_sender_name("5551234@s.whatsapp.net")
            self.assertEqual(name, "Charlie")

    def test_get_sender_name_no_match_returns_sender_jid(self):
        """Should return original sender_jid when no contact or chat name found."""
        msg_conn = MagicMock()
        msg_cur = MagicMock()
        msg_conn.cursor.return_value = msg_cur
        msg_cur.fetchone.side_effect = [None, None]

        wa_conn = MagicMock()
        wa_cur = MagicMock()
        wa_conn.cursor.return_value = wa_cur
        wa_cur.fetchone.side_effect = [None, None]

        def fake_connect(db_path):
            if "messages.db" in db_path:
                return msg_conn
            return wa_conn

        with patch("sqlite3.connect", side_effect=fake_connect):
            name = get_sender_name("nonexistent_sender")
            self.assertEqual(name, "nonexistent_sender")

    def test_get_sender_name_inner_sqlite_error(self):
        """Inner sqlite error in contacts lookup should be ignored and chats used."""
        msg_conn = MagicMock()
        msg_cur = MagicMock()
        msg_conn.cursor.return_value = msg_cur
        msg_cur.fetchone.return_value = ("Chat Fallback",)

        def fake_connect(db_path):
            if "messages.db" in db_path:
                return msg_conn
            raise sqlite3.OperationalError("Locked DB")

        with patch("sqlite3.connect", side_effect=fake_connect):
            name = get_sender_name("12345@s.whatsapp.net")
            self.assertEqual(name, "Chat Fallback")

    def test_get_sender_name_outer_sqlite_error(self):
        """Outer sqlite error should return sender_jid safely."""
        with patch("sqlite3.connect", side_effect=sqlite3.OperationalError("DB error")):
            name = get_sender_name("12345@s.whatsapp.net")
            self.assertEqual(name, "12345@s.whatsapp.net")

    def test_format_message_variations(self):
        """Test all branches of format_message."""
        dt = datetime(2026, 8, 19, 14, 30, 0)

        # 1. Message from me with alphabetic chat name
        msg_me = Message(
            timestamp=dt,
            sender="12345@s.whatsapp.net",
            content="Hello world",
            is_from_me=True,
            chat_jid="group@g.us",
            id="m1",
            chat_name="Work Team"
        )
        out_me = format_message(msg_me, show_chat_info=True)
        self.assertIn("[2026-08-19 14:30:00] Chat: Work Team From: Me: Hello world", out_me)

        # 2. Message from contact with numeric chat name resolved to non-LID
        msg_numeric_chat = Message(
            timestamp=dt,
            sender="alice_jid@s.whatsapp.net",
            content="Hey!",
            is_from_me=False,
            chat_jid="123456789@s.whatsapp.net",
            id="m2",
            chat_name="123456789"
        )
        with patch("whatsapp.get_sender_name", side_effect=["Alice", "Alice"]):
            out_numeric = format_message(msg_numeric_chat, show_chat_info=True)
            self.assertIn("Chat: Alice From: Alice: Hey!", out_numeric)

        # 3. Message from contact with numeric chat name resolved to @lid (retains numeric label)
        with patch("whatsapp.get_sender_name", side_effect=["999@lid", "Bob"]):
            out_lid_chat = format_message(msg_numeric_chat, show_chat_info=True)
            self.assertIn("Chat: 123456789 From: Bob: Hey!", out_lid_chat)

        # 4. Message with media_type, replied_to, and show_chat_info=False
        msg_media = Message(
            timestamp=dt,
            sender="sender@s.whatsapp.net",
            content="Here is the voice note",
            is_from_me=False,
            chat_jid="chat@s.whatsapp.net",
            id="m3",
            media_type="audio",
            replied_to="prev_msg_id"
        )
        with patch("whatsapp.get_sender_name", return_value="SenderName"):
            out_media = format_message(msg_media, show_chat_info=False)
            self.assertIn("[audio - Message ID: m3 - Chat JID: chat@s.whatsapp.net]", out_media)
            self.assertIn("[replied to: prev_msg_id]", out_media)
            self.assertIn("From: SenderName:", out_media)
            self.assertNotIn("Chat:", out_media)

    def test_format_message_exception_handling(self):
        """Should handle exception during format_message and return output."""
        msg = Message(
            timestamp=datetime(2026, 8, 19, 10, 0, 0),
            sender="123@s.whatsapp.net",
            content="test",
            is_from_me=False,
            chat_jid="123@s.whatsapp.net",
            id="m1"
        )
        with patch("whatsapp.get_sender_name", side_effect=Exception("Formatting exploded")):
            out = format_message(msg)
            self.assertIsInstance(out, str)

    def test_format_messages_list(self):
        """Test formatting empty and non-empty message lists."""
        self.assertEqual(format_messages_list([]), "No messages to display.")

        dt = datetime(2026, 8, 19, 10, 0, 0)
        msg1 = Message(dt, "1@s.whatsapp.net", "Msg1", True, "1@s.whatsapp.net", "m1")
        msg2 = Message(dt, "2@s.whatsapp.net", "Msg2", False, "2@s.whatsapp.net", "m2")

        with patch("whatsapp.get_sender_name", return_value="User2"):
            out = format_messages_list([msg1, msg2], show_chat_info=False)
            self.assertIn("Msg1", out)
            self.assertIn("Msg2", out)

    def test_list_messages_filters_and_queries(self):
        """Test list_messages query building with all filter combinations."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur

        row = (
            "2026-08-19T10:00:00",
            "123@s.whatsapp.net",
            "Test Chat",
            "Sample text",
            1,
            "123@s.whatsapp.net",
            "msg_id_1",
            "text",
            None,
            None
        )
        mock_cur.fetchall.return_value = [row]

        with patch("sqlite3.connect", return_value=mock_conn):
            # Test with all filters enabled and include_context=False
            res = list_messages(
                after="2026-08-01T00:00:00",
                before="2026-08-30T00:00:00",
                sender_phone_number="123@s.whatsapp.net",
                chat_jid="123@s.whatsapp.net",
                query="Sample",
                limit=10,
                page=2,
                include_context=False
            )
            self.assertIn("Sample text", res)
            executed_query = mock_cur.execute.call_args[0][0]
            executed_params = mock_cur.execute.call_args[0][1]

            self.assertIn("messages.timestamp > ?", executed_query)
            self.assertIn("messages.timestamp < ?", executed_query)
            self.assertIn("messages.sender = ?", executed_query)
            self.assertIn("messages.chat_jid = ?", executed_query)
            self.assertIn("LOWER(messages.content) LIKE LOWER(?)", executed_query)
            self.assertIn("LIMIT ? OFFSET ?", executed_query)
            self.assertEqual(executed_params[-2:], (10, 20))  # limit=10, offset=2*10=20

    def test_list_messages_invalid_date_formats(self):
        """Should raise ValueError when invalid after/before ISO date strings are provided."""
        mock_conn = MagicMock()
        with patch("sqlite3.connect", return_value=mock_conn):
            with self.assertRaises(ValueError) as ctx:
                list_messages(after="invalid-date")
            self.assertIn("Invalid date format for 'after'", str(ctx.exception))

            with self.assertRaises(ValueError) as ctx:
                list_messages(before="invalid-date")
            self.assertIn("Invalid date format for 'before'", str(ctx.exception))

    def test_list_messages_with_context(self):
        """Should fetch context for each message when include_context=True."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur

        row = (
            "2026-08-19T10:00:00",
            "123@s.whatsapp.net",
            "Test Chat",
            "Target Msg",
            1,
            "123@s.whatsapp.net",
            "target_id",
            None,
            None,
            None
        )
        mock_cur.fetchall.return_value = [row]

        dt = datetime(2026, 8, 19, 10, 0, 0)
        target_msg = Message(dt, "123@s.whatsapp.net", "Target Msg", True, "123@s.whatsapp.net", "target_id")
        before_msg = Message(dt, "123@s.whatsapp.net", "Before Msg", False, "123@s.whatsapp.net", "before_id")
        after_msg = Message(dt, "123@s.whatsapp.net", "After Msg", False, "123@s.whatsapp.net", "after_id")
        fake_context = MessageContext(message=target_msg, before=[before_msg], after=[after_msg])

        with patch("sqlite3.connect", return_value=mock_conn), \
             patch("whatsapp.get_message_context", return_value=fake_context) as mock_get_ctx:
            res = list_messages(include_context=True, context_before=2, context_after=2)
            mock_get_ctx.assert_called_once_with("target_id", 2, 2)
            self.assertIn("Before Msg", res)
            self.assertIn("Target Msg", res)
            self.assertIn("After Msg", res)

    def test_list_messages_sqlite_error(self):
        """Should return empty list on SQLite database error."""
        with patch("sqlite3.connect", side_effect=sqlite3.OperationalError("DB error")):
            res = list_messages()
            self.assertEqual(res, [])

    def test_get_message_context_success(self):
        """Should retrieve target message and surrounding before/after messages."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur

        target_row = (
            "2026-08-19T10:00:00", "sender@s.whatsapp.net", "ChatName",
            "TargetContent", 1, "chat@s.whatsapp.net", "msg_id_1",
            "chat@s.whatsapp.net", "text", "replied_1", "origin_web"
        )
        before_row = (
            "2026-08-19T09:59:00", "sender@s.whatsapp.net", "ChatName",
            "BeforeContent", 0, "chat@s.whatsapp.net", "before_1",
            "text", None, None
        )
        after_row = (
            "2026-08-19T10:01:00", "sender@s.whatsapp.net", "ChatName",
            "AfterContent", 0, "chat@s.whatsapp.net", "after_1",
            "text", None, None
        )

        mock_cur.fetchone.return_value = target_row
        mock_cur.fetchall.side_effect = [[before_row], [after_row]]

        with patch("sqlite3.connect", return_value=mock_conn):
            ctx = get_message_context("msg_id_1", before=3, after=3)
            self.assertEqual(ctx.message.id, "msg_id_1")
            self.assertEqual(ctx.message.content, "TargetContent")
            self.assertEqual(len(ctx.before), 1)
            self.assertEqual(ctx.before[0].content, "BeforeContent")
            self.assertEqual(len(ctx.after), 1)
            self.assertEqual(ctx.after[0].content, "AfterContent")

    def test_get_message_context_not_found_raises_value_error(self):
        """Should raise ValueError when message_id does not exist."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_cur.fetchone.return_value = None

        with patch("sqlite3.connect", return_value=mock_conn):
            with self.assertRaises(ValueError) as ctx:
                get_message_context("nonexistent_id")
            self.assertIn("Message with ID nonexistent_id not found", str(ctx.exception))

    def test_get_message_context_sqlite_error_reraises(self):
        """Should re-raise SQLite error if query fails."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_cur.execute.side_effect = sqlite3.OperationalError("DB error")

        with patch("sqlite3.connect", return_value=mock_conn):
            with self.assertRaises(sqlite3.Error):
                get_message_context("any_id")

    def test_list_chats_all_variations(self):
        """Test list_chats with sorting, filtering, and message inclusion options."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur

        chat_row_1 = ("c1@s.whatsapp.net", "Alice", "2026-08-19T10:00:00", "Hi", "c1", 0)
        chat_row_2 = ("c2@g.us", "Team", None, None, None, None)
        mock_cur.fetchall.return_value = [chat_row_1, chat_row_2]

        with patch("sqlite3.connect", return_value=mock_conn):
            # 1. Default (last_active sorting, include_last_message=True)
            chats = list_chats(query="Alice", limit=10, page=1, include_last_message=True, sort_by="last_active")
            self.assertEqual(len(chats), 2)
            self.assertEqual(chats[0].name, "Alice")
            self.assertEqual(chats[0].last_message, "Hi")
            self.assertIsNone(chats[1].last_message_time)
            query_str = mock_cur.execute.call_args[0][0]
            self.assertIn("ORDER BY chats.last_message_time DESC", query_str)
            self.assertIn("LEFT JOIN messages", query_str)

            # 2. Sort by name, include_last_message=False
            list_chats(query=None, limit=20, page=0, include_last_message=False, sort_by="name")
            query_str_2 = mock_cur.execute.call_args[0][0]
            self.assertIn("ORDER BY chats.name", query_str_2)
            self.assertNotIn("LEFT JOIN messages", query_str_2)

    def test_list_chats_sqlite_error(self):
        """Should return empty list on sqlite error."""
        with patch("sqlite3.connect", side_effect=sqlite3.OperationalError("DB error")):
            self.assertEqual(list_chats(), [])

    def test_search_contacts(self):
        """Test search_contacts parses rows into Contact dataclass and filters non-groups."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_cur.fetchall.return_value = [
            ("1234567890@s.whatsapp.net", "Alice Smith"),
            ("9876543210@s.whatsapp.net", "Bob Jones"),
        ]

        with patch("sqlite3.connect", return_value=mock_conn):
            contacts = search_contacts("alice")
            self.assertEqual(len(contacts), 2)
            self.assertEqual(contacts[0].phone_number, "1234567890")
            self.assertEqual(contacts[0].name, "Alice Smith")
            self.assertEqual(contacts[0].jid, "1234567890@s.whatsapp.net")

    def test_search_contacts_sqlite_error(self):
        """Should return empty list on SQLite error."""
        with patch("sqlite3.connect", side_effect=sqlite3.OperationalError("DB error")):
            self.assertEqual(search_contacts("alice"), [])

    def test_get_contact_chats(self):
        """Test get_contact_chats retrieves all chats involving a contact."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_cur.fetchall.return_value = [
            ("direct@s.whatsapp.net", "Alice", "2026-08-19T10:00:00", "Hey", "direct", 0),
            ("group@g.us", "Study Group", None, "Hello all", "direct", 0),
        ]

        with patch("sqlite3.connect", return_value=mock_conn):
            chats = get_contact_chats("direct@s.whatsapp.net", limit=10, page=0)
            self.assertEqual(len(chats), 2)
            self.assertEqual(chats[0].jid, "direct@s.whatsapp.net")
            self.assertEqual(chats[1].jid, "group@g.us")
            self.assertIsNone(chats[1].last_message_time)

    def test_get_contact_chats_sqlite_error(self):
        """Should return empty list on SQLite error."""
        with patch("sqlite3.connect", side_effect=sqlite3.OperationalError("DB error")):
            self.assertEqual(get_contact_chats("jid@s.whatsapp.net"), [])

    def test_get_last_interaction_found(self):
        """Test get_last_interaction returns formatted message string when found."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_cur.fetchone.return_value = (
            "2026-08-19T12:00:00",
            "123@s.whatsapp.net",
            "Alice",
            "Latest message content",
            0,
            "123@s.whatsapp.net",
            "msg_last",
            "text"
        )

        with patch("sqlite3.connect", return_value=mock_conn), \
             patch("whatsapp.get_sender_name", return_value="Alice"):
            result = get_last_interaction("123@s.whatsapp.net")
            self.assertIn("Latest message content", result)
            self.assertIn("From: Alice:", result)

    def test_get_last_interaction_not_found(self):
        """Test get_last_interaction returns None when no interaction exists."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_cur.fetchone.return_value = None

        with patch("sqlite3.connect", return_value=mock_conn):
            self.assertIsNone(get_last_interaction("unknown@s.whatsapp.net"))

    def test_get_last_interaction_sqlite_error(self):
        """Test get_last_interaction returns None on SQLite error."""
        with patch("sqlite3.connect", side_effect=sqlite3.OperationalError("DB error")):
            self.assertIsNone(get_last_interaction("123@s.whatsapp.net"))

    def test_get_chat_found(self):
        """Test get_chat with and without last message."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_cur.fetchone.return_value = (
            "chat@s.whatsapp.net", "Bob", "2026-08-19T10:00:00", "Hello", "sender", 1
        )

        with patch("sqlite3.connect", return_value=mock_conn):
            chat = get_chat("chat@s.whatsapp.net", include_last_message=True)
            self.assertIsNotNone(chat)
            self.assertEqual(chat.name, "Bob")
            self.assertEqual(chat.last_message, "Hello")

            get_chat("chat@s.whatsapp.net", include_last_message=False)
            query_str = mock_cur.execute.call_args[0][0]
            self.assertNotIn("LEFT JOIN messages", query_str)

    def test_get_chat_not_found_or_error(self):
        """Test get_chat returns None when chat not found or on SQLite error."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_cur.fetchone.return_value = None

        with patch("sqlite3.connect", return_value=mock_conn):
            self.assertIsNone(get_chat("missing@s.whatsapp.net"))

        with patch("sqlite3.connect", side_effect=sqlite3.OperationalError("DB error")):
            self.assertIsNone(get_chat("err@s.whatsapp.net"))

    def test_get_direct_chat_by_contact_with_lid(self):
        """Test get_direct_chat_by_contact resolves via LID pattern."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_cur.fetchone.return_value = (
            "123456789@lid", "Alice", "2026-08-19T10:00:00", "Hi", "sender", 0
        )

        with patch("whatsapp.get_lid_for_phone", return_value="123456789@lid"), \
             patch("sqlite3.connect", return_value=mock_conn):
            chat = get_direct_chat_by_contact("123456789")
            self.assertIsNotNone(chat)
            self.assertEqual(chat.jid, "123456789@lid")
            self.assertEqual(chat.name, "Alice")

    def test_get_direct_chat_by_contact_fallback_phone_pattern(self):
        """Test get_direct_chat_by_contact resolves via phone pattern when LID misses."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        # First query (LID) returns None, second query (phone pattern) returns chat
        mock_cur.fetchone.side_effect = [
            None,
            ("12345@s.whatsapp.net", "Bob", None, "Hey", "sender", 1)
        ]

        with patch("whatsapp.get_lid_for_phone", return_value="999@lid"), \
             patch("sqlite3.connect", return_value=mock_conn):
            chat = get_direct_chat_by_contact("12345")
            self.assertIsNotNone(chat)
            self.assertEqual(chat.jid, "12345@s.whatsapp.net")
            self.assertIsNone(chat.last_message_time)

    def test_get_direct_chat_by_contact_not_found_or_error(self):
        """Test get_direct_chat_by_contact returns None when not found or on SQLite error."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_cur.fetchone.return_value = None

        with patch("whatsapp.get_lid_for_phone", return_value=None), \
             patch("sqlite3.connect", return_value=mock_conn):
            self.assertIsNone(get_direct_chat_by_contact("0000"))

        with patch("whatsapp.get_lid_for_phone", return_value=None), \
             patch("sqlite3.connect", side_effect=sqlite3.OperationalError("DB error")):
            self.assertIsNone(get_direct_chat_by_contact("0000"))

    def test_get_poll_vote_found_and_not_found(self):
        """Test get_poll_vote reads selected option from poll_votes table."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_cur.fetchone.return_value = ('["Option 1"]', datetime(2026, 8, 19, 10, 0, 0))

        with patch("sqlite3.connect", return_value=mock_conn):
            vote = get_poll_vote("poll_123")
            self.assertEqual(vote, '["Option 1"]')

        # Not found
        mock_cur.fetchone.return_value = None
        with patch("sqlite3.connect", return_value=mock_conn):
            self.assertIsNone(get_poll_vote("poll_missing"))

        # SQLite error
        with patch("sqlite3.connect", side_effect=sqlite3.OperationalError("DB error")):
            self.assertIsNone(get_poll_vote("poll_err"))


class TestWhatsAppHTTPFunctions(unittest.TestCase):
    """Test HTTP API functions in whatsapp.py (send_message, send_poll, send_file, send_audio_message, download_media)."""

    def test_send_message_validation_and_success(self):
        """Test send_message input validation, 200 OK, and responses."""
        # Empty recipient
        ok, msg = send_message("", "Hello")
        self.assertFalse(ok)
        self.assertEqual(msg, "Recipient must be provided")

        # 200 OK Success
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"success": True, "message": "Sent successfully"}
        with patch("requests.post", return_value=mock_resp) as mock_post:
            ok, msg = send_message("12345@s.whatsapp.net", "Hello")
            self.assertTrue(ok)
            self.assertEqual(msg, "Sent successfully")
            mock_post.assert_called_once_with(
                f"{whatsapp.WHATSAPP_API_BASE_URL}/send",
                json={"recipient": "12345@s.whatsapp.net", "message": "Hello"}
            )

        # 200 OK with default missing keys
        mock_resp.json.return_value = {}
        with patch("requests.post", return_value=mock_resp):
            ok, msg = send_message("12345@s.whatsapp.net", "Hello")
            self.assertFalse(ok)
            self.assertEqual(msg, "Unknown response")

    def test_send_message_error_branches(self):
        """Test HTTP error status, RequestException, JSONDecodeError, and generic Exception in send_message."""
        # HTTP 500 error
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "Internal Server Error"
        with patch("requests.post", return_value=mock_resp):
            ok, msg = send_message("123@s.whatsapp.net", "Hi")
            self.assertFalse(ok)
            self.assertIn("Error: HTTP 500 - Internal Server Error", msg)

        # requests.RequestException
        with patch("requests.post", side_effect=requests.ConnectionError("Failed to connect")):
            ok, msg = send_message("123@s.whatsapp.net", "Hi")
            self.assertFalse(ok)
            self.assertIn("Request error: Failed to connect", msg)

        # json.JSONDecodeError
        mock_resp_bad_json = MagicMock()
        mock_resp_bad_json.status_code = 200
        mock_resp_bad_json.json.side_effect = json.JSONDecodeError("Invalid JSON", "doc", 0)
        mock_resp_bad_json.text = "Not JSON"
        with patch("requests.post", return_value=mock_resp_bad_json):
            ok, msg = send_message("123@s.whatsapp.net", "Hi")
            self.assertFalse(ok)
            self.assertIn("Error parsing response: Not JSON", msg)

        # Generic Exception
        with patch("requests.post", side_effect=RuntimeError("Something broke")):
            ok, msg = send_message("123@s.whatsapp.net", "Hi")
            self.assertFalse(ok)
            self.assertIn("Unexpected error: Something broke", msg)

    def test_send_poll_all_branches(self):
        """Test send_poll validation, success, and error paths."""
        # Missing recipient
        ok, msg, poll_id = send_poll("", "Poll question?", ["A", "B"])
        self.assertFalse(ok)
        self.assertEqual(msg, "Recipient must be provided")
        self.assertIsNone(poll_id)

        # 200 OK Success
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"success": True, "message": "Poll sent", "poll_id": "p123"}
        with patch("requests.post", return_value=mock_resp) as mock_post:
            ok, msg, poll_id = send_poll("123@s.whatsapp.net", "Question", ["Yes", "No"], 1)
            self.assertTrue(ok)
            self.assertEqual(msg, "Poll sent")
            self.assertEqual(poll_id, "p123")
            mock_post.assert_called_once_with(
                f"{whatsapp.WHATSAPP_API_BASE_URL}/send-poll",
                json={"recipient": "123@s.whatsapp.net", "question": "Question", "options": ["Yes", "No"], "selectable_count": 1}
            )

        # 200 OK with missing keys
        mock_resp.json.return_value = {}
        with patch("requests.post", return_value=mock_resp):
            ok, msg, poll_id = send_poll("123@s.whatsapp.net", "Q", ["A", "B"])
            self.assertFalse(ok)
            self.assertEqual(msg, "Unknown response")
            self.assertIsNone(poll_id)

        # HTTP 400
        mock_resp.status_code = 400
        mock_resp.text = "Bad Request"
        with patch("requests.post", return_value=mock_resp):
            ok, msg, poll_id = send_poll("123@s.whatsapp.net", "Q", ["A", "B"])
            self.assertFalse(ok)
            self.assertIn("Error: HTTP 400", msg)
            self.assertIsNone(poll_id)

        # requests.RequestException
        with patch("requests.post", side_effect=requests.Timeout("Timeout")):
            ok, msg, poll_id = send_poll("123@s.whatsapp.net", "Q", ["A", "B"])
            self.assertFalse(ok)
            self.assertIn("Request error: Timeout", msg)
            self.assertIsNone(poll_id)

        # Generic Exception
        with patch("requests.post", side_effect=ValueError("Invalid parameter")):
            ok, msg, poll_id = send_poll("123@s.whatsapp.net", "Q", ["A", "B"])
            self.assertFalse(ok)
            self.assertIn("Unexpected error: Invalid parameter", msg)
            self.assertIsNone(poll_id)

    def test_send_file_all_branches(self):
        """Test send_file validation, file existence, success, and error paths."""
        # Empty recipient
        ok, msg = send_file("", "/path/to/file.png")
        self.assertFalse(ok)
        self.assertEqual(msg, "Recipient must be provided")

        # Empty media_path
        ok, msg = send_file("123@s.whatsapp.net", "")
        self.assertFalse(ok)
        self.assertEqual(msg, "Media path must be provided")

        # File does not exist
        with patch("os.path.isfile", return_value=False):
            ok, msg = send_file("123@s.whatsapp.net", "/nonexistent/file.png")
            self.assertFalse(ok)
            self.assertIn("Media file not found", msg)

        # 200 OK Success
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"success": True, "message": "File sent"}
        with patch("os.path.isfile", return_value=True), patch("requests.post", return_value=mock_resp):
            ok, msg = send_file("123@s.whatsapp.net", "/path/to/file.png")
            self.assertTrue(ok)
            self.assertEqual(msg, "File sent")

        # 200 OK missing keys
        mock_resp.json.return_value = {}
        with patch("os.path.isfile", return_value=True), patch("requests.post", return_value=mock_resp):
            ok, msg = send_file("123@s.whatsapp.net", "/path/to/file.png")
            self.assertFalse(ok)
            self.assertEqual(msg, "Unknown response")

        # HTTP 500 error
        mock_resp.status_code = 500
        mock_resp.text = "Server Error"
        with patch("os.path.isfile", return_value=True), patch("requests.post", return_value=mock_resp):
            ok, msg = send_file("123@s.whatsapp.net", "/path/to/file.png")
            self.assertFalse(ok)
            self.assertIn("Error: HTTP 500", msg)

        # requests.RequestException
        with patch("os.path.isfile", return_value=True), patch("requests.post", side_effect=requests.RequestException("Net error")):
            ok, msg = send_file("123@s.whatsapp.net", "/path/to/file.png")
            self.assertFalse(ok)
            self.assertIn("Request error: Net error", msg)

        # JSONDecodeError
        mock_resp_bad = MagicMock(status_code=200, text="Bad json")
        mock_resp_bad.json.side_effect = json.JSONDecodeError("err", "doc", 0)
        with patch("os.path.isfile", return_value=True), patch("requests.post", return_value=mock_resp_bad):
            ok, msg = send_file("123@s.whatsapp.net", "/path/to/file.png")
            self.assertFalse(ok)
            self.assertIn("Error parsing response: Bad json", msg)

        # Generic Exception
        with patch("os.path.isfile", return_value=True), patch("requests.post", side_effect=Exception("Explosion")):
            ok, msg = send_file("123@s.whatsapp.net", "/path/to/file.png")
            self.assertFalse(ok)
            self.assertIn("Unexpected error: Explosion", msg)

    def test_send_audio_message_all_branches(self):
        """Test send_audio_message validation, .ogg vs non-.ogg conversion, success, and error paths."""
        # Empty recipient
        ok, msg = send_audio_message("", "/path/to/audio.mp3")
        self.assertFalse(ok)
        self.assertEqual(msg, "Recipient must be provided")

        # Empty media_path
        ok, msg = send_audio_message("123@s.whatsapp.net", "")
        self.assertFalse(ok)
        self.assertEqual(msg, "Media path must be provided")

        # File does not exist
        with patch("os.path.isfile", return_value=False):
            ok, msg = send_audio_message("123@s.whatsapp.net", "/missing/audio.mp3")
            self.assertFalse(ok)
            self.assertIn("Media file not found", msg)

        # Non-.ogg conversion failure
        with patch("os.path.isfile", return_value=True), \
             patch("audio.convert_to_opus_ogg_temp", side_effect=RuntimeError("FFmpeg missing")):
            ok, msg = send_audio_message("123@s.whatsapp.net", "/path/to/audio.wav")
            self.assertFalse(ok)
            self.assertIn("Error converting file to opus ogg", msg)

        # Non-.ogg conversion success and post 200 OK + temp cleanup
        mock_resp = MagicMock(status_code=200)
        mock_resp.json.return_value = {"success": True, "message": "Voice note sent"}

        with patch("os.path.isfile", return_value=True), \
             patch("audio.convert_to_opus_ogg_temp", return_value="/tmp/temp_audio.ogg"), \
             patch("requests.post", return_value=mock_resp), \
             patch("os.path.exists", return_value=True), \
             patch("os.unlink") as mock_unlink:
            ok, msg = send_audio_message("123@s.whatsapp.net", "/path/to/audio.m4a")
            self.assertTrue(ok)
            self.assertEqual(msg, "Voice note sent")
            mock_unlink.assert_called_once_with("/tmp/temp_audio.ogg")

        # Already .ogg file (no conversion needed)
        with patch("os.path.isfile", return_value=True), \
             patch("audio.convert_to_opus_ogg_temp") as mock_conv, \
             patch("requests.post", return_value=mock_resp):
            ok, msg = send_audio_message("123@s.whatsapp.net", "/path/to/audio.ogg")
            self.assertTrue(ok)
            mock_conv.assert_not_called()

        # 200 OK missing response keys
        mock_resp.json.return_value = {}
        with patch("os.path.isfile", return_value=True), patch("requests.post", return_value=mock_resp):
            ok, msg = send_audio_message("123@s.whatsapp.net", "/path/to/audio.ogg")
            self.assertFalse(ok)
            self.assertEqual(msg, "Unknown response")

        # HTTP 500 error
        mock_resp_500 = MagicMock(status_code=500, text="Internal Server Error")
        with patch("os.path.isfile", return_value=True), patch("requests.post", return_value=mock_resp_500):
            ok, msg = send_audio_message("123@s.whatsapp.net", "/path/to/audio.ogg")
            self.assertFalse(ok)
            self.assertIn("Error: HTTP 500", msg)

        # requests.RequestException
        with patch("os.path.isfile", return_value=True), patch("requests.post", side_effect=requests.RequestException("Conn error")):
            ok, msg = send_audio_message("123@s.whatsapp.net", "/path/to/audio.ogg")
            self.assertFalse(ok)
            self.assertIn("Request error: Conn error", msg)

        # JSONDecodeError
        mock_resp_bad = MagicMock(status_code=200, text="Not json")
        mock_resp_bad.json.side_effect = json.JSONDecodeError("err", "doc", 0)
        with patch("os.path.isfile", return_value=True), patch("requests.post", return_value=mock_resp_bad):
            ok, msg = send_audio_message("123@s.whatsapp.net", "/path/to/audio.ogg")
            self.assertFalse(ok)
            self.assertIn("Error parsing response: Not json", msg)

        # Generic Exception
        with patch("os.path.isfile", return_value=True), patch("requests.post", side_effect=Exception("Crash")):
            ok, msg = send_audio_message("123@s.whatsapp.net", "/path/to/audio.ogg")
            self.assertFalse(ok)
            self.assertIn("Unexpected error: Crash", msg)

        # Finally block: os.unlink raises OSError (caught silently)
        with patch("os.path.isfile", return_value=True), \
             patch("audio.convert_to_opus_ogg_temp", return_value="/tmp/test.ogg"), \
             patch("requests.post", return_value=mock_resp), \
             patch("os.path.exists", return_value=True), \
             patch("os.unlink", side_effect=OSError("Permission denied")):
            send_audio_message("123@s.whatsapp.net", "/path/to/audio.mp3")

    def test_download_media_all_branches(self):
        """Test download_media success, failure responses, HTTP errors, and exceptions."""
        # 200 OK with success True and path
        mock_resp = MagicMock(status_code=200)
        mock_resp.json.return_value = {"success": True, "path": "/downloads/media.jpg"}
        with patch("requests.post", return_value=mock_resp) as mock_post:
            path = download_media("msg123", "chat@s.whatsapp.net")
            self.assertEqual(path, "/downloads/media.jpg")
            mock_post.assert_called_once_with(
                f"{whatsapp.WHATSAPP_API_BASE_URL}/download",
                json={"message_id": "msg123", "chat_jid": "chat@s.whatsapp.net"}
            )

        # 200 OK with success False
        mock_resp.json.return_value = {"success": False, "message": "Media not found"}
        with patch("requests.post", return_value=mock_resp):
            self.assertIsNone(download_media("msg123", "chat@s.whatsapp.net"))

        # HTTP 404
        mock_resp_404 = MagicMock(status_code=404, text="Not Found")
        with patch("requests.post", return_value=mock_resp_404):
            self.assertIsNone(download_media("msg123", "chat@s.whatsapp.net"))

        # requests.RequestException
        with patch("requests.post", side_effect=requests.RequestException("Net fail")):
            self.assertIsNone(download_media("msg123", "chat@s.whatsapp.net"))

        # json.JSONDecodeError
        mock_resp_bad = MagicMock(status_code=200, text="Bad")
        mock_resp_bad.json.side_effect = json.JSONDecodeError("err", "doc", 0)
        with patch("requests.post", return_value=mock_resp_bad):
            self.assertIsNone(download_media("msg123", "chat@s.whatsapp.net"))

        # Generic Exception
        with patch("requests.post", side_effect=Exception("Unexpected")):
            self.assertIsNone(download_media("msg123", "chat@s.whatsapp.net"))


class TestWhatsAppClientWrapper(unittest.TestCase):
    """Test WhatsAppClient class abstraction covering initialization, headers, and client methods."""

    class WhatsAppClient:
        """Client wrapper around WhatsApp MCP backend methods."""
        def __init__(self, base_url=whatsapp.WHATSAPP_API_BASE_URL, auth_token=None):
            self.base_url = base_url
            self.auth_token = auth_token

        @property
        def headers(self):
            hdrs = {"Content-Type": "application/json"}
            if self.auth_token:
                hdrs["Authorization"] = f"Bearer {self.auth_token}"
            return hdrs

        def list_messages(self, **kwargs):
            return whatsapp.list_messages(**kwargs)

        def list_chats(self, **kwargs):
            return whatsapp.list_chats(**kwargs)

        def get_last_interaction(self, jid):
            return whatsapp.get_last_interaction(jid)

        def search_contacts(self, query):
            return whatsapp.search_contacts(query)

        def send_message(self, recipient, message):
            return whatsapp.send_message(recipient, message)

        def send_poll(self, recipient, question, options, selectable_count=1):
            return whatsapp.send_poll(recipient, question, options, selectable_count)

        def download_media(self, message_id, chat_jid):
            return whatsapp.download_media(message_id, chat_jid)

    def test_client_init_and_headers(self):
        """Test WhatsAppClient initialization and headers property."""
        client_no_auth = self.WhatsAppClient()
        self.assertEqual(client_no_auth.base_url, whatsapp.WHATSAPP_API_BASE_URL)
        self.assertEqual(client_no_auth.headers, {"Content-Type": "application/json"})

        client_auth = self.WhatsAppClient(base_url="http://localhost:9000/api", auth_token="secret-token")
        self.assertEqual(client_auth.base_url, "http://localhost:9000/api")
        self.assertEqual(client_auth.headers["Authorization"], "Bearer secret-token")

    def test_client_methods_delegate_properly(self):
        """Test that WhatsAppClient methods delegate to whatsapp module functions."""
        client = self.WhatsAppClient()

        with patch("whatsapp.list_messages", return_value="messages_list") as mock_list_msg:
            self.assertEqual(client.list_messages(limit=5), "messages_list")
            mock_list_msg.assert_called_once_with(limit=5)

        with patch("whatsapp.list_chats", return_value=["chat1"]) as mock_list_chats:
            self.assertEqual(client.list_chats(query="test"), ["chat1"])
            mock_list_chats.assert_called_once_with(query="test")

        with patch("whatsapp.get_last_interaction", return_value="interaction") as mock_last:
            self.assertEqual(client.get_last_interaction("jid1"), "interaction")
            mock_last.assert_called_once_with("jid1")

        with patch("whatsapp.search_contacts", return_value=["contact1"]) as mock_search:
            self.assertEqual(client.search_contacts("Bob"), ["contact1"])
            mock_search.assert_called_once_with("Bob")

        with patch("whatsapp.send_message", return_value=(True, "Sent")) as mock_send_msg:
            self.assertEqual(client.send_message("123", "Hi"), (True, "Sent"))
            mock_send_msg.assert_called_once_with("123", "Hi")

        with patch("whatsapp.send_poll", return_value=(True, "Poll", "p1")) as mock_send_poll:
            self.assertEqual(client.send_poll("123", "Q?", ["A", "B"]), (True, "Poll", "p1"))
            mock_send_poll.assert_called_once_with("123", "Q?", ["A", "B"], 1)

        with patch("whatsapp.download_media", return_value="/tmp/file.jpg") as mock_dl:
            self.assertEqual(client.download_media("m1", "c1"), "/tmp/file.jpg")
            mock_dl.assert_called_once_with("m1", "c1")


if __name__ == "__main__":
    unittest.main()

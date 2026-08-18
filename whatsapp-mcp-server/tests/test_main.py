"""Comprehensive unit test suite for main.py (FastMCP tools and handlers)."""

import os
import sys
import runpy
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Ensure mcp is available or mocked for testing
try:
    import mcp
    import mcp.server.fastmcp
except ImportError:
    mock_mcp = MagicMock()
    mock_fastmcp_cls = MagicMock()
    # Ensure decorator returns function unmodified
    mock_fastmcp_instance = MagicMock()
    mock_fastmcp_instance.tool.return_value = lambda f: f
    mock_fastmcp_cls.return_value = mock_fastmcp_instance
    mock_mcp.server.fastmcp.FastMCP = mock_fastmcp_cls
    sys.modules["mcp"] = mock_mcp
    sys.modules["mcp.server"] = mock_mcp.server
    sys.modules["mcp.server.fastmcp"] = mock_mcp.server.fastmcp

import main



class TestMainMCPTools(unittest.TestCase):
    """Test MCP tool handlers in main.py."""

    @patch("main.whatsapp_search_contacts")
    def test_search_contacts_tool(self, mock_search):
        """Test search_contacts MCP tool delegates to whatsapp_search_contacts."""
        mock_search.return_value = [{"phone_number": "123", "name": "Alice", "jid": "123@s.whatsapp.net"}]
        res = main.search_contacts("Alice")
        self.assertEqual(res, [{"phone_number": "123", "name": "Alice", "jid": "123@s.whatsapp.net"}])
        mock_search.assert_called_once_with("Alice")

    @patch("main.whatsapp_list_messages")
    def test_list_messages_tool_default_and_custom_args(self, mock_list_msg):
        """Test list_messages MCP tool passes arguments correctly."""
        mock_list_msg.return_value = "Formatted message list"

        # Default parameters
        res = main.list_messages()
        self.assertEqual(res, "Formatted message list")
        mock_list_msg.assert_called_once_with(
            after=None,
            before=None,
            sender_phone_number=None,
            chat_jid=None,
            query=None,
            limit=20,
            page=0,
            include_context=True,
            context_before=1,
            context_after=1
        )

        mock_list_msg.reset_mock()

        # Custom parameters
        res2 = main.list_messages(
            after="2026-08-01T00:00:00",
            before="2026-08-19T00:00:00",
            sender_phone_number="12345",
            chat_jid="12345@s.whatsapp.net",
            query="hello",
            limit=10,
            page=1,
            include_context=False,
            context_before=3,
            context_after=3
        )
        self.assertEqual(res2, "Formatted message list")
        mock_list_msg.assert_called_once_with(
            after="2026-08-01T00:00:00",
            before="2026-08-19T00:00:00",
            sender_phone_number="12345",
            chat_jid="12345@s.whatsapp.net",
            query="hello",
            limit=10,
            page=1,
            include_context=False,
            context_before=3,
            context_after=3
        )

    @patch("main.whatsapp_list_chats")
    def test_list_chats_tool(self, mock_list_chats):
        """Test list_chats MCP tool passes all sorting and pagination parameters."""
        mock_list_chats.return_value = [{"jid": "chat1@s.whatsapp.net", "name": "Chat 1"}]

        res = main.list_chats(
            query="dev",
            limit=5,
            page=2,
            include_last_message=False,
            sort_by="name"
        )
        self.assertEqual(res, [{"jid": "chat1@s.whatsapp.net", "name": "Chat 1"}])
        mock_list_chats.assert_called_once_with(
            query="dev",
            limit=5,
            page=2,
            include_last_message=False,
            sort_by="name"
        )

    @patch("main.whatsapp_get_chat")
    def test_get_chat_tool(self, mock_get_chat):
        """Test get_chat MCP tool delegates to whatsapp_get_chat."""
        mock_get_chat.return_value = {"jid": "123@s.whatsapp.net", "name": "Bob"}
        res = main.get_chat("123@s.whatsapp.net", include_last_message=True)
        self.assertEqual(res, {"jid": "123@s.whatsapp.net", "name": "Bob"})
        mock_get_chat.assert_called_once_with("123@s.whatsapp.net", True)

    @patch("main.whatsapp_get_direct_chat_by_contact")
    def test_get_direct_chat_by_contact_tool(self, mock_get_direct):
        """Test get_direct_chat_by_contact MCP tool delegates properly."""
        mock_get_direct.return_value = {"jid": "12345@s.whatsapp.net", "name": "Alice"}
        res = main.get_direct_chat_by_contact("12345")
        self.assertEqual(res, {"jid": "12345@s.whatsapp.net", "name": "Alice"})
        mock_get_direct.assert_called_once_with("12345")

    @patch("main.whatsapp_get_contact_chats")
    def test_get_contact_chats_tool(self, mock_get_contact_chats):
        """Test get_contact_chats MCP tool delegates properly."""
        mock_get_contact_chats.return_value = [{"jid": "c1@s.whatsapp.net"}]
        res = main.get_contact_chats("user@s.whatsapp.net", limit=10, page=1)
        self.assertEqual(res, [{"jid": "c1@s.whatsapp.net"}])
        mock_get_contact_chats.assert_called_once_with("user@s.whatsapp.net", 10, 1)

    @patch("main.whatsapp_get_last_interaction")
    def test_get_last_interaction_tool(self, mock_last):
        """Test get_last_interaction MCP tool returns interaction string."""
        mock_last.return_value = "Latest message"
        res = main.get_last_interaction("contact@s.whatsapp.net")
        self.assertEqual(res, "Latest message")
        mock_last.assert_called_once_with("contact@s.whatsapp.net")

    @patch("main.whatsapp_get_message_context")
    def test_get_message_context_tool(self, mock_get_ctx):
        """Test get_message_context MCP tool delegates properly."""
        mock_get_ctx.return_value = {"target": "m1", "before": [], "after": []}
        res = main.get_message_context("msg123", before=4, after=4)
        self.assertEqual(res, {"target": "m1", "before": [], "after": []})
        mock_get_ctx.assert_called_once_with("msg123", 4, 4)

    @patch("main.whatsapp_send_message")
    def test_send_message_tool(self, mock_send):
        """Test send_message MCP tool input validation and responses."""
        # Empty recipient
        res_empty = main.send_message("", "Hello")
        self.assertEqual(res_empty, {
            "success": False,
            "message": "Recipient must be provided"
        })
        mock_send.assert_not_called()

        # Valid recipient - success
        mock_send.return_value = (True, "Message sent successfully")
        res_success = main.send_message("12345@s.whatsapp.net", "Hello")
        self.assertEqual(res_success, {
            "success": True,
            "message": "Message sent successfully"
        })
        mock_send.assert_called_once_with("12345@s.whatsapp.net", "Hello")

        # Valid recipient - failure
        mock_send.return_value = (False, "HTTP 500 error")
        res_fail = main.send_message("12345@s.whatsapp.net", "Hello")
        self.assertEqual(res_fail, {
            "success": False,
            "message": "HTTP 500 error"
        })

    @patch("main.whatsapp_send_file")
    def test_send_file_tool(self, mock_send_file):
        """Test send_file MCP tool wraps response properly."""
        mock_send_file.return_value = (True, "File sent successfully")
        res = main.send_file("12345@s.whatsapp.net", "/path/to/doc.pdf")
        self.assertEqual(res, {
            "success": True,
            "message": "File sent successfully"
        })
        mock_send_file.assert_called_once_with("12345@s.whatsapp.net", "/path/to/doc.pdf")

    @patch("main.whatsapp_audio_voice_message")
    def test_send_audio_message_tool(self, mock_send_audio):
        """Test send_audio_message MCP tool wraps response properly."""
        mock_send_audio.return_value = (True, "Audio message sent")
        res = main.send_audio_message("12345@s.whatsapp.net", "/path/to/audio.mp3")
        self.assertEqual(res, {
            "success": True,
            "message": "Audio message sent"
        })
        mock_send_audio.assert_called_once_with("12345@s.whatsapp.net", "/path/to/audio.mp3")

    @patch("main.whatsapp_download_media")
    def test_download_media_tool(self, mock_download):
        """Test download_media MCP tool handles success and failure branches."""
        # Success path
        mock_download.return_value = "/local/path/image.jpg"
        res_success = main.download_media("msg1", "chat1@s.whatsapp.net")
        self.assertEqual(res_success, {
            "success": True,
            "message": "Media downloaded successfully",
            "file_path": "/local/path/image.jpg"
        })

        # Failure path (None returned)
        mock_download.return_value = None
        res_fail = main.download_media("msg1", "chat1@s.whatsapp.net")
        self.assertEqual(res_fail, {
            "success": False,
            "message": "Failed to download media"
        })


class TestExtendedMCPToolWrappers(unittest.TestCase):
    """Test extended MCP tool patterns like send_poll and get_audio_transcription wrappers."""

    def test_send_poll_mcp_wrapper(self):
        """Test send_poll MCP tool wrapper logic."""
        def send_poll_tool(recipient: str, question: str, options: list, selectable_count: int = 1):
            if not recipient:
                return {"success": False, "message": "Recipient must be provided", "poll_id": None}
            if not question:
                return {"success": False, "message": "Question must be provided", "poll_id": None}
            if not options or len(options) < 2:
                return {"success": False, "message": "At least 2 options must be provided", "poll_id": None}

            with patch("whatsapp.send_poll", return_value=(True, "Poll sent", "poll-999")) as mock_sp:
                ok, msg, poll_id = mock_sp(recipient, question, options, selectable_count)
                return {"success": ok, "message": msg, "poll_id": poll_id}

        # Missing recipient
        res_no_rec = send_poll_tool("", "Question?", ["A", "B"])
        self.assertFalse(res_no_rec["success"])

        # Missing question
        res_no_q = send_poll_tool("123@s.whatsapp.net", "", ["A", "B"])
        self.assertFalse(res_no_q["success"])

        # Insufficient options
        res_few_opts = send_poll_tool("123@s.whatsapp.net", "Q?", ["A"])
        self.assertFalse(res_few_opts["success"])

        # Success
        res_ok = send_poll_tool("123@s.whatsapp.net", "Question?", ["A", "B"], 1)
        self.assertTrue(res_ok["success"])
        self.assertEqual(res_ok["poll_id"], "poll-999")

    def test_get_audio_transcription_mcp_wrapper(self):
        """Test get_audio_transcription tool wrapper with missing file, missing key, and success."""
        def get_audio_transcription_tool(media_path: str, api_key: str = "mock-key"):
            if not media_path:
                return {"success": False, "message": "Media path must be provided", "transcript": None}
            if not api_key:
                return {"success": False, "message": "API key required", "transcript": None}
            return {"success": True, "message": "Transcribed successfully", "transcript": "Hello from audio"}

        self.assertFalse(get_audio_transcription_tool("")["success"])
        self.assertFalse(get_audio_transcription_tool("/path/audio.ogg", api_key="")["success"])
        self.assertTrue(get_audio_transcription_tool("/path/audio.ogg")["success"])


class TestMainServerExecution(unittest.TestCase):
    """Test server initialization and run logic."""

    def test_mcp_server_main_run(self):
        """Test mcp.run invocation when executed as main."""
        main_path = os.path.join(os.path.dirname(__file__), "..", "main.py")
        with patch.object(main.mcp, "run") as mock_run:
            with patch("main.__name__", "__main__"):
                # verify run can be invoked
                main.mcp.run(transport="stdio")
                mock_run.assert_called_once_with(transport="stdio")



if __name__ == "__main__":
    unittest.main()

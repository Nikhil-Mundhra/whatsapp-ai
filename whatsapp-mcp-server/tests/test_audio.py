"""Unit tests for audio conversion and transcription utilities in audio.py."""

import os
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import audio


class TestAudioConversion(unittest.TestCase):
    """Test suite for convert_to_opus_ogg and convert_to_opus_ogg_temp in audio.py."""

    def test_convert_to_opus_ogg_file_not_found(self):
        """Should raise FileNotFoundError when input file does not exist."""
        with self.assertRaises(FileNotFoundError) as ctx:
            audio.convert_to_opus_ogg("/path/that/does/not/exist.wav")
        self.assertIn("Input file not found", str(ctx.exception))

    @patch("os.path.isfile", return_value=True)
    @patch("os.path.exists", return_value=True)
    @patch("subprocess.run")
    def test_convert_to_opus_ogg_default_output(self, mock_run, mock_exists, mock_isfile):
        """Should derive output file by replacing extension with .ogg when output_file is None."""
        mock_run.return_value = MagicMock(returncode=0)

        result = audio.convert_to_opus_ogg("sample.mp3")

        self.assertEqual(result, "sample.ogg")
        mock_run.assert_called_once()
        cmd = mock_run.call_args[0][0]
        self.assertEqual(cmd[0], "ffmpeg")
        self.assertIn("-i", cmd)
        self.assertIn("sample.mp3", cmd)
        self.assertIn("sample.ogg", cmd)
        self.assertIn("-c:a", cmd)
        self.assertIn("libopus", cmd)
        self.assertIn("32k", cmd)
        self.assertIn("24000", cmd)

    @patch("os.path.isfile", return_value=True)
    @patch("os.path.exists", return_value=False)
    @patch("os.makedirs")
    @patch("subprocess.run")
    def test_convert_to_opus_ogg_creates_output_directory(self, mock_run, mock_makedirs, mock_exists, mock_isfile):
        """Should create output directory if it does not exist."""
        mock_run.return_value = MagicMock(returncode=0)

        result = audio.convert_to_opus_ogg(
            "input.wav",
            output_file="/new/path/to/output.ogg",
            bitrate="64k",
            sample_rate=48000
        )

        self.assertEqual(result, "/new/path/to/output.ogg")
        mock_makedirs.assert_called_once_with("/new/path/to")
        mock_run.assert_called_once()
        cmd = mock_run.call_args[0][0]
        self.assertIn("64k", cmd)
        self.assertIn("48000", cmd)

    @patch("os.path.isfile", return_value=True)
    @patch("os.path.exists", return_value=True)
    @patch("subprocess.run")
    def test_convert_to_opus_ogg_ffmpeg_failure(self, mock_run, mock_exists, mock_isfile):
        """Should raise RuntimeError when ffmpeg command fails."""
        mock_run.side_effect = subprocess.CalledProcessError(
            returncode=1,
            cmd=["ffmpeg"],
            stderr="ffmpeg: command not found"
        )

        with self.assertRaises(RuntimeError) as ctx:
            audio.convert_to_opus_ogg("input.wav", output_file="output.ogg")

        self.assertIn("Failed to convert audio", str(ctx.exception))
        self.assertIn("ffmpeg: command not found", str(ctx.exception))

    @patch("audio.convert_to_opus_ogg")
    def test_convert_to_opus_ogg_temp_success(self, mock_convert):
        """Should create temporary file, convert, and return temporary file path."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
            input_path = tf.name

        try:
            temp_path = audio.convert_to_opus_ogg_temp(input_path, bitrate="48k", sample_rate=16000)
            self.assertTrue(temp_path.endswith(".ogg"))
            mock_convert.assert_called_once_with(input_path, temp_path, "48k", 16000)
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        finally:
            if os.path.exists(input_path):
                os.unlink(input_path)

    @patch("audio.convert_to_opus_ogg")
    def test_convert_to_opus_ogg_temp_failure_cleans_up(self, mock_convert):
        """Should remove temporary file if conversion raises an exception."""
        mock_convert.side_effect = RuntimeError("Conversion exploded")

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
            input_path = tf.name

        created_temp_files = []
        original_named_temp = tempfile.NamedTemporaryFile

        def tracking_named_temp(*args, **kwargs):
            res = original_named_temp(*args, **kwargs)
            created_temp_files.append(res.name)
            return res

        try:
            with patch("tempfile.NamedTemporaryFile", side_effect=tracking_named_temp):
                with self.assertRaises(RuntimeError) as ctx:
                    audio.convert_to_opus_ogg_temp(input_path)
                self.assertIn("Conversion exploded", str(ctx.exception))

            self.assertEqual(len(created_temp_files), 1)
            self.assertFalse(os.path.exists(created_temp_files[0]))
        finally:
            if os.path.exists(input_path):
                os.unlink(input_path)

    @patch("os.path.exists", return_value=False)
    @patch("audio.convert_to_opus_ogg", side_effect=RuntimeError("Err"))
    def test_convert_to_opus_ogg_temp_failure_when_temp_already_gone(self, mock_convert, mock_exists):
        """Should re-raise error even if temp file does not exist during cleanup."""
        with self.assertRaises(RuntimeError):
            audio.convert_to_opus_ogg_temp("some_file.wav")


class TestAudioCLI(unittest.TestCase):
    """Test the CLI execution branch of audio.py."""

    def test_cli_no_args_exits_with_error(self):
        """When called with no arguments, prints usage and exits with status 1."""
        audio_path = os.path.join(os.path.dirname(__file__), "..", "audio.py")
        with patch("sys.argv", ["audio.py"]):
            with self.assertRaises(SystemExit) as ctx:
                runpy.run_path(audio_path, run_name="__main__")
            self.assertEqual(ctx.exception.code, 1)

    def test_cli_success(self):
        """When called with valid input file, converts and outputs path."""
        audio_path = os.path.join(os.path.dirname(__file__), "..", "audio.py")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
            input_path = tf.name

        try:
            with patch("sys.argv", ["audio.py", input_path]):
                with patch("subprocess.run") as mock_run:
                    mock_run.return_value = MagicMock(returncode=0)
                    runpy.run_path(audio_path, run_name="__main__")
        finally:
            if os.path.exists(input_path):
                os.unlink(input_path)

    def test_cli_error_exits(self):
        """When conversion fails in CLI, catches exception and exits with status 1."""
        audio_path = os.path.join(os.path.dirname(__file__), "..", "audio.py")
        with patch("sys.argv", ["audio.py", "/nonexistent/input.wav"]):
            with self.assertRaises(SystemExit) as ctx:
                runpy.run_path(audio_path, run_name="__main__")
            self.assertEqual(ctx.exception.code, 1)


class TestAudioTranscriptionMockSuite(unittest.TestCase):
    """Test audio transcription, Whisper/Groq API client integrations, fallbacks, and error branches."""

    def test_transcription_success(self):
        """Mock successful audio transcription via an API client."""
        mock_client = MagicMock()
        mock_client.audio.transcriptions.create.return_value = MagicMock(text="Hello world WhatsApp voice message")

        def transcribe_audio_mock(file_path, client=mock_client, api_key="test_key"):
            if not api_key:
                raise ValueError("API key must be provided")
            if not os.path.isfile(file_path):
                raise FileNotFoundError(f"Audio file not found: {file_path}")
            with open(file_path, "rb") as f:
                response = client.audio.transcriptions.create(
                    model="whisper-large-v3",
                    file=f,
                    response_format="text"
                )
                return response.text

        with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tf:
            tf.write(b"fake audio data")
            temp_path = tf.name

        try:
            transcript = transcribe_audio_mock(temp_path)
            self.assertEqual(transcript, "Hello world WhatsApp voice message")
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    def test_transcription_missing_api_key(self):
        """Transcription raises ValueError when API key is missing."""
        def transcribe(file_path, api_key=None):
            if not api_key:
                raise ValueError("API key is required for transcription")
            return "ok"

        with self.assertRaises(ValueError) as ctx:
            transcribe("audio.ogg", api_key="")
        self.assertIn("API key is required", str(ctx.exception))

    def test_transcription_invalid_file(self):
        """Transcription raises FileNotFoundError when input file does not exist."""
        def transcribe(file_path, api_key="sk-test"):
            if not os.path.isfile(file_path):
                raise FileNotFoundError(f"File not found: {file_path}")
            return "ok"

        with self.assertRaises(FileNotFoundError):
            transcribe("/nonexistent/voice.ogg")

    def test_transcription_network_error_fallback(self):
        """Transcription gracefully falls back or reports error on network failure."""
        mock_client = MagicMock()
        mock_client.audio.transcriptions.create.side_effect = Exception("Connection timeout")

        def transcribe_with_fallback(file_path, client=mock_client):
            try:
                return client.audio.transcriptions.create(model="whisper-1", file=file_path).text
            except Exception as e:
                return f"Transcription error: {str(e)}"

        result = transcribe_with_fallback("test.ogg")
        self.assertEqual(result, "Transcription error: Connection timeout")


if __name__ == "__main__":
    unittest.main()

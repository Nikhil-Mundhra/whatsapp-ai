from __future__ import annotations
import sqlite3
from datetime import datetime
from dataclasses import dataclass
from typing import Optional, List, Tuple
import os.path
import requests
import json
import audio

MESSAGES_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'whatsapp-bridge', 'store', 'messages.db')
WHATSAPP_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'whatsapp-bridge', 'store', 'whatsapp.db')
WHATSAPP_API_BASE_URL = "http://localhost:8080/api"

JID_GROUP_SUFFIX = "@g.us"
JID_LID_SUFFIX = "@lid"
JID_WHATSAPP_NET = "@s.whatsapp.net"

def _post_bridge_api(endpoint: str, payload: dict) -> Tuple[bool, str, Optional[dict]]:
    """Helper to dispatch HTTP POST requests to the WhatsApp bridge API."""
    url = f"{WHATSAPP_API_BASE_URL}/{endpoint.lstrip('/')}"
    try:
        response = requests.post(url, json=payload)
        if response.status_code == 200:
            result = response.json()
            return True, "", result
        return False, f"Error: HTTP {response.status_code} - {response.text}", None
    except requests.RequestException as e:
        return False, f"Request error: {str(e)}", None
    except json.JSONDecodeError:
        return False, f"Error parsing response: {response.text}", None
    except Exception as e:
        return False, f"Unexpected error: {str(e)}", None

def _row_to_message(row: tuple) -> Message:
    """Convert standard message database row to Message dataclass."""
    if len(row) >= 11:
        return Message(
            timestamp=datetime.fromisoformat(row[0]),
            sender=row[1],
            chat_name=row[2],
            content=row[3],
            is_from_me=row[4],
            chat_jid=row[5],
            id=row[6],
            media_type=row[8],
            replied_to=row[9],
            origin=row[10],
        )
    if len(row) >= 10:
        return Message(
            timestamp=datetime.fromisoformat(row[0]),
            sender=row[1],
            chat_name=row[2],
            content=row[3],
            is_from_me=row[4],
            chat_jid=row[5],
            id=row[6],
            media_type=row[7],
            replied_to=row[8],
            origin=row[9],
        )
    return Message(
        timestamp=datetime.fromisoformat(row[0]),
        sender=row[1],
        chat_name=row[2],
        content=row[3],
        is_from_me=row[4],
        chat_jid=row[5],
        id=row[6],
        media_type=row[7] if len(row) > 7 else None,
    )

def _row_to_chat(row: tuple) -> Chat:
    """Convert standard chat database row to Chat dataclass."""
    return Chat(
        jid=row[0],
        name=row[1],
        last_message_time=datetime.fromisoformat(row[2]) if row[2] else None,
        last_message=row[3],
        last_sender=row[4],
        last_is_from_me=row[5],
    )

def get_lid_for_phone(phone_number: str) -> Optional[str]:
    """Resolve a phone number to a WhatsApp LID (Linked ID) JID if mapped."""
    digits = ''.join(c for c in phone_number if c.isdigit())
    try:
        conn = sqlite3.connect(WHATSAPP_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT lid FROM whatsmeow_lid_map WHERE pn = ?", (digits,))
        result = cursor.fetchone()
        return f"{result[0]}{JID_LID_SUFFIX}" if result else None
    except sqlite3.Error:
        return None
    finally:
        if 'conn' in locals():
            conn.close()

@dataclass
class Message:
    timestamp: datetime
    sender: str
    content: str
    is_from_me: bool
    chat_jid: str
    id: str
    chat_name: Optional[str] = None
    media_type: Optional[str] = None
    replied_to: Optional[str] = None
    origin: Optional[str] = None

@dataclass
class Chat:
    jid: str
    name: Optional[str]
    last_message_time: Optional[datetime]
    last_message: Optional[str] = None
    last_sender: Optional[str] = None
    last_is_from_me: Optional[bool] = None

    @property
    def is_group(self) -> bool:
        """Determine if chat is a group based on JID pattern."""
        return self.jid.endswith(JID_GROUP_SUFFIX)

@dataclass
class Contact:
    phone_number: str
    name: Optional[str]
    jid: str

@dataclass
class MessageContext:
    message: Message
    before: List[Message]
    after: List[Message]

def get_sender_name(sender_jid: str, chat_jid: Optional[str] = None) -> str:
    try:
        conn = sqlite3.connect(MESSAGES_DB_PATH)
        cursor = conn.cursor()
        
        # Resolve LID (phone number or @lid JID) to the contact's real name first,
        # so we don't return bare numeric LID labels.
        digits = ''.join(c for c in sender_jid.split('@')[0] if c.isdigit())
        contact_name = None
        if digits:
            pc = None
            try:
                pc = sqlite3.connect(WHATSAPP_DB_PATH)
                pcur = pc.cursor()
                pcur.execute("SELECT pn FROM whatsmeow_lid_map WHERE lid = ?", (digits,))
                lid_row = pcur.fetchone()
                search = lid_row[0] if lid_row else digits
                if len(search) >= 7:
                    pcur.execute(
                        "SELECT full_name, first_name, push_name FROM whatsmeow_contacts WHERE their_jid = ? OR their_jid LIKE ? LIMIT 1",
                        (f"{search}@s.whatsapp.net", f"%{search}%"),
                    )
                else:
                    pcur.execute(
                        "SELECT full_name, first_name, push_name FROM whatsmeow_contacts WHERE their_jid = ? OR their_jid = ? LIMIT 1",
                        (f"{search}@s.whatsapp.net", f"{search}@lid"),
                    )
                name_row = pcur.fetchone()
                if name_row:
                    for name in name_row:
                        if name and not name.isdigit():
                            contact_name = name
                            break
            except sqlite3.Error:
                pass
            finally:
                if pc:
                    pc.close()
        
        if contact_name:
            return contact_name

        # Try matching by exact JID
        cursor.execute("""
            SELECT name
            FROM chats
            WHERE jid = ?
            LIMIT 1
        """, (sender_jid,))
        
        result = cursor.fetchone()
        if result and result[0] and not result[0].isdigit():
            return result[0]
        
        # If no result, try looking for the number within JIDs
        phone_part = sender_jid.split('@')[0] if '@' in sender_jid else sender_jid
        cursor.execute("""
            SELECT name
            FROM chats
            WHERE jid LIKE ? AND name IS NOT NULL AND name != ''
            LIMIT 1
        """, (f"%{phone_part}%",))
        
        result = cursor.fetchone()
        if result and result[0] and not result[0].isdigit():
            return result[0]

        # Check chat_jid fallback if available
        if chat_jid and chat_jid != sender_jid:
            chat_digits = ''.join(c for c in chat_jid.split('@')[0] if c.isdigit())
            if chat_digits:
                cursor.execute("""
                    SELECT name
                    FROM chats
                    WHERE jid LIKE ? AND name IS NOT NULL AND name != ''
                    LIMIT 1
                """, (f"%{chat_digits}%",))
                c_res = cursor.fetchone()
                if c_res and c_res[0] and not c_res[0].isdigit():
                    return c_res[0]
        
        if sender_jid.isdigit() and len(sender_jid) > 6:
            return "Contact"

        return sender_jid
        
    except sqlite3.Error as e:
        print(f"Database error while getting sender name: {e}")
        return sender_jid
    finally:
        if 'conn' in locals():
            conn.close()

def format_message(message: Message, show_chat_info: bool = True) -> None:
    """Print a single message with consistent formatting."""
    output = ""
    
    if show_chat_info and message.chat_name:
        chat_label = message.chat_name
        if chat_label.isdigit():
            resolved = get_sender_name(message.chat_jid)
            if not resolved.endswith(JID_LID_SUFFIX) and resolved != "Contact":
                chat_label = resolved
        output += f"[{message.timestamp:%Y-%m-%d %H:%M:%S}] Chat: {chat_label} "
    else:
        output += f"[{message.timestamp:%Y-%m-%d %H:%M:%S}] "
        
    content_prefix = ""
    if hasattr(message, 'media_type') and message.media_type:
        content_prefix = f"[{message.media_type} - Message ID: {message.id} - Chat JID: {message.chat_jid}] "
    
    try:
        sender_name = get_sender_name(message.sender, message.chat_jid) if not message.is_from_me else "Me"
        reply_prefix = ""
        if message.replied_to:
            reply_prefix = f"[replied to: {message.replied_to}] "
        output += f"From: {sender_name}: {reply_prefix}{content_prefix}{message.content}\n"
    except Exception as e:
        print(f"Error formatting message: {e}")
    return output

def format_messages_list(messages: List[Message], show_chat_info: bool = True) -> None:
    output = ""
    if not messages:
        output += "No messages to display."
        return output
    
    for message in messages:
        output += format_message(message, show_chat_info)
    return output

def list_messages(
    after: Optional[str] = None,
    before: Optional[str] = None,
    sender_phone_number: Optional[str] = None,
    chat_jid: Optional[str] = None,
    query: Optional[str] = None,
    limit: int = 20,
    page: int = 0,
    include_context: bool = True,
    context_before: int = 1,
    context_after: int = 1
) -> List[Message]:
    """Get messages matching the specified criteria with optional context."""
    try:
        conn = sqlite3.connect(MESSAGES_DB_PATH)
        cursor = conn.cursor()
        
        # Build base query
        query_parts = ["SELECT messages.timestamp, messages.sender, chats.name, messages.content, messages.is_from_me, chats.jid, messages.id, messages.media_type, messages.replied_to, messages.origin FROM messages"]
        query_parts.append("JOIN chats ON messages.chat_jid = chats.jid")
        where_clauses = []
        params = []
        
        # Add filters
        if after:
            try:
                after = datetime.fromisoformat(after)
            except ValueError:
                raise ValueError(f"Invalid date format for 'after': {after}. Please use ISO-8601 format.")
            
            where_clauses.append("messages.timestamp > ?")
            params.append(after)

        if before:
            try:
                before = datetime.fromisoformat(before)
            except ValueError:
                raise ValueError(f"Invalid date format for 'before': {before}. Please use ISO-8601 format.")
            
            where_clauses.append("messages.timestamp < ?")
            params.append(before)

        if sender_phone_number:
            where_clauses.append("messages.sender = ?")
            params.append(sender_phone_number)
            
        if chat_jid:
            where_clauses.append("messages.chat_jid = ?")
            params.append(chat_jid)
            
        if query:
            where_clauses.append("LOWER(messages.content) LIKE LOWER(?)")
            params.append(f"%{query}%")
            
        if where_clauses:
            query_parts.append("WHERE " + " AND ".join(where_clauses))
            
        # Add pagination
        offset = page * limit
        query_parts.append("ORDER BY messages.timestamp DESC")
        query_parts.append("LIMIT ? OFFSET ?")
        params.extend([limit, offset])
        
        cursor.execute(" ".join(query_parts), tuple(params))
        messages = cursor.fetchall()
        result = [_row_to_message(msg) for msg in messages]
            
        if include_context and result:
            # Add context for each message
            messages_with_context = []
            for msg in result:
                context = get_message_context(msg.id, context_before, context_after)
                messages_with_context.extend(context.before)
                messages_with_context.append(context.message)
                messages_with_context.extend(context.after)
            
            return format_messages_list(messages_with_context, show_chat_info=True)
            
        # Format and display messages without context
        return format_messages_list(result, show_chat_info=True)    
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
        return []
    finally:
        if 'conn' in locals():
            conn.close()


def get_message_context(
    message_id: str,
    before: int = 5,
    after: int = 5
) -> MessageContext:
    """Get context around a specific message."""
    try:
        conn = sqlite3.connect(MESSAGES_DB_PATH)
        cursor = conn.cursor()
        
        # Get the target message first
        cursor.execute("""
            SELECT messages.timestamp, messages.sender, chats.name, messages.content, messages.is_from_me, chats.jid, messages.id, messages.chat_jid, messages.media_type, messages.replied_to, messages.origin
            FROM messages
            JOIN chats ON messages.chat_jid = chats.jid
            WHERE messages.id = ?
        """, (message_id,))
        msg_data = cursor.fetchone()
        
        if not msg_data:
            raise ValueError(f"Message with ID {message_id} not found")
            
        target_message = _row_to_message(msg_data)
        
        # Get messages before
        cursor.execute("""
            SELECT messages.timestamp, messages.sender, chats.name, messages.content, messages.is_from_me, chats.jid, messages.id, messages.media_type, messages.replied_to, messages.origin
            FROM messages
            JOIN chats ON messages.chat_jid = chats.jid
            WHERE messages.chat_jid = ? AND messages.timestamp < ?
            ORDER BY messages.timestamp DESC
            LIMIT ?
        """, (msg_data[7], msg_data[0], before))
        
        before_messages = [_row_to_message(msg) for msg in cursor.fetchall()]
        
        # Get messages after
        cursor.execute("""
            SELECT messages.timestamp, messages.sender, chats.name, messages.content, messages.is_from_me, chats.jid, messages.id, messages.media_type, messages.replied_to, messages.origin
            FROM messages
            JOIN chats ON messages.chat_jid = chats.jid
            WHERE messages.chat_jid = ? AND messages.timestamp > ?
            ORDER BY messages.timestamp ASC
            LIMIT ?
        """, (msg_data[7], msg_data[0], after))
        
        after_messages = [_row_to_message(msg) for msg in cursor.fetchall()]
        
        return MessageContext(
            message=target_message,
            before=before_messages,
            after=after_messages
        )
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
        raise
    finally:
        if 'conn' in locals():
            conn.close()


def list_chats(
    query: Optional[str] = None,
    limit: int = 20,
    page: int = 0,
    include_last_message: bool = True,
    sort_by: str = "last_active"
) -> List[Chat]:
    """Get chats matching the specified criteria."""
    try:
        conn = sqlite3.connect(MESSAGES_DB_PATH)
        cursor = conn.cursor()
        
        # Build base query
        query_parts = ["""
            SELECT 
                chats.jid,
                chats.name,
                chats.last_message_time,
                messages.content as last_message,
                messages.sender as last_sender,
                messages.is_from_me as last_is_from_me
            FROM chats
        """]
        
        if include_last_message:
            query_parts.append("""
                LEFT JOIN messages ON chats.jid = messages.chat_jid 
                AND chats.last_message_time = messages.timestamp
            """)
            
        where_clauses = []
        params = []
        
        if query:
            where_clauses.append("(LOWER(chats.name) LIKE LOWER(?) OR chats.jid LIKE ?)")
            params.extend([f"%{query}%", f"%{query}%"])
            
        if where_clauses:
            query_parts.append("WHERE " + " AND ".join(where_clauses))
            
        # Add sorting
        order_by = "chats.last_message_time DESC" if sort_by == "last_active" else "chats.name"
        query_parts.append(f"ORDER BY {order_by}")
        
        # Add pagination
        offset = page * limit
        query_parts.append("LIMIT ? OFFSET ?")
        params.extend([limit, offset])
        
        cursor.execute(" ".join(query_parts), tuple(params))
        chats = cursor.fetchall()
        return [_row_to_chat(chat_data) for chat_data in chats]
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
        return []
    finally:
        if 'conn' in locals():
            conn.close()


def search_contacts(query: str) -> List[Contact]:
    """Search contacts by name or phone number."""
    try:
        conn = sqlite3.connect(MESSAGES_DB_PATH)
        cursor = conn.cursor()
        
        search_pattern = '%' + query + '%'
        
        cursor.execute("""
            SELECT DISTINCT 
                jid,
                name
            FROM chats
            WHERE 
                (LOWER(name) LIKE LOWER(?) OR LOWER(jid) LIKE LOWER(?))
                AND jid NOT LIKE '%@g.us'
            ORDER BY name, jid
            LIMIT 50
        """, (search_pattern, search_pattern))
        
        contacts = cursor.fetchall()
        return [
            Contact(
                phone_number=contact_data[0].split('@')[0],
                name=contact_data[1],
                jid=contact_data[0]
            )
            for contact_data in contacts
        ]
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
        return []
    finally:
        if 'conn' in locals():
            conn.close()


def get_contact_chats(jid: str, limit: int = 20, page: int = 0) -> List[Chat]:
    """Get all chats involving the contact.
    
    Args:
        jid: The contact's JID to search for
        limit: Maximum number of chats to return (default 20)
        page: Page number for pagination (default 0)
    """
    try:
        conn = sqlite3.connect(MESSAGES_DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT DISTINCT
                c.jid,
                c.name,
                c.last_message_time,
                m.content as last_message,
                m.sender as last_sender,
                m.is_from_me as last_is_from_me
            FROM chats c
            JOIN messages m ON c.jid = m.chat_jid
            WHERE m.sender = ? OR c.jid = ?
            ORDER BY c.last_message_time DESC
            LIMIT ? OFFSET ?
        """, (jid, jid, limit, page * limit))
        
        chats = cursor.fetchall()
        return [_row_to_chat(chat_data) for chat_data in chats]
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
        return []
    finally:
        if 'conn' in locals():
            conn.close()


def get_last_interaction(jid: str) -> str:
    """Get most recent message involving the contact."""
    try:
        conn = sqlite3.connect(MESSAGES_DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT 
                m.timestamp,
                m.sender,
                c.name,
                m.content,
                m.is_from_me,
                c.jid,
                m.id,
                m.media_type
            FROM messages m
            JOIN chats c ON m.chat_jid = c.jid
            WHERE m.sender = ? OR c.jid = ?
            ORDER BY m.timestamp DESC
            LIMIT 1
        """, (jid, jid))
        
        msg_data = cursor.fetchone()
        if not msg_data:
            return None
            
        message = _row_to_message(msg_data)
        return format_message(message)
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
        return None
    finally:
        if 'conn' in locals():
            conn.close()


def get_chat(chat_jid: str, include_last_message: bool = True) -> Optional[Chat]:
    """Get chat metadata by JID."""
    try:
        conn = sqlite3.connect(MESSAGES_DB_PATH)
        cursor = conn.cursor()
        
        query = """
            SELECT 
                c.jid,
                c.name,
                c.last_message_time,
                m.content as last_message,
                m.sender as last_sender,
                m.is_from_me as last_is_from_me
            FROM chats c
        """
        
        if include_last_message:
            query += """
                LEFT JOIN messages m ON c.jid = m.chat_jid 
                AND c.last_message_time = m.timestamp
            """
            
        query += " WHERE c.jid = ?"
        
        cursor.execute(query, (chat_jid,))
        chat_data = cursor.fetchone()
        
        if not chat_data:
            return None
            
        return _row_to_chat(chat_data)
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
        return None
    finally:
        if 'conn' in locals():
            conn.close()


def get_direct_chat_by_contact(sender_phone_number: str) -> Optional[Chat]:
    """Get chat metadata by sender phone number."""
    if not sender_phone_number or not sender_phone_number.strip():
        return None
    try:
        conn = sqlite3.connect(MESSAGES_DB_PATH)
        cursor = conn.cursor()

        cleaned_number = ''.join(c for c in sender_phone_number.split('@')[0] if c.isdigit())
        if not cleaned_number:
            return None

        lid_jid = get_lid_for_phone(cleaned_number)
        jid_patterns = []
        if lid_jid:
            jid_patterns.append(lid_jid)
        if len(cleaned_number) >= 7:
            jid_patterns.append(f"%{cleaned_number}%")
        else:
            jid_patterns.append(f"{cleaned_number}@s.whatsapp.net")
            jid_patterns.append(f"{cleaned_number}@lid")
        
        for pattern in jid_patterns:
            cursor.execute("""
                SELECT 
                    c.jid,
                    c.name,
                    c.last_message_time,
                    m.content as last_message,
                    m.sender as last_sender,
                    m.is_from_me as last_is_from_me
                FROM chats c
                LEFT JOIN messages m ON c.jid = m.chat_jid 
                    AND c.last_message_time = m.timestamp
                WHERE c.jid LIKE ? AND c.jid NOT LIKE '%@g.us'
                LIMIT 1
            """, (pattern,))
            
            chat_data = cursor.fetchone()
            if chat_data:
                break
        
        if not chat_data:
            return None
            
        return _row_to_chat(chat_data)
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
        return None
    finally:
        if 'conn' in locals():
            conn.close()


def send_message(recipient: str, message: str) -> Tuple[bool, str]:
    if not recipient:
        return False, "Recipient must be provided"
    
    ok, err, result = _post_bridge_api("send", {"recipient": recipient, "message": message})
    if ok:
        return result.get("success", False), result.get("message", "Unknown response")
    return False, err


def send_poll(recipient: str, question: str, options: list, selectable_count: int = 1) -> Tuple[bool, str, Optional[str]]:
    """Send a real WhatsApp interactive poll. Returns (ok, status, poll_id)."""
    if not recipient:
        return False, "Recipient must be provided", None
    
    payload = {
        "recipient": recipient,
        "question": question,
        "options": options,
        "selectable_count": selectable_count,
    }
    ok, err, result = _post_bridge_api("send-poll", payload)
    if ok:
        return result.get("success", False), result.get("message", "Unknown response"), result.get("poll_id")
    return False, err, None


def get_poll_vote(poll_msg_id: str) -> Optional[str]:
    """Read the selected option for a poll from poll_votes table."""
    try:
        conn = sqlite3.connect(MESSAGES_DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT selected_options, timestamp FROM poll_votes WHERE poll_msg_id = ? ORDER BY timestamp DESC LIMIT 1",
            (poll_msg_id,),
        )
        row = cursor.fetchone()
        conn.close()
        if row:
            return row[0]
        return None
    except sqlite3.Error as e:
        print(f"Database error reading poll vote: {e}")
        return None


def send_file(recipient: str, media_path: str) -> Tuple[bool, str]:
    if not recipient:
        return False, "Recipient must be provided"
    
    if not media_path:
        return False, "Media path must be provided"
    
    if not os.path.isfile(media_path):
        return False, f"Media file not found: {media_path}"
    
    ok, err, result = _post_bridge_api("send", {"recipient": recipient, "media_path": media_path})
    if ok:
        return result.get("success", False), result.get("message", "Unknown response")
    return False, err


def send_audio_message(recipient: str, media_path: str) -> Tuple[bool, str]:
    if not recipient:
        return False, "Recipient must be provided"
    
    if not media_path:
        return False, "Media path must be provided"
    
    if not os.path.isfile(media_path):
        return False, f"Media file not found: {media_path}"

    temp_converted_path = None
    if not media_path.endswith(".ogg"):
        try:
            temp_converted_path = audio.convert_to_opus_ogg_temp(media_path)
            media_path = temp_converted_path
        except Exception as e:
            return False, f"Error converting file to opus ogg. You likely need to install ffmpeg: {str(e)}"
    
    try:
        ok, err, result = _post_bridge_api("send", {"recipient": recipient, "media_path": media_path})
        if ok:
            return result.get("success", False), result.get("message", "Unknown response")
        return False, err
    finally:
        if temp_converted_path and os.path.exists(temp_converted_path):
            try:
                os.unlink(temp_converted_path)
            except OSError:
                pass


def download_media(message_id: str, chat_jid: str) -> Optional[str]:
    """Download media from a message and return the local file path.
    
    Args:
        message_id: The ID of the message containing the media
        chat_jid: The JID of the chat containing the message
    
    Returns:
        The local file path if download was successful, None otherwise
    """
    ok, err, result = _post_bridge_api("download", {"message_id": message_id, "chat_jid": chat_jid})
    if ok:
        if result.get("success", False):
            path = result.get("path")
            print(f"Media downloaded successfully: {path}")
            return path
        print(f"Download failed: {result.get('message', 'Unknown error')}")
        return None
    print(err)
    return None

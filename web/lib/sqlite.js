import path from "path";
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

let DatabaseSync = null;
try {
  const sqlite = require("node:sqlite");
  DatabaseSync = sqlite.DatabaseSync;
} catch (e) {
  // node:sqlite not supported
}

export function _setDatabaseSync(dbSync) {
  DatabaseSync = dbSync;
}

let customStoreDir = null;
export function _setStoreDir(dir) {
  customStoreDir = dir;
}

const MODULE_DIR = path.dirname(new URL(import.meta.url).pathname);

function findDbPath(filename) {
  if (customStoreDir !== null) {
    const p = path.resolve(customStoreDir, filename);
    return fs.existsSync(p) ? p : null;
  }

  const possiblePaths = [
    path.resolve(process.cwd(), "..", "whatsapp-bridge", "store", filename),
    path.resolve(process.cwd(), "whatsapp-bridge", "store", filename),
    path.resolve(process.cwd(), "store", filename),
    path.resolve(MODULE_DIR, "..", "..", "whatsapp-bridge", "store", filename),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function _extractContactDisplayName(contact) {
  return contact.full_name || contact.first_name || contact.business_name || contact.push_name || null;
}

function _populateFromWhatsappDb(dbPath, contactNames) {
  try {
    const waDb = new DatabaseSync(dbPath, { readOnly: true });
    const contacts = waDb.prepare("SELECT their_jid, full_name, first_name, push_name, business_name FROM whatsmeow_contacts").all();
    for (const c of contacts) {
      const name = _extractContactDisplayName(c);
      if (name && c.their_jid) {
        contactNames.set(c.their_jid, name);
        const num = c.their_jid.split("@")[0];
        if (num) contactNames.set(num, name);
      }
    }

    // LID mappings
    const lids = waDb.prepare("SELECT lid, pn FROM whatsmeow_lid_map").all();
    for (const l of lids) {
      if (l.lid && l.pn && contactNames.has(l.pn)) {
        const resolved = contactNames.get(l.pn);
        contactNames.set(l.lid, resolved);
        contactNames.set(`${l.lid}@lid`, resolved);
      }
    }
    waDb.close();
  } catch (err) {
    console.warn("Contact resolution from whatsapp.db failed", err);
  }
}

function _populateFromMessagesDb(dbPath, contactNames) {
  try {
    const msgDb = new DatabaseSync(dbPath, { readOnly: true });
    const chats = msgDb.prepare("SELECT jid, name FROM chats WHERE name IS NOT NULL AND name != ''").all();
    for (const ch of chats) {
      if (ch.jid && ch.name && !contactNames.has(ch.jid)) {
        contactNames.set(ch.jid, ch.name);
        const num = ch.jid.split("@")[0];
        if (num) contactNames.set(num, ch.name);
      }
    }
    msgDb.close();
  } catch (err) {
    console.warn("Contact resolution from messages.db failed", err);
  }
}

export function getLidMap() {
  const lidToPn = new Map();
  const pnToLid = new Map();
  if (!DatabaseSync) return { lidToPn, pnToLid };
  const whatsappDbPath = findDbPath("whatsapp.db");
  if (!whatsappDbPath) return { lidToPn, pnToLid };

  try {
    const waDb = new DatabaseSync(whatsappDbPath, { readOnly: true });
    const rows = waDb.prepare("SELECT lid, pn FROM whatsmeow_lid_map").all();
    for (const r of rows) {
      if (r.lid && r.pn) {
        lidToPn.set(r.lid, r.pn);
        lidToPn.set(`${r.lid}@lid`, `${r.pn}@s.whatsapp.net`);
        pnToLid.set(r.pn, r.lid);
        pnToLid.set(`${r.pn}@s.whatsapp.net`, `${r.lid}@lid`);
      }
    }
    waDb.close();
  } catch (err) {
    console.warn("LID map resolution from whatsapp.db failed", err);
  }
  return { lidToPn, pnToLid };
}

export function getContactNameMap() {
  const contactNames = new Map();
  const whatsappDbPath = findDbPath("whatsapp.db");
  const messagesDbPath = findDbPath("messages.db");

  if (DatabaseSync && whatsappDbPath) {
    _populateFromWhatsappDb(whatsappDbPath, contactNames);
  }

  if (DatabaseSync && messagesDbPath) {
    _populateFromMessagesDb(messagesDbPath, contactNames);
  }

  return contactNames;
}

function _mapChatRow(r, contactNames) {
  const jid = r.jid || "";
  const num = jid.split("@")[0];
  const resolvedName = contactNames.get(jid) || contactNames.get(num) || r.chat_name || num;

  return {
    jid,
    name: resolvedName,
    phone: num,
    lastMessage: r.last_message || "",
    lastMessageTime: r.message_timestamp || r.last_message_time || null,
    lastIsFromMe: Boolean(r.last_is_from_me),
    isGroup: jid.endsWith("@g.us"),
  };
}

function _mapMessageRow(r, contactNames) {
  const senderNum = (r.sender || "").split("@")[0];
  const senderName = contactNames.get(r.sender) || contactNames.get(senderNum) || "";

  return {
    id: r.id || `${r.timestamp}-${r.sender}`,
    chatJid: r.chat_jid,
    sender: r.sender,
    senderName,
    content: r.content || "",
    timestamp: r.timestamp,
    isFromMe: Boolean(r.is_from_me),
    mediaType: r.media_type || "",
    isAi: r.origin === "ai" || r.origin === "takeover",
  };
}

export function getLocalChats(limit = 50) {
  if (!DatabaseSync) return [];
  const messagesDbPath = findDbPath("messages.db");
  if (!messagesDbPath) return [];

  try {
    const contactNames = getContactNameMap();
    const { lidToPn } = getLidMap();
    const msgDb = new DatabaseSync(messagesDbPath, { readOnly: true });

    // Query chats joined with latest message
    const chatsQuery = `
      SELECT 
        c.jid,
        c.name as chat_name,
        c.last_message_time,
        m.content as last_message,
        m.sender as last_sender,
        m.is_from_me as last_is_from_me,
        m.timestamp as message_timestamp
      FROM chats c
      LEFT JOIN (
        SELECT m1.chat_jid, m1.content, m1.sender, m1.is_from_me, m1.timestamp
        FROM messages m1
        INNER JOIN (
          SELECT chat_jid, MAX(timestamp) as max_time
          FROM messages
          GROUP BY chat_jid
        ) m2 ON m1.chat_jid = m2.chat_jid AND m1.timestamp = m2.max_time
      ) m ON c.jid = m.chat_jid
      WHERE c.jid != 'status@broadcast'
      ORDER BY coalesce(m.timestamp, c.last_message_time) DESC
    `;

    const rows = msgDb.prepare(chatsQuery).all();
    msgDb.close();

    // Deduplicate and merge @lid and phone number chats into unified conversations
    const mergedChats = new Map();

    for (const r of rows) {
      const mapped = _mapChatRow(r, contactNames);
      const jid = mapped.jid;
      const num = mapped.phone;

      // Determine canonical key: if it's a group, use group JID; if it's a LID that maps to a PN, use the PN
      let canonicalKey = jid;
      let canonicalJid = jid;
      let canonicalPhone = num;

      if (!mapped.isGroup) {
        if (jid.endsWith("@lid") || lidToPn.has(num) || lidToPn.has(jid)) {
          const mappedPn = lidToPn.get(num) || lidToPn.get(jid);
          if (mappedPn) {
            const cleanPn = mappedPn.replace(/\D/g, "");
            canonicalKey = cleanPn ? `${cleanPn}@s.whatsapp.net` : mappedPn;
            canonicalJid = canonicalKey;
            canonicalPhone = cleanPn || mappedPn;
          }
        }
      }

      if (!mergedChats.has(canonicalKey)) {
        mergedChats.set(canonicalKey, {
          ...mapped,
          jid: canonicalJid,
          phone: canonicalPhone,
        });
      } else {
        const existing = mergedChats.get(canonicalKey);
        const existingTime = existing.lastMessageTime ? new Date(existing.lastMessageTime).getTime() : 0;
        const newTime = mapped.lastMessageTime ? new Date(mapped.lastMessageTime).getTime() : 0;

        const isNewer = newTime > existingTime;
        mergedChats.set(canonicalKey, {
          ...existing,
          name: (existing.name && !existing.name.match(/^\+?\d+$/)) ? existing.name : mapped.name,
          lastMessage: isNewer ? mapped.lastMessage : existing.lastMessage,
          lastMessageTime: isNewer ? mapped.lastMessageTime : existing.lastMessageTime,
          lastIsFromMe: isNewer ? mapped.lastIsFromMe : existing.lastIsFromMe,
        });
      }
    }

    return Array.from(mergedChats.values()).slice(0, limit);
  } catch (err) {
    console.error("Local SQLite getLocalChats error:", err);
    return [];
  }
}

export function getLocalMessages(chatJid = "", limit = 100) {
  if (!DatabaseSync) return [];
  const messagesDbPath = findDbPath("messages.db");
  if (!messagesDbPath) return [];

  try {
    const contactNames = getContactNameMap();
    const { lidToPn, pnToLid } = getLidMap();
    const msgDb = new DatabaseSync(messagesDbPath, { readOnly: true });

    let rows = [];
    if (chatJid) {
      const clean = chatJid.replace(/\D/g, "");
      const associatedJids = new Set([chatJid]);
      if (clean) {
        associatedJids.add(clean);
        associatedJids.add(`${clean}@s.whatsapp.net`);
        associatedJids.add(`${clean}@lid`);
      }
      const mappedPn = lidToPn.get(clean) || lidToPn.get(chatJid);
      if (mappedPn) {
        associatedJids.add(mappedPn);
        const cleanPn = mappedPn.replace(/\D/g, "");
        if (cleanPn) {
          associatedJids.add(cleanPn);
          associatedJids.add(`${cleanPn}@s.whatsapp.net`);
          associatedJids.add(`${cleanPn}@lid`);
        }
      }
      const mappedLid = pnToLid.get(clean) || pnToLid.get(chatJid);
      if (mappedLid) {
        associatedJids.add(mappedLid);
        const cleanLid = mappedLid.replace(/\D/g, "");
        if (cleanLid) {
          associatedJids.add(cleanLid);
          associatedJids.add(`${cleanLid}@s.whatsapp.net`);
          associatedJids.add(`${cleanLid}@lid`);
        }
      }

      const jidList = Array.from(associatedJids);
      const placeholders = jidList.map(() => "?").join(",");
      const query = `
        SELECT id, chat_jid, sender, content, timestamp, is_from_me, media_type, origin
        FROM messages
        WHERE chat_jid IN (${placeholders}) OR sender IN (${placeholders}) OR chat_jid LIKE ?
        ORDER BY timestamp ASC
        LIMIT ?
      `;
      rows = msgDb.prepare(query).all(...jidList, ...jidList, `%${clean}%`, limit);
    } else {
      const query = `
        SELECT id, chat_jid, sender, content, timestamp, is_from_me, media_type, origin
        FROM messages
        WHERE chat_jid != 'status@broadcast'
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      rows = msgDb.prepare(query).all(limit).reverse();
    }

    msgDb.close();

    return rows.map((r) => _mapMessageRow(r, contactNames));
  } catch (err) {
    console.error("Local SQLite getLocalMessages error:", err);
    return [];
  }
}

export function getLocalContacts(query = "", limit = 100) {
  if (!DatabaseSync) return [];
  const whatsappDbPath = findDbPath("whatsapp.db");
  if (!whatsappDbPath) return [];

  try {
    const waDb = new DatabaseSync(whatsappDbPath, { readOnly: true });
    let rows = [];

    if (query) {
      const clean = query.replace(/\D/g, "");
      const q = `
        SELECT their_jid, full_name, first_name, push_name, business_name
        FROM whatsmeow_contacts
        WHERE full_name LIKE ? OR first_name LIKE ? OR push_name LIKE ? OR their_jid LIKE ?
        ORDER BY coalesce(full_name, first_name, push_name) ASC
        LIMIT ?
      `;
      rows = waDb.prepare(q).all(`%${query}%`, `%${query}%`, `%${query}%`, `%${clean}%`, limit);
    } else {
      const q = `
        SELECT their_jid, full_name, first_name, push_name, business_name
        FROM whatsmeow_contacts
        ORDER BY coalesce(full_name, first_name, push_name) ASC
        LIMIT ?
      `;
      rows = waDb.prepare(q).all(limit);
    }

    waDb.close();

    return rows.map((c) => {
      const name = _extractContactDisplayName(c) || "";
      const num = (c.their_jid || "").split("@")[0];
      return {
        jid: c.their_jid,
        phone: num,
        name: name || num,
        pushName: c.push_name || "",
      };
    });
  } catch (err) {
    console.error("Local SQLite getLocalContacts error:", err);
    return [];
  }
}

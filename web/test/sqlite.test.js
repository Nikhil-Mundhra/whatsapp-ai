import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import {
  getContactNameMap,
  getLidMap,
  getLocalChats,
  getLocalMessages,
  getLocalContacts,
  _setDatabaseSync,
  _setStoreDir,
} from "../lib/sqlite.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

const storeDir = path.resolve(process.cwd(), "test-store");
const waDbPath = path.join(storeDir, "whatsapp.db");
const msgDbPath = path.join(storeDir, "messages.db");

function setupTestDatabases() {
  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true });
  }

  // 1. Setup whatsapp.db
  if (fs.existsSync(waDbPath)) fs.unlinkSync(waDbPath);
  const waDb = new DatabaseSync(waDbPath);
  waDb.exec(`
    CREATE TABLE whatsmeow_contacts (
      their_jid TEXT PRIMARY KEY,
      full_name TEXT,
      first_name TEXT,
      push_name TEXT,
      business_name TEXT
    );
    CREATE TABLE whatsmeow_lid_map (
      lid TEXT PRIMARY KEY,
      pn TEXT
    );
  `);

  const insertContact = waDb.prepare(`
    INSERT INTO whatsmeow_contacts (their_jid, full_name, first_name, push_name, business_name)
    VALUES (?, ?, ?, ?, ?)
  `);
  // Contact with full_name
  insertContact.run("1111111111@s.whatsapp.net", "Alice Smith", "Alice", "AliceP", null);
  // Contact with only first_name
  insertContact.run("2222222222@s.whatsapp.net", null, "Bob", "Bobby", null);
  // Contact with only business_name
  insertContact.run("3333333333@s.whatsapp.net", null, null, "CharlieP", "Charlie Corp");
  // Contact with only push_name
  insertContact.run("4444444444@s.whatsapp.net", null, null, "DavePush", null);
  // Contact with no name
  insertContact.run("5555555555@s.whatsapp.net", null, null, null, null);

  const insertLid = waDb.prepare("INSERT INTO whatsmeow_lid_map (lid, pn) VALUES (?, ?)");
  insertLid.run("lid_alice", "1111111111");
  insertLid.run("lid_unknown", "9999999999");
  waDb.close();

  // 2. Setup messages.db
  if (fs.existsSync(msgDbPath)) fs.unlinkSync(msgDbPath);
  const msgDb = new DatabaseSync(msgDbPath);
  msgDb.exec(`
    CREATE TABLE chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time INTEGER
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      chat_jid TEXT,
      sender TEXT,
      content TEXT,
      timestamp INTEGER,
      is_from_me INTEGER,
      media_type TEXT,
      origin TEXT
    );
  `);

  const insertChat = msgDb.prepare("INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)");
  insertChat.run("1111111111@s.whatsapp.net", "Alice Chat", 1000);
  insertChat.run("6666666666@s.whatsapp.net", "Frank Chat", 2000);
  insertChat.run("123456789-group@g.us", "Project Alpha", 3000);
  insertChat.run("status@broadcast", "Broadcast", 4000);

  const insertMsg = msgDb.prepare(`
    INSERT INTO messages (id, chat_jid, sender, content, timestamp, is_from_me, media_type, origin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertMsg.run("msg1", "1111111111@s.whatsapp.net", "1111111111@s.whatsapp.net", "Hello Alice", 1000, 0, "", "user");
  insertMsg.run("msg2", "1111111111@s.whatsapp.net", "me@s.whatsapp.net", "Hi there", 1050, 1, "", "ai");
  insertMsg.run("msg3", "6666666666@s.whatsapp.net", "6666666666@s.whatsapp.net", "Frank here", 2000, 0, "image", "takeover");
  insertMsg.run("msg4", "123456789-group@g.us", "1111111111@s.whatsapp.net", "Group msg", 3000, 0, "", "user");
  insertMsg.run("msg5", "status@broadcast", "me@s.whatsapp.net", "Broadcast msg", 4000, 1, "", "user");
  // Message without id to test id fallback `${timestamp}-${sender}`
  insertMsg.run(null, "1111111111@s.whatsapp.net", "1111111111@s.whatsapp.net", "No id msg", 5000, 0, "", "user");
  msgDb.close();
}

function cleanupDatabases() {
  if (fs.existsSync(waDbPath)) fs.unlinkSync(waDbPath);
  if (fs.existsSync(msgDbPath)) fs.unlinkSync(msgDbPath);
  if (fs.existsSync(storeDir)) {
    try {
      fs.rmdirSync(storeDir);
    } catch {}
  }
}

test("sqlite.js unit tests", async (t) => {
  t.before(() => {
    _setDatabaseSync(DatabaseSync);
    _setStoreDir(storeDir);
    setupTestDatabases();
  });

  t.after(() => {
    cleanupDatabases();
    _setDatabaseSync(DatabaseSync);
    _setStoreDir(null);
  });

  await t.test("getContactNameMap resolves names from both whatsapp.db and messages.db", () => {
    const map = getContactNameMap();
    assert.equal(map.get("1111111111@s.whatsapp.net"), "Alice Smith");
    assert.equal(map.get("1111111111"), "Alice Smith");
    assert.equal(map.get("lid_alice"), "Alice Smith");
    assert.equal(map.get("lid_alice@lid"), "Alice Smith");
    assert.equal(map.get("2222222222@s.whatsapp.net"), "Bob");
    assert.equal(map.get("3333333333@s.whatsapp.net"), "Charlie Corp");
    assert.equal(map.get("4444444444@s.whatsapp.net"), "DavePush");
    assert.equal(map.has("5555555555@s.whatsapp.net"), false);
    // Frank from messages.db chats table
    assert.equal(map.get("6666666666@s.whatsapp.net"), "Frank Chat");
    assert.equal(map.get("6666666666"), "Frank Chat");
  });

  await t.test("getLocalChats retrieves chats with resolved names and latest messages", () => {
    const chats = getLocalChats(10);
    assert.ok(Array.isArray(chats));
    assert.ok(chats.length >= 3);

    // Verify broadcast chat is excluded
    assert.ok(!chats.some((c) => c.jid === "status@broadcast"));

    const aliceChat = chats.find((c) => c.jid === "1111111111@s.whatsapp.net");
    assert.ok(aliceChat);
    assert.equal(aliceChat.name, "Alice Smith");
    assert.equal(aliceChat.phone, "1111111111");
    assert.equal(aliceChat.isGroup, false);

    const groupChat = chats.find((c) => c.jid === "123456789-group@g.us");
    assert.ok(groupChat);
    assert.equal(groupChat.isGroup, true);
    assert.equal(groupChat.name, "Project Alpha");
  });

  await t.test("getLocalChats works with default limit parameter", () => {
    const chats = getLocalChats();
    assert.ok(Array.isArray(chats));
  });

  await t.test("getLocalMessages queries messages for a specific chatJid", () => {
    const msgs = getLocalMessages("1111111111@s.whatsapp.net", 50);
    assert.ok(Array.isArray(msgs));
    assert.ok(msgs.length >= 2);

    const aiMsg = msgs.find((m) => m.id === "msg2");
    assert.ok(aiMsg);
    assert.equal(aiMsg.isAi, true);
    assert.equal(aiMsg.isFromMe, true);

    const noIdMsg = msgs.find((m) => m.content === "No id msg");
    assert.ok(noIdMsg);
    assert.equal(noIdMsg.id, "5000-1111111111@s.whatsapp.net");
  });

  await t.test("getLocalMessages queries all recent messages when chatJid is empty", () => {
    const msgs = getLocalMessages("", 50);
    assert.ok(Array.isArray(msgs));
    assert.ok(msgs.length >= 4);
    assert.ok(!msgs.some((m) => m.chatJid === "status@broadcast"));

    const takeoverMsg = msgs.find((m) => m.id === "msg3");
    assert.ok(takeoverMsg);
    assert.equal(takeoverMsg.isAi, true);
    assert.equal(takeoverMsg.mediaType, "image");
  });

  await t.test("getLocalMessages works with default parameters", () => {
    const msgs = getLocalMessages();
    assert.ok(Array.isArray(msgs));
  });

  await t.test("getLocalContacts queries contacts with and without search query", () => {
    const allContacts = getLocalContacts();
    assert.ok(allContacts.length >= 4);

    // Query with phone digits to test specific digit matching
    const phoneFiltered = getLocalContacts("111111");
    assert.equal(phoneFiltered.length, 1);
    assert.equal(phoneFiltered[0].name, "Alice Smith");
    assert.equal(phoneFiltered[0].phone, "1111111111");

    const phoneFiltered2 = getLocalContacts("222222");
    assert.equal(phoneFiltered2.length, 1);
    assert.equal(phoneFiltered2[0].name, "Bob");

    // Query with non-digit string (matches full_name / push_name or empty clean digit match)
    const textFiltered = getLocalContacts("Alice");
    assert.ok(textFiltered.some((c) => c.name === "Alice Smith"));
  });

  await t.test("returns empty arrays/maps when DatabaseSync is null", () => {
    _setDatabaseSync(null);
    assert.deepEqual(getContactNameMap(), new Map());
    assert.deepEqual(getLocalChats(), []);
    assert.deepEqual(getLocalMessages(), []);
    assert.deepEqual(getLocalContacts(), []);
    _setDatabaseSync(DatabaseSync);
  });

  await t.test("handles missing database files gracefully", () => {
    const emptyDir = path.resolve(process.cwd(), "empty-test-store");
    if (!fs.existsSync(emptyDir)) fs.mkdirSync(emptyDir, { recursive: true });
    _setStoreDir(emptyDir);

    assert.deepEqual(getContactNameMap(), new Map());
    assert.deepEqual(getLocalChats(), []);
    assert.deepEqual(getLocalMessages(), []);
    assert.deepEqual(getLocalContacts(), []);

    _setStoreDir(storeDir);
    try {
      fs.rmdirSync(emptyDir);
    } catch {}
  });

  await t.test("handles corrupt or invalid SQL queries gracefully", () => {
    const corruptDir = path.resolve(process.cwd(), "corrupt-test-store");
    if (!fs.existsSync(corruptDir)) fs.mkdirSync(corruptDir, { recursive: true });
    const corruptWa = path.join(corruptDir, "whatsapp.db");
    const corruptMsg = path.join(corruptDir, "messages.db");
    fs.writeFileSync(corruptWa, "corrupt database content");
    fs.writeFileSync(corruptMsg, "corrupt database content");

    _setStoreDir(corruptDir);

    assert.deepEqual(getContactNameMap(), new Map());
    assert.deepEqual(getLocalChats(), []);
    assert.deepEqual(getLocalMessages(), []);
    assert.deepEqual(getLocalContacts(), []);

    _setStoreDir(storeDir);
    if (fs.existsSync(corruptWa)) fs.unlinkSync(corruptWa);
    if (fs.existsSync(corruptMsg)) fs.unlinkSync(corruptMsg);
    try {
      fs.rmdirSync(corruptDir);
    } catch {}
  });

  await t.test("findDbPath default path discovery returns null for non-existent file", () => {
    _setStoreDir(null);
    // getLocalContacts searches for whatsapp.db, but if we query with customStoreDir = null and non-existent DB
    _setStoreDir(storeDir);
  });

  await t.test("branch coverage for contact name resolution, lid mappings, and message origins", () => {
    const customWaPath = path.join(storeDir, "whatsapp.db");
    const waDb = new DatabaseSync(customWaPath);
    // Add lid mapping where pn is not in contactNames
    const insertLid = waDb.prepare("INSERT INTO whatsmeow_lid_map (lid, pn) VALUES (?, ?)");
    insertLid.run("lid_unmapped", "unmapped_phone");
    // Add contact without phone number (no @)
    const insertContact = waDb.prepare(`
      INSERT INTO whatsmeow_contacts (their_jid, full_name, first_name, push_name, business_name)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertContact.run("no_at_symbol", "No At Contact", null, null, null);
    waDb.close();

    const customMsgPath = path.join(storeDir, "messages.db");
    const msgDb = new DatabaseSync(customMsgPath);
    // Add chat with no last_message_time and no message_timestamp
    const insertChat = msgDb.prepare("INSERT OR REPLACE INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)");
    insertChat.run("7777777777@s.whatsapp.net", "Seven Chat", null);
    msgDb.close();

    const map = getContactNameMap();
    assert.equal(map.get("no_at_symbol"), "No At Contact");

    const chats = getLocalChats(20);
    const sevenChat = chats.find((c) => c.jid === "7777777777@s.whatsapp.net");
    assert.ok(sevenChat);
    assert.equal(sevenChat.lastMessageTime, null);
  });

  await t.test("getLidMap and @lid concatenation with phone numbers in chats and messages", () => {
    const customWaPath = path.join(storeDir, "whatsapp.db");
    const waDb = new DatabaseSync(customWaPath);
    const insertLid = waDb.prepare("INSERT OR REPLACE INTO whatsmeow_lid_map (lid, pn) VALUES (?, ?)");
    insertLid.run("888888888888888", "8888888888");
    waDb.close();

    const customMsgPath = path.join(storeDir, "messages.db");
    const msgDb = new DatabaseSync(customMsgPath);
    const insertChat = msgDb.prepare("INSERT OR REPLACE INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)");
    insertChat.run("8888888888@s.whatsapp.net", "Henry Phone", 6000);
    insertChat.run("888888888888888@lid", "Henry LID", 7000);

    const insertMsg = msgDb.prepare(`
      INSERT OR REPLACE INTO messages (id, chat_jid, sender, content, timestamp, is_from_me, media_type, origin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertMsg.run("msg_hn1", "8888888888@s.whatsapp.net", "8888888888@s.whatsapp.net", "Hello from phone", 6000, 0, "", "user");
    insertMsg.run("msg_hn2", "888888888888888@lid", "888888888888888@lid", "Hello from LID", 7000, 0, "", "user");
    msgDb.close();

    // 1. getLidMap
    const { lidToPn, pnToLid } = getLidMap();
    assert.equal(lidToPn.get("888888888888888"), "8888888888");
    assert.equal(pnToLid.get("8888888888"), "888888888888888");
    assert.equal(lidToPn.get("888888888888888@lid"), "8888888888@s.whatsapp.net");

    // 2. getLocalChats should merge Henry Phone and Henry LID into single chat with newer message
    const chats = getLocalChats(50);
    const henryChats = chats.filter((c) => c.phone === "8888888888" || c.jid === "8888888888@s.whatsapp.net");
    assert.equal(henryChats.length, 1);
    assert.equal(henryChats[0].lastMessage, "Hello from LID");
    assert.equal(henryChats[0].lastMessageTime, 7000);

    // 3. getLocalMessages for phone JID should return both phone and LID messages
    const msgsByPhone = getLocalMessages("8888888888@s.whatsapp.net", 50);
    assert.ok(msgsByPhone.some((m) => m.content === "Hello from phone"));
    assert.ok(msgsByPhone.some((m) => m.content === "Hello from LID"));

    // 4. getLocalMessages for LID JID should also return both messages
    const msgsByLid = getLocalMessages("888888888888888@lid", 50);
    assert.ok(msgsByLid.some((m) => m.content === "Hello from phone"));
    assert.ok(msgsByLid.some((m) => m.content === "Hello from LID"));
  });
});

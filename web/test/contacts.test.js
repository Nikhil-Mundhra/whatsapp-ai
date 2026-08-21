import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanDigits,
  validatePhoneNumber,
  formatPhoneDisplay,
  createContactObject,
  parseRecipientsToContacts,
  serializeContactsToRecipients,
} from "../lib/contacts.js";

test("contacts.js validation and normalization unit tests", async (t) => {
  await t.test("cleanDigits extracts only numbers", () => {
    assert.equal(cleanDigits("+1 (415) 555-0100"), "14155550100");
    assert.equal(cleanDigits("+91 98765 43210"), "919876543210");
    assert.equal(cleanDigits("abc-123-xyz"), "123");
    assert.equal(cleanDigits(null), "");
    assert.equal(cleanDigits(undefined), "");
  });

  await t.test("validatePhoneNumber validates real mobile numbers according to E.164", () => {
    // Valid numbers
    const resIndia = validatePhoneNumber("+91 70604 10033");
    assert.equal(resIndia.isValid, true);
    assert.equal(resIndia.cleanPhone, "917060410033");
    assert.equal(resIndia.formatted, "+91 70604 10033");

    const resUS = validatePhoneNumber("14155550100");
    assert.equal(resUS.isValid, true);
    assert.equal(resUS.cleanPhone, "14155550100");
    assert.equal(resUS.formatted, "+1 (415) 555-0100");

    const resUK = validatePhoneNumber("+44 7123 456789");
    assert.equal(resUK.isValid, true);
    assert.equal(resUK.cleanPhone, "447123456789");
    assert.equal(resUK.formatted, "+44 7123 456789");

    const res10 = validatePhoneNumber("4155550199");
    assert.equal(res10.isValid, true);
    assert.equal(res10.cleanPhone, "4155550199");
    assert.equal(res10.formatted, "(415) 555-0199");

    // Invalid numbers: empty
    const resEmpty = validatePhoneNumber("");
    assert.equal(resEmpty.isValid, false);
    assert.ok(resEmpty.error.includes("empty"));

    // Invalid numbers: too short (< 7 digits)
    const resShort = validatePhoneNumber("12345");
    assert.equal(resShort.isValid, false);
    assert.ok(resShort.error.includes("7 digits"));

    // Invalid numbers: too long (> 15 digits)
    const resLong = validatePhoneNumber("1234567890123456789");
    assert.equal(resLong.isValid, false);
    assert.ok(resLong.error.includes("15 digits"));
  });

  await t.test("formatPhoneDisplay formats numbers correctly across regions", () => {
    assert.equal(formatPhoneDisplay("917060410033"), "+91 70604 10033");
    assert.equal(formatPhoneDisplay("14155550100"), "+1 (415) 555-0100");
    assert.equal(formatPhoneDisplay("447123456789"), "+44 7123 456789");
    assert.equal(formatPhoneDisplay("4155550199"), "(415) 555-0199");
    assert.equal(formatPhoneDisplay("3312345678"), "(331) 234-5678");
    assert.equal(formatPhoneDisplay("33123456789"), "+33123456789");
    assert.equal(formatPhoneDisplay(""), "");
  });

  await t.test("createContactObject creates structured Contact objects for P2P and groups", () => {
    // Direct P2P contact
    const p2p = createContactObject({
      phone: "14155550100",
      name: "Alice Smith",
      lid: "104857692847192",
    });
    assert.equal(p2p.id, "14155550100");
    assert.equal(p2p.phone, "14155550100");
    assert.equal(p2p.name, "Alice Smith");
    assert.equal(p2p.lid, "104857692847192@lid");
    assert.equal(p2p.jid, "14155550100@s.whatsapp.net");
    assert.equal(p2p.isGroup, false);

    // Group contact
    const group = createContactObject({
      name: "TotalMathematics",
      jid: "120363000000000000@g.us",
      isGroup: true,
    });
    assert.equal(group.id, "group-totalmathematics");
    assert.equal(group.name, "TotalMathematics");
    assert.equal(group.isGroup, true);
    assert.equal(group.phone, "");
  });

  await t.test("parseRecipientsToContacts converts strings, numbers, and groups into Contact objects", () => {
    const knownContacts = [
      { phone: "14155550100", name: "Alice Smith", lid: "104857692847192@lid" },
      { phone: "917060410033", name: "Nikhil Mundhra", lid: "204857692847192@lid" },
    ];
    const knownChats = [
      { jid: "120363111111111111@g.us", name: "Engineering Team", isGroup: true },
      { jid: "14155550100@s.whatsapp.net", phone: "14155550100", name: "Alice Smith", isGroup: false },
    ];

    const rawList = [
      "14155550100",
      "+91 70604 10033",
      "Engineering Team",
      "Custom Group Name",
      "104857692847192@lid",
      { phone: "447123456789", name: "Bob UK", isGroup: false },
    ];

    const parsed = parseRecipientsToContacts(rawList, knownContacts, knownChats);
    assert.equal(parsed.length, 5); // 104857692847192@lid deduped with Alice

    const alice = parsed.find((c) => c.phone === "14155550100");
    assert.ok(alice);
    assert.equal(alice.name, "Alice Smith");
    assert.equal(alice.lid, "104857692847192@lid");

    const nikhil = parsed.find((c) => c.phone === "917060410033");
    assert.ok(nikhil);
    assert.equal(nikhil.name, "Nikhil Mundhra");

    const engGroup = parsed.find((c) => c.name === "Engineering Team");
    assert.ok(engGroup);
    assert.equal(engGroup.isGroup, true);
    assert.equal(engGroup.jid, "120363111111111111@g.us");

    const customGroup = parsed.find((c) => c.name === "Custom Group Name");
    assert.ok(customGroup);
    assert.equal(customGroup.isGroup, true);

    const bob = parsed.find((c) => c.phone === "447123456789");
    assert.ok(bob);
    assert.equal(bob.name, "Bob UK");
  });

  await t.test("serializeContactsToRecipients converts Contact objects to whitelist strings", () => {
    const contacts = [
      { phone: "14155550100", name: "Alice Smith", isGroup: false },
      { name: "Engineering Team", isGroup: true, jid: "120363111111111111@g.us" },
      "917060410033",
    ];

    const serialized = serializeContactsToRecipients(contacts);
    assert.deepEqual(serialized, ["14155550100", "Engineering Team", "917060410033"]);
  });
});

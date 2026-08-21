/**
 * Contact Validation & Normalization Helper Utilities
 */

/**
 * Strips all non-digit characters from a phone number string.
 * @param {string} raw
 * @returns {string}
 */
export function cleanDigits(raw = "") {
  return String(raw || "").replace(/\D/g, "");
}

/**
 * Validates whether a given string is a real mobile/phone number according to E.164 (7-15 digits).
 * @param {string} raw
 * @returns {{ isValid: boolean, cleanPhone: string, formatted: string, error?: string }}
 */
export function validatePhoneNumber(raw = "") {
  const clean = cleanDigits(raw);

  if (!clean) {
    return {
      isValid: false,
      cleanPhone: "",
      formatted: "",
      error: "Phone number cannot be empty",
    };
  }

  if (clean.length < 7) {
    return {
      isValid: false,
      cleanPhone: clean,
      formatted: clean,
      error: "Phone number must be at least 7 digits (with country code)",
    };
  }

  if (clean.length > 15) {
    return {
      isValid: false,
      cleanPhone: clean,
      formatted: clean,
      error: "Phone number cannot exceed 15 digits (ITU-T E.164)",
    };
  }

  return {
    isValid: true,
    cleanPhone: clean,
    formatted: formatPhoneDisplay(clean),
  };
}

/**
 * Pretty-formats a mobile number for UI presentation.
 * @param {string} raw
 * @returns {string}
 */
export function formatPhoneDisplay(raw = "") {
  const clean = cleanDigits(raw);
  if (!clean) return String(raw || "");

  // India: 91 XXXXX XXXXX (12 digits)
  if (clean.length === 12 && clean.startsWith("91")) {
    return `+91 ${clean.slice(2, 7)} ${clean.slice(7)}`;
  }
  // US/Canada: 1 (XXX) XXX-XXXX (11 digits)
  if (clean.length === 11 && clean.startsWith("1")) {
    return `+1 (${clean.slice(1, 4)}) ${clean.slice(4, 7)}-${clean.slice(7)}`;
  }
  // UK: 44 XXXX XXXXXX (12 digits)
  if (clean.length === 12 && clean.startsWith("44")) {
    return `+44 ${clean.slice(2, 6)} ${clean.slice(6)}`;
  }
  // Standard 10-digit national format
  if (clean.length === 10) {
    return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
  }

  // Default international format
  return `+${clean}`;
}

/**
 * Creates a normalized Contact object for P2P or Group.
 * @param {Object} params
 * @param {string} [params.phone]
 * @param {string} [params.name]
 * @param {string} [params.lid]
 * @param {string} [params.jid]
 * @param {boolean} [params.isGroup]
 * @param {string} [params.pushName]
 * @returns {Object}
 */
export function createContactObject({
  phone = "",
  name = "",
  lid = null,
  jid = "",
  isGroup = false,
  pushName = "",
} = {}) {
  const clean = cleanDigits(phone);
  const isGroupContact = Boolean(isGroup || (jid && jid.endsWith("@g.us")));

  let canonicalId = "";
  let canonicalJid = "";
  let displayName = name;

  if (isGroupContact) {
    displayName = name || jid || "WhatsApp Group";
    canonicalId = `group-${displayName.toLowerCase().replace(/\s+/g, "-")}`;
    canonicalJid = jid || displayName;
  } else {
    canonicalId = clean || jid || lid || "unknown";
    canonicalJid = clean ? `${clean}@s.whatsapp.net` : jid || "";
    if (!displayName) {
      displayName = clean ? formatPhoneDisplay(clean) : (lid || "Unnamed Contact");
    }
  }

  let formattedLid = lid || null;
  if (formattedLid && !formattedLid.includes("@") && !formattedLid.startsWith("lid_")) {
    formattedLid = `${formattedLid}@lid`;
  }

  return {
    id: canonicalId,
    phone: clean,
    name: displayName,
    lid: formattedLid,
    jid: canonicalJid,
    isGroup: isGroupContact,
    pushName: pushName || "",
  };
}

/**
 * Parses an array of mixed string/object recipients into an array of Contact objects.
 * Matches against known contacts and chats to auto-enrich name, LID, and group status.
 * @param {Array<string|Object>} recipients
 * @param {Array<Object>} [knownContacts=[]]
 * @param {Array<Object>} [knownChats=[]]
 * @returns {Array<Object>}
 */
export function parseRecipientsToContacts(recipients = [], knownContacts = [], knownChats = []) {
  if (!Array.isArray(recipients)) {
    if (typeof recipients === "string") {
      recipients = recipients.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      return [];
    }
  }

  const result = [];
  const seenIds = new Set();

  for (const item of recipients) {
    if (!item) continue;

    if (typeof item === "object" && item.name !== undefined) {
      const contactObj = createContactObject(item);
      if (!seenIds.has(contactObj.id)) {
        seenIds.add(contactObj.id);
        result.push(contactObj);
      }
      continue;
    }

    const rawStr = String(item).trim();
    if (!rawStr) continue;

    // Check if it's a known group chat
    const matchingGroupChat = knownChats.find(
      (c) =>
        c.isGroup &&
        (c.name?.toLowerCase() === rawStr.toLowerCase() ||
          c.jid === rawStr ||
          c.jid?.toLowerCase() === rawStr.toLowerCase())
    );

    if (matchingGroupChat || rawStr.endsWith("@g.us")) {
      const contactObj = createContactObject({
        name: matchingGroupChat?.name || rawStr,
        jid: matchingGroupChat?.jid || rawStr,
        isGroup: true,
      });
      if (!seenIds.has(contactObj.id)) {
        seenIds.add(contactObj.id);
        result.push(contactObj);
      }
      continue;
    }

    // Check if it's an @lid string
    if (rawStr.endsWith("@lid")) {
      const cleanLid = rawStr.split("@")[0];
      const matchedContact = knownContacts.find(
        (c) => c.lid === cleanLid || c.lid === rawStr
      );
      const contactObj = createContactObject({
        phone: matchedContact?.phone || "",
        name: matchedContact?.name || rawStr,
        lid: rawStr,
        jid: matchedContact?.jid || rawStr,
        isGroup: false,
      });
      if (!seenIds.has(contactObj.id)) {
        seenIds.add(contactObj.id);
        result.push(contactObj);
      }
      continue;
    }

    const clean = cleanDigits(rawStr);
    const hasEnoughDigits = clean.length >= 7;

    if (hasEnoughDigits) {
      // Find in known contacts or chats
      const matchedContact = knownContacts.find(
        (c) => c.phone === clean || cleanDigits(c.jid) === clean || cleanDigits(c.phone) === clean
      );
      const matchedChat = knownChats.find(
        (c) => !c.isGroup && (c.phone === clean || cleanDigits(c.jid) === clean)
      );

      const resolvedName =
        matchedContact?.name ||
        (matchedChat?.name && !matchedChat.name.match(/^\+?\d+$/) ? matchedChat.name : "") ||
        formatPhoneDisplay(clean);

      const contactObj = createContactObject({
        phone: clean,
        name: resolvedName,
        lid: matchedContact?.lid || matchedChat?.lid || null,
        jid: `${clean}@s.whatsapp.net`,
        isGroup: false,
        pushName: matchedContact?.pushName || "",
      });

      if (!seenIds.has(contactObj.id)) {
        seenIds.add(contactObj.id);
        result.push(contactObj);
      }
    } else {
      // If it has letters, treat as group name or custom contact name
      const contactObj = createContactObject({
        name: rawStr,
        jid: rawStr,
        isGroup: true,
      });
      if (!seenIds.has(contactObj.id)) {
        seenIds.add(contactObj.id);
        result.push(contactObj);
      }
    }
  }

  return result;
}

/**
 * Serializes an array of Contact objects to an array of recipient strings for storage/API.
 * @param {Array<Object>} contacts
 * @returns {Array<string>}
 */
export function serializeContactsToRecipients(contacts = []) {
  if (!Array.isArray(contacts)) return [];
  return contacts
    .map((c) => {
      if (typeof c === "string") return c.trim();
      if (!c) return "";
      if (c.isGroup) return c.name || c.jid || "";
      return c.phone || c.jid || c.lid || c.name || "";
    })
    .filter(Boolean);
}

"use client";

import { useState, useEffect, useRef } from "react";
import {
  UsersIcon,
  UserIcon,
  PhoneIcon,
  PlusIcon,
  CloseIcon,
  CheckIcon,
  WarningIcon,
  SearchIcon,
} from "../Icons/WhatsAppIcons";
import {
  validatePhoneNumber,
  formatPhoneDisplay,
  createContactObject,
  parseRecipientsToContacts,
  cleanDigits,
} from "../../../lib/contacts";

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #00a884, #005c4b)",
  "linear-gradient(135deg, #3b82f6, #1d4ed8)",
  "linear-gradient(135deg, #8b5cf6, #6d28d9)",
  "linear-gradient(135deg, #f59e0b, #b45309)",
  "linear-gradient(135deg, #ec4899, #be185d)",
  "linear-gradient(135deg, #06b6d4, #0e7490)",
];

function getAvatarStyle(str = "") {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export function ContactPicker({
  value = [],
  onChange,
  chats = [],
  contacts = [],
  hash = "",
  disabled = false,
  placeholder = "Enter mobile number with country code or group name...",
  label = "ALLOWED RECIPIENTS (WHITELIST)",
  description = "Only these whitelisted mobile numbers and WhatsApp groups will trigger AI Take-Over polls.",
}) {
  // Normalize value to Contact objects
  const selectedContacts = Array.isArray(value)
    ? parseRecipientsToContacts(value, contacts, chats)
    : [];

  const [inputVal, setInputVal] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [remoteSuggestions, setRemoteSuggestions] = useState([]);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);
  const [inputValidation, setInputValidation] = useState({ isValid: false, type: "none" });

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const searchTimerRef = useRef(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Real-time input validation check
  useEffect(() => {
    const trimmed = inputVal.trim();
    if (!trimmed) {
      setInputValidation({ isValid: false, type: "none" });
      return;
    }

    const digitsOnly = cleanDigits(trimmed);
    const hasLetters = /[a-zA-Z]/.test(trimmed);

    // If input is purely digits or starts with +, validate as phone
    if (!hasLetters && digitsOnly.length > 0) {
      const res = validatePhoneNumber(trimmed);
      if (res.isValid) {
        setInputValidation({
          isValid: true,
          type: "phone",
          formatted: res.formatted,
          cleanPhone: res.cleanPhone,
        });
      } else {
        setInputValidation({
          isValid: false,
          type: "phone",
          error: res.error,
          cleanPhone: digitsOnly,
        });
      }
    } else if (hasLetters || trimmed.length > 0) {
      // Input has letters -> group name mode
      setInputValidation({
        isValid: trimmed.length >= 2,
        type: "group",
        name: trimmed,
        error: trimmed.length < 2 ? "Group name must be at least 2 characters" : undefined,
      });
    }
  }, [inputVal]);

  // Fetch remote contacts if query changes
  useEffect(() => {
    const query = inputVal.trim();
    if (!query) {
      setRemoteSuggestions([]);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(async () => {
      setIsLoadingRemote(true);
      try {
        const url = `/api/contacts?q=${encodeURIComponent(query)}&limit=10${hash ? `&hash=${hash}` : ""}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setRemoteSuggestions(data.contacts || []);
        }
      } catch {
        // Ignore search fetch errors
      } finally {
        setIsLoadingRemote(false);
      }
    }, 250);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [inputVal, hash]);

  // Build Autocomplete Suggestions List
  const suggestions = [];
  const queryLower = inputVal.trim().toLowerCase();
  const cleanQuery = cleanDigits(inputVal);
  const selectedIds = new Set(selectedContacts.map((c) => c.id.toLowerCase()));
  const selectedPhones = new Set(
    selectedContacts.map((c) => c.phone).filter(Boolean)
  );

  // 1. Matching WhatsApp Groups from chats
  const matchingGroups = chats.filter(
    (c) =>
      c.isGroup &&
      !selectedIds.has(`group-${(c.name || c.jid || "").toLowerCase().replace(/\s+/g, "-")}`) &&
      (c.name?.toLowerCase().includes(queryLower) || c.jid?.toLowerCase().includes(queryLower))
  );

  for (const g of matchingGroups) {
    suggestions.push({
      type: "group",
      id: `group-${(g.name || g.jid || "").toLowerCase().replace(/\s+/g, "-")}`,
      name: g.name || "WhatsApp Group",
      jid: g.jid,
      isGroup: true,
    });
  }

  // 2. Matching WhatsApp Contacts (from chats & contacts)
  const combinedContacts = [...contacts, ...remoteSuggestions];
  for (const c of chats) {
    if (!c.isGroup && c.phone) {
      combinedContacts.push({
        phone: c.phone,
        name: c.name,
        jid: c.jid,
        lid: c.lid,
      });
    }
  }

  const seenContactPhones = new Set();
  for (const c of combinedContacts) {
    const p = cleanDigits(c.phone || c.jid);
    if (!p || seenContactPhones.has(p) || selectedPhones.has(p)) continue;

    const nameMatch = c.name && c.name.toLowerCase().includes(queryLower);
    const phoneMatch = cleanQuery && p.includes(cleanQuery);
    const pushMatch = c.pushName && c.pushName.toLowerCase().includes(queryLower);

    if (nameMatch || phoneMatch || pushMatch) {
      seenContactPhones.add(p);
      suggestions.push({
        type: "contact",
        id: p,
        phone: p,
        name: c.name || formatPhoneDisplay(p),
        jid: c.jid || `${p}@s.whatsapp.net`,
        lid: c.lid || null,
        isGroup: false,
        pushName: c.pushName || "",
      });
    }
  }

  // 3. Quick Action: Add as new mobile number if valid
  if (inputValidation.isValid && inputValidation.type === "phone") {
    if (!selectedPhones.has(inputValidation.cleanPhone)) {
      suggestions.unshift({
        type: "create_phone",
        id: inputValidation.cleanPhone,
        phone: inputValidation.cleanPhone,
        name: formatPhoneDisplay(inputValidation.cleanPhone),
        jid: `${inputValidation.cleanPhone}@s.whatsapp.net`,
        isGroup: false,
        isNew: true,
      });
    }
  }

  // 4. Quick Action: Add as new group if valid group name
  if (inputValidation.isValid && inputValidation.type === "group") {
    const groupId = `group-${inputValidation.name.toLowerCase().replace(/\s+/g, "-")}`;
    if (!selectedIds.has(groupId)) {
      suggestions.unshift({
        type: "create_group",
        id: groupId,
        name: inputValidation.name,
        jid: inputValidation.name,
        isGroup: true,
        isNew: true,
      });
    }
  }

  // Handle adding a contact
  function addContact(contactItem) {
    if (!contactItem) return;
    const newContact = createContactObject(contactItem);

    // Check if already in list
    const alreadyExists = selectedContacts.some(
      (c) =>
        c.id === newContact.id ||
        (newContact.phone && c.phone === newContact.phone) ||
        (newContact.isGroup && c.name.toLowerCase() === newContact.name.toLowerCase())
    );

    if (!alreadyExists) {
      const nextList = [...selectedContacts, newContact];
      if (onChange) onChange(nextList);
    }

    setInputVal("");
    setIsOpen(false);
    setHighlightedIndex(0);
    inputRef.current?.focus();
  }

  // Handle removing a contact
  function removeContact(idToRemove) {
    const nextList = selectedContacts.filter((c) => c.id !== idToRemove);
    if (onChange) onChange(nextList);
  }

  // Keyboard navigation inside input
  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) => (prev + 1) % Math.max(1, suggestions.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) =>
        prev <= 0 ? Math.max(0, suggestions.length - 1) : prev - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0 && highlightedIndex < suggestions.length) {
        addContact(suggestions[highlightedIndex]);
      } else if (inputValidation.isValid) {
        if (inputValidation.type === "phone") {
          addContact({
            phone: inputValidation.cleanPhone,
            name: formatPhoneDisplay(inputValidation.cleanPhone),
            isGroup: false,
          });
        } else if (inputValidation.type === "group") {
          addContact({
            name: inputValidation.name,
            isGroup: true,
          });
        }
      }
    } else if (e.key === "Backspace" && !inputVal && selectedContacts.length > 0) {
      // Remove last chip on backspace
      removeContact(selectedContacts[selectedContacts.length - 1].id);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} style={{ display: "grid", gap: 8, width: "100%" }}>
      {/* Label and Badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--wa-text-primary)",
            letterSpacing: 0.4,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <UsersIcon size={14} color="var(--wa-text-primary)" />
          <span>{label}</span>
        </label>
        <span
          style={{
            fontSize: 11,
            color: "var(--wa-teal)",
            background: "rgba(0, 168, 132, 0.12)",
            padding: "1px 6px",
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          {selectedContacts.length} {selectedContacts.length === 1 ? "Recipient" : "Recipients"}
        </span>
      </div>

      {/* Interactive Contact Taker Box */}
      <div
        className="wa-contact-taker"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
          padding: "7px 10px",
          borderRadius: 8,
          border: isOpen
            ? "1px solid var(--wa-teal)"
            : "1px solid var(--wa-border-strong)",
          backgroundColor: "var(--wa-input-bg)",
          minHeight: 44,
          position: "relative",
          boxShadow: isOpen ? "0 0 0 2px rgba(0, 168, 132, 0.2)" : "none",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {/* Selected Contact Chips */}
        {selectedContacts.map((c) => (
          <div
            key={c.id}
            className="wa-contact-chip"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 8px",
              borderRadius: 6,
              backgroundColor: c.isGroup
                ? "rgba(0, 168, 132, 0.15)"
                : "var(--wa-card-bg)",
              border: c.isGroup
                ? "1px solid rgba(0, 168, 132, 0.3)"
                : "1px solid var(--wa-border)",
              color: "var(--wa-text-primary)",
              fontSize: 12.5,
              fontWeight: 500,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            {/* Avatar / Icon */}
            {c.isGroup ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  backgroundColor: "var(--wa-teal)",
                  color: "#ffffff",
                }}
              >
                <UsersIcon size={11} color="#ffffff" />
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: getAvatarStyle(c.name || c.phone),
                  color: "#ffffff",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {(c.name || c.phone || "U").charAt(0).toUpperCase()}
              </span>
            )}

            {/* Name and Details */}
            <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.name || c.phone}
            </span>

            {/* Group Tag */}
            {c.isGroup && (
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--wa-teal)",
                  letterSpacing: 0.3,
                }}
              >
                Group
              </span>
            )}

            {/* Phone sublabel if name is different */}
            {!c.isGroup && c.phone && c.name !== formatPhoneDisplay(c.phone) && (
              <span style={{ fontSize: 10.5, color: "var(--wa-text-muted)" }}>
                {formatPhoneDisplay(c.phone)}
              </span>
            )}

            {/* LID Tag if available */}
            {c.lid && (
              <span
                title={`WhatsApp LID: ${c.lid}`}
                style={{
                  fontSize: 9.5,
                  padding: "0 4px",
                  borderRadius: 3,
                  backgroundColor: "rgba(37, 211, 102, 0.15)",
                  color: "var(--wa-green)",
                  fontWeight: 600,
                }}
              >
                LID
              </span>
            )}

            {/* Remove button */}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeContact(c.id);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 1,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--wa-text-muted)",
                  borderRadius: "50%",
                  marginLeft: 2,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--wa-text-muted)")}
                title={`Remove ${c.name}`}
              >
                <CloseIcon size={12} color="currentColor" />
              </button>
            )}
          </div>
        ))}

        {/* Text Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedContacts.length === 0 ? placeholder : "Add more..."}
          disabled={disabled}
          style={{
            flex: 1,
            minWidth: 160,
            border: "none",
            outline: "none",
            backgroundColor: "transparent",
            fontSize: 13.5,
            color: "var(--wa-text-primary)",
            padding: "3px 4px",
          }}
        />

        {/* Real-Time Inline Validation Indicator */}
        {inputVal.trim() && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 4 }}>
            {inputValidation.isValid ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--wa-green)",
                  background: "rgba(37, 211, 102, 0.12)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                <CheckIcon size={12} color="var(--wa-green)" />
                <span>{inputValidation.type === "phone" ? "Valid Number" : "Group"}</span>
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 11,
                  color: "#f59e0b",
                  background: "rgba(245, 158, 11, 0.12)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                <WarningIcon size={11} color="#f59e0b" />
                <span>{inputValidation.error || "Invalid"}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && (suggestions.length > 0 || inputVal.trim()) && (
        <div
          className="wa-autocomplete-dropdown"
          style={{
            position: "relative",
            zIndex: 40,
            backgroundColor: "var(--wa-card-bg)",
            border: "1px solid var(--wa-border-strong)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            maxHeight: 240,
            overflowY: "auto",
            backdropFilter: "blur(20px)",
            marginTop: -2,
          }}
        >
          {suggestions.length > 0 ? (
            suggestions.map((item, idx) => {
              const isHighlighted = idx === highlightedIndex;
              const isNewOption = Boolean(item.isNew);

              return (
                <div
                  key={`${item.type}-${item.id}`}
                  onClick={() => addContact(item)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 12px",
                    cursor: "pointer",
                    backgroundColor: isHighlighted
                      ? "var(--wa-hover-bg)"
                      : "transparent",
                    borderBottom: "1px solid var(--wa-border-light)",
                    transition: "background-color 0.1s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Item Avatar / Icon */}
                    {isNewOption ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          backgroundColor: "var(--wa-teal)",
                          color: "#ffffff",
                        }}
                      >
                        <PlusIcon size={15} color="#ffffff" />
                      </span>
                    ) : item.isGroup ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          backgroundColor: "rgba(0, 168, 132, 0.18)",
                          color: "var(--wa-teal)",
                        }}
                      >
                        <UsersIcon size={15} color="var(--wa-teal)" />
                      </span>
                    ) : (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: getAvatarStyle(item.name || item.phone),
                          color: "#ffffff",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {(item.name || item.phone || "U").charAt(0).toUpperCase()}
                      </span>
                    )}

                    {/* Titles */}
                    <div>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: isNewOption ? "var(--wa-teal)" : "var(--wa-text-primary)",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>
                          {isNewOption
                            ? item.isGroup
                              ? `Add Group: "${item.name}"`
                              : `Add Mobile Number: ${formatPhoneDisplay(item.phone)}`
                            : item.name}
                        </span>
                        {item.isGroup && !isNewOption && (
                          <span
                            style={{
                              fontSize: 9.5,
                              padding: "1px 5px",
                              borderRadius: 4,
                              backgroundColor: "rgba(0, 168, 132, 0.12)",
                              color: "var(--wa-teal)",
                              fontWeight: 700,
                            }}
                          >
                            GROUP
                          </span>
                        )}
                      </div>

                      {!isNewOption && !item.isGroup && item.phone && (
                        <div style={{ fontSize: 11.5, color: "var(--wa-text-muted)" }}>
                          {formatPhoneDisplay(item.phone)}
                          {item.lid && ` • LID: ${item.lid}`}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Add action indicator */}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: isHighlighted ? "var(--wa-teal)" : "var(--wa-text-muted)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <span>Add</span>
                    <PlusIcon size={12} color="currentColor" />
                  </span>
                </div>
              );
            })
          ) : (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--wa-text-muted)" }}>
              {inputValidation.error || "Type a mobile number with country code or a group name..."}
            </div>
          )}
        </div>
      )}

      {/* Helper text */}
      <small style={{ color: "var(--wa-text-muted)", fontSize: 11.5, lineHeight: 1.3 }}>
        {description}
      </small>
    </div>
  );
}

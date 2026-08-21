/**
 * WhatsApp Markdown Message Formatter
 * 
 * Supports:
 * - Bold: *text*
 * - Italic: _text_
 * - Strikethrough: ~text~
 * - Monospace: `code`
 * - Code Block: ```multiline```
 * - Hyperlinks: URLs, www.*, wa.me/*
 * - Preserved Linebreaks: \n
 */

const URL_REGEX = /^(https?:\/\/[^\s<]+[^<.,:;"\x27)\]\s]|www\.[^\s<]+[^<.,:;"\x27)\]\s]|wa\.me\/[0-9+]+)/i;
const CODE_BLOCK_REGEX = /^```([\s\S]*?)```/;
const INLINE_CODE_REGEX = /^`([^`\n]+)`/;
const BOLD_REGEX = /^\*([^\s*](?:[\s\S]*?[^\s*])?)\*/;
const ITALIC_REGEX = /^_([^\s_](?:[\s\S]*?[^\s_])?)_/;
const STRIKE_REGEX = /^~([^\s~](?:[\s\S]*?[^\s~])?)~/;

export function parseWhatsAppText(text = "") {
  if (!text || typeof text !== "string") return [];

  function parse(input, keyPrefix = "w") {
    const nodes = [];
    let i = 0;
    let textBuffer = "";
    let k = 0;

    function flushText() {
      if (textBuffer) {
        nodes.push({ type: "text", content: textBuffer, key: `${keyPrefix}-t-${k++}` });
        textBuffer = "";
      }
    }

    while (i < input.length) {
      const remaining = input.slice(i);

      // 1. Newlines
      if (remaining.startsWith("\n")) {
        flushText();
        nodes.push({ type: "br", key: `${keyPrefix}-br-${k++}` });
        i += 1;
        continue;
      }

      // 2. Multiline Code Block: ```...```
      const cbMatch = remaining.match(CODE_BLOCK_REGEX);
      if (cbMatch) {
        flushText();
        nodes.push({ type: "codeblock", content: cbMatch[1], key: `${keyPrefix}-cb-${k++}` });
        i += cbMatch[0].length;
        continue;
      }

      // 3. Inline Code: `...`
      const icMatch = remaining.match(INLINE_CODE_REGEX);
      if (icMatch) {
        flushText();
        nodes.push({ type: "code", content: icMatch[1], key: `${keyPrefix}-c-${k++}` });
        i += icMatch[0].length;
        continue;
      }

      // 4. URL / Link
      const urlMatch = remaining.match(URL_REGEX);
      if (urlMatch) {
        flushText();
        const rawUrl = urlMatch[1];
        let href = rawUrl;
        if (rawUrl.startsWith("www.")) href = "https://" + rawUrl;
        else if (rawUrl.startsWith("wa.me")) href = "https://" + rawUrl;
        nodes.push({ type: "link", href, text: rawUrl, key: `${keyPrefix}-a-${k++}` });
        i += rawUrl.length;
        continue;
      }

      // 5. Bold: *...*
      const prevChar = i > 0 ? input[i - 1] : " ";
      const isWordBoundary = /[\s\p{P}]/u.test(prevChar);

      if (isWordBoundary && remaining.startsWith("*")) {
        const bMatch = remaining.match(BOLD_REGEX);
        if (bMatch) {
          const nextChar = remaining[bMatch[0].length] || " ";
          if (/[\s\p{P}]/u.test(nextChar)) {
            flushText();
            nodes.push({
              type: "bold",
              children: parse(bMatch[1], `${keyPrefix}-b-${k++}`),
              key: `${keyPrefix}-b-${k++}`,
            });
            i += bMatch[0].length;
            continue;
          }
        }
      }

      // 6. Italic: _..._
      if (isWordBoundary && remaining.startsWith("_")) {
        const itMatch = remaining.match(ITALIC_REGEX);
        if (itMatch) {
          const nextChar = remaining[itMatch[0].length] || " ";
          if (/[\s\p{P}]/u.test(nextChar)) {
            flushText();
            nodes.push({
              type: "italic",
              children: parse(itMatch[1], `${keyPrefix}-i-${k++}`),
              key: `${keyPrefix}-i-${k++}`,
            });
            i += itMatch[0].length;
            continue;
          }
        }
      }

      // 7. Strikethrough: ~...~
      if (isWordBoundary && remaining.startsWith("~")) {
        const stMatch = remaining.match(STRIKE_REGEX);
        if (stMatch) {
          const nextChar = remaining[stMatch[0].length] || " ";
          if (/[\s\p{P}]/u.test(nextChar)) {
            flushText();
            nodes.push({
              type: "strike",
              children: parse(stMatch[1], `${keyPrefix}-s-${k++}`),
              key: `${keyPrefix}-s-${k++}`,
            });
            i += stMatch[0].length;
            continue;
          }
        }
      }

      // Standard character
      textBuffer += input[i];
      i += 1;
    }

    flushText();
    return nodes;
  }

  return parse(text);
}

/**
 * Strips WhatsApp markdown markup for plain text previews (e.g. in contact list / notifications)
 */
export function stripWhatsAppFormatting(text = "") {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/```([\s\S]*?)```/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*([^\s*](?:[\s\S]*?[^\s*])?)\*/g, "$1")
    .replace(/_([^\s_](?:[\s\S]*?[^\s_])?)_/g, "$1")
    .replace(/~([^\s~](?:[\s\S]*?[^\s~])?)~/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
}

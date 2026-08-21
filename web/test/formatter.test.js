import test from "node:test";
import assert from "node:assert/strict";
import { parseWhatsAppText, stripWhatsAppFormatting } from "../lib/formatter.js";

test("WhatsApp Message Formatter Unit Tests", async (t) => {
  await t.test("handles empty and null inputs safely", () => {
    assert.deepEqual(parseWhatsAppText(""), []);
    assert.deepEqual(parseWhatsAppText(null), []);
    assert.deepEqual(parseWhatsAppText(undefined), []);
    assert.equal(stripWhatsAppFormatting(""), "");
    assert.equal(stripWhatsAppFormatting(null), "");
  });

  await t.test("parses WhatsApp bold formatting (*text*)", () => {
    const nodes = parseWhatsAppText("Hello *World* test");
    const boldNode = nodes.find((n) => n.type === "bold");
    assert.ok(boldNode);
    assert.equal(boldNode.children[0].content, "World");

    // The user's verification example:
    const sample = "*WhatsApp AI Take-Over Verification Code*\n\nYour login verification code is: *152956*";
    const sampleNodes = parseWhatsAppText(sample);
    const boldNodes = sampleNodes.filter((n) => n.type === "bold");
    assert.equal(boldNodes.length, 2);
    assert.equal(boldNodes[0].children[0].content, "WhatsApp AI Take-Over Verification Code");
    assert.equal(boldNodes[1].children[0].content, "152956");
  });

  await t.test("parses WhatsApp italic formatting (_text_)", () => {
    const nodes = parseWhatsAppText("This is _important_ note");
    const italicNode = nodes.find((n) => n.type === "italic");
    assert.ok(italicNode);
    assert.equal(italicNode.children[0].content, "important");
  });

  await t.test("parses WhatsApp strikethrough formatting (~text~)", () => {
    const nodes = parseWhatsAppText("This is ~deprecated~ updated");
    const strikeNode = nodes.find((n) => n.type === "strike");
    assert.ok(strikeNode);
    assert.equal(strikeNode.children[0].content, "deprecated");
  });

  await t.test("parses inline code (`code`) and code blocks (```block```)", () => {
    const inlineNodes = parseWhatsAppText("Run `npm test` now");
    const codeNode = inlineNodes.find((n) => n.type === "code");
    assert.ok(codeNode);
    assert.equal(codeNode.content, "npm test");

    const blockNodes = parseWhatsAppText("```\nconst x = 10;\n```");
    const blockNode = blockNodes.find((n) => n.type === "codeblock");
    assert.ok(blockNode);
    assert.equal(blockNode.content, "\nconst x = 10;\n");
  });

  await t.test("parses URLs and wa.me links", () => {
    const nodes = parseWhatsAppText("Visit https://google.com or wa.me/+917060410033 and www.example.com");
    const links = nodes.filter((n) => n.type === "link");
    assert.equal(links.length, 3);
    assert.equal(links[0].href, "https://google.com");
    assert.equal(links[1].href, "https://wa.me/+917060410033");
    assert.equal(links[2].href, "https://www.example.com");
  });

  await t.test("preserves newlines as <br /> nodes", () => {
    const nodes = parseWhatsAppText("Line 1\nLine 2\n\nLine 3");
    const brs = nodes.filter((n) => n.type === "br");
    assert.equal(brs.length, 3);
  });

  await t.test("stripWhatsAppFormatting strips all markup for clean previews", () => {
    const text = "*WhatsApp AI Code*\n\nYour code is: *123456*\n\n_Valid for 10m_ ~expired~ `code`";
    const stripped = stripWhatsAppFormatting(text);
    assert.equal(stripped, "WhatsApp AI Code Your code is: 123456 Valid for 10m expired code");
  });
});

"use client";

import React from "react";
import { parseWhatsAppText } from "../../../lib/formatter.js";

function renderNodes(nodes) {
  if (!Array.isArray(nodes)) return null;

  return nodes.map((node) => {
    switch (node.type) {
      case "bold":
        return <strong key={node.key}>{renderNodes(node.children)}</strong>;
      case "italic":
        return <em key={node.key}>{renderNodes(node.children)}</em>;
      case "strike":
        return <del key={node.key}>{renderNodes(node.children)}</del>;
      case "code":
        return (
          <code key={node.key} className="wa-inline-code">
            {node.content}
          </code>
        );
      case "codeblock":
        return (
          <pre key={node.key} className="wa-code-block">
            <code>{node.content}</code>
          </pre>
        );
      case "link":
        return (
          <a
            key={node.key}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="wa-message-link"
          >
            {node.text}
          </a>
        );
      case "br":
        return <br key={node.key} />;
      case "text":
      default:
        return node.content;
    }
  });
}

export function FormattedMessage({ text = "", className = "" }) {
  if (!text) return null;
  const nodes = parseWhatsAppText(text);

  return (
    <span className={`wa-formatted-text ${className}`.trim()}>
      {renderNodes(nodes)}
    </span>
  );
}

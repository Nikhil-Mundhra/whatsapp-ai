# Agent Guidelines for WhatsApp AI Take-Over

This document defines core conventions, constraints, and architecture guidelines for AI agents working in this repository.

---

## 1. Strict Iconography Rule: No Emojis

- **No emoji use is allowed anywhere in the user interface, components, notifications, or code.**
- **Always use clean, crisp SVG icons** if visual indicators or icons are needed.
- Utilize the centralized icon component library located at `web/app/components/Icons/WhatsAppIcons.jsx` or define semantic inline SVGs with standard `stroke`, `fill`, and `viewBox` properties.

---

## 2. UI & Design System

- **Visual Theme**: "Emerald Glass & Atmospheric Cyber-WhatsApp".
  - Frosted glass cards (`backdrop-filter: blur(24px)`).
  - Ambient floating background orbs and subtle grid textures.
  - Palette based on WhatsApp Emerald (`#00a884`), Mint (`#25d366`), Deep Night (`#0b141a` / `#111b21`), and Light Mint/Slate (`#eae6df` / `#ffffff`).
- **Dark & Light Mode**:
  - All new pages and components must support full Dark & Light mode using CSS variables (`--wa-card-bg`, `--wa-text-primary`, `--wa-border`, etc.) controlled by the `data-theme` attribute.
- **Form Controls**:
  - Interactive discrete PIN inputs for OTPs.
  - Monospaced 6-character connection code fields with auto-uppercase formatting.

---

## 3. Security & Multi-Tenant Architecture

- **Session Ownership**:
  - Each WhatsApp connection is identified by a unique 6-character uppercase hash.
  - Log in and settings updates require WhatsApp 2FA OTP verification delivered to the owner's WhatsApp number.
- **Secrets Management**:
  - AI API keys and tenant configurations are stored encrypted in Vercel KV / Redis.
  - Sensitive credentials must never be returned in full to client bundles.

---

## 4. Testing & Quality Verification

- Always run `npm run build` and `npm run test` inside `web/` before completing tasks to guarantee 0 build errors and passing test suites.

# WhatsApp AI & TakeOver System

An autonomous, self-hosted WhatsApp AI texting companion and [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that mirrors your personal texting persona with **multi-channel permission gating** (Native WhatsApp Polls, Zepp OS Smartwatch, and Web Dashboard).

---

## Highlights

* **Persona & Style Mimicking**: Uses local LLMs (via Ollama or OpenAI-compatible APIs like `qwen3.5-32k`, Gemini, OpenRouter) trained on your chat history to mirror your tone, sentence length, capitalization, slang, and emojis.
* **Smart Semantic Search & Memory Retrieval**: Groups past conversations into vector memory chunks (Gemini / OpenAI embeddings / fast local) and retrieves top-matching historical context, facts, and inside jokes while strictly filtering out conversational noise, duplicate recency, and low-signal fillers.
* **Human Contact Name Resolution**: Automatically resolves internal WhatsApp Linked IDs (LIDs) and phone numbers to clean contact names (e.g. `From: Neha:` instead of `From: 214572824805466:`).
* **Adaptive Thinking Engine**: Automatically toggles between **Fast Mode** (quick 1-liner replies) and **Deep Thinking Mode** (contextual multi-step reasoning) based on incoming message complexity.
* **Complete Web Client & Chat Timeline**: Rich web interface with WhatsApp styling, live message streaming, read receipts, interactive TakeOver cards, and per-contact relationship & persona prompt tuning.
* **Multi-Channel Approval Gating**:
  * **Native WhatsApp Polls**: Get an interactive poll on your phone (`Send 1 text`, `5 minutes`, `2 hours`, `Deny`).
  * **Zepp OS Smartwatch App**: Enter your pairing code and approve/deny requests right from your wrist (Amazfit T-Rex 3 / Zepp OS 4.0).
  * **Next.js Web Control Panel**: Cloud relay and web dashboard backed by Vercel KV / Redis with 2FA WhatsApp OTP verification.
* **Superadmin Control Plane (`/superadmin`)**: Master dashboard with 2-Factor Authentication, global user telemetry, storage footprint tracking, dynamic VIP coupon rotation, and remote bridge tenant lifecycle controls.
* **Automatic Human Override**: Picking up your phone and manually texting an allowed contact immediately revokes the AI's grant and sends you a confirmation notification.
* **Full Model Context Protocol (MCP) Server**: Provides standardized tools for Claude Desktop, Cursor, and other agent frameworks to read chats, download media, search contacts, and send messages.

---

## User Onboarding & Pairing Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Browser)
    participant Web as Next.js Web App (/setup)
    participant KV as Vercel KV / Redis
    participant Bridge as WhatsApp Bridge
    actor Watch as Smartwatch (Zepp OS)

    User->>Web: Opens https://whatsapp-ai-nikhil.vercel.app/setup
    User->>Web: Submits 3 Keys (Owner Phone, Allowed Contacts, AI Key) + VIP Coupon
    Web->>Web: Verifies single-use VIP coupon (Contact wa.me/+917060410033)
    Web->>KV: Saves connection & generates 6-character Hash (e.g. "K9X2P4")
    Web->>Bridge: Provisions WhatsApp Web pairing QR
    Web-->>User: Displays WhatsApp QR code on screen
    User->>Bridge: Scans QR with WhatsApp on mobile phone
    Bridge-->>Web: Authentication verified & linked
    Web-->>User: Step 3: Displays pairing hash: [ K 9 X 2 P 4 ]
    User->>Watch: Downloads "TakeOver" on Zepp and enters Hash
    Watch->>Web: Syncs polls using Hash
```

For a comprehensive walkthrough of the onboarding architecture, see [docs/ONBOARDING_FLOW.md](./docs/ONBOARDING_FLOW.md).

---

## Architecture Overview

```mermaid
flowchart TB
    subgraph EdgeTier["Edge & Client Tier"]
        Contact[Allowed Contact]
        OwnerPhone[Owner WhatsApp Mobile]
        ZeppWatch["Zepp OS Watch App<br/>(Amazfit T-Rex 3)"]
        WebClient["Next.js Web Client<br/>(Chat Timeline & TakeOver Cards)"]
    end

    subgraph SuperadminTier["Superadmin Control Plane"]
        SuperadminDash["Superadmin Dashboard (/superadmin)<br/>2FA WhatsApp OTP & Telemetry"]
    end

    subgraph CloudRelay["Cloud Relay & Provisioning"]
        WebRelay["Next.js App Router API (/api/*)<br/>Vercel KV + Blob Storage"]
    end

    subgraph CoreEngine["Local / Remote Bridge Core"]
        Bridge["Go WhatsApp Bridge<br/>(whatsmeow + SQLite)"]
        Controller["Python Harness Controller<br/>(harness/controller.py)"]
        Generator["Persona Generator<br/>(harness/send.py)"]
        Ollama["LLM Engine<br/>(Ollama / OpenRouter / Gemini)"]
        MCPServer["FastMCP Server<br/>(Claude Desktop / Cursor)"]
    end

    Contact <-->|Incoming / Outgoing Text| Bridge
    Bridge <-->|Store / Query| Controller
    Controller <-->|Prompt / Draft| Generator
    Generator <-->|Inference| Ollama
    
    Bridge <-->|Interactive Poll| OwnerPhone
    Controller <-->|Sync State| WebRelay
    ZeppWatch <-->|BLE & HTTPS| WebRelay
    WebClient <-->|HTTPS REST| WebRelay
    SuperadminDash <-->|Admin RPCs & Telemetry| WebRelay
    WebRelay <-->|Bridge Management| Bridge
```

For full technical specifications, database schemas, and protocol details, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Repository Structure

```
.
├── harness/                  # AI Controller & Persona Texting Harness
│   ├── controller.py         # Real-time message watcher & permission manager
│   ├── send.py               # Persona generator, floor control & Ollama/OpenRouter client
│   └── controller_state.json # Runtime state machine file
├── whatsapp-bridge/          # Go Bridge (WhatsApp Multi-Device API)
│   ├── main.go               # whatsmeow client, SQLite storage & HTTP server
│   ├── multitenant.go        # Multi-tenant manager, watchdog & tenant provisioning
│   ├── tenant_server.go      # REST endpoints for tenant lifecycle, chat settings & QR
│   ├── tenant_ai.go          # Direct AI auto-reply engine (Gemini / OpenRouter)
│   ├── semantic.go           # Vector embeddings, memory chunking & anti-garbage filters
│   └── store/                # Local SQLite databases (messages.db, whatsapp.db)
├── whatsapp-mcp-server/      # FastMCP Python Server
│   ├── main.py               # MCP Tool definitions (Claude / Cursor interface)
│   ├── whatsapp.py           # Python DB & API client for WhatsApp bridge
│   └── audio.py              # Audio / voice note transcoding utilities
├── zepp/                     # Smartwatch Frontend (Zepp OS 4.0 / Amazfit)
│   ├── app.json              # Zepp OS app manifest (T-Rex 3 target)
│   ├── page/                 # Watch UI & tactile layout (480x480 round AMOLED)
│   └── app-side/             # Phone-side companion service (ZML BLE bridge)
├── web/                      # Cloud Relay & Web Control Panel
│   ├── app/                  # Next.js App Router (UI & API routes)
│   ├── app/page.jsx          # Live Web Client Chat & TakeOver Dashboard
│   ├── app/setup/            # 3-Step Web Setup & Pairing Portal
│   ├── app/superadmin/       # Superadmin Control Plane Dashboard & 2FA Login
│   ├── lib/connections.js    # Multi-connection & 2FA WhatsApp OTP management
│   ├── lib/superadmin.js     # Superadmin authentication & global telemetry
│   ├── lib/jwt.js            # Cryptographic HS256 JWT auth implementation
│   └── lib/polls.js          # Vercel KV / Redis poll state management
├── docs/                     # Detailed architectural & setup documentation
│   └── ONBOARDING_FLOW.md    # Step-by-step connection & pairing guide
├── opencode.json             # Model configuration (OpenAI-compatible / Ollama)
├── ARCHITECTURE.md           # Deep architectural specification
└── README.md
```

---

## Quick Start

### 1. Prerequisites

* **Go** (1.21+)
* **Python** (3.10+) and [**uv**](https://astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
* **Node.js** (18+)
* **Ollama** running locally (`ollama pull qwen3.5-32k`) or an OpenAI-compatible API key
* **FFmpeg** *(optional, for WhatsApp voice audio note transcoding)*

---

### 2. Environment Configuration

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Configure your numbers (country code without `+`):

```env
# Your personal phone number that receives approval polls
OWNER_PHONE=91XXXXXXXXXX

# Comma-separated list of contact numbers permitted for AI take-over
ALLOWED_RECIPIENTS=91XXXXXXXXXX,14155550199
```

---

### 3. Start the WhatsApp Bridge

```bash
cd whatsapp-bridge
go run main.go
```

* On first run, a **QR code** will appear in your terminal (or via the `/setup` web portal).
* Open WhatsApp on your phone -> **Linked Devices** -> **Link a Device** and scan the QR code.
* The bridge connects via `whatsmeow`, starts syncing messages to `store/messages.db`, and exposes local HTTP endpoints on port `8080`.

---

### 4. Run the AI Take-Over Controller

From the repository root:

```bash
uv run harness/controller.py --interval 2.0 --model qwen3.5-32k
```

**How it operates**:
1. Monitors incoming texts from numbers in `ALLOWED_RECIPIENTS`.
2. When a text arrives, sends a WhatsApp poll to `OWNER_PHONE`.
3. When you vote (`Send 1 text`, `5 minutes`, or `2 hours`), it generates and sends human-like replies mirroring your texting habits.
4. If you text the contact directly from your phone, it immediately aborts autonomy.

You can also run one-off drafts directly:

```bash
# Draft a reply without sending
uv run harness/send.py 91XXXXXXXXXX --draft-only

# Generate and send a reply directly
uv run harness/send.py 91XXXXXXXXXX --model qwen3.5-32k
```

---

### 5. Web Onboarding & Smartwatch Setup Flow

1. **Start the Next.js Web App**:
   ```bash
   cd web
   npm install
   npm run dev
   ```
2. **Access Setup**: Open `http://localhost:3000/setup` in your browser.
3. **Enter Details & Coupon**:
   * Supply `OWNER_PHONE`, `ALLOWED_RECIPIENTS`, and `AI_API_KEY`.
   * Enter your access coupon (Contact [wa.me/+917060410033](https://wa.me/+917060410033) for a coupon).
4. **Scan WhatsApp QR**: Scan the on-screen QR code to authenticate the bridge session.
5. **Get Pairing Hash**: Copy the 6-character pairing code (e.g. `K9X2P4`).
6. **Pair Smartwatch**:
   * Open the **TakeOver** app on your Amazfit smartwatch (Zepp OS 4.0).
   * Enter the 6-character pairing code to link your watch directly to your take-over polls.

---

## Connecting to Claude Desktop / Cursor (MCP)

To use WhatsApp as a Model Context Protocol tool in Claude Desktop or Cursor:

Add to `claude_desktop_config.json` or `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "uv",
      "args": [
        "--directory",
        "/ABSOLUTE/PATH/TO/whatsapp-mcp/whatsapp-mcp-server",
        "run",
        "main.py"
      ]
    }
  }
}
```

### Available MCP Tools:
* `list_messages`: Search messages with date range, query, and context filters.
* `list_chats` / `get_chat`: Query active chats and metadata.
* `search_contacts`: Find contacts by name or number.
* `send_message`: Send messages to phone numbers or group JIDs.
* `send_file` / `send_audio_message`: Send images, videos, documents, or voice notes.
* `download_media`: Download media files from messages locally.

---

## Security & Privacy

* **Local-First & Scoped**: All WhatsApp credentials and SQLite databases remain strictly on your local infrastructure.
* **Granular Whitelist**: The AI controller will **never** interact with contacts outside `ALLOWED_RECIPIENTS`.
* **Explicit Grants**: The AI will never send a message without an active, explicit grant from you.
* **Instant Revocation**: Any manual interaction on your phone instantly terminates AI autonomy.

---

## License

This project is licensed under the [MIT License](./LICENSE).


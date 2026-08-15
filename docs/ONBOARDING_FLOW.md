# Connection Setup & Smartwatch Onboarding Flow

This guide outlines the end-to-end user journey for setting up a connection, linking WhatsApp, and pairing a Zepp OS smartwatch.

---

## 📋 Overview of the Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Browser)
    participant Web as Vercel Web App (/setup)
    participant KV as Vercel KV / Redis
    participant Bridge as WhatsApp Bridge
    actor Phone as WhatsApp Mobile App
    actor Watch as Smartwatch (Zepp OS)

    Note over User, Web: Step 1: Connection & Coupon Verification
    User->>Web: Opens https://<your-project>.vercel.app/setup
    User->>Web: Enters 3 Keys (Owner Phone, Allowed Recipients, AI Key) + Coupon
    Web->>Web: Verifies Coupon against process.env.COUPON
    alt Invalid Coupon
        Web-->>User: 403: "Contact wa.me/+917060410033 to get one."
    else Valid Coupon
        Web->>KV: Saves conn:{HASH} (Status: "configuring")
        Web-->>User: Generates 6-Char Hash (e.g. "K9X2P4") & advances to Step 2
    end

    Note over User, Phone: Step 2: WhatsApp Web Sync
    Web->>Bridge: POST /api/connections/:hash/qr
    Bridge-->>Web: Returns pairing QR code string
    Web-->>User: Renders QR in browser
    User->>Phone: WhatsApp > Linked Devices > Link a Device
    Phone->>Web: Scans QR code
    loop Status Polling (Every 2s)
        Web->>Bridge: GET /api/connections/:hash/status
        Bridge-->>Web: { linked: true }
    end
    Web->>KV: Updates conn:{HASH} (Status: "linked")
    Web-->>User: Advances to Step 3

    Note over User, Watch: Step 3: Zepp Smartwatch Pairing
    Web-->>User: Displays Pairing Code: [ K 9 X 2 P 4 ]
    User->>Watch: Downloads & opens "TakeOver" app on Amazfit watch
    User->>Watch: Enters 6-character Hash
    Watch->>Web: Queries /api/polls/pending?hash=K9X2P4
    Web-->>Watch: Returns active polls scoped to user connection
```

---

## 🛠️ Step-by-Step Breakdown

### Step 1: Setting up Connection Details

Users visit the web setup portal (`/setup`) and submit the following required values:

1. **`OWNER_PHONE`**: The owner's WhatsApp number (country code, no symbols, e.g. `917060410033`). Receives WhatsApp polls and notifications.
2. **`ALLOWED_RECIPIENTS`**: Comma-separated list of contacts the AI is allowed to interact with.
3. **`AI_API_KEY`**: API key for LLM generation (e.g., OpenAI, Ollama proxy, or compatible provider).
4. **`COUPON`**: An access coupon code.
   * If the coupon is invalid or missing, the interface prompts the user:
   * 💬 *"Invalid coupon. Contact [wa.me/+917060410033](https://wa.me/+917060410033) to get one."*

Upon successful validation, the backend generates an unambiguous 6-character hash (e.g. `K9X2P4`) using the uppercase base-32 alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).

---

### Step 2: WhatsApp Web Multi-Device Pairing

1. The frontend initiates a QR provisioning request to `POST /api/connections/:hash/qr`.
2. The Go Bridge generates a WhatsApp Web pairing session and returns the QR code string.
3. The user opens WhatsApp on their mobile phone:
   * Navigate to **Settings** $\rightarrow$ **Linked Devices** $\rightarrow$ **Link a Device**.
   * Scan the QR code displayed on the screen.
4. The web app polls `GET /api/connections/:hash/status` every 2 seconds until the device authentication handshake is finalized.

---

### Step 3: Smartwatch Pairing via Zepp OS

1. The web setup screen confirms the link and prominently presents the **6-character hash**.
2. The user installs the **TakeOver** application on their Amazfit smartwatch via the Zepp App.
3. In the Zepp App / Watch Settings:
   * Enter the 6-character hash code.
4. The watch companion service stores the hash locally and scopes all poll queries and vote dispatches to that user's session:
   * `GET /api/polls/pending?hash=K9X2P4`
   * `POST /api/polls/:id { option: "5 minutes", source: "watch", hash: "K9X2P4" }`

---

## 🔒 Security & Session Scoping

* **No Plaintext API Keys on Devices**: The AI API key and sensitive credentials remain secured in the server-side KV store. The watch only requires the public session hash.
* **Granular Whitelist Enforcement**: The controller strictly verifies incoming chats against `ALLOWED_RECIPIENTS` registered to the connection.
* **Instant Revocation**: If the owner texts the contact manually from WhatsApp, the grant is instantly invalidated across all platforms (WhatsApp, Web, Watch).

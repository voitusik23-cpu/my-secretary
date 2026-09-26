# Secure Remote Access & Local HTTPS Guide
**Мой Секретарь (Secretary AI)**
**Security & Access Specification for iOS, macOS, and Remote Clients**

---

## 1. Why HTTPS is Strictly Mandatory

Modern web browsers — and **Apple Safari / iOS WebKit in particular** — enforce strict security standards around hardware device access:

1. **Web Speech API (`webkitSpeechRecognition`):** Voice recognition will **fail completely** if the web application is loaded over insecure HTTP (`http://192.168.x.x:8000`). iOS only recognizes `localhost` and `https://` as **Secure Contexts**.
2. **Microphone Access (`navigator.mediaDevices.getUserMedia`):** Safari will refuse to show the microphone permission dialog on plain HTTP IP addresses.
3. **PWA Service Worker & Offline Sync:** Progressive Web Apps require HTTPS to register Service Workers (`sw.js`) and cache application shells.

To use voice input from your iPhone or iPad seamlessly, you must serve Secretary AI over **HTTPS**.

---

## 2. Option A: Cloudflare Tunnel (Recommended)

**Cloudflare Tunnel (`cloudflared`)** is the fastest, safest, and most reliable method to access Secretary AI remotely from anywhere in the world.

### Advantages:
- 🔒 **Zero Open Ports:** No router port-forwarding, no DDNS, works even behind mobile carrier CGNAT or home NAT.
- ⚡ **Instant Valid SSL:** Cloudflare automatically provides trusted wildcard SSL certificates recognized by iOS.
- 🛡️ **Zero Trust Protection:** You can add email one-time pin (OTP) or Google OAuth login in front of your secretary using Cloudflare Access.

---

### Method 1: Instant Quick Tunnel (Test in 30 Seconds)

If you have Homebrew installed on your Mac:

```bash
# 1. Install cloudflared CLI
brew install cloudflared

# 2. Launch an instant tunnel pointing to Secretary AI
cloudflared tunnel --url http://localhost:8000
```

Cloudflare will output a public URL such as:
```text
https://random-words-1234.trycloudflare.com
```

1. Open this URL in **Safari on your iPhone**.
2. Tap the **Share icon** → **Add to Home Screen** (**На экран «Домой»**).
3. The PWA will install as a standalone app with full microphone and voice support!

> **Note:** Quick tunnels generate a new random URL whenever restarted. For a permanent URL, use Method 2 below.

---

### Method 2: Permanent Tunnel with Your Own Domain

If you own a domain connected to Cloudflare (e.g., `yourdomain.com`):

#### Step 1: Authenticate with Cloudflare
```bash
cloudflared tunnel login
```
This opens a browser window. Select your domain.

#### Step 2: Create a Dedicated Tunnel
```bash
cloudflared tunnel create secretary-tunnel
```
Note the generated Tunnel ID (UUID).

#### Step 3: Route Your Subdomain
```bash
cloudflared tunnel route dns secretary-tunnel secretary.yourdomain.com
```

#### Step 4: Create the Configuration File
Create `~/.cloudflared/config.yml`:
```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /Users/<your_username>/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: secretary.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
```

#### Step 5: Start as a Background Service
On macOS:
```bash
brew services start cloudflared
```
Or run directly:
```bash
cloudflared tunnel run secretary-tunnel
```

Now `https://secretary.yourdomain.com` is permanently available with automatic HTTPS renewal.

---

## 3. Option B: Local LAN HTTPS via `mkcert` (Offline/Home Wi-Fi Only)

If you only want local home network access without connecting through the internet:

### Step 1: Install `mkcert` on Mac
```bash
brew install mkcert
mkcert -install
```

### Step 2: Generate Certificates for Local IP & Hostnames
Find your Mac's local IP (e.g. `192.168.1.150` via `ipconfig getifaddr en0`):
```bash
mkcert 192.168.1.150 localhost 127.0.0.1 secretary.local
```
This generates `192.168.1.150+3.pem` (certificate) and `192.168.1.150+3-key.pem` (private key).

### Step 3: Install the Root CA on your iPhone / iPad
1. Locate your `mkcert` Root CA:
   ```bash
   mkcert -CAROOT
   ```
2. AirDrop `rootCA.pem` from Mac to iPhone.
3. On iPhone:
   - Go to **Settings** → **Profile Downloaded** → Tap **Install**.
   - Go to **Settings** → **General** → **About** → **Certificate Trust Settings**.
   - Under *Enable full trust for root certificates*, toggle **ON** for `mkcert development CA`.

### Step 4: Run Uvicorn with SSL
```bash
./venv/bin/uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --ssl-keyfile "192.168.1.150+3-key.pem" \
  --ssl-certfile "192.168.1.150+3.pem"
```
Open `https://192.168.1.150:8000` in Safari on iPhone.

---

## 4. Option C: Running Cloudflare Tunnel in Docker

If running Secretary AI in Docker, you can run `cloudflared` alongside it inside `docker-compose.yml`:

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: secretary-cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - secretary
```
*(Simply paste your Cloudflare Zero Trust Tunnel Token into `.env`).*

---

## 5. iOS Safari PWA Installation & Microphone Setup

Once your HTTPS link is ready:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Open Safari on iPhone/iPad                                │
│    Navigate to: https://secretary.yourdomain.com             │
├─────────────────────────────────────────────────────────────┤
│ 2. Tap Share Button (bottom bar)                            │
│    Scroll down and select: "Add to Home Screen"              │
│    («На экран "Домой"»)                                      │
├─────────────────────────────────────────────────────────────┤
│ 3. Open "Секретарь" App from Home Screen                    │
│    Tap the ⚙️ Settings icon in top header                   │
│    Enter your SECRET_KEY (saved safely in LocalStorage)      │
├─────────────────────────────────────────────────────────────┤
│ 4. Activate Microphone                                      │
│    Tap the 🎙️ (Microphone) button                           │
│    Safari will ask: "Allow secretary to use microphone?"    │
│    Select "Allow" («Разрешить»)                              │
└─────────────────────────────────────────────────────────────┘
```

### Microphone Troubleshooting on iOS:
- **If Safari does not prompt for microphone:**
  1. Open iPhone **Settings** → **Safari** → **Microphone** → Set to **Ask** or **Allow**.
  2. If using PWA from Home Screen: Open iPhone **Settings** → scroll down to **Секретарь** (or Safari) → ensure **Microphone** toggle is green.
  3. Ensure iOS is not in "Low Power Mode" or restrictions under **Settings** → **Screen Time** → **Content & Privacy Restrictions**.

---

## 6. Updating Apple Shortcuts for Remote HTTPS

Once your remote HTTPS URL is configured:
1. Open the **Shortcuts** app on your iPhone.
2. Edit your **Secretary Voice** or **Apple Health Sync** shortcut.
3. Replace the `URL` parameter:
   - Old: `http://192.168.1.150:8000/api/v1/...`
   - New: `https://secretary.yourdomain.com/api/v1/...`
4. Ensure Header `X-Secret-Key` is set with your `SECRET_KEY`.

Your Apple Watch and iPhone Action Button will now securely talk to Secretary AI whether you are at home, traveling, or on mobile 5G.

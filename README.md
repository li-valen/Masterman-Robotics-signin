# NFC Reader Web Interface

A modern web interface for the ACS-ACR122U NFC reader with automatic card detection.

## Features

- ✅ **Automatic Card Detection** - Continuously monitors the reader and detects cards automatically
- ✅ **Real-time Status** - See card information immediately when placed on reader
- ✅ **All Operations** - Get UID, card info, firmware version, mute/unmute, load keys, read sectors
- ✅ **Modern UI** - Clean, responsive web interface built with Next.js and Tailwind CSS
- ✅ **Operation Log** - Track all operations with timestamps

## Setup

### Prerequisites

- Python 3.8+
- Node.js 18+
- NFC reader (ACS-ACR122U) connected to your computer

### Installation

1. **Install Python dependencies:**
```bash
pip3 install -r requirements.txt
```

2. **Install Node.js dependencies:**
```bash
npm install
```

## Running the Application

### Step 1: Start the Backend Server

In one terminal:
```bash
python3 server.py
```

The server will start on `http://localhost:5001`

### Step 2: Start the Frontend

In another terminal:
```bash
npm run dev
```

The web interface will be available at `http://localhost:3000`

### Configuring the API base URL

The frontend talks to the backend through the `NEXT_PUBLIC_API_URL` environment variable. By default it falls back to `http://localhost:5001/api`, but you can override it:

```bash
export NEXT_PUBLIC_API_URL=http://YOUR_BACKEND_HOST:5001/api
npm run dev
```

This is especially useful when the backend runs on another machine (e.g., Raspberry Pi) or behind a public tunnel.

## Deploying the Frontend on Vercel

1. Push this repo to GitHub.
2. In Vercel, create a new project and import the repo.
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_API_URL = https://your-backend-domain/api` (or your Cloudflare Tunnel URL).
4. Deploy. All traffic from the Vercel app will hit your backend via that URL.

**Important notes about `NEXT_PUBLIC_API_URL` and Vercel**

- The `NEXT_PUBLIC_API_URL` environment variable is exposed to browser code (client-side).
- On Vercel, add `NEXT_PUBLIC_API_URL` in the Project → Settings → Environment Variables so the deployed frontend knows where to send API requests.
 - Set the value to the public URL of your backend (for example: `https://my-backend.example.com/api`). If you're using a Cloudflare Tunnel for a local backend during demos, set the value to the tunnel's base URL (e.g. `https://nfc.yourdomain.com`) — the frontend will append `/api` automatically if needed.
 - Remember: Vercel deployments are remote. If you set `NEXT_PUBLIC_API_URL` to a URL that points to your local machine (for example an ephemeral tunnel), your Vercel deployment can reach your local backend only while your local machine and the tunnel process are running.

## Environment variables (summary)

- `NEXT_PUBLIC_API_URL` — Recommended for frontend (Vercel). Example values:
   - Local backend: `http://localhost:5001`
   - Cloudflare Tunnel (stable subdomain): `https://nfc.yourdomain.com`
   - Production backend: `https://your-domain.com`

When exposing your local backend publicly we recommend Cloudflare Tunnel (`cloudflared`) for a stable hostname without router configuration; set `NEXT_PUBLIC_API_URL` to the routed subdomain.

## Optional: Remote sync from local backend

If you want the laptop running the backend to push attendance to a persistent remote endpoint (so others can view the
data after that laptop is turned off), the backend can POST each day's attendance to a configured URL.

Environment variables supported:
- `REMOTE_SAVE_URL` — a public HTTPS endpoint that accepts POST with a JSON payload like `{ "date": "2025-11-17", "attendance": { ... } }`.
- `REMOTE_SAVE_TOKEN` — optional bearer token sent as `Authorization: Bearer <token>`.

The server will attempt a fire-and-forget POST whenever a sign-in or sign-out is recorded. The feature is disabled when
`REMOTE_SAVE_URL` is not set.

Example usage: create a small server (or Vercel Serverless function) that accepts the payload and persists it to a
database or storage bucket; then set `REMOTE_SAVE_URL` on the laptop running the backend so scans are mirrored remotely.

### Quick setup: Vercel receiver (stores attendance in a GitHub Gist)

If you don't want to manage a database, the included Vercel endpoint `POST /api/receive-attendance` stores the posted
attendance JSON into a private GitHub Gist. To use it:

1. Create a GitHub Personal Access Token with the `gist` scope.
2. In your Vercel project, set the following Environment Variables:
   - `RECEIVER_SECRET` — pick a random secret string (e.g. long UUID).
   - `GITHUB_TOKEN` — the GitHub PAT from step 1.
   - (optional) `GIST_ID` — an existing gist id to update instead of creating a new one.
3. Deploy this repository to Vercel (the API route is already included at `app/api/receive-attendance/route.ts`).
4. On the laptop running the backend, set these environment variables before starting `server.py`:
   - `REMOTE_SAVE_URL` = `https://<your-vercel-app>.vercel.app/api/receive-attendance`
   - `REMOTE_SAVE_TOKEN` = the same value as `RECEIVER_SECRET` you set in Vercel
5. Scan as usual. After each sign-in/sign-out the laptop will asynchronously POST the day's attendance to the Vercel endpoint, which writes it to the gist.

After the laptop finishes scanning and is offline, the gist persists the attendance data and can be read by the teacher's frontend or inspected directly on GitHub.

Security note: keep `GITHUB_TOKEN` and `REMOTE_SAVE_TOKEN`/`RECEIVER_SECRET` secret. Add them to Vercel's Environment Variables, not to the repo.

IMPORTANT: If you pasted your GitHub Personal Access Token into this chat (or any public place), revoke it immediately.
Go to GitHub → Settings → Developer settings → Personal access tokens and delete the exposed token, then create a new one with the `gist` scope.

### Reading persisted attendance from the deployed app

The repo includes a GET endpoint at `/api/fetch-attendance` which reads the configured `GIST_ID` using `GITHUB_TOKEN` and
returns the `attendance.json` content. To enable it, ensure `GITHUB_TOKEN` and `GIST_ID` are set in Vercel. The deployed
frontend or a teacher can call this endpoint to view the saved attendance data.

## Exposing the Backend

The Flask server must stay running on a machine that has the NFC reader attached. To let other devices reach it you have two main options:

### Option A: Cloudflare Tunnel (recommended, free for stable subdomain when you control a domain)

Cloudflare Tunnel lets you expose your local service through Cloudflare without port forwarding. See the `scripts/` helper
(`scripts/cloudflared_setup.sh`) for an automated setup that guides you through creating a named tunnel and routing DNS.

### Option B: nginx / reverse proxy (production-style)

1. Install nginx on the backend machine.
2. Create a server block that listens on 80/443 and proxies to `http://127.0.0.1:5001`.
3. Add TLS via Let’s Encrypt (Certbot).
4. Point your domain’s DNS to that machine.

Once nginx is serving `https://your-domain/api`, set `NEXT_PUBLIC_API_URL=https://your-domain/api` for both local dev and Vercel.

## Usage

1. Open `http://localhost:3000` in your browser
2. Click **"Start Detection"** to begin automatic card monitoring
3. Place an NFC card on the reader
4. The card information will be displayed automatically!

### Manual Operations

You can also manually trigger operations:
- **Get UID** - Get the card's unique identifier
- **Get Info** - Get detailed card type and protocol information
- **Firmware Version** - Get the reader's firmware version
- **Mute/Unmute** - Control the beep sound
- **Load Key** - Load an authentication key (12 hex characters)
- **Read Sector** - Read a specific sector (0-15) after loading a key

## Architecture

- **Backend**: Flask server (`server.py`) that interfaces with the NFC reader using pyscard
- **Frontend**: Next.js application with React and Tailwind CSS
- **Communication**: REST API with polling for real-time updates

## Troubleshooting

- **"No readers available"**: Make sure your NFC reader is connected and recognized by the system
- **Card not detected**: Ensure the card is properly placed on the reader
- **CORS errors**: Make sure the Flask server is running and CORS is enabled
- **Connection refused**: Verify both servers are running on the correct ports


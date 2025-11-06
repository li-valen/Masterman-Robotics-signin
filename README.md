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

The server will start on `http://localhost:5000`

### Step 2: Start the Frontend

In another terminal:
```bash
npm run dev
```

The web interface will be available at `http://localhost:3000`

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


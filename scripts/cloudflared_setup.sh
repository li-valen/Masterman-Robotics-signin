#!/usr/bin/env bash
# Helper script: Cloudflared tunnel setup (macOS / Linux)
# Usage: ./cloudflared_setup.sh your-subdomain.yourdomain.com
# This script guides you through creating a named tunnel and mapping DNS.

set -euo pipefail
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <subdomain.yourdomain.com>"
  exit 1
fi
SUBDOMAIN="$1"

echo "1) Install cloudflared (macOS): brew install cloudflared"
echo "   On Ubuntu/Debian: sudo apt-get install cloudflared (or download from Cloudflare)"

read -p "Press Enter once you have installed cloudflared..."

echo "2) Authenticate with Cloudflare (opens browser)."
cloudflared login

echo "3) Create a named tunnel (example: nfc-tunnel)"
cloudflared tunnel create nfc-tunnel

echo "4) Route DNS for the tunnel to the provided subdomain"
cloudflared tunnel route dns nfc-tunnel $SUBDOMAIN

echo "5) Create a config file (~/.cloudflared/config.yml) with content like:\n"
cat <<EOF
 tunnel: <TUNNEL-UUID-FROM-create-step>
 credentials-file: ~/.cloudflared/<TUNNEL-UUID-FROM-create-step>.json
 ingress:
   - hostname: $SUBDOMAIN
     service: http://localhost:5001
   - service: http_status:404
EOF

echo "6) Run the tunnel:"
echo "   cloudflared tunnel run nfc-tunnel"
echo "Or, for a quick run without creating a named tunnel:"
echo "   cloudflared tunnel --url http://localhost:5001"

echo "When the tunnel is running, set NEXT_PUBLIC_API_URL=https://$SUBDOMAIN in Vercel."

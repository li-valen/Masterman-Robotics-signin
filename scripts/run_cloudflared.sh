#!/usr/bin/env bash
# Quick run script for cloudflared - runs an ephemeral tunnel mapped to localhost:5001
# Useful for testing without creating DNS records. This will provide a publicly reachable URL,
# but to get a stable hostname you should use a named tunnel + DNS routing (see cloudflared_setup.sh).

set -euo pipefail
PORT=${1:-5001}

echo "Starting cloudflared to proxy http://localhost:${PORT}..."
cloudflared tunnel --url http://localhost:${PORT}

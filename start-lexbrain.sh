#!/usr/bin/env bash
# Start LexBrain with MCP support
# This script starts the LexBrain HTTP server and optionally the MCP server wrapper

set -euo pipefail

# Configuration
LEXBRAIN_PORT=${LEXBRAIN_PORT:-6901}
LEXBRAIN_DB=${LEXBRAIN_DB:-./thoughts.db}
LEXBRAIN_MODE=${LEXBRAIN_MODE:-local}
LEXBRAIN_TTL_DAYS=${LEXBRAIN_TTL_DAYS:-7}
LEXBRAIN_MAX_PAYLOAD_KB=${LEXBRAIN_MAX_PAYLOAD_KB:-256}

# Optional: ZK mode key
LEXBRAIN_KEY_HEX=${LEXBRAIN_KEY_HEX:-}

echo "Starting LexBrain server..."
echo "  Port: $LEXBRAIN_PORT"
echo "  Database: $LEXBRAIN_DB"
echo "  Mode: $LEXBRAIN_MODE"

# Start LexBrain server
export PORT=$LEXBRAIN_PORT
export LEXBRAIN_DB=$LEXBRAIN_DB
export LEXBRAIN_MODE=$LEXBRAIN_MODE
export LEXBRAIN_TTL_DAYS=$LEXBRAIN_TTL_DAYS
export LEXBRAIN_MAX_PAYLOAD_KB=$LEXBRAIN_MAX_PAYLOAD_KB

if [ -n "$LEXBRAIN_KEY_HEX" ]; then
  export LEXBRAIN_KEY_HEX=$LEXBRAIN_KEY_HEX
fi

# Start dev server
pnpm --filter lexbrain-server dev

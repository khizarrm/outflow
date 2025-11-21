#!/bin/bash
# Script to set Cloudflare Workers secrets from .dev.vars
# Usage: ./scripts/set-secrets.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEV_VARS="$PROJECT_DIR/.dev.vars"

if [ ! -f "$DEV_VARS" ]; then
    echo "Error: .dev.vars file not found at $DEV_VARS"
    exit 1
fi

echo "Setting secrets from .dev.vars..."
echo ""

# Read .dev.vars and set each secret
while IFS='=' read -r key value || [ -n "$key" ]; do
    # Skip empty lines and comments
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
    
    # Remove leading/trailing whitespace from key
    key=$(echo "$key" | xargs)
    
    # Skip BETTER_AUTH_URL as it's not a secret (it's a URL)
    if [ "$key" = "BETTER_AUTH_URL" ]; then
        echo "Skipping $key (not a secret)"
        continue
    fi
    
    if [ -n "$key" ] && [ -n "$value" ]; then
        echo "Setting secret: $key"
        echo "$value" | wrangler secret put "$key"
        echo ""
    fi
done < "$DEV_VARS"

echo "All secrets have been set!"
echo ""
echo "To verify, run: wrangler secret list"




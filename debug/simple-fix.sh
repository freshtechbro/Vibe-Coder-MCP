#!/bin/bash
set -e

echo "=== Simple Unix Fix ==="

echo "1. Testing current state..."
node isolate-issue.js

echo
echo "2. Fixing Sharp..."
npm uninstall sharp --no-save 2>/dev/null || true
npm install sharp

echo
echo "3. Rebuilding..."
npm run build

echo
echo "4. Testing again..."
node isolate-issue.js

echo
echo "5. Final test..."
timeout 3s node build/index.js 2>&1 | head -20 || echo "Server test completed"

echo "Done!"

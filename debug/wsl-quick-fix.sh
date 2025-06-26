#!/bin/bash

echo "=== WSL Quick Fix ==="
cd "/mnt/c/Users/Ascension/Claude/root/vibe-coder-mcp"

echo "1. Fix Sharp for Linux/WSL environment..."
# The error shows it's looking for sharp-linux-x64.node but can't find it
# This is because @xenova/transformers has its own Sharp dependency

echo "Removing problematic Sharp installations..."
npm uninstall sharp --no-save 2>/dev/null || true

echo "Reinstalling Sharp for Linux platform..."
npm install sharp --platform=linux --arch=x64 --ignore-scripts=false --foreground-scripts --verbose

echo
echo "2. Rebuild the application..."
npm run build

echo
echo "3. Test the ES module version..."
node isolate-issue-esm.js

echo "Done!"

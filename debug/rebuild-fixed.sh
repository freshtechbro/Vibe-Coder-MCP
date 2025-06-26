#!/bin/bash
echo "Rebuilding VibeCoder with test fix..."
cd /mnt/c/Users/Ascension/Claude/root/vibe-coder-mcp
npm run build

if [ $? -eq 0 ]; then
    echo "Build successful - test setup fixed!"
    echo "VibeCoder will now run as server instead of running tests"
    echo "Restart Claude Desktop and test VibeCoder!"
else
    echo "Build failed! Check errors above."
fi
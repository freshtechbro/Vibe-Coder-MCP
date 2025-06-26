#!/bin/bash
echo "Testing VibeCoder startup directly..."
cd /mnt/c/Users/Ascension/Claude/root/vibe-coder-mcp

echo "Running VibeCoder directly to see error..."
NODE_ENV=production LOG_LEVEL=debug node build/index.js
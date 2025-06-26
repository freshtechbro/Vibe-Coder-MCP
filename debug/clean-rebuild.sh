#!/bin/bash
echo "Cleaning and rebuilding VibeCoder..."
cd /mnt/c/Users/Ascension/Claude/root/vibe-coder-mcp

echo "Removing build directory..."
rm -rf build

echo "Removing node_modules cache..."
npm cache clean --force

echo "Installing dependencies..."
npm install

echo "Building TypeScript..."
npm run build

if [ $? -eq 0 ]; then
    echo "Clean rebuild successful!"
    echo "VibeCoder ready with my-llm-config.json"
    echo "Available models:"
    echo "- KIMI_MODEL: deepseek/deepseek-r1-0528:free (code tasks)"
    echo "- LLAMA_MODEL: meta-llama/llama-4-maverick:free (general tasks)" 
    echo "- DEEPSEEK_MODEL: deepseek/deepseek-r1-distill-llama-70b:free (reasoning tasks)"
    echo "- PERPLEXITY_MODEL: perplexity/sonar-deep-research (research)"
    echo ""
    echo "Restart Claude Desktop and test VibeCoder!"
else
    echo "Clean rebuild failed! Check errors above."
fi
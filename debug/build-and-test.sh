#!/bin/bash
echo "Building VibeCoder with updated config loader..."
cd /mnt/c/Users/Ascension/Claude/root/vibe-coder-mcp
npm run build

if [ $? -eq 0 ]; then
    echo "Build successful!"
    echo "VibeCoder now uses .env model preferences with my-llm-config.json"
    echo "Available models:"
    echo "- KIMI_MODEL: deepseek/deepseek-r1-0528:free (code tasks)"
    echo "- LLAMA_MODEL: meta-llama/llama-4-maverick:free (general tasks)" 
    echo "- DEEPSEEK_MODEL: deepseek/deepseek-r1-distill-llama-70b:free (reasoning tasks)"
    echo "- PERPLEXITY_MODEL: perplexity/sonar-deep-research (research)"
    echo ""
    echo "To change models: Edit .env file and restart Claude Desktop"
    echo "Ready to use!"
else
    echo "Build failed! Check for errors above."
    chmod +x /mnt/c/Users/Ascension/Claude/root/vibe-coder-mcp/build-and-test.sh
fi
read -p "Press any key to continue..."

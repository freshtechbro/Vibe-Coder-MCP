#!/bin/bash
set -e

echo "========================================="
echo "WSL Environment Fix for Vibe Coder MCP"
echo "========================================="

cd "/mnt/c/Users/Ascension/Claude/root/vibe-coder-mcp"

echo
echo "=== Environment Detection ==="
echo "Current environment: WSL (Windows Subsystem for Linux)"
echo "Node version: $(node --version)"
echo "Platform: $(uname -a)"

echo
echo "=== Step 1: Fix Sharp for WSL/Linux ==="
echo "Removing all Sharp installations..."
npm uninstall sharp --no-save 2>/dev/null || true

# Also check for Sharp in transformers
echo "Checking @xenova/transformers dependency..."
if npm list @xenova/transformers > /dev/null 2>&1; then
    echo "Found @xenova/transformers - this is pulling in Sharp"
    echo "Reinstalling @xenova/transformers to fix Sharp dependency..."
    npm uninstall @xenova/transformers --no-save 2>/dev/null || true
    npm install @xenova/transformers --platform=linux --arch=x64
else
    echo "@xenova/transformers not found as direct dependency"
fi

echo "Installing Sharp for Linux x64..."
npm install sharp --platform=linux --arch=x64 --verbose

echo
echo "=== Step 2: Fix ES Module Test Script ==="
cat > isolate-issue-esm.js << 'EOF'
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function isolateIssue() {
    console.log('=== WSL ES Module Issue Isolation Test ===');
    
    try {
        console.log('1. Testing path module...');
        console.log('✓ Path module loaded');
        
        console.log('2. Testing basic path operations...');
        const projectRoot = process.cwd();
        const configPath = path.join(projectRoot, 'llm_config.json');
        console.log('✓ Path operations work');
        console.log('   Project root:', projectRoot);
        console.log('   Config path:', configPath);
        
        console.log('3. Testing file-utils import...');
        const { FileUtils } = await import('./build/tools/vibe-task-manager/utils/file-utils.js');
        console.log('✓ FileUtils imported successfully');
        
        console.log('4. Testing config loading...');
        const result = await FileUtils.readJsonFile(configPath);
        console.log('Config load result:', result.success ? '✓ SUCCESS' : '✗ FAILED');
        if (!result.success) {
            console.log('   Error:', result.error);
        }
        
        console.log('5. Testing server module imports...');
        try {
            const logger = await import('./build/logger.js');
            console.log('✓ Logger imported');
        } catch (e) {
            console.log('✗ Logger failed:', e.message);
        }
        
        try {
            const { createServer } = await import('./build/server.js');
            console.log('✓ Server module imported');
        } catch (e) {
            console.log('✗ Server module failed:', e.message);
        }
        
        try {
            console.log('6. Testing sharp module specifically...');
            const sharp = await import('sharp');
            console.log('✓ Sharp module loaded successfully');
        } catch (e) {
            console.log('✗ Sharp module failed:', e.message);
            console.log('   This is likely the root cause!');
        }
        
    } catch (error) {
        console.log('✗ Test failed with error:');
        console.log('   Message:', error.message);
        console.log('   Stack:', error.stack);
    }
}

isolateIssue().catch(console.error);
EOF

echo
echo "=== Step 3: Rebuild Application ==="
npm run build

echo
echo "=== Step 4: Test with Fixed ES Module Script ==="
node isolate-issue-esm.js

echo
echo "=== Step 5: Test Server Startup ==="
echo "Testing server startup (will timeout after 5 seconds)..."
timeout 5s node build/index.js 2>&1 | head -10 || echo "Server test completed"

echo
echo "========================================="
echo "WSL Fix Complete!"
echo
echo "If the tests above passed, try:"
echo "npm start"
echo "========================================="

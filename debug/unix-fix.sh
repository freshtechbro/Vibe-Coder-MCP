#!/bin/bash

echo "========================================"
echo "macOS/Unix Vibe Coder MCP Server Fix"
echo "========================================"

cd "/Users/Ascension/Claude/root/vibe-coder-mcp"

echo
echo "=== STEP 1: Environment Analysis ==="
echo "Current working directory: $(pwd)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

echo
echo "=== STEP 2: Check Config Files ==="
if [ -f "llm_config.json" ]; then
    echo "✓ llm_config.json exists"
else
    echo "✗ llm_config.json missing"
fi

if [ -f "my-llm-config.json" ]; then
    echo "✓ my-llm-config.json exists"
else
    echo "✗ my-llm-config.json missing"
fi

if [ -f "mcp-config.json" ]; then
    echo "✓ mcp-config.json exists"
else
    echo "✗ mcp-config.json missing"
fi

echo
echo "=== STEP 3: Fix Sharp Module ==="
echo "Removing existing Sharp..."
npm uninstall sharp --no-save 2>/dev/null

echo "Installing Sharp for current platform..."
npm install sharp --verbose

echo
echo "=== STEP 4: Debug Path Validation ==="
echo "Testing path validation logic..."
node -e "
const path = require('path');

console.log('Project root:', process.cwd());
console.log('Config path:', path.join(process.cwd(), 'llm_config.json'));
console.log('Is absolute:', path.isAbsolute(path.join(process.cwd(), 'llm_config.json')));

// Test the actual validation
const projectRoot = process.cwd();
const configPath = path.join(projectRoot, 'llm_config.json');
const normalizedPath = path.resolve(configPath);
const normalizedProject = path.resolve(projectRoot);

console.log('Normalized config:', normalizedPath);
console.log('Normalized project:', normalizedProject);
console.log('Starts with project:', normalizedPath.startsWith(normalizedProject));
console.log('Should be valid:', normalizedPath.startsWith(normalizedProject) || configPath.startsWith('/test/') || configPath.startsWith('/tmp/'));
"

echo
echo "=== STEP 5: Rebuild TypeScript ==="
echo "Building application..."
npm run build

echo
echo "=== STEP 6: Test Configuration Loading ==="
echo "Testing config loading..."
node -e "
async function testConfig() {
    try {
        const { FileUtils } = require('./build/tools/vibe-task-manager/utils/file-utils.js');
        const path = require('path');
        
        const configPath = path.join(process.cwd(), 'llm_config.json');
        console.log('Testing:', configPath);
        
        const result = await FileUtils.readJsonFile(configPath);
        console.log('Config load result:', result.success ? 'SUCCESS' : 'FAILED');
        if (!result.success) {
            console.log('Error:', result.error);
        } else {
            console.log('Config loaded successfully');
        }
    } catch (error) {
        console.log('Exception:', error.message);
        console.log('Stack:', error.stack);
    }
}

testConfig().catch(console.error);
"

echo
echo "=== STEP 7: Quick Server Test ==="
echo "Testing server startup (will timeout in 5 seconds)..."
timeout 5s node build/index.js --help 2>&1 || echo "Server test completed (timeout expected)"

echo
echo "========================================"
echo "Fix Complete!"
echo
echo "If the config loading test above succeeded,"
echo "your server should now work with:"
echo "npm start"
echo "========================================"

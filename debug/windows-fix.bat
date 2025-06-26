@echo off
echo ========================================
echo Windows Fix for Claude Desktop MCP
echo ========================================

cd /d "C:\Users\Ascension\Claude\root\vibe-coder-mcp"

echo.
echo === Step 1: Fix Windows Path Validation ===
echo Updating file-utils.js for Windows...

:: Create a backup
copy build\tools\vibe-task-manager\utils\file-utils.js build\tools\vibe-task-manager\utils\file-utils.js.backup

:: Use PowerShell to fix the path validation for Windows
powershell -Command "(Get-Content 'build\tools\vibe-task-manager\utils\file-utils.js') -replace 'const normalizedPath = path\.resolve\(filePath\);', 'const normalizedPath = path.resolve(filePath).replace(/\\\\/g, \""/\");' -replace 'const normalizedProject = path\.resolve\(projectRoot\);', 'const normalizedProject = path.resolve(projectRoot).replace(/\\\\/g, \""/\");' | Set-Content 'build\tools\vibe-task-manager\utils\file-utils.js'"

echo Path validation updated for Windows.

echo.
echo === Step 2: Fix Sharp for Windows ===
echo Uninstalling existing Sharp...
npm uninstall sharp --no-save 2>nul

echo Installing Sharp for Windows x64...
npm install sharp --platform=win32 --arch=x64 --verbose

echo.
echo === Step 3: Fix @xenova/transformers Sharp ===
echo Rebuilding transformers dependencies...
npm rebuild @xenova/transformers

echo.
echo === Step 4: Test Configuration ===
echo Testing config loading...
node -e "
const { FileUtils } = require('./build/tools/vibe-task-manager/utils/file-utils.js');
const path = require('path');

async function test() {
    try {
        const configPath = path.join(process.cwd(), 'llm_config.json');
        console.log('Testing:', configPath);
        
        const result = await FileUtils.readJsonFile(configPath);
        console.log('Result:', result.success ? 'SUCCESS' : 'FAILED');
        if (!result.success) {
            console.log('Error:', result.error);
        }
    } catch (error) {
        console.log('Exception:', error.message);
    }
}
test();
"

echo.
echo ========================================
echo Windows Fix Complete!
echo.
echo Your server should now work with Claude Desktop.
echo The MCP server will restart automatically.
echo ========================================
pause

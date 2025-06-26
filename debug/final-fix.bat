@echo off
echo ========================================
echo FINAL COMPREHENSIVE FIX
echo ========================================

cd /d "C:\Users\Ascension\Claude\root\vibe-coder-mcp"

echo.
echo === STEP 1: Debug Current State ===
echo Checking path validation logic...
node debug-paths.js

echo.
echo === STEP 2: Fix Sharp Issue ===
echo Removing existing Sharp installation...
npm uninstall sharp --no-save 2>nul

echo Installing Sharp with correct binaries...
npm install sharp@latest --platform=win32 --arch=x64 --verbose --no-optional

if %ERRORLEVEL% neq 0 (
    echo Sharp installation failed, trying alternative...
    npm cache clean --force
    npm install sharp --ignore-scripts=false --foreground-scripts --verbose
)

echo.
echo === STEP 3: Rebuild Application ===
echo Compiling TypeScript with fixes...
npm run build

echo.
echo === STEP 4: Test Configuration Loading ===
echo Testing configuration loading directly...
node -e "
const { FileUtils } = require('./build/tools/vibe-task-manager/utils/file-utils.js');
const path = require('path');

async function testConfig() {
    try {
        const configPath = path.join(process.cwd(), 'llm_config.json');
        console.log('Testing config path:', configPath);
        
        const result = await FileUtils.readJsonFile(configPath);
        console.log('Config load result:', result.success ? 'SUCCESS' : 'FAILED');
        if (!result.success) {
            console.log('Error:', result.error);
        }
    } catch (error) {
        console.log('Exception:', error.message);
    }
}

testConfig();
"

echo.
echo === STEP 5: Final Server Test ===
echo Testing server startup...
timeout /t 3 /nobreak > nul

:: Try to start server with timeout
node build/index.js --help > temp_output.txt 2>&1
if %ERRORLEVEL% equ 0 (
    echo SUCCESS: Server started successfully!
) else (
    echo WARNING: Server startup test failed, checking output...
    type temp_output.txt
)

if exist temp_output.txt del temp_output.txt

echo.
echo ========================================
echo Fix Complete!
echo.
echo Your server should now work. Run:
echo npm start
echo.
echo If you still have issues, check the output above
echo for any remaining errors.
echo ========================================
pause

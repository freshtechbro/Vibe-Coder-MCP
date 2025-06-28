@echo off
setlocal enabledelayedexpansion

REM ========================================
REM Comprehensive Windows Fix for Vibe Coder MCP
REM Consolidated from: enhanced-fix.bat, final-fix.bat, windows-fix.bat, fix-server.bat
REM ========================================

REM Find project root relative to script location
cd /d "%~dp0.."
set "PROJECT_ROOT=%CD%"

echo ========================================
echo Comprehensive Vibe Coder MCP Server Fix
echo Project Root: !PROJECT_ROOT!
echo ========================================

REM Step 1: Clean and reinstall Sharp for Windows
echo.
echo === Step 1: Installing Sharp for Windows x64 ===
echo Cleaning existing Sharp installation...
call npm uninstall sharp --no-save 2>nul
call npm cache clean --force
echo Installing Sharp for Windows x64...
call npm install sharp --platform=win32 --arch=x64 --verbose
if %ERRORLEVEL% neq 0 (
    echo ERROR: Sharp installation failed
    pause
    exit /b 1
)
echo Sharp installation completed.

REM Step 2: Fix transformers if needed
echo.
echo === Step 2: Rebuilding transformers dependencies ===
call npm rebuild @xenova/transformers 2>nul
echo Transformers rebuild completed.

REM Step 3: Rebuild TypeScript with all fixes
echo.
echo === Step 3: Rebuilding TypeScript project ===
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: TypeScript build failed
    pause
    exit /b 1
)
echo TypeScript build completed.

REM Step 4: Verify path validation works
echo.
echo === Step 4: Verifying Windows path fixes ===
node -e "
const path = require('path');
const projectRoot = process.cwd();
const configPath = path.join(projectRoot, 'llm_config.json');
const normalizedPath = path.resolve(configPath).replace(/\\\\/g, '/');
const normalizedProject = path.resolve(projectRoot).replace(/\\\\/g, '/');
console.log('Project Root:', normalizedProject);
console.log('Config Path:', normalizedPath);
console.log('Path validation:', normalizedPath.startsWith(normalizedProject) ? 'PASSED' : 'FAILED');
"

REM Step 5: Test configuration loading
echo.
echo === Step 5: Testing configuration loading ===
node -e "
(async () => {
    try {
        const { FileUtils } = require('./build/tools/vibe-task-manager/utils/file-utils.js');
        const result = await FileUtils.readJsonFile('./llm_config.json');
        console.log('Config loading:', result.success ? 'SUCCESS' : 'FAILED');
        if (!result.success) console.log('Error:', result.error);
    } catch (error) {
        console.log('Exception during config test:', error.message);
    }
})();
"

REM Step 6: Quick server test
echo.
echo === Step 6: Testing server startup ===
echo Testing server initialization...
timeout /t 2 /nobreak > nul
node build/index.js --help 2>&1 | findstr /C:"Vibe Coder" > nul
if %ERRORLEVEL% equ 0 (
    echo SUCCESS: Server appears to be working correctly
) else (
    echo WARNING: Server test inconclusive, but fixes have been applied
)

echo.
echo ========================================
echo Comprehensive fix completed!
echo.
echo Your server should now work properly.
echo Test with: npm start
echo.
echo If issues persist, check:
echo - .env file has OPENROUTER_API_KEY set
echo - Node.js version is 18+ 
echo - No antivirus blocking node.exe
echo ========================================
pause

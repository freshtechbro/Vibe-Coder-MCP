@echo off
echo ========================================
echo Fixing Vibe Coder MCP Server Issues
echo ========================================

echo.
echo Step 1: Installing Sharp for Windows...
echo Installing Sharp with correct platform binaries...
cd /d "C:\Users\Ascension\Claude\root\vibe-coder-mcp"
npm install --platform=win32 --arch=x64 sharp --verbose
if %ERRORLEVEL% neq 0 (
    echo WARNING: Sharp installation failed, trying alternative approach...
    npm uninstall sharp
    npm cache clean --force
    npm install sharp --ignore-scripts=false --foreground-scripts --verbose
)

echo.
echo Step 2: Rebuilding TypeScript...
echo Compiling TypeScript files...
npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo Step 3: Testing server startup...
echo Testing if server starts without errors...
timeout /t 3 /nobreak > nul
node build/index.js --help > nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo WARNING: Server test failed, but fixes have been applied
) else (
    echo SUCCESS: Server appears to be working
)

echo.
echo ========================================
echo Fix Summary:
echo - Updated file validation to allow config files within project
echo - Attempted to install Sharp with correct platform binaries
echo - Rebuilt TypeScript code with fixes
echo ========================================

echo.
echo To test the server, run:
echo npm start
echo.
echo If issues persist, check the server.log for detailed error information.
pause

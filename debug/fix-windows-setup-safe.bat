@echo off
echo Fixing Windows setup issues...
echo.

echo 1. Checking current directory...
cd /d "C:\Users\Ascension\Claude\root\vibe-coder-mcp"
if errorlevel 1 (
    echo ERROR: Could not change to project directory
    pause
    exit /b 1
)
echo Current directory: %CD%

echo.
echo 2. Removing problematic transformers dependency...
call npm uninstall @xenova/transformers
if errorlevel 1 (
    echo WARNING: Failed to uninstall transformers, continuing...
)

echo.
echo 3. Installing Sharp for Windows platform...
call npm install --platform=win32 --arch=x64 sharp
if errorlevel 1 (
    echo ERROR: Failed to install Sharp
    pause
    exit /b 1
)

echo.
echo 4. Installing Sharp with verbose logging (if previous failed)...
call npm install --ignore-scripts=false --foreground-scripts --verbose sharp
if errorlevel 1 (
    echo WARNING: Verbose Sharp install failed, but continuing...
)

echo.
echo 5. Rebuilding project...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo Windows setup fix complete!
echo Try running the server again.
pause

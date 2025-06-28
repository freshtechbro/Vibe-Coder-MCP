@echo off
cd /d "%~dp0"
echo Building VibeCoder...
call npm run build
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)
echo Build successful!
echo.
echo Please restart Claude Desktop to apply changes.
pause
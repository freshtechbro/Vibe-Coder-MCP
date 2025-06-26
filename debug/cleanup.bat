@echo off
echo Cleaning VibeCoder MCP cache and setup...
cd /d "C:\Users\Ascension\Claude\root\vibe-coder-mcp"

echo Creating required directories...
if not exist "C:\Users\Ascension\Claude\root\filesystem" mkdir "C:\Users\Ascension\Claude\root\filesystem"
if not exist "VibeCoderOutput" mkdir "VibeCoderOutput"

echo Cleaning problematic cache files...
for /d /r %%d in (.cache) do (
    if exist "%%d" (
        echo Cleaning cache directory: %%d
        rmdir /s /q "%%d" 2>nul || echo Could not clean %%d
    )
)

echo Removing any invalid metadata files...
for /r %%f in (*metadata.json) do (
    if exist "%%f" (
        findstr /c:"# Code Map" "%%f" >nul 2>&1
        if !errorlevel! equ 0 (
            echo Removing invalid metadata file: %%f
            del "%%f" 2>nul || echo Could not delete %%f
        )
    )
)

echo Setting proper permissions...
icacls "VibeCoderOutput" /grant Everyone:(OI)(CI)F /T >nul 2>nul || echo Permissions already set or could not be set

echo Cleanup complete!
echo Now run rebuild.bat to build the project
pause

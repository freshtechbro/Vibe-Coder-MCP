Write-Host "Fixing Windows setup issues..." -ForegroundColor Green
Write-Host ""

# Change to project directory
$projectDir = "C:\Users\Ascension\Claude\root\vibe-coder-mcp"
Set-Location -Path $projectDir -ErrorAction SilentlyContinue
if ($PWD.Path -ne $projectDir) {
    Write-Host "ERROR: Could not change to project directory: $projectDir" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "Current directory: $($PWD.Path)" -ForegroundColor Cyan

Write-Host ""
Write-Host "1. Removing problematic transformers dependency..." -ForegroundColor Yellow
try {
    npm uninstall @xenova/transformers
    Write-Host "Successfully removed transformers dependency" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Failed to uninstall transformers, continuing..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "2. Installing Sharp for Windows platform..." -ForegroundColor Yellow
try {
    npm install --platform=win32 --arch=x64 sharp
    Write-Host "Successfully installed Sharp for Windows" -ForegroundColor Green
} catch {
    Write-Host "Primary Sharp install failed, trying verbose install..." -ForegroundColor Yellow
    try {
        npm install --ignore-scripts=false --foreground-scripts --verbose sharp
        Write-Host "Verbose Sharp install succeeded" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Both Sharp installation methods failed" -ForegroundColor Red
        Write-Host "You may need to install Visual Studio Build Tools" -ForegroundColor Yellow
        Read-Host "Press Enter to continue anyway"
    }
}

Write-Host ""
Write-Host "3. Rebuilding project..." -ForegroundColor Yellow
try {
    npm run build
    Write-Host "Build completed successfully" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Windows setup fix complete!" -ForegroundColor Green
Write-Host "Try running the server again." -ForegroundColor Cyan
Read-Host "Press Enter to exit"

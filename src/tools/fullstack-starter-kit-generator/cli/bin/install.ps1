# PowerShell installation script for Windows

# Check Node.js installation
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js is not installed" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org"
    exit 1
}

# Check npm installation
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: npm is not installed" -ForegroundColor Red
    Write-Host "Please install npm first"
    exit 1
}

Write-Host "Installing Fullstack Starter Kit Generator..." -ForegroundColor Blue

# Install the package globally
npm install -g @vibe-coder/fullstack-starter-kit

# Verify installation
if (Get-Command fullstack-starter-kit -ErrorAction SilentlyContinue) {
    Write-Host "Successfully installed Fullstack Starter Kit Generator!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  fullstack-starter-kit init --name my-project --template next-express"
    Write-Host "  fullstack-starter-kit init --name my-project --template smart --features typescript,react,auth"
    Write-Host ""
    Write-Host "Available templates:"
    Write-Host "  - next-express    (Next.js + Express)"
    Write-Host "  - react-nest      (React + NestJS)"
    Write-Host "  - vue-fastapi     (Vue + FastAPI)"
    Write-Host "  - svelte-hono     (SvelteKit + Hono)"
    Write-Host "  - remix-prisma    (Remix + Prisma)"
    Write-Host "  - nuxt-trpc       (Nuxt + tRPC)"
    Write-Host "  - flutter-go      (Flutter + Go)"
    Write-Host "  - next-supabase   (Next.js + Supabase)"
    Write-Host "  - smart           (AI-driven stack selection)"
    Write-Host ""
    Write-Host "For more information, visit: https://github.com/vibe-coder/fullstack-starter-kit"
} else {
    Write-Host "Installation failed. Please try again or install manually:" -ForegroundColor Red
    Write-Host "npm install -g @vibe-coder/fullstack-starter-kit"
    exit 1
}
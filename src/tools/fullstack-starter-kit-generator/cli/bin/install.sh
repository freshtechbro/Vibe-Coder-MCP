#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check Node.js installation
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js from https://nodejs.org"
    exit 1
fi

# Check npm installation
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    echo "Please install npm first"
    exit 1
fi

echo -e "${BLUE}Installing Fullstack Starter Kit Generator...${NC}"

# Install the package globally
npm install -g @vibe-coder/fullstack-starter-kit

# Verify installation
if command -v fullstack-starter-kit &> /dev/null; then
    echo -e "${GREEN}Successfully installed Fullstack Starter Kit Generator!${NC}"
    echo
    echo "Usage:"
    echo "  fullstack-starter-kit init --name my-project --template next-express"
    echo "  fullstack-starter-kit init --name my-project --template smart --features typescript,react,auth"
    echo
    echo "Available templates:"
    echo "  - next-express    (Next.js + Express)"
    echo "  - react-nest      (React + NestJS)"
    echo "  - vue-fastapi     (Vue + FastAPI)"
    echo "  - svelte-hono     (SvelteKit + Hono)"
    echo "  - remix-prisma    (Remix + Prisma)"
    echo "  - nuxt-trpc       (Nuxt + tRPC)"
    echo "  - flutter-go      (Flutter + Go)"
    echo "  - next-supabase   (Next.js + Supabase)"
    echo "  - smart           (AI-driven stack selection)"
    echo
    echo "For more information, visit: https://github.com/vibe-coder/fullstack-starter-kit"
else
    echo -e "${RED}Installation failed. Please try again or install manually:${NC}"
    echo "npm install -g @vibe-coder/fullstack-starter-kit"
    exit 1
fi
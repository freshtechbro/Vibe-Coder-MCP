FROM node:20-slim AS base

WORKDIR /app

# Install necessary dependencies
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./

# Use npm ci for installing from package-lock.json
RUN npm ci

# Copy source code
COPY . .

# Run build script
RUN npm run build

FROM base AS runner
WORKDIR /app

# Copy package files and built code
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY mcp-config.json ./
COPY workflows.json ./

# Use npm ci --omit=dev for production dependencies
RUN npm ci --omit=dev

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port
EXPOSE 3000

# Switch to non-root user
USER node

# Define the command to run your app
CMD ["node", "dist/index.js"]
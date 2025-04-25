import { z } from 'zod';

export interface DockerConfig {
  services: Array<{
    name: string;
    port: number;
    env: Record<string, string>;
  }>;
  volumes: string[];
}

const configSchema = z.object({
  services: z.array(
    z.object({
      name: z.string(),
      port: z.number(),
      env: z.record(z.string()),
    })
  ),
  volumes: z.array(z.string()),
});

export function generateDocker(
  config: DockerConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: 'docker-compose.dev.yml',
      content: `
version: '3.8'

services:
  ${validatedConfig.services
    .map(
      (service) => `
  ${service.name}:
    build:
      context: .
      dockerfile: docker/dev/Dockerfile.${service.name}
    ports:
      - "${service.port}:${service.port}"
    environment:
      ${Object.entries(service.env)
        .map(([key, value]) => `- ${key}=${value}`)
        .join('\n      ')}
    volumes:
      ${validatedConfig.volumes.map((volume) => `- ${volume}`).join('\n      ')}
    restart: unless-stopped`
    )
    .join('\n')}

volumes:
  ${validatedConfig.volumes.map((volume) => volume.split(':')[0]).join('\n  ')}`,
    },
    {
      path: 'docker/dev/Dockerfile.api',
      content: `
FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

COPY . .

RUN pnpm run build

EXPOSE ${validatedConfig.services.find((s) => s.name === 'api')?.port || 3000}

CMD ["pnpm", "run", "start"]`,
    },
    {
      path: 'docker/dev/Dockerfile.web',
      content: `
FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

COPY . .

RUN pnpm run build

EXPOSE ${validatedConfig.services.find((s) => s.name === 'web')?.port || 3000}

CMD ["pnpm", "run", "dev"]`,
    },
    {
      path: 'docker/dev/.dockerignore',
      content: `
node_modules
.git
.env
.env.*
*.log
dist
build
coverage
.DS_Store
.idea
.vscode`,
    },
  ];
}

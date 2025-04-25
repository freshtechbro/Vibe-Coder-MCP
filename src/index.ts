#!/usr/bin/env node
import 'dotenv/config'; // Load .env file variables into process.env
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import logger from './logger.js';
import { startServer } from './server.js';
import { sseNotifier } from './services/sse-notifier/index.js';
import { loadWorkflowDefinitions } from './services/workflows/workflowExecutor.js';

// Import all tools to ensure registration
import './tools/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load workflow definitions
const workflowsPath = path.join(__dirname, '..', 'workflows.json');
loadWorkflowDefinitions(workflowsPath);

// --- Ensure Output Directory Exists ---
const outputDir = process.env.VIBE_CODER_OUTPUT_DIR || 'VibeCoderOutput';
const resolvedOutputDir = path.resolve(process.cwd(), outputDir); // Resolve relative to CWD
try {
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
  logger.info(`Ensured output directory exists: ${resolvedOutputDir}`);
} catch (error) {
  logger.error(
    { err: error, path: resolvedOutputDir },
    'Failed to create output directory'
  );
  // Decide if this is fatal. For now, log and continue.
}
// --- End Output Directory ---

// Handle shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM. Shutting down gracefully...');
  sseNotifier.closeAllConnections();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT. Shutting down gracefully...');
  sseNotifier.closeAllConnections();
  process.exit(0);
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

try {
  startServer(PORT);
} catch (error) {
  logger.error({ err: error }, 'Failed to start server');
  process.exit(1);
}

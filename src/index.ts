#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from 'path'; // Ensure path is imported
import { fileURLToPath } from 'url'; // Needed for ES Module path resolution
import logger, { registerShutdownCallback } from "./logger.js";
import { initializeToolEmbeddings } from './services/routing/embeddingStore.js';
import { loadLlmConfigMapping } from './utils/configLoader.js'; // Import the new loader
import { OpenRouterConfig } from './types/workflow.js'; // Import OpenRouterConfig type
import { OpenRouterConfigManager } from './utils/openrouter-config-manager.js';
import { ToolRegistry } from './services/routing/toolRegistry.js'; // Import ToolRegistry to initialize it properly
import { sseNotifier } from './services/sse-notifier/index.js'; // Import the SSE notifier singleton
import { transportManager } from './services/transport-manager/index.js'; // Import transport manager singleton
import { PortAllocator } from './utils/port-allocator.js'; // Import port allocator for cleanup

// Import createServer *after* tool imports to ensure proper initialization order
import { createServer } from "./server.js";

// --- Load .env file explicitly ---
// Get the directory name of the current module (build/index.js)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Construct the path to the .env file in the project root (one level up from build)
const envPath = path.resolve(__dirname, '../.env');
// Load environment variables from the specific path
const dotenvResult = dotenv.config({ path: envPath });

if (dotenvResult.error) {
  logger.warn({ err: dotenvResult.error, path: envPath }, `Could not load .env file from explicit path. Environment variables might be missing.`);
} else {
  logger.info({ path: envPath, loaded: dotenvResult.parsed ? Object.keys(dotenvResult.parsed) : [] }, `Loaded environment variables from .env file.`);
}
// --- End .env loading ---

// Define an interface for transports that handle POST messages
interface TransportWithMessageHandling {
  handlePostMessage(req: express.Request, res: express.Response, context?: Record<string, unknown>): Promise<void>;
  // Add other common transport properties/methods if needed, e.g., from SSEServerTransport
}

// Type guard to check if an object conforms to TransportWithMessageHandling
const isMessageHandlingTransport = (t: unknown): t is TransportWithMessageHandling =>
  t !== null && typeof t === 'object' && 'handlePostMessage' in t && typeof (t as TransportWithMessageHandling).handlePostMessage === 'function';

// Determine transport based on command line arguments
const args = process.argv.slice(2);
const useSSE = args.includes('--sse');

// Define main function *before* it's called
async function main(mcpServer: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer) {
  try {
    if (useSSE) {
      // Set up Express server for SSE with dynamic port allocation
      const app = express();
      app.use(cors());
      app.use(express.json());

      // Get allocated SSE port from Transport Manager, fallback to environment or default
      const allocatedSsePort = transportManager.getServicePort('sse');
      const port = allocatedSsePort ||
                   (process.env.SSE_PORT ? parseInt(process.env.SSE_PORT) : undefined) ||
                   (process.env.PORT ? parseInt(process.env.PORT) : 3000);

      logger.debug({
        allocatedSsePort,
        envSsePort: process.env.SSE_PORT,
        envPort: process.env.PORT,
        finalPort: port
      }, 'SSE server port selection');

      // Add a health endpoint
      app.get('/health', (req: express.Request, res: express.Response) => {
        res.status(200).json({ status: 'ok' });
      });

      app.get('/sse', (req: express.Request, res: express.Response) => {
        // Extract session ID from query parameters or generate a new one
        const sessionId = req.query.sessionId as string || `sse-${Math.random().toString(36).substring(2)}`;

        // Create a transport
        const transport = new SSEServerTransport('/messages', res);

        // Store the session ID in the request object for later use
        (req as express.Request & { sessionId?: string }).sessionId = sessionId;

        // Log the session ID
        logger.info({ sessionId, transportSessionId: transport.sessionId }, 'Established SSE connection');

        // Store the session ID in a global map for later use
        // sseNotifier.registerConnection(sessionId, res);

        // Connect the transport to the server
        mcpServer.connect(transport).catch((error: Error) => {
          logger.error({ err: error }, 'Failed to connect transport');
        });
      });

      app.post('/messages', async (req: express.Request, res: express.Response) => {
        if (!req.body) {
          return res.status(400).json({ error: 'Invalid request body' });
        }

        try {
          // Extract session ID from query parameters or body
          const sessionId = req.query.sessionId as string || req.body.session_id;

          if (!sessionId) {
            return res.status(400).json({ error: 'Missing session ID. Establish an SSE connection first.' });
          }

          // Find the active transport for this session
          const transport = mcpServer.server.transport;

          if (!transport) {
            return res.status(400).json({ error: 'No active SSE connection' });
          }

          if (isMessageHandlingTransport(transport)) {
            // Pass the session ID and transport type in the context
            const context = {
              sessionId,
              transportType: sessionId === 'stdio-session' ? 'stdio' : 'sse'
            };
            await transport.handlePostMessage(req, res, context);
          } else {
            logger.error('Active transport does not support handlePostMessage or is not defined.');
            if (!res.headersSent) {
              res.status(500).json({ error: 'Internal server error: Cannot handle POST message.' });
            }
            return;
          }
        } catch (error) {
          logger.error({ err: error }, 'Error handling POST message');
          if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error while handling POST message.' });
          }
        }
      });

      app.listen(port, () => {
        logger.info({
          port,
          allocatedByTransportManager: !!allocatedSsePort,
          source: allocatedSsePort ? 'Transport Manager' : 'Environment/Default'
        }, `Vibe Coder MCP SSE server running on http://localhost:${port}`);
         logger.info('Connect using SSE at /sse and post messages to /messages');
         logger.info('Subscribe to job progress events at /events/:sessionId'); // Log new endpoint
       });

       // --- Add new SSE endpoint for job progress ---
       app.get('/events/:sessionId', (req: express.Request, res: express.Response) => {
         const sessionId = req.params.sessionId;
         if (!sessionId) {
           res.status(400).send('Session ID is required.');
           return;
         }
         logger.info({ sessionId }, `Received request to establish SSE connection for job progress.`);
         sseNotifier.registerConnection(sessionId, res);
       });
       // --- End new SSE endpoint ---

     } else {
      // Set environment variable to indicate stdio transport is being used
      process.env.MCP_TRANSPORT = 'stdio';

      // Override console methods to prevent stdout contamination in stdio mode
      // Redirect all console output to stderr when using stdio transport
      console.log = (...args: any[]) => process.stderr.write(args.join(' ') + '\n');
      console.info = (...args: any[]) => process.stderr.write('[INFO] ' + args.join(' ') + '\n');
      console.warn = (...args: any[]) => process.stderr.write('[WARN] ' + args.join(' ') + '\n');
      console.error = (...args: any[]) => process.stderr.write('[ERROR] ' + args.join(' ') + '\n');

      // Use stdio transport with session ID
      const stdioSessionId = 'stdio-session';
      const transport = new StdioServerTransport();

      // Log the session ID (this will now go to stderr due to our logger fix)
      logger.info({ sessionId: stdioSessionId }, 'Initialized stdio transport with session ID');

      // We'll pass the session ID and transport type in the context when handling messages
      await mcpServer.connect(transport); // Use mcpServer
      logger.info('Vibe Coder MCP server running on stdio');
    }
  } catch (error) {
    logger.fatal({ err: error }, 'Server error');
    process.exit(1);
  }
}

// Initialize all tool directories
async function initDirectories() {
  try {
    // Using dynamic imports with try/catch to handle missing files gracefully
    try {
      const researchManager = await import('./tools/research-manager/index.js');
      if (typeof researchManager.initDirectories === 'function') {
        await researchManager.initDirectories();
        logger.debug('Initialized research-manager directories');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error initializing research-manager');
    }

    try {
      const rulesGenerator = await import('./tools/rules-generator/index.js');
      if (typeof rulesGenerator.initDirectories === 'function') {
        await rulesGenerator.initDirectories();
        logger.debug('Initialized rules-generator directories');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error initializing rules-generator');
    }

    try {
      const prdGenerator = await import('./tools/prd-generator/index.js');
      if (typeof prdGenerator.initDirectories === 'function') {
        await prdGenerator.initDirectories();
        logger.debug('Initialized prd-generator directories');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error initializing prd-generator');
    }

    try {
      const userStoriesGenerator = await import('./tools/user-stories-generator/index.js');
      if (typeof userStoriesGenerator.initDirectories === 'function') {
        await userStoriesGenerator.initDirectories();
        logger.debug('Initialized user-stories-generator directories');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error initializing user-stories-generator');
    }

    try {
      const contextCurator = await import('./tools/context-curator/index.js');
      if (typeof contextCurator.initDirectories === 'function') {
        await contextCurator.initDirectories();
        logger.debug('Initialized context-curator directories');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error initializing context-curator');
    }

    try {
      const taskListGenerator = await import('./tools/task-list-generator/index.js');
      if (typeof taskListGenerator.initDirectories === 'function') {
        await taskListGenerator.initDirectories();
        logger.debug('Initialized task-list-generator directories');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error initializing task-list-generator');
    }

    logger.info('Tool directory initialization complete');
  } catch (error) {
    logger.error({ err: error }, 'Error initializing directories');
  }
}

// New function to handle all async initialization steps
async function initializeApp() {
  // Initialize centralized OpenRouter configuration manager
  logger.info('Initializing centralized OpenRouter configuration manager...');
  const configManager = OpenRouterConfigManager.getInstance();
  await configManager.initialize();

  // Get OpenRouter configuration from centralized manager
  const openRouterConfig = await configManager.getOpenRouterConfig();

  // Log the loaded configuration details
  const mappingKeys = Object.keys(openRouterConfig.llm_mapping || {});
  logger.info('Loaded OpenRouter configuration details:', {
      hasApiKey: Boolean(openRouterConfig.apiKey),
      baseUrl: openRouterConfig.baseUrl,
      geminiModel: openRouterConfig.geminiModel,
      perplexityModel: openRouterConfig.perplexityModel,
      mappingLoaded: mappingKeys.length > 0,
      numberOfMappings: mappingKeys.length,
      mappingKeys: mappingKeys
  });

  // Validate configuration
  const validation = configManager.validateConfiguration();
  if (!validation.valid) {
    logger.error({ errors: validation.errors }, 'OpenRouter configuration validation failed');
    throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
  }

  if (validation.warnings.length > 0) {
    logger.warn({ warnings: validation.warnings, suggestions: validation.suggestions }, 'OpenRouter configuration has warnings');
  }

  // CRITICAL - Initialize the ToolRegistry with the proper config BEFORE any tools are registered
  // This ensures all tools will receive the correct config with llm_mapping intact
  logger.info('Initializing ToolRegistry with full configuration including model mappings');
  ToolRegistry.getInstance(openRouterConfig);

  // Now that the registry is initialized with the proper config, we can safely load tools
  // which will register themselves with the properly configured registry
  await initDirectories(); // Initialize tool directories
  await initializeToolEmbeddings(); // Initialize embeddings

  // Check for other running vibe-coder-mcp instances
  try {
    logger.info('Checking for other running vibe-coder-mcp instances...');
    const commonPorts = [8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090];
    const portsInUse: number[] = [];

    for (const port of commonPorts) {
      const isAvailable = await PortAllocator.findAvailablePort(port);
      if (!isAvailable) {
        portsInUse.push(port);
      }
    }

    if (portsInUse.length > 0) {
      logger.warn({
        portsInUse,
        message: 'Detected ports in use that may indicate other vibe-coder-mcp instances running'
      }, 'Multiple instance detection warning');
    } else {
      logger.info('No conflicting instances detected on common ports');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Instance detection failed, continuing with startup');
  }

  // Cleanup orphaned ports from previous crashed instances
  try {
    logger.info('Starting port cleanup for orphaned processes...');
    const cleanedPorts = await PortAllocator.cleanupOrphanedPorts();
    logger.info({ cleanedPorts }, 'Port cleanup completed');
  } catch (error) {
    logger.warn({ err: error }, 'Port cleanup failed, continuing with startup');
  }

  // Configure transport services with dynamic port allocation
  // Enable all transports for comprehensive agent communication
  transportManager.configure({
    websocket: { enabled: true, port: 8080, path: '/agent-ws' },
    http: { enabled: true, port: 3011, cors: true },
    sse: { enabled: true },
    stdio: { enabled: true }
  });

  // Start transport services for agent communication using coordinator
  try {
    const { transportCoordinator } = await import('./services/transport-coordinator.js');
    await transportCoordinator.ensureTransportsStarted();
    logger.info('All transport services started successfully with dynamic port allocation');
  } catch (error) {
    logger.error({ err: error }, 'Failed to start transport services');
    // Don't throw - allow application to continue with available transports
  }

  // Register shutdown callbacks for graceful cleanup
  registerShutdownCallback(async () => {
    logger.info('Shutting down transport services...');
    try {
      await transportManager.stopAll();
      logger.info('Transport services stopped successfully');
    } catch (error) {
      logger.error({ err: error }, 'Error stopping transport services');
    }
  });

  registerShutdownCallback(async () => {
    logger.info('Cleaning up port allocations...');
    try {
      await PortAllocator.cleanupOrphanedPorts();
      logger.info('Port cleanup completed');
    } catch (error) {
      logger.error({ err: error }, 'Error during port cleanup');
    }
  });

  logger.info('Application initialization complete.');
  // Return the fully loaded config
  return openRouterConfig;
}

// Initialize app, create server with loaded config, then start main logic
initializeApp().then((loadedConfig) => {
  const server = createServer(loadedConfig); // Pass loaded config to server creation
  main(server).catch(error => { // Pass server instance to main
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  });
}).catch(initError => {
   logger.fatal({ err: initError }, 'Failed during application initialization');
   process.exit(1);
});
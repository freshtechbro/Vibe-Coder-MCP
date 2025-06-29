#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from 'path'; // Ensure path is imported
import { fileURLToPath } from 'url'; // Needed for ES Module path resolution
import logger from "./logger.js";

// Initialize critical imports with error handling
let initializeToolEmbeddings: any = null;
let loadLlmConfigMapping: any = null;
let ToolRegistry: any = null;
let sseNotifier: any = null;
let transportManager: any = null;
let PortAllocator: any = null;
let createServer: any = null;

// Graceful import with fallbacks
async function initializeImports() {
    try {
        const embeddingModule = await import('./services/routing/embeddingStore.js');
        initializeToolEmbeddings = embeddingModule.initializeToolEmbeddings;
    } catch (error) {
        logger.warn({ err: error }, 'Failed to import embeddingStore, continuing without embeddings');
        initializeToolEmbeddings = async () => { logger.info('Embeddings disabled due to import failure'); };
    }

    try {
        const configModule = await import('./utils/configLoader.js');
        loadLlmConfigMapping = configModule.loadLlmConfigMapping;
    } catch (error) {
        logger.warn({ err: error }, 'Failed to import configLoader, using fallback');
        loadLlmConfigMapping = () => ({});
    }

    try {
        const registryModule = await import('./services/routing/toolRegistry.js');
        ToolRegistry = registryModule.ToolRegistry;
    } catch (error) {
        logger.warn({ err: error }, 'Failed to import ToolRegistry, using fallback');
        ToolRegistry = { getInstance: () => ({ register: () => {}, get: () => null }) };
    }

    try {
        const sseModule = await import('./services/sse-notifier/index.js');
        sseNotifier = sseModule.sseNotifier;
    } catch (error) {
        logger.warn({ err: error }, 'Failed to import SSE notifier, continuing without SSE notifications');
        sseNotifier = { registerConnection: () => {}, getConnectionCount: () => 0 };
    }

    try {
        const transportModule = await import('./services/transport-manager/index.js');
        transportManager = transportModule.transportManager;
    } catch (error) {
        logger.warn({ err: error }, 'Failed to import Transport Manager, using basic transport only');
        transportManager = {
            configure: () => {},
            startAll: async () => { logger.info('Transport Manager disabled due to import failure'); },
            getServicePort: () => undefined,
            isTransportRunning: () => false
        };
    }

    try {
        const portModule = await import('./utils/port-allocator.js');
        PortAllocator = portModule.PortAllocator;
    } catch (error) {
        logger.warn({ err: error }, 'Failed to import PortAllocator, continuing without port management');
        PortAllocator = {
            findAvailablePort: async () => false,
            cleanupOrphanedPorts: async () => 0
        };
    }

    try {
        const serverModule = await import("./server.js");
        createServer = serverModule.createServer;
    } catch (error) {
        logger.error({ err: error }, 'CRITICAL: Failed to import server module');
        throw error; // This is critical - we can't continue without server
    }
}

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
}
else {
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
            let allocatedSsePort: number | undefined = undefined;
            try {
                allocatedSsePort = transportManager.getServicePort('sse');
            } catch (error) {
                logger.debug({ err: error }, 'Failed to get SSE port from Transport Manager, using fallback');
            }

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
                    }
                    else {
                        logger.error('Active transport does not support handlePostMessage or is not defined.');
                        if (!res.headersSent) {
                            res.status(500).json({ error: 'Internal server error: Cannot handle POST message.' });
                        }
                        return;
                    }
                }
                catch (error) {
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
                try {
                    sseNotifier.registerConnection(sessionId, res);
                } catch (error) {
                    logger.warn({ err: error }, 'Failed to register SSE connection');
                    res.status(500).send('Failed to register SSE connection');
                }
            });
            // --- End new SSE endpoint ---

        }
        else {
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

            // Add process event handlers to prevent unexpected exits
            process.on('uncaughtException', (error) => {
                logger.error({ err: error }, 'Uncaught exception - keeping server alive');
            });

            process.on('unhandledRejection', (reason, promise) => {
                logger.error({ reason, promise }, 'Unhandled rejection - keeping server alive');
            });

            // Ensure process stays alive
            process.stdin.resume();

            // Log the session ID (this will now go to stderr due to our logger fix)
            logger.info({ sessionId: stdioSessionId }, 'Initialized stdio transport with session ID');

            // We'll pass the session ID and transport type in the context when handling messages
            await mcpServer.connect(transport); // Use mcpServer
            logger.info('Vibe Coder MCP server running on stdio');

            // Keep the process alive with heartbeat
            setInterval(() => {
                // Heartbeat to keep process alive
            }, 30000);
        }
    }
    catch (error) {
        logger.fatal({ err: error }, 'Server error');
        process.exit(1);
    }
}

// Initialize all tool directories with comprehensive error handling
async function initDirectories() {
    const toolModules = [
        'research-manager',
        'rules-generator',
        'prd-generator',
        'user-stories-generator',
        'context-curator',
        'task-list-generator'
    ];

    logger.info('Starting tool directory initialization with error handling...');

    for (const toolName of toolModules) {
        try {
            const toolModule = await import(`./tools/${toolName}/index.js`);
            if (typeof toolModule.initDirectories === 'function') {
                await toolModule.initDirectories();
                logger.debug(`Successfully initialized ${toolName} directories`);
            } else {
                logger.debug(`${toolName} does not have initDirectories function`);
            }
        } catch (error) {
            logger.warn({ err: error, tool: toolName }, `Error initializing ${toolName}, continuing with other tools`);
        }
    }

    logger.info('Tool directory initialization complete (with graceful error handling)');
}

// New function to handle all async initialization steps with comprehensive error handling
async function initializeApp() {
    logger.info('Starting application initialization with comprehensive error handling...');

    // Initialize all imports first
    try {
        await initializeImports();
        logger.info('All critical imports loaded successfully');
    } catch (error) {
        logger.fatal({ err: error }, 'Failed to load critical imports');
        throw error;
    }

    // Load LLM configuration with error handling
    let llmMapping: any = {};
    try {
        logger.info(`Attempting to load LLM config...`);
        llmMapping = loadLlmConfigMapping('llm_config.json');
        logger.info('LLM configuration loaded successfully');
    } catch (error) {
        logger.warn({ err: error }, 'Failed to load LLM configuration, using empty mapping');
        llmMapping = {};
    }

    // Prepare OpenRouter config with error handling
    let openRouterConfig: any;
    try {
        openRouterConfig = {
            baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
            apiKey: process.env.OPENROUTER_API_KEY || "",
            defaultModel: process.env.DEFAULT_MODEL || "deepseek/deepseek-r1-0528-qwen3-8b:free",
            perplexityModel: process.env.PERPLEXITY_MODEL || "perplexity/sonar-deep-research",
            llm_mapping: JSON.parse(JSON.stringify(llmMapping))
        };

        const mappingKeys = Object.keys(llmMapping);
        logger.info('OpenRouter configuration prepared:', {
            mappingLoaded: mappingKeys.length > 0,
            numberOfMappings: mappingKeys.length,
            mappingKeys: mappingKeys
        });
    } catch (error) {
        logger.warn({ err: error }, 'Error preparing OpenRouter config, using defaults');
        openRouterConfig = {
            baseUrl: "https://openrouter.ai/api/v1",
            apiKey: "",
            defaultModel: "deepseek/deepseek-r1-0528-qwen3-8b:free",
            perplexityModel: "perplexity/sonar-deep-research",
            llm_mapping: {}
        };
    }

    // Initialize ToolRegistry with error handling
    try {
        logger.info('Initializing ToolRegistry...');
        ToolRegistry.getInstance(openRouterConfig);
        logger.info('ToolRegistry initialized successfully');
    } catch (error) {
        logger.warn({ err: error }, 'Failed to initialize ToolRegistry, continuing without it');
    }

    // Initialize tool directories with error handling
    try {
        await initDirectories();
    } catch (error) {
        logger.warn({ err: error }, 'Tool directory initialization had errors, continuing');
    }

    // Initialize embeddings with error handling
    try {
        await initializeToolEmbeddings();
        logger.info('Tool embeddings initialized successfully');
    } catch (error) {
        logger.warn({ err: error }, 'Failed to initialize embeddings, continuing without them');
    }

    // Check for other running instances with error handling
    try {
        logger.info('Checking for other running vibe-coder-mcp instances...');
        const commonPorts = [8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090];
        const portsInUse: number[] = [];

        for (const port of commonPorts) {
            try {
                const isAvailable = await PortAllocator.findAvailablePort(port);
                if (!isAvailable) {
                    portsInUse.push(port);
                }
            } catch (error) {
                logger.debug({ err: error, port }, 'Error checking port availability');
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

    // Cleanup orphaned ports with error handling
    try {
        logger.info('Starting port cleanup for orphaned processes...');
        const cleanedPorts = await PortAllocator.cleanupOrphanedPorts();
        logger.info({ cleanedPorts }, 'Port cleanup completed');
    } catch (error) {
        logger.warn({ err: error }, 'Port cleanup failed, continuing with startup');
    }

    // Configure transport services with error handling
    try {
        transportManager.configure({
            websocket: { enabled: true, port: 8080, path: '/agent-ws' },
            http: { enabled: true, port: 3011, cors: true },
            sse: { enabled: true },
            stdio: { enabled: true }
        });
        logger.info('Transport manager configured successfully');
    } catch (error) {
        logger.warn({ err: error }, 'Failed to configure transport manager, continuing with basic transport');
    }

    // Start transport services with comprehensive error handling
    try {
        await transportManager.startAll();
        logger.info('Transport services started successfully');
    } catch (error) {
        logger.warn({ err: error }, 'Transport services startup had issues, continuing with basic MCP server');
        // Don't throw - allow application to continue with available transports
    }

    logger.info('Application initialization complete with graceful error handling');
    return openRouterConfig;
}

// Initialize app, create server with loaded config, then start main logic
// ALL with comprehensive error handling to ensure the server ALWAYS starts
initializeApp().then((loadedConfig) => {
    try {
        const server = createServer(loadedConfig);
        logger.info('MCP Server created successfully');
        
        main(server).catch(error => {
            logger.fatal({ err: error }, 'Failed to start server main loop');
            process.exit(1);
        });
    } catch (error) {
        logger.fatal({ err: error }, 'Failed to create MCP server');
        process.exit(1);
    }
}).catch(initError => {
    logger.fatal({ err: initError }, 'Failed during application initialization');
    process.exit(1);
});

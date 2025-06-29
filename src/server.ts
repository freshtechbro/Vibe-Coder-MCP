import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// import { z } from "zod"; // Removed unused import
import dotenv from "dotenv";
// import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js"; // Removed unused import
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import logger from "./logger.js";

// Import all tool modules to trigger registration
import './tools/index.js';
// Also import the request processor to register the process-request tool
import './services/request-processor/index.js';

// Import registry functions
import { getAllTools, executeTool, ToolExecutionContext } from './services/routing/toolRegistry.js'; // Import ToolExecutionContext
import { addInteraction } from './services/state/sessionState.js'; // Import state functions

// Import necessary types
import { OpenRouterConfig } from "./types/workflow.js";
import { getUnifiedSecurityConfig } from "./tools/vibe-task-manager/security/unified-security-config.js";
// import { ProcessedRequest } from "./services/request-processor/index.js"; // Removed unused import
// Remove direct executor imports as they are handled by the registry
// import { generateFullstackStarterKit } from "./tools/fullstack-starter-kit-generator/index.js";
// import { generateRules } from "./tools/rules-generator/index.js";
// import { generatePRD } from "./tools/prd-generator/index.js";
// import { generateUserStories } from "./tools/user-stories-generator/index.js";
// import { generateTaskList } from "./tools/task-list-generator/index.js";

// Load environment variables
dotenv.config();

// REMOVED: Internal config creation. Will now be passed in.
// const config: OpenRouterConfig = {
//   baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
//   apiKey: process.env.OPENROUTER_API_KEY || "",
//   defaultModel: process.env.DEFAULT_MODEL || "google/gemini-2.0-flash-001",
//   perplexityModel: process.env.PERPLEXITY_MODEL || "perplexity/sonar-deep-research"
// };

/**
 * Initialize the MCP server with all Vibe Coder tools.
 * @param loadedConfigParam The fully loaded OpenRouter configuration, including LLM mappings.
 */
export function createServer(loadedConfigParam: OpenRouterConfig): McpServer { // Accept loadedConfigParam as argument
  // Log the received config object with all details for debugging
  logger.info({
    receivedConfig: loadedConfigParam,
    hasMapping: Boolean(loadedConfigParam.llm_mapping),
    mappingKeys: loadedConfigParam.llm_mapping ? Object.keys(loadedConfigParam.llm_mapping) : [],
    mappingValues: loadedConfigParam.llm_mapping
  }, 'createServer received config object.');

  // Initialize unified security configuration from MCP client config
  try {
    const unifiedSecurityConfig = getUnifiedSecurityConfig();
    unifiedSecurityConfig.initializeFromMCPConfig(loadedConfigParam);
    logger.info('Unified security configuration initialized from MCP client config');
  } catch (error) {
    logger.warn({ err: error }, 'Failed to initialize unified security configuration from MCP client config');
  }

  // Create a new MCP server
  const server = new McpServer(
    {
      name: "vibe-coder-mcp",
      version: "1.0.0"
    },
    {
      instructions: `
Vibe Coder MCP server provides tools for development automation:

1. Fullstack Starter Kit - Generates custom full-stack project starter kits
2. Research - Performs deep research using Perplexity Sonar
3. Generate Rules - Creates project-specific development rules
4. Generate PRD - Creates comprehensive product requirements documents
5. Generate User Stories - Creates detailed user stories
6. Generate Task List - Creates detailed development task lists

All generated artifacts are stored in structured directories.
      `
    }
  );

  // Log server initialization
  logger.info('MCP Server initialized');

  // Note: McpServer doesn't expose direct error handling hook
  // Errors will be caught in the main index.ts

  // Tool registration will now be handled dynamically below.

  // --- REMOVE ALL server.tool(...) blocks from here down ---
  /*
  // Example of removed block:
  server.tool(
    "generate-rules",
    "Creates project-specific development rules based on product description",
    {
      productDescription: z.string().describe("Description of the product being developed"),
      userStories: z.string().optional().describe("Optional user stories to inform the rules"),
      ruleCategories: z.array(z.string()).optional().describe("Optional categories of rules to generate")
    },
    async ({ productDescription, userStories, ruleCategories }): Promise<CallToolResult> => {
      const result = await generateRules(productDescription, userStories, ruleCategories, config);
      return {
        content: result.content
      };
    }
  );

  // Register the PRD generator tool
  server.tool(
    "generate-prd",
    "Creates comprehensive product requirements documents",
    {
      productDescription: z.string().describe("Description of the product to create a PRD for")
    },
    async ({ productDescription }): Promise<CallToolResult> => {
      const result = await generatePRD(productDescription, config);
      return {
        content: result.content
      };
    }
  );

  // Register the user stories generator tool
  server.tool(
    "generate-user-stories",
    "Creates detailed user stories with acceptance criteria",
    {
      productDescription: z.string().describe("Description of the product to create user stories for")
    },
    async ({ productDescription }): Promise<CallToolResult> => {
      const result = await generateUserStories(productDescription, config);
      return {
        content: result.content
      };
    }
  );

  // Register the task list generator tool
  server.tool(
    "generate-task-list",
    "Creates structured development task lists with dependencies",
    {
      productDescription: z.string().describe("Description of the product"),
      userStories: z.string().describe("User stories to use for task list generation")
    },
    async ({ productDescription, userStories }): Promise<CallToolResult> => {
      const result = await generateTaskList(productDescription, userStories, config);
      return {
        content: result.content
      };
    }
  );

  // Register the fullstack starter kit generator tool
  server.tool(
    "generate-fullstack-starter-kit",
    "Generates full-stack project starter kits with custom tech stacks",
    {
      use_case: z.string().describe("The specific use case for the starter kit"),
      tech_stack_preferences: z.record(z.string().optional()).optional().describe("Optional tech stack preferences"),
      request_recommendation: z.boolean().optional().describe("Whether to request recommendations for tech stack components"),
      include_optional_features: z.array(z.string()).optional().describe("Optional features to include in the starter kit")
    },
    async ({ use_case, tech_stack_preferences, request_recommendation, include_optional_features }): Promise<CallToolResult> => {
      const input = {
        use_case,
        tech_stack_preferences: tech_stack_preferences || {},
        request_recommendation: request_recommendation || false,
        include_optional_features: include_optional_features || []
      };

      const result = await generateFullstackStarterKit(input, config);
      return {
        content: result.content
      };
    }
  );

  // Register the natural language request processor tool
  server.tool(
    "process-request",
    "Processes natural language requests and routes them to the appropriate tool",
    {
      request: z.string().describe("Natural language request to process")
    },
    async ({ request }): Promise<CallToolResult> => {
      // Process the request to determine which tool to use
      const result = await processUserRequest(request, config);

      // Check that we have content and it's text
      if (!result.content?.[0] || result.content[0].type !== 'text' || typeof result.content[0].text !== 'string') {
        return {
          content: [
            {
              type: "text",
              text: "Error: Failed to process request - invalid response format"
            }
          ],
          isError: true
        };
      }

      // If we need to confirm with the user, just return the processed request
      const processedRequest = JSON.parse(result.content[0].text) as ProcessedRequest;
      if (processedRequest.requiresConfirmation) {
        return {
          content: [
            {
              type: "text",
              text: `I'll use the ${processedRequest.toolName} for this request.\n\n${processedRequest.explanation}\n\nConfidence: ${Math.round(processedRequest.confidence * 100)}%`
            }
          ]
        };
      }

      // Otherwise, execute the tool directly
      // Create a map of tool executors
      const toolExecutors: Record<string, (params: Record<string, string>) => Promise<CallToolResult>> = {
        "fullstack-starter-kit-generator": async (params) => {
          const input = {
            use_case: params.use_case || params.project || request,
            tech_stack_preferences: params.tech_stack_preferences ?
              JSON.parse(params.tech_stack_preferences) : {},
            request_recommendation: params.request_recommendation === 'true',
            include_optional_features: params.include_optional_features ?
              params.include_optional_features.split(',') : []
          };
          const result = await generateFullstackStarterKit(input, config);
          return {
            content: result.content,
            isError: result.isError
          };
        },
        // "research-manager" execution is now handled by executeTool in toolRegistry
        "rules-generator": async (params) => {
          // Safe handling of rule categories
          const categories = typeof params.ruleCategories === 'string' ?
            params.ruleCategories.split(",") : undefined;

          return generateRules(
            params.productDescription || request,
            params.userStories,
            categories,
            config
          );
        },
        "prd-generator": async (params) => {
          return generatePRD(params.productDescription || request, config);
        },
        "user-stories-generator": async (params) => {
          return generateUserStories(params.productDescription || request, config);
        },
        "task-list-generator": async (params) => {
          return generateTaskList(
            params.productDescription || request,
            params.userStories || "",
            config
          );
        }
      };

      // Execute the appropriate tool
      const toolResult = await executeProcessedRequest(processedRequest, toolExecutors);

      // Return the result with an explanation
      return {
        content: [
          {
            type: "text",
            text: `Using ${processedRequest.toolName}:\n\n${processedRequest.explanation}\n\n---\n\n`
          },
          ...toolResult.content
        ],
        isError: toolResult.isError
      };
    }
  );
  */
  // --- End of removed blocks ---


  // Register all tools found in the registry
  logger.info('Registering tools from Tool Registry...');
  const allToolDefinitions = getAllTools();

  if (allToolDefinitions.length === 0) {
     logger.warn('No tools found in the registry. Ensure tools register themselves via imports.');
     // Consider if the server should start without tools or throw an error
  }

  for (const definition of allToolDefinitions) {
    logger.debug(`Registering tool "${definition.name}" with MCP server.`);
    server.tool(
      definition.name,
      definition.description,
      // Pass the raw shape directly, as expected by server.tool
      definition.inputSchema,
      // The handler now integrates state management
      async (params: Record<string, unknown>, extra?: unknown): Promise<CallToolResult> => {
        // Log the config object available within this closure
        logger.debug({ configInHandler: loadedConfigParam }, 'Tool handler closure using config object.'); // Use loadedConfigParam

        // --- Context Creation START ---
        // Extract session ID from extra or generate a unique one
        let sessionId = 'placeholder-session-id';
        let transportType = 'unknown';

        // Check if extra contains transport information
        if (extra && typeof extra === 'object') {
          // Try to get session ID from extra
          if ('sessionId' in extra && typeof extra.sessionId === 'string') {
            sessionId = extra.sessionId;
          } else if ('req' in extra && extra.req && typeof extra.req === 'object') {
            // Try to get session ID from request
            const req = extra.req as {
              query?: { sessionId?: string },
              body?: { session_id?: string },
              headers?: { 'x-session-id'?: string }
            };
            if (req.query && req.query.sessionId) {
              sessionId = req.query.sessionId as string;
            } else if (req.body && req.body.session_id) {
              sessionId = req.body.session_id as string;
            } else if (req.headers && req.headers['x-session-id']) {
              sessionId = req.headers['x-session-id'] as string;
            }
          }

          // Try to get transport type from extra
          if ('transportType' in extra && typeof extra.transportType === 'string') {
            transportType = extra.transportType;
          }
        }

        // If we still have the placeholder, generate a unique ID for stdio transport
        if (sessionId === 'placeholder-session-id') {
          // For stdio transport, use a fixed session ID with a prefix
          sessionId = 'stdio-session';
          transportType = 'stdio';
          logger.warn({ toolName: definition.name }, "Using stdio session ID. SSE notifications will be limited to polling.");
        }

        const context: ToolExecutionContext = {
          sessionId,
          transportType
        };

        logger.debug({ toolName: definition.name, sessionId: context.sessionId, transportType: context.transportType }, "Server handler executing tool with context");
        // --- Context Creation END ---

        // Create a fresh deep copy specifically for this execution to prevent closure/reference issues
        let executionConfig: OpenRouterConfig;
        try {
          // Ensure loadedConfigParam and its llm_mapping are handled correctly during copy
          const configToCopy = {
            ...loadedConfigParam,
            llm_mapping: loadedConfigParam.llm_mapping || {} // Ensure mapping exists before stringify
          };
          executionConfig = JSON.parse(JSON.stringify(configToCopy));
          logger.debug({ configForExecution: executionConfig }, 'Deep copied config for executeTool call.');
        } catch (copyError) {
          logger.error({ err: copyError }, 'Failed to deep copy config in handler. Using original reference (may cause issues).');
          executionConfig = loadedConfigParam; // Fallback, but log error
        }


        // Execute the tool, passing the created context and the *freshly copied* config
        const result = await executeTool(definition.name, params, executionConfig, context);

        // --- State Management Integration START (Keep this part for now) ---

        // Store the current interaction (tool call + response)
        // Ensure 'result' has a timestamp - add it if executeTool doesn't
        const responseWithTimestamp = {
            ...result,
            timestamp: Date.now(),
        };
        addInteraction(sessionId, {
            toolCall: {
                name: definition.name,
                params: params,
                // Using current time as message timestamp isn't available on 'extra'
                timestamp: Date.now()
            },
            response: responseWithTimestamp,
        });

        // --- State Management Integration END ---

        return result; // Return the result from the tool execution
      }
    );
  }
  logger.info(`Registered ${allToolDefinitions.length} tools dynamically with MCP server.`);

  // The "process-request" tool is now also registered dynamically via its module import.
  // The hardcoded registration block has been removed.

  return server;
}

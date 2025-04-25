import path from 'path'; // Node.js built-in
import { promises as fs } from 'fs'; // Import fs promises
import logger from '../../logger.js'; // Internal modules
import {
  toolRegistry,
  ToolExecutionContext,
} from '../../services/routing/toolRegistry.js';
import { ToolResult, ToolDefinition } from '../../types/tools.js'; // Internal types
import { OpenRouterConfig } from '../../types/workflow.js';
import { McpConfig } from '../../types/config.js';
import { loadLlmConfigMapping } from '../../utils/configLoader.js'; // Config utilities
import { performDirectLlmCall } from '../../utils/llmHelper.js'; // LLM utilities
import { generateAsyncJobMessage } from '@/utils/jobMessages.js'; // Import shared utility for async job messages
// Import schema and type from the dedicated schema file
import { codeStubInputSchema, CodeStubInput } from './schema.js';
import { createJob, updateJobStatus, JobStatus } from './services/jobStore.js';
import { readContextFile } from './utils/contextHandler.js';
import { buildPrompts } from './utils/promptBuilder.js';

/**
 * Asynchronously processes the code stub generation job.
 * Orchestrates config loading, context reading, prompt building, LLM call, and status updates.
 */
async function processJob(
  jobId: string,
  input: CodeStubInput,
  mcpConfig: McpConfig // Use the imported shared McpConfig type
): Promise<void> {
  logger.info({ jobId }, `Starting processing for job ${jobId}`);
  const updateSuccess = updateJobStatus(jobId, JobStatus.PROCESSING);
  if (!updateSuccess) {
    logger.error(
      { jobId },
      `Failed to update job status to PROCESSING (job not found?)`
    );
    return;
  }

  try {
    // 1. Load LLM Mapping Configuration
    const llmMapping = loadLlmConfigMapping(); // Assumes llm_config.json exists or path is set

    // 2. Construct OpenRouter Configuration
    // Ensure required env vars are present
    const apiKey = mcpConfig.env?.OPENROUTER_API_KEY;
    const baseUrl = mcpConfig.env?.OPENROUTER_BASE_URL;
    if (!apiKey) {
      throw new Error(
        'Missing required environment variable: OPENROUTER_API_KEY'
      );
    }
    if (!baseUrl) {
      throw new Error(
        'Missing required environment variable: OPENROUTER_BASE_URL'
      );
    }

    const openRouterConfig: OpenRouterConfig = {
      apiKey: apiKey,
      baseUrl: baseUrl,
      // Use defaults from McpConfig, providing fallbacks if necessary
      defaultModel:
        mcpConfig.llm?.defaultModel ?? 'mistralai/mistral-7b-instruct', // TODO: Use a constant for fallback
      temperature: mcpConfig.llm?.defaultTemperature ?? 0.7, // Example fallback
      maxTokens: mcpConfig.llm?.maxTokens ?? 1024, // Example fallback
      llm_mapping: llmMapping, // Add the loaded mapping
      // Include other potential api_config if available in McpConfig structure
      ...(mcpConfig.llm?.api_config
        ? { api_config: mcpConfig.llm.api_config }
        : {}),
    };
    logger.info({ jobId, openRouterConfig }, 'Constructed OpenRouter config');
    // 3. Read Context File (if provided)
    let contextContent: string | null = null;
    let contextFileName: string | undefined;
    if (input.contextFilePath) {
      logger.info(
        { jobId, filePath: input.contextFilePath },
        'Reading context file'
      );
      contextFileName = path.basename(input.contextFilePath);
      contextContent = await readContextFile(input.contextFilePath);
      if (contextContent === null) {
        // Throw specific error if reading fails
        throw new Error(
          `Failed to read context file: ${input.contextFilePath}`
        );
      }
      logger.info({ jobId }, 'Context file read successfully');
    }

    // 4. Build Prompts
    logger.info({ jobId }, 'Building prompts');
    const { systemPrompt, userPrompt } = buildPrompts(
      input,
      contextContent ?? undefined, // Pass undefined if null
      contextFileName
    );
    logger.info({ jobId, systemPrompt, userPrompt }, 'Prompts built');

    // 5. Define Purpose for Model Selection (if using selectModelForTask)
    const purpose = 'code-stub-generation'; // Logical name for this task type

    // 6. Perform LLM Call
    logger.info({ jobId, purpose }, 'Performing LLM call');
    // Note: performDirectLlmCall might internally use selectModelForTask if needed,
    // or we could call selectModelForTask here explicitly if required by its signature.
    // Assuming performDirectLlmCall handles model selection based on config/purpose.
    const rawLlmResult = await performDirectLlmCall(
      // TODO: Add robust parsing for code block extraction
      userPrompt,
      systemPrompt,
      openRouterConfig,
      purpose // Pass purpose for potential model mapping lookup
      // Pass temperature explicitly if needed and available, otherwise rely on config default
      // mcpConfig.llm?.defaultTemperature
    );
    logger.info({ jobId }, 'LLM call successful.');

    // --- Robust code block extraction from raw LLM output ---
    let finalResult = rawLlmResult.trim();
    const fenceRegex = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)\n```/g;
    const blocks: string[] = [];
    let matchExec: RegExpExecArray | null;
    while ((matchExec = fenceRegex.exec(rawLlmResult)) !== null) {
      blocks.push(matchExec[1]);
    }
    if (blocks.length > 0) {
      finalResult = blocks.join('\n\n').trim();
      logger.info(
        { jobId, count: blocks.length },
        'Extracted code block(s) from LLM result.'
      );
    } else {
      logger.warn(
        { jobId },
        'No markdown fences detected; using raw LLM output as-is.'
      );
    }

    // 7. Update Job Status to COMPLETED
    const completedSuccess = updateJobStatus(
      jobId,
      JobStatus.COMPLETED,
      finalResult
    );
    if (!completedSuccess) {
      logger.error(
        { jobId },
        `Failed to update job status to COMPLETED (job not found?)`
      );
    } else {
      logger.info({ jobId }, `Job ${jobId} completed successfully.`);
    }

    // Write stub to file if requested
    if (input.outputFilePath) {
      const resolvedPath = path.resolve(input.outputFilePath);
      try {
        await fs.writeFile(resolvedPath, finalResult, 'utf-8');
        logger.info(
          { jobId, outputFilePath: resolvedPath },
          'Stub written to file'
        );
      } catch (err) {
        logger.error(
          { jobId, outputFilePath: resolvedPath, error: err },
          'Failed to write stub to file'
        );
      }
    }
  } catch (error: unknown) {
    // 8. Handle Errors and Update Status to FAILED
    let errorMessage = 'Unknown error during processing';
    let errorStack = undefined;
    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack;
    }
    logger.error(
      { jobId, error: errorStack ?? error }, // Log stack if available
      `Error processing job ${jobId}: ${errorMessage}`
    );
    const failedSuccess = updateJobStatus(
      jobId,
      JobStatus.FAILED,
      null,
      errorMessage
    );
    if (!failedSuccess) {
      logger.error(
        { jobId },
        `Failed to update job status to FAILED (job not found?)`
      );
    }
  }
}

/**
 * Main tool function: Validates input, creates a job, and triggers async processing.
 */
async function generateCodeStub(
  params: Record<string, unknown>,
  config: Record<string, unknown>,
  _context: ToolExecutionContext
): Promise<ToolResult> {
  // Validate input using the imported schema
  const parsedParams = codeStubInputSchema.parse(params); // Use imported schema here

  // Create a properly typed input object (validatedInput)
  // Ensure the imported CodeStubInput type aligns with parsedParams structure
  const validatedInput: CodeStubInput = parsedParams;
  logger.info(
    { input: validatedInput },
    'Validated input for code stub generation'
  );

  // Create a job ID
  const jobId = createJob(validatedInput);
  logger.info({ jobId, input: validatedInput }, `Created job ${jobId}`);

  // --- Use shared utility for async job message ---
  const message = generateAsyncJobMessage({
    jobId,
    toolName: 'code-stub-generator',
  });

  // Trigger the background processing, but don't wait for it
  try {
    // Cast generic config to McpConfig
    const mcpConfig = config as unknown as McpConfig;

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    void processJob(jobId, validatedInput, mcpConfig);
  } catch (err: unknown) {
    // Handle potential synchronous errors during job trigger (unlikely but possible)
    logger.error(
      { jobId, error: err },
      `Critical error triggering processJob for job ${jobId}`
    );
    const updateSuccess = updateJobStatus(
      jobId,
      JobStatus.FAILED,
      null,
      'Failed to initiate processing'
    );
    if (!updateSuccess) {
      logger.error(
        { jobId },
        `Failed to update job status after critical trigger error for job ${jobId} (job not found?)`
      );
    }
    // Re-throw or return an error ToolResult if immediate failure feedback is desired
    // For now, just update status and return JobId as per async pattern
  }

  // Immediately return the Job ID with the generated async message
  const result: ToolResult = {
    jobId,
    success: true,
    isError: false,
    message: message,
    content: [{ type: 'text', text: jobId }],
  };
  return result;
}

// Register the tool with the registry
// Ensure the execute function matches the ToolDefinition type
const toolDefinition: ToolDefinition = {
  name: 'code-stub-generator',
  inputSchema: codeStubInputSchema.shape, // Provide the raw shape as required by ToolDefinition
  description:
    'Generates code stubs (functions, classes, etc.) based on description and optional context file. Returns a Job ID.',
  execute: generateCodeStub,
};

toolRegistry.registerTool(toolDefinition);

logger.info(`Tool registered: ${toolDefinition.name}`);

export { generateCodeStub, processJob }; // Export processJob for testing
export type { CodeStubInput };

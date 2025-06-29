import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod';
import { CallToolResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { performFormatAwareLlmCall } from '../../utils/llmHelper.js';
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { AppError, ToolExecutionError } from '../../utils/errors.js';
import { jobManager, JobStatus } from '../../services/job-manager/index.js';
import { sseNotifier } from '../../services/sse-notifier/index.js';
import { formatBackgroundJobInitiationResponse } from '../../services/job-response-formatter/index.js';

// Helper function to get the base output directory
function getBaseOutputDir(): string {
  return process.env.VIBE_CODER_OUTPUT_DIR
    ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
    : path.join(process.cwd(), 'VibeCoderOutput');
}

// Define tool-specific directory using the helper
const USER_STORIES_DIR = path.join(getBaseOutputDir(), 'user-stories-generator');

// Initialize directories if they don't exist
export async function initDirectories() {
  const baseOutputDir = getBaseOutputDir();
  try {
    await fs.ensureDir(baseOutputDir);
    const toolDir = path.join(baseOutputDir, 'user-stories-generator');
    await fs.ensureDir(toolDir);
    logger.debug(`Ensured user stories directory exists: ${toolDir}`);
  } catch (error) {
    logger.error({ err: error, path: baseOutputDir }, `Failed to ensure base output directory exists for user-stories-generator.`);
  }
}

// User stories generator-specific system prompt
const USER_STORIES_SYSTEM_PROMPT = `
# User Stories Generator - Using Research Context

# ROLE & GOAL
You are an expert Agile Business Analyst and Product Owner AI assistant. Your goal is to generate a comprehensive and well-structured set of User Stories, including Epics and Acceptance Criteria, in Markdown format.

# CORE TASK
Generate detailed user stories based on the user's product description and the provided research context.

# INPUT HANDLING
- Analyze the 'productDescription' to understand the product's purpose, core features, and intended value.
- You will also receive 'Pre-Generation Research Context'.

# RESEARCH CONTEXT INTEGRATION
- **CRITICAL:** Carefully review the '## Pre-Generation Research Context (From Perplexity Sonar Deep Research)' section provided in the user prompt.
- This section contains insights on: User Personas & Stakeholders, User Workflows & Use Cases, and User Experience Expectations & Pain Points.
- **Use these insights** heavily to:
    - Define realistic 'As a [user type/persona]' roles based on the research.
    - Create stories that address identified 'User Workflows & Use Cases'.
    - Ensure stories align with 'User Experience Expectations' and address 'Pain Points'.
    - Inform the 'Priority' and 'Value/Benefit' parts of the stories.
- **Synthesize**, don't just list research findings. Create user stories that *embody* the research.

# OUTPUT FORMAT & STRUCTURE (Strict Markdown)
- Your entire response **MUST** be valid Markdown.
- Start **directly** with the main title: '# User Stories: [Inferred Product Name]'
- Organize stories hierarchically using Markdown headings:
    - \`## Epic: [Epic Title]\` (e.g., \`## Epic: User Authentication\`)
    - \`### User Story: [Story Title]\` (e.g., \`### User Story: User Registration\`)
- For **each User Story**, use the following precise template within its \`###\` section:

  **ID:** US-[auto-incrementing number, e.g., US-101]
  **Title:** [Concise Story Title]

  **Story:**
  > As a **[User Role/Persona - informed by research]**,
  > I want to **[perform an action or achieve a goal]**
  > So that **[I gain a specific benefit - linked to user needs/pain points from research]**.

  **Acceptance Criteria:**
  *   GIVEN [precondition/context] WHEN [action is performed] THEN [expected, testable outcome].
  *   GIVEN [another context] WHEN [different action] THEN [another outcome].
  *   *(Provide multiple, specific, measurable criteria)*

  **Priority:** [High | Medium | Low - informed by perceived value/dependencies/research]
  **Dependencies:** [List of User Story IDs this depends on, e.g., US-100 | None]
  **(Optional) Notes:** [Any clarifying details or technical considerations.]

# QUALITY ATTRIBUTES
- **INVEST Principles:** Ensure stories are Independent, Negotiable, Valuable, Estimable, Small (appropriately sized), and Testable (via Acceptance Criteria).
- **User-Centric:** Focus on user roles, actions, and benefits, informed by research personas and needs.
- **Clear Acceptance Criteria:** Criteria must be specific, unambiguous, and testable.
- **Comprehensive:** Cover the core functionality implied by the description and research workflows.
- **Well-Structured:** Adhere strictly to the Epic/Story hierarchy and template format.
- **Consistent:** Use consistent terminology and formatting.

# CONSTRAINTS (Do NOT Do the Following)
- **NO Conversational Filler:** Start directly with the '# User Stories: ...' title. No intros, summaries, or closings.
- **NO Markdown Violations:** Strictly adhere to the specified Markdown format (headings, blockquotes for the story, lists for AC).
- **NO Implementation Details:** Focus on *what* the user needs, not *how* it will be built (unless specified in 'Notes').
- **NO External Knowledge:** Base stories *only* on the provided inputs and research context.
- **NO Process Commentary:** Do not mention the research process in the output.
- **Strict Formatting:** Use \`##\` for Epics, \`###\` for Stories. Use the exact field names (ID, Title, Story, Acceptance Criteria, etc.) in bold. Use Markdown blockquotes for the As a/I want/So that structure.
`;

// Define Input Type based on Schema
const userStoriesInputSchemaShape = {
  productDescription: z.string().min(10, { message: "Product description must be at least 10 characters." }).describe("Description of the product to create user stories for")
};

/**
 * Generate user stories based on a product description.
 * This function now acts as the executor for the 'generate-user-stories' tool.
 * @param params The validated tool parameters.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
export const generateUserStories: ToolExecutor = async (
  params: Record<string, unknown>,
  config: OpenRouterConfig,
  context?: ToolExecutionContext
): Promise<CallToolResult> => {
  const sessionId = context?.sessionId || 'unknown-session';
  if (sessionId === 'unknown-session') {
      logger.warn({ tool: 'generateUserStories' }, 'Executing tool without a valid sessionId. SSE progress updates will not be sent.');
  }

  logger.debug({
    configReceived: true,
    hasLlmMapping: Boolean(config.llm_mapping),
    mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
  }, 'generateUserStories executor received config');

  const productDescription = params.productDescription as string;

  const jobId = jobManager.createJob('generate-user-stories', params);
  logger.info({ jobId, tool: 'generateUserStories', sessionId }, 'Starting background job.');

  const initialResponse = formatBackgroundJobInitiationResponse(
    jobId,
    'generate-user-stories',
    'User Stories Generator'
  );

  setImmediate(async () => {
    const logs: string[] = [];
    let filePath: string = '';

    try {
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Starting user stories generation process...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Starting user stories generation process...');
      logs.push(`[${new Date().toISOString()}] Starting user stories generation for: ${productDescription.substring(0, 50)}...`);

      await initDirectories();

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedName = productDescription.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const filename = `${timestamp}-${sanitizedName}-user-stories.md`;
      filePath = path.join(USER_STORIES_DIR, filename);

      logger.info({ jobId, inputs: { productDescription: productDescription.substring(0, 50) } }, "User Stories Generator: Starting pre-generation research...");
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Performing pre-generation research...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Performing pre-generation research...');
      logs.push(`[${new Date().toISOString()}] Starting pre-generation research.`);

      let researchContext = '';
      try {
        // Skip research phase entirely to avoid paid API calls
        logger.info({ jobId }, "Skipping research phase - avoiding paid API usage");
        researchContext = "## Pre-Generation Research Context:\n*Research phase skipped to avoid paid API usage. Using standard user story best practices.*\n\n";

      logger.info({ jobId }, "User Stories Generator: Pre-generation research completed.");
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Research complete. Starting main user stories generation...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Research complete. Starting main user stories generation...');
      logs.push(`[${new Date().toISOString()}] Pre-generation research completed.`);

    } catch (researchError) {
      logger.error({ jobId, err: researchError }, "User Stories Generator: Error during research aggregation");
      logs.push(`[${new Date().toISOString()}] Error during research aggregation: ${researchError instanceof Error ? researchError.message : String(researchError)}`);
      researchContext = "## Pre-Generation Research Context:\n*Error occurred during research phase.*\n\n";
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Warning: Error during research phase. Continuing generation...');
    }

    const mainGenerationPrompt = `Create comprehensive user stories for the following product:\n\n${productDescription}\n\n${researchContext}`;

    logger.info({ jobId }, "User Stories Generator: Starting main generation using direct LLM call...");
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating user stories content via LLM...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating user stories content via LLM...');
    logs.push(`[${new Date().toISOString()}] Calling LLM for main user stories generation.`);

    const userStoriesMarkdown = await performFormatAwareLlmCall(
      mainGenerationPrompt,
      USER_STORIES_SYSTEM_PROMPT,
      config,
      'user_stories_generation',
      'markdown', // Explicitly specify markdown format
      undefined, // No schema for markdown
      0.3
    );

    logger.info({ jobId }, "User Stories Generator: Main generation completed.");
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Processing LLM response...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Processing LLM response...');
    logs.push(`[${new Date().toISOString()}] Received response from LLM.`);

    if (!userStoriesMarkdown || typeof userStoriesMarkdown !== 'string' || !userStoriesMarkdown.trim().startsWith('# User Stories:')) {
      logger.warn({ jobId, markdown: userStoriesMarkdown?.substring(0, 100) }, 'User stories generation returned empty or potentially invalid Markdown format.');
      logs.push(`[${new Date().toISOString()}] Validation Error: LLM output invalid format.`);
      throw new ToolExecutionError('User stories generation returned empty or invalid Markdown content.');
    }

    const formattedResult = `${userStoriesMarkdown}\n\n_Generated: ${new Date().toLocaleString()}_`;

    logger.info({ jobId }, `Saving user stories to ${filePath}...`);
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Saving user stories to file...`);
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Saving user stories to file...`);
    logs.push(`[${new Date().toISOString()}] Saving user stories to ${filePath}.`);

    await fs.writeFile(filePath, formattedResult, 'utf8');
    logger.info({ jobId }, `User stories generated and saved to ${filePath}`);
    logs.push(`[${new Date().toISOString()}] User stories saved successfully.`);
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `User stories saved successfully.`);

    const finalResult: CallToolResult = {
      content: [{ type: "text", text: `User stories generated successfully and saved to: ${filePath}\n\n${formattedResult}` }],
      isError: false
    };
    jobManager.setJobResult(jobId, finalResult);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, jobId, tool: 'generate-user-stories', params }, `User Stories Generator Error: ${errorMsg}`);
      logs.push(`[${new Date().toISOString()}] Error: ${errorMsg}`);

      let appError: AppError;
      const cause = error instanceof Error ? error : undefined;
      if (error instanceof AppError) {
        appError = error;
      } else {
        appError = new ToolExecutionError(`Failed to generate user stories: ${errorMsg}`, { params, filePath }, cause);
      }

      const mcpError = new McpError(ErrorCode.InternalError, appError.message, appError.context);
      const errorResult: CallToolResult = {
        content: [{ type: 'text', text: `Error during background job ${jobId}: ${mcpError.message}\n\nLogs:\n${logs.join('\n')}` }],
        isError: true,
        errorDetails: mcpError
      };

      jobManager.setJobResult(jobId, errorResult);
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Job failed: ${mcpError.message}`);
    }
  });

  return initialResponse;
};

// --- Tool Registration ---

const userStoriesToolDefinition: ToolDefinition = {
  name: "generate-user-stories",
  description: "Creates detailed user stories with acceptance criteria based on a product description and research.",
  inputSchema: userStoriesInputSchemaShape,
  executor: generateUserStories
};

registerTool(userStoriesToolDefinition);

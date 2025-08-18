import fs from 'fs-extra';
import path from 'path';
// Removed duplicate fs and path imports
import { z } from 'zod';
import { CallToolResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { performFormatAwareLlmCallWithCentralizedConfig } from '../../utils/llmHelper.js'; // Import the format-aware helper
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js'; // Import ToolExecutionContext
import { AppError, ToolExecutionError } from '../../utils/errors.js'; // Import necessary errors
import { jobManager, JobStatus } from '../../services/job-manager/index.js'; // Import job manager & status
import { sseNotifier } from '../../services/sse-notifier/index.js'; // Import SSE notifier
import { formatBackgroundJobInitiationResponse } from '../../services/job-response-formatter/index.js'; // Import the new formatter
import { getToolOutputDirectory, ensureToolOutputDirectory } from '../vibe-task-manager/security/unified-security-config.js';

// Helper function to get the base output directory using centralized security
function getBaseOutputDir(): string {
  try {
    return getToolOutputDirectory();
  } catch {
    // Fallback for backward compatibility during migration
    return process.env.VIBE_CODER_OUTPUT_DIR
      ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
      : path.join(process.cwd(), 'VibeCoderOutput');
  }
}

// Initialize directories if they don't exist
export async function initDirectories(): Promise<string> {
  try {
    const toolDir = await ensureToolOutputDirectory('prd-generator');
    logger.debug(`Ensured PRD directory exists: ${toolDir}`);
    return toolDir;
  } catch (error) {
    logger.error({ err: error }, `Failed to ensure base output directory exists for prd-generator.`);
    // Fallback to original implementation for backward compatibility
    const baseOutputDir = getBaseOutputDir();
    try {
      await fs.ensureDir(baseOutputDir);
      const toolDir = path.join(baseOutputDir, 'prd-generator');
      await fs.ensureDir(toolDir);
      logger.debug(`Ensured PRD directory exists (fallback): ${toolDir}`);
      return toolDir;
    } catch (fallbackError) {
      logger.error({ err: fallbackError, path: baseOutputDir }, `Fallback directory creation also failed.`);
      throw fallbackError;
    }
  }
}

// PRD-specific system prompt (Exported for testing)
export const PRD_SYSTEM_PROMPT = `
# ROLE & GOAL
You are an expert Product Manager and Technical Writer AI assistant. Your goal is to generate a comprehensive, clear, and well-structured Product Requirements Document (PRD) in Markdown format based on the provided inputs.

# CORE TASK
Generate a detailed PRD based on the user's product description and the research context provided.

# INPUT HANDLING
- The primary input is the user's 'productDescription'. Analyze it carefully to understand the core concept, features, and goals.
- You will also receive 'Pre-Generation Research Context'.

# RESEARCH CONTEXT INTEGRATION
- **CRITICAL:** Carefully review the '## Pre-Generation Research Context (From Perplexity Sonar Deep Research)' section provided in the user prompt.
- This section contains insights on: Market Analysis, User Needs & Expectations, and Industry Standards & Best Practices.
- **Integrate** these insights strategically into the relevant PRD sections. For example:
    - Use 'Market Analysis' to inform the 'Goals' and 'Competitive Landscape' (if included).
    - Use 'User Needs & Expectations' and 'Personas' (if available in research) to define the 'Target Audience' and justify features.
    - Use 'Industry Standards & Best Practices' to guide 'Features & Functionality', 'Technical Considerations', and 'Non-Functional Requirements'.
- **Synthesize**, don't just copy. Weave the research findings naturally into the PRD narrative.
- If research context is missing or indicates failure for a topic, note this appropriately (e.g., "Market research was inconclusive, but based on the description...").

# OUTPUT FORMAT & STRUCTURE (Strict Markdown)
- Your entire response **MUST** be valid Markdown.
- Start **directly** with the main title: '# PRD: [Inferred Product Name]'
- Use the following sections with the specified Markdown heading levels. Include all mandatory sections; optional sections can be added if relevant information is available from the description or research.

  ## 1. Introduction / Overview (Mandatory)
  - Purpose of the product.
  - High-level summary.

  ## 2. Goals (Mandatory)
  - Business goals (e.g., increase market share, user engagement). Use research context if applicable.
  - Product goals (e.g., solve specific user problems, achieve specific functionality).

  ## 3. Target Audience (Mandatory)
  - Describe the primary user groups.
  - Incorporate insights on demographics, needs, and pain points from the research context. Use persona descriptions if research provided them.

  ## 4. Features & Functionality (Mandatory)
  - Use subheadings (###) for major features or epics.
  - For each feature, use the User Story format:
    - **User Story:** As a [user type/persona], I want to [perform action] so that [I get benefit].
    - **Description:** Further details about the story.
    - **Acceptance Criteria:**
      - GIVEN [context] WHEN [action] THEN [outcome]
      - (Provide multiple specific, testable criteria)

  ## 5. Design & UX Considerations (Mandatory)
  - High-level look-and-feel, usability goals. Informed by research on expectations.

  ## 6. Technical Considerations (Mandatory)
  - Non-functional requirements (performance, scalability, security - informed by research).
  - Potential technology constraints or suggestions based on research context.

  ## 7. Success Metrics (Mandatory)
  - Key Performance Indicators (KPIs) to measure success (e.g., user adoption rate, task completion time). Informed by industry standards research.

  ## 8. Open Issues / Questions (Mandatory)
  - List any ambiguities or areas needing further clarification.

  ## 9. Out-of-Scope / Future Considerations (Mandatory)
  - Features explicitly not included in this version.
  - Potential future enhancements.

# QUALITY ATTRIBUTES
- **Comprehensive:** Cover all aspects implied by the description and research.
- **Clear & Concise:** Use unambiguous language.
- **Structured:** Strictly adhere to the specified Markdown format and sections.
- **Actionable:** Requirements should be clear enough for design and development teams.
- **Accurate:** Reflect the product description and research context faithfully.
- **Modern:** Incorporate current best practices identified in research.

# CONSTRAINTS (Do NOT Do the Following)
- **NO Conversational Filler:** Do not include greetings, apologies, self-references ("Here is the PRD...", "I have generated..."). Start directly with the '# PRD: ...' title.
- **NO Markdown Violations:** Ensure all formatting is correct Markdown. Do not use unsupported syntax.
- **NO External Knowledge:** Base the PRD *only* on the provided product description and research context. Do not invent unrelated features or use external data.
- **NO Process Commentary:** Do not mention the research process or the models used (Perplexity/Gemini) within the PRD output itself.
- **Strict Formatting:** Adhere strictly to the section structure and Markdown heading levels specified.
`;

// Define Input Type based on Schema
const prdInputSchemaShape = {
  productDescription: z.string().min(10, { message: "Product description must be at least 10 characters." }).describe("Description of the product to create a PRD for")
};

/**
 * Generate a PRD for a product based on a description.
 * This function now acts as the executor for the 'generate-prd' tool.
 * @param params The validated tool parameters.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
export const generatePRD: ToolExecutor = async (
  params: Record<string, unknown>, // More type-safe than 'any'
  config: OpenRouterConfig,
  context?: ToolExecutionContext // Add context parameter
): Promise<CallToolResult> => { // Return CallToolResult
  // ---> Step 2.5(PRD).2: Inject Dependencies & Get Session ID <---
  const sessionId = context?.sessionId || 'unknown-session';
  if (sessionId === 'unknown-session') {
      logger.warn({ tool: 'generatePRD' }, 'Executing tool without a valid sessionId. SSE progress updates will not be sent.');
  }

  // Log the config received by the executor
  logger.debug({
    configReceived: true,
    hasLlmMapping: Boolean(config.llm_mapping),
    mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
  }, 'generatePRD executor received config');

  const productDescription = params.productDescription as string; // Assert type after validation

  // ---> Step 2.5(PRD).3: Create Job & Return Job ID <---
  const jobId = jobManager.createJob('generate-prd', params);
  logger.info({ jobId, tool: 'generatePRD', sessionId }, 'Starting background job.');

  // Use the shared service to format the initial response
  const initialResponse = formatBackgroundJobInitiationResponse(
    jobId,
    'generate-prd', // Internal tool name
    'PRD Generator'   // User-friendly display name
  );

  // ---> Step 2.5(PRD).4: Wrap Logic in Async Block <---
  setImmediate(async () => {
    const logs: string[] = []; // Keep logs specific to this job execution
    let filePath: string = ''; // Define filePath in outer scope for catch block

    // ---> Step 2.5(PRD).7: Update Final Result/Error Handling (Try Block Start) <---
    try {
      // ---> Step 2.5(PRD).6: Add Progress Updates (Initial) <---
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Starting PRD generation process...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Starting PRD generation process...');
      logs.push(`[${new Date().toISOString()}] Starting PRD generation for: ${productDescription.substring(0, 50)}...`);

      // Ensure directories are initialized before writing
      const prdDir = await initDirectories();

    // Generate a filename for storing the PRD
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedName = productDescription.substring(0, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const filename = `${timestamp}-${sanitizedName}-prd.md`;
      filePath = path.join(prdDir, filename); // Assign to outer scope variable

      // ---> Step 2.5(PRD).6: Add Progress Updates (Research Start) <---
      logger.info({ jobId, inputs: { productDescription: productDescription.substring(0, 50) } }, "PRD Generator: Starting pre-generation research...");
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Performing pre-generation research...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Performing pre-generation research...');
      logs.push(`[${new Date().toISOString()}] Starting pre-generation research.`);

      let researchContext = '';
    try {
      // Define relevant research queries
      const query1 = `Market analysis and competitive landscape for: ${productDescription}`;
      const query2 = `User needs, demographics, and expectations for: ${productDescription}`;
      const query3 = `Industry standards, best practices, and common feature sets for products like: ${productDescription}`;

      // Execute research queries in parallel using Perplexity
      const researchResults = await Promise.allSettled([
        performResearchQuery(query1, config), // Uses config.perplexityModel (perplexity/sonar-deep-research)
        performResearchQuery(query2, config),
        performResearchQuery(query3, config)
      ]);

      // Process research results
      researchContext = "## Pre-Generation Research Context (From Perplexity Sonar Deep Research):\n\n";

      // Add results that were fulfilled
      researchResults.forEach((result, index) => {
        const queryLabels = ["Market Analysis", "User Needs & Expectations", "Industry Standards & Best Practices"];
        if (result.status === "fulfilled") {
          researchContext += `### ${queryLabels[index]}:\n${result.value.trim()}\n\n`;
        } else {
          logger.warn({ error: result.reason }, `Research query ${index + 1} failed`);
          researchContext += `### ${queryLabels[index]}:\n*Research on this topic failed.*\n\n`;
        }
      });

      // ---> Step 2.5(PRD).6: Add Progress Updates (Research End) <---
      logger.info({ jobId }, "PRD Generator: Pre-generation research completed.");
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Research complete. Starting main PRD generation...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Research complete. Starting main PRD generation...');
      logs.push(`[${new Date().toISOString()}] Pre-generation research completed.`);

    } catch (researchError) {
      logger.error({ jobId, err: researchError }, "PRD Generator: Error during research aggregation");
      logs.push(`[${new Date().toISOString()}] Error during research aggregation: ${researchError instanceof Error ? researchError.message : String(researchError)}`);
      // Include error in context but continue
      researchContext = "## Pre-Generation Research Context:\n*Error occurred during research phase.*\n\n";
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Warning: Error during research phase. Continuing generation...');
    }

    // Create the main generation prompt with combined research and inputs
    const mainGenerationPrompt = `Create a comprehensive PRD for the following product:\n\n${productDescription}\n\n${researchContext}`;

    // ---> Step 2.5(PRD).6: Add Progress Updates (LLM Call Start) <---
    logger.info({ jobId }, "PRD Generator: Starting main generation using direct LLM call...");
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating PRD content via LLM...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating PRD content via LLM...');
    logs.push(`[${new Date().toISOString()}] Calling LLM for main PRD generation.`);

    const prdMarkdown = await performFormatAwareLlmCallWithCentralizedConfig(
      mainGenerationPrompt,
      PRD_SYSTEM_PROMPT, // Pass the system prompt
      'prd_generation', // Logical task name
      'markdown', // Explicitly specify markdown format
      undefined, // No schema for markdown
      0.3 // Slightly higher temp might be okay for PRD text
    );

    // ---> Step 2.5(PRD).6: Add Progress Updates (LLM Call End) <---
    logger.info({ jobId }, "PRD Generator: Main generation completed.");
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Processing LLM response...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Processing LLM response...');
    logs.push(`[${new Date().toISOString()}] Received response from LLM.`);

    // Basic validation: Check if the output looks like Markdown and contains expected elements
    if (!prdMarkdown || typeof prdMarkdown !== 'string' || !prdMarkdown.trim().startsWith('# PRD:')) {
      logger.warn({ jobId, markdown: prdMarkdown?.substring(0, 100) }, 'PRD generation returned empty or potentially invalid Markdown format.');
      logs.push(`[${new Date().toISOString()}] Validation Error: LLM output invalid format.`);
      throw new ToolExecutionError('PRD generation returned empty or invalid Markdown content.');
    }

    // Format the PRD (already should be formatted by LLM, just add timestamp)
    const formattedResult = `${prdMarkdown}\n\n_Generated: ${new Date().toLocaleString()}_`;

    // ---> Step 2.5(PRD).6: Add Progress Updates (Saving File) <---
    logger.info({ jobId }, `Saving PRD to ${filePath}...`);
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Saving PRD to file...`);
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Saving PRD to file...`);
    logs.push(`[${new Date().toISOString()}] Saving PRD to ${filePath}.`);

    // Save the result
    try {
      await fs.writeFile(filePath, formattedResult, 'utf8');
      logger.info({ jobId }, `PRD generated and saved to ${filePath}`);
      logs.push(`[${new Date().toISOString()}] PRD saved successfully.`);
    } catch (fileError) {
      const errorDetails = fileError instanceof Error ? fileError.message : String(fileError);
      logger.error({ err: fileError, jobId, filePath }, `Failed to write PRD file: ${errorDetails}`);
      logs.push(`[${new Date().toISOString()}] File write error: ${errorDetails} for path: ${filePath}`);
      throw new AppError(`Failed to save PRD file to ${filePath}: ${errorDetails}`, { code: 'FILE_WRITE_ERROR', filePath }, fileError as Error);
    }
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `PRD saved successfully.`);

    // ---> Step 2.5(PRD).7: Update Final Result/Error Handling (Set Success Result) <---
    const finalResult: CallToolResult = {
      // Include file path in success message
      content: [{ type: "text", text: `PRD generated successfully and saved to: ${filePath}\n\n${formattedResult}` }],
      isError: false
    };
    jobManager.setJobResult(jobId, finalResult);
    // Optional explicit SSE: sseNotifier.sendProgress(sessionId, jobId, JobStatus.COMPLETED, 'PRD generation completed successfully.');

    // ---> Step 2.5(PRD).7: Update Final Result/Error Handling (Catch Block) <---
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, jobId, tool: 'generate-prd', params }, `PRD Generator Error: ${errorMsg}`);
      logs.push(`[${new Date().toISOString()}] Error: ${errorMsg}`);

      // Handle specific errors from direct call or research
      let appError: AppError;
      const cause = error instanceof Error ? error : undefined;
      if (error instanceof AppError) {
        appError = error;
      } else {
        appError = new ToolExecutionError(`Failed to generate PRD: ${errorMsg}`, { params, filePath }, cause);
      }

      const mcpError = new McpError(ErrorCode.InternalError, appError.message, appError.context);
      const errorResult: CallToolResult = {
        content: [{ type: 'text', text: `Error during background job ${jobId}: ${mcpError.message}\n\nLogs:\n${logs.join('\n')}` }],
        isError: true,
        errorDetails: mcpError
      };

      // Store error result in Job Manager
      jobManager.setJobResult(jobId, errorResult);
      // Send final failed status via SSE (optional if jobManager handles it)
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Job failed: ${mcpError.message}`);
    }
  }); // ---> END OF setImmediate WRAPPER <---

  return initialResponse; // Return the initial response with Job ID
};

// --- Tool Registration ---

// Tool definition for the PRD generator tool
const prdToolDefinition: ToolDefinition = {
  name: "prd-generator",
  description: "Creates comprehensive product requirements documents based on a product description and research.",
  inputSchema: prdInputSchemaShape, // Use the raw shape
  executor: generatePRD // Reference the adapted function
};

// Register the tool with the central registry
registerTool(prdToolDefinition);

import fs from 'fs-extra';
import path from 'path';
// Removed duplicate fs and path imports
import { z } from 'zod';
import { CallToolResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { performResearchQuery } from '../../utils/researchHelper.js';
import { performFormatAwareLlmCall } from '../../utils/llmHelper.js'; // Import the format-aware helper
import logger from '../../logger.js';
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js'; // Import ToolExecutionContext
import { AppError, ToolExecutionError } from '../../utils/errors.js'; // Import necessary errors
import { jobManager, JobStatus } from '../../services/job-manager/index.js'; // Import job manager & status
import { sseNotifier } from '../../services/sse-notifier/index.js'; // Import SSE notifier
import { formatBackgroundJobInitiationResponse } from '../../services/job-response-formatter/index.js';

// Helper function to get the base output directory
function getBaseOutputDir(): string {
  // Prioritize environment variable, resolve to ensure it's treated as an absolute path if provided
  // Fallback to default relative to CWD
  return process.env.VIBE_CODER_OUTPUT_DIR
    ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
    : path.join(process.cwd(), 'VibeCoderOutput');
}

// Define tool-specific directory using the helper
const RESEARCH_DIR = path.join(getBaseOutputDir(), 'research-manager');

// Initialize directories if they don't exist
export async function initDirectories() {
  const baseOutputDir = getBaseOutputDir();
  try {
    await fs.ensureDir(baseOutputDir); // Ensure base directory exists
    const toolDir = path.join(baseOutputDir, 'research-manager');
    await fs.ensureDir(toolDir); // Ensure tool-specific directory exists
    logger.debug(`Ensured research directory exists: ${toolDir}`);
  } catch (error) {
    logger.error({ err: error, path: baseOutputDir }, `Failed to ensure base output directory exists for research-manager.`);
    // Decide if we should re-throw or just log. Logging might be safer.
  }
}

// Research manager-specific system prompt
const RESEARCH_SYSTEM_PROMPT = `
# ROLE & GOAL
You are an expert AI Research Specialist. Your goal is to synthesize initial research findings and the original user query into a comprehensive, well-structured, and insightful research report in Markdown format.

# CORE TASK
Process the initial research findings (provided as context) related to the user's original 'query'. Enhance, structure, and synthesize this information into a high-quality research report.

# INPUT HANDLING
- The user prompt will contain the original 'query' and the initial research findings (likely from Perplexity) under a heading like 'Incorporate this information:'.
- Your task is *not* to perform new research, but to *refine, structure, and deepen* the provided information based on the original query.

# RESEARCH CONTEXT INTEGRATION (Your Input IS the Context)
- Treat the provided research findings as your primary source material.
- Analyze the findings for key themes, data points, conflicting information, and gaps.
- Synthesize the information logically, adding depth and interpretation where possible. Do not simply reformat the input.
- If the initial research seems incomplete based on the original query, explicitly state the limitations or areas needing further investigation in the 'Limitations' section.

# OUTPUT FORMAT & STRUCTURE (Strict Markdown)
- Your entire response **MUST** be valid Markdown.
- Start **directly** with the main title: '# Research Report: [Topic from Original Query]'
- Use the following sections with the specified Markdown heading levels. Include all sections, even if brief.

  ## 1. Executive Summary
  - Provide a brief (2-4 sentence) overview of the key findings and conclusions based *only* on the provided research content.

  ## 2. Key Findings
  - List the most important discoveries or data points from the research as bullet points.
  - Directly synthesize information from the provided research context.

  ## 3. Detailed Analysis
  - Elaborate on the key findings.
  - Organize the information logically using subheadings (###).
  - Discuss different facets of the topic, incorporating various points from the research.
  - Compare and contrast different viewpoints or data points if present in the research.

  ## 4. Practical Applications / Implications
  - Discuss the real-world relevance or potential uses of the researched information.
  - How can this information be applied? What are the consequences?

  ## 5. Limitations and Caveats
  - Acknowledge any limitations mentioned in the research findings.
  - Identify potential gaps or areas where the provided research seems incomplete relative to the original query.
  - Mention any conflicting information found in the research.

  ## 6. Conclusion & Recommendations (Optional)
  - Summarize the main takeaways.
  - If appropriate based *only* on the provided research, suggest potential next steps or areas for further investigation.

# QUALITY ATTRIBUTES
- **Synthesized:** Do not just regurgitate the input; organize, connect, and add analytical value.
- **Structured:** Strictly adhere to the specified Markdown format and sections.
- **Accurate:** Faithfully represent the information provided in the research context.
- **Comprehensive (within context):** Cover the key aspects present in the provided research relative to the query.
- **Clear & Concise:** Use precise language.
- **Objective:** Present the information neutrally, clearly separating findings from interpretation.

# CONSTRAINTS (Do NOT Do the Following)
- **NO Conversational Filler:** Start directly with the '# Research Report: ...' title.
- **NO New Research:** Do not attempt to access external websites or knowledge beyond the provided research context. Your task is synthesis and structuring.
- **NO Hallucination:** Do not invent findings or data not present in the input.
- **NO Process Commentary:** Do not mention Perplexity, Gemini, Default process, or the synthesis process itself.
- **Strict Formatting:** Use \`##\` for main sections and \`###\` for subheadings within the Detailed Analysis. Use bullet points for Key Findings.
`;

/**
 * Perform research on a topic using Perplexity Sonar via OpenRouter and enhance with sequential thinking.
 * This function now acts as the executor for the 'research' tool.
 * @param params The tool parameters, expecting { query: string }.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
// Change signature to match ToolExecutor
export const performResearch: ToolExecutor = async (
  params: Record<string, unknown>,
  config: OpenRouterConfig,
  context?: ToolExecutionContext // Add context parameter
): Promise<CallToolResult> => {
  // ---> Step 2.5(RM).2: Inject Dependencies & Get Session ID <---
  const sessionId = context?.sessionId || 'unknown-session';
  if (sessionId === 'unknown-session') {
      logger.warn({ tool: 'performResearch' }, 'Executing tool without a valid sessionId. SSE progress updates will not be sent.');
  }

  // We can safely access 'query' because executeTool validated it
  const query = params.query as string;

  // ---> Step 2.5(RM).3: Create Job & Return Job ID <---
  const jobId = jobManager.createJob('research', params); // Use original tool name 'research'
  logger.info({ jobId, tool: 'research', sessionId }, 'Starting background job.');

  // Return immediately
  const initialResponse = formatBackgroundJobInitiationResponse(
    jobId,
    'Research',
    `Your research request for query "${query.substring(0, 50)}..." has been submitted. You can retrieve the result using the job ID.`
  );

  // ---> Step 2.5(RM).4: Wrap Logic in Async Block <---
  setImmediate(async () => {
    const logs: string[] = []; // Keep logs specific to this job execution
    let filePath: string = ''; // Define filePath in outer scope for catch block

    // ---> Step 2.5(RM).7: Update Final Result/Error Handling (Try Block Start) <---
    try {
      // ---> Step 2.5(RM).6: Add Progress Updates (Initial) <---
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Starting research process...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Starting research process...');
      logs.push(`[${new Date().toISOString()}] Starting research for: ${query.substring(0, 50)}...`);

      // Ensure directories are initialized before writing
      await initDirectories();

    // Generate a filename for storing research (using the potentially configured RESEARCH_DIR)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedQuery = query.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const filename = `${timestamp}-${sanitizedQuery}-research.md`;
      filePath = path.join(RESEARCH_DIR, filename); // Assign to outer scope variable

      // ---> Step 2.5(RM).6: Add Progress Updates (Perplexity Call Start) <---
      logger.info({ jobId }, `Performing initial research query via Perplexity: ${query.substring(0, 50)}...`);
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Performing initial research query via Perplexity...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Performing initial research query via Perplexity...');
      logs.push(`[${new Date().toISOString()}] Calling Perplexity for initial research.`);

      // Use Perplexity model for research via centralized helper
      const researchResult = await performResearchQuery(query, config);

      // ---> Step 2.5(RM).6: Add Progress Updates (Perplexity Call End / LLM Call Start) <---
      logger.info({ jobId }, "Research Manager: Initial research complete. Enhancing results using direct LLM call...");
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Initial research complete. Enhancing results via LLM...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Initial research complete. Enhancing results via LLM...');
      logs.push(`[${new Date().toISOString()}] Perplexity research complete. Calling LLM for enhancement.`);

      const enhancementPrompt = `Synthesize and structure the following initial research findings based on the original query.\n\nOriginal Query: ${query}\n\nInitial Research Findings:\n${researchResult}`;

    const enhancedResearch = await performFormatAwareLlmCall(
      enhancementPrompt,
      RESEARCH_SYSTEM_PROMPT, // System prompt guides the structuring
      config,
      'research_enhancement', // Define a logical task name for potential mapping
      'markdown', // Explicitly specify markdown format
      undefined, // No schema for markdown
      0.4 // Slightly higher temp for synthesis might be okay
    );

    // ---> Step 2.5(RM).6: Add Progress Updates (LLM Call End) <---
    logger.info({ jobId }, "Research Manager: Enhancement completed.");
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Processing enhanced research...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Processing enhanced research...');
    logs.push(`[${new Date().toISOString()}] LLM enhancement complete.`);

    // Basic validation
    if (!enhancedResearch || typeof enhancedResearch !== 'string' || !enhancedResearch.trim().startsWith('# Research Report:')) {
      logger.warn({ jobId, markdown: enhancedResearch?.substring(0, 100) }, 'Research enhancement returned empty or potentially invalid Markdown format.');
      logs.push(`[${new Date().toISOString()}] Validation Error: LLM output invalid format.`);
      throw new ToolExecutionError('Research enhancement returned empty or invalid Markdown content.');
    }

    // Format the research (already should be formatted by LLM, just add timestamp)
    const formattedResult = `${enhancedResearch}\n\n_Generated: ${new Date().toLocaleString()}_`;

    // ---> Step 2.5(RM).6: Add Progress Updates (Saving File) <---
    logger.info({ jobId }, `Saving research to ${filePath}...`);
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Saving research to file...`);
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Saving research to file...`);
    logs.push(`[${new Date().toISOString()}] Saving research to ${filePath}.`);

    // Save the result
    await fs.writeFile(filePath, formattedResult, 'utf8');
    logger.info({ jobId }, `Research result saved to ${filePath}`);
    logs.push(`[${new Date().toISOString()}] Research saved successfully.`);
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Research saved successfully.`);

    // ---> Step 2.5(RM).7: Update Final Result/Error Handling (Set Success Result) <---
    const finalResult: CallToolResult = {
      // Include file path in success message
      content: [{ type: "text", text: `Research completed successfully and saved to: ${filePath}\n\n${formattedResult}` }],
      isError: false
    };
    jobManager.setJobResult(jobId, finalResult);
    // Optional explicit SSE: sseNotifier.sendProgress(sessionId, jobId, JobStatus.COMPLETED, 'Research completed successfully.');

    // ---> Step 2.5(RM).7: Update Final Result/Error Handling (Catch Block) <---
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, jobId, tool: 'research', query }, `Research Manager Error: ${errorMsg}`);
      logs.push(`[${new Date().toISOString()}] Error: ${errorMsg}`);

      let appError: AppError;
      const cause = error instanceof Error ? error : undefined;
      if (error instanceof AppError) {
         appError = error; // Use existing AppError
      } else {
         appError = new ToolExecutionError(`Failed to perform research for query "${query}": ${errorMsg}`, { query, filePath }, cause);
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

// Define the raw shape for the Zod schema
const researchInputSchemaShape = {
  query: z.string().min(3, { message: "Query must be at least 3 characters long." }).describe("The research query or topic to investigate")
};

// Tool definition for the research tool, using the raw shape
const researchToolDefinition: ToolDefinition = {
  name: "research", // Keep the original tool name
  description: "Performs deep research on a given topic using Perplexity Sonar and enhances the result.",
  inputSchema: researchInputSchemaShape, // Use the raw shape here
  executor: performResearch // Reference the adapted function
};

// Register the tool with the central registry
registerTool(researchToolDefinition);

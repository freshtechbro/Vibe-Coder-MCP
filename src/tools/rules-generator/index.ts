import fs from 'fs-extra';
import path from 'path';
// Removed duplicate fs and path imports
import { z } from 'zod';
import { CallToolResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { performFormatAwareLlmCall } from '../../utils/llmHelper.js'; // Import the new helper
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js'; // Import ToolExecutionContext
import { AppError, ToolExecutionError } from '../../utils/errors.js'; // Import necessary errors
import { jobManager, JobStatus } from '../../services/job-manager/index.js'; // Import job manager & status
import { sseNotifier } from '../../services/sse-notifier/index.js'; // Import SSE notifier
import { formatBackgroundJobInitiationResponse } from '../../services/job-response-formatter/index.js'; // Import the new formatter

// Helper function to get the base output directory
function getBaseOutputDir(): string {
  // Prioritize environment variable, resolve to ensure it's treated as an absolute path if provided
  // Fallback to default relative to CWD
  return process.env.VIBE_CODER_OUTPUT_DIR
    ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
    : path.join(process.cwd(), 'VibeCoderOutput');
}

// Define tool-specific directory using the helper
const RULES_DIR = path.join(getBaseOutputDir(), 'rules-generator');

// Initialize directories if they don't exist
export async function initDirectories() {
  const baseOutputDir = getBaseOutputDir();
  try {
    await fs.ensureDir(baseOutputDir); // Ensure base directory exists
    const toolDir = path.join(baseOutputDir, 'rules-generator');
    await fs.ensureDir(toolDir); // Ensure tool-specific directory exists
    logger.debug(`Ensured rules directory exists: ${toolDir}`);
  } catch (error) {
    logger.error({ err: error, path: baseOutputDir }, `Failed to ensure base output directory exists for rules-generator.`);
    // Decide if we should re-throw or just log. Logging might be safer.
  }
}

// Rules generator-specific system prompt
const RULES_SYSTEM_PROMPT = `
# Rules Generator - Using Research Context

# ROLE & GOAL
You are an expert Software Architect and Lead Developer AI assistant. Your goal is to generate a clear, actionable, and comprehensive set of development rules (guidelines and standards) in Markdown format for a specific software project.

# CORE TASK
Generate a detailed set of development rules based on the user's product description, optional user stories, optional specified rule categories, and the provided research context.

# INPUT HANDLING
- Analyze the 'productDescription' to understand the project type, potential tech stack (if implied), and complexity.
- Consider the optional 'userStories' to infer requirements that might influence rules (e.g., performance needs for specific features).
- If 'ruleCategories' are provided, prioritize generating rules within those categories. If not, cover a broad range of standard categories.
- You will also receive 'Pre-Generation Research Context'.

# RESEARCH CONTEXT INTEGRATION
- **CRITICAL:** Carefully review the '## Pre-Generation Research Context (From Perplexity Sonar Deep Research)' section provided in the user prompt.
- This section contains insights on: Best Practices & Coding Standards, Rule Categories, and Architecture Patterns & File Organization.
- **Use these insights** to:
    - Select relevant rule categories if not specified by the user.
    - Define rules that align with modern best practices for the identified product type/tech stack.
    - Suggest appropriate architecture and file structure conventions based on the research.
    - Provide strong rationale for rules, referencing industry standards where applicable.
- **Synthesize**, don't just copy. Tailor the research findings to the specific project context.

# OUTPUT FORMAT & STRUCTURE (Strict Markdown)
- Your entire response **MUST** be valid Markdown.
- Start **directly** with the main title: '# Development Rules: [Inferred Project Name/Type]'
- Organize rules under relevant category headings (e.g., \`## Category: Code Style & Formatting\`). Use the rule categories identified from input or research. Standard categories include:
    - Code Style & Formatting
    - Naming Conventions
    - Architecture & Design Patterns
    - File & Project Structure
    - State Management (if applicable)
    - API Design (if applicable)
    - Error Handling & Logging
    - Security Practices
    - Performance Optimization
    - Testing Standards
    - Documentation Standards
    - Dependency Management
    - Version Control (Git Flow)
- For **each rule**, use the following precise template:

  ### Rule: [Clear Rule Title Starting with a Verb, e.g., Use PascalCase for Components]

  **Description:** [Concise explanation of what the rule entails.]

  **Rationale:** [Why this rule is important for this specific project. Reference research/best practices.]

  **Applicability:** [Glob patterns or description of where this rule applies (e.g., \`src/components/**/*.tsx\`, "All API endpoint handlers").]

  **Guidelines / Examples:**
  \`\`\`[language, e.g., javascript, typescript, css, python]
  // Good Example:
  [Code snippet illustrating the correct way]

  // Bad Example:
  [Code snippet illustrating the incorrect way]
  \`\`\`
  *(Or provide bulleted guidelines if code examples are not suitable)*

# QUALITY ATTRIBUTES
- **Actionable:** Rules should be concrete and easy to follow.
- **Specific:** Avoid vague statements.
- **Relevant:** Tailored to the project described and informed by research.
- **Comprehensive:** Cover key areas of development.
- **Justified:** Provide clear rationale for each rule.
- **Consistent:** Maintain a uniform format for all rules.
- **Modern:** Reflect current best practices from the research.

# CONSTRAINTS (Do NOT Do the Following)
- **NO Conversational Filler:** Start directly with the '# Development Rules: ...' title. No greetings, summaries, or apologies.
- **NO Markdown Violations:** Strictly adhere to the specified Markdown format, especially the rule template.
- **NO External Knowledge:** Base rules *only* on the provided inputs and research context.
- **NO Process Commentary:** Do not mention Perplexity, Gemini, Default process, or the generation process in the output.
- **Strict Formatting:** Use \`##\` for categories and \`###\` for individual rule titles. Use the exact field names (Description, Rationale, etc.) in bold. Use code blocks with language hints for examples.
`;

// Define Input Type based on Schema
const rulesInputSchemaShape = {
  productDescription: z.string().min(10, { message: "Product description must be at least 10 characters." }).describe("Description of the product being developed"),
  userStories: z.string().optional().describe("Optional user stories to inform the rules"),
  ruleCategories: z.array(z.string()).optional().describe("Optional categories of rules to generate (e.g., 'Code Style', 'Security')")
};
// Remove inferred type, as ToolExecutor expects Record<string, any>
// type RulesInput = z.infer<typeof z.object(rulesInputSchemaShape)>;

/**
 * Generate development rules based on a product description.
 * This function now acts as the executor for the 'generate-rules' tool.
 * @param params The validated tool parameters.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
export const generateRules: ToolExecutor = async (
  params: Record<string, unknown>, // More type-safe than 'any'
  config: OpenRouterConfig,
  context?: ToolExecutionContext // Add context parameter
): Promise<CallToolResult> => {
  // ---> Step 2.5(Rules).2: Inject Dependencies & Get Session ID <---
  const sessionId = context?.sessionId || 'unknown-session';
  if (sessionId === 'unknown-session') {
      logger.warn({ tool: 'generateRules' }, 'Executing tool without a valid sessionId. SSE progress updates will not be sent.');
  }

  // Log the config received by the executor
  logger.debug({
    configReceived: true,
    hasLlmMapping: Boolean(config.llm_mapping),
    mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
  }, 'generateRules executor received config');

  // Access properties via params, asserting types as they've been validated by executeTool
  const productDescription = params.productDescription as string;
  const userStories = params.userStories as string | undefined;
  const ruleCategories = params.ruleCategories as string[] | undefined;

  // ---> Step 2.5(Rules).3: Create Job & Return Job ID <---
  const jobId = jobManager.createJob('generate-rules', params);
  logger.info({ jobId, tool: 'generateRules', sessionId }, 'Starting background job.');

  // Use the shared service to format the initial response
  const initialResponse = formatBackgroundJobInitiationResponse(
    jobId,
    'generate-rules', // Internal tool name
    'Rules Generator' // User-friendly display name
  );

  // ---> Step 2.5(Rules).4: Wrap Logic in Async Block <---
  setImmediate(async () => {
    const logs: string[] = []; // Keep logs specific to this job execution
    let filePath: string = ''; // Define filePath in outer scope for catch block

    // ---> Step 2.5(Rules).7: Update Final Result/Error Handling (Try Block Start) <---
    try {
      // ---> Step 2.5(Rules).6: Add Progress Updates (Initial) <---
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Starting rules generation process...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Starting rules generation process...');
      logs.push(`[${new Date().toISOString()}] Starting rules generation for: ${productDescription.substring(0, 50)}...`);

      // Ensure directories are initialized before writing
      await initDirectories();

    // Generate a filename for storing the rules (using the potentially configured RULES_DIR)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedName = productDescription.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const filename = `${timestamp}-${sanitizedName}-rules.md`;
      filePath = path.join(RULES_DIR, filename); // Assign to outer scope variable

      // ---> Step 2.5(Rules).6: Add Progress Updates (Research Start) <---
      logger.info({ jobId, inputs: { productDescription: productDescription.substring(0, 50), userStories: userStories?.substring(0, 50), ruleCategories } }, "Rules Generator: Starting pre-generation research...");
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Performing pre-generation research...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Performing pre-generation research...');
      logs.push(`[${new Date().toISOString()}] Starting pre-generation research.`);

      let researchContext = '';
    try {
      // Define relevant research queries
      const query1 = `Best development practices and coding standards for building: ${productDescription}`;

      const query2 = ruleCategories && ruleCategories.length > 0
        ? `Specific rules and guidelines for these categories in software development: ${ruleCategories.join(', ')}`
        : `Common software development rule categories for: ${productDescription}`;

      // Extract product type for the third query
      const productTypeLowercase = productDescription.toLowerCase();
      let productType = "software application";
      if (productTypeLowercase.includes("web") || productTypeLowercase.includes("website")) {
        productType = "web application";
      } else if (productTypeLowercase.includes("mobile") || productTypeLowercase.includes("app")) {
        productType = "mobile application";
      } else if (productTypeLowercase.includes("api")) {
        productType = "API service";
      } else if (productTypeLowercase.includes("game")) {
        productType = "game";
      }

      const query3 = `Modern architecture patterns and file organization for ${productType} development`;

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
        const queryLabels = ["Best Practices", "Rule Categories", "Architecture Patterns"];
        if (result.status === "fulfilled") {
          researchContext += `### ${queryLabels[index]}:\n${result.value.trim()}\n\n`;
        } else {
          logger.warn({ error: result.reason }, `Research query ${index + 1} failed`);
          researchContext += `### ${queryLabels[index]}:\n*Research on this topic failed.*\n\n`;
        }
      });

      // ---> Step 2.5(Rules).6: Add Progress Updates (Research End) <---
      logger.info({ jobId }, "Rules Generator: Pre-generation research completed.");
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Research complete. Starting main rules generation...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Research complete. Starting main rules generation...');
      logs.push(`[${new Date().toISOString()}] Pre-generation research completed.`);

    } catch (researchError) {
      logger.error({ jobId, err: researchError }, "Rules Generator: Error during research aggregation");
      logs.push(`[${new Date().toISOString()}] Error during research aggregation: ${researchError instanceof Error ? researchError.message : String(researchError)}`);
      // Include error in context but continue
      researchContext = "## Pre-Generation Research Context:\n*Error occurred during research phase.*\n\n";
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Warning: Error during research phase. Continuing generation...');
    }

    // Create the main generation prompt with combined research and inputs
    let mainGenerationPrompt = `Create a comprehensive set of development rules for the following product:\n\n${productDescription}`;

    if (userStories) {
      mainGenerationPrompt += `\n\nBased on these user stories:\n\n${userStories}`;
    }

    if (ruleCategories && ruleCategories.length > 0) {
      // Add explicit type 'string' for c
      mainGenerationPrompt += `\n\nFocus on these rule categories:\n${ruleCategories.map((c: string) => `- ${c}`).join('\n')}`;
    }

    // Add research context to the prompt
    mainGenerationPrompt += `\n\n${researchContext}`;

    // ---> Step 2.5(Rules).6: Add Progress Updates (LLM Call Start) <---
    logger.info({ jobId }, "Rules Generator: Starting main generation using direct LLM call...");
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating rules content via LLM...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating rules content via LLM...');
    logs.push(`[${new Date().toISOString()}] Calling LLM for main rules generation.`);

    const rulesMarkdown = await performFormatAwareLlmCall(
      mainGenerationPrompt,
      RULES_SYSTEM_PROMPT, // Pass the system prompt
      config,
      'rules_generation', // Logical task name
      'markdown', // Explicitly specify markdown format
      undefined, // No schema for markdown
      0.2 // Low temperature for structured rules
    );

    // ---> Step 2.5(Rules).6: Add Progress Updates (LLM Call End) <---
    logger.info({ jobId }, "Rules Generator: Main generation completed.");
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Processing LLM response...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Processing LLM response...');
    logs.push(`[${new Date().toISOString()}] Received response from LLM.`);

    // Basic validation: Check if the output looks like Markdown and contains expected elements
    if (!rulesMarkdown || typeof rulesMarkdown !== 'string' || !rulesMarkdown.trim().startsWith('# Development Rules:')) {
      logger.warn({ jobId, markdown: rulesMarkdown?.substring(0, 100) }, 'Rules generation returned empty or potentially invalid Markdown format.');
      logs.push(`[${new Date().toISOString()}] Validation Error: LLM output invalid format.`);
      throw new ToolExecutionError('Rules generation returned empty or invalid Markdown content.');
    }

    // Format the rules (already should be formatted by LLM, just add timestamp)
    const formattedResult = `${rulesMarkdown}\n\n_Generated: ${new Date().toLocaleString()}_`;

    // ---> Step 2.5(Rules).6: Add Progress Updates (Saving File) <---
    logger.info({ jobId }, `Saving rules to ${filePath}...`);
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Saving rules to file...`);
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Saving rules to file...`);
    logs.push(`[${new Date().toISOString()}] Saving rules to ${filePath}.`);

    // Save the result
    await fs.writeFile(filePath, formattedResult, 'utf8');
    logger.info({ jobId }, `Rules generated and saved to ${filePath}`);
    logs.push(`[${new Date().toISOString()}] Rules saved successfully.`);
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Rules saved successfully.`);

    // ---> Step 2.5(Rules).7: Update Final Result/Error Handling (Set Success Result) <---
    const finalResult: CallToolResult = {
      // Include file path in success message
      content: [{ type: "text", text: `Development rules generated successfully and saved to: ${filePath}\n\n${formattedResult}` }],
      isError: false
    };
    jobManager.setJobResult(jobId, finalResult);
    // Optional explicit SSE: sseNotifier.sendProgress(sessionId, jobId, JobStatus.COMPLETED, 'Rules generation completed successfully.');

    // ---> Step 2.5(Rules).7: Update Final Result/Error Handling (Catch Block) <---
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, jobId, tool: 'generate-rules', params }, `Rules Generator Error: ${errorMsg}`);
      logs.push(`[${new Date().toISOString()}] Error: ${errorMsg}`);

      // Handle specific errors from direct call or research
      let appError: AppError;
      const cause = error instanceof Error ? error : undefined;
      if (error instanceof AppError) {
        appError = error;
      } else {
        appError = new ToolExecutionError(`Failed to generate development rules: ${errorMsg}`, { params, filePath }, cause);
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

// Tool definition for the rules generator tool
const rulesToolDefinition: ToolDefinition = {
  name: "generate-rules",
  description: "Creates project-specific development rules based on product description, user stories, and research.",
  inputSchema: rulesInputSchemaShape, // Use the raw shape
  executor: generateRules // Reference the adapted function
};

// Register the tool with the central registry
registerTool(rulesToolDefinition);

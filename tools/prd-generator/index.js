import path from 'path';

// Removed duplicate fs and path imports
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs-extra';
import { z } from 'zod';

import logger from '../../logger.js';
import { registerTool } from '../../services/routing/toolRegistry.js';
import { AppError, ToolExecutionError } from '../../utils/errors.js'; // Import necessary errors
import { performDirectLlmCall } from '../../utils/llmHelper.js'; // Import the new helper
import { performResearchQuery } from '../../utils/researchHelper.js';
// Helper function to get the base output directory
function getBaseOutputDir() {
  // Prioritize environment variable, resolve to ensure it's treated as an absolute path if provided
  // Fallback to default relative to CWD
  return process.env.VIBE_CODER_OUTPUT_DIR
    ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
    : path.join(process.cwd(), 'workflow-agent-files');
}
// Define tool-specific directory using the helper
const PRD_DIR = path.join(getBaseOutputDir(), 'prd-generator');
// Initialize directories if they don't exist
export async function initDirectories() {
  const baseOutputDir = getBaseOutputDir();
  try {
    await fs.ensureDir(baseOutputDir); // Ensure base directory exists
    const toolDir = path.join(baseOutputDir, 'prd-generator');
    await fs.ensureDir(toolDir); // Ensure tool-specific directory exists
    logger.debug(`Ensured PRD directory exists: ${toolDir}`);
  } catch (error) {
    logger.error(
      { err: error, path: baseOutputDir },
      `Failed to ensure base output directory exists for prd-generator.`
    );
    // Decide if we should re-throw or just log. Logging might be safer.
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
- **CRITICAL:** Carefully review the '## Pre-Generation Research Context (From Research)' section provided in the user prompt.
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
- **NO Process Commentary:** Do not mention the research process or the models used within the PRD output itself.
- **Strict Formatting:** Adhere strictly to the section structure and Markdown heading levels specified.
`;
// Define Input Type based on Schema
const prdInputSchemaShape = {
  productDescription: z
    .string()
    .min(10, { message: 'Product description must be at least 10 characters.' })
    .describe('Description of the product to create a PRD for'),
};
/**
 * Generate a PRD for a product based on a description.
 * This function now acts as the executor for the 'generate-prd' tool.
 * @param params The validated tool parameters.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
export const generatePRD = async (
  params, // More type-safe than 'any'
  config
) => {
  // Log the config received by the executor
  logger.debug(
    {
      configReceived: true,
      hasLlmMapping: Boolean(config.llm_mapping),
      mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : [],
    },
    'generatePRD executor received config'
  );
  const productDescription = params.productDescription; // Assert type after validation
  try {
    // Ensure directories are initialized before writing
    await initDirectories();
    // Generate a filename for storing the PRD (using the potentially configured PRD_DIR)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedName = productDescription
      .substring(0, 30)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const filename = `${timestamp}-${sanitizedName}-prd.md`;
    const filePath = path.join(PRD_DIR, filename);
    // Perform parallel research tasks using appropriate research model
    const researchPrompt = `Based on the product description: ${productDescription}, what are the key requirements, features, specifications, and competitive analysis that should be included in a detailed Product Requirements Document (PRD)?`;
    const [r1, r2, r3] = await Promise.all([
      performResearchQuery(researchPrompt, config), // Uses config.llm_mapping['research_execution']
      performResearchQuery(researchPrompt, config),
      performResearchQuery(researchPrompt, config),
    ]);

    // Process research results
    let researchContext =
      '## Pre-Generation Research Context (From Research):\n\n';
    // Add results that were fulfilled
    [r1, r2, r3].forEach((result, index) => {
      const queryLabels = [
        'Market Analysis',
        'User Needs & Expectations',
        'Industry Standards & Best Practices',
      ];
      if (result.status === 'fulfilled') {
        researchContext += `### ${queryLabels[index]}:\n${result.value.trim()}\n\n`;
      } else {
        logger.warn(
          { error: result.reason },
          `Research query ${index + 1} failed`
        );
        researchContext += `### ${queryLabels[index]}:\n*Research on this topic failed.*\n\n`;
      }
    });
    logger.info('PRD Generator: Pre-generation research completed.');
    // Create the main generation prompt with combined research and inputs
    const mainGenerationPrompt = `Create a comprehensive PRD for the following product:\n\n${productDescription}\n\n${researchContext}`;
    // Process the PRD generation using a direct LLM call
    logger.info(
      'PRD Generator: Starting main generation using direct LLM call...'
    );
    const prdMarkdown = await performDirectLlmCall(
      mainGenerationPrompt,
      PRD_SYSTEM_PROMPT, // Pass the system prompt
      config,
      'prd_generation', // Logical task name
      0.3 // Slightly higher temp might be okay for PRD text
    );
    logger.info('PRD Generator: Main generation completed.');
    // Basic validation: Check if the output looks like Markdown and contains expected elements
    if (
      !prdMarkdown ||
      typeof prdMarkdown !== 'string' ||
      !prdMarkdown.trim().startsWith('# PRD:')
    ) {
      logger.warn(
        { markdown: prdMarkdown },
        'PRD generation returned empty or potentially invalid Markdown format.'
      );
      throw new ToolExecutionError(
        'PRD generation returned empty or invalid Markdown content.'
      );
    }
    // Format the PRD (already should be formatted by LLM, just add timestamp)
    const formattedResult = `${prdMarkdown}\n\n_Generated: ${new Date().toLocaleString()}_`;
    // Save the result
    await fs.writeFile(filePath, formattedResult, 'utf8');
    logger.info(`PRD generated and saved to ${filePath}`);
    // Return success result
    return {
      content: [{ type: 'text', text: formattedResult }],
      isError: false,
    };
  } catch (error) {
    logger.error({ err: error, params }, 'PRD Generator Error');
    // Handle specific errors from direct call or research
    let appError;
    if (error instanceof AppError) {
      appError = error;
    } else if (error instanceof Error) {
      appError = new ToolExecutionError(
        'Failed to generate PRD.',
        { originalError: error.message },
        error
      );
    } else {
      appError = new ToolExecutionError(
        'An unknown error occurred while generating the PRD.',
        { thrownValue: String(error) }
      );
    }
    const mcpError = new McpError(
      ErrorCode.InternalError,
      appError.message,
      appError.context
    );
    return {
      content: [{ type: 'text', text: `Error: ${mcpError.message}` }],
      isError: true,
      errorDetails: mcpError,
    };
  }
};
// --- Tool Registration ---
// Tool definition for the PRD generator tool
const prdToolDefinition = {
  name: 'generate-prd',
  description:
    'Creates comprehensive product requirements documents based on a product description and research.',
  inputSchema: prdInputSchemaShape, // Use the raw shape
  executor: generatePRD, // Reference the adapted function
};
// Register the tool with the central registry
registerTool(prdToolDefinition);

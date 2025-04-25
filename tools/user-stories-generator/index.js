import path from 'path';

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs-extra';
import { z } from 'zod';

import logger from '../../logger.js';
import { registerTool } from '../../services/routing/toolRegistry.js';
import { AppError, ToolExecutionError } from '../../utils/errors.js';
import { performDirectLlmCall } from '../../utils/llmHelper.js';
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
const USER_STORIES_DIR = path.join(
  getBaseOutputDir(),
  'user-stories-generator'
);

// Initialize directories if they don't exist
export async function initDirectories() {
  const baseOutputDir = getBaseOutputDir();
  try {
    await fs.ensureDir(baseOutputDir); // Ensure base directory exists
    const toolDir = path.join(baseOutputDir, 'user-stories-generator');
    await fs.ensureDir(toolDir); // Ensure tool-specific directory exists
    logger.debug(`Ensured user stories directory exists: ${toolDir}`);
  } catch (error) {
    logger.error(
      { err: error, path: baseOutputDir },
      `Failed to ensure base output directory exists for user-stories-generator.`
    );
    // Decide if we should re-throw or just log. Logging might be safer.
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
- You will also receive 'Research Context'.

# RESEARCH CONTEXT INTEGRATION
- **CRITICAL:** Carefully review the '## Research Context (From LLM Research)' section provided in the user prompt.
- This section contains insights on: User needs, behaviors, and scenarios, Most valuable user stories and features, and User demographics, pain points, and goals.
- **Use these insights** heavily to:
    - Define realistic 'As a [user type/persona]' roles based on the research.
    - Create stories that address identified 'User needs, behaviors, and scenarios'.
    - Ensure stories align with 'User demographics, pain points, and goals'.
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
  productDescription: z
    .string()
    .min(10, { message: 'Product description must be at least 10 characters.' })
    .describe('Description of the product to create user stories for'),
};

/**
 * Generate user stories based on a product description.
 * This function now acts as the executor for the 'generate-user-stories' tool.
 * @param params The validated tool parameters.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
export const generateUserStories = async (
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
    'generateUserStories executor received config'
  );
  const productDescription = params.productDescription; // Assert type after validation
  try {
    // Ensure directories are initialized before writing
    await initDirectories();
    // Generate a filename for storing the user stories (using the potentially configured USER_STORIES_DIR)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedName = productDescription
      .substring(0, 30)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const filename = `${timestamp}-${sanitizedName}-user-stories.md`;
    const filePath = path.join(USER_STORIES_DIR, filename);
    // Define relevant research queries for the product
    const query1 = `User needs, behaviors, and scenarios for: ${productDescription}`;
    const query2 = `Most valuable user stories and features for products like: ${productDescription}`;
    const query3 = `User demographics, pain points, and goals for: ${productDescription}`;

    // Execute research queries in parallel using configured research model
    const researchResults = await Promise.allSettled([
      performResearchQuery(query1, config), // Uses config.llm_mapping['research_execution']
      performResearchQuery(query2, config),
      performResearchQuery(query3, config),
    ]);

    // Process research results
    let researchContext = '## Research Context (From LLM Research):\n\n';
    // Add results that were fulfilled
    researchResults.forEach((result, index) => {
      const queryLabels = [
        'User needs, behaviors, and scenarios',
        'Most valuable user stories and features',
        'User demographics, pain points, and goals',
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
    logger.info('User Stories Generator: Pre-generation research completed.');
    // Create the main generation prompt with combined research and inputs
    const mainGenerationPrompt = `Create comprehensive user stories for the following product:\n\n${productDescription}\n\n${researchContext}`;
    // Process the user stories generation using a direct LLM call
    logger.info(
      'User Stories Generator: Starting main generation using direct LLM call...'
    );
    const userStoriesMarkdown = await performDirectLlmCall(
      mainGenerationPrompt,
      USER_STORIES_SYSTEM_PROMPT, // Pass the system prompt
      config,
      'user_stories_generation', // Logical task name
      0.3 // Slightly higher temp might be okay for creative text like stories
    );
    logger.info('User Stories Generator: Main generation completed.');
    // Basic validation: Check if the output looks like Markdown and contains expected elements
    if (
      !userStoriesMarkdown ||
      typeof userStoriesMarkdown !== 'string' ||
      !userStoriesMarkdown.trim().startsWith('# User Stories:')
    ) {
      logger.warn(
        { markdown: userStoriesMarkdown },
        'User stories generation returned empty or potentially invalid Markdown format.'
      );
      // Consider if this should be a hard error or just a warning
      throw new ToolExecutionError(
        'User stories generation returned empty or invalid Markdown content.'
      );
    }
    // Format the user stories (already should be formatted by LLM, just add timestamp)
    const formattedResult = `${userStoriesMarkdown}\n\n_Generated: ${new Date().toLocaleString()}_`;
    // Save the result
    await fs.writeFile(filePath, formattedResult, 'utf8');
    logger.info(`User stories generated and saved to ${filePath}`);
    // Return success result
    return {
      content: [{ type: 'text', text: formattedResult }],
      isError: false,
    };
  } catch (error) {
    logger.error({ err: error, params }, 'User Stories Generator Error');
    // Handle specific errors from direct call or research
    let appError;
    if (error instanceof AppError) {
      appError = error;
    } else if (error instanceof Error) {
      appError = new ToolExecutionError(
        'Failed to generate user stories.',
        { originalError: error.message },
        error
      );
    } else {
      appError = new ToolExecutionError(
        'An unknown error occurred while generating user stories.',
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
// Tool definition for the user stories generator tool
const userStoriesToolDefinition = {
  name: 'generate-user-stories',
  description:
    'Creates detailed user stories with acceptance criteria based on a product description and research.',
  inputSchema: userStoriesInputSchemaShape, // Use the raw shape
  executor: generateUserStories, // Reference the adapted function
};

// Register the tool with the central registry
registerTool(userStoriesToolDefinition);

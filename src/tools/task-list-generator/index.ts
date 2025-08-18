// src/tools/task-list-generator/index.ts
import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod';
import { CallToolResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { performFormatAwareLlmCallWithCentralizedConfig } from '../../utils/llmHelper.js';
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { AppError, ToolExecutionError } from '../../utils/errors.js';
import { jobManager, JobStatus } from '../../services/job-manager/index.js';
import { sseNotifier } from '../../services/sse-notifier/index.js';
import { formatBackgroundJobInitiationResponse } from '../../services/job-response-formatter/index.js';
import { getToolOutputDirectory, ensureToolOutputDirectory } from '../vibe-task-manager/security/unified-security-config.js';

// --- Constants ---
const TASK_LIST_DIR_NAME = 'generated_task_lists';

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

// Define tool-specific directory using the helper
const TASK_LIST_DIR = path.join(getBaseOutputDir(), TASK_LIST_DIR_NAME);

// Ensure directories exist
export async function initDirectories() {
  try {
    const toolDir = await ensureToolOutputDirectory(TASK_LIST_DIR_NAME);
    logger.debug(`Ensured task list directory exists: ${toolDir}`);
  } catch (error) {
    logger.error({ err: error }, `Failed to ensure base output directory exists for task-list-generator.`);
    // Fallback to original implementation for backward compatibility
    const baseOutputDir = getBaseOutputDir();
    try {
      await fs.ensureDir(baseOutputDir);
      const toolDir = path.join(baseOutputDir, TASK_LIST_DIR_NAME);
      await fs.ensureDir(toolDir);
      logger.debug(`Ensured task list directory exists (fallback): ${toolDir}`);
    } catch (fallbackError) {
      logger.error({ err: fallbackError, path: baseOutputDir }, `Fallback directory creation also failed.`);
    }
  }
}

// --- System Prompts ---
const INITIAL_TASK_LIST_SYSTEM_PROMPT = `
# Task List Generator - High-Level Tasks

# ROLE & GOAL
You are an expert Project Manager AI. Your goal is to generate ONLY the high-level development tasks (typically corresponding to Epics or major features) based on user stories and research context. DO NOT decompose into sub-tasks yet.

# CORE TASK
Generate a high-level, hierarchical development task list based on the user's product description, provided user stories, and research context. Focus on major phases and features.

# INPUT HANDLING
- Analyze 'productDescription' and 'userStories'.
- Analyze 'Pre-Generation Research Context' for lifecycle phases and key areas.

# RESEARCH CONTEXT INTEGRATION
- Use research insights (Lifecycle, Estimation, Team Structure) to:
    - Structure the list logically by standard phases (e.g., Setup, Backend, Frontend, Testing, Deployment).
    - Define realistic 'Dependencies' between these high-level tasks.
    - Apply appropriate relative 'Estimated Effort' (Small, Medium, Large).

# OUTPUT FORMAT & STRUCTURE (Strict Markdown)
- Your entire response **MUST** be valid Markdown.
- Start **directly** with the main title: '# Task List: [Inferred Product Name]'
- Organize tasks hierarchically using Markdown headings and nested lists:
    - \`## Phase: [Phase Name]\`
    - \`### Epic/Feature: [Related Epic or Feature]\` (Optional grouping)
    - Use a single level of bullet points (\`-\`) for the high-level tasks.
- For **each High-Level Task**, include ONLY the following details:
    - **ID:** T-[auto-incrementing number, e.g., T-101]
    - **Title:** [Clear, Action-Oriented Task Title]
    - *(Description):* [Brief explanation.]
    - *(User Story):* [ID(s) of related User Story | N/A]
    - *(Priority):* [High | Medium | Low]
    - *(Dependencies):* [List of Task IDs | None]
    - *(Est. Effort):* [Small | Medium | Large]

**Example High-Level Task Format:**
\`\`\`markdown
- **ID:** T-201
  **Title:** Implement User Authentication Backend
  *(Description):* Set up API endpoints and logic for user registration, login, and session management.
  *(User Story):* US-101, US-102
  *(Priority):* High
  *(Dependencies):* T-101
  *(Est. Effort):* Large
\`\`\`

# CONSTRAINTS
- **NO SUB-TASKS:** Do NOT break tasks down further in this step.
- **NO Conversational Filler.** Start directly with '# Task List: ...'.
- **Strict Formatting:** Use \`##\` for Phases, \`###\` for Epics, \`-\` for tasks. Use exact field names in bold.
- **IMPORTANT:** Your thought must contain ONLY the properly formatted Markdown task list.
`;

const TASK_DECOMPOSITION_SYSTEM_PROMPT = `
# Task Decomposition Specialist

# ROLE & GOAL
You are an expert Technical Lead specializing in breaking down a single software development task into its smallest, most actionable sub-components. Your goal is to take ONE high-level task and decompose it into detailed sub-tasks suitable for individual assignment, including specific implementation guidance.

# CORE TASK
Decompose the provided high-level task into the smallest possible, independently executable sub-tasks. For each sub-task, provide detailed implementation guidance.

# INPUT
You will receive the details of a SINGLE high-level task (the Parent Task), including its ID, Title, Description, etc.

# OUTPUT FORMAT & STRUCTURE (Strict Markdown List of Sub-Tasks ONLY)
- Your entire response **MUST** be a Markdown list containing **only** the sub-tasks derived from the single Parent Task provided.
- **DO NOT** repeat the Parent Task details in your output.
- **DO NOT** include any introductory text, concluding text, or phase/epic headings. Just the flat list of sub-tasks for the *one* parent task.
- For **each sub-task**, use the following precise format as a list item. **Adhere EXACTLY to this structure, field names, bolding, and indentation.**

- **Sub-Task ID:** {Parent Task ID}.[auto-incrementing number starting from 1, e.g., T-101.1, T-101.2]
  **Goal:** [Briefly state the specific objective of this sub-task.]
  **Task:** [Clear, highly specific action for the developer to perform.]
  **Rationale:** [Explain *why* this sub-task is necessary and how it contributes to the parent task.]
  **Expected Outcome:** [Describe the concrete, verifiable result of completing this sub-task.]
  **Objectives:** [Bulleted list of specific, measurable mini-goals or checks for this sub-task. Each objective MUST start with '* '. ]
    * Objective 1
    * Objective 2
  **Implementation Prompt:** [A detailed, guiding prompt for an AI coding assistant (like Cline) to implement this specific sub-task. Be language/framework specific if possible based on context from the Parent Task Description/Title.]
  **Example Code:**
  \`\`\`[language, e.g., python, typescript, jsx]
  // Provide a concise, relevant code snippet or structure example
  // illustrating the expected implementation approach.
  // Keep it focused on the sub-task's core logic. Use placeholders.
  \`\`\`

# DECOMPOSITION GUIDELINES
- Break the parent task down until sub-tasks represent roughly 1-4 hours of focused work, if possible.
- Sub-tasks should be logically sequential where necessary.
- Ensure sub-tasks collectively fulfill the parent task's description and objectives.
- Focus on technical implementation steps (e.g., "Define database schema", "Create API endpoint", "Implement UI component", "Write unit test").

# IMPLEMENTATION PROMPT & EXAMPLE CODE GUIDELINES
- The **Implementation Prompt** should be clear enough for another AI to take it and generate the required code. Include necessary context (e.g., function names, variable types, expected inputs/outputs).
- The **Example Code** should be a minimal, illustrative snippet demonstrating the pattern or key part of the implementation, not the full solution. Infer the likely language/framework if possible.

# CONSTRAINTS (MANDATORY)
- **ONLY output the Markdown list of sub-tasks.** No other text, explanations, or summaries before or after the list.
- Adhere **STRICTLY** to the sub-task format provided above. Double-check field names, bolding, indentation, and the bullet points for Objectives.
- Ensure sub-task IDs correctly follow the parent ID (e.g., T-101.1, T-101.2 for parent T-101). Start numbering from .1 for each parent.
- The **Example Code** section MUST use triple backticks (\`\`\`) with a language identifier.
- **Before finishing, review your generated list one last time to ensure it perfectly matches the required format.**
- **IMPORTANT:** Your thought must contain ONLY the properly formatted Markdown sub-task list.
`;

// --- Zod Schema ---
const taskListInputSchemaShape = {
  productDescription: z.string().min(10, { message: "Product description must be at least 10 characters." }).describe("Description of the product"),
  userStories: z.string().min(20, { message: "User stories must be provided and be at least 20 characters." }).describe("User stories (in Markdown format) to use for task list generation")
};

// --- Helper Functions ---
interface ParsedTask {
  id: string;
  title: string;
  description: string;
  userStory: string;
  priority: string;
  dependencies: string;
  effort: string;
  markdownLine: string;
  subTasksMarkdown?: string;
}

function parseHighLevelTasks(markdownContent: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const lines = markdownContent.split('\n');
  let currentTask: Partial<ParsedTask> | null = null;
  let currentTaskLines: string[] = [];
  const idRegex = /^\s*-\s+\*\*ID:\*\*\s*(T-\d+)/;
  const titleRegex = /^\s+\*\*Title:\*\*\s*(.*)/;
  const fieldRegex = /^\s+\*\(([\w\s.]+)\):\*\s*(.*)/;

  function finalizeCurrentTask() {
    if (currentTask && currentTask.id && currentTask.title) {
      currentTask.markdownLine = currentTaskLines.join('\n');
      tasks.push(currentTask as ParsedTask);
    } else if (currentTask) {
      logger.warn({ task: currentTask }, "Discarding incomplete task block during parsing.");
    }
    currentTask = null;
    currentTaskLines = [];
  }

  for (const line of lines) {
    const idMatch = line.match(idRegex);
    if (idMatch) {
      finalizeCurrentTask();
      currentTask = { id: idMatch[1] };
      currentTaskLines.push(line);
      continue;
    }
    if (currentTask) {
      currentTaskLines.push(line);
      const titleMatch = line.match(titleRegex);
      const fieldMatch = line.match(fieldRegex);
      if (titleMatch) {
        currentTask.title = titleMatch[1].trim();
      } else if (fieldMatch) {
        const key = fieldMatch[1].trim().toLowerCase();
        const value = fieldMatch[2].trim();
        switch (key) {
          case 'description': currentTask.description = value; break;
          case 'user story': currentTask.userStory = value; break;
          case 'priority': currentTask.priority = value; break;
          case 'dependencies': currentTask.dependencies = value; break;
          case 'est. effort': currentTask.effort = value; break;
          default: logger.warn(`Unknown field key found in task ${currentTask.id}: ${key}`);
        }
      }
    }
  }
  finalizeCurrentTask();
  return tasks;
}

function extractFallbackTasks(markdownContent: string): ParsedTask[] {
  logger.warn("Primary task parser failed. Attempting fallback parsing...");
  const tasks: ParsedTask[] = [];
  const lines = markdownContent.split('\n');
  let taskCounter = 1;
  const potentialTaskRegex = /^\s*[-*]\s+(.*)|^\s*\d+\.\s+(.*)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(potentialTaskRegex);
    if (match) {
      const title = (match[1] || match[2] || 'Untitled Fallback Task').trim();
      if (title.startsWith('**ID:**') || title.startsWith('*(Description):*')) continue;
      const taskId = `T-FALLBACK-${taskCounter++}`;
      logger.debug(`Fallback parser found potential task: ${taskId} - ${title}`);
      tasks.push({
        id: taskId, title, description: `(Fallback Parsed) ${title}`,
        userStory: 'N/A', priority: 'Medium', dependencies: 'None', effort: 'Medium',
        markdownLine: lines[i], subTasksMarkdown: undefined
      });
    }
  }
  if (tasks.length > 0) logger.warn(`Fallback parser extracted ${tasks.length} potential tasks.`);
  else logger.error("Fallback parser also failed to extract any tasks.");
  return tasks;
}

function reconstructMarkdown(originalMarkdown: string, decomposedTasks: Map<string, string>): string {
  let finalMarkdown = "";
  const lines = originalMarkdown.split('\n');
  let currentTaskBlock = "";
  let currentTaskId: string | null = null;

  for (const line of lines) {
    const idMatch = line.match(/^\s*-\s+\*\*ID:\*\*\s*(T-\d+)/);
    if (idMatch) {
      if (currentTaskId && currentTaskBlock) {
        finalMarkdown += currentTaskBlock.trimEnd() + '\n';
        if (decomposedTasks.has(currentTaskId)) {
          const subTasks = decomposedTasks.get(currentTaskId);
          if (subTasks) {
            const indentedSubTasks = subTasks.split('\n').map(subLine => subLine.trim() ? `  ${subLine}` : '').join('\n');
            finalMarkdown += indentedSubTasks.trimEnd() + '\n';
          }
        }
      }
      currentTaskId = idMatch[1];
      currentTaskBlock = line + '\n';
    } else if (currentTaskId) {
      currentTaskBlock += line + '\n';
    } else {
      finalMarkdown += line + '\n';
    }
  }
  if (currentTaskId && currentTaskBlock) {
    finalMarkdown += currentTaskBlock.trimEnd() + '\n';
    if (decomposedTasks.has(currentTaskId)) {
      const subTasks = decomposedTasks.get(currentTaskId);
      if (subTasks) {
        const indentedSubTasks = subTasks.split('\n').map(subLine => subLine.trim() ? `  ${subLine}` : '').join('\n');
        finalMarkdown += indentedSubTasks.trimEnd() + '\n';
      }
    }
  }
  return finalMarkdown.trim();
}

// Helper for decomposition with retry
async function decomposeSingleTaskWithRetry(
  task: ParsedTask,
  config: OpenRouterConfig,
  jobId: string,
  sessionId: string,
  maxRetries = 2 // Allow 2 retries (3 attempts total)
): Promise<{ taskId: string; markdown: string }> {
  const decompositionPrompt = `Decompose the following high-level Parent Task into detailed, actionable sub-tasks:\n\nParent Task ID: ${task.id}\nParent Title: ${task.title}\nParent Description: ${task.description}\nRelated User Story: ${task.userStory || 'N/A'}\nPriority: ${task.priority || 'N/A'}\nDependencies: ${task.dependencies || 'None'}\nEst. Effort: ${task.effort || 'N/A'}`;
  let attempts = 0;

  while (attempts <= maxRetries) {
    attempts++;
    try {
      logger.debug({ taskId: task.id, attempt: attempts }, `Attempting decomposition (attempt ${attempts}/${maxRetries + 1})`);
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Decomposing task ${task.id} (attempt ${attempts})...`);

      const subTasksMarkdown = await performFormatAwareLlmCallWithCentralizedConfig(
        decompositionPrompt,
        TASK_DECOMPOSITION_SYSTEM_PROMPT,
        'task_list_decomposition',
        'markdown', // Explicitly specify markdown format
        undefined, // No schema for markdown
        0.1 // Default temperature for structured output
      );

      // Basic validation
      if (subTasksMarkdown && subTasksMarkdown.trim().startsWith('- **Sub-Task ID:**')) {
        logger.debug(`Successfully decomposed task ${task.id} on attempt ${attempts}`);
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Task ${task.id} decomposed.`);
        return { taskId: task.id, markdown: subTasksMarkdown.trim() };
      } else {
        logger.warn({ taskId: task.id, attempt: attempts, response: subTasksMarkdown }, `Decomposition attempt ${attempts} for task ${task.id} returned unexpected format.`);
        if (attempts > maxRetries) {
          throw new Error('Unexpected format received after maximum retries.');
        }
      }
    } catch (error) {
      logger.warn({ err: error, taskId: task.id, attempt: attempts }, `Decomposition attempt ${attempts} for task ${task.id} failed.`);
      if (attempts > maxRetries) {
        // Rethrow the error from the last attempt
        throw error; // Let the outer Promise.allSettled catch this
      }
      // Wait briefly before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Simple linear backoff
    }
  }
  // Should not be reached if logic is correct, but satisfies TS
  throw new Error(`Decomposition failed for task ${task.id} after ${maxRetries + 1} attempts.`);
}

// --- Tool Executor ---
export const generateTaskList: ToolExecutor = async (
  params: Record<string, unknown>,
  config: OpenRouterConfig,
  context?: ToolExecutionContext
): Promise<CallToolResult> => {
  const sessionId = context?.sessionId || 'unknown-session';
  if (sessionId === 'unknown-session') {
    logger.warn({ tool: 'generateTaskList' }, 'Executing tool without a valid sessionId. SSE progress updates will not be sent.');
  }
  const productDescription = params.productDescription as string;
  const userStories = params.userStories as string;

  // --- Create Job & Return Immediately ---
  const jobId = jobManager.createJob('generate-task-list', params);
  logger.info({ jobId, tool: 'generateTaskList', sessionId }, 'Starting background job.');

  // Use the shared service to format the initial response
  const initialResponse = formatBackgroundJobInitiationResponse(
    jobId,
    'generate-task-list', // Internal tool name
    'Task List Generator' // User-friendly display name
  );

  // Return immediately
  setImmediate(async () => {
    const decomposedTasks = new Map<string, string>(); // Store decomposed tasks <ParentID, SubTasksMarkdown>
    try {
      // Ensure directories are initialized before writing
      await initDirectories();

      // --- Step 1: Generate High-Level Tasks ---
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Starting high-level task generation...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Starting high-level task generation...');
      logger.info("Task List Generator: Starting Step 1 - High-Level Task Generation...");
      let researchContext = '';
      try {
        const query1 = `Software development lifecycle tasks and milestones for: ${productDescription}`;
        const query2 = `Task estimation and dependency management best practices for software projects`;
        const query3 = `Development team structures and work breakdown for projects similar to: ${productDescription}`;
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Performing pre-generation research...');
        const researchResults = await Promise.allSettled([
          performResearchQuery(query1, config),
          performResearchQuery(query2, config),
          performResearchQuery(query3, config)
        ]);
        researchContext = "## Pre-Generation Research Context (From Perplexity Sonar Deep Research):\n\n";
        researchResults.forEach((result, index) => {
          const queryLabels = ["Development Lifecycle & Milestones", "Task Estimation & Dependencies", "Team Structure & Work Breakdown"];
          if (result.status === "fulfilled") {
            researchContext += `### ${queryLabels[index]}:\n${result.value.trim()}\n\n`;
          } else {
            logger.warn({ error: result.reason }, `Research query ${index + 1} failed`);
            researchContext += `### ${queryLabels[index]}:\n*Research on this topic failed.*\n\n`;
          }
        });
        logger.info("Task List Generator: Pre-generation research completed.");
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Research complete. Generating high-level tasks...');
      } catch (researchError) {
        logger.error({ err: researchError }, "Task List Generator: Error during research aggregation");
        researchContext = "## Pre-Generation Research Context:\n*Error occurred during research phase.*\n\n";
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Research phase failed. Proceeding with generation...'); // Notify about failure
      }

      const initialGenerationPrompt = `Create a detailed task list for the following product:\n\n${productDescription}\n\nBased on these user stories:\n\n${userStories}\n\n${researchContext}`;
      const highLevelTaskListMarkdown = await performFormatAwareLlmCallWithCentralizedConfig(
        initialGenerationPrompt,
        INITIAL_TASK_LIST_SYSTEM_PROMPT,
        'task_list_initial_generation',
        'markdown', // Explicitly specify markdown format
        undefined, // No schema for markdown
        0.1 // Default temperature for structured output
      );
      logger.debug({ rawOutput: highLevelTaskListMarkdown }, "Raw output from Step 1 (High-Level Task Generation - Direct Call):");
      logger.info("Task List Generator: Step 1 - High-Level Task Generation completed.");
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'High-level tasks generated. Starting decomposition...');

      // --- Step 2: Decompose Each High-Level Task (Parallel with Retry) ---
      logger.info("Task List Generator: Starting Step 2 - Task Decomposition...");
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Starting parallel task decomposition...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Starting parallel task decomposition...');

      let parsedTasks = parseHighLevelTasks(highLevelTaskListMarkdown);
      if (parsedTasks.length === 0 && highLevelTaskListMarkdown.trim().length > 0) {
        parsedTasks = extractFallbackTasks(highLevelTaskListMarkdown);
      }

      if (parsedTasks.length === 0) {
        logger.error("Both primary and fallback parsers failed to extract any tasks. Cannot proceed with decomposition.");
        // Throw an error to be caught by the main catch block
        throw new Error("Failed to parse any high-level tasks from LLM response.");
      } else {
        logger.info(`Proceeding with decomposition for ${parsedTasks.length} tasks.`);
        const decompositionPromises = parsedTasks
          .filter(task => task.id && task.title && task.description) // Filter out tasks missing essential details
          .map(task => decomposeSingleTaskWithRetry(task, config, jobId, sessionId));

        const decompositionResults = await Promise.allSettled(decompositionPromises);

        decompositionResults.forEach((result, index) => {
          const originalTask = parsedTasks.filter(t => t.id && t.title && t.description)[index];
          if (!originalTask) return;

          if (result.status === 'fulfilled') {
            decomposedTasks.set(result.value.taskId, result.value.markdown);
          } else {
            const error = result.reason;
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ err: error, taskId: originalTask.id }, `Final decomposition failed for task ${originalTask.id} after retries.`);
            decomposedTasks.set(originalTask.id, `- *(Error: Final decomposition failed: ${errorMessage})*`);
            sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Failed to decompose task ${originalTask.id}: ${errorMessage}`);
          }
        });
        logger.info(`Task List Generator: Step 2 - Parallel decomposition finished.`);
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Decomposition finished. Reconstructing output...');
      }

      // --- Step 3: Reconstruct Final Output ---
      logger.info("Task List Generator: Reconstructing final Markdown output...");
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Reconstructing final output...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Reconstructing final output...');
      const finalMarkdown = reconstructMarkdown(highLevelTaskListMarkdown, decomposedTasks);
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Reconstruction complete. Saving file...');

      // --- Step 4: Save and Set Final Result ---
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedName = productDescription.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const filename = `${timestamp}-${sanitizedName}-task-list-detailed.md`;
      const filePath = path.join(TASK_LIST_DIR, filename);

      try {
        await fs.writeFile(filePath, finalMarkdown, 'utf8');
        logger.info(`Detailed task list generated and saved to ${filePath}`);
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `File saved to ${filePath}. Job complete.`);
      } catch (saveError) {
        logger.error({ err: saveError, filePath }, "Failed to save the final detailed task list.");
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Failed to save output file to ${filePath}.`);
        // Consider if this should make the job fail
      }

      // Set final success result in Job Manager
      const finalResult: CallToolResult = {
        content: [{ type: "text", text: `Detailed task list saved to: ${filePath}\n\n${finalMarkdown.substring(0, 1000)}...` }], // Truncate for brevity in result
        isError: false
      };
      jobManager.setJobResult(jobId, finalResult);
    } catch (error) { // Catch errors within the async block
      logger.error({ err: error, jobId, tool: 'generateTaskList' }, 'Error during background job execution.');

      // Construct error result
      let appError: AppError;
      if (error instanceof AppError) {
        appError = error;
      } else if (error instanceof Error) { // Handle generic Errors
        appError = new ToolExecutionError('Failed during task list generation background job.', { originalError: error.message }, error);
      } else { // Handle non-Error types thrown
        appError = new ToolExecutionError('An unknown error occurred during task list generation background job.', { thrownValue: String(error) });
      }

      const mcpError = new McpError(ErrorCode.InternalError, appError.message, appError.context);
      const errorResult: CallToolResult = {
        content: [{ type: 'text', text: `Error during background job ${jobId}: ${mcpError.message}` }],
        isError: true,
        errorDetails: mcpError
      };

      // Store error result in Job Manager
      jobManager.setJobResult(jobId, errorResult);
      // Send final failed status via SSE (setJobResult might handle this, but explicit call is safer)
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Job failed: ${mcpError.message}`);
    }
  }); // End of setImmediate

  return initialResponse; // Return the initial response with Job ID
};

// --- Tool Registration ---
const taskListToolDefinition: ToolDefinition = {
  name: "task-list-generator",
  description: "Creates structured development task lists, decomposing high-level tasks into detailed sub-tasks with implementation guidance.",
  inputSchema: taskListInputSchemaShape,
  executor: generateTaskList
};

registerTool(taskListToolDefinition);

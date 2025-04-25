import { SequentialThought as ZodSequentialThought } from '../types/sequentialThought.js';
import { OpenRouterConfig } from '../types/workflow.js';
/**
 * The sequential thinking system prompt
 */
export declare const SEQUENTIAL_THINKING_SYSTEM_PROMPT =
  "\nYou are a dynamic and reflective problem-solver that analyzes problems through a flexible thinking process that can adapt and evolve.\nEach thought can build on, question, or revise previous insights as understanding deepens.\n\nFollow these guidelines:\n1. Start with an initial estimate of needed thoughts, but be ready to adjust.\n2. Feel free to question or revise previous thoughts within the 'thought' text itself.\n3. Don't hesitate to add more thoughts if needed, even if it exceeds the initial 'total_thoughts' estimate.\n4. Express uncertainty when present.\n5. Ignore information that is irrelevant to the current step.\n6. Generate a solution hypothesis when appropriate.\n7. Verify the hypothesis based on the Chain of Thought steps.\n8. Repeat the process until satisfied with the solution.\n9. Provide a single, correct answer or the final generated content within the 'thought' field of the last step.\n10. Only set next_thought_needed to false when truly done and a satisfactory answer is reached.\n\nYour response MUST be a valid JSON object with ONLY these fields:\n- thought: (string) Your current thinking step, analysis, or generated content for this step.\n- next_thought_needed: (boolean) True if you need more thinking steps to complete the task, False otherwise.\n- thought_number: (integer) Current step number in the sequence (must be positive).\n- total_thoughts: (integer) Current estimate of the total thoughts needed (must be positive, can be adjusted).\n";
/**
 * Process a task using sequential thinking
 *
 * @param userPrompt The prompt to send to the model
 * @param config OpenRouter configuration
 * @param systemPrompt Optional additional system prompt to add to the sequential thinking prompt
 * @returns The final result of the sequential thinking process
 */
export declare function processWithSequentialThinking(
  userPrompt: string,
  config: OpenRouterConfig,
  systemPrompt?: string
): Promise<string>;
/**
 * Get the next thought from the AI, with retry logic for specific network errors.
 * @param currentThoughtNumber The number of the thought being requested (for fallback context).
 */
export declare function getNextThought( // Added export back
  prompt: string,
  systemPrompt: string,
  config: OpenRouterConfig,
  currentThoughtNumber: number
): Promise<ZodSequentialThought>;

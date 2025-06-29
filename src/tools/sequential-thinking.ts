import axios, { AxiosError } from 'axios';
import https from 'https';
import { OpenRouterConfig } from '../types/workflow.js';
import logger from '../logger.js';
import { sequentialThoughtSchema, SequentialThought as ZodSequentialThought } from '../types/sequentialThought.js';
// Removed ValidationIssue from import as it's no longer exported/used here
import { ApiError, ParsingError, ValidationError, AppError, FallbackError } from '../utils/errors.js';
import { selectModelForTask } from '../utils/configLoader.js'; // Import the new utility

// Configure axios with SSL settings to handle SSL/TLS issues (same as llmHelper.ts)
const httpsAgent = new https.Agent({
  rejectUnauthorized: true, // Keep SSL verification enabled for security
  maxVersion: 'TLSv1.3',
  minVersion: 'TLSv1.2',
  ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384',
  honorCipherOrder: true,
  keepAlive: true,
  timeout: 30000
});

// Removed internal SequentialThought interface as ZodSequentialThought is now the source of truth.

/**
 * The sequential thinking system prompt
 */
export const SEQUENTIAL_THINKING_SYSTEM_PROMPT = `
You are a dynamic and reflective problem-solver that analyzes problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

Follow these guidelines:
1. Start with an initial estimate of needed thoughts, but be ready to adjust.
2. Feel free to question or revise previous thoughts within the 'thought' text itself.
3. Don't hesitate to add more thoughts if needed, even if it exceeds the initial 'total_thoughts' estimate.
4. Express uncertainty when present.
5. Ignore information that is irrelevant to the current step.
6. Generate a solution hypothesis when appropriate.
7. Verify the hypothesis based on the Chain of Thought steps.
8. Repeat the process until satisfied with the solution.
9. Provide a single, correct answer or the final generated content within the 'thought' field of the last step.
10. Only set next_thought_needed to false when truly done and a satisfactory answer is reached.

Your response MUST be a valid JSON object with ONLY these fields:
- thought: (string) Your current thinking step, analysis, or generated content for this step.
- next_thought_needed: (boolean) True if you need more thinking steps to complete the task, False otherwise.
- thought_number: (integer) Current step number in the sequence (must be positive).
- total_thoughts: (integer) Current estimate of the total thoughts needed (must be positive, can be adjusted).
`;

/**
 * Process a task using sequential thinking
 *
 * @param userPrompt The prompt to send to the model
 * @param config OpenRouter configuration
 * @param systemPrompt Optional additional system prompt to add to the sequential thinking prompt
 * @returns The final result of the sequential thinking process
 */
export async function processWithSequentialThinking(
  userPrompt: string,
  config: OpenRouterConfig,
  systemPrompt?: string
): Promise<string> {
  // Define the maximum number of thoughts allowed
  const MAX_SEQUENTIAL_THOUGHTS = 10; // Changed from 15

  // Log the config received
  logger.debug({
    configReceived: true,
    hasLlmMapping: Boolean(config.llm_mapping),
    mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
  }, 'processWithSequentialThinking received config');

  const thoughts: ZodSequentialThought[] = []; // Use Zod type
  let currentThought: ZodSequentialThought = { // Use Zod type
    thought: '',
    next_thought_needed: true,
    thought_number: 1,
    total_thoughts: 5 // Initial estimate
  };

  // Combine sequential thinking system prompt with optional additional prompt
  const fullSystemPrompt = systemPrompt
    ? `${SEQUENTIAL_THINKING_SYSTEM_PROMPT}\n\n${systemPrompt}`
    : SEQUENTIAL_THINKING_SYSTEM_PROMPT;

  // Build a context string that includes all previous thoughts
  const getThoughtContext = () => {
    if (thoughts.length === 0) return '';

    return 'Previous thoughts:\n' +
      thoughts.map(t => `[Thought ${t.thought_number}/${t.total_thoughts}]: ${t.thought}`).join('\n\n');
  };

  // Process thoughts sequentially until next_thought_needed is false or max thoughts reached
  while (currentThought.next_thought_needed && thoughts.length < MAX_SEQUENTIAL_THOUGHTS) {
    const thoughtContext = getThoughtContext();
    const initialPrompt = thoughtContext
      ? `${thoughtContext}\n\nTask: ${userPrompt}\n\nContinue with the next thought:`
      : `Task: ${userPrompt}\n\nProvide your first thought:`;

    logger.debug(`Processing thought ${currentThought.thought_number} (total estimate: ${currentThought.total_thoughts})...`);

    const maxRetries = 3; // 1 initial attempt + 2 retries
    let lastError: Error | null = null;
    let currentPromptForLLM = initialPrompt; // Use a mutable variable for the prompt
    let nextThought: ZodSequentialThought | null = null; // Initialize as null, use Zod type

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Get the next thought from the AI using the potentially modified prompt
        // Pass the current thought number as the fourth argument
        nextThought = await getNextThought(currentPromptForLLM, fullSystemPrompt, config, currentThought.thought_number);
        lastError = null; // Clear error on success
        logger.debug(`Attempt ${attempt} to get thought ${currentThought.thought_number} succeeded.`);
        break; // Exit retry loop on success
      } catch (error) {
        lastError = error as Error;
        logger.warn({ err: lastError, attempt, maxRetries }, `Attempt ${attempt} to get thought ${currentThought.thought_number} failed.`);

        // --- Handle Specific Errors ---

        // NEW: Catch FallbackError specifically and abort immediately
        if (error instanceof FallbackError) {
            logger.error({ err: error, rawContent: error.rawContent }, "Sequential thinking aborted due to persistent LLM formatting error (FallbackError). Not retrying.");
            throw error; // Re-throw immediately to abort the process
        }

        // Don't retry on API errors - they are terminal failures
        else if (error instanceof ApiError) { // Changed to else if
          logger.error({ err: error }, "API error occurred - not retrying");
          throw error; // Re-throw API errors immediately without retry
        }

        // --- Handle Retries ---
        else if (attempt < maxRetries && (error instanceof ValidationError || error instanceof ParsingError)) { // Changed to else if and combined condition
            // Only retry for validation/parsing errors if not max attempts
            // Prepare prompt for retry, including the error message
            currentPromptForLLM = `${initialPrompt}\n\nYour previous attempt (attempt ${attempt}) failed with this error: ${lastError.message}\nPlease carefully review the required JSON format and schema described in the system prompt, then provide a valid JSON object.\nRetry thought generation:`;
            logger.info(`Retrying thought generation (attempt ${attempt + 1})...`);
            // Optional delay could be added here:
            // await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        } else {
             // Max retries reached for Validation/Parsing OR it's an unexpected error type
             if (attempt === maxRetries) {
                 logger.error(`All ${maxRetries} attempts failed for thought ${currentThought.thought_number}. Final error will be thrown.`);
             } else {
                 // For unexpected errors before max retries, don't retry and throw immediately
                 logger.error({ err: error }, "Unexpected error occurred during thought generation - not retrying.");
                 throw error;
             }
             // Let the loop finish so the final error is thrown outside
        }

        // The erroneous comment block and its contents have been removed here.
      } // End catch block
    } // End for loop

    // If all retries failed, throw the last error encountered
    if (lastError !== null) {
      throw lastError;
    }

    // Ensure nextThought is not null before proceeding (should be guaranteed if no error was thrown)
    if (!nextThought) {
       // This state should not be reachable if the logic is correct
       logger.error("Internal error: nextThought is null after retry loop without throwing an error.");
       throw new Error("Internal error: Failed to retrieve thought after retries.");
    }

    // Add the successfully retrieved thought to our history
    // Types should now match (ZodSequentialThought)
    thoughts.push(nextThought);
    currentThought = nextThought; // Update currentThought

  } // End while loop

  // Check if the loop terminated due to max thoughts limit
  if (thoughts.length >= MAX_SEQUENTIAL_THOUGHTS && currentThought.next_thought_needed) {
      const message = `Sequential thinking process terminated after reaching the maximum limit of ${MAX_SEQUENTIAL_THOUGHTS} thoughts. The final thought may be incomplete or represent a fallback state.`;
      logger.error({
          finalThoughtNumber: currentThought.thought_number,
          maxThoughts: MAX_SEQUENTIAL_THOUGHTS, // Use the constant here
      }, message);
      // Optionally, throw a specific error or just return the last thought content
      // For now, let's return the last thought content but log the error.
      // throw new AppError(message, { maxThoughts: MAX_SEQUENTIAL_THOUGHTS });
  }

  // Extract the solution from the final thought
  return currentThought.thought;
} // End function

// Note: This function was previously used for fallback extraction but is no longer needed.
// Keeping the commented implementation for reference in case it's needed in the future.
/*
 * Extracts the core "thought" text from raw LLM content as a fallback
 * when JSON parsing fails. Uses lenient methods.
 * @param rawContent The raw string content from the LLM response.
 * @returns The extracted thought text, or the trimmed raw content as a last resort.
 *
function extractFallbackThoughtText(rawContent: string): string {
  if (!rawContent) {
    return ''; // Handle empty input
  }
  try {
    // Lenient regex for "thought": "..." (case-insensitive, optional quotes, spaces, handles multiline)
    // Captures content until the next potential comma, closing quote, or end of string/line
    const thoughtMatch = rawContent.match(/['"]?thought['"]?\s*:\s*['"]?([\s\S]*?)(?:['"]?\s*(?:,|$|\n))/is);
    if (thoughtMatch && thoughtMatch[1]) {
      // Further trim potential trailing quotes or commas if captured greedily
      let extracted = thoughtMatch[1].trim();
      // Remove trailing comma if present
      if (extracted.endsWith(',')) {
        extracted = extracted.slice(0, -1).trim();
      }
      // Remove surrounding quotes if present
      if ((extracted.startsWith('"') && extracted.endsWith('"')) || (extracted.startsWith("'") && extracted.endsWith("'"))) {
        extracted = extracted.slice(1, -1);
      }
       logger.debug('Fallback text extracted using regex.');
      return extracted;
    }

    // Add other simple patterns here if needed in the future

    // Last resort: return the whole content, trimmed
    logger.warn('Fallback text extraction using full raw content.');
    return rawContent.trim();
  } catch (e) {
    logger.error({ error: e }, 'Error during fallback text extraction, returning raw content.');
    return rawContent.trim(); // Return raw content on extraction error
  }
}
*/


/**
 * Get the next thought from the AI, with retry logic for specific network errors.
 * @param currentThoughtNumber The number of the thought being requested (for fallback context).
 */
export async function getNextThought( // Added export back
  prompt: string,
  systemPrompt: string,
  config: OpenRouterConfig,
  currentThoughtNumber: number // Added parameter
): Promise<ZodSequentialThought> {
  const logicalTaskName = 'sequential_thought_generation';
  const maxRetries = 2; // 1 initial attempt + 1 retry
  let lastError: Error | null = null;
  // Removed outer declaration: let rawContent: string | undefined;

  // Select the model using the utility function
  const defaultModel = config.defaultModel || "deepseek/deepseek-r1-0528-qwen3-8b:free"; // Ensure a default model exists
  const modelToUse = selectModelForTask(config, logicalTaskName, defaultModel);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { // Inner try for each attempt
      logger.debug(`Attempt ${attempt}/${maxRetries} to call OpenRouter for sequential thought using model ${modelToUse}...`);
      const response = await axios.post(
        `${config.baseUrl}/chat/completions`,
        {
        model: modelToUse, // Use selected model
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
        temperature: 0.5 // Reduced temperature
      },
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`,
            "HTTP-Referer": "https://vibe-coder-mcp.local"
          },
          httpsAgent: httpsAgent, // Use the configured HTTPS agent for SSL/TLS handling
          timeout: 90000, // Increased timeout to 90s for potentially longer generations
          maxRedirects: 5,
          validateStatus: (status) => status < 500 // Accept 4xx errors but reject 5xx
        }
      );

      // Extract the response
      if (response.data.choices && response.data.choices.length > 0) {
        // Declare rawContent locally within this block
        const rawContent = response.data.choices[0].message.content;

        // --- Clean rawContent: Strip fences and find JSON object ---
        let jsonContent = rawContent.trim(); // Default to trimmed raw
        let cleaned = false;
        const firstBrace = rawContent.indexOf('{');
        const lastBrace = rawContent.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const extracted = rawContent.substring(firstBrace, lastBrace + 1);
            // Basic check if the extracted part looks like JSON
            if (extracted.startsWith('{') && extracted.endsWith('}')) {
                 jsonContent = extracted;
                 if (jsonContent !== rawContent.trim()) {
                     logger.debug({ raw: rawContent, cleaned: jsonContent }, "Stripped potential garbage/fences from LLM JSON response.");
                     cleaned = true;
                 }
            } else {
                 logger.warn({ raw: rawContent }, "Found braces but extracted content doesn't look like JSON, using trimmed raw content for parsing.");
                 jsonContent = rawContent.trim();
            }
        } else {
             logger.warn({ raw: rawContent }, "Could not find expected JSON object braces, attempting to parse trimmed raw content.");
             jsonContent = rawContent.trim();
        }
        // --- End Cleaning ---

        let parsedContent: unknown; // Keep this one
        let validationResult: Zod.SafeParseReturnType<unknown, ZodSequentialThought>; // Define type for validation result

        try {
          // Attempt to parse the potentially cleaned content
          parsedContent = JSON.parse(jsonContent); // Use cleaned content

          // Attempt to validate the parsed content
          validationResult = sequentialThoughtSchema.safeParse(parsedContent);

          if (validationResult.success) {
            logger.debug('Sequential thought successfully parsed and validated.');
            return validationResult.data; // Success! Exit loop and function.
          } else {
            // Zod validation failed
            logger.error({
              message: 'Zod validation failed for SequentialThought',
              errors: validationResult.error.issues,
              rawContent: rawContent,
            }, 'Sequential thought schema validation failed');
            // Throw specific validation error to be caught below
            // Pass Zod's issues directly to ValidationError constructor
            throw new ValidationError(
              `Sequential thought validation failed: ${validationResult.error.message}`,
              validationResult.error.issues, // Pass ZodIssue[] directly
              // Add both raw and cleaned content to context for debugging
              { rawContent: rawContent, cleanedContent: cleaned ? jsonContent : undefined }
            );
          }
        } catch (parseOrValidationError) {
          // Catch both JSON.parse SyntaxError and thrown ValidationError
          // We know local 'rawContent' and 'jsonContent' are defined here.
          logger.warn({
            message: 'JSON parsing or validation failed in getNextThought attempt',
            error: parseOrValidationError instanceof Error ? parseOrValidationError.message : String(parseOrValidationError),
            rawContent: rawContent,
            cleanedContent: cleaned ? jsonContent : undefined, // Log cleaned content if applicable
            attempt: attempt,
          });

          // Re-throw specific errors with context for the outer catch
          const errorContext = { rawContent: rawContent, cleanedContent: cleaned ? jsonContent : undefined };
          if (parseOrValidationError instanceof SyntaxError) {
              throw new ParsingError(
                  `LLM output was not valid JSON: ${parseOrValidationError.message}`,
                  errorContext,
                  parseOrValidationError
              );
          } else if (parseOrValidationError instanceof ValidationError) {
              // Re-throw ValidationError with combined context
              throw new ValidationError(
                  parseOrValidationError.message,
                  parseOrValidationError.validationIssues,
                  { ...parseOrValidationError.context, ...errorContext } // Combine contexts
              );
          } else {
              // Wrap unexpected errors
              throw new AppError(
                  `Unexpected error during parsing/validation: ${parseOrValidationError instanceof Error ? parseOrValidationError.message : String(parseOrValidationError)}`,
                  errorContext,
                  parseOrValidationError instanceof Error ? parseOrValidationError : undefined
              );
          }
        }
      } else {
        logger.warn({ responseData: response.data }, "No choices found in LLM response for sequential thought.");
        // Throw ParsingError (without rawContent as it wasn't available)
        throw new ParsingError(
          "No response choices received from model for sequential thought",
          { responseData: response.data }
        );
      }
    } catch (error) { // Catch errors for this attempt (including re-thrown parse/validation errors)
      lastError = error as Error; // Store the error

      // Check if retry is possible (Retry logic remains the same for network errors)
      const isRetryableNetworkError = (axios.isAxiosError(error) &&
        (error.code === 'ECONNRESET' || (error.message && error.message.includes('SSL routines:ssl3_read_bytes:sslv3 alert bad record mac'))));

      if (isRetryableNetworkError && attempt < maxRetries) {
        const delay = 500 * attempt; // Simple exponential backoff
        logger.warn({ err: lastError, attempt, maxRetries, delay }, `Attempt ${attempt} failed with retryable network error. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        // Continue to the next iteration of the loop
      } else {
        // Not retryable or max retries reached, break loop to handle/throw error outside
        logger.warn({ err: lastError, attempt, maxRetries, isRetryable: isRetryableNetworkError }, `Not retrying after attempt ${attempt}.`);
        break;
      }
    }
  } // End retry loop

  // If the loop finished because of an error (lastError is not null)
  if (lastError) {
    // --- Explicit Fallback Error Propagation ---
    // Extract rawContent from the error context if available
    let errorRawContent: string | undefined;
    if (lastError instanceof AppError && lastError.context?.rawContent && typeof lastError.context.rawContent === 'string') {
        errorRawContent = lastError.context.rawContent;
    }

    // Check if the error is a parsing or validation error AND we extracted rawContent from its context
    if ((lastError instanceof ParsingError || lastError instanceof ValidationError) && errorRawContent !== undefined) {
        // Throw FallbackError for persistent formatting issues after cleaning attempts
        logger.error({ // Log the activation of this specific error path
            message: 'Persistent LLM formatting error after retries and cleaning. Throwing FallbackError.',
            originalError: lastError.message,
            rawContent: errorRawContent,
            // Note: cleanedContent might be available in lastError.context if cleaning happened
            cleanedContent: (lastError instanceof AppError && lastError.context?.cleanedContent) ? lastError.context.cleanedContent : undefined,
            thoughtNumber: currentThoughtNumber,
        });
        throw new FallbackError( // Use the FallbackError class
            `Sequential thinking aborted after ${maxRetries} attempts due to persistent LLM formatting error: ${lastError.message}`,
            errorRawContent,
            lastError // Pass the original ParsingError or ValidationError
        );
    }

    // --- Original Error Handling for other non-fallback cases (e.g., API errors, unexpected errors where rawContent might be undefined) ---
    logger.error({ err: lastError, modelUsed: modelToUse, thoughtNumber: currentThoughtNumber }, `Sequential thought generation failed after ${maxRetries} attempts.`);
    // Classify and re-throw other final errors
    if (axios.isAxiosError(lastError)) {
      const axiosError = lastError as AxiosError<unknown>;
      const status = axiosError.response?.status;
      const apiMessage = `OpenRouter API Error: Status ${status || 'N/A'}. ${axiosError.message}`;
      const apiError = new ApiError(
        apiMessage,
        status,
        { model: modelToUse, logicalTaskName }, // Include task name and model used
        axiosError
      );
      throw apiError;
    } else if (lastError instanceof AppError) { // Includes Parsing/Validation errors where rawContent couldn't be extracted
      throw lastError;
    } else if (lastError instanceof Error) {
      throw new AppError(`Failed to get next thought after retries: ${lastError.message}`, undefined, lastError);
    } else {
      throw new AppError("Unknown failure while getting next thought after retries.");
    }
  }

  // Should theoretically not be reached if logic is correct and fallback handles parsing/validation errors
  throw new Error("Internal error: Reached end of getNextThought without success or error throw.");
}

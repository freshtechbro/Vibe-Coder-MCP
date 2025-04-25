// src/tools/code-refactor-generator/index.js - Refactored

// --- Core Dependencies ---
const { registerTool } = require('../../services/routing/toolRegistry.js');
const { selectModelForTask } = require('../../utils/configLoader.js'); // Utility for model selection based on config/task
const { ToolExecutionError, AppError } = require('../../utils/errors.js'); // Keep necessary error types for wrapping/handling

// --- Tool-Specific Modules ---
const { callRefactorApi } = require('./apiClient.js');
const { logger, llmConfig } = require('./configLoader.js'); // Get logger and base config
const { processContextFile } = require('./contextHandler.js');
const { cleanCodeOutput } = require('./outputCleaner.js');
const { createLLMPrompt } = require('./promptBuilder.js');
const { codeRefactorInputSchema } = require('./schema.js');

/**
 * Main executor function for the code refactoring tool.
 * Orchestrates the process of context handling, prompt building, API interaction, and output cleaning.
 *
 * @param {object} params - The validated parameters for the code refactoring task (matching codeRefactorInputSchema).
 * @param {object} config - The configuration object for the tool, potentially including LLM mapping overrides.
 * @returns {Promise<{content: Array<{type: string, text: string}>, isError: boolean}>} A promise resolving to the refactored code or throwing an error.
 * @throws {ToolExecutionError | ApiError | ConfigurationError | ParsingError | Error} Various errors from sub-modules or orchestration logic.
 */
const refactorCode = async (params, config) => {
  const requestStartTime = Date.now();
  logger.info('Code refactoring request received. Orchestrating modules...');
  logger.debug(
    {
      params: {
        codeLength: params.codeContent.length,
        instructionsLength: params.refactoringInstructions.length,
        contextFilePath: params.contextFilePath,
      },
      hasConfig: !!config,
    },
    'Input parameters'
  );

  try {
    // 1. Process Context File (Validation, Sandboxing, Reading, Size Check)
    const fileContext = await processContextFile(params.contextFilePath);
    logger.debug(
      { contextLength: fileContext.length },
      'Context file processing complete.'
    );

    // 2. Create LLM Prompt
    const userPrompt = createLLMPrompt(params, fileContext);
    logger.debug('LLM user prompt created.');

    // 3. Select Model
    const logicalTaskName = 'code_refactoring'; // Define task name for model selection
    const defaultModel = llmConfig.model_params.defaultModel; // Get default from loaded config
    // Use the provided config object (which might contain overrides) for model selection
    const modelToUse = selectModelForTask(
      config,
      logicalTaskName,
      defaultModel
    );
    logger.info(
      { modelToUse, defaultModel, task: logicalTaskName },
      'Selected model for API call.'
    );

    // 4. Call LLM API (Handles retries and API errors internally)
    const rawOutput = await callRefactorApi(modelToUse, userPrompt);
    logger.debug('Received raw output from API client.');

    // 5. Clean LLM Output
    const cleanCode = cleanCodeOutput(rawOutput, modelToUse); // Pass model for error context
    logger.debug('LLM output cleaned.');

    // 6. Format and Return Success
    const requestDuration = Date.now() - requestStartTime;
    logger.info(
      { requestDuration },
      'Code refactoring request finished successfully.'
    );
    return {
      content: [{ type: 'text', text: cleanCode }],
      isError: false,
    };
  } catch (error) {
    const requestDuration = Date.now() - requestStartTime;
    logger.error(
      {
        error: error.message,
        stack: error.stack,
        requestDuration,
        params,
        modelUsed: error.context?.modelUsed || 'unknown',
      },
      'Code refactoring request failed during orchestration.'
    );

    // Re-throw the error to be handled by the central tool execution logic.
    // Ensure it's an instance of Error. If it's already a specific AppError subclass, preserve it.
    if (error instanceof AppError) {
      throw error;
    } else if (error instanceof Error) {
      // Wrap generic errors in ToolExecutionError for consistency
      throw new ToolExecutionError(
        `Code refactoring failed: ${error.message}`,
        { originalErrorName: error.name, params },
        error
      );
    } else {
      // Handle cases where a non-Error object might have been thrown (should be rare)
      throw new ToolExecutionError(
        `An unexpected non-Error type was thrown during code refactoring: ${String(error)}`,
        { params }
      );
    }
  }
};

// --- Tool Definition and Registration ---
const codeRefactorToolDefinition = {
  name: 'refactor-code',
  description:
    'Refactors a given code snippet based on specific instructions, optionally using surrounding file context. Orchestrates multiple internal modules.',
  inputSchema: codeRefactorInputSchema.shape, // Pass the raw shape for validation
  executor: refactorCode,
  // Add llm_mapping if needed for specific model routing within this tool
  llm_mapping: [
    { task: 'code_refactoring', model: 'anthropic/claude-3-opus-20240229' }, // Example mapping
  ],
};

registerTool(codeRefactorToolDefinition);

// Export for potential direct usage or testing (optional)
module.exports = {
  refactorCode,
  codeRefactorToolDefinition,
};

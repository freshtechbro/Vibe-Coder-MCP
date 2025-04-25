import path from 'path';
import fs from 'fs-extra';
import logger from '@/logger.js';
import { OpenRouterConfig } from '@/types/workflow.js';

/**
 * Interface for the structure of the LLM configuration file.
 */
interface LlmConfigFile {
  llm_mapping: Record<string, string>;
}

/**
 * Loads the LLM model mapping configuration from a JSON file.
 *
 * Loads the LLM model mapping configuration from a JSON file, prioritizing an environment variable.
 *
 * @param fileName The name of the configuration file. Defaults to 'llm_config.json'.
 * @returns An object containing the llm_mapping, or an empty mapping if loading fails.
 */
export function loadLlmConfigMapping(
  fileName: string = 'llm_config.json'
): Record<string, string> {
  let filePath: string | null = null;
  const defaultMapping: Record<string, string> = {};

  // 1. Check Environment Variable
  if (process.env.LLM_CONFIG_PATH) {
    const envPath = process.env.LLM_CONFIG_PATH;
    if (fs.existsSync(envPath)) {
      logger.info(`Found LLM config path in environment variable: ${envPath}`);
      filePath = envPath;
    } else {
      logger.warn(
        `LLM_CONFIG_PATH environment variable set to ${envPath}, but file not found.`
      );
    }
  }

  // 2. Fallback to Current Working Directory if env var didn't work
  if (!filePath) {
    const cwdPath = path.join(process.cwd(), fileName);
    if (fs.existsSync(cwdPath)) {
      logger.info(`Found LLM config in current working directory: ${cwdPath}`);
      filePath = cwdPath;
    }
  }

  // 3. Load and validate mapping if a path was determined
  if (filePath) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const parsedConfig = JSON.parse(fileContent) as LlmConfigFile;

      if (
        parsedConfig &&
        typeof parsedConfig.llm_mapping === 'object' &&
        parsedConfig.llm_mapping !== null
      ) {
        logger.info(`LLM config loaded successfully from ${filePath}`);
        // Ensure all values are strings
        for (const key in parsedConfig.llm_mapping) {
          if (typeof parsedConfig.llm_mapping[key] !== 'string') {
            logger.warn(
              `Invalid non-string value for key "${key}" in ${filePath}. Skipping.`
            );
            delete parsedConfig.llm_mapping[key];
          }
        }
        return parsedConfig.llm_mapping;
      } else {
        logger.error(
          `Invalid structure in ${filePath}. Expected 'llm_mapping' object. Using default empty mapping.`
        );
        return defaultMapping;
      }
    } catch (error) {
      logger.error(
        { err: error, filePath },
        `Failed to load or parse LLM config from ${filePath}. Using default empty mapping.`
      );
      return defaultMapping;
    }
  } else {
    logger.error(
      `LLM config file "${fileName}" not found via environment variable or in CWD (${process.cwd()}). Using default empty mapping.`
    );
    return defaultMapping;
  }
}

/**
 * Selects the appropriate LLM model based on task type and available mappings
 *
 * @param config The OpenRouter configuration with mappings
 * @param logicalTaskName The logical task name (e.g., 'research_query')
 * @param defaultModel The default model to use if no mapping is found
 * @returns The selected model name
 */
export function selectModelForTask(
  config: OpenRouterConfig,
  logicalTaskName: string,
  defaultModel: string
): string {
  // Log the received config object *before* any copying or modification
  logger.debug(
    {
      receivedConfig: config,
      receivedMapping: config.llm_mapping,
      taskName: logicalTaskName,
    },
    'selectModelForTask received config'
  );

  // Ensure config and llm_mapping exist before proceeding
  const mapping = config.llm_mapping;
  if (!mapping || typeof mapping !== 'object') {
    logger.warn(
      { logicalTaskName, configProvided: !!config },
      `LLM mapping object is missing or invalid in provided config. Falling back to default model: ${defaultModel}`
    );
    return defaultModel;
  }

  // Check if the mapping object is empty
  const mappingKeys = Object.keys(mapping);
  if (mappingKeys.length === 0) {
    logger.warn(
      { logicalTaskName },
      `LLM mapping object is empty. Falling back to default model: ${defaultModel}`
    );
    return defaultModel;
  }

  // Log the mapping lookup details
  const modelFromMapping = mapping[logicalTaskName];
  const defaultFromMapping = mapping['default_generation'];
  logger.debug(
    {
      logicalTaskName,
      mappingKeys: mappingKeys,
      modelFromMapping: modelFromMapping,
      defaultFromMapping: defaultFromMapping,
      defaultModelProvided: defaultModel,
    },
    `Looking up model for task: ${logicalTaskName}`
  );

  // Select model with priority: Task Specific -> Default Mapping -> Default Model Param
  const modelToUse = modelFromMapping || defaultFromMapping || defaultModel;

  // Log the final model selection at INFO level for better visibility
  logger.info(
    {
      logicalTaskName,
      modelFromMapping,
      defaultFromMapping,
      defaultModel,
      modelToUse,
    },
    'Model selection decision for task'
  );

  return modelToUse;
}

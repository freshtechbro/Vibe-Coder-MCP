import fs from 'fs-extra';
import path from 'path';
import logger from '../logger.js';
import { OpenRouterConfig } from '../types/workflow.js';

interface LlmConfigFile {
  llm_mapping: Record<string, string>;
}

export function loadLlmConfigMapping(
  fileName: string = 'llm_config.json'
): Record<string, string> {
  let filePath: string | null = null;
  let baseMapping: Record<string, string> = {};

  if (process.env.LLM_CONFIG_PATH) {
    const envPath = process.env.LLM_CONFIG_PATH;
    if (fs.existsSync(envPath)) {
      logger.info(`Found LLM config path in environment variable: ${envPath}`);
      filePath = envPath;
    } else {
      logger.warn(`LLM_CONFIG_PATH environment variable set to ${envPath}, but file not found.`);
    }
  }

  if (!filePath) {
    const cwdPath = path.join(process.cwd(), fileName);
    if (fs.existsSync(cwdPath)) {
      logger.info(`Found LLM config in current working directory: ${cwdPath}`);
      filePath = cwdPath;
    }
  }

  if (filePath) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const parsedConfig = JSON.parse(fileContent) as LlmConfigFile;
      if (parsedConfig && typeof parsedConfig.llm_mapping === 'object' && parsedConfig.llm_mapping !== null) {
        logger.info(`LLM config loaded successfully from ${filePath}`);
        for (const key in parsedConfig.llm_mapping) {
          if (typeof parsedConfig.llm_mapping[key] !== 'string') {
             logger.warn(`Invalid non-string value found for key "${key}" in ${filePath}. Skipping this key.`);
             delete parsedConfig.llm_mapping[key];
          }
        }
        baseMapping = parsedConfig.llm_mapping;
      }
    } catch (error) {
      logger.error({ err: error, filePath }, `Failed to load or parse LLM config from ${filePath}.`);
    }
  }

  // Return the config file mapping as-is, without environment overrides
  const finalMapping = baseMapping;
  logger.info({ configEntries: Object.keys(baseMapping).length }, 'LLM config loaded from file');
  return finalMapping;
}

export function selectModelForTask(config: OpenRouterConfig, logicalTaskName: string, defaultModel: string): string {
  const mapping = config?.llm_mapping;
  if (!mapping || typeof mapping !== 'object') return defaultModel;
  const modelFromMapping = mapping[logicalTaskName];
  const defaultFromMapping = mapping['default_generation'];
  const modelToUse = modelFromMapping || defaultFromMapping || defaultModel;
  logger.info({ logicalTaskName, modelToUse }, 'Model selection');
  return modelToUse;
}
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const pino = require('pino');

const { ConfigurationError } = require('../../utils/errors.js'); // Adjust path if necessary

// Initialize Logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Load central LLM configuration
const llmConfigPath = path.resolve(__dirname, '../../llm_config.json');
let llmConfig;
try {
  const configContent = fs.readFileSync(llmConfigPath, 'utf-8');
  llmConfig = JSON.parse(configContent);
  logger.debug({ llmConfigPath }, 'Successfully loaded llm_config.json');
} catch (error) {
  logger.error(
    { llmConfigPath, error: error.message },
    'Failed to load or parse llm_config.json'
  );
  // Throwing here ensures the application doesn't start with invalid config
  throw new ConfigurationError(
    `Failed to load or parse llm_config.json: ${error.message}`
  );
}

// Load API Key from environment variable
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  logger.error(
    'API key (OPENROUTER_API_KEY) is missing from environment variables.'
  );
  // Throwing ensures the app doesn't proceed without necessary credentials
  throw new ConfigurationError(
    'API key is missing. Please set the OPENROUTER_API_KEY environment variable.'
  );
} else {
  logger.debug('OPENROUTER_API_KEY loaded successfully.');
}

// Extract configuration values
const apiEndpoint = llmConfig?.api_config?.base_url;
const requestTimeout = llmConfig?.api_config?.timeout;
const INITIAL_RETRY_DELAY = llmConfig?.api_config?.retry_delay;
const MAX_RETRIES = llmConfig?.api_config?.max_retries;
const defaultModel = llmConfig?.model_params?.defaultModel; // Needed for model selection default

// Validate essential config values
if (!apiEndpoint) {
  throw new ConfigurationError('API base_url is missing in llm_config.json');
}
if (requestTimeout === undefined || requestTimeout === null) {
  throw new ConfigurationError('API timeout is missing in llm_config.json');
}
if (INITIAL_RETRY_DELAY === undefined || INITIAL_RETRY_DELAY === null) {
  throw new ConfigurationError('API retry_delay is missing in llm_config.json');
}
if (MAX_RETRIES === undefined || MAX_RETRIES === null) {
  throw new ConfigurationError('API max_retries is missing in llm_config.json');
}
if (!defaultModel) {
  throw new ConfigurationError(
    'Default model (defaultModel) is missing in llm_config.json'
  );
}

logger.info('Configuration loaded successfully.');

module.exports = {
  logger,
  apiKey,
  apiEndpoint,
  requestTimeout,
  INITIAL_RETRY_DELAY,
  MAX_RETRIES,
  llmConfig, // Export the whole config for flexibility (e.g., accessing defaultModel)
};

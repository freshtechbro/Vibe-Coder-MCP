const nock = require('nock');

const llmConfig = require('../../../llm_config.json'); // Adjust path as needed

const API_BASE_URL = llmConfig.api_config.base_url;
const API_ENDPOINT_PATH = '/chat/completions'; // Common path for chat completions

/**
 * Sets up a nock interceptor for the OpenRouter API chat completions endpoint.
 * Allows tests to define specific responses (status code, body).
 *
 * @param {number} statusCode - The HTTP status code for the mock response.
 * @param {object|string} responseBody - The body of the mock response.
 * @param {object} [options={}] - Optional nock options (e.g., { persist: true }).
 * @returns {nock.Scope} The nock scope for further chaining if needed.
 */
const mockOpenRouterChatCompletion = (
  statusCode,
  responseBody,
  options = {}
) => {
  return nock(API_BASE_URL, options)
    .post(API_ENDPOINT_PATH) // Intercept POST requests to the chat completions endpoint
    .reply(statusCode, responseBody);
};

/**
 * Cleans up all nock interceptors. Should be called after each test or suite.
 */
const cleanupNocks = () => {
  nock.cleanAll();
};

/**
 * Checks if nock has any pending mocks. Useful for ensuring tests cleaned up.
 */
const pendingNocks = () => {
  return nock.pendingMocks();
};

module.exports = {
  mockOpenRouterChatCompletion,
  cleanupNocks,
  pendingNocks,
  API_BASE_URL,
  API_ENDPOINT_PATH,
};

const axios = require('axios');

const { ApiError, ToolExecutionError } = require('../../utils/errors.js'); // Adjust path if necessary

const {
  logger,
  apiKey,
  apiEndpoint,
  requestTimeout,
  INITIAL_RETRY_DELAY,
  MAX_RETRIES,
} = require('./configLoader.js');
const { systemPrompt } = require('./promptBuilder.js'); // Import system prompt

// Define user-friendly error messages for common API issues
const ERROR_MESSAGES = {
  401: 'API Authentication Failed. Please check your API key (OPENROUTER_API_KEY).',
  403: 'API Forbidden. You may not have permission for this operation or the requested model.',
  404: 'API Endpoint Not Found. Please check the configured API endpoint URL in llm_config.json.',
  429: 'API Rate Limit Exceeded. Please wait and try again, or check your API plan limits.',
  500: 'Internal Server Error on API side. Please try again later.',
  503: 'API Service Unavailable. Please try again later.',
  NETWORK:
    'Network Error: Could not connect to the refactoring service. Check internet connection and API endpoint.',
  OTHER_4XX: (status) =>
    `API Client Error: Received status code ${status}. Check request parameters or API documentation.`,
  OTHER_5XX: (status) =>
    `API Server Error: Received status code ${status}. The API service may be experiencing issues.`,
};

/**
 * Makes the API call to the LLM for code refactoring, including retry logic.
 *
 * @param {string} modelName - The name of the LLM model to use.
 * @param {string} userPrompt - The user prompt constructed by promptBuilder.
 * @returns {Promise<string>} A promise resolving to the raw content string from the LLM response.
 * @throws {ApiError} If the API call fails with a specific HTTP status code or network issue.
 * @throws {ToolExecutionError} If the retry mechanism fails or an unexpected error occurs.
 */
async function callRefactorApi(modelName, userPrompt) {
  let currentRetryAttempt = 0;
  const requestStartTime = Date.now(); // Track start time for overall request duration logging

  logger.debug(
    { modelName, endpoint: apiEndpoint },
    'Preparing to call LLM API.'
  );

  while (currentRetryAttempt <= MAX_RETRIES) {
    const attemptStartTime = Date.now(); // Track start time for this specific attempt
    try {
      logger.info(
        {
          attempt: currentRetryAttempt + 1,
          maxRetries: MAX_RETRIES,
          modelName,
        },
        'Sending request to LLM API.'
      );

      const response = await axios.post(
        `${apiEndpoint}/chat/completions`,
        {
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          // Consider making max_tokens and temperature configurable if needed
          max_tokens: 2000,
          temperature: 0.1,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer':
              'https://vibe-coder-mcp.local/tool/code-refactor-generator', // More specific referer
          },
          timeout: requestTimeout,
        }
      );

      const attemptDuration = Date.now() - attemptStartTime;
      const status = response.status;
      const responseData = response.data; // Store response data for logging/errors

      logger.debug(
        { status, attemptDuration },
        'Received response from LLM API attempt.'
      );

      // --- Success Handling (2xx) ---
      if (status >= 200 && status < 300) {
        const totalDuration = Date.now() - requestStartTime;
        logger.info(
          {
            status: status,
            apiCallDuration: attemptDuration, // Log duration of this successful attempt
            totalRequestDuration: totalDuration, // Log total time including retries
            promptTokens: responseData?.usage?.prompt_tokens,
            completionTokens: responseData?.usage?.completion_tokens,
            totalTokens: responseData?.usage?.total_tokens,
            modelUsed: modelName,
          },
          'Received successful response from LLM API.'
        );

        if (responseData?.choices?.[0]?.message?.content) {
          return responseData.choices[0].message.content; // Return the raw content
        } else {
          // Should not happen with a 2xx, but handle defensively
          logger.warn(
            { responseData, modelUsed: modelName },
            'Received 2xx status but no valid content from LLM.'
          );
          // Throwing an ApiError here might be misleading as the API call *was* successful (status 2xx)
          // A ToolExecutionError might be more appropriate, indicating an issue processing a successful response.
          throw new ToolExecutionError(
            'LLM returned a successful status but no valid content.',
            { responseData, modelUsed: modelName }
          );
        }
      }

      // --- Error Handling (Non-2xx) ---
      // Specific handling for 429 (Rate Limit) for retries
      if (status === 429) {
        if (currentRetryAttempt < MAX_RETRIES) {
          const delay =
            INITIAL_RETRY_DELAY * 2 ** currentRetryAttempt +
            Math.random() * 500; // Exponential backoff + jitter
          logger.warn(
            {
              attempt: currentRetryAttempt + 1,
              maxRetries: MAX_RETRIES,
              delay: Math.round(delay),
              status,
            },
            'Rate limit hit (429). Retrying after delay...'
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          currentRetryAttempt++;
          continue; // Go to next iteration of the while loop
        } else {
          logger.error(
            { status, modelUsed: modelName, attempts: MAX_RETRIES + 1 },
            'API Rate Limit Exceeded. Max retries reached.'
          );
          throw new ApiError(
            ERROR_MESSAGES[status] || `Rate Limit Error (Status ${status})`,
            status,
            { modelUsed: modelName, attempts: MAX_RETRIES + 1 }
          );
        }
      }

      // Handle other client (4xx) and server (5xx) errors - no retry for these
      let errorMessage;
      if (status >= 400 && status < 500) {
        errorMessage =
          ERROR_MESSAGES[status] || ERROR_MESSAGES.OTHER_4XX(status);
        logger.error(
          { status, modelUsed: modelName, responseData, errorMessage },
          'API call failed with client error.'
        );
      } else if (status >= 500 && status < 600) {
        errorMessage =
          ERROR_MESSAGES[status] || ERROR_MESSAGES.OTHER_5XX(status);
        logger.error(
          { status, modelUsed: modelName, responseData, errorMessage },
          'API call failed with server error.'
        );
      } else {
        errorMessage = `Unexpected API Status Code: ${status}`;
        logger.error(
          { status, modelUsed: modelName, responseData, errorMessage },
          'API call failed with unexpected status.'
        );
      }
      // Throw ApiError for any non-2xx status that isn't retried
      throw new ApiError(errorMessage, status, {
        modelUsed: modelName,
        responseData,
      });
    } catch (error) {
      const attemptDuration = Date.now() - attemptStartTime;
      logger.debug(
        {
          attempt: currentRetryAttempt + 1,
          attemptDuration,
          error: error.message,
        },
        'Error during API request attempt.'
      );

      // --- Axios Error Handling (Network issues, timeouts, etc.) ---
      if (axios.isAxiosError(error)) {
        // Handle specific Axios errors like timeouts or network issues
        if (
          error.code === 'ECONNABORTED' ||
          error.message.includes('timeout')
        ) {
          logger.error(
            {
              error: error.message,
              timeout: requestTimeout,
              modelUsed: modelName,
            },
            'API call timed out.'
          );
          // Decide if timeout should be retried (potentially risky if requests are long)
          // For now, treat timeout as a non-retryable ApiError
          throw new ApiError(
            `API call timed out after ${requestTimeout}ms.`,
            null,
            { modelUsed: modelName },
            error
          );
        } else if (error.response) {
          // If it's an Axios error with a response, it means the server responded with an error status.
          // This *should* have been caught by the status checks above, but handle defensively.
          const status = error.response.status;
          // If it's 429 and we can retry, do so.
          if (status === 429 && currentRetryAttempt < MAX_RETRIES) {
            const delay =
              INITIAL_RETRY_DELAY * 2 ** currentRetryAttempt +
              Math.random() * 500;
            logger.warn(
              {
                attempt: currentRetryAttempt + 1,
                maxRetries: MAX_RETRIES,
                delay: Math.round(delay),
                status,
              },
              'Rate limit hit (429) caught in Axios error handler. Retrying after delay...'
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            currentRetryAttempt++;
            continue; // Retry
          }
          // Otherwise, re-throw as an ApiError using the status code.
          const errorMessage =
            ERROR_MESSAGES[status] ||
            (status >= 500
              ? ERROR_MESSAGES.OTHER_5XX(status)
              : ERROR_MESSAGES.OTHER_4XX(status));
          logger.error(
            {
              status,
              modelUsed: modelName,
              responseData: error.response.data,
              errorMessage,
            },
            'API call failed (AxiosError with response).'
          );
          throw new ApiError(
            errorMessage,
            status,
            { modelUsed: modelName, responseData: error.response.data },
            error
          );
        } else {
          // Axios error without a response (network error, DNS issue, etc.)
          logger.error(
            { error: error.message, modelUsed: modelName },
            'Network error during API call.'
          );
          throw new ApiError(
            ERROR_MESSAGES.NETWORK,
            null,
            { modelUsed: modelName },
            error
          );
        }
      } else if (
        error instanceof ApiError ||
        error instanceof ToolExecutionError
      ) {
        // If the error is already one of our specific types (thrown from status handling), re-throw it directly.
        throw error;
      } else {
        // --- Catch-all for Unexpected Errors ---
        logger.error(
          { error: error.message || error, modelUsed: modelName },
          'Unexpected error during API call.'
        );
        throw new ToolExecutionError(
          `An unexpected error occurred during the API call: ${error.message || error}`,
          { modelUsed: modelName },
          error
        );
      }
    }
  }

  // If the loop finishes without returning (i.e., max retries exceeded for 429), throw an error.
  // This path should primarily be reached after exhausting retries for 429.
  const totalDuration = Date.now() - requestStartTime;
  logger.error(
    { modelUsed: modelName, attempts: MAX_RETRIES + 1, totalDuration },
    'Code refactoring failed after maximum retries.'
  );
  // Throw a specific error indicating retry exhaustion
  throw new ToolExecutionError(
    ERROR_MESSAGES[429] || 'API Rate Limit Exceeded. Max retries reached.',
    { modelUsed: modelName, attempts: MAX_RETRIES + 1 }
  );
}

module.exports = {
  callRefactorApi,
};

// src/testUtils/mockLLM.ts
import axios, {
  AxiosError,
  AxiosResponse,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
  AxiosHeaders,
} from 'axios'; // Import AxiosHeaders
import dotenv from 'dotenv';
import { vi } from 'vitest';

// Load env variables to get the base URL, ensure this runs before tests need it
dotenv.config();
const openRouterBaseUrl =
  process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

/**
 * Options for configuring the mock OpenRouter response.
 */
export interface MockOptions {
  // Export the interface
  /** Optional: Mock only for a specific model name or a RegExp pattern. */
  model?: string | RegExp;
  /** The content to be placed in choices[0].message.content. Required unless shouldError is true. If an object, it will be JSON.stringified. */
  responseContent?: string | object; // Make optional
  /** Optional: The HTTP status code for the mock response (default: 200 for success, 500 for error). */
  statusCode?: number;
  /** Optional: Set to true to simulate an error response (default: false). */
  shouldError?: boolean;
  /** Optional: Custom error message if shouldError is true (default: 'Mock API Error'). */
  errorMessage?: string;
  /** Optional: Override the default URL pattern to match against axios.post calls. */
  matchUrl?: string | RegExp;
}

/**
 * Sets up a mock for axios.post specifically targeting OpenRouter chat completions API endpoint.
 * This simplifies mocking LLM responses or errors in Vitest tests.
 *
 * Call this within a `beforeEach` or inside specific tests. Remember to clear or restore
 * mocks using `vi.clearAllMocks()` or `vi.restoreAllMocks()` in an `afterEach` or `afterAll` block.
 *
 * @param options Configuration for the mock response or error.
 */
export function mockOpenRouterResponse(options: MockOptions): void {
  const {
    model,
    responseContent,
    statusCode = options.shouldError ? 500 : 200,
    shouldError = false,
    errorMessage = 'Mock API Error',
    matchUrl = `${openRouterBaseUrl}/chat/completions`, // Default match URL pattern
  } = options;

  // Get the spy on axios.post. If multiple mocks are needed in one test,
  // subsequent calls might refine the implementation based on URL/model.
  // Vitest spies allow multiple mockImplementations, the last one matching usually wins,
  // but more specific matching inside the implementation is safer.
  const axiosPostSpy = vi.spyOn(axios, 'post');

  // We need to use 'any' here to match axios.post's complex generic signature
  // The eslint rule is disabled because in mocking contexts, 'any' is sometimes unavoidable
  // when dealing with library methods that use complex generic types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  axiosPostSpy.mockImplementation(
    async (
      url: string,
      data?: any,
      config?: AxiosRequestConfig
    ): Promise<AxiosResponse> => {
      // 1. Check if the URL matches the expected OpenRouter endpoint
      const urlMatches =
        (typeof matchUrl === 'string' && url === matchUrl) ||
        (matchUrl instanceof RegExp && matchUrl.test(url));

      if (!urlMatches) {
        // IMPORTANT: If the URL doesn't match, we should not handle this call.
        // We need to call the original implementation or throw a specific error
        // indicating an unexpected call that this mock wasn't intended for.
        // Calling original requires more setup. For simplicity, throw an error.
        console.error(
          `Unexpected axios.post call to URL: ${url}. Mock configured for ${matchUrl}`
        );
        throw new Error(
          `Unexpected axios.post call to URL: ${url}. Mock configured for ${matchUrl}`
        );
        // Alternatively, if you have the original implementation saved:
        // return originalAxiosPost(url, data, config);
      }

      // 2. Check if the model matches (if a model filter was provided)
      const requestModel = data?.model;
      let modelMatches = true; // Assume match if no model filter in options
      if (model && requestModel) {
        // Only check if both 'model' option and request data 'model' exist
        modelMatches =
          (typeof model === 'string' && requestModel === model) ||
          (model instanceof RegExp && model.test(requestModel));
      }

      // If a model filter was provided but didn't match, this mock shouldn't handle it.
      if (model && !modelMatches) {
        console.error(
          `Unexpected axios.post call for model: ${requestModel}. Mock configured for ${model}`
        );
        throw new Error(
          `Unexpected axios.post call for model: ${requestModel}. Mock configured for ${model}`
        );
        // Alternatively, call original implementation if saved.
      }

      // If URL and Model (if specified) match, proceed with mocking response/error

      // 3. Simulate error if requested
      if (shouldError) {
        // Ensure config is at least an empty object if undefined for error construction
        const errorConfig = config || {};
        // Ensure the config object passed to AxiosError has AxiosHeaders type
        const internalErrorConfig: InternalAxiosRequestConfig = {
          ...errorConfig,
          headers: new AxiosHeaders(), // Assign a new, empty AxiosHeaders to satisfy the type
        };
        const error = new AxiosError(
          errorMessage,
          statusCode.toString(),
          internalErrorConfig, // Pass the config with defined headers
          data, // Request object
          {
            // Mock AxiosResponse structure for the error
            data: { error: { message: errorMessage, type: 'mock_error' } },
            status: statusCode,
            statusText: 'Mock Error',
            headers: {}, // Response headers can be empty
            config: internalErrorConfig, // Use the config with defined headers
          } as AxiosResponse
        );
        // Log the mocked rejection
        console.log(
          `mockOpenRouterResponse: Mocking rejection for URL ${url} (Model: ${requestModel || 'N/A'})`
        );
        return Promise.reject(error);
      }

      // 4. Prepare successful response content
      const messageContent =
        typeof responseContent === 'object'
          ? JSON.stringify(responseContent) // Stringify if it's an object (e.g., for JSON mode)
          : responseContent;

      // 5. Simulate successful response structure (mimicking OpenRouter)
      const mockResponseData = {
        id: `chatcmpl-mock-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: requestModel || 'mock-model', // Use the model from the request data
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: messageContent,
            },
            finish_reason: 'stop', // Common finish reason
          },
        ],
        usage: {
          // Include mock usage data
          prompt_tokens: 50, // Example value
          completion_tokens: 50, // Example value
          total_tokens: 100, // Example value
        },
      };

      // Log the mocked resolution
      console.log(
        `mockOpenRouterResponse: Mocking success for URL ${url} (Model: ${requestModel || 'N/A'})`
      );
      return Promise.resolve({
        data: mockResponseData,
        status: statusCode,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' }, // Mock response headers
        // Ensure the config object within the mock response also has AxiosHeaders type
        config: {
          ...(config || {}),
          headers: new AxiosHeaders(), // Assign a new, empty AxiosHeaders to satisfy the type
        } as InternalAxiosRequestConfig,
      } as AxiosResponse);
    }
  );
}

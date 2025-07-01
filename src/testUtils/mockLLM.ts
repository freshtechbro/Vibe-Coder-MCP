// src/testUtils/mockLLM.ts
import axios, { AxiosError, AxiosResponse, AxiosRequestConfig, InternalAxiosRequestConfig, AxiosHeaders } from 'axios'; // Import AxiosHeaders
import { vi } from 'vitest';
import * as dotenv from 'dotenv';

// Load env variables to get the base URL, ensure this runs before tests need it
dotenv.config();
const openRouterBaseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

/**
 * LLM operation types for smart response formatting
 */
export type LLMOperationType = 'intent_recognition' | 'task_decomposition' | 'atomic_detection' | 'auto';

/**
 * Options for configuring the mock OpenRouter response.
 */
export interface MockOptions { // Export the interface
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
  /** Optional: Specify the operation type for smart response formatting (default: 'auto' - detects from request) */
  operationType?: LLMOperationType;
}

/**
 * Request data interface for LLM operations
 */
interface LLMRequestData {
  messages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: string;
  [key: string]: unknown;
}

/**
 * Detects the LLM operation type from the request content
 * Performance optimized with caching
 */
function detectOperationType(requestData: LLMRequestData): LLMOperationType {
  const messages = requestData?.messages || [];
  const systemMessage = messages.find((m) => m.role === 'system')?.content || '';
  const userMessage = messages.find((m) => m.role === 'user')?.content || '';

  // Create cache key from message content
  const cacheKey = `${systemMessage}|${userMessage}`;

  // Check cache first for performance
  if (operationTypeCache.has(cacheKey)) {
    return operationTypeCache.get(cacheKey)!;
  }

  let operationType: LLMOperationType = 'intent_recognition';

  // Check for intent recognition patterns (most specific first)
  if (systemMessage.includes('natural language processing system') ||
      systemMessage.includes('recognizing user intents') ||
      systemMessage.includes('intent recognition') ||
      userMessage.includes('recognize intent') ||
      userMessage.includes('intent recognition')) {
    operationType = 'intent_recognition';
  }
  // Check for atomic detection patterns (very specific)
  else if (systemMessage.includes('atomic task detection') ||
      systemMessage.includes('atomic task analyzer') ||
      systemMessage.includes('determine if a given task is atomic') ||
      systemMessage.includes('RDD (Recursive Decomposition and Decision-making)') ||
      userMessage.includes('isAtomic') ||
      userMessage.includes('atomic task analysis')) {
    operationType = 'atomic_detection';
  }
  // Check for task decomposition patterns
  else if (systemMessage.includes('task decomposition specialist') ||
      systemMessage.includes('break down complex tasks') ||
      systemMessage.includes('decomposing complex tasks') ||
      systemMessage.includes('decomposition') ||
      systemMessage.includes('split') ||
      userMessage.includes('decompose') ||
      userMessage.includes('break down')) {
    operationType = 'task_decomposition';
  }

  // Cache the result for future calls
  operationTypeCache.set(cacheKey, operationType);

  return operationType;
}

/**
 * Response content type for LLM operations
 */
type LLMResponseContent = string | Record<string, unknown>;

/**
 * Formats response content based on operation type
 * Performance optimized with prebuilt responses
 */
function formatResponseForOperation(content: LLMResponseContent, operationType: LLMOperationType): string {
  if (typeof content === 'string') {
    return content;
  }

  // If content is already properly formatted for the operation, use it as-is
  if (typeof content === 'object' && Object.keys(content).length > 0) {
    switch (operationType) {
      case 'intent_recognition':
        // Ensure intent recognition format
        if (content.intent && typeof content.confidence === 'number') {
          return JSON.stringify(content);
        }
        break;

      case 'atomic_detection':
        // Ensure atomic detection format
        if (typeof content.isAtomic === 'boolean') {
          return JSON.stringify(content);
        }
        break;

      case 'task_decomposition':
        // Ensure task decomposition format
        if (content.tasks || content.subTasks) {
          return JSON.stringify(content);
        }
        break;
    }
  }

  // Use prebuilt response for performance if content is empty or doesn't match format
  if (prebuiltResponses.has(operationType)) {
    const prebuilt = prebuiltResponses.get(operationType)!;

    // Merge with provided content if any
    if (typeof content === 'object' && Object.keys(content).length > 0) {
      return JSON.stringify({ ...prebuilt, ...content });
    }

    return JSON.stringify(prebuilt);
  }

  // Fallback to original logic for unknown operation types
  return JSON.stringify(content || {});
}

/**
 * Queue for storing multiple mock responses for sequential calls
 * Using a Map to isolate queues per test context
 */
const mockResponseQueues = new Map<string, MockOptions[]>();
let currentTestId: string | null = null;

/**
 * Performance optimization: Cache for operation type detection
 */
const operationTypeCache = new Map<string, LLMOperationType>();

/**
 * Performance optimization: Pre-built mock responses for common operations
 */
const prebuiltResponses = new Map<LLMOperationType, object>();

// Initialize prebuilt responses for performance
prebuiltResponses.set('intent_recognition', {
  intent: 'create_task',
  confidence: 0.85,
  parameters: { task_title: 'implement user authentication', type: 'development' },
  context: { temporal: 'immediate', urgency: 'normal' },
  alternatives: []
});

prebuiltResponses.set('task_decomposition', {
  tasks: [{
    title: 'Default Task',
    description: 'Default decomposed task',
    estimatedHours: 0.1,
    acceptanceCriteria: ['Task should be completed'],
    priority: 'medium'
  }]
});

prebuiltResponses.set('atomic_detection', {
  isAtomic: true,
  confidence: 0.98,
  reasoning: 'Task is atomic and focused',
  estimatedHours: 0.1,
  complexityFactors: [],
  recommendations: []
});

/**
 * Sets up a mock for axios.post specifically targeting OpenRouter chat completions API endpoint.
 * This simplifies mocking LLM responses or errors in Vitest tests.
 *
 * Call this within a `beforeEach` or inside specific tests. Remember to clear or restore
 * mocks using `vi.clearAllMocks()` or `vi.restoreAllMocks()` in an `afterEach` or `afterAll` block.
 *
 * @param options Configuration for the mock response or error.
 */
/**
 * Set the current test ID for mock isolation
 */
export function setTestId(testId: string): void {
  currentTestId = testId;
  if (!mockResponseQueues.has(testId)) {
    mockResponseQueues.set(testId, []);
  }
}

/**
 * Queue multiple mock responses for sequential LLM calls
 * Useful for tests that make multiple LLM calls with different operation types
 */
export function queueMockResponses(responses: MockOptions[]): void {
  if (!currentTestId) {
    throw new Error('Test ID must be set before queueing mock responses. Call setTestId() first.');
  }
  mockResponseQueues.set(currentTestId, [...responses]);
  // Set up the mock with the first response, but use queue logic
  if (responses.length > 0) {
    mockOpenRouterResponse(responses[0]);
  }
}

/**
 * Clear the mock response queue for the current test
 */
export function clearMockQueue(): void {
  if (currentTestId) {
    mockResponseQueues.set(currentTestId, []);
  }
}

/**
 * Clear all mock queues (for cleanup)
 */
export function clearAllMockQueues(): void {
  mockResponseQueues.clear();
  currentTestId = null;
}

/**
 * Clear performance caches for test isolation
 * Call this in test cleanup to prevent cache pollution between tests
 */
export function clearPerformanceCaches(): void {
  operationTypeCache.clear();
}

/**
 * Get performance cache statistics for monitoring
 */
export function getPerformanceStats(): { cacheSize: number; cacheHitRate?: number } {
  return {
    cacheSize: operationTypeCache.size,
    // Note: Hit rate tracking would require additional counters
  };
}

/**
 * Enhanced mock templates for common test scenarios
 */
export const MockTemplates = {
  /**
   * Standard intent recognition response template
   */
  intentRecognition: (intent: string = 'create_task', confidence: number = 0.85): MockOptions => ({
    responseContent: {
      intent,
      confidence,
      parameters: {
        task_title: 'test task',
        type: 'development'
      },
      context: {
        temporal: 'immediate',
        urgency: 'normal'
      },
      alternatives: []
    },
    model: /google\/gemini-2\.5-flash-preview/,
    operationType: 'intent_recognition'
  }),

  /**
   * Standard atomic detection response template
   */
  atomicDetection: (isAtomic: boolean = true, confidence: number = 0.9): MockOptions => ({
    responseContent: {
      isAtomic,
      confidence,
      reasoning: isAtomic ? 'Task is atomic and focused' : 'Task can be decomposed further',
      estimatedHours: isAtomic ? 0.1 : 2.0,
      complexityFactors: isAtomic ? [] : ['Multiple components', 'Complex logic'],
      recommendations: []
    },
    model: /google\/gemini-2\.5-flash-preview/,
    operationType: 'atomic_detection'
  }),

  /**
   * Standard task decomposition response template
   */
  taskDecomposition: (subtaskCount: number = 3): MockOptions => ({
    responseContent: {
      subtasks: Array(subtaskCount).fill(null).map((_, i) => ({
        id: `subtask-${i + 1}`,
        title: `Subtask ${i + 1}`,
        description: `Description for subtask ${i + 1}`,
        estimatedHours: 0.1,
        priority: 'medium',
        acceptanceCriteria: [`Criteria ${i + 1}`],
        tags: ['test']
      })),
      reasoning: 'Task decomposed into atomic subtasks',
      confidence: 0.9
    },
    model: /google\/gemini-2\.5-flash-preview/,
    operationType: 'task_decomposition'
  }),

  /**
   * Error response template for testing error handling
   */
  error: (errorMessage: string = 'Mock API Error'): MockOptions => ({
    shouldError: true,
    errorMessage,
    statusCode: 500,
    model: /google\/gemini-2\.5-flash-preview/
  })
};

/**
 * Performance-optimized mock queue builder for common test patterns
 */
export class MockQueueBuilder {
  private queue: MockOptions[] = [];

  /**
   * Add multiple intent recognition responses
   */
  addIntentRecognitions(count: number, intent: string = 'create_task'): MockQueueBuilder {
    for (let i = 0; i < count; i++) {
      this.queue.push(MockTemplates.intentRecognition(intent, 0.8 + (i * 0.02)));
    }
    return this;
  }

  /**
   * Add multiple atomic detection responses
   */
  addAtomicDetections(count: number, isAtomic: boolean = true): MockQueueBuilder {
    for (let i = 0; i < count; i++) {
      this.queue.push(MockTemplates.atomicDetection(isAtomic, 0.9 + (i * 0.01)));
    }
    return this;
  }

  /**
   * Add task decomposition responses
   */
  addTaskDecompositions(count: number, subtaskCount: number = 3): MockQueueBuilder {
    for (let i = 0; i < count; i++) {
      this.queue.push(MockTemplates.taskDecomposition(subtaskCount));
    }
    return this;
  }

  /**
   * Add error responses for testing error handling
   */
  addErrors(count: number, errorMessage?: string): MockQueueBuilder {
    for (let i = 0; i < count; i++) {
      this.queue.push(MockTemplates.error(errorMessage));
    }
    return this;
  }

  /**
   * Build and return the queue
   */
  build(): MockOptions[] {
    return [...this.queue];
  }

  /**
   * Build and immediately queue the responses
   */
  queueResponses(): void {
    queueMockResponses(this.build());
  }

  /**
   * Clear the builder
   */
  clear(): MockQueueBuilder {
    this.queue = [];
    return this;
  }
}

/**
 * Performance-optimized test utilities for enhanced mock coverage
 */
export class PerformanceTestUtils {
  /**
   * Create a robust mock queue for tests that may make many LLM calls
   * Prevents queue exhaustion and provides fallback responses
   */
  static createRobustQueue(primaryResponses: MockOptions[], fallbackCount: number = 20): MockOptions[] {
    const fallbackResponses = Array(fallbackCount).fill(null).map(() =>
      MockTemplates.atomicDetection(true, 0.95) // High confidence atomic detection as fallback
    );
    return [...primaryResponses, ...fallbackResponses];
  }

  /**
   * Setup enhanced mocks for a test with automatic cleanup
   */
  static setupEnhancedMocks(testId: string, responses: MockOptions[]): void {
    setTestId(testId);
    queueMockResponses(this.createRobustQueue(responses));
  }

  /**
   * Create mock responses for concurrent test scenarios
   */
  static createConcurrentMocks(operationType: LLMOperationType, count: number): MockOptions[] {
    const builder = new MockQueueBuilder();

    switch (operationType) {
      case 'intent_recognition':
        builder.addIntentRecognitions(count);
        break;
      case 'atomic_detection':
        builder.addAtomicDetections(count);
        break;
      case 'task_decomposition':
        builder.addTaskDecompositions(count);
        break;
      default:
        // Mixed responses for auto-detection
        builder
          .addIntentRecognitions(Math.ceil(count / 3))
          .addAtomicDetections(Math.ceil(count / 3))
          .addTaskDecompositions(Math.floor(count / 3));
    }

    return builder.build();
  }

  /**
   * Performance monitoring for mock usage
   */
  static async measureMockPerformance<T>(testName: string, testFn: () => Promise<T>): Promise<T & { mockPerformance: { duration: number; cacheStats: { start: { cacheSize: number }; end: { cacheSize: number }; growth: number } } }> {
    const startTime = Date.now();
    const startStats = getPerformanceStats();

    try {
      const result = await testFn();
      const endTime = Date.now();
      const endStats = getPerformanceStats();

      const mockPerformance = {
        duration: endTime - startTime,
        cacheStats: {
          start: startStats,
          end: endStats,
          growth: endStats.cacheSize - startStats.cacheSize
        }
      };

      // Performance warning if test takes too long
      if (mockPerformance.duration > 2000) {
        console.warn(`⚠️ Test "${testName}" took ${mockPerformance.duration}ms - consider optimizing mocks`);
      }

      return { ...result, mockPerformance } as T & { mockPerformance: { duration: number; cacheStats: { start: { cacheSize: number }; end: { cacheSize: number }; growth: number } } };
    } catch (error) {
      const endTime = Date.now();
      const endStats = getPerformanceStats();
      
      const mockPerformance = {
        duration: endTime - startTime,
        cacheStats: {
          start: startStats,
          end: endStats,
          growth: endStats.cacheSize - startStats.cacheSize
        }
      };
      
      console.error(`❌ Test "${testName}" failed after ${mockPerformance.duration}ms`);
      throw error;
    }
  }
}

/**
 * Create operation-aware fallback response when queue is exhausted
 */
function createOperationAwareFallback(operation: string, originalOptions: MockOptions): MockOptions {
  const fallbackOptions = { ...originalOptions };

  switch (operation) {
    case 'intent_recognition':
      fallbackOptions.responseContent = {
        intent: 'create_task',
        confidence: 0.85,
        parameters: {
          task_title: 'fallback task',
          type: 'development'
        },
        context: {
          temporal: 'immediate',
          urgency: 'normal'
        },
        alternatives: []
      };
      break;

    case 'atomic_detection':
      fallbackOptions.responseContent = {
        isAtomic: true,
        confidence: 0.95,
        reasoning: 'Fallback atomic detection - task is considered atomic',
        estimatedHours: 0.08,
        complexityFactors: [],
        recommendations: []
      };
      break;

    case 'task_decomposition':
      fallbackOptions.responseContent = {
        tasks: [
          {
            title: 'Fallback Task',
            description: 'Fallback task created when queue exhausted',
            estimatedHours: 0.08,
            acceptanceCriteria: ['Task should be completed'],
            priority: 'medium',
            tags: ['fallback']
          }
        ]
      };
      break;

    default:
      // Default to intent recognition format
      fallbackOptions.responseContent = {
        intent: 'create_task',
        confidence: 0.75,
        parameters: {},
        context: {},
        alternatives: []
      };
  }

  return fallbackOptions;
}

export function mockOpenRouterResponse(options: MockOptions): void {
  const {
    model,
    matchUrl = `${openRouterBaseUrl}/chat/completions` // Default match URL pattern
  } = options;

  // Get the spy on axios.post. If multiple mocks are needed in one test,
  // subsequent calls might refine the implementation based on URL/model.
  // Vitest spies allow multiple mockImplementations, the last one matching usually wins,
  // but more specific matching inside the implementation is safer.
  const axiosPostSpy = vi.spyOn(axios, 'post');

  // We use 'unknown' for the data parameter as it could be any valid JSON data
  // The axios.post signature allows for flexible data types in HTTP requests
  axiosPostSpy.mockImplementation(async (url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse> => {
    // 1. Check if the URL matches the expected OpenRouter endpoint
    const urlMatches = (typeof matchUrl === 'string' && url === matchUrl) ||
                       (matchUrl instanceof RegExp && matchUrl.test(url));

    if (!urlMatches) {
      // IMPORTANT: If the URL doesn't match, we should not handle this call.
      // We need to call the original implementation or throw a specific error
      // indicating an unexpected call that this mock wasn't intended for.
      // Calling original requires more setup. For simplicity, throw an error.
      console.error(`Unexpected axios.post call to URL: ${url}. Mock configured for ${matchUrl}`);
      throw new Error(`Unexpected axios.post call to URL: ${url}. Mock configured for ${matchUrl}`);
      // Alternatively, if you have the original implementation saved:
      // return originalAxiosPost(url, data, config);
    }

    // 2. Check if the model matches (if a model filter was provided)
    const requestModel = (data as Record<string, unknown>)?.model;
    let modelMatches = true; // Assume match if no model filter in options
    if (model && requestModel) { // Only check if both 'model' option and request data 'model' exist
      modelMatches = (typeof model === 'string' && requestModel === model) ||
                     (model instanceof RegExp && model.test(requestModel as string));
    }

    // If a model filter was provided but didn't match, this mock shouldn't handle it.
    if (model && !modelMatches) {
         console.error(`Unexpected axios.post call for model: ${requestModel}. Mock configured for ${model}`);
         throw new Error(`Unexpected axios.post call for model: ${requestModel}. Mock configured for ${model}`);
         // Alternatively, call original implementation if saved.
    }

    // If URL and Model (if specified) match, proceed with mocking response/error

    // 3. Detect operation type first (needed for fallback logic)
    let detectedOperationType: LLMOperationType;
    if (options.operationType && options.operationType !== 'auto') {
      // Use explicitly specified operation type
      detectedOperationType = options.operationType;
    } else {
      // Auto-detect from request content
      detectedOperationType = detectOperationType(data as LLMRequestData);
    }

    // 4. Use queued response if available, otherwise use current options with operation-aware fallback
    let currentOptions = options;

    if (currentTestId && mockResponseQueues.has(currentTestId)) {
      const testQueue = mockResponseQueues.get(currentTestId)!;
      if (testQueue.length > 0) {
        currentOptions = testQueue.shift()!; // Get and remove first item from queue
        // Performance: Removed console.log for faster test execution
      } else {
        // Queue exhausted - use operation-aware fallback
        // Performance: Removed console.log for faster test execution
        currentOptions = createOperationAwareFallback(detectedOperationType, options);
      }
    }

    // 5. Simulate error if requested
    if (currentOptions.shouldError) {
      const currentErrorMessage = currentOptions.errorMessage || 'Mock API Error';
      const currentStatusCode = currentOptions.statusCode || 500;
      // Ensure config is at least an empty object if undefined for error construction
      const errorConfig = config || {};
      // Ensure the config object passed to AxiosError has AxiosHeaders type
      const internalErrorConfig: InternalAxiosRequestConfig = {
        ...errorConfig,
        headers: new AxiosHeaders(), // Assign a new, empty AxiosHeaders to satisfy the type
      };
      const error = new AxiosError(
        currentErrorMessage,
        currentStatusCode.toString(),
        internalErrorConfig, // Pass the config with defined headers
        data, // Request object
        { // Mock AxiosResponse structure for the error
          data: { error: { message: currentErrorMessage, type: 'mock_error' } },
          status: currentStatusCode,
          statusText: 'Mock Error',
          headers: {}, // Response headers can be empty
          config: internalErrorConfig, // Use the config with defined headers
        } as AxiosResponse
      );
      // Log the mocked rejection
      // Performance: Removed console.log for faster test execution
      return Promise.reject(error);
    }

    // 6. Prepare successful response content with smart formatting
    // Update operation type if current options specify it
    if (currentOptions.operationType && currentOptions.operationType !== 'auto') {
      detectedOperationType = currentOptions.operationType;
    }

    const messageContent = currentOptions.responseContent
      ? formatResponseForOperation(currentOptions.responseContent as LLMResponseContent, detectedOperationType)
      : formatResponseForOperation({}, detectedOperationType);

    // 7. Simulate successful response structure (mimicking OpenRouter)
    const currentStatusCode = currentOptions.statusCode || 200;
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
      usage: { // Include mock usage data
        prompt_tokens: 50, // Example value
        completion_tokens: 50, // Example value
        total_tokens: 100, // Example value
      },
    };

    // Performance: Removed console.log for faster test execution
    // Response source tracking removed to eliminate unused variable
    return Promise.resolve({
       data: mockResponseData,
       status: currentStatusCode,
       statusText: 'OK',
       headers: { 'content-type': 'application/json' }, // Mock response headers
       // Ensure the config object within the mock response also has AxiosHeaders type
       config: {
         ...(config || {}),
         headers: new AxiosHeaders(), // Assign a new, empty AxiosHeaders to satisfy the type
       } as InternalAxiosRequestConfig,
    } as AxiosResponse);
  });
}

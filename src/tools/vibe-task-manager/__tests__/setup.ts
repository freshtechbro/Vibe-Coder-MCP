/**
 * Test setup file for Vibe Task Manager integration tests
 * Loads environment variables and sets up test environment
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { vi } from 'vitest';
import { TimeoutManager } from '../utils/timeout-manager.js';
import { VibeTaskManagerConfig } from '../utils/config-loader.js';
import { OpenRouterConfigManager } from '../../../utils/openrouter-config-manager.js';
import { setConfigProvider, TestConfigProvider } from '../../../utils/config-provider.js';
import logger from '../../../logger.js';

// Load environment variables from .env file
config({ path: resolve(process.cwd(), '.env') });

/**
 * Setup CI-safe environment variables
 * Provides safe defaults for CI environments without real API keys
 */
export function setupCISafeEnvironment(): void {
  const isCIEnvironment = (
    process.env.CI === 'true' ||
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.VITEST === 'true' ||
    process.env.NODE_ENV === 'test'
  );

  if (isCIEnvironment) {
    // Set safe defaults for CI environment
    process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'ci-test-key-safe-default';
    process.env.OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://test.openrouter.ai/api/v1';
    process.env.GEMINI_MODEL = process.env.GEMINI_MODEL || 'google/gemini-2.5-flash-preview-05-20';
    process.env.PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'perplexity/llama-3.1-sonar-small-128k-online';
    
    // Set CI-specific flags
    process.env.CI_SAFE_MODE = 'true';
    process.env.FORCE_REAL_LLM_CONFIG = 'false';
    
    logger.info('CI-safe environment variables configured');
  } else {
    // Ensure required environment variables are available for local tests
    if (!process.env.OPENROUTER_API_KEY) {
      console.warn('Warning: OPENROUTER_API_KEY not found in environment variables');
    }

    if (!process.env.GEMINI_MODEL) {
      // Set default if not provided
      process.env.GEMINI_MODEL = 'google/gemini-2.5-flash-preview-05-20';
    }

    if (!process.env.OPENROUTER_BASE_URL) {
      // Set default if not provided
      process.env.OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
    }
  }
}

// Initialize CI-safe environment immediately
setupCISafeEnvironment();

/**
 * Setup universal LLM call mocking for CI-safe tests
 * Prevents all live API calls in test environments
 */
export function setupUniversalLLMMocking(): void {
  const isCIEnvironment = (
    process.env.CI === 'true' ||
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.VITEST === 'true' ||
    process.env.NODE_ENV === 'test' ||
    process.env.CI_SAFE_MODE === 'true'
  );

  if (isCIEnvironment) {
    // Mock all LLM calls universally - following existing pattern in test-setup.ts
    vi.mock('../../../utils/llmHelper.js', () => ({
      performFormatAwareLlmCall: vi.fn().mockImplementation(async (prompt: string, config: unknown, taskName?: string) => {
        // Generate mock responses based on prompt content and task type for realistic testing
        
        // Task decomposition responses - check task name and prompt content for decomposition keywords
        if (taskName?.includes('decomposition') || taskName?.includes('task_decomposition') ||
            prompt.includes('decompose') || prompt.includes('split') || 
            prompt.includes('subTasks') || prompt.includes('subtasks') || 
            prompt.includes('break down') || prompt.includes('into smaller')) {
          return JSON.stringify({
            contextualInsights: {
              codebaseAlignment: "Mock alignment with existing patterns",
              researchIntegration: "Mock research integration",
              technologySpecifics: "TypeScript, Node.js, Vitest",
              estimationFactors: "Mock estimation factors"
            },
            tasks: [
              {
                title: "Mock decomposed task",
                description: "Mock task description for testing",
                type: "development",
                priority: "medium",
                estimatedHours: 1,
                filePaths: ["src/mock/file.ts"],
                acceptanceCriteria: ["Mock acceptance criterion"],
                tags: ["mock", "test"],
                dependencies: [],
                contextualNotes: {
                  codebaseReferences: "Mock codebase references",
                  researchJustification: "Mock research justification",
                  integrationConsiderations: "Mock integration considerations",
                  riskMitigation: "Mock risk mitigation"
                }
              }
            ]
          });
        }
        
        // Atomic detection responses - check for atomic keywords
        if (taskName?.includes('atomic') || prompt.includes('atomic') || 
            prompt.includes('isAtomic')) {
          return JSON.stringify({
            isAtomic: true,
            confidence: 0.95,
            reasoning: "Mock atomic analysis for testing",
            estimatedHours: 0.5,
            complexityFactors: ["mock_factor"],
            recommendations: ["Mock recommendation"]
          });
        }

        // Research evaluation responses
        if (taskName?.includes('research') || prompt.includes('research') || 
            prompt.includes('shouldTriggerResearch')) {
          return JSON.stringify({
            decision: {
              shouldTriggerResearch: false,
              confidence: 0.8,
              primaryReason: "sufficient_context",
              reasoning: "Mock research evaluation for testing"
            }
          });
        }

        // Default fallback: If prompt looks like it needs task decomposition, provide that format
        if (prompt.includes('task') && (prompt.includes('complex') || prompt.includes('break') || 
            prompt.includes('split') || prompt.length > 200)) {
          return JSON.stringify({
            tasks: [
              {
                title: "Fallback decomposed task",
                description: "Fallback mock task description",
                type: "development",
                priority: "medium",
                estimatedHours: 2,
                filePaths: ["src/fallback/mock.ts"],
                acceptanceCriteria: ["Fallback acceptance criterion"],
                tags: ["fallback", "mock"],
                dependencies: []
              }
            ]
          });
        }

        // Generic fallback response
        return JSON.stringify({
          result: "Mock LLM response for testing",
          confidence: 0.9,
          reasoning: "Mock reasoning for test environment"
        });
      }),
      enhancedProgressiveJsonParsing: vi.fn().mockImplementation(async (response: string) => {
        try {
          return JSON.parse(response);
        } catch {
          return { result: "Mock parsed response", error: false };
        }
      })
    }));

    logger.info('Universal LLM mocking setup for CI environment');
  }
}

/**
 * Setup configuration manager mocking for tests
 * Provides safe defaults and prevents real API calls
 */
export function setupConfigManagerMock(): void {
  const isCIEnvironment = (
    process.env.CI === 'true' ||
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.VITEST === 'true' ||
    process.env.NODE_ENV === 'test'
  );

  if (isCIEnvironment) {
    // Use test configuration provider for CI environments
    const testProvider = new TestConfigProvider();
    setConfigProvider(testProvider);
    
    // Reset OpenRouterConfigManager singleton to ensure clean state
    OpenRouterConfigManager.resetInstance();
    
    logger.info('Configuration manager mocking setup for CI environment');
  }
}

// Setup configuration mocking immediately for CI environments
setupConfigManagerMock();

// Setup universal LLM mocking for all test environments
setupUniversalLLMMocking();

/**
 * Setup storage manager mocking for tests
 * Prevents file system operations in test environments
 */
export function setupStorageManagerMock(): void {
  const isCIEnvironment = (
    process.env.CI === 'true' ||
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.VITEST === 'true' ||
    process.env.NODE_ENV === 'test'
  );

  if (isCIEnvironment) {
    // Mock storage manager universally
    vi.mock('../core/storage/storage-manager.js', () => ({
      getStorageManager: vi.fn().mockResolvedValue({
        projectExists: vi.fn().mockResolvedValue(true),
        epicExists: vi.fn().mockResolvedValue(false),
        taskExists: vi.fn().mockResolvedValue(false),
        dependencyExists: vi.fn().mockResolvedValue(false),
        // Add other required methods as needed
        loadProject: vi.fn(),
        saveProject: vi.fn(),
        loadEpic: vi.fn(),
        saveEpic: vi.fn(),
        loadTask: vi.fn(),
        saveTask: vi.fn(),
        deleteProject: vi.fn(),
        deleteEpic: vi.fn(),
        deleteTask: vi.fn()
      })
    }));
    
    logger.info('Storage manager mocking setup for CI environment');
  }
}

// Setup storage manager mocking
setupStorageManagerMock();

// Set test-specific environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'info';

// Epic creation test configurations
process.env.EPIC_CREATION_TEST_MODE = 'true';
process.env.EPIC_VALIDATION_TIMEOUT = '5000'; // 5 seconds for tests
process.env.EPIC_CONTEXT_RESOLVER_CACHE_TTL = '1000'; // 1 second for tests

// Test data directories
process.env.TEST_DATA_DIR = resolve(process.cwd(), 'src/tools/vibe-task-manager/__tests__/data');
process.env.TEST_OUTPUT_DIR = resolve(process.cwd(), 'src/tools/vibe-task-manager/__tests__/output');

/**
 * Default test configuration for TimeoutManager and other services
 */
const defaultTestConfig: VibeTaskManagerConfig['taskManager'] = {
  maxConcurrentTasks: 3, // Reduced for tests
  defaultTaskTemplate: 'test',
  dataDirectory: process.env.TEST_OUTPUT_DIR!,
  performanceTargets: {
    maxResponseTime: 1000, // 1 second for tests
    maxMemoryUsage: 512, // 512MB for tests
    minTestCoverage: 80
  },
  agentSettings: {
    maxAgents: 2, // Reduced for tests
    defaultAgent: 'test-agent',
    coordinationStrategy: 'round_robin',
    healthCheckInterval: 5000 // 5 seconds for tests
  },
  nlpSettings: {
    primaryMethod: 'hybrid',
    fallbackMethod: 'pattern',
    minConfidence: 0.7,
    maxProcessingTime: 30 // 30ms for tests
  },
  timeouts: {
    taskExecution: 30000, // 30 seconds for tests
    taskDecomposition: 60000, // 1 minute for tests
    recursiveTaskDecomposition: 45000, // 45 seconds for tests
    taskRefinement: 20000, // 20 seconds for tests
    agentCommunication: 10000, // 10 seconds for tests
    llmRequest: 30000, // 30 seconds for tests
    fileOperations: 5000, // 5 seconds for tests
    databaseOperations: 5000, // 5 seconds for tests
    networkOperations: 10000 // 10 seconds for tests
  },
  retryPolicy: {
    maxRetries: 2, // Reduced for tests
    backoffMultiplier: 1.5,
    initialDelayMs: 500, // 500ms for tests
    maxDelayMs: 5000, // 5 seconds for tests
    enableExponentialBackoff: true
  },
  performance: {
    memoryManagement: {
      maxMemoryPercentage: 50, // 50% for tests
      gcThreshold: 70
    },
    caching: {
      maxCacheSize: 1024 * 1024 * 5, // 5MB for tests
      ttlMs: 30000 // 30 seconds for tests
    }
  }
};

/**
 * Initialize test services with proper configuration
 */
export function initializeTestServices(): void {
  try {
    // Initialize TimeoutManager with test configuration
    const timeoutManager = TimeoutManager.getInstance();
    timeoutManager.initialize(defaultTestConfig);

    logger.debug('Test services initialized successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize test services');
    throw error;
  }
}

/**
 * Reset test services to clean state
 */
export function resetTestServices(): void {
  try {
    // Reset TimeoutManager
    const timeoutManager = TimeoutManager.getInstance();
    (timeoutManager as Record<string, unknown>).config = null;

    logger.debug('Test services reset successfully');
  } catch (error) {
    logger.warn({ err: error }, 'Failed to reset test services');
  }
}

/**
 * Get test configuration
 */
export function getTestConfig(): VibeTaskManagerConfig['taskManager'] {
  return { ...defaultTestConfig };
}

// Initialize services on module load
initializeTestServices();

// Epic creation test utilities
export const epicTestUtils = {
  /**
   * Create test project for epic creation tests
   */
  createTestProject: (overrides: unknown = {}) => ({
    name: 'Test Project',
    description: 'Test project for epic creation',
    languages: ['typescript'],
    frameworks: ['node.js'],
    tools: ['jest'],
    codebaseSize: 'medium' as const,
    teamSize: 1,
    complexity: 'medium' as const,
    tags: ['test'],
    ...overrides,
  }),

  /**
   * Create test task for epic resolution
   */
  createTestTask: (overrides: unknown = {}) => ({
    title: 'Test Task',
    description: 'Test task for epic resolution',
    priority: 'medium' as const,
    type: 'development' as const,
    estimatedHours: 4,
    tags: ['test'],
    acceptanceCriteria: ['Task should work correctly'],
    ...overrides,
  }),

  /**
   * Functional area test cases
   */
  functionalAreaTestCases: [
    {
      area: 'auth',
      keywords: ['auth', 'login', 'register', 'authentication', 'user', 'password'],
      expectedEpicPattern: /auth/,
    },
    {
      area: 'video',
      keywords: ['video', 'stream', 'media', 'player', 'content'],
      expectedEpicPattern: /video/,
    },
    {
      area: 'api',
      keywords: ['api', 'endpoint', 'route', 'controller', 'service'],
      expectedEpicPattern: /api/,
    },
    {
      area: 'docs',
      keywords: ['doc', 'documentation', 'readme', 'guide'],
      expectedEpicPattern: /docs/,
    },
    {
      area: 'ui',
      keywords: ['ui', 'component', 'frontend', 'interface', 'view'],
      expectedEpicPattern: /ui/,
    },
    {
      area: 'database',
      keywords: ['database', 'db', 'model', 'schema', 'migration'],
      expectedEpicPattern: /database/,
    },
  ],

  /**
   * Generate test task with specific functional area
   */
  generateTaskForArea: (area: string, overrides: unknown = {}) => {
    const testCase = epicTestUtils.functionalAreaTestCases.find(tc => tc.area === area);
    if (!testCase) {
      throw new Error(`Unknown functional area: ${area}`);
    }

    const keyword = testCase.keywords[0];
    return epicTestUtils.createTestTask({
      title: `Create ${keyword} functionality`,
      description: `Implement ${keyword} related features`,
      tags: [keyword, 'test'],
      ...overrides,
    });
  },

  /**
   * Validate epic creation result
   */
  validateEpicCreation: (result: unknown, expectedArea?: string) => {
    if (!result) {
      throw new Error('Epic creation result is null or undefined');
    }

    if (!result.epicId) {
      throw new Error('Epic ID is missing from result');
    }

    if (result.epicId === 'default-epic') {
      throw new Error('Epic ID was not resolved from default-epic');
    }

    if (expectedArea && !result.epicId.includes(expectedArea)) {
      throw new Error(`Epic ID "${result.epicId}" does not contain expected area "${expectedArea}"`);
    }

    return true;
  },

  /**
   * Wait for async operations to complete
   */
  waitForCompletion: (ms: number = 100) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Clean up test data
   */
  cleanupTestData: async () => {
    try {
      // Reset test services
      resetTestServices();

      // Reset configuration manager for clean state
      OpenRouterConfigManager.resetInstance();

      // Clean up test files and directories
      const fs = await import('fs/promises');
      const testOutputDir = process.env.TEST_OUTPUT_DIR;

      if (testOutputDir) {
        try {
          await fs.rm(testOutputDir, { recursive: true, force: true });
          await fs.mkdir(testOutputDir, { recursive: true });
        } catch (error) {
          logger.warn({ err: error }, 'Failed to clean test output directory');
        }
      }

      logger.debug('Epic creation test data cleaned up successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to cleanup epic creation test data');
    }
  },

  /**
   * Setup test environment for a specific test
   */
  setupTestEnvironment: async () => {
    try {
      // Ensure test services are initialized
      initializeTestServices();

      // Create test directories
      const fs = await import('fs/promises');
      const testDataDir = process.env.TEST_DATA_DIR;
      const testOutputDir = process.env.TEST_OUTPUT_DIR;

      if (testDataDir) {
        await fs.mkdir(testDataDir, { recursive: true });
      }

      if (testOutputDir) {
        await fs.mkdir(testOutputDir, { recursive: true });
      }

      logger.debug('Test environment setup completed');
    } catch (error) {
      logger.error({ err: error }, 'Failed to setup test environment');
      throw error;
    }
  },

  /**
   * Teardown test environment after a test
   */
  teardownTestEnvironment: async () => {
    try {
      // Clean up any remaining resources
      await epicTestUtils.cleanupTestData();

      logger.debug('Test environment teardown completed');
    } catch (error) {
      logger.warn({ err: error }, 'Failed to teardown test environment');
    }
  },
};

console.log('Test environment setup complete');
console.log('Environment variables loaded:', {
  OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
  GEMINI_MODEL: !!process.env.GEMINI_MODEL,
  OPENROUTER_BASE_URL: !!process.env.OPENROUTER_BASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  EPIC_CREATION_TEST_MODE: process.env.EPIC_CREATION_TEST_MODE,
  EPIC_VALIDATION_TIMEOUT: process.env.EPIC_VALIDATION_TIMEOUT,
});

console.log('Epic creation test utilities loaded:', {
  functionalAreas: epicTestUtils.functionalAreaTestCases.length,
  testUtilities: Object.keys(epicTestUtils).length,
});

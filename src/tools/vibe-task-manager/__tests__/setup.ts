/**
 * Test setup file for Vibe Task Manager integration tests
 * Loads environment variables and sets up test environment
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve(process.cwd(), '.env') });

// Ensure required environment variables are available for tests
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

// Set test-specific environment variables ONLY if we're actually running tests
if (process.argv.includes('--test') || process.argv.includes('test') || process.env.VITEST === 'true') {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'info';
}

// Epic creation test configurations
process.env.EPIC_CREATION_TEST_MODE = 'true';
process.env.EPIC_VALIDATION_TIMEOUT = '5000'; // 5 seconds for tests
process.env.EPIC_CONTEXT_RESOLVER_CACHE_TTL = '1000'; // 1 second for tests

// Test data directories
process.env.TEST_DATA_DIR = resolve(process.cwd(), 'src/tools/vibe-task-manager/__tests__/data');
process.env.TEST_OUTPUT_DIR = resolve(process.cwd(), 'src/tools/vibe-task-manager/__tests__/output');

// Epic creation test utilities
export const epicTestUtils = {
  /**
   * Create test project for epic creation tests
   */
  createTestProject: (overrides: any = {}) => ({
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
  createTestTask: (overrides: any = {}) => ({
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
  generateTaskForArea: (area: string, overrides: any = {}) => {
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
  validateEpicCreation: (result: any, expectedArea?: string) => {
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
    // In a real implementation, this would clean up test databases, files, etc.
    // For now, we'll just log the cleanup
    console.log('Cleaning up epic creation test data...');
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

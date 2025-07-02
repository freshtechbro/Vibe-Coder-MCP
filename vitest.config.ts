// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  
  // Enhanced environment setup for CI/test environments
  if (process.env.CI === 'true' || mode === 'test' || process.env.NODE_ENV === 'test') {
    env.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY || 'ci-test-key-safe-vitest';
    env.OPENROUTER_BASE_URL = env.OPENROUTER_BASE_URL || 'https://test.openrouter.ai/api/v1';
    env.GEMINI_MODEL = env.GEMINI_MODEL || 'google/gemini-2.5-flash-preview-05-20';
    env.PERPLEXITY_MODEL = env.PERPLEXITY_MODEL || 'perplexity/llama-3.1-sonar-small-128k-online';
    env.CI_SAFE_MODE = 'true';
    env.NODE_ENV = 'test';
    env.FORCE_REAL_LLM_CONFIG = 'false';
  }

  return {
    test: {
      globals: true, // Optional: Use if you want Jest-like globals
      environment: 'node', // Specify Node environment
      env, // Pass environment variables to tests
      setupFiles: ['./src/tools/vibe-task-manager/__tests__/setup.ts'], // Load test setup
      include: [
        // Unit tests
        'src/**/__tests__/**/*.test.ts',
        'src/**/tests/**/*.test.ts', // Include tests/ directories as well

        // Integration tests
        'src/**/__integration__/**/*.test.ts',
        'src/**/integration/**/*.test.ts',
        'src/**/integrations/**/*.test.ts',

        // End-to-end tests
        'test/e2e/**/*.test.ts'
      ],
      exclude: ['node_modules', 'build'],
      coverage: {
        provider: 'v8', // Specify coverage provider
        reporter: ['text', 'json', 'html'], // Coverage report formats
        exclude: [
          'node_modules',
          'build',
          '**/__tests__/**',
          '**/__integration__/**',
          '**/tests/**',
          '**/integration/**',
          '**/integrations/**',
          'test/e2e/**',
          'src/testUtils/**',
          '**/*.d.ts'
        ],
      },
      // Differentiated timeout settings based on test type
      testTimeout: process.env.TEST_TYPE === 'unit' ? 5000 : 
                   process.env.TEST_TYPE === 'integration' ? 60000 : 15000,
      hookTimeout: 10000, // 10 seconds for setup/teardown hooks
      teardownTimeout: 5000, // 5 seconds for cleanup

      // Performance optimizations for speed
      isolate: false, // Disable isolation for faster execution
      pool: 'forks', // Use forks instead of threads for better cleanup
      poolOptions: {
        forks: {
          singleFork: true, // Use single fork for faster execution
          isolate: false // Disable isolation for speed
        }
      },

      // Enable concurrent execution for speed
      sequence: {
        concurrent: true, // Enable concurrent execution
        shuffle: false // Keep deterministic order
      },

      // Disable heavy logging for speed
      logHeapUsage: false,

      // Increase concurrency for speed
      maxConcurrency: 4, // Allow more concurrent tests
      fileParallelism: true, // Enable file parallelism for speed

      // Minimal reporter for speed
      reporter: process.env.CI ? ['json'] : ['default'],

      // Disable retries for speed
      retry: 0, // No retries for faster execution

      // No bail for complete test run
      bail: 0, // Run all tests

      // Disable typecheck for speed (run separately)
      typecheck: {
        enabled: false // Disable during test run for speed
      },

      // Disable global setup for speed
      // globalSetup: './src/tools/vibe-task-manager/__tests__/utils/global-setup.ts',

      // Watch mode configuration
      watch: false, // Disable watch mode by default for speed

      // Force exit to prevent hanging
      forceRerunTriggers: ['**/vitest.config.*'],

      // Cleanup configuration
      clearMocks: true,
      restoreMocks: true
    }
  };
});

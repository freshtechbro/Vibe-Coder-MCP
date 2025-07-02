// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  
  // Enhanced CI detection for performance optimization
  const isCI = process.env.CI === 'true' || mode === 'ci';
  const isCIOptimized = isCI || process.env.OPTIMIZE_FOR_CI === 'true';
  const isTest = mode === 'test' || process.env.NODE_ENV === 'test';
  
  // Enhanced environment setup for CI/test environments
  if (isCI || isTest) {
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
        enabled: !isCIOptimized, // Disable coverage in optimized CI mode
        provider: 'v8', // Specify coverage provider
        reporter: isCIOptimized ? ['text'] : ['text', 'json', 'html'], // Optimized for CI
        skipFull: isCIOptimized, // Skip full coverage in CI
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
      // Optimized timeout settings based on test type and CI environment
      testTimeout: process.env.TEST_TYPE === 'unit' ? (isCIOptimized ? 3000 : 5000) : 
                   process.env.TEST_TYPE === 'integration' ? (isCIOptimized ? 30000 : 60000) : 
                   (isCIOptimized ? 10000 : 15000),
      hookTimeout: isCIOptimized ? 5000 : 10000, // Reduced for CI
      teardownTimeout: isCIOptimized ? 2000 : 5000, // Reduced for CI

      // Performance optimizations - different strategies for CI vs local
      isolate: false, // Keep disabled for speed
      pool: isCIOptimized ? 'threads' : 'forks', // Threads faster for unit tests in CI
      poolOptions: {
        threads: {
          singleThread: false, // Enable parallel execution in CI
          isolate: false,
          maxThreads: isCIOptimized ? 8 : 4,
          minThreads: 2
        },
        forks: {
          singleFork: !isCIOptimized, // Single fork only for local development
          isolate: false,
          maxForks: isCIOptimized ? 6 : 4,
          minForks: isCIOptimized ? 2 : 1
        }
      },

      // Enhanced concurrent execution for CI
      sequence: {
        concurrent: true,
        shuffle: false,
        hooks: isCIOptimized ? 'parallel' : 'stack' // Parallel hooks in CI
      },

      // Optimized logging and reporting
      logHeapUsage: false,
      silent: isCIOptimized, // Suppress logs in CI for speed

      // Optimized concurrency based on environment
      maxConcurrency: isCIOptimized ? 12 : 4, // Higher concurrency in CI
      fileParallelism: true,

      // Optimized reporting
      reporter: isCIOptimized ? 
        [['basic', { summary: false }]] : 
        (process.env.CI ? ['json'] : ['default']),

      // Fail-fast optimizations for CI
      retry: 0, // No retries for faster execution
      bail: isCIOptimized ? 5 : 0, // Fail fast in CI after 5 failures

      // Disable expensive features in CI
      typecheck: {
        enabled: false // Always disabled for speed
      },

      // Watch mode and cleanup configuration
      watch: false,
      forceRerunTriggers: ['**/vitest.config.*'],
      clearMocks: true,
      restoreMocks: true
    }
  };
});

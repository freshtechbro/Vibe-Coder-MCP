// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');

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
        'src/__integration__/**/*.test.ts',

        // End-to-end tests
        'e2e/**/*.test.ts',
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
          'src/__integration__/**',
          'e2e/**',
          '**/*.d.ts'
        ],
      },
      // Optimized timeout settings for faster execution
      testTimeout: 15000, // 15 seconds timeout for tests (reduced from 45s)
      hookTimeout: 10000, // 10 seconds for setup/teardown hooks (reduced from 20s)
      teardownTimeout: 5000, // 5 seconds for cleanup (reduced from 10s)

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

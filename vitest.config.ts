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
      testTimeout: 30000, // Increase timeout for long-running tests
      // Group tests by type
      typecheck: {
        enabled: true,
        include: ['**/*.{test,spec}.ts']
      }
    }
  };
});

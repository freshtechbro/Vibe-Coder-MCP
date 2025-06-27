/**
 * Global test setup for Vibe Task Manager tests
 * Runs once before all tests start
 */

import { resolve } from 'path';
import { mkdir } from 'fs/promises';
import logger from '../../../../logger.js';
import { initializeTestServices, getTestConfig } from '../setup.js';
import { autoRegisterKnownSingletons } from './singleton-reset-manager.js';

export default async function globalSetup() {
  try {
    console.log('🚀 Starting global test setup...');

    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'warn'; // Reduce log noise during tests

    // Create test directories
    const testDataDir = resolve(process.cwd(), 'src/tools/vibe-task-manager/__tests__/data');
    const testOutputDir = resolve(process.cwd(), 'src/tools/vibe-task-manager/__tests__/output');

    await mkdir(testDataDir, { recursive: true });
    await mkdir(testOutputDir, { recursive: true });

    // Initialize test services
    initializeTestServices();

    // Auto-register known singletons for reset
    await autoRegisterKnownSingletons();

    // Log initial memory usage
    const initialMemory = process.memoryUsage();
    console.log(`📊 Initial memory usage: ${Math.round(initialMemory.heapUsed / 1024 / 1024)} MB`);

    // Set up global error handlers for tests
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled rejection in tests');
    });

    process.on('uncaughtException', (error) => {
      logger.error({ err: error }, 'Uncaught exception in tests');
    });

    // Configure EventEmitter defaults for tests
    const EventEmitter = require('events');
    EventEmitter.defaultMaxListeners = 20; // Increase default for tests

    console.log('✅ Global test setup completed');

    // Return a teardown function as required by vitest
    return async () => {
      console.log('🧹 Running global teardown from setup...');
      // This will be called by vitest at the end
    };
  } catch (error) {
    console.error('❌ Global test setup failed:', error);
    throw error;
  }
}

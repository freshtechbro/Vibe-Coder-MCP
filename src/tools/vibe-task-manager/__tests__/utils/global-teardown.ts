/**
 * Global test teardown for Vibe Task Manager tests
 * Runs once after all tests complete
 */

import { rm } from 'fs/promises';
import { resolve } from 'path';
import logger from '../../../../logger.js';
import { performTestCleanup, checkMemoryLeaks } from './test-cleanup.js';

export default async function globalTeardown() {
  try {
    console.log('🧹 Starting global test teardown...');
    
    // Perform comprehensive cleanup
    await performTestCleanup();
    
    // Check for memory leaks
    const memoryCheck = checkMemoryLeaks();
    if (memoryCheck.hasLeaks) {
      console.warn('⚠️ Potential memory leaks detected:');
      memoryCheck.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
    
    // Log final memory usage
    const finalMemory = process.memoryUsage();
    console.log(`📊 Final memory usage: ${Math.round(finalMemory.heapUsed / 1024 / 1024)} MB`);
    
    // Clean up test directories
    try {
      const testOutputDir = resolve(process.cwd(), 'src/tools/vibe-task-manager/__tests__/output');
      await rm(testOutputDir, { recursive: true, force: true });
      console.log('🗑️ Test output directory cleaned up');
    } catch (error) {
      console.warn('⚠️ Failed to clean up test output directory:', error);
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      const afterGcMemory = process.memoryUsage();
      console.log(`📊 Memory after GC: ${Math.round(afterGcMemory.heapUsed / 1024 / 1024)} MB`);
    }
    
    console.log('✅ Global test teardown completed');
  } catch (error) {
    console.error('❌ Global test teardown failed:', error);
    // Don't throw here to avoid masking test failures
  }
}

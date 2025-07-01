/**
 * Test script for measuring the performance of the code-map generator.
 * This script runs the code-map generator on a specified directory and measures:
 * - Total execution time
 * - Memory usage
 * - Number of files processed
 * - Time spent in each phase
 *
 * Usage:
 * ts-node test-performance.ts [directory] [--incremental] [--no-incremental] [--split-output] [--output-format=markdown|json]
 *
 * Example:
 * ts-node test-performance.ts ../../ --incremental
 */

import { performance } from 'perf_hooks';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { executeCodeMapGeneration } from './index.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { ToolExecutionContext } from '../../services/routing/toolRegistry.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const targetDir = args[0] || __dirname;
const options = {
  incremental: args.includes('--incremental'),
  noIncremental: args.includes('--no-incremental'),
  splitOutput: args.includes('--split-output'),
  outputFormat: args.find(arg => arg.startsWith('--output-format='))?.split('=')[1] || 'markdown'
};

// Create a mock context and job ID
const context: ToolExecutionContext = {
  sessionId: 'test-session',
  transportType: 'stdio'
};
const jobId = uuidv4();


// Create parameters object
const params = {
  ignored_files_patterns: [
    'node_modules',
    '.git',
    'dist',
    'build',
    'out',
    'coverage',
    'vendor'
  ],
  output_format: options.outputFormat
};

// Function to format memory size
function formatMemorySize(bytes: number): string {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
  else return (bytes / 1073741824).toFixed(2) + ' GB';
}

// Function to measure memory usage
function getMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  return {
    rss: formatMemorySize(memoryUsage.rss),
    heapTotal: formatMemorySize(memoryUsage.heapTotal),
    heapUsed: formatMemorySize(memoryUsage.heapUsed),
    external: formatMemorySize(memoryUsage.external),
    arrayBuffers: formatMemorySize(memoryUsage.arrayBuffers || 0)
  };
}

// Run the test
async function runTest() {
  console.log('=== Code-Map Generator Performance Test ===');
  console.log(`Target directory: ${path.resolve(targetDir)}`);
  console.log(`Incremental processing: ${options.incremental && !options.noIncremental ? 'enabled' : 'disabled'}`);
  console.log(`Split output: ${options.splitOutput ? 'enabled' : 'disabled'}`);
  console.log(`Output format: ${options.outputFormat}`);
  console.log('Initial memory usage:', getMemoryUsage());

  const startTime = performance.now();

  try {
    // Run the code-map generator
    const result = await executeCodeMapGeneration(params, {} as OpenRouterConfig, context, jobId);

    const endTime = performance.now();
    const executionTime = (endTime - startTime) / 1000; // Convert to seconds

    console.log('\n=== Results ===');
    console.log(`Total execution time: ${executionTime.toFixed(2)} seconds`);
    console.log('Final memory usage:', getMemoryUsage());

    // Check if the result contains an error
    if (result.isError) {
      console.error('Error:', result.content[0].text);
    } else {
      console.log('Success!');

      // Extract some statistics from the result
      const resultText = result.content[0].text as string;
      const fileCountMatch = resultText.match(/Processed (\d+) files/);
      if (fileCountMatch) {
        console.log(`Files processed: ${fileCountMatch[1]}`);
      }
    }
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

// Run the test
runTest().catch(console.error);

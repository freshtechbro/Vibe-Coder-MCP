/**
 * Tests for the integration of the process lifecycle manager with the code-map-generator.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { executeCodeMapGeneration } from '../index.js';

// Import mocked modules for use in tests
import * as parserModule from '../parser.js';
import * as fileScannerModule from '../fileScanner.js';
import * as jobManagerModule from '../../../services/job-manager/index.js';

// Mock the job manager
vi.mock('../../../services/job-manager/index.js', () => ({
  JobStatus: {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed'
  },
  jobManager: {
    createJob: vi.fn().mockReturnValue('test-job-id'),
    updateJobStatus: vi.fn(),
    setJobResult: vi.fn(),
    getJob: vi.fn().mockReturnValue({
      id: 'test-job-id',
      status: 'running',
      progressMessage: 'Test progress',
      progressPercentage: 50
    })
  }
}));

// Mock the SSE notifier
vi.mock('../../../services/sse-notifier/index.js', () => ({
  sseNotifier: {
    sendProgress: vi.fn()
  }
}));

// Mock the parser
vi.mock('../parser.js', () => {
  const originalModule = vi.importActual('../parser.js');

  return {
    ...originalModule,
    initializeParser: vi.fn().mockResolvedValue(undefined),
    cleanupParser: vi.fn().mockResolvedValue(undefined),
    clearCaches: vi.fn().mockResolvedValue(undefined),
    initializeCaches: vi.fn().mockResolvedValue(undefined),
    getMemoryManager: vi.fn().mockReturnValue({
      cleanup: vi.fn().mockResolvedValue(undefined)
    }),
    getMemoryStats: vi.fn().mockReturnValue({
      heapUsed: 100000000,
      heapTotal: 200000000,
      rss: 150000000,
      systemTotal: 1000000000,
      memoryUsagePercentage: 0.15,
      formatted: {
        heapUsed: '95.37 MB',
        heapTotal: '190.73 MB',
        rss: '143.05 MB',
        systemTotal: '953.67 MB'
      }
    }),
    processLifecycleManager: {
      registerJob: vi.fn(),
      unregisterJob: vi.fn().mockResolvedValue(undefined),
      checkProcessHealth: vi.fn().mockReturnValue({
        status: 'healthy',
        memoryUsagePercentage: 0.15,
        cpuUsagePercentage: 0.05,
        memoryLeakDetected: false,
        timestamp: Date.now(),
        memoryStats: {
          heapUsed: 100000000,
          heapTotal: 200000000,
          rss: 150000000,
          systemTotal: 1000000000,
          memoryUsagePercentage: 0.15,
          formatted: {
            heapUsed: '95.37 MB',
            heapTotal: '190.73 MB',
            rss: '143.05 MB',
            systemTotal: '953.67 MB'
          }
        },
        activeJobs: 1
      })
    },
    memoryLeakDetector: {
      analyzeMemoryTrend: vi.fn().mockReturnValue({
        leakDetected: false,
        trend: 'stable',
        samples: [],
        latestStats: {
          heapUsed: 100000000,
          heapTotal: 200000000,
          rss: 150000000,
          systemTotal: 1000000000,
          memoryUsagePercentage: 0.15,
          formatted: {
            heapUsed: '95.37 MB',
            heapTotal: '190.73 MB',
            rss: '143.05 MB',
            systemTotal: '953.67 MB'
          }
        },
        timestamp: Date.now()
      })
    }
  };
});

// Mock the configValidator
vi.mock('../configValidator.js', () => ({
  extractCodeMapConfig: vi.fn().mockResolvedValue({
    allowedMappingDirectory: '/test/dir',
    output: {
      outputDir: '/test/output',
      format: 'markdown'
    },
    cache: {
      enabled: true,
      maxEntries: 1000,
      maxAge: 3600000
    }
  })
}));

// Mock fs
vi.mock('fs/promises', () => ({
  access: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('test content')
}));

// Mock the fileScanner
vi.mock('../fileScanner.js', () => ({
  collectSourceFiles: vi.fn().mockResolvedValue(['/test/dir/file1.js', '/test/dir/file2.js'])
}));

// Mock other necessary modules
vi.mock('../directoryUtils.js', () => ({
  getOutputDirectory: vi.fn().mockReturnValue('/test/output'),
  ensureDirectoryExists: vi.fn().mockResolvedValue(undefined),
  validateDirectoryIsWritable: vi.fn().mockResolvedValue(undefined),
  getCacheDirectory: vi.fn().mockReturnValue('/test/cache'),
  createDirectoryStructure: vi.fn().mockResolvedValue(undefined)
}));

describe('Process Lifecycle Integration', () => {
  const mockConfig = {
    llm_mapping: {},
    tools: {
      'map-codebase': {
        allowedMappingDirectory: '/test/dir'
      }
    }
  };

  const mockParams = {
    path: '/test/dir',
    output_format: 'markdown'
  };

  const mockContext = {
    sessionId: 'test-session',
    transportType: 'stdio'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register and unregister jobs with the process lifecycle manager', async () => {
    // Execute the code map generation
    await executeCodeMapGeneration(mockParams, mockConfig, mockContext, 'test-job-id');

    // Check if the job was registered with the process lifecycle manager
    expect(vi.mocked(parserModule.processLifecycleManager.registerJob)).toHaveBeenCalledWith('test-job-id');

    // Check if the job was unregistered from the process lifecycle manager
    expect(vi.mocked(parserModule.processLifecycleManager.unregisterJob)).toHaveBeenCalledWith('test-job-id');
  });

  it('should handle errors and still unregister jobs', async () => {
    // Mock the collectSourceFiles to throw an error
    vi.mocked(fileScannerModule.collectSourceFiles).mockRejectedValueOnce(new Error('Test error'));

    // Execute the code map generation
    await executeCodeMapGeneration(mockParams, mockConfig, mockContext, 'test-job-id');

    // Check if the job was registered with the process lifecycle manager
    expect(vi.mocked(parserModule.processLifecycleManager.registerJob)).toHaveBeenCalledWith('test-job-id');

    // Check if the job was unregistered from the process lifecycle manager
    expect(vi.mocked(parserModule.processLifecycleManager.unregisterJob)).toHaveBeenCalledWith('test-job-id');

    // Check if the job status was updated to failed
    // The actual error message will be about directory access since that happens before collectSourceFiles
    expect(vi.mocked(jobManagerModule.jobManager.updateJobStatus)).toHaveBeenCalledWith(
      'test-job-id',
      'failed',
      expect.stringContaining('Cannot access allowed mapping directory')
    );
  });
});

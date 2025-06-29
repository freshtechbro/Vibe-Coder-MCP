import { vi } from 'vitest';
import { OpenRouterConfig } from '../../../../types/workflow.js';
import { ToolExecutionContext } from '../../../../services/routing/toolRegistry.js';

/**
 * Test utilities and setup for Vibe Task Manager tests
 */

/**
 * Create a mock OpenRouter configuration for testing
 */
export function createMockConfig(overrides?: Partial<OpenRouterConfig>): OpenRouterConfig {
  return {
    apiKey: 'test-api-key',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-r1-0528-qwen3-8b:free',
    llm_mapping: {
      'task_decomposition': 'deepseek/deepseek-r1-0528-qwen3-8b:free',
      'atomic_detection': 'deepseek/deepseek-r1-0528-qwen3-8b:free',
      'intent_recognition': 'deepseek/deepseek-r1-0528-qwen3-8b:free',
      'default_generation': 'deepseek/deepseek-r1-0528-qwen3-8b:free'
    },
    ...overrides
  };
}

/**
 * Create a mock execution context for testing
 */
export function createMockContext(overrides?: Partial<ToolExecutionContext>): ToolExecutionContext {
  return {
    sessionId: 'test-session-' + Math.random().toString(36).substr(2, 9),
    transportType: 'stdio',
    ...overrides
  };
}

/**
 * Mock logger for testing
 */
export const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  trace: vi.fn()
};

/**
 * Setup common mocks for tests
 */
export function setupCommonMocks() {
  // Mock logger
  vi.mock('../../../../logger.js', () => ({
    default: mockLogger
  }));

  // Mock file system operations
  vi.mock('fs-extra', () => ({
    default: {
      pathExists: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      ensureDir: vi.fn(),
      stat: vi.fn(),
      remove: vi.fn()
    }
  }));

  // Mock YAML parser
  vi.mock('js-yaml', () => ({
    default: {
      load: vi.fn(),
      dump: vi.fn()
    }
  }));
}

/**
 * Clean up mocks after tests
 */
export function cleanupMocks() {
  vi.clearAllMocks();
  vi.restoreAllMocks();
}

/**
 * Create test data for various entities
 */
export const testData = {
  project: {
    id: 'PID-TEST-001',
    name: 'Test Project',
    description: 'A test project for unit testing',
    status: 'pending' as const,
    config: {
      maxConcurrentTasks: 5,
      defaultTaskTemplate: 'development',
      agentConfig: {
        maxAgents: 3,
        defaultAgent: 'test-agent',
        agentCapabilities: {
          'test-agent': ['code_generation', 'testing']
        }
      },
      performanceTargets: {
        maxResponseTime: 500,
        maxMemoryUsage: 512,
        minTestCoverage: 90
      },
      integrationSettings: {
        codeMapEnabled: true,
        researchEnabled: true,
        notificationsEnabled: true
      },
      fileSystemSettings: {
        cacheSize: 100,
        cacheTTL: 3600,
        backupEnabled: true
      }
    },
    epicIds: ['E001', 'E002'],
    rootPath: '/test/project',
    techStack: {
      languages: ['TypeScript', 'JavaScript'],
      frameworks: ['Node.js', 'Express'],
      tools: ['Vitest', 'ESLint']
    },
    metadata: {
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
      createdBy: 'test-user',
      tags: ['test', 'development'],
      version: '1.0.0'
    }
  },

  epic: {
    id: 'E001',
    title: 'Test Epic',
    description: 'A test epic for unit testing',
    status: 'pending' as const,
    priority: 'high' as const,
    projectId: 'PID-TEST-001',
    estimatedHours: 40,
    taskIds: ['T0001', 'T0002'],
    dependencies: [],
    dependents: [],
    metadata: {
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
      createdBy: 'test-user',
      tags: ['test']
    }
  },

  task: {
    id: 'T0001',
    title: 'Test Task',
    description: 'A test task for unit testing',
    status: 'pending' as const,
    priority: 'medium' as const,
    type: 'development' as const,
    estimatedHours: 4,
    epicId: 'E001',
    projectId: 'PID-TEST-001',
    dependencies: [],
    dependents: [],
    filePaths: ['src/test.ts'],
    acceptanceCriteria: [
      'Task should be implemented correctly',
      'All tests should pass'
    ],
    testingRequirements: {
      unitTests: ['test.test.ts'],
      integrationTests: [],
      performanceTests: [],
      coverageTarget: 95
    },
    performanceCriteria: {
      responseTime: '<100ms',
      memoryUsage: '<50MB'
    },
    qualityCriteria: {
      codeQuality: ['TypeScript strict mode', 'ESLint compliance'],
      documentation: ['JSDoc comments'],
      typeScript: true,
      eslint: true
    },
    integrationCriteria: {
      compatibility: ['Existing MCP patterns'],
      patterns: ['Tool registration pattern']
    },
    validationMethods: {
      automated: ['Unit tests', 'Integration tests'],
      manual: ['Code review']
    },
    metadata: {
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
      createdBy: 'test-user',
      tags: ['test', 'development']
    }
  },

  dependency: {
    id: 'DEP-001',
    fromTaskId: 'T0002',
    toTaskId: 'T0001',
    type: 'blocks' as const,
    description: 'Task T0002 depends on T0001 completion',
    critical: true,
    metadata: {
      createdAt: new Date('2025-01-01T00:00:00Z'),
      createdBy: 'test-user',
      reason: 'Sequential dependency'
    }
  },

  agent: {
    id: 'agent-001',
    name: 'Test Agent',
    description: 'A test agent for unit testing',
    status: 'idle' as const,
    capabilities: ['code_generation', 'testing'] as const,
    taskQueue: [],
    performance: {
      tasksCompleted: 10,
      averageCompletionTime: 3600,
      successRate: 0.95,
      lastActiveAt: new Date('2025-01-01T00:00:00Z')
    },
    config: {
      maxConcurrentTasks: 2,
      preferredTaskTypes: ['development', 'testing']
    },
    communication: {
      protocol: 'sentinel' as const,
      timeout: 30000
    },
    metadata: {
      createdAt: new Date('2025-01-01T00:00:00Z'),
      lastUpdatedAt: new Date('2025-01-01T00:00:00Z'),
      version: '1.0.0',
      tags: ['test']
    }
  }
};

/**
 * Performance testing utilities
 */
export class PerformanceTestUtils {
  /**
   * Measure execution time of a function
   */
  static async measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const startTime = Date.now();
    const result = await fn();
    const endTime = Date.now();
    return {
      result,
      duration: endTime - startTime
    };
  }

  /**
   * Measure memory usage during function execution
   */
  static async measureMemoryUsage<T>(fn: () => Promise<T>): Promise<{ result: T; memoryUsed: number }> {
    const initialMemory = process.memoryUsage().heapUsed;
    const result = await fn();
    const finalMemory = process.memoryUsage().heapUsed;
    return {
      result,
      memoryUsed: finalMemory - initialMemory
    };
  }

  /**
   * Assert that execution time is within acceptable limits
   */
  static assertExecutionTime(duration: number, maxDuration: number, operation: string) {
    if (duration > maxDuration) {
      throw new Error(`${operation} took ${duration}ms, which exceeds the maximum allowed ${maxDuration}ms`);
    }
  }

  /**
   * Assert that memory usage is within acceptable limits
   */
  static assertMemoryUsage(memoryUsed: number, maxMemory: number, operation: string) {
    if (memoryUsed > maxMemory) {
      throw new Error(`${operation} used ${memoryUsed} bytes, which exceeds the maximum allowed ${maxMemory} bytes`);
    }
  }
}

/**
 * File system test utilities
 */
export class FileSystemTestUtils {
  /**
   * Create a temporary test directory
   */
  static createTempDir(): string {
    return `/tmp/vibe-task-manager-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create test file paths
   */
  static createTestFilePaths(baseDir: string) {
    return {
      projectConfig: `${baseDir}/project.yaml`,
      taskData: `${baseDir}/tasks.json`,
      dependencyGraph: `${baseDir}/dependencies.json`,
      agentConfig: `${baseDir}/agents.yaml`
    };
  }

  /**
   * Mock file system operations for testing
   */
  static mockFileSystemOperations() {
    const mockFs = {
      pathExists: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      ensureDir: vi.fn(),
      stat: vi.fn(),
      remove: vi.fn()
    };

    return mockFs;
  }
}

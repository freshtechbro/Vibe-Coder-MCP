/**
 * Service Test Helper
 *
 * Utilities for managing service lifecycle in tests to prevent
 * repeated initialization/disposal cycles and resource conflicts.
 */

import { vi } from 'vitest';
import { ServiceLifecycleManager } from '../../services/service-lifecycle-manager.js';
import { ExecutionCoordinator } from '../../services/execution-coordinator.js';
import { TaskScheduler } from '../../services/task-scheduler.js';
import logger from '../../../../logger.js';
import axios from 'axios';

// Mock axios at module level to avoid hoisting issues
vi.mock('axios', () => ({
  default: {
    post: vi.fn()
  },
  post: vi.fn()
}));

// Mock fs-extra at module level for proper hoisting
vi.mock('fs-extra', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    // Directory operations
    ensureDir: vi.fn().mockResolvedValue(undefined),
    ensureDirSync: vi.fn().mockReturnValue(undefined),
    emptyDir: vi.fn().mockResolvedValue(undefined),
    emptyDirSync: vi.fn().mockReturnValue(undefined),
    mkdirp: vi.fn().mockResolvedValue(undefined),
    mkdirpSync: vi.fn().mockReturnValue(undefined),

    // File existence and stats
    pathExists: vi.fn().mockResolvedValue(true),
    pathExistsSync: vi.fn().mockReturnValue(true),
    stat: vi.fn().mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
      size: 1024,
      mtime: new Date(),
      ctime: new Date(),
      atime: new Date()
    }),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => false, isFile: () => true }),
    lstat: vi.fn().mockResolvedValue({ isDirectory: () => false, isFile: () => true }),
    lstatSync: vi.fn().mockReturnValue({ isDirectory: () => false, isFile: () => true }),
    access: vi.fn().mockResolvedValue(undefined),
    accessSync: vi.fn().mockReturnValue(undefined),

    // File I/O operations
    readFile: vi.fn().mockResolvedValue('{}'),
    readFileSync: vi.fn().mockReturnValue('{}'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    writeFileSync: vi.fn().mockReturnValue(undefined),
    outputFile: vi.fn().mockResolvedValue(undefined),
    outputFileSync: vi.fn().mockReturnValue(undefined),

    // JSON operations
    readJson: vi.fn().mockResolvedValue({}),
    readJsonSync: vi.fn().mockReturnValue({}),
    writeJson: vi.fn().mockResolvedValue(undefined),
    writeJsonSync: vi.fn().mockReturnValue(undefined),
    outputJson: vi.fn().mockResolvedValue(undefined),
    outputJsonSync: vi.fn().mockReturnValue(undefined),

    // File manipulation
    rename: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    removeSync: vi.fn().mockReturnValue(undefined),
    copy: vi.fn().mockResolvedValue(undefined),
    copySync: vi.fn().mockReturnValue(undefined),
    move: vi.fn().mockResolvedValue(undefined),
    moveSync: vi.fn().mockReturnValue(undefined)
  };
});

export interface TestServiceConfig {
  useLifecycleManager?: boolean;
  enableTransportServices?: boolean;
  enableAgentOrchestrator?: boolean;
  coordinatorConfig?: any;
  schedulerConfig?: any;
}

/**
 * Test service helper for coordinated service management
 */
export class ServiceTestHelper {
  private lifecycleManager: ServiceLifecycleManager | null = null;
  private coordinator: ExecutionCoordinator | null = null;
  private scheduler: TaskScheduler | null = null;
  private config: TestServiceConfig;

  constructor(config: TestServiceConfig = {}) {
    this.config = {
      useLifecycleManager: true,
      enableTransportServices: false,
      enableAgentOrchestrator: false,
      ...config
    };
  }

  /**
   * Setup services for testing
   */
  async setupServices(): Promise<{
    coordinator: ExecutionCoordinator;
    scheduler: TaskScheduler;
    lifecycleManager?: ServiceLifecycleManager;
  }> {
    try {
      if (this.config.useLifecycleManager) {
        this.lifecycleManager = ServiceLifecycleManager.getInstance();
      }

      // Create scheduler
      this.scheduler = new TaskScheduler({
        enableDynamicOptimization: false,
        ...this.config.schedulerConfig
      });

      // Create coordinator
      this.coordinator = new ExecutionCoordinator(this.scheduler, {
        enableAutoRecovery: false,
        maxConcurrentBatches: 2,
        taskTimeoutMinutes: 5,
        ...this.config.coordinatorConfig
      });

      // Register with lifecycle manager if enabled
      if (this.lifecycleManager) {
        this.lifecycleManager.registerService({
          name: 'task-scheduler',
          instance: this.scheduler,
          disposeMethod: 'dispose',
          resetStaticMethod: 'resetCurrentInstance'
        });

        this.lifecycleManager.registerService({
          name: 'execution-coordinator',
          instance: this.coordinator,
          startMethod: 'start',
          stopMethod: 'stop',
          disposeMethod: 'dispose',
          resetStaticMethod: 'resetInstance'
        });

        // Register dependencies
        this.lifecycleManager.registerDependency('execution-coordinator', ['task-scheduler']);

        // Setup transport services if enabled
        if (this.config.enableTransportServices) {
          await this.setupTransportServices();
        }

        // Setup agent orchestrator if enabled
        if (this.config.enableAgentOrchestrator) {
          await this.setupAgentOrchestrator();
        }
      }

      return {
        coordinator: this.coordinator,
        scheduler: this.scheduler,
        lifecycleManager: this.lifecycleManager || undefined
      };
    } catch (error) {
      logger.error('Failed to setup test services', { error });
      throw error;
    }
  }

  /**
   * Setup transport services
   */
  private async setupTransportServices(): Promise<void> {
    if (!this.lifecycleManager) return;

    try {
      const { TransportManager } = await import('../../../services/transport-manager/index.js');
      const transportManager = TransportManager.getInstance();

      this.lifecycleManager.registerService({
        name: 'transport-manager',
        instance: transportManager,
        startMethod: 'startAll',
        stopMethod: 'stopAll',
        disposeMethod: 'dispose'
      });

      // Transport manager should start before other services
      this.lifecycleManager.registerDependency('execution-coordinator', ['transport-manager']);
    } catch (error) {
      logger.warn('Failed to setup transport services', { error });
    }
  }

  /**
   * Setup agent orchestrator
   */
  private async setupAgentOrchestrator(): Promise<void> {
    if (!this.lifecycleManager) return;

    try {
      const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();

      this.lifecycleManager.registerService({
        name: 'agent-orchestrator',
        instance: orchestrator,
        startMethod: 'start',
        stopMethod: 'stop',
        disposeMethod: 'dispose'
      });

      // Agent orchestrator depends on transport manager
      if (this.config.enableTransportServices) {
        this.lifecycleManager.registerDependency('agent-orchestrator', ['transport-manager']);
      }
    } catch (error) {
      logger.warn('Failed to setup agent orchestrator', { error });
    }
  }

  /**
   * Start all services
   */
  async startServices(): Promise<void> {
    if (this.lifecycleManager) {
      await this.lifecycleManager.startAllServices();
    } else if (this.coordinator) {
      await this.coordinator.start();
    }
  }

  /**
   * Stop all services
   */
  async stopServices(): Promise<void> {
    if (this.lifecycleManager) {
      await this.lifecycleManager.stopAllServices();
    } else if (this.coordinator) {
      await this.coordinator.stop();
    }
  }

  /**
   * Cleanup all services
   */
  async cleanup(): Promise<void> {
    try {
      if (this.lifecycleManager) {
        await this.lifecycleManager.disposeAllServices();
        ServiceLifecycleManager.resetInstance();
        this.lifecycleManager = null;
      } else {
        // Manual cleanup
        if (this.coordinator) {
          await this.coordinator.dispose();
          this.coordinator = null;
        }
        if (this.scheduler) {
          this.scheduler.dispose();
          this.scheduler = null;
        }
      }

      // Reset singleton instances
      ExecutionCoordinator.resetInstance();
      TaskScheduler.resetCurrentInstance();

      // Reset ConcurrentAccessManager
      try {
        const { ConcurrentAccessManager } = await import('../../security/concurrent-access.js');
        if (ConcurrentAccessManager.hasInstance()) {
          await ConcurrentAccessManager.getInstance().clearAllLocks();
          ConcurrentAccessManager.resetInstance();
        }
      } catch (error) {
        // Ignore errors during cleanup
      }

      // Reset AgentOrchestrator if it exists
      try {
        const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');
        if ((AgentOrchestrator as any).instance) {
          const orchestrator = (AgentOrchestrator as any).instance;
          if (orchestrator.communicationChannel) {
            try {
              await orchestrator.communicationChannel.cleanup();
            } catch (error) {
              // Ignore cleanup errors
            }
          }
          (AgentOrchestrator as any).instance = null;
        }
      } catch (error) {
        // Ignore errors during cleanup
      }

    } catch (error) {
      logger.warn('Error during service cleanup', { error });
    }
  }

  /**
   * Get service status
   */
  getServiceStatus(): any {
    if (this.lifecycleManager) {
      return this.lifecycleManager.getAllServiceStatuses();
    }
    return {
      coordinator: this.coordinator ? 'active' : 'inactive',
      scheduler: this.scheduler ? 'active' : 'inactive'
    };
  }

  /**
   * Check if services are healthy
   */
  areServicesHealthy(): boolean {
    if (this.lifecycleManager) {
      return this.lifecycleManager.areAllServicesHealthy();
    }
    return !!(this.coordinator && this.scheduler);
  }
}

/**
 * Global test helper for easy access
 */
export const createTestServices = (config?: TestServiceConfig) => {
  return new ServiceTestHelper(config);
};

/**
 * Standard disposable interface for consistent resource management
 */
export interface IDisposable {
  dispose(): void | Promise<void>;
}

/**
 * Enhanced disposable interface with additional cleanup methods
 */
export interface IEnhancedDisposable extends IDisposable {
  cleanup?(): void | Promise<void>;
  destroy?(): void | Promise<void>;
  close?(): void | Promise<void>;
}

/**
 * Disposable resource manager for standardized cleanup patterns
 */
export class DisposableResourceManager {
  private static disposables = new Set<IEnhancedDisposable>();
  private static cleanupFunctions = new Set<() => void | Promise<void>>();

  /**
   * Register a disposable resource
   */
  static register(disposable: IEnhancedDisposable): void {
    this.disposables.add(disposable);
  }

  /**
   * Register a cleanup function
   */
  static registerCleanup(cleanup: () => void | Promise<void>): void {
    this.cleanupFunctions.add(cleanup);
  }

  /**
   * Dispose all registered resources
   */
  static async disposeAll(): Promise<void> {
    // Dispose registered disposables
    for (const disposable of this.disposables) {
      try {
        if (disposable.dispose) {
          await disposable.dispose();
        } else if (disposable.cleanup) {
          await disposable.cleanup();
        } else if (disposable.destroy) {
          await disposable.destroy();
        } else if (disposable.close) {
          await disposable.close();
        }
      } catch (error) {
        logger.warn('Error disposing resource', { error });
      }
    }

    // Execute cleanup functions
    for (const cleanup of this.cleanupFunctions) {
      try {
        await cleanup();
      } catch (error) {
        logger.warn('Error executing cleanup function', { error });
      }
    }

    // Clear registries
    this.disposables.clear();
    this.cleanupFunctions.clear();
  }

  /**
   * Clear all registries without disposing (for testing)
   */
  static clear(): void {
    this.disposables.clear();
    this.cleanupFunctions.clear();
  }
}

/**
 * Universal Mock Isolation Manager for all service types
 * Extends successful patterns to work with storage, file system, and import resolvers
 */
export class UniversalMockIsolationManager {
  private static originalChannels = new Map<string, any>();
  private static mockChannels = new Map<string, any>();
  private static testId: string | null = null;
  private static mockRegistry = new Map<string, any>();
  private static disposableRegistry = new Set<() => void>();

  /**
   * Setup comprehensive mock environment for all service types
   */
  static async setupUniversalMock(testId: string, options: {
    mockBehavior?: 'success' | 'failure' | 'custom';
    customMock?: any;
    enableFileSystemMocks?: boolean;
    enableStorageMocks?: boolean;
    enableImportResolverMocks?: boolean;
    enableLLMMocks?: boolean;
  } = {}): Promise<() => void> {
    this.testId = testId;

    const {
      mockBehavior = 'success',
      customMock,
      enableFileSystemMocks = true,
      enableStorageMocks = true,
      enableImportResolverMocks = true,
      enableLLMMocks = true
    } = options;

    // Setup file system mocks
    if (enableFileSystemMocks) {
      this.setupFileSystemMocks();
    }

    // Setup storage mocks
    if (enableStorageMocks) {
      this.setupStorageMocks();
    }

    // Setup import resolver mocks
    if (enableImportResolverMocks) {
      this.setupImportResolverMocks();
    }

    // Setup LLM mocks
    if (enableLLMMocks) {
      this.setupLLMMocks();
    }

    // Setup agent orchestrator mocks (existing functionality)
    return this.setupAgentOrchestratorMock(testId, mockBehavior, customMock);
  }

  /**
   * Setup isolated mock for a test (legacy method for backward compatibility)
   */
  static async setupIsolatedMock(testId: string, mockBehavior: 'success' | 'failure' | 'custom', customMock?: any): Promise<() => void> {
    return this.setupUniversalMock(testId, { mockBehavior, customMock });
  }

  /**
   * Setup agent orchestrator mock (extracted from original method)
   */
  private static async setupAgentOrchestratorMock(testId: string, mockBehavior: 'success' | 'failure' | 'custom', customMock?: any): Promise<() => void> {
    this.testId = testId;

    try {
      const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();

      // Store original channel if not already stored
      if (!this.originalChannels.has(testId)) {
        this.originalChannels.set(testId, (orchestrator as any).communicationChannel);
      }

      // Create isolated mock channel
      const originalChannel = this.originalChannels.get(testId);
      let mockChannel;

      if (mockBehavior === 'custom' && customMock) {
        mockChannel = customMock;
      } else {
        mockChannel = this.createStandardMockChannel(originalChannel, mockBehavior);
      }

      // Store mock channel
      this.mockChannels.set(testId, mockChannel);

      // Apply mock
      (orchestrator as any).communicationChannel = mockChannel;

      // Return cleanup function
      return () => this.cleanupIsolatedMock(testId);

    } catch (error) {
      logger.warn(`Failed to setup isolated mock for test ${testId}`, { error });
      return () => {}; // No-op cleanup
    }
  }

  /**
   * Create standard mock channel based on behavior
   */
  private static createStandardMockChannel(originalChannel: any, behavior: 'success' | 'failure') {
    const mockChannel = {
      ...originalChannel,
      sendTask: vi.fn(),
      receiveResponse: vi.fn(),
      initialize: vi.fn().mockResolvedValue(true),
      cleanup: vi.fn().mockResolvedValue(true)
    };

    if (behavior === 'success') {
      mockChannel.sendTask.mockResolvedValue(true);
      mockChannel.receiveResponse.mockResolvedValue(JSON.stringify({
        status: 'DONE',
        message: 'Task completed successfully',
        progress_percentage: 100,
        timestamp: Date.now()
      }));
    } else if (behavior === 'failure') {
      mockChannel.sendTask.mockImplementation(async () => {
        throw new Error('Agent not found - cannot send task');
      });
      mockChannel.receiveResponse.mockResolvedValue(JSON.stringify({
        status: 'ERROR',
        message: 'Task execution failed',
        error: 'Agent not found - cannot send task',
        timestamp: Date.now()
      }));
    }

    return mockChannel;
  }

  /**
   * Cleanup isolated mock for a test
   */
  static async cleanupIsolatedMock(testId: string): Promise<void> {
    try {
      const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();

      // Restore original channel
      const originalChannel = this.originalChannels.get(testId);
      if (originalChannel) {
        (orchestrator as any).communicationChannel = originalChannel;
      }

      // Clear mock channel
      const mockChannel = this.mockChannels.get(testId);
      if (mockChannel) {
        // Clear all mock functions
        Object.values(mockChannel).forEach(value => {
          if (typeof value === 'function' && 'mockClear' in value) {
            (value as any).mockClear();
          }
        });
        this.mockChannels.delete(testId);
      }

      // Clear original channel reference
      this.originalChannels.delete(testId);

    } catch (error) {
      logger.warn(`Failed to cleanup isolated mock for test ${testId}`, { error });
    }
  }

  /**
   * Cleanup all mocks
   */
  static async cleanupAllMocks(): Promise<void> {
    const testIds = Array.from(this.originalChannels.keys());
    for (const testId of testIds) {
      await this.cleanupIsolatedMock(testId);
    }
    this.testId = null;
  }

  /**
   * Reset AgentOrchestrator singleton completely
   */
  static async resetAgentOrchestrator(): Promise<void> {
    try {
      const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');

      // Get current instance if it exists
      let instance: any = null;
      try {
        if ((AgentOrchestrator as any).instance) {
          instance = (AgentOrchestrator as any).instance;
        }
      } catch (error) {
        // Instance might not exist
      }

      // Call cleanup if available
      if (instance && typeof instance.cleanup === 'function') {
        await instance.cleanup();
      }

      // Clear communication channel
      if (instance && instance.communicationChannel) {
        try {
          await instance.communicationChannel.cleanup();
        } catch (error) {
          // Ignore cleanup errors
        }
      }

      // Reset static properties
      (AgentOrchestrator as any).instance = null;
      (AgentOrchestrator as any).isInitializing = false;

      logger.debug('AgentOrchestrator singleton reset complete');
    } catch (error) {
      logger.warn('Failed to reset AgentOrchestrator singleton', { error });
    }
  }

  /**
   * Setup comprehensive file system mocks
   */
  private static setupFileSystemMocks(): void {
    // Setup comprehensive fs-extra mock with all required methods
    vi.mock('fs-extra', async (importOriginal) => {
      const actual = await importOriginal() as any;
      return {
        ...actual,
        // Directory operations
        ensureDir: vi.fn().mockResolvedValue(undefined),
        ensureDirSync: vi.fn().mockReturnValue(undefined),
        emptyDir: vi.fn().mockResolvedValue(undefined),
        emptyDirSync: vi.fn().mockReturnValue(undefined),
        mkdirp: vi.fn().mockResolvedValue(undefined),
        mkdirpSync: vi.fn().mockReturnValue(undefined),

        // File operations
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
        readFileSync: vi.fn().mockReturnValue('{}'),
        writeFileSync: vi.fn().mockReturnValue(undefined),
        readJson: vi.fn().mockResolvedValue({}),
        writeJson: vi.fn().mockResolvedValue(undefined),
        readJsonSync: vi.fn().mockReturnValue({}),
        writeJsonSync: vi.fn().mockReturnValue(undefined),

        // Path operations
        pathExists: vi.fn().mockResolvedValue(true),
        pathExistsSync: vi.fn().mockReturnValue(true),
        access: vi.fn().mockResolvedValue(undefined),

        // Copy/move operations
        copy: vi.fn().mockResolvedValue(undefined),
        copySync: vi.fn().mockReturnValue(undefined),
        move: vi.fn().mockResolvedValue(undefined),
        moveSync: vi.fn().mockReturnValue(undefined),

        // Remove operations
        remove: vi.fn().mockResolvedValue(undefined),
        removeSync: vi.fn().mockReturnValue(undefined),

        // Other operations
        stat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false }),
        statSync: vi.fn().mockReturnValue({ isFile: () => true, isDirectory: () => false }),
        lstat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false }),
        lstatSync: vi.fn().mockReturnValue({ isFile: () => true, isDirectory: () => false }),

        // Additional fs-extra specific methods
        outputFile: vi.fn().mockResolvedValue(undefined),
        outputFileSync: vi.fn().mockReturnValue(undefined),
        outputJson: vi.fn().mockResolvedValue(undefined),
        outputJsonSync: vi.fn().mockReturnValue(undefined),
        createFile: vi.fn().mockResolvedValue(undefined),
        createFileSync: vi.fn().mockReturnValue(undefined),
        createReadStream: vi.fn().mockReturnValue({
          on: vi.fn(),
          pipe: vi.fn(),
          close: vi.fn()
        }),
        createWriteStream: vi.fn().mockReturnValue({
          write: vi.fn(),
          end: vi.fn(),
          on: vi.fn()
        })
      };
    });

    // Mock standard fs module
    vi.mock('fs', () => ({
      promises: {
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        stat: vi.fn().mockResolvedValue({ isDirectory: () => false, isFile: () => true }),
        access: vi.fn().mockResolvedValue(undefined),
        appendFile: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue([])
      },
      constants: {
        R_OK: 4,
        W_OK: 2,
        F_OK: 0
      },
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue('{}'),
      writeFileSync: vi.fn().mockReturnValue(undefined),
      statSync: vi.fn().mockReturnValue({ isDirectory: () => false, isFile: () => true }),
      unlinkSync: vi.fn().mockReturnValue(undefined)
    }));
  }

  /**
   * Setup storage layer mocks (FileUtils, etc.)
   */
  private static setupStorageMocks(): void {
    // Mock FileUtils with comprehensive methods
    vi.mock('../../../utils/file-utils.js', () => ({
      FileUtils: {
        ensureDirectory: vi.fn().mockResolvedValue({ success: true }),
        fileExists: vi.fn().mockResolvedValue(true),
        readFile: vi.fn().mockResolvedValue({ success: true, data: '{}' }),
        writeFile: vi.fn().mockResolvedValue({ success: true }),
        readJsonFile: vi.fn().mockResolvedValue({ success: true, data: {} }),
        writeJsonFile: vi.fn().mockResolvedValue({ success: true }),
        readYamlFile: vi.fn().mockResolvedValue({ success: true, data: {} }),
        writeYamlFile: vi.fn().mockResolvedValue({ success: true }),
        deleteFile: vi.fn().mockResolvedValue({ success: true }),
        validateFilePath: vi.fn().mockReturnValue({ valid: true }),
        copyFile: vi.fn().mockResolvedValue({ success: true }),
        moveFile: vi.fn().mockResolvedValue({ success: true }),
        getFileStats: vi.fn().mockResolvedValue({
          success: true,
          data: { size: 1024, mtime: new Date(), isDirectory: false, isFile: true }
        }),
        createDirectory: vi.fn().mockResolvedValue({ success: true }),
        listDirectory: vi.fn().mockResolvedValue({ success: true, data: [] }),
        watchFile: vi.fn().mockReturnValue({ unwatch: vi.fn() })
      }
    }));

    // Mock YAML parser
    vi.mock('js-yaml', () => ({
      default: {
        load: vi.fn().mockReturnValue({}),
        dump: vi.fn().mockReturnValue('{}')
      },
      load: vi.fn().mockReturnValue({}),
      dump: vi.fn().mockReturnValue('{}')
    }));
  }

  /**
   * Setup import resolver mocks with proper disposable patterns
   */
  private static setupImportResolverMocks(): void {
    // Mock ImportResolverFactory
    vi.mock('../../importResolvers/importResolverFactory.js', () => ({
      ImportResolverFactory: vi.fn().mockImplementation((options) => ({
        getImportResolver: vi.fn().mockReturnValue({
          analyzeImports: vi.fn().mockResolvedValue([]),
          dispose: vi.fn()
        }),
        dispose: vi.fn()
      }))
    }));

    // Mock individual resolvers
    vi.mock('../../importResolvers/dependencyCruiserAdapter.js', () => ({
      DependencyCruiserAdapter: vi.fn().mockImplementation(() => ({
        analyzeImports: vi.fn().mockResolvedValue([]),
        dispose: vi.fn()
      }))
    }));

    vi.mock('../../importResolvers/extendedPythonImportResolver.js', () => ({
      ExtendedPythonImportResolver: vi.fn().mockImplementation(() => ({
        analyzeImports: vi.fn().mockResolvedValue([]),
        dispose: vi.fn()
      }))
    }));

    vi.mock('../../importResolvers/clangdAdapter.js', () => ({
      ClangdAdapter: vi.fn().mockImplementation(() => ({
        analyzeImports: vi.fn().mockResolvedValue([]),
        dispose: vi.fn()
      }))
    }));

    vi.mock('../../importResolvers/semgrepAdapter.js', () => ({
      SemgrepAdapter: vi.fn().mockImplementation(() => ({
        analyzeImports: vi.fn().mockResolvedValue([]),
        dispose: vi.fn()
      }))
    }));

    // Mock child_process for external tool calls
    vi.mock('child_process', () => ({
      exec: vi.fn((cmd, options, callback) => {
        if (typeof options === 'function') {
          callback = options;
          options = {};
        }
        setTimeout(() => {
          callback(null, { stdout: '', stderr: '' });
        }, 10);
        return {
          on: vi.fn(),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() }
        };
      })
    }));
  }

  /**
   * Setup LLM mocks with queueMockResponses utility
   */
  private static setupLLMMocks(): void {
    // Mock axios for OpenRouter API calls
    vi.mock('axios', () => ({
      default: {
        post: vi.fn().mockResolvedValue({
          data: {
            id: 'chatcmpl-mock',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'mock-model',
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({ success: true, result: 'mock response' })
              },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 50,
              completion_tokens: 50,
              total_tokens: 100
            }
          }
        })
      },
      post: vi.fn().mockResolvedValue({
        data: {
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'mock-model',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({ success: true, result: 'mock response' })
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 50,
            total_tokens: 100
          }
        }
      })
    }));

    // Register queueMockResponses utility globally
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).queueMockResponses = this.queueMockResponses.bind(this);
      (globalThis as any).mockOpenRouterResponse = this.mockOpenRouterResponse.bind(this);
    }
  }

  /**
   * Queue multiple mock responses for LLM calls
   */
  static queueMockResponses(responses: Array<{ success: boolean; data?: any; error?: string }>): void {
    const mockQueue = responses.slice(); // Create a copy
    let responseIndex = 0;

    // Get the mocked axios instance
    const mockedAxios = vi.mocked(axios);
    
    // Configure axios.post mock behavior
    mockedAxios.post.mockImplementation(async (url: string, data?: any) => {
      const response = mockQueue[responseIndex] || mockQueue[mockQueue.length - 1] || { success: true, data: {} };
      responseIndex = Math.min(responseIndex + 1, mockQueue.length - 1);

      if (response.success) {
        return {
          data: {
            id: 'chatcmpl-mock',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'mock-model',
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {})
              },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 50,
              completion_tokens: 50,
              total_tokens: 100
            }
          }
        };
      } else {
        throw new Error(response.error || 'Mock LLM error');
      }
    });
  }

  /**
   * Mock single OpenRouter response
   */
  static mockOpenRouterResponse(response: { success: boolean; data?: any; error?: string }): void {
    // Get the mocked axios instance
    const mockedAxios = vi.mocked(axios);
    
    // Configure axios.post mock behavior
    mockedAxios.post.mockImplementation(async (url: string, data?: any) => {
      if (response.success) {
        return {
          data: {
            id: 'chatcmpl-mock',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'mock-model',
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {})
              },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 50,
              completion_tokens: 50,
              total_tokens: 100
            }
          }
        };
      } else {
        throw new Error(response.error || 'Mock LLM error');
      }
    });
  }

  /**
   * Cleanup all universal mocks
   */
  static async cleanupUniversalMocks(): Promise<void> {
    // Cleanup disposables
    this.disposableRegistry.forEach(dispose => {
      try {
        dispose();
      } catch (error) {
        logger.warn('Error disposing mock resource', { error });
      }
    });
    this.disposableRegistry.clear();

    // Dispose all registered resources using standardized pattern
    await DisposableResourceManager.disposeAll();

    // Clear mock registry
    this.mockRegistry.clear();

    // Cleanup original mocks
    await this.cleanupAllMocks();

    // Clear global utilities
    if (typeof globalThis !== 'undefined') {
      delete (globalThis as any).queueMockResponses;
      delete (globalThis as any).mockOpenRouterResponse;
    }
  }
}

// Keep the original MockIsolationManager for backward compatibility
export const MockIsolationManager = UniversalMockIsolationManager;

/**
 * Easy-to-use universal mock setup for tests
 */
export const setupUniversalTestMock = async (testName: string, options: {
  behavior?: 'success' | 'failure';
  enableFileSystemMocks?: boolean;
  enableStorageMocks?: boolean;
  enableImportResolverMocks?: boolean;
  enableLLMMocks?: boolean;
} = {}) => {
  const testId = `${testName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  return await UniversalMockIsolationManager.setupUniversalMock(testId, {
    mockBehavior: options.behavior || 'success',
    ...options
  });
};

/**
 * Easy-to-use mock setup for tests (legacy)
 */
export const setupTestMock = async (testName: string, behavior: 'success' | 'failure' = 'success') => {
  return setupUniversalTestMock(testName, { behavior });
};

/**
 * Setup custom mock for tests
 */
export const setupCustomTestMock = async (testName: string, customMock: any) => {
  const testId = `${testName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  return await UniversalMockIsolationManager.setupUniversalMock(testId, {
    mockBehavior: 'custom',
    customMock
  });
};

/**
 * Setup file system only mocks
 */
export const setupFileSystemMocks = async (testName: string) => {
  return setupUniversalTestMock(testName, {
    enableFileSystemMocks: true,
    enableStorageMocks: false,
    enableImportResolverMocks: false,
    enableLLMMocks: false
  });
};

/**
 * Setup storage only mocks
 */
export const setupStorageMocks = async (testName: string) => {
  return setupUniversalTestMock(testName, {
    enableFileSystemMocks: false,
    enableStorageMocks: true,
    enableImportResolverMocks: false,
    enableLLMMocks: false
  });
};

/**
 * Queue mock responses for LLM tests
 */
export const queueMockResponses = UniversalMockIsolationManager.queueMockResponses.bind(UniversalMockIsolationManager);

/**
 * Mock single OpenRouter response
 */
export const mockOpenRouterResponse = UniversalMockIsolationManager.mockOpenRouterResponse.bind(UniversalMockIsolationManager);

/**
 * Enable execution delays for testing
 */
export const enableExecutionDelays = (coordinator: any, delayMs: number = 500) => {
  coordinator.config.enableExecutionDelays = true;
  coordinator.config.defaultExecutionDelayMs = delayMs;
  logger.debug('Execution delays enabled for testing', { delayMs });
};

/**
 * Set specific execution delay
 */
export const setExecutionDelay = (coordinator: any, executionId: string, delayMs: number) => {
  coordinator.setExecutionDelay(executionId, delayMs);
};

/**
 * Pause execution for testing
 */
export const pauseExecution = (coordinator: any, executionId: string) => {
  coordinator.pauseExecution(executionId);
};

/**
 * Resume paused execution
 */
export const resumeExecution = (coordinator: any, executionId: string) => {
  coordinator.resumeExecution(executionId);
};

/**
 * Clear all execution controls
 */
export const clearExecutionControls = (coordinator: any) => {
  coordinator.clearExecutionControls();
};

/**
 * Cleanup utility for afterEach hooks
 */
export const cleanupTestServices = async () => {
  try {
    // Cleanup all universal mocks first
    await UniversalMockIsolationManager.cleanupUniversalMocks();

    // Reset ConcurrentAccessManager first to clear locks
    try {
      const { ConcurrentAccessManager } = await import('../../security/concurrent-access.js');
      if (ConcurrentAccessManager.hasInstance()) {
        await ConcurrentAccessManager.getInstance().clearAllLocks();
        ConcurrentAccessManager.resetInstance();
      }
    } catch (error) {
      // Ignore errors during cleanup
    }

    // Reset all singleton instances
    ExecutionCoordinator.resetInstance();
    TaskScheduler.resetCurrentInstance();
    ServiceLifecycleManager.resetInstance();

    // Reset AgentOrchestrator completely
    await UniversalMockIsolationManager.resetAgentOrchestrator();

    // Small delay for cleanup completion
    await new Promise(resolve => setTimeout(resolve, 10));
  } catch (error) {
    logger.warn('Error in cleanupTestServices', { error });
  }
};

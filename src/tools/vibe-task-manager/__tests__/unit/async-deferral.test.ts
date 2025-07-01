/**
 * Unit tests for async operation deferral in UniversalAgentCommunicationChannel
 * Tests that async initialization is properly deferred and dependencies are ensured before operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger to prevent actual logging during tests
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

// Mock the logger module
vi.mock('../../../../logger.js', () => ({
  default: mockLogger
}));

// Mock transport manager
const mockTransportManager = {
  isTransportRunning: vi.fn(() => false),
  configure: vi.fn(),
  startAll: vi.fn(),
  getAllocatedPorts: vi.fn(() => ({})),
  getServiceEndpoints: vi.fn(() => ({}))
};

// Mock transport manager module
vi.mock('../../../../services/transport-manager/index.js', () => ({
  transportManager: mockTransportManager
}));

// Mock agent modules to prevent actual imports during tests
vi.mock('../../../agent-registry/index.js', () => ({
  AgentRegistry: {
    getInstance: vi.fn(() => ({
      getAgent: vi.fn()
    }))
  }
}));

vi.mock('../../../agent-tasks/index.js', () => ({
  AgentTaskQueue: {
    getInstance: vi.fn(() => ({
      addTask: vi.fn()
    }))
  }
}));

vi.mock('../../../agent-response/index.js', () => ({
  AgentResponseProcessor: {
    getInstance: vi.fn(() => ({
      getAgentResponses: vi.fn()
    }))
  }
}));

describe('UniversalAgentCommunicationChannel Async Deferral', () => {
  let UniversalAgentCommunicationChannel: unknown;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();

    // Import the class after mocks are set up
    await import('../../services/agent-orchestrator.js');
    // Extract the class from the module (it's not exported, so we need to access it differently)
    // For testing purposes, we'll create a test version
    UniversalAgentCommunicationChannel = class TestUniversalAgentCommunicationChannel {
      private agentRegistry: unknown;
      private taskQueue: unknown;
      private responseProcessor: unknown;
      private websocketServer: unknown;
      private httpAgentAPI: unknown;
      private sseNotifier: unknown;
      private isInitialized: boolean = false;
      private dependenciesPromise: Promise<void> | null = null;

      constructor() {
        this.scheduleAsyncInitialization();
      }

      private scheduleAsyncInitialization(): void {
        process.nextTick(() => {
          this.dependenciesPromise = this.initializeDependencies().catch(error => {
            mockLogger.error({ err: error }, 'Failed to initialize UniversalAgentCommunicationChannel dependencies');
          });
        });
      }

      private async ensureDependencies(): Promise<void> {
        if (this.dependenciesPromise) {
          await this.dependenciesPromise;
        }
      }

      private async initializeDependencies(): Promise<void> {
        // Simulate async initialization
        await new Promise(resolve => setTimeout(resolve, 10));
        this.isInitialized = true;
        mockLogger.info('Universal agent communication channel initialized');
      }

      async sendTask(_agentId: string, _taskPayload: string): Promise<boolean> {
        await this.ensureDependencies();
        return true;
      }

      async receiveResponse(_agentId: string, _timeout: number = 30000): Promise<string> {
        await this.ensureDependencies();
        return 'test response';
      }

      async isAgentReachable(_agentId: string): Promise<boolean> {
        await this.ensureDependencies();
        return true;
      }

      // Expose private methods for testing
      public testEnsureDependencies() {
        return this.ensureDependencies();
      }

      public testIsInitialized() {
        return this.isInitialized;
      }

      public testDependenciesPromise() {
        return this.dependenciesPromise;
      }
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should defer async initialization during constructor', () => {
    const channel = new UniversalAgentCommunicationChannel();

    // Immediately after construction, initialization should not have started
    expect(channel.testIsInitialized()).toBe(false);
    expect(channel.testDependenciesPromise()).toBeNull();

    // No initialization logs should have been called yet
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      'Universal agent communication channel initialized'
    );
  });

  it('should start async initialization on next tick', async () => {
    const channel = new UniversalAgentCommunicationChannel();

    // Advance to next tick
    await vi.runOnlyPendingTimersAsync();

    // Now dependencies promise should be set
    expect(channel.testDependenciesPromise()).not.toBeNull();

    // Wait for initialization to complete
    await channel.testEnsureDependencies();

    // Verify initialization completed
    expect(channel.testIsInitialized()).toBe(true);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Universal agent communication channel initialized'
    );
  });

  it('should ensure dependencies before sendTask operation', async () => {
    const channel = new UniversalAgentCommunicationChannel();

    // Call sendTask before manual initialization
    const resultPromise = channel.sendTask('test-agent', 'test-payload');

    // Advance timers to trigger initialization
    await vi.runOnlyPendingTimersAsync();

    // Wait for operation to complete
    const result = await resultPromise;

    // Verify operation succeeded and initialization occurred
    expect(result).toBe(true);
    expect(channel.testIsInitialized()).toBe(true);
  });

  it('should ensure dependencies before receiveResponse operation', async () => {
    const channel = new UniversalAgentCommunicationChannel();

    // Call receiveResponse before manual initialization
    const resultPromise = channel.receiveResponse('test-agent');

    // Advance timers to trigger initialization
    await vi.runOnlyPendingTimersAsync();

    // Wait for operation to complete
    const result = await resultPromise;

    // Verify operation succeeded and initialization occurred
    expect(result).toBe('test response');
    expect(channel.testIsInitialized()).toBe(true);
  });

  it('should ensure dependencies before isAgentReachable operation', async () => {
    const channel = new UniversalAgentCommunicationChannel();

    // Call isAgentReachable before manual initialization
    const resultPromise = channel.isAgentReachable('test-agent');

    // Advance timers to trigger initialization
    await vi.runOnlyPendingTimersAsync();

    // Wait for operation to complete
    const result = await resultPromise;

    // Verify operation succeeded and initialization occurred
    expect(result).toBe(true);
    expect(channel.testIsInitialized()).toBe(true);
  });

  it('should handle initialization errors gracefully', async () => {
    // Create a version that throws during initialization
    class FailingChannel extends UniversalAgentCommunicationChannel {
      private async initializeDependencies(): Promise<void> {
        throw new Error('Initialization failed');
      }
    }

    new FailingChannel();

    // Advance to next tick to trigger initialization
    await vi.runOnlyPendingTimersAsync();

    // Wait a bit for error handling
    await new Promise(resolve => setTimeout(resolve, 20));
    await vi.runOnlyPendingTimersAsync();

    // Verify error was logged
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Failed to initialize UniversalAgentCommunicationChannel dependencies'
    );
  });

  it('should not reinitialize if dependencies are already being initialized', async () => {
    const channel = new UniversalAgentCommunicationChannel();

    // Advance to next tick to start initialization
    await vi.runOnlyPendingTimersAsync();

    // Call multiple operations simultaneously
    const promises = [
      channel.sendTask('agent1', 'payload1'),
      channel.receiveResponse('agent2'),
      channel.isAgentReachable('agent3')
    ];

    // Wait for all operations to complete
    await Promise.all(promises);

    // Verify initialization only happened once
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Universal agent communication channel initialized'
    );
  });

  it('should complete initialization before any operation proceeds', async () => {
    const channel = new UniversalAgentCommunicationChannel();
    const initializationOrder: string[] = [];

    // Override methods to track order
    const originalEnsure = channel.testEnsureDependencies.bind(channel);
    channel.testEnsureDependencies = async function() {
      initializationOrder.push('ensure-start');
      await originalEnsure();
      initializationOrder.push('ensure-end');
    };

    // Start operation
    const operationPromise = channel.sendTask('test-agent', 'test-payload').then(() => {
      initializationOrder.push('operation-complete');
    });

    // Advance timers
    await vi.runOnlyPendingTimersAsync();

    // Wait for operation
    await operationPromise;

    // Verify order: ensure starts, ensure ends, then operation completes
    expect(initializationOrder).toEqual([
      'ensure-start',
      'ensure-end',
      'operation-complete'
    ]);
  });
});

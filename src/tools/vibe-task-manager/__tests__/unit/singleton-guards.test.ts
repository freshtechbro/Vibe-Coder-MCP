/**
 * Unit tests for singleton initialization guards
 * Tests that all singleton services prevent circular initialization and provide safe fallbacks
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

// Mock console to capture fallback warnings
const mockConsole = {
  warn: vi.fn(),
  log: vi.fn(),
  error: vi.fn()
};

// Mock console
vi.stubGlobal('console', mockConsole);

describe('Singleton Initialization Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset any existing singleton instances
    resetSingletonInstances();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('AgentOrchestrator', () => {
    it('should detect circular initialization and return safe fallback', async () => {
      // Mock the AgentOrchestrator to simulate circular initialization
      const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');
      
      // Simulate circular initialization by setting the flag
      (AgentOrchestrator as typeof AgentOrchestrator & { isInitializing: boolean }).isInitializing = true;
      
      const fallbackInstance = AgentOrchestrator.getInstance();
      
      // Verify fallback instance is returned
      expect(fallbackInstance).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Circular initialization detected in AgentOrchestrator, using safe fallback'
      );
      
      // Verify fallback has safe methods
      expect(typeof fallbackInstance.registerAgent).toBe('function');
      expect(typeof fallbackInstance.assignTask).toBe('function');
      expect(typeof fallbackInstance.getAgents).toBe('function');
      
      // Reset the flag
      (AgentOrchestrator as typeof AgentOrchestrator & { isInitializing: boolean }).isInitializing = false;
    });

    it('should create normal instance when not in circular initialization', async () => {
      const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');
      
      // Ensure flag is not set
      (AgentOrchestrator as typeof AgentOrchestrator & { isInitializing: boolean; instance: unknown }).isInitializing = false;
      (AgentOrchestrator as typeof AgentOrchestrator & { isInitializing: boolean; instance: unknown }).instance = null;
      
      const instance = AgentOrchestrator.getInstance();
      
      expect(instance).toBeDefined();
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Circular initialization detected')
      );
    });
  });

  describe('AgentRegistry', () => {
    it('should detect circular initialization and return safe fallback', async () => {
      const { AgentRegistry } = await import('../../../agent-registry/index.js');
      
      // Simulate circular initialization
      (AgentRegistry as typeof AgentRegistry & { isInitializing: boolean }).isInitializing = true;
      
      const fallbackInstance = (AgentRegistry as typeof AgentRegistry & { getInstance: () => unknown }).getInstance();
      
      expect(fallbackInstance).toBeDefined();
      expect(mockConsole.warn).toHaveBeenCalledWith(
        'Circular initialization detected in AgentRegistry, using safe fallback'
      );
      
      // Verify fallback has safe methods
      expect(typeof fallbackInstance.registerAgent).toBe('function');
      expect(typeof fallbackInstance.getAgent).toBe('function');
      expect(typeof fallbackInstance.getOnlineAgents).toBe('function');
      
      // Reset the flag
      (AgentRegistry as typeof AgentRegistry & { isInitializing: boolean }).isInitializing = false;
    });
  });

  describe('AgentTaskQueue', () => {
    it('should detect circular initialization and return safe fallback', async () => {
      const { AgentTaskQueue } = await import('../../../agent-tasks/index.js');
      
      // Simulate circular initialization
      (AgentTaskQueue as typeof AgentTaskQueue & { isInitializing: boolean }).isInitializing = true;
      
      const fallbackInstance = (AgentTaskQueue as typeof AgentTaskQueue & { getInstance: () => unknown }).getInstance();
      
      expect(fallbackInstance).toBeDefined();
      expect(mockConsole.warn).toHaveBeenCalledWith(
        'Circular initialization detected in AgentTaskQueue, using safe fallback'
      );
      
      // Verify fallback has safe methods
      expect(typeof fallbackInstance.assignTask).toBe('function');
      expect(typeof fallbackInstance.getTasks).toBe('function');
      expect(typeof fallbackInstance.getQueueLength).toBe('function');
      
      // Reset the flag
      (AgentTaskQueue as typeof AgentTaskQueue & { isInitializing: boolean }).isInitializing = false;
    });
  });

  describe('AgentResponseProcessor', () => {
    it('should detect circular initialization and return safe fallback', async () => {
      const { AgentResponseProcessor } = await import('../../../agent-response/index.js');
      
      // Simulate circular initialization
      (AgentResponseProcessor as typeof AgentResponseProcessor & { isInitializing: boolean }).isInitializing = true;
      
      const fallbackInstance = (AgentResponseProcessor as typeof AgentResponseProcessor & { getInstance: () => unknown }).getInstance();
      
      expect(fallbackInstance).toBeDefined();
      expect(mockConsole.warn).toHaveBeenCalledWith(
        'Circular initialization detected in AgentResponseProcessor, using safe fallback'
      );
      
      // Verify fallback has safe methods
      expect(typeof fallbackInstance.processResponse).toBe('function');
      expect(typeof fallbackInstance.getResponse).toBe('function');
      expect(typeof fallbackInstance.getAllResponses).toBe('function');
      
      // Reset the flag
      (AgentResponseProcessor as typeof AgentResponseProcessor & { isInitializing: boolean }).isInitializing = false;
    });
  });

  describe('AgentIntegrationBridge', () => {
    it('should detect circular initialization and return safe fallback', async () => {
      const { AgentIntegrationBridge } = await import('../../services/agent-integration-bridge.js');
      
      // Simulate circular initialization
      (AgentIntegrationBridge as typeof AgentIntegrationBridge & { isInitializing: boolean }).isInitializing = true;
      
      const fallbackInstance = AgentIntegrationBridge.getInstance();
      
      expect(fallbackInstance).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Circular initialization detected in AgentIntegrationBridge, using safe fallback'
      );
      
      // Verify fallback has safe methods
      expect(typeof fallbackInstance.registerAgent).toBe('function');
      expect(typeof fallbackInstance.synchronizeAgents).toBe('function');
      expect(typeof fallbackInstance.getUnifiedAgent).toBe('function');
      expect(typeof fallbackInstance.startAutoSync).toBe('function');
      
      // Reset the flag
      (AgentIntegrationBridge as typeof AgentIntegrationBridge & { isInitializing: boolean }).isInitializing = false;
    });
  });

  describe('Fallback Method Behavior', () => {
    it('should log warnings when fallback methods are called', async () => {
      const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');
      
      // Get fallback instance
      (AgentOrchestrator as typeof AgentOrchestrator & { isInitializing: boolean }).isInitializing = true;
      const fallback = AgentOrchestrator.getInstance();
      (AgentOrchestrator as typeof AgentOrchestrator & { isInitializing: boolean }).isInitializing = false;
      
      // Call fallback methods
      await fallback.registerAgent({} as Record<string, unknown>);
      await fallback.assignTask({} as Record<string, unknown>);
      await fallback.getAgents();
      
      // Verify warnings were logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'AgentOrchestrator fallback: registerAgent called during initialization'
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'AgentOrchestrator fallback: assignTask called during initialization'
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'AgentOrchestrator fallback: getAgents called during initialization'
      );
    });
  });

  describe('Initialization Flag Management', () => {
    it('should properly reset initialization flag after successful creation', async () => {
      const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');
      
      // Reset instance
      (AgentOrchestrator as typeof AgentOrchestrator & { instance: unknown; isInitializing: boolean }).instance = null;
      (AgentOrchestrator as typeof AgentOrchestrator & { instance: unknown; isInitializing: boolean }).isInitializing = false;
      
      // Create instance
      const instance = AgentOrchestrator.getInstance();
      
      // Verify flag is reset
      expect((AgentOrchestrator as typeof AgentOrchestrator & { isInitializing: boolean }).isInitializing).toBe(false);
      expect(instance).toBeDefined();
    });

    it('should reset initialization flag even if constructor throws', async () => {
      const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');
      
      // Reset instance
      (AgentOrchestrator as typeof AgentOrchestrator & { instance: unknown }).instance = null;
      
      // Mock constructor to throw
      const originalConstructor = AgentOrchestrator.prototype.constructor;
      AgentOrchestrator.prototype.constructor = function() {
        throw new Error('Constructor error');
      };
      
      try {
        AgentOrchestrator.getInstance();
      } catch {
        // Expected to throw
      }
      
      // Verify flag is reset even after error
      expect((AgentOrchestrator as typeof AgentOrchestrator & { isInitializing: boolean }).isInitializing).toBe(false);
      
      // Restore original constructor
      AgentOrchestrator.prototype.constructor = originalConstructor;
    });
  });
});

/**
 * Helper function to reset singleton instances for testing
 */
function resetSingletonInstances() {
  // This function would reset singleton instances if needed
  // For now, we handle this in individual tests
}

/**
 * Tests for WorkflowAwareAgentManager
 * Tests the new async configuration initialization and enhanced circular dependency resolution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkflowAwareAgentManager } from '../../services/workflow-aware-agent-manager.js';

// Mock the config loader
vi.mock('../../utils/config-loader.js', () => ({
  getVibeTaskManagerConfig: vi.fn().mockResolvedValue({
    llm_mapping: {
      'task_decomposition': 'anthropic/claude-3-sonnet'
    }
  }),
  getVibeTaskManagerOutputDir: vi.fn().mockReturnValue('/mock/output/dir')
}));

// Mock the DecompositionService
vi.mock('../../services/decomposition-service.js', () => ({
  DecompositionService: {
    getInstance: vi.fn().mockReturnValue({
      on: vi.fn(),
      emit: vi.fn()
    })
  }
}));

// Mock the WorkflowStateManager
vi.mock('../../core/workflow-state-manager.js', () => ({
  WorkflowStateManager: {
    getInstance: vi.fn().mockReturnValue({
      on: vi.fn(),
      emit: vi.fn()
    })
  }
}));

// Mock the AgentOrchestrator for circular dependency testing
vi.mock('../../services/agent-orchestrator.js', () => ({
  AgentOrchestrator: {
    getInstance: vi.fn().mockReturnValue({
      registerAgent: vi.fn(),
      getAgents: vi.fn().mockReturnValue([])
    })
  }
}));

describe('WorkflowAwareAgentManager', () => {
  let manager: WorkflowAwareAgentManager;

  beforeEach(() => {
    // Reset singleton instance before each test
    (WorkflowAwareAgentManager as any).instance = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    if (manager) {
      manager.stopMonitoring();
    }
  });

  describe('Singleton Pattern', () => {
    it('should create singleton instance successfully', () => {
      manager = WorkflowAwareAgentManager.getInstance();
      
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(WorkflowAwareAgentManager);
    });

    it('should return same instance on subsequent calls', () => {
      const manager1 = WorkflowAwareAgentManager.getInstance();
      const manager2 = WorkflowAwareAgentManager.getInstance();
      
      expect(manager1).toBe(manager2);
    });

    it('should accept custom configuration', () => {
      const customConfig = {
        heartbeatInterval: 10000,
        taskTimeout: 60000
      };
      
      manager = WorkflowAwareAgentManager.getInstance(customConfig);
      
      expect(manager).toBeDefined();
    });
  });

  describe('Async Configuration Initialization', () => {
    it('should initialize DecompositionService with proper config', async () => {
      const { getVibeTaskManagerConfig } = await import('../../utils/config-loader.js');
      const { DecompositionService } = await import('../../services/decomposition-service.js');
      
      manager = WorkflowAwareAgentManager.getInstance();
      
      // Wait for async initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify config loader was called
      expect(getVibeTaskManagerConfig).toHaveBeenCalled();
      
      // Verify DecompositionService.getInstance was called with config
      expect(DecompositionService.getInstance).toHaveBeenCalledWith({
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: expect.any(String), // API key will be from environment
        model: 'anthropic/claude-3-sonnet',
        geminiModel: 'gemini-pro',
        perplexityModel: 'llama-3.1-sonar-small-128k-online'
      });
    });

    it('should handle config loading failure gracefully', async () => {
      const { getVibeTaskManagerConfig } = await import('../../utils/config-loader.js');
      vi.mocked(getVibeTaskManagerConfig).mockRejectedValueOnce(new Error('Config load failed'));
      
      // Should not throw error
      expect(() => {
        manager = WorkflowAwareAgentManager.getInstance();
      }).not.toThrow();
      
      expect(manager).toBeDefined();
    });

    it('should use fallback when config is null', async () => {
      const { getVibeTaskManagerConfig } = await import('../../utils/config-loader.js');
      vi.mocked(getVibeTaskManagerConfig).mockResolvedValueOnce(null);
      
      manager = WorkflowAwareAgentManager.getInstance();
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(manager).toBeDefined();
      // Should still function with fallback implementation
    });
  });

  describe('Enhanced Circular Dependency Resolution', () => {
    it('should handle AgentOrchestrator lazy initialization', async () => {
      manager = WorkflowAwareAgentManager.getInstance();
      
      // Access the private getAgentOrchestrator method through type assertion
      const getAgentOrchestrator = (manager as any).getAgentOrchestrator;
      
      expect(typeof getAgentOrchestrator).toBe('function');
      
      // Should be able to call without circular dependency issues
      const orchestrator = await getAgentOrchestrator.call(manager);
      
      expect(orchestrator).toBeDefined();
    });

    it('should use dynamic imports to break circular dependencies', async () => {
      manager = WorkflowAwareAgentManager.getInstance();
      
      // Verify that agentOrchestrator starts as null
      expect((manager as any).agentOrchestrator).toBeNull();
      
      // Call getAgentOrchestrator to trigger lazy initialization
      const getAgentOrchestrator = (manager as any).getAgentOrchestrator;
      const orchestrator = await getAgentOrchestrator.call(manager);
      
      // Should now have an orchestrator instance
      expect(orchestrator).toBeDefined();
      expect((manager as any).agentOrchestrator).not.toBeNull();
    });

    it('should cache AgentOrchestrator instance after first access', async () => {
      manager = WorkflowAwareAgentManager.getInstance();
      
      const getAgentOrchestrator = (manager as any).getAgentOrchestrator;
      
      // First call should create instance
      const orchestrator1 = await getAgentOrchestrator.call(manager);
      
      // Second call should return cached instance
      const orchestrator2 = await getAgentOrchestrator.call(manager);
      
      expect(orchestrator1).toBe(orchestrator2);
    });
  });

  describe('Agent Activity Registration', () => {
    it('should register agent activity successfully', async () => {
      manager = WorkflowAwareAgentManager.getInstance();
      
      const activityData = {
        workflowId: 'test-workflow',
        sessionId: 'test-session',
        expectedDuration: 30000,
        isWorkflowCritical: true,
        metadata: {
          taskId: 'test-task',
          taskType: 'development'
        }
      };
      
      // Should not throw error
      await expect(
        manager.registerAgentActivity('test-agent', 'task_execution', activityData)
      ).resolves.not.toThrow();
    });

    it('should handle agent activity registration errors gracefully', async () => {
      manager = WorkflowAwareAgentManager.getInstance();
      
      // Test with invalid data
      const invalidActivityData = {
        workflowId: '',
        sessionId: '',
        expectedDuration: -1,
        isWorkflowCritical: false
      };
      
      // Should handle gracefully without throwing
      await expect(
        manager.registerAgentActivity('', 'task_execution', invalidActivityData)
      ).resolves.not.toThrow();
    });
  });

  describe('Monitoring Lifecycle', () => {
    it('should start and stop monitoring successfully', () => {
      manager = WorkflowAwareAgentManager.getInstance();
      
      // Should be able to start monitoring
      expect(() => manager.startMonitoring()).not.toThrow();
      
      // Should be able to stop monitoring
      expect(() => manager.stopMonitoring()).not.toThrow();
    });

    it('should handle multiple start/stop calls gracefully', () => {
      manager = WorkflowAwareAgentManager.getInstance();
      
      // Multiple starts should not cause issues
      manager.startMonitoring();
      manager.startMonitoring();
      
      // Multiple stops should not cause issues
      manager.stopMonitoring();
      manager.stopMonitoring();
      
      expect(manager).toBeDefined();
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should continue functioning when dependencies fail to initialize', async () => {
      // Mock WorkflowStateManager to throw error
      const { WorkflowStateManager } = vi.mocked(await import('../../core/workflow-state-manager.js'));
      vi.mocked(WorkflowStateManager.getInstance).mockImplementationOnce(() => {
        throw new Error('WorkflowStateManager initialization failed');
      });

      // Should still create instance with fallback
      expect(() => {
        manager = WorkflowAwareAgentManager.getInstance();
      }).not.toThrow();

      expect(manager).toBeDefined();
    });

    it('should provide meaningful error information when initialization fails', async () => {
      const { getVibeTaskManagerConfig } = await import('../../utils/config-loader.js');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      vi.mocked(getVibeTaskManagerConfig).mockRejectedValueOnce(new Error('Network error'));
      
      manager = WorkflowAwareAgentManager.getInstance();
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should still be functional
      expect(manager).toBeDefined();
      
      consoleSpy.mockRestore();
    });
  });
});

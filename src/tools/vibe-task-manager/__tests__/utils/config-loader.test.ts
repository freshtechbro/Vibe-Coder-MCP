import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import { ConfigLoader, getVibeTaskManagerConfig, getLLMModelForOperation } from '../../utils/config-loader.js';
import { setupCommonMocks, cleanupMocks } from './test-setup.js';

// Mock fs-extra
vi.mock('fs-extra');
const mockFs = fs as any;

describe('ConfigLoader', () => {
  let configLoader: ConfigLoader;

  beforeEach(() => {
    setupCommonMocks();
    vi.clearAllMocks();
    
    // Reset singleton
    (ConfigLoader as any).instance = undefined;
    configLoader = ConfigLoader.getInstance();
  });

  afterEach(() => {
    cleanupMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ConfigLoader.getInstance();
      const instance2 = ConfigLoader.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('loadConfig', () => {
    it('should load configuration from existing files successfully', async () => {
      const mockLLMConfig = {
        llm_mapping: {
          'task_decomposition': 'deepseek/deepseek-r1-0528-qwen3-8b:free',
          'atomic_task_detection': 'deepseek/deepseek-r1-0528-qwen3-8b:free',
          'intent_recognition': 'deepseek/deepseek-r1-0528-qwen3-8b:free',
          'default_generation': 'deepseek/deepseek-r1-0528-qwen3-8b:free'
        }
      };

      const mockMCPConfig = {
        tools: {
          'vibe-task-manager': {
            description: 'AI-agent-native task management system',
            use_cases: ['task management', 'project planning'],
            input_patterns: ['create project {projectName}']
          }
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: 1000 });
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockLLMConfig))
        .mockResolvedValueOnce(JSON.stringify(mockMCPConfig));

      const result = await configLoader.loadConfig();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.llm).toEqual(mockLLMConfig);
      expect(result.data!.mcp).toEqual(mockMCPConfig);
      expect(result.data!.taskManager).toBeDefined();
    });

    it('should handle missing LLM config file', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      const result = await configLoader.loadConfig();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load LLM config');
    });

    it('should handle missing MCP config file', async () => {
      const mockLLMConfig = {
        llm_mapping: {
          'default_generation': 'deepseek/deepseek-r1-0528-qwen3-8b:free'
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: 1000 });
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockLLMConfig))
        .mockRejectedValueOnce(new Error('File not found'));

      const result = await configLoader.loadConfig();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load MCP config');
    });

    it('should handle invalid JSON in config files', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: 1000 });
      mockFs.readFile.mockResolvedValueOnce('invalid json');

      const result = await configLoader.loadConfig();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load LLM config');
    });
  });

  describe('getConfig', () => {
    it('should return null when config not loaded', () => {
      const config = configLoader.getConfig();
      expect(config).toBeNull();
    });

    it('should return config after loading', async () => {
      const mockLLMConfig = {
        llm_mapping: {
          'default_generation': 'deepseek/deepseek-r1-0528-qwen3-8b:free'
        }
      };

      const mockMCPConfig = {
        tools: {
          'vibe-task-manager': {
            description: 'Test description',
            use_cases: ['test'],
            input_patterns: ['test pattern']
          }
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: 1000 });
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockLLMConfig))
        .mockResolvedValueOnce(JSON.stringify(mockMCPConfig));

      await configLoader.loadConfig();
      const config = configLoader.getConfig();

      expect(config).toBeDefined();
      expect(config!.llm).toEqual(mockLLMConfig);
      expect(config!.mcp).toEqual(mockMCPConfig);
    });

    it('should return a copy to prevent mutations', async () => {
      const mockLLMConfig = {
        llm_mapping: {
          'default_generation': 'deepseek/deepseek-r1-0528-qwen3-8b:free'
        }
      };

      const mockMCPConfig = {
        tools: {
          'vibe-task-manager': {
            description: 'Test description',
            use_cases: ['test'],
            input_patterns: ['test pattern']
          }
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: 1000 });
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockLLMConfig))
        .mockResolvedValueOnce(JSON.stringify(mockMCPConfig));

      await configLoader.loadConfig();
      const config1 = configLoader.getConfig();
      const config2 = configLoader.getConfig();

      expect(config1).not.toBe(config2); // Different objects
      expect(config1).toEqual(config2); // Same content
    });
  });

  describe('getLLMModel', () => {
    beforeEach(async () => {
      const mockLLMConfig = {
        llm_mapping: {
          'task_decomposition': 'deepseek/deepseek-r1-0528-qwen3-8b:free',
          'atomic_task_detection': 'anthropic/claude-3-sonnet',
          'default_generation': 'deepseek/deepseek-r1-0528-qwen3-8b:free'
        }
      };

      const mockMCPConfig = {
        tools: {
          'vibe-task-manager': {
            description: 'Test description',
            use_cases: ['test'],
            input_patterns: ['test pattern']
          }
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: 1000 });
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockLLMConfig))
        .mockResolvedValueOnce(JSON.stringify(mockMCPConfig));

      await configLoader.loadConfig();
    });

    it('should return specific model for operation', () => {
      const model = configLoader.getLLMModel('task_decomposition');
      expect(model).toBe('deepseek/deepseek-r1-0528-qwen3-8b:free');
    });

    it('should return different model for different operation', () => {
      const model = configLoader.getLLMModel('atomic_task_detection');
      expect(model).toBe('anthropic/claude-3-sonnet');
    });

    it('should fallback to default_generation for unknown operation', () => {
      const model = configLoader.getLLMModel('unknown_operation');
      expect(model).toBe('deepseek/deepseek-r1-0528-qwen3-8b:free');
    });

    it('should fallback to hardcoded default when config not loaded', () => {
      const newLoader = new (ConfigLoader as any)();
      const model = newLoader.getLLMModel('task_decomposition');
      expect(model).toBe('deepseek/deepseek-r1-0528-qwen3-8b:free');
    });
  });

  describe('validateLLMMappings', () => {
    it('should validate required LLM mappings are present', async () => {
      const mockLLMConfig = {
        llm_mapping: {
          'task_decomposition': 'deepseek/deepseek-r1-0528-qwen3-8b:free',
          'atomic_task_detection': 'deepseek/deepseek-r1-0528-qwen3-8b:free',
          'intent_recognition': 'deepseek/deepseek-r1-0528-qwen3-8b:free',
          'task_refinement': 'deepseek/deepseek-r1-0528-qwen3-8b:free',
          'dependency_graph_analysis': 'deepseek/deepseek-r1-0528-qwen3-8b:free',
          'agent_coordination': 'deepseek/deepseek-r1-0528-qwen3-8b:free'
        }
      };

      const mockMCPConfig = {
        tools: {
          'vibe-task-manager': {
            description: 'Test description',
            use_cases: ['test'],
            input_patterns: ['test pattern']
          }
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: 1000 });
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockLLMConfig))
        .mockResolvedValueOnce(JSON.stringify(mockMCPConfig));

      await configLoader.loadConfig();
      const validation = configLoader.validateLLMMappings();

      expect(validation.valid).toBe(true);
      expect(validation.missing).toEqual([]);
    });

    it('should identify missing LLM mappings', async () => {
      const mockLLMConfig = {
        llm_mapping: {
          'task_decomposition': 'deepseek/deepseek-r1-0528-qwen3-8b:free'
          // Missing other required mappings
        }
      };

      const mockMCPConfig = {
        tools: {
          'vibe-task-manager': {
            description: 'Test description',
            use_cases: ['test'],
            input_patterns: ['test pattern']
          }
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: 1000 });
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockLLMConfig))
        .mockResolvedValueOnce(JSON.stringify(mockMCPConfig));

      await configLoader.loadConfig();
      const validation = configLoader.validateLLMMappings();

      expect(validation.valid).toBe(false);
      expect(validation.missing).toContain('atomic_task_detection');
      expect(validation.missing).toContain('intent_recognition');
    });
  });

  describe('validateMCPRegistration', () => {
    it('should validate MCP registration is correct', async () => {
      const mockLLMConfig = {
        llm_mapping: {
          'default_generation': 'deepseek/deepseek-r1-0528-qwen3-8b:free'
        }
      };

      const mockMCPConfig = {
        tools: {
          'vibe-task-manager': {
            description: 'AI-agent-native task management system',
            use_cases: ['task management'],
            input_patterns: ['create project {projectName}']
          }
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: 1000 });
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockLLMConfig))
        .mockResolvedValueOnce(JSON.stringify(mockMCPConfig));

      await configLoader.loadConfig();
      const validation = configLoader.validateMCPRegistration();

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('should detect missing MCP registration', async () => {
      const mockLLMConfig = {
        llm_mapping: {
          'default_generation': 'deepseek/deepseek-r1-0528-qwen3-8b:free'
        }
      };

      const mockMCPConfig = {
        tools: {
          'other-tool': {
            description: 'Other tool',
            use_cases: ['other'],
            input_patterns: ['other pattern']
          }
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: 1000 });
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockLLMConfig))
        .mockResolvedValueOnce(JSON.stringify(mockMCPConfig));

      await configLoader.loadConfig();
      const validation = configLoader.validateMCPRegistration();

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('vibe-task-manager not found');
    });
  });

  describe('convenience functions', () => {
    it('getVibeTaskManagerConfig should load and return config', async () => {
      const mockLLMConfig = {
        llm_mapping: {
          'default_generation': 'deepseek/deepseek-r1-0528-qwen3-8b:free'
        }
      };

      const mockMCPConfig = {
        tools: {
          'vibe-task-manager': {
            description: 'Test description',
            use_cases: ['test'],
            input_patterns: ['test pattern']
          }
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: 1000 });
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockLLMConfig))
        .mockResolvedValueOnce(JSON.stringify(mockMCPConfig));

      const config = await getVibeTaskManagerConfig();

      expect(config).toBeDefined();
      expect(config!.llm).toEqual(mockLLMConfig);
      expect(config!.mcp).toEqual(mockMCPConfig);
    });

    it('getLLMModelForOperation should return correct model', async () => {
      const mockLLMConfig = {
        llm_mapping: {
          'task_decomposition': 'anthropic/claude-3-sonnet',
          'default_generation': 'deepseek/deepseek-r1-0528-qwen3-8b:free'
        }
      };

      const mockMCPConfig = {
        tools: {
          'vibe-task-manager': {
            description: 'Test description',
            use_cases: ['test'],
            input_patterns: ['test pattern']
          }
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: 1000 });
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockLLMConfig))
        .mockResolvedValueOnce(JSON.stringify(mockMCPConfig));

      const model = await getLLMModelForOperation('task_decomposition');

      expect(model).toBe('anthropic/claude-3-sonnet');
    });
  });
});

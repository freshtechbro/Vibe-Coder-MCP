/**
 * Comprehensive Configuration System Tests
 * Tests configuration loading, validation, environment variables, and schema validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  ENVIRONMENT_VARIABLES, 
  getEnvironmentValue, 
  validateAllEnvironmentVariables 
} from '../../utils/config-defaults.js';
import { EnvironmentValidator } from '../../utils/environment-validator.js';
import { ConfigSchemaValidator, CONFIG_SCHEMA } from '../../utils/config-schema.js';

// Mock dependencies
vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn()
  }
}));

vi.mock('../../utils/file-utils.js', () => ({
  FileUtils: {
    readJsonFile: vi.fn()
  }
}));

vi.mock('../../code-map-generator/utils/pathUtils.enhanced.js', () => ({
  getProjectRoot: vi.fn(() => '/test/project')
}));

describe('Configuration System', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear all Vibe-related environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('VIBE_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('Environment Variable Defaults', () => {
    it('should have all required environment variables defined', () => {
      const requiredVars = [
        'VIBE_CODER_OUTPUT_DIR',
        'VIBE_MAX_CONCURRENT_TASKS',
        'VIBE_DEFAULT_TASK_TEMPLATE',
        'VIBE_MAX_RESPONSE_TIME',
        'VIBE_MAX_MEMORY_USAGE',
        'VIBE_MIN_TEST_COVERAGE'
      ];

      requiredVars.forEach(varName => {
        expect(ENVIRONMENT_VARIABLES[varName]).toBeDefined();
        expect(ENVIRONMENT_VARIABLES[varName].key).toBe(varName);
        expect(ENVIRONMENT_VARIABLES[varName].defaultValue).toBeDefined();
        expect(ENVIRONMENT_VARIABLES[varName].description).toBeDefined();
      });
    });

    it('should return default values when environment variables are not set', () => {
      const maxTasks = getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MAX_CONCURRENT_TASKS);
      expect(maxTasks).toBe(10);

      const responseTime = getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MAX_RESPONSE_TIME);
      expect(responseTime).toBe(50);

      const template = getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_DEFAULT_TASK_TEMPLATE);
      expect(template).toBe('development');
    });

    it('should use environment values when set', () => {
      process.env.VIBE_MAX_CONCURRENT_TASKS = '20';
      process.env.VIBE_MAX_RESPONSE_TIME = '100';
      process.env.VIBE_DEFAULT_TASK_TEMPLATE = 'testing';

      const maxTasks = getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MAX_CONCURRENT_TASKS);
      expect(maxTasks).toBe(20);

      const responseTime = getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MAX_RESPONSE_TIME);
      expect(responseTime).toBe(100);

      const template = getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_DEFAULT_TASK_TEMPLATE);
      expect(template).toBe('testing');
    });

    it('should validate environment variable values', () => {
      process.env.VIBE_MAX_CONCURRENT_TASKS = '150'; // Above max
      
      expect(() => {
        getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MAX_CONCURRENT_TASKS);
      }).toThrow('failed validation');
    });

    it('should transform boolean environment variables correctly', () => {
      process.env.VIBE_ENABLE_EXPONENTIAL_BACKOFF = 'false';
      const backoff = getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_ENABLE_EXPONENTIAL_BACKOFF);
      expect(backoff).toBe(false);

      process.env.VIBE_ENABLE_EXPONENTIAL_BACKOFF = 'true';
      const backoffTrue = getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_ENABLE_EXPONENTIAL_BACKOFF);
      expect(backoffTrue).toBe(true);
    });

    it('should transform float environment variables correctly', () => {
      process.env.VIBE_MIN_CONFIDENCE = '0.85';
      const confidence = getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MIN_CONFIDENCE);
      expect(confidence).toBe(0.85);
    });
  });

  describe('Environment Variable Validation', () => {
    it('should validate all environment variables successfully with defaults', () => {
      const validation = validateAllEnvironmentVariables();
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.warnings.length).toBeGreaterThan(0); // Should have warnings for using defaults
    });

    it('should detect invalid environment variable values', () => {
      process.env.VIBE_MAX_CONCURRENT_TASKS = 'invalid';
      
      const validation = validateAllEnvironmentVariables();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('VIBE_MAX_CONCURRENT_TASKS');
    });

    it('should detect out-of-range values', () => {
      process.env.VIBE_MAX_CONCURRENT_TASKS = '200'; // Above max
      process.env.VIBE_MIN_CONFIDENCE = '1.5'; // Above max
      
      const validation = validateAllEnvironmentVariables();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Environment Validator', () => {
    let validator: EnvironmentValidator;

    beforeEach(() => {
      validator = EnvironmentValidator.getInstance();
    });

    it('should be a singleton', () => {
      const validator1 = EnvironmentValidator.getInstance();
      const validator2 = EnvironmentValidator.getInstance();
      expect(validator1).toBe(validator2);
    });

    it('should validate environment successfully with defaults', async () => {
      const result = await validator.validateEnvironment();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.totalVariables).toBeGreaterThan(0);
      expect(result.summary.validVariables).toBeGreaterThan(0);
      expect(result.summary.usingDefaults).toBeGreaterThan(0);
    });

    it('should detect environment issues', async () => {
      process.env.VIBE_MAX_CONCURRENT_TASKS = 'invalid';
      
      const result = await validator.validateEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.summary.invalidVariables).toBeGreaterThan(0);
    });

    it('should perform health check', async () => {
      const healthCheck = await validator.performHealthCheck();
      
      expect(healthCheck.score).toBeGreaterThanOrEqual(0);
      expect(healthCheck.score).toBeLessThanOrEqual(100);
      expect(healthCheck.performance).toBeDefined();
      expect(healthCheck.performance.configLoadTime).toBeGreaterThan(0);
      expect(healthCheck.performance.memoryUsage).toBeGreaterThan(0);
    });

    it('should generate documentation', () => {
      const docs = validator.generateDocumentation();
      
      expect(docs).toContain('# Vibe Task Manager Environment Variables');
      expect(docs).toContain('VIBE_CODER_OUTPUT_DIR');
      expect(docs).toContain('VIBE_MAX_CONCURRENT_TASKS');
      expect(docs).toContain('Core Configuration');
      expect(docs).toContain('Task Manager Settings');
    });
  });

  describe('Configuration Schema Validator', () => {
    let validator: ConfigSchemaValidator;

    beforeEach(() => {
      validator = ConfigSchemaValidator.getInstance();
    });

    it('should be a singleton', () => {
      const validator1 = ConfigSchemaValidator.getInstance();
      const validator2 = ConfigSchemaValidator.getInstance();
      expect(validator1).toBe(validator2);
    });

    it('should validate valid configuration', () => {
      const validConfig = {
        llm: {
          llm_mapping: {
            'default_generation': 'google/gemini-2.5-flash-preview-05-20',
            'task_decomposition': 'google/gemini-2.5-flash-preview-05-20'
          }
        },
        mcp: {
          tools: {
            'test-tool': {
              description: 'Test tool',
              use_cases: ['testing'],
              input_patterns: ['test']
            }
          }
        },
        taskManager: {
          maxConcurrentTasks: 10,
          defaultTaskTemplate: 'development',
          dataDirectory: '/test/data',
          performanceTargets: {
            maxResponseTime: 50,
            maxMemoryUsage: 500,
            minTestCoverage: 90
          },
          agentSettings: {
            maxAgents: 10,
            defaultAgent: 'default-agent',
            coordinationStrategy: 'capability_based',
            healthCheckInterval: 30
          },
          nlpSettings: {
            primaryMethod: 'hybrid',
            fallbackMethod: 'pattern',
            minConfidence: 0.7,
            maxProcessingTime: 50
          },
          timeouts: {
            taskExecution: 300000,
            taskDecomposition: 600000,
            taskRefinement: 180000,
            agentCommunication: 30000,
            llmRequest: 60000,
            fileOperations: 10000,
            databaseOperations: 15000,
            networkOperations: 20000
          },
          retryPolicy: {
            maxRetries: 3,
            backoffMultiplier: 2.0,
            initialDelayMs: 1000,
            maxDelayMs: 30000,
            enableExponentialBackoff: true
          }
        }
      };

      const result = validator.validateConfig(validConfig);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.normalizedConfig).toBeDefined();
    });

    it('should detect missing required fields', () => {
      const invalidConfig = {
        llm: {
          llm_mapping: {}
        }
        // Missing mcp and taskManager
      };

      const result = validator.validateConfig(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.path === 'mcp')).toBe(true);
      expect(result.errors.some(e => e.path === 'taskManager')).toBe(true);
    });

    it('should detect invalid types', () => {
      const invalidConfig = {
        llm: {
          llm_mapping: {
            'default_generation': 'test-model'
          }
        },
        mcp: {
          tools: {}
        },
        taskManager: {
          maxConcurrentTasks: 'invalid', // Should be number
          defaultTaskTemplate: 'development',
          dataDirectory: '/test/data',
          performanceTargets: {
            maxResponseTime: 'invalid', // Should be number
            maxMemoryUsage: 500,
            minTestCoverage: 90
          }
        }
      };

      const result = validator.validateConfig(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.path.includes('maxConcurrentTasks'))).toBe(true);
      expect(result.errors.some(e => e.path.includes('maxResponseTime'))).toBe(true);
    });

    it('should detect out-of-range values', () => {
      const invalidConfig = {
        llm: {
          llm_mapping: { 'default_generation': 'test-model' }
        },
        mcp: {
          tools: {}
        },
        taskManager: {
          maxConcurrentTasks: 200, // Above max
          defaultTaskTemplate: 'development',
          dataDirectory: '/test/data',
          performanceTargets: {
            maxResponseTime: 15000, // Above max
            maxMemoryUsage: 500,
            minTestCoverage: 150 // Above max
          }
        }
      };

      const result = validator.validateConfig(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid enum values', () => {
      const invalidConfig = {
        llm: {
          llm_mapping: { 'default_generation': 'test-model' }
        },
        mcp: {
          tools: {}
        },
        taskManager: {
          maxConcurrentTasks: 10,
          defaultTaskTemplate: 'invalid_template', // Invalid enum
          dataDirectory: '/test/data',
          agentSettings: {
            coordinationStrategy: 'invalid_strategy' // Invalid enum
          }
        }
      };

      const result = validator.validateConfig(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.path.includes('defaultTaskTemplate'))).toBe(true);
      expect(result.errors.some(e => e.path.includes('coordinationStrategy'))).toBe(true);
    });

    it('should generate default configuration', () => {
      const defaultConfig = validator.generateDefaultConfig();
      
      expect(defaultConfig).toBeDefined();
      expect(defaultConfig.taskManager).toBeDefined();
      expect(defaultConfig.taskManager.maxConcurrentTasks).toBe(10);
      expect(defaultConfig.taskManager.defaultTaskTemplate).toBe('development');
      expect(defaultConfig.taskManager.performanceTargets.maxResponseTime).toBe(50);
    });
  });

  describe('Configuration Schema Definition', () => {
    it('should have complete schema definition', () => {
      expect(CONFIG_SCHEMA.llm).toBeDefined();
      expect(CONFIG_SCHEMA.mcp).toBeDefined();
      expect(CONFIG_SCHEMA.taskManager).toBeDefined();
      
      expect(CONFIG_SCHEMA.taskManager.children).toBeDefined();
      expect(CONFIG_SCHEMA.taskManager.children!.maxConcurrentTasks).toBeDefined();
      expect(CONFIG_SCHEMA.taskManager.children!.performanceTargets).toBeDefined();
      expect(CONFIG_SCHEMA.taskManager.children!.agentSettings).toBeDefined();
      expect(CONFIG_SCHEMA.taskManager.children!.nlpSettings).toBeDefined();
      expect(CONFIG_SCHEMA.taskManager.children!.timeouts).toBeDefined();
      expect(CONFIG_SCHEMA.taskManager.children!.retryPolicy).toBeDefined();
    });

    it('should have proper validation rules', () => {
      const maxConcurrentTasks = CONFIG_SCHEMA.taskManager.children!.maxConcurrentTasks;
      expect(maxConcurrentTasks.type).toBe('number');
      expect(maxConcurrentTasks.required).toBe(true);
      expect(maxConcurrentTasks.min).toBe(1);
      expect(maxConcurrentTasks.max).toBe(100);
      expect(maxConcurrentTasks.default).toBe(10);

      const coordinationStrategy = CONFIG_SCHEMA.taskManager.children!.agentSettings.children!.coordinationStrategy;
      expect(coordinationStrategy.type).toBe('string');
      expect(coordinationStrategy.enum).toContain('capability_based');
      expect(coordinationStrategy.enum).toContain('round_robin');
    });
  });

  describe('Integration Tests', () => {
    it('should work together - environment validation and schema validation', async () => {
      // Set some environment variables
      process.env.VIBE_MAX_CONCURRENT_TASKS = '15';
      process.env.VIBE_MAX_RESPONSE_TIME = '30';
      
      // Validate environment
      const envValidator = EnvironmentValidator.getInstance();
      const envResult = await envValidator.validateEnvironment();
      expect(envResult.valid).toBe(true);
      
      // Create config using environment values
      const schemaValidator = ConfigSchemaValidator.getInstance();
      const defaultConfig = schemaValidator.generateDefaultConfig();
      
      // Override with environment values
      defaultConfig.taskManager.maxConcurrentTasks = getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MAX_CONCURRENT_TASKS);
      defaultConfig.taskManager.performanceTargets.maxResponseTime = getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MAX_RESPONSE_TIME);
      
      // Validate the final config
      const schemaResult = schemaValidator.validateConfig(defaultConfig);
      expect(schemaResult.valid).toBe(true);
      expect(schemaResult.normalizedConfig!.taskManager.maxConcurrentTasks).toBe(15);
      expect(schemaResult.normalizedConfig!.taskManager.performanceTargets.maxResponseTime).toBe(30);
    });
  });
});

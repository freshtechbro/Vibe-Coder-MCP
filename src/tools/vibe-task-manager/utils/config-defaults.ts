/**
 * Configuration Defaults and Environment Variable Mappings
 * Centralizes all default values and environment variable handling for Vibe Task Manager
 */

import { VibeTaskManagerConfig, PerformanceConfig } from './config-loader.js';
import { createErrorContext, ValidationError } from './enhanced-errors.js';
import logger from '../../../logger.js';

/**
 * Environment variable configuration mapping
 */
export interface EnvironmentVariableConfig {
  key: string;
  defaultValue: string | number | boolean;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
  validation?: (value: any) => boolean;
  transform?: (value: string) => any;
}

/**
 * All environment variables used by Vibe Task Manager
 */
export const ENVIRONMENT_VARIABLES: Record<string, EnvironmentVariableConfig> = {
  // Core configuration
  VIBE_CODER_OUTPUT_DIR: {
    key: 'VIBE_CODER_OUTPUT_DIR',
    defaultValue: 'VibeCoderOutput',
    type: 'string',
    required: false,
    description: 'Base output directory for all Vibe Coder tools'
  },
  
  VIBE_TASK_MANAGER_READ_DIR: {
    key: 'VIBE_TASK_MANAGER_READ_DIR',
    defaultValue: process.cwd(),
    type: 'string',
    required: false,
    description: 'Allowed read directory for task manager operations'
  },

  // Task Manager Settings
  VIBE_MAX_CONCURRENT_TASKS: {
    key: 'VIBE_MAX_CONCURRENT_TASKS',
    defaultValue: 10,
    type: 'number',
    required: false,
    description: 'Maximum number of concurrent tasks',
    validation: (value: number) => value >= 1 && value <= 100
  },

  VIBE_DEFAULT_TASK_TEMPLATE: {
    key: 'VIBE_DEFAULT_TASK_TEMPLATE',
    defaultValue: 'development',
    type: 'string',
    required: false,
    description: 'Default task template to use'
  },

  VIBE_TASK_MANAGER_ENABLE_ARTIFACT_PARSING: {
    key: 'VIBE_TASK_MANAGER_ENABLE_ARTIFACT_PARSING',
    defaultValue: true,
    type: 'boolean',
    required: false,
    description: 'Enable PRD and task list parsing capabilities',
    transform: (value: string) => value.toLowerCase() !== 'false'
  },

  // Performance Targets
  VIBE_MAX_RESPONSE_TIME: {
    key: 'VIBE_MAX_RESPONSE_TIME',
    defaultValue: 50,
    type: 'number',
    required: false,
    description: 'Maximum response time target in milliseconds',
    validation: (value: number) => value >= 10 && value <= 10000
  },

  VIBE_MAX_MEMORY_USAGE: {
    key: 'VIBE_MAX_MEMORY_USAGE',
    defaultValue: 500,
    type: 'number',
    required: false,
    description: 'Maximum memory usage in MB',
    validation: (value: number) => value >= 100 && value <= 8192
  },

  VIBE_MIN_TEST_COVERAGE: {
    key: 'VIBE_MIN_TEST_COVERAGE',
    defaultValue: 90,
    type: 'number',
    required: false,
    description: 'Minimum test coverage percentage',
    validation: (value: number) => value >= 0 && value <= 100
  },

  // Agent Settings
  VIBE_MAX_AGENTS: {
    key: 'VIBE_MAX_AGENTS',
    defaultValue: 10,
    type: 'number',
    required: false,
    description: 'Maximum number of agents',
    validation: (value: number) => value >= 1 && value <= 50
  },

  VIBE_DEFAULT_AGENT: {
    key: 'VIBE_DEFAULT_AGENT',
    defaultValue: 'default-agent',
    type: 'string',
    required: false,
    description: 'Default agent identifier'
  },

  VIBE_COORDINATION_STRATEGY: {
    key: 'VIBE_COORDINATION_STRATEGY',
    defaultValue: 'capability_based',
    type: 'string',
    required: false,
    description: 'Agent coordination strategy',
    validation: (value: string) => ['round_robin', 'least_loaded', 'capability_based', 'priority_based'].includes(value)
  },

  VIBE_HEALTH_CHECK_INTERVAL: {
    key: 'VIBE_HEALTH_CHECK_INTERVAL',
    defaultValue: 30,
    type: 'number',
    required: false,
    description: 'Health check interval in seconds',
    validation: (value: number) => value >= 5 && value <= 300
  },

  // NLP Settings
  VIBE_PRIMARY_NLP_METHOD: {
    key: 'VIBE_PRIMARY_NLP_METHOD',
    defaultValue: 'hybrid',
    type: 'string',
    required: false,
    description: 'Primary NLP processing method',
    validation: (value: string) => ['pattern', 'llm', 'hybrid'].includes(value)
  },

  VIBE_FALLBACK_NLP_METHOD: {
    key: 'VIBE_FALLBACK_NLP_METHOD',
    defaultValue: 'pattern',
    type: 'string',
    required: false,
    description: 'Fallback NLP processing method',
    validation: (value: string) => ['pattern', 'llm', 'none'].includes(value)
  },

  VIBE_MIN_CONFIDENCE: {
    key: 'VIBE_MIN_CONFIDENCE',
    defaultValue: 0.7,
    type: 'number',
    required: false,
    description: 'Minimum confidence threshold for NLP operations',
    validation: (value: number) => value >= 0 && value <= 1,
    transform: (value: string) => parseFloat(value)
  },

  VIBE_MAX_NLP_PROCESSING_TIME: {
    key: 'VIBE_MAX_NLP_PROCESSING_TIME',
    defaultValue: 50,
    type: 'number',
    required: false,
    description: 'Maximum NLP processing time in milliseconds',
    validation: (value: number) => value >= 10 && value <= 5000
  },

  // Timeout Settings
  VIBE_TASK_EXECUTION_TIMEOUT: {
    key: 'VIBE_TASK_EXECUTION_TIMEOUT',
    defaultValue: 300000,
    type: 'number',
    required: false,
    description: 'Task execution timeout in milliseconds',
    validation: (value: number) => value >= 1000 && value <= 3600000
  },

  VIBE_TASK_DECOMPOSITION_TIMEOUT: {
    key: 'VIBE_TASK_DECOMPOSITION_TIMEOUT',
    defaultValue: 900000, // Increased to 15 minutes for complex projects
    type: 'number',
    required: false,
    description: 'Task decomposition timeout in milliseconds',
    validation: (value: number) => value >= 1000 && value <= 3600000
  },

  VIBE_RECURSIVE_TASK_DECOMPOSITION_TIMEOUT: {
    key: 'VIBE_RECURSIVE_TASK_DECOMPOSITION_TIMEOUT',
    defaultValue: 720000, // 12 minutes (shorter than initial decomposition)
    type: 'number',
    required: false,
    description: 'Recursive task decomposition timeout in milliseconds',
    validation: (value: number) => value >= 1000 && value <= 3600000
  },

  VIBE_TASK_REFINEMENT_TIMEOUT: {
    key: 'VIBE_TASK_REFINEMENT_TIMEOUT',
    defaultValue: 180000,
    type: 'number',
    required: false,
    description: 'Task refinement timeout in milliseconds',
    validation: (value: number) => value >= 1000 && value <= 1800000
  },

  VIBE_AGENT_COMMUNICATION_TIMEOUT: {
    key: 'VIBE_AGENT_COMMUNICATION_TIMEOUT',
    defaultValue: 30000,
    type: 'number',
    required: false,
    description: 'Agent communication timeout in milliseconds',
    validation: (value: number) => value >= 1000 && value <= 300000
  },

  VIBE_LLM_REQUEST_TIMEOUT: {
    key: 'VIBE_LLM_REQUEST_TIMEOUT',
    defaultValue: 120000, // Increased to 2 minutes for complex decomposition
    type: 'number',
    required: false,
    description: 'LLM request timeout in milliseconds',
    validation: (value: number) => value >= 1000 && value <= 300000
  },

  VIBE_FILE_OPERATIONS_TIMEOUT: {
    key: 'VIBE_FILE_OPERATIONS_TIMEOUT',
    defaultValue: 10000,
    type: 'number',
    required: false,
    description: 'File operations timeout in milliseconds',
    validation: (value: number) => value >= 1000 && value <= 60000
  },

  VIBE_DATABASE_OPERATIONS_TIMEOUT: {
    key: 'VIBE_DATABASE_OPERATIONS_TIMEOUT',
    defaultValue: 15000,
    type: 'number',
    required: false,
    description: 'Database operations timeout in milliseconds',
    validation: (value: number) => value >= 1000 && value <= 120000
  },

  VIBE_NETWORK_OPERATIONS_TIMEOUT: {
    key: 'VIBE_NETWORK_OPERATIONS_TIMEOUT',
    defaultValue: 20000,
    type: 'number',
    required: false,
    description: 'Network operations timeout in milliseconds',
    validation: (value: number) => value >= 1000 && value <= 120000
  },

  // Retry Policy
  VIBE_MAX_RETRIES: {
    key: 'VIBE_MAX_RETRIES',
    defaultValue: 3,
    type: 'number',
    required: false,
    description: 'Maximum number of retry attempts',
    validation: (value: number) => value >= 0 && value <= 10
  },

  VIBE_BACKOFF_MULTIPLIER: {
    key: 'VIBE_BACKOFF_MULTIPLIER',
    defaultValue: 2.0,
    type: 'number',
    required: false,
    description: 'Exponential backoff multiplier',
    validation: (value: number) => value >= 1.0 && value <= 10.0,
    transform: (value: string) => parseFloat(value)
  },

  VIBE_INITIAL_DELAY_MS: {
    key: 'VIBE_INITIAL_DELAY_MS',
    defaultValue: 1000,
    type: 'number',
    required: false,
    description: 'Initial retry delay in milliseconds',
    validation: (value: number) => value >= 100 && value <= 10000
  },

  VIBE_MAX_DELAY_MS: {
    key: 'VIBE_MAX_DELAY_MS',
    defaultValue: 30000,
    type: 'number',
    required: false,
    description: 'Maximum retry delay in milliseconds',
    validation: (value: number) => value >= 1000 && value <= 300000
  },

  VIBE_ENABLE_EXPONENTIAL_BACKOFF: {
    key: 'VIBE_ENABLE_EXPONENTIAL_BACKOFF',
    defaultValue: true,
    type: 'boolean',
    required: false,
    description: 'Enable exponential backoff for retries',
    transform: (value: string) => value.toLowerCase() !== 'false'
  },

  // Security Settings
  VIBE_TASK_MANAGER_SECURITY_MODE: {
    key: 'VIBE_TASK_MANAGER_SECURITY_MODE',
    defaultValue: 'strict',
    type: 'string',
    required: false,
    description: 'Security mode for task manager',
    validation: (value: string) => ['strict', 'permissive'].includes(value)
  },

  // LLM Model Fallback
  VIBE_DEFAULT_LLM_MODEL: {
    key: 'VIBE_DEFAULT_LLM_MODEL',
    defaultValue: 'deepseek/deepseek-r1-0528-qwen3-8b:free',
    type: 'string',
    required: false,
    description: 'Default LLM model to use as fallback'
  }
};

/**
 * Default performance configuration
 */
export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  enableConfigCache: true,
  configCacheTTL: 300000, // 5 minutes
  lazyLoadServices: true,
  preloadCriticalServices: ['execution-coordinator', 'agent-orchestrator'],
  connectionPoolSize: 10,
  maxStartupTime: 50, // <50ms target
  asyncInitialization: true,
  batchConfigLoading: true
};

/**
 * Get environment variable value with validation and transformation
 */
export function getEnvironmentValue<T = any>(
  envVarConfig: EnvironmentVariableConfig,
  context?: string
): T {
  const { key, defaultValue, type, required, validation, transform } = envVarConfig;
  const rawValue = process.env[key];

  // Handle missing required variables
  if (required && !rawValue) {
    const errorContext = createErrorContext('ConfigDefaults', 'getEnvironmentValue')
      .metadata({ envVar: key, context })
      .build();
    
    throw new ValidationError(
      `Required environment variable ${key} is not set`,
      errorContext,
      {
        field: key,
        expectedFormat: `${type} value`,
        actualValue: rawValue
      }
    );
  }

  // Use default if not provided
  if (!rawValue) {
    return defaultValue as T;
  }

  // Transform the value
  let transformedValue: any = rawValue;
  
  if (transform) {
    try {
      transformedValue = transform(rawValue);
    } catch (error) {
      const errorContext = createErrorContext('ConfigDefaults', 'getEnvironmentValue')
        .metadata({ envVar: key, rawValue, context })
        .build();
      
      throw new ValidationError(
        `Failed to transform environment variable ${key}: ${error instanceof Error ? error.message : String(error)}`,
        errorContext,
        {
          field: key,
          expectedFormat: `Transformable ${type} value`,
          actualValue: rawValue
        }
      );
    }
  } else {
    // Default type conversion
    switch (type) {
      case 'number':
        transformedValue = parseInt(rawValue, 10);
        if (isNaN(transformedValue)) {
          const errorContext = createErrorContext('ConfigDefaults', 'getEnvironmentValue')
            .metadata({ envVar: key, rawValue, context })
            .build();
          
          throw new ValidationError(
            `Environment variable ${key} must be a valid number`,
            errorContext,
            {
              field: key,
              expectedFormat: 'Valid number',
              actualValue: rawValue
            }
          );
        }
        break;
      case 'boolean':
        transformedValue = rawValue.toLowerCase() === 'true';
        break;
      case 'string':
      default:
        transformedValue = rawValue;
        break;
    }
  }

  // Validate the transformed value
  if (validation && !validation(transformedValue)) {
    const errorContext = createErrorContext('ConfigDefaults', 'getEnvironmentValue')
      .metadata({ envVar: key, transformedValue, context })
      .build();
    
    throw new ValidationError(
      `Environment variable ${key} failed validation`,
      errorContext,
      {
        field: key,
        expectedFormat: envVarConfig.description,
        actualValue: transformedValue
      }
    );
  }

  return transformedValue as T;
}

/**
 * Validate all environment variables
 */
export function validateAllEnvironmentVariables(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [name, config] of Object.entries(ENVIRONMENT_VARIABLES)) {
    try {
      const rawValue = process.env[config.key];

      // Check if using default value
      if (!rawValue) {
        warnings.push(`Using default value for ${config.key}: ${config.defaultValue}`);
      }

      // Get the actual value (this will throw if invalid)
      const value = getEnvironmentValue(config, 'validation');

      // Additional validation if specified and we have a raw value
      if (rawValue && config.validation && value !== undefined) {
        const validationResult = config.validation(value);
        if (!validationResult) {
          errors.push(`${config.key} failed validation: ${value}`);
        }
      }
    } catch (error) {
      errors.push(`${config.key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get all environment variable documentation
 */
export function getEnvironmentVariableDocumentation(): Record<string, string> {
  const docs: Record<string, string> = {};
  
  for (const [name, config] of Object.entries(ENVIRONMENT_VARIABLES)) {
    docs[name] = `${config.description} (Type: ${config.type}, Required: ${config.required}, Default: ${config.defaultValue})`;
  }
  
  return docs;
}

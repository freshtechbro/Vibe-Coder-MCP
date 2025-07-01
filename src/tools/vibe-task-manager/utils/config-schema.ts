/**
 * Configuration Schema and Validation System
 * Provides comprehensive schema validation for Vibe Task Manager configuration
 */

import { VibeTaskManagerConfig } from './config-loader.js';
import { 
  ValidationError, 
  createErrorContext 
} from './enhanced-errors.js';

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
  warnings: SchemaValidationWarning[];
  normalizedConfig?: VibeTaskManagerConfig;
}

/**
 * Schema validation error
 */
export interface SchemaValidationError {
  path: string;
  message: string;
  expectedType: string;
  actualType: string;
  actualValue: unknown;
}

/**
 * Schema validation warning
 */
export interface SchemaValidationWarning {
  path: string;
  message: string;
  suggestion: string;
}

/**
 * Schema field definition
 */
export interface SchemaField {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  enum?: unknown[];
  pattern?: RegExp;
  description: string;
  validation?: (value: unknown) => boolean;
  transform?: (value: unknown) => unknown;
  children?: Record<string, SchemaField>;
}

/**
 * Complete configuration schema
 */
export const CONFIG_SCHEMA: Record<string, SchemaField> = {
  llm: {
    type: 'object',
    required: true,
    description: 'LLM configuration with model mappings',
    children: {
      llm_mapping: {
        type: 'object',
        required: true,
        description: 'Mapping of operations to LLM models',
        validation: (value: unknown) => {
          return typeof value === 'object' && 
                 value !== null && 
                 Object.keys(value).length > 0;
        }
      }
    }
  },
  
  mcp: {
    type: 'object',
    required: true,
    description: 'MCP tool configuration',
    children: {
      tools: {
        type: 'object',
        required: true,
        description: 'MCP tool definitions',
        validation: (value: unknown) => {
          return typeof value === 'object' && value !== null;
        }
      }
    }
  },

  taskManager: {
    type: 'object',
    required: true,
    description: 'Task manager specific configuration',
    children: {
      maxConcurrentTasks: {
        type: 'number',
        required: true,
        min: 1,
        max: 100,
        default: 10,
        description: 'Maximum number of concurrent tasks'
      },
      
      defaultTaskTemplate: {
        type: 'string',
        required: true,
        enum: ['development', 'testing', 'documentation', 'research', 'deployment'],
        default: 'development',
        description: 'Default task template to use'
      },

      dataDirectory: {
        type: 'string',
        required: true,
        description: 'Data directory for task manager files',
        validation: (value: unknown) => typeof value === 'string' && value.length > 0
      },

      artifactParsing: {
        type: 'object',
        required: false,
        description: 'Artifact parsing configuration for PRD and task list integration',
        children: {
          enabled: {
            type: 'boolean',
            required: false,
            default: true,
            description: 'Enable PRD and task list parsing capabilities'
          },
          maxFileSize: {
            type: 'number',
            required: false,
            min: 1024,
            max: 10485760, // 10MB
            default: 5242880, // 5MB
            description: 'Maximum artifact file size in bytes'
          },
          cacheEnabled: {
            type: 'boolean',
            required: false,
            default: true,
            description: 'Enable caching of parsed artifacts'
          },
          cacheTTL: {
            type: 'number',
            required: false,
            min: 60000, // 1 minute
            max: 86400000, // 24 hours
            default: 3600000, // 1 hour
            description: 'Cache time-to-live in milliseconds'
          },
          maxCacheSize: {
            type: 'number',
            required: false,
            min: 10,
            max: 1000,
            default: 100,
            description: 'Maximum number of cached artifacts'
          }
        }
      },

      performanceTargets: {
        type: 'object',
        required: true,
        description: 'Performance targets and thresholds',
        children: {
          maxResponseTime: {
            type: 'number',
            required: true,
            min: 10,
            max: 10000,
            default: 50,
            description: 'Maximum response time in milliseconds'
          },
          maxMemoryUsage: {
            type: 'number',
            required: true,
            min: 100,
            max: 8192,
            default: 500,
            description: 'Maximum memory usage in MB'
          },
          minTestCoverage: {
            type: 'number',
            required: true,
            min: 0,
            max: 100,
            default: 90,
            description: 'Minimum test coverage percentage'
          }
        }
      },

      agentSettings: {
        type: 'object',
        required: true,
        description: 'Agent configuration settings',
        children: {
          maxAgents: {
            type: 'number',
            required: true,
            min: 1,
            max: 50,
            default: 10,
            description: 'Maximum number of agents'
          },
          defaultAgent: {
            type: 'string',
            required: true,
            default: 'default-agent',
            description: 'Default agent identifier'
          },
          coordinationStrategy: {
            type: 'string',
            required: true,
            enum: ['round_robin', 'least_loaded', 'capability_based', 'priority_based'],
            default: 'capability_based',
            description: 'Agent coordination strategy'
          },
          healthCheckInterval: {
            type: 'number',
            required: true,
            min: 5,
            max: 300,
            default: 30,
            description: 'Health check interval in seconds'
          }
        }
      },

      nlpSettings: {
        type: 'object',
        required: true,
        description: 'NLP processing settings',
        children: {
          primaryMethod: {
            type: 'string',
            required: true,
            enum: ['pattern', 'llm', 'hybrid'],
            default: 'hybrid',
            description: 'Primary NLP processing method'
          },
          fallbackMethod: {
            type: 'string',
            required: true,
            enum: ['pattern', 'llm', 'none'],
            default: 'pattern',
            description: 'Fallback NLP processing method'
          },
          minConfidence: {
            type: 'number',
            required: true,
            min: 0,
            max: 1,
            default: 0.7,
            description: 'Minimum confidence threshold'
          },
          maxProcessingTime: {
            type: 'number',
            required: true,
            min: 10,
            max: 5000,
            default: 50,
            description: 'Maximum processing time in milliseconds'
          }
        }
      },

      timeouts: {
        type: 'object',
        required: true,
        description: 'Timeout configuration for various operations',
        children: {
          taskExecution: {
            type: 'number',
            required: true,
            min: 1000,
            max: 3600000,
            default: 300000,
            description: 'Task execution timeout in milliseconds'
          },
          taskDecomposition: {
            type: 'number',
            required: true,
            min: 1000,
            max: 3600000,
            default: 600000,
            description: 'Task decomposition timeout in milliseconds'
          },
          recursiveTaskDecomposition: {
            type: 'number',
            required: true,
            min: 1000,
            max: 3600000,
            default: 720000,
            description: 'Recursive task decomposition timeout in milliseconds'
          },
          taskRefinement: {
            type: 'number',
            required: true,
            min: 1000,
            max: 1800000,
            default: 180000,
            description: 'Task refinement timeout in milliseconds'
          },
          agentCommunication: {
            type: 'number',
            required: true,
            min: 1000,
            max: 300000,
            default: 30000,
            description: 'Agent communication timeout in milliseconds'
          },
          llmRequest: {
            type: 'number',
            required: true,
            min: 1000,
            max: 300000,
            default: 60000,
            description: 'LLM request timeout in milliseconds'
          },
          fileOperations: {
            type: 'number',
            required: true,
            min: 1000,
            max: 60000,
            default: 10000,
            description: 'File operations timeout in milliseconds'
          },
          databaseOperations: {
            type: 'number',
            required: true,
            min: 1000,
            max: 120000,
            default: 15000,
            description: 'Database operations timeout in milliseconds'
          },
          networkOperations: {
            type: 'number',
            required: true,
            min: 1000,
            max: 120000,
            default: 20000,
            description: 'Network operations timeout in milliseconds'
          }
        }
      },

      retryPolicy: {
        type: 'object',
        required: true,
        description: 'Retry policy configuration',
        children: {
          maxRetries: {
            type: 'number',
            required: true,
            min: 0,
            max: 10,
            default: 3,
            description: 'Maximum number of retry attempts'
          },
          backoffMultiplier: {
            type: 'number',
            required: true,
            min: 1.0,
            max: 10.0,
            default: 2.0,
            description: 'Exponential backoff multiplier'
          },
          initialDelayMs: {
            type: 'number',
            required: true,
            min: 100,
            max: 10000,
            default: 1000,
            description: 'Initial retry delay in milliseconds'
          },
          maxDelayMs: {
            type: 'number',
            required: true,
            min: 1000,
            max: 300000,
            default: 30000,
            description: 'Maximum retry delay in milliseconds'
          },
          enableExponentialBackoff: {
            type: 'boolean',
            required: true,
            default: true,
            description: 'Enable exponential backoff for retries'
          }
        }
      }
    }
  }
};

/**
 * Configuration Schema Validator
 */
export class ConfigSchemaValidator {
  private static instance: ConfigSchemaValidator;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): ConfigSchemaValidator {
    if (!ConfigSchemaValidator.instance) {
      ConfigSchemaValidator.instance = new ConfigSchemaValidator();
    }
    return ConfigSchemaValidator.instance;
  }

  /**
   * Validate configuration against schema
   */
  validateConfig(config: unknown): SchemaValidationResult {
    const context = createErrorContext('ConfigSchemaValidator', 'validateConfig')
      .metadata({ configKeys: Object.keys(config || {}) })
      .build();

    try {
      const errors: SchemaValidationError[] = [];
      const warnings: SchemaValidationWarning[] = [];
      const normalizedConfig = this.normalizeConfig(config, CONFIG_SCHEMA, '', errors, warnings);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        normalizedConfig: errors.length === 0 ? normalizedConfig as unknown as VibeTaskManagerConfig : undefined
      };

    } catch (error) {
      throw new ValidationError(
        `Configuration schema validation failed: ${error instanceof Error ? error.message : String(error)}`,
        context,
        {
          cause: error instanceof Error ? error : undefined
        }
      );
    }
  }

  /**
   * Normalize configuration with defaults and transformations
   */
  private normalizeConfig(
    config: unknown,
    schema: Record<string, SchemaField>,
    path: string,
    errors: SchemaValidationError[],
    warnings: SchemaValidationWarning[]
  ): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};

    // Process each field in the schema
    for (const [key, field] of Object.entries(schema)) {
      const currentPath = path ? `${path}.${key}` : key;
      const value = (config as Record<string, unknown>)?.[key];

      // Check if required field is missing
      if (field.required && (value === undefined || value === null)) {
        if (field.default !== undefined) {
          normalized[key] = field.default;
          warnings.push({
            path: currentPath,
            message: `Using default value for required field`,
            suggestion: `Consider setting ${currentPath} explicitly`
          });
        } else {
          errors.push({
            path: currentPath,
            message: `Required field is missing`,
            expectedType: field.type,
            actualType: typeof value,
            actualValue: value
          });
          continue;
        }
      } else if (value === undefined || value === null) {
        // Optional field with default
        if (field.default !== undefined) {
          normalized[key] = field.default;
        }
        continue;
      } else {
        // Validate the field
        const validationResult = this.validateField(value, field, currentPath);
        if (validationResult.valid) {
          normalized[key] = validationResult.normalizedValue;
        } else {
          errors.push(...validationResult.errors);
        }
      }
    }

    return normalized;
  }

  /**
   * Validate individual field
   */
  private validateField(value: unknown, field: SchemaField, path: string): {
    valid: boolean;
    normalizedValue?: unknown;
    errors: SchemaValidationError[];
  } {
    const errors: SchemaValidationError[] = [];
    let normalizedValue = value;

    // Type validation
    if (!this.validateType(value, field.type)) {
      errors.push({
        path,
        message: `Invalid type`,
        expectedType: field.type,
        actualType: typeof value,
        actualValue: value
      });
      return { valid: false, errors };
    }

    // Transform value if transformer exists
    if (field.transform) {
      try {
        normalizedValue = field.transform(value);
      } catch (error) {
        errors.push({
          path,
          message: `Transformation failed: ${error instanceof Error ? error.message : String(error)}`,
          expectedType: field.type,
          actualType: typeof value,
          actualValue: value
        });
        return { valid: false, errors };
      }
    }

    // Range validation for numbers
    if (field.type === 'number' && typeof normalizedValue === 'number') {
      if (field.min !== undefined && normalizedValue < field.min) {
        errors.push({
          path,
          message: `Value ${normalizedValue} is below minimum ${field.min}`,
          expectedType: `number >= ${field.min}`,
          actualType: 'number',
          actualValue: normalizedValue
        });
      }
      if (field.max !== undefined && normalizedValue > field.max) {
        errors.push({
          path,
          message: `Value ${normalizedValue} is above maximum ${field.max}`,
          expectedType: `number <= ${field.max}`,
          actualType: 'number',
          actualValue: normalizedValue
        });
      }
    }

    // Enum validation
    if (field.enum && !field.enum.includes(normalizedValue)) {
      errors.push({
        path,
        message: `Value must be one of: ${field.enum.join(', ')}`,
        expectedType: `enum: ${field.enum.join(' | ')}`,
        actualType: typeof normalizedValue,
        actualValue: normalizedValue
      });
    }

    // Pattern validation for strings
    if (field.type === 'string' && field.pattern && typeof normalizedValue === 'string' && !field.pattern.test(normalizedValue)) {
      errors.push({
        path,
        message: `Value does not match required pattern`,
        expectedType: `string matching ${field.pattern.toString()}`,
        actualType: 'string',
        actualValue: normalizedValue
      });
    }

    // Custom validation
    if (field.validation && !field.validation(normalizedValue)) {
      errors.push({
        path,
        message: `Custom validation failed`,
        expectedType: field.type,
        actualType: typeof normalizedValue,
        actualValue: normalizedValue
      });
    }

    // Recursive validation for objects
    if (field.type === 'object' && field.children) {
      const childErrors: SchemaValidationError[] = [];
      const childWarnings: SchemaValidationWarning[] = [];
      normalizedValue = this.normalizeConfig(normalizedValue, field.children, path, childErrors, childWarnings);
      errors.push(...childErrors);
    }

    return {
      valid: errors.length === 0,
      normalizedValue,
      errors
    };
  }

  /**
   * Validate type
   */
  private validateType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      default:
        return false;
    }
  }

  /**
   * Generate default configuration
   */
  generateDefaultConfig(): VibeTaskManagerConfig {
    const defaultConfig = this.extractDefaults(CONFIG_SCHEMA);
    return defaultConfig as unknown as VibeTaskManagerConfig;
  }

  /**
   * Extract default values from schema
   */
  private extractDefaults(schema: Record<string, SchemaField>): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};

    for (const [key, field] of Object.entries(schema)) {
      if (field.default !== undefined) {
        defaults[key] = field.default;
      } else if (field.children) {
        defaults[key] = this.extractDefaults(field.children);
      }
    }

    return defaults;
  }
}

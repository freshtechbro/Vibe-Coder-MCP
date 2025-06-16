/**
 * Configuration Validator - Comprehensive validation for all Vibe Task Manager configurations
 * Validates environment variables, configuration files, and runtime settings
 */

import { VibeTaskManagerConfig, VibeTaskManagerSecurityConfig, PerformanceConfig } from './config-loader.js';
import logger from '../../../logger.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  validatedConfig?: VibeTaskManagerConfig;
}

/**
 * Environment variable validation result
 */
export interface EnvironmentValidationResult {
  isValid: boolean;
  missing: string[];
  invalid: string[];
  warnings: string[];
}

/**
 * Configuration validation rules
 */
export interface ValidationRules {
  required: string[];
  optional: string[];
  ranges: Record<string, { min: number; max: number }>;
  patterns: Record<string, RegExp>;
  dependencies: Record<string, string[]>;
}

/**
 * Comprehensive configuration validator
 */
export class ConfigValidator {
  private static instance: ConfigValidator;

  private constructor() {}

  static getInstance(): ConfigValidator {
    if (!ConfigValidator.instance) {
      ConfigValidator.instance = new ConfigValidator();
    }
    return ConfigValidator.instance;
  }

  /**
   * Validate complete Vibe Task Manager configuration
   */
  async validateConfig(config: VibeTaskManagerConfig): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    try {
      logger.debug('Starting comprehensive configuration validation');

      // Validate LLM configuration
      const llmValidation = this.validateLLMConfig(config.llm);
      errors.push(...llmValidation.errors);
      warnings.push(...llmValidation.warnings);

      // Validate MCP configuration
      const mcpValidation = this.validateMCPConfig(config.mcp);
      errors.push(...mcpValidation.errors);
      warnings.push(...mcpValidation.warnings);

      // Validate Task Manager configuration
      const taskManagerValidation = this.validateTaskManagerConfig(config.taskManager);
      errors.push(...taskManagerValidation.errors);
      warnings.push(...taskManagerValidation.warnings);
      suggestions.push(...taskManagerValidation.suggestions);

      // Validate performance configuration
      const performanceValidation = this.validatePerformanceConfig(config.taskManager.performance);
      errors.push(...performanceValidation.errors);
      warnings.push(...performanceValidation.warnings);

      // Cross-configuration validation
      const crossValidation = this.validateCrossConfigDependencies(config);
      errors.push(...crossValidation.errors);
      warnings.push(...crossValidation.warnings);

      const isValid = errors.length === 0;

      if (isValid) {
        logger.info('Configuration validation completed successfully');
      } else {
        logger.warn({ errors, warnings }, 'Configuration validation found issues');
      }

      return {
        isValid,
        errors,
        warnings,
        suggestions,
        validatedConfig: isValid ? config : undefined
      };

    } catch (error) {
      logger.error({ error }, 'Configuration validation failed');
      return {
        isValid: false,
        errors: [`Configuration validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings,
        suggestions
      };
    }
  }

  /**
   * Validate environment variables
   */
  validateEnvironmentVariables(): EnvironmentValidationResult {
    const required = [
      'OPENROUTER_API_KEY',
      'VIBE_CODER_OUTPUT_DIR'
    ];

    const optional = [
      'VIBE_TASK_MANAGER_READ_DIR',
      'VIBE_TASK_MANAGER_SECURITY_MODE',
      'VIBE_SECURITY_ENABLED',
      'VIBE_SECURITY_STRICT_MODE',
      'VIBE_SECURITY_PERFORMANCE_THRESHOLD',
      'NODE_ENV'
    ];

    const missing: string[] = [];
    const invalid: string[] = [];
    const warnings: string[] = [];

    // Check required environment variables
    for (const envVar of required) {
      if (!process.env[envVar]) {
        missing.push(envVar);
      }
    }

    // Validate specific environment variable formats
    if (process.env.VIBE_SECURITY_PERFORMANCE_THRESHOLD) {
      const threshold = parseInt(process.env.VIBE_SECURITY_PERFORMANCE_THRESHOLD, 10);
      if (isNaN(threshold) || threshold < 10 || threshold > 10000) {
        invalid.push('VIBE_SECURITY_PERFORMANCE_THRESHOLD must be a number between 10 and 10000');
      }
    }

    if (process.env.VIBE_TASK_MANAGER_SECURITY_MODE) {
      const mode = process.env.VIBE_TASK_MANAGER_SECURITY_MODE;
      if (!['strict', 'permissive'].includes(mode)) {
        invalid.push('VIBE_TASK_MANAGER_SECURITY_MODE must be either "strict" or "permissive"');
      }
    }

    // Check for deprecated environment variables
    const deprecated = [
      'VIBE_TASK_MANAGER_CONFIG_PATH',
      'VIBE_LEGACY_MODE'
    ];

    for (const envVar of deprecated) {
      if (process.env[envVar]) {
        warnings.push(`Environment variable ${envVar} is deprecated and will be ignored`);
      }
    }

    const isValid = missing.length === 0 && invalid.length === 0;

    return {
      isValid,
      missing,
      invalid,
      warnings
    };
  }

  /**
   * Validate security configuration
   */
  async validateSecurityConfig(config: VibeTaskManagerSecurityConfig): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    try {
      // Validate directory paths exist and are accessible
      try {
        await fs.access(config.allowedReadDirectory, fs.constants.R_OK);
      } catch (error) {
        errors.push(`Read directory not accessible: ${config.allowedReadDirectory}`);
      }

      try {
        await fs.access(config.allowedWriteDirectory, fs.constants.W_OK);
      } catch (error) {
        // Try to create the directory if it doesn't exist
        try {
          await fs.mkdir(config.allowedWriteDirectory, { recursive: true });
          suggestions.push(`Created write directory: ${config.allowedWriteDirectory}`);
        } catch (createError) {
          errors.push(`Write directory not accessible and cannot be created: ${config.allowedWriteDirectory}`);
        }
      }

      // Validate security mode
      if (!['strict', 'permissive'].includes(config.securityMode)) {
        errors.push(`Invalid security mode: ${config.securityMode}. Must be 'strict' or 'permissive'`);
      }

      // Security recommendations
      if (config.securityMode === 'permissive') {
        warnings.push('Security mode is set to permissive. Consider using strict mode for production');
      }

      // Check for potential security issues
      if (config.allowedReadDirectory === '/' || config.allowedWriteDirectory === '/') {
        errors.push('Root directory access is not allowed for security reasons');
      }

      if (config.allowedReadDirectory.includes('..') || config.allowedWriteDirectory.includes('..')) {
        errors.push('Directory paths cannot contain ".." for security reasons');
      }

    } catch (error) {
      errors.push(`Security configuration validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Validate LLM configuration
   */
  private validateLLMConfig(config: any): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config) {
      errors.push('LLM configuration is required');
      return { errors, warnings };
    }

    if (!config.apiKey) {
      errors.push('LLM API key is required');
    }

    if (!config.baseURL) {
      warnings.push('LLM base URL not specified, using default');
    }

    if (config.timeout && (config.timeout < 1000 || config.timeout > 300000)) {
      warnings.push('LLM timeout should be between 1 second and 5 minutes');
    }

    return { errors, warnings };
  }

  /**
   * Validate MCP configuration
   */
  private validateMCPConfig(config: any): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config) {
      errors.push('MCP configuration is required');
      return { errors, warnings };
    }

    if (config.transport && !['stdio', 'sse', 'websocket', 'http'].includes(config.transport)) {
      errors.push(`Invalid MCP transport: ${config.transport}`);
    }

    return { errors, warnings };
  }

  /**
   * Validate Task Manager configuration
   */
  private validateTaskManagerConfig(config: any): { errors: string[]; warnings: string[]; suggestions: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!config) {
      errors.push('Task Manager configuration is required');
      return { errors, warnings, suggestions };
    }

    // Validate numeric ranges
    if (config.maxConcurrentTasks && (config.maxConcurrentTasks < 1 || config.maxConcurrentTasks > 100)) {
      errors.push('maxConcurrentTasks must be between 1 and 100');
    }

    if (config.performanceTargets?.maxResponseTime && config.performanceTargets.maxResponseTime > 1000) {
      warnings.push('Response time target above 1 second may impact user experience');
    }

    if (config.agentSettings?.maxAgents && config.agentSettings.maxAgents > 50) {
      warnings.push('High number of agents may impact performance');
    }

    // Validate coordination strategy
    const validStrategies = ['round_robin', 'least_loaded', 'capability_based', 'priority_based'];
    if (config.agentSettings?.coordinationStrategy && !validStrategies.includes(config.agentSettings.coordinationStrategy)) {
      errors.push(`Invalid coordination strategy: ${config.agentSettings.coordinationStrategy}`);
    }

    return { errors, warnings, suggestions };
  }

  /**
   * Validate performance configuration
   */
  private validatePerformanceConfig(config: any): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config) {
      warnings.push('Performance configuration not specified, using defaults');
      return { errors, warnings };
    }

    // Validate memory management
    if (config.memoryManagement?.maxMemoryPercentage && 
        (config.memoryManagement.maxMemoryPercentage < 10 || config.memoryManagement.maxMemoryPercentage > 90)) {
      errors.push('Memory percentage must be between 10% and 90%');
    }

    // Validate caching configuration
    if (config.caching?.maxCacheSize && config.caching.maxCacheSize < 1024 * 1024) {
      warnings.push('Cache size below 1MB may not be effective');
    }

    return { errors, warnings };
  }

  /**
   * Validate cross-configuration dependencies
   */
  private validateCrossConfigDependencies(config: VibeTaskManagerConfig): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if performance targets are realistic given other settings
    const maxConcurrent = config.taskManager.maxConcurrentTasks;
    const responseTarget = config.taskManager.performanceTargets.maxResponseTime;

    if (maxConcurrent > 10 && responseTarget < 100) {
      warnings.push('High concurrency with low response time target may be difficult to achieve');
    }

    // Check agent settings consistency
    const maxAgents = config.taskManager.agentSettings.maxAgents;
    if (maxAgents > maxConcurrent * 2) {
      warnings.push('Number of agents significantly exceeds concurrent tasks, may waste resources');
    }

    return { errors, warnings };
  }
}

/**
 * Environment Variable Validation System
 * Provides comprehensive validation, documentation, and health checks for environment variables
 */

import { 
  ENVIRONMENT_VARIABLES, 
  getEnvironmentValue, 
  validateAllEnvironmentVariables,
  getEnvironmentVariableDocumentation 
} from './config-defaults.js';
import { 
  ValidationError, 
  ConfigurationError, 
  createErrorContext 
} from './enhanced-errors.js';
import logger from '../../../logger.js';
import path from 'path';
import { existsSync } from 'fs';

/**
 * Environment validation result
 */
export interface EnvironmentValidationResult {
  valid: boolean;
  errors: EnvironmentValidationError[];
  warnings: EnvironmentValidationWarning[];
  recommendations: EnvironmentRecommendation[];
  summary: {
    totalVariables: number;
    validVariables: number;
    invalidVariables: number;
    missingRequired: number;
    usingDefaults: number;
  };
}

/**
 * Environment validation error
 */
export interface EnvironmentValidationError {
  variable: string;
  error: string;
  severity: 'critical' | 'high' | 'medium';
  suggestion: string;
}

/**
 * Environment validation warning
 */
export interface EnvironmentValidationWarning {
  variable: string;
  warning: string;
  currentValue: any;
  defaultValue: any;
  impact: string;
}

/**
 * Environment recommendation
 */
export interface EnvironmentRecommendation {
  category: 'performance' | 'security' | 'reliability' | 'development';
  recommendation: string;
  variables: string[];
  priority: 'high' | 'medium' | 'low';
}

/**
 * Environment health check result
 */
export interface EnvironmentHealthCheck {
  healthy: boolean;
  score: number; // 0-100
  issues: EnvironmentIssue[];
  performance: {
    configLoadTime: number;
    memoryUsage: number;
    diskSpace: number;
  };
}

/**
 * Environment issue
 */
export interface EnvironmentIssue {
  type: 'error' | 'warning' | 'info';
  category: 'configuration' | 'performance' | 'security' | 'resources';
  message: string;
  variable?: string;
  impact: 'high' | 'medium' | 'low';
  resolution: string;
}

/**
 * Environment Variable Validator
 */
export class EnvironmentValidator {
  private static instance: EnvironmentValidator;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): EnvironmentValidator {
    if (!EnvironmentValidator.instance) {
      EnvironmentValidator.instance = new EnvironmentValidator();
    }
    return EnvironmentValidator.instance;
  }

  /**
   * Validate all environment variables with detailed analysis
   */
  async validateEnvironment(): Promise<EnvironmentValidationResult> {
    const context = createErrorContext('EnvironmentValidator', 'validateEnvironment')
      .metadata({ totalVariables: Object.keys(ENVIRONMENT_VARIABLES).length })
      .build();

    try {
      const errors: EnvironmentValidationError[] = [];
      const warnings: EnvironmentValidationWarning[] = [];
      const recommendations: EnvironmentRecommendation[] = [];

      let validVariables = 0;
      let invalidVariables = 0;
      let missingRequired = 0;
      let usingDefaults = 0;

      // Validate each environment variable
      for (const [name, config] of Object.entries(ENVIRONMENT_VARIABLES)) {
        try {
          const value = getEnvironmentValue(config, 'validation');
          const rawValue = process.env[config.key];

          if (!rawValue) {
            usingDefaults++;
            if (config.required) {
              missingRequired++;
              errors.push({
                variable: name,
                error: `Required environment variable ${config.key} is not set`,
                severity: 'critical',
                suggestion: `Set ${config.key}=${config.defaultValue} in your environment`
              });
              invalidVariables++;
            } else {
              warnings.push({
                variable: name,
                warning: `Using default value for ${config.key}`,
                currentValue: value,
                defaultValue: config.defaultValue,
                impact: 'May not be optimized for your environment'
              });
              validVariables++;
            }
          } else {
            validVariables++;
          }

          // Additional validation checks
          await this.performAdditionalValidation(name, config, value, errors, warnings);

        } catch (error) {
          invalidVariables++;
          errors.push({
            variable: name,
            error: error instanceof Error ? error.message : String(error),
            severity: config.required ? 'critical' : 'medium',
            suggestion: `Check the format and value of ${config.key}`
          });
        }
      }

      // Generate recommendations
      recommendations.push(...this.generateRecommendations());

      const totalVariables = Object.keys(ENVIRONMENT_VARIABLES).length;

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        recommendations,
        summary: {
          totalVariables,
          validVariables,
          invalidVariables,
          missingRequired,
          usingDefaults
        }
      };

    } catch (error) {
      throw new ValidationError(
        `Environment validation failed: ${error instanceof Error ? error.message : String(error)}`,
        context,
        {
          cause: error instanceof Error ? error : undefined
        }
      );
    }
  }

  /**
   * Perform additional validation checks
   */
  private async performAdditionalValidation(
    name: string,
    config: any,
    value: any,
    errors: EnvironmentValidationError[],
    warnings: EnvironmentValidationWarning[]
  ): Promise<void> {
    // Directory existence checks
    if (name.includes('DIR') || name.includes('PATH')) {
      if (typeof value === 'string' && !existsSync(value)) {
        warnings.push({
          variable: name,
          warning: `Directory/path does not exist: ${value}`,
          currentValue: value,
          defaultValue: config.defaultValue,
          impact: 'May cause runtime errors when accessing files'
        });
      }
    }

    // Performance-related checks
    if (name.includes('TIMEOUT') && typeof value === 'number') {
      if (value < 1000) {
        warnings.push({
          variable: name,
          warning: `Timeout value ${value}ms may be too low`,
          currentValue: value,
          defaultValue: config.defaultValue,
          impact: 'May cause premature timeouts'
        });
      } else if (value > 600000) { // 10 minutes
        warnings.push({
          variable: name,
          warning: `Timeout value ${value}ms may be too high`,
          currentValue: value,
          defaultValue: config.defaultValue,
          impact: 'May cause long waits for failed operations'
        });
      }
    }

    // Memory usage checks
    if (name.includes('MEMORY') && typeof value === 'number') {
      if (value > 2048) { // 2GB
        warnings.push({
          variable: name,
          warning: `Memory limit ${value}MB is very high`,
          currentValue: value,
          defaultValue: config.defaultValue,
          impact: 'May consume excessive system resources'
        });
      }
    }

    // Concurrency checks
    if (name.includes('CONCURRENT') || name.includes('MAX_AGENTS')) {
      if (typeof value === 'number' && value > 20) {
        warnings.push({
          variable: name,
          warning: `High concurrency value ${value} may overwhelm system`,
          currentValue: value,
          defaultValue: config.defaultValue,
          impact: 'May cause resource contention and performance issues'
        });
      }
    }
  }

  /**
   * Generate environment recommendations
   */
  private generateRecommendations(): EnvironmentRecommendation[] {
    const recommendations: EnvironmentRecommendation[] = [];

    // Performance recommendations
    recommendations.push({
      category: 'performance',
      recommendation: 'Consider setting VIBE_MAX_RESPONSE_TIME to 30ms for better performance',
      variables: ['VIBE_MAX_RESPONSE_TIME'],
      priority: 'medium'
    });

    // Security recommendations
    recommendations.push({
      category: 'security',
      recommendation: 'Use strict security mode in production environments',
      variables: ['VIBE_TASK_MANAGER_SECURITY_MODE'],
      priority: 'high'
    });

    // Development recommendations
    recommendations.push({
      category: 'development',
      recommendation: 'Set up dedicated output directory for better organization',
      variables: ['VIBE_CODER_OUTPUT_DIR'],
      priority: 'medium'
    });

    return recommendations;
  }

  /**
   * Perform comprehensive environment health check
   */
  async performHealthCheck(): Promise<EnvironmentHealthCheck> {
    const startTime = performance.now();
    const issues: EnvironmentIssue[] = [];
    let score = 100;

    try {
      // Validate environment variables
      const validation = await this.validateEnvironment();
      
      // Deduct score for errors and warnings
      score -= validation.errors.length * 20;
      score -= validation.warnings.length * 5;

      // Add issues from validation
      validation.errors.forEach(error => {
        issues.push({
          type: 'error',
          category: 'configuration',
          message: error.error,
          variable: error.variable,
          impact: error.severity === 'critical' ? 'high' : 'medium',
          resolution: error.suggestion
        });
      });

      validation.warnings.forEach(warning => {
        issues.push({
          type: 'warning',
          category: 'configuration',
          message: warning.warning,
          variable: warning.variable,
          impact: 'low',
          resolution: `Consider setting ${warning.variable} explicitly`
        });
      });

      // Check system resources
      const memoryUsage = process.memoryUsage();
      if (memoryUsage.heapUsed > 100 * 1024 * 1024) { // 100MB
        issues.push({
          type: 'warning',
          category: 'performance',
          message: `High memory usage: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          impact: 'medium',
          resolution: 'Monitor memory usage and consider optimization'
        });
        score -= 10;
      }

      // Check configuration load time
      const configLoadTime = performance.now() - startTime;
      if (configLoadTime > 50) {
        issues.push({
          type: 'warning',
          category: 'performance',
          message: `Slow configuration loading: ${configLoadTime.toFixed(2)}ms`,
          impact: 'medium',
          resolution: 'Enable configuration caching or optimize environment setup'
        });
        score -= 5;
      }

      // Ensure score doesn't go below 0
      score = Math.max(0, score);

      return {
        healthy: score >= 80,
        score,
        issues,
        performance: {
          configLoadTime,
          memoryUsage: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          diskSpace: 0 // Would need additional implementation for disk space check
        }
      };

    } catch (error) {
      issues.push({
        type: 'error',
        category: 'configuration',
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        impact: 'high',
        resolution: 'Check environment configuration and system resources'
      });

      return {
        healthy: false,
        score: 0,
        issues,
        performance: {
          configLoadTime: performance.now() - startTime,
          memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          diskSpace: 0
        }
      };
    }
  }

  /**
   * Generate environment variable documentation
   */
  generateDocumentation(): string {
    const docs = getEnvironmentVariableDocumentation();
    let documentation = '# Vibe Task Manager Environment Variables\n\n';
    
    documentation += 'This document describes all environment variables used by the Vibe Task Manager.\n\n';
    
    // Group by category
    const categories = {
      'Core Configuration': ['VIBE_CODER_OUTPUT_DIR', 'VIBE_TASK_MANAGER_READ_DIR'],
      'Task Manager Settings': ['VIBE_MAX_CONCURRENT_TASKS', 'VIBE_DEFAULT_TASK_TEMPLATE'],
      'Performance Targets': ['VIBE_MAX_RESPONSE_TIME', 'VIBE_MAX_MEMORY_USAGE', 'VIBE_MIN_TEST_COVERAGE'],
      'Agent Settings': ['VIBE_MAX_AGENTS', 'VIBE_DEFAULT_AGENT', 'VIBE_COORDINATION_STRATEGY', 'VIBE_HEALTH_CHECK_INTERVAL'],
      'NLP Settings': ['VIBE_PRIMARY_NLP_METHOD', 'VIBE_FALLBACK_NLP_METHOD', 'VIBE_MIN_CONFIDENCE', 'VIBE_MAX_NLP_PROCESSING_TIME'],
      'Timeout Settings': ['VIBE_TASK_EXECUTION_TIMEOUT', 'VIBE_TASK_DECOMPOSITION_TIMEOUT', 'VIBE_TASK_REFINEMENT_TIMEOUT', 'VIBE_AGENT_COMMUNICATION_TIMEOUT', 'VIBE_LLM_REQUEST_TIMEOUT', 'VIBE_FILE_OPERATIONS_TIMEOUT', 'VIBE_DATABASE_OPERATIONS_TIMEOUT', 'VIBE_NETWORK_OPERATIONS_TIMEOUT'],
      'Retry Policy': ['VIBE_MAX_RETRIES', 'VIBE_BACKOFF_MULTIPLIER', 'VIBE_INITIAL_DELAY_MS', 'VIBE_MAX_DELAY_MS', 'VIBE_ENABLE_EXPONENTIAL_BACKOFF'],
      'Security Settings': ['VIBE_TASK_MANAGER_SECURITY_MODE'],
      'LLM Configuration': ['VIBE_DEFAULT_LLM_MODEL']
    };

    for (const [category, variables] of Object.entries(categories)) {
      documentation += `## ${category}\n\n`;
      
      for (const variable of variables) {
        if (docs[variable]) {
          documentation += `### ${variable}\n`;
          documentation += `${docs[variable]}\n\n`;
        }
      }
    }

    return documentation;
  }
}

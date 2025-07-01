/**
 * Feature flags for the Code-Map Generator tool.
 * This file contains feature flags for enabling or disabling enhanced function detection features.
 */

import logger from '../../../logger.js';

/**
 * Feature flags for the Code-Map Generator.
 */
export interface FeatureFlags {
  /**
   * Whether to enable enhanced function detection.
   * This includes context-aware function naming, framework detection, and role identification.
   */
  enhancedFunctionDetection: boolean;
  
  /**
   * Whether to enable context analysis for function detection.
   * This helps provide better names for anonymous functions based on their context.
   */
  contextAnalysis: boolean;
  
  /**
   * Whether to enable framework detection.
   * This helps identify framework-specific patterns like React components, Express routes, etc.
   */
  frameworkDetection: boolean;
  
  /**
   * Whether to enable role identification.
   * This helps identify function roles like event handlers, callbacks, etc.
   */
  roleIdentification: boolean;
  
  /**
   * Whether to enable heuristic naming.
   * This helps provide better names for functions without explicit names.
   */
  heuristicNaming: boolean;
  
  /**
   * Whether to enable memory optimization features.
   * This includes lazy grammar loading, AST caching, and incremental processing.
   */
  memoryOptimization: boolean;
}

/**
 * Default feature flags.
 */
const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enhancedFunctionDetection: true,
  contextAnalysis: true,
  frameworkDetection: true,
  roleIdentification: true,
  heuristicNaming: true,
  memoryOptimization: true,
};

/**
 * Gets the feature flags from environment variables or configuration.
 * @param config Optional configuration object.
 * @returns The feature flags.
 */
export function getFeatureFlags(config?: Record<string, unknown>): FeatureFlags {
  const flags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS };
  
  try {
    // Check environment variables
    if (process.env.ENHANCED_FUNCTION_DETECTION === 'false') {
      flags.enhancedFunctionDetection = false;
    }
    
    if (process.env.CONTEXT_ANALYSIS === 'false') {
      flags.contextAnalysis = false;
    }
    
    if (process.env.FRAMEWORK_DETECTION === 'false') {
      flags.frameworkDetection = false;
    }
    
    if (process.env.ROLE_IDENTIFICATION === 'false') {
      flags.roleIdentification = false;
    }
    
    if (process.env.HEURISTIC_NAMING === 'false') {
      flags.heuristicNaming = false;
    }
    
    if (process.env.MEMORY_OPTIMIZATION === 'false') {
      flags.memoryOptimization = false;
    }
    
    // Check configuration
    if (config?.featureFlags) {
      const featureFlags = config.featureFlags as Record<string, unknown>;
      if (featureFlags.enhancedFunctionDetection !== undefined) {
        flags.enhancedFunctionDetection = !!featureFlags.enhancedFunctionDetection;
      }

      if (featureFlags.contextAnalysis !== undefined) {
        flags.contextAnalysis = !!featureFlags.contextAnalysis;
      }

      if (featureFlags.frameworkDetection !== undefined) {
        flags.frameworkDetection = !!featureFlags.frameworkDetection;
      }

      if (featureFlags.roleIdentification !== undefined) {
        flags.roleIdentification = !!featureFlags.roleIdentification;
      }

      if (featureFlags.heuristicNaming !== undefined) {
        flags.heuristicNaming = !!featureFlags.heuristicNaming;
      }

      if (featureFlags.memoryOptimization !== undefined) {
        flags.memoryOptimization = !!featureFlags.memoryOptimization;
      }
    }
    
    // If enhanced function detection is disabled, disable all related features
    if (!flags.enhancedFunctionDetection) {
      flags.contextAnalysis = false;
      flags.frameworkDetection = false;
      flags.roleIdentification = false;
      flags.heuristicNaming = false;
    }
    
    logger.debug(`Feature flags: ${JSON.stringify(flags)}`);
    return flags;
  } catch (error) {
    logger.warn({ err: error }, 'Error getting feature flags, using defaults');
    return DEFAULT_FEATURE_FLAGS;
  }
}

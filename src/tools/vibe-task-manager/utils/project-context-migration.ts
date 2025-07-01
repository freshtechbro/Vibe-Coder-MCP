/**
 * Project Context Migration Utilities
 * 
 * Provides safe conversion between old atomic detector ProjectContext interface
 * and the new unified ProjectContext interface to maintain backward compatibility.
 */

import { ProjectContext } from '../types/project-context.js';
import { AtomicTask } from '../types/task.js';
import logger from '../../../logger.js';

/**
 * Legacy atomic detector ProjectContext interface
 */
export interface LegacyAtomicProjectContext {
  projectId: string;
  languages: string[];
  frameworks: string[];
  tools: string[];
  existingTasks: AtomicTask[];
  codebaseSize: 'small' | 'medium' | 'large';
  teamSize: number;
  complexity: 'low' | 'medium' | 'high';
  codebaseContext?: {
    relevantFiles: Array<{
      path: string;
      relevance: number;
      type: string;
      size: number;
    }>;
    contextSummary: string;
    gatheringMetrics: {
      searchTime: number;
      readTime: number;
      scoringTime: number;
      totalTime: number;
      cacheHitRate: number;
    };
    totalContextSize: number;
    averageRelevance: number;
  };
}

/**
 * Migration result with validation information
 */
export interface MigrationResult<T> {
  success: boolean;
  data?: T;
  warnings: string[];
  errors: string[];
}

/**
 * Convert legacy atomic detector context to unified ProjectContext
 */
export function migrateFromLegacyContext(
  legacyContext: LegacyAtomicProjectContext,
  projectPath?: string,
  projectName?: string
): MigrationResult<ProjectContext> {
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    // Validate required fields
    if (!legacyContext.projectId) {
      errors.push('Missing required field: projectId');
    }

    if (!Array.isArray(legacyContext.languages)) {
      errors.push('Invalid field: languages must be an array');
    }

    if (!Array.isArray(legacyContext.frameworks)) {
      errors.push('Invalid field: frameworks must be an array');
    }

    if (errors.length > 0) {
      return { success: false, warnings, errors };
    }

    // Create unified context with defaults for missing fields
    const unifiedContext: ProjectContext = {
      // Required fields from legacy context
      projectId: legacyContext.projectId,
      languages: legacyContext.languages || [],
      frameworks: legacyContext.frameworks || [],
      tools: legacyContext.tools || [],
      existingTasks: legacyContext.existingTasks || [],
      codebaseSize: legacyContext.codebaseSize || 'medium',
      teamSize: legacyContext.teamSize || 1,
      complexity: legacyContext.complexity || 'medium',
      codebaseContext: legacyContext.codebaseContext,

      // Required fields with defaults
      projectPath: projectPath || process.cwd(),
      projectName: projectName || legacyContext.projectId,
      
      // Optional fields with defaults
      description: `Migrated project: ${legacyContext.projectId}`,
      buildTools: ['npm'], // Default build tool
      configFiles: [],
      entryPoints: [],
      architecturalPatterns: [],
      
      structure: {
        sourceDirectories: ['src'],
        testDirectories: ['test', 'tests', '__tests__'],
        docDirectories: ['docs', 'documentation'],
        buildDirectories: ['dist', 'build', 'lib']
      },
      
      dependencies: {
        production: [],
        development: [],
        external: []
      },
      
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
        source: 'manual' as const
      }
    };

    // Add warnings for defaulted fields
    if (!projectPath) {
      warnings.push('projectPath not provided, using current working directory');
    }
    
    if (!projectName) {
      warnings.push('projectName not provided, using projectId');
    }

    logger.debug({
      projectId: legacyContext.projectId,
      warningCount: warnings.length,
      errorCount: errors.length
    }, 'Migrated legacy ProjectContext to unified interface');

    return {
      success: true,
      data: unifiedContext,
      warnings,
      errors
    };

  } catch (error) {
    errors.push(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, warnings, errors };
  }
}

/**
 * Convert unified ProjectContext to legacy atomic detector format
 */
export function migrateToLegacyContext(
  unifiedContext: ProjectContext
): MigrationResult<LegacyAtomicProjectContext> {
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    // Validate required fields for legacy format
    if (!unifiedContext.projectId) {
      errors.push('Missing required field: projectId');
    }

    if (errors.length > 0) {
      return { success: false, warnings, errors };
    }

    const legacyContext: LegacyAtomicProjectContext = {
      projectId: unifiedContext.projectId,
      languages: unifiedContext.languages || [],
      frameworks: unifiedContext.frameworks || [],
      tools: unifiedContext.tools || [],
      existingTasks: unifiedContext.existingTasks || [],
      codebaseSize: unifiedContext.codebaseSize || 'medium',
      teamSize: unifiedContext.teamSize || 1,
      complexity: unifiedContext.complexity || 'medium',
      codebaseContext: unifiedContext.codebaseContext
    };

    // Note fields that will be lost in conversion
    const lostFields = [];
    if (unifiedContext.projectPath) lostFields.push('projectPath');
    if (unifiedContext.projectName) lostFields.push('projectName');
    if (unifiedContext.description) lostFields.push('description');
    if (unifiedContext.buildTools?.length) lostFields.push('buildTools');
    if (unifiedContext.structure) lostFields.push('structure');
    if (unifiedContext.dependencies) lostFields.push('dependencies');
    if (unifiedContext.metadata) lostFields.push('metadata');

    if (lostFields.length > 0) {
      warnings.push(`Fields lost in legacy conversion: ${lostFields.join(', ')}`);
    }

    logger.debug({
      projectId: unifiedContext.projectId,
      lostFieldCount: lostFields.length,
      warningCount: warnings.length
    }, 'Converted unified ProjectContext to legacy format');

    return {
      success: true,
      data: legacyContext,
      warnings,
      errors
    };

  } catch (error) {
    errors.push(`Legacy conversion failed: ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, warnings, errors };
  }
}

/**
 * Type guard to check if an object is a legacy ProjectContext
 */
export function isLegacyProjectContext(obj: unknown): obj is LegacyAtomicProjectContext {
  if (!obj || typeof obj !== 'object') return false;
  
  const context = obj as Record<string, unknown>;
  return (
    typeof context.projectId === 'string' &&
    Array.isArray(context.languages) &&
    Array.isArray(context.frameworks) &&
    Array.isArray(context.tools) &&
    Array.isArray(context.existingTasks) &&
    ['small', 'medium', 'large'].includes(context.codebaseSize as string) &&
    typeof context.teamSize === 'number' &&
    ['low', 'medium', 'high'].includes(context.complexity as string) &&
    // Legacy context lacks projectPath and projectName
    !context.projectPath &&
    !context.projectName
  );
}

/**
 * Type guard to check if an object is a unified ProjectContext
 */
export function isUnifiedProjectContext(obj: unknown): obj is ProjectContext {
  if (!obj || typeof obj !== 'object') return false;
  
  const context = obj as Record<string, unknown>;
  return (
    typeof context.projectId === 'string' &&
    typeof context.projectPath === 'string' &&
    typeof context.projectName === 'string' &&
    Array.isArray(context.languages) &&
    Array.isArray(context.frameworks) &&
    Array.isArray(context.tools) &&
    Array.isArray(context.existingTasks) &&
    ['small', 'medium', 'large'].includes(context.codebaseSize as string) &&
    typeof context.teamSize === 'number' &&
    ['low', 'medium', 'high'].includes(context.complexity as string)
  );
}

/**
 * Auto-detect and migrate any ProjectContext to unified format
 */
export function autoMigrateProjectContext(
  context: unknown,
  projectPath?: string,
  projectName?: string
): MigrationResult<ProjectContext> {
  if (isUnifiedProjectContext(context)) {
    return {
      success: true,
      data: context,
      warnings: [],
      errors: []
    };
  }

  if (isLegacyProjectContext(context)) {
    return migrateFromLegacyContext(context, projectPath, projectName);
  }

  return {
    success: false,
    warnings: [],
    errors: ['Unknown ProjectContext format - cannot migrate']
  };
}

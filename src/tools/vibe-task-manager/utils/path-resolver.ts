import path from 'path';
import logger from '../../../logger.js';
import { getVibeTaskManagerSecurityValidator } from '../security/vibe-task-manager-security-validator.js';

/**
 * Centralized path resolution utility for Vibe Task Manager
 * Follows existing patterns from project-operations.ts and unified security configuration
 */
export class PathResolver {
  private static instance: PathResolver;

  private constructor() {}

  static getInstance(): PathResolver {
    if (!PathResolver.instance) {
      PathResolver.instance = new PathResolver();
    }
    return PathResolver.instance;
  }

  /**
   * Resolve project root path following existing patterns from project-operations.ts
   * Priority: 1) Provided path, 2) Environment variable, 3) Current working directory
   */
  resolveProjectRootPath(providedPath?: string, contextId?: string): string {
    // 1. Try provided path first
    if (providedPath && providedPath !== '/' && providedPath.length > 1) {
      logger.debug({ providedPath, contextId }, 'Using provided project path');
      return path.resolve(providedPath);
    }

    // 2. Use environment variable (following existing security patterns)
    const envProjectPath = process.env.VIBE_TASK_MANAGER_READ_DIR;
    if (envProjectPath && envProjectPath !== '/' && envProjectPath.length > 1) {
      logger.debug({ envProjectPath, contextId }, 'Using environment project path');
      return path.resolve(envProjectPath);
    }

    // 3. Fallback to current working directory
    const cwd = process.cwd();
    logger.debug({ cwd, contextId }, 'Using current working directory as project path');
    return cwd;
  }

  /**
   * Resolve project path from command execution context
   */
  resolveProjectPathFromContext(context: { projectPath?: string; sessionId?: string }): string {
    return this.resolveProjectRootPath(context.projectPath, context.sessionId);
  }

  /**
   * Get the configured read directory for Vibe Task Manager
   */
  getReadDirectory(): string {
    return this.resolveProjectRootPath();
  }

  /**
   * Get the configured output directory for Vibe Task Manager
   */
  getOutputDirectory(): string {
    const outputDir = process.env.VIBE_CODER_OUTPUT_DIR;
    if (outputDir) {
      return path.resolve(outputDir);
    }
    
    // Fallback to default output directory
    const projectRoot = this.resolveProjectRootPath();
    return path.join(projectRoot, 'VibeCoderOutput');
  }

  /**
   * Create a secure path within the read directory using security validator
   */
  createSecureReadPath(relativePath: string): string {
    const readDir = this.getReadDirectory();
    const resolvedPath = path.resolve(readDir, relativePath);

    // Use the security validator for consistent boundary enforcement
    const validator = getVibeTaskManagerSecurityValidator();
    return validator.createSecureReadPath(resolvedPath);
  }

  /**
   * Create a secure path within the output directory using security validator
   */
  createSecureOutputPath(relativePath: string): string {
    const outputDir = this.getOutputDirectory();
    const resolvedPath = path.resolve(outputDir, relativePath);

    // Use the security validator for consistent boundary enforcement
    const validator = getVibeTaskManagerSecurityValidator();
    return validator.createSecureWritePath(resolvedPath);
  }
}

/**
 * Convenience function to get the singleton PathResolver instance
 */
export function getPathResolver(): PathResolver {
  return PathResolver.getInstance();
}

/**
 * Convenience function to resolve project root path
 */
export function resolveProjectPath(providedPath?: string, contextId?: string): string {
  return getPathResolver().resolveProjectRootPath(providedPath, contextId);
}

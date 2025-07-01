/**
 * Code Map Integration Service
 *
 * Integrates with the existing code-map-generator tool to provide project context
 * for task decomposition. Handles automatic code map generation, parsing, and
 * context integration with stale detection and error handling.
 */

import fs from 'fs/promises';
import path from 'path';
import logger from '../../../logger.js';
import { executeCodeMapGeneration } from '../../code-map-generator/index.js';
import type { CodeMapGeneratorConfig } from '../../code-map-generator/types.js';
import type { ProjectContext } from '../types/project-context.js';
import { OpenRouterConfigManager } from '../../../utils/openrouter-config-manager.js';

/**
 * Code map information
 */
export interface CodeMapInfo {
  /** Path to the code map file */
  filePath: string;
  /** Generation timestamp */
  generatedAt: Date;
  /** Project path that was mapped */
  projectPath: string;
  /** Size of the code map file in bytes */
  fileSize: number;
  /** Whether the code map is stale */
  isStale: boolean;
}

/**
 * Code map generation result
 */
export interface CodeMapResult {
  /** Success status */
  success: boolean;
  /** Path to generated code map file */
  filePath?: string;
  /** Generation time in milliseconds */
  generationTime?: number;
  /** Error message if generation failed */
  error?: string;
  /** Job ID for tracking */
  jobId?: string;
}

/**
 * Architectural information extracted from code map
 */
export interface ArchitectureInfo {
  /** Main directories and their purposes */
  directoryStructure: Array<{
    path: string;
    purpose: string;
    fileCount: number;
  }>;
  /** Key architectural patterns identified */
  patterns: string[];
  /** Main entry points */
  entryPoints: string[];
  /** Configuration files */
  configFiles: string[];
  /** Framework information */
  frameworks: string[];
  /** Languages used */
  languages: string[];
}

/**
 * Dependency information from code map
 */
export interface DependencyInfo {
  /** Source file */
  source: string;
  /** Target file or module */
  target: string;
  /** Type of dependency */
  type: 'import' | 'require' | 'include' | 'reference';
  /** Whether it's an external dependency */
  isExternal: boolean;
  /** Package name if external */
  packageName?: string;
}

/**
 * Code map integration configuration
 */
interface CodeMapIntegrationConfig {
  /** Maximum age of code map before considering it stale (in milliseconds) */
  maxAge: number;
  /** Whether to automatically refresh stale code maps */
  autoRefresh: boolean;
  /** Timeout for code map generation (in milliseconds) */
  generationTimeout: number;
  /** Whether to cache code map results */
  enableCaching: boolean;
  /** Performance monitoring enabled */
  enablePerformanceMonitoring: boolean;
  /** Maximum number of cached code maps */
  maxCacheSize: number;
  /** Staleness check interval in milliseconds */
  stalenessCheckInterval: number;
}

/**
 * Code map metadata information
 */
export interface CodeMapMetadata {
  /** Code map file path */
  filePath: string;
  /** Project path */
  projectPath: string;
  /** Generation timestamp */
  generatedAt: Date;
  /** File size in bytes */
  fileSize: number;
  /** Code map version */
  version: string;
  /** Whether optimization was applied */
  isOptimized: boolean;
  /** Generation configuration used */
  generationConfig: Record<string, unknown>;
  /** Performance metrics */
  performanceMetrics: {
    generationTime: number;
    parseTime: number;
    fileCount: number;
    lineCount: number;
  };
}

/**
 * Code map validation result
 */
export interface ValidationResult {
  /** Whether the code map is valid */
  isValid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Integrity score (0-1) */
  integrityScore: number;
  /** Validation timestamp */
  validatedAt: Date;
}

/**
 * Code map data types for API requests
 */
export type CodeMapDataType =
  | 'architectural_info'
  | 'dependency_info'
  | 'relevant_files'
  | 'metadata'
  | 'full_content'
  | 'performance_metrics';

/**
 * Update callback for code map subscriptions
 */
export type UpdateCallback = (event: CodeMapUpdateEvent) => void;

/**
 * Code map update event
 */
export interface CodeMapUpdateEvent {
  /** Event type */
  type: 'generated' | 'refreshed' | 'validated' | 'error';
  /** Project path */
  projectPath: string;
  /** Code map file path */
  filePath?: string;
  /** Event timestamp */
  timestamp: Date;
  /** Additional event data */
  data?: unknown;
  /** Error information if applicable */
  error?: string;
}

/**
 * Code Map Integration Service implementation
 */
export class CodeMapIntegrationService {
  private static instance: CodeMapIntegrationService;
  private config: CodeMapIntegrationConfig;
  private codeMapCache = new Map<string, CodeMapInfo>();
  private updateSubscriptions = new Map<string, UpdateCallback[]>();
  private performanceMetrics = new Map<string, CodeMapMetadata['performanceMetrics']>();

  private constructor() {
    this.config = {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      autoRefresh: true,
      generationTimeout: 5 * 60 * 1000, // 5 minutes
      enableCaching: true,
      enablePerformanceMonitoring: true,
      maxCacheSize: 50,
      stalenessCheckInterval: 60 * 60 * 1000 // 1 hour
    };

    logger.debug('Code map integration service initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CodeMapIntegrationService {
    if (!CodeMapIntegrationService.instance) {
      CodeMapIntegrationService.instance = new CodeMapIntegrationService();
    }
    return CodeMapIntegrationService.instance;
  }

  /**
   * Generate code map for a project
   */
  async generateCodeMap(
    projectPath: string,
    config?: Partial<CodeMapGeneratorConfig>
  ): Promise<CodeMapResult> {
    const startTime = Date.now();

    try {
      logger.info({ projectPath }, 'Starting code map generation');

      // Validate project path
      const absoluteProjectPath = path.resolve(projectPath);
      await this.validateProjectPath(absoluteProjectPath);

      // Prepare parameters for code map generation
      const params = {
        allowedMappingDirectory: absoluteProjectPath,
        ...config
      };

      // Generate job ID for tracking
      const jobId = `codemap-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      // Get proper OpenRouter configuration from centralized manager
      const configManager = OpenRouterConfigManager.getInstance();
      const openRouterConfig = await configManager.getOpenRouterConfig();

      // Execute code map generation
      const result = await executeCodeMapGeneration(
        params,
        openRouterConfig,
        {
          sessionId: `codemap-session-${Date.now()}`,
          transportType: 'stdio'
        },
        jobId
      );

      const generationTime = Date.now() - startTime;

      if (result.isError) {
        const errorMessage = this.extractErrorMessage(result.content);
        logger.error({ projectPath, error: errorMessage }, 'Code map generation failed');
        return {
          success: false,
          error: errorMessage,
          generationTime,
          jobId
        };
      }

      // Extract file path from result content
      const contentString = this.extractContentString(result.content);
      const filePath = this.extractFilePathFromResult(contentString);

      if (filePath) {
        // Update cache
        if (this.config.enableCaching) {
          await this.updateCodeMapCache(projectPath, filePath);
        }

        logger.info({
          projectPath,
          filePath,
          generationTime,
          jobId
        }, 'Code map generation completed successfully');

        return {
          success: true,
          filePath,
          generationTime,
          jobId
        };
      } else {
        logger.warn({ projectPath, result: result.content }, 'Code map generated but file path not found');
        return {
          success: false,
          error: 'Generated code map but could not determine file path',
          generationTime,
          jobId
        };
      }

    } catch (error) {
      const generationTime = Date.now() - startTime;
      logger.error({ err: error, projectPath }, 'Code map generation failed with exception');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        generationTime
      };
    }
  }

  /**
   * Detect existing code map for a project
   */
  async detectExistingCodeMap(projectPath: string): Promise<CodeMapInfo | null> {
    try {
      const absoluteProjectPath = path.resolve(projectPath);

      // Check cache first
      if (this.config.enableCaching && this.codeMapCache.has(absoluteProjectPath)) {
        const cached = this.codeMapCache.get(absoluteProjectPath)!;

        // Verify file still exists
        try {
          await fs.access(cached.filePath);
          return cached;
        } catch {
          // File no longer exists, remove from cache
          this.codeMapCache.delete(absoluteProjectPath);
        }
      }

      // Look for code map files in the output directory
      const codeMapFiles = await this.findCodeMapFiles(absoluteProjectPath);

      if (codeMapFiles.length === 0) {
        return null;
      }

      // Get the most recent code map
      const mostRecent = codeMapFiles.sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())[0];

      // Update cache
      if (this.config.enableCaching) {
        this.codeMapCache.set(absoluteProjectPath, mostRecent);
      }

      return mostRecent;

    } catch (error) {
      logger.warn({ err: error, projectPath }, 'Failed to detect existing code map');
      return null;
    }
  }

  /**
   * Check if a code map is stale
   */
  async isCodeMapStale(projectPath: string, maxAge?: number): Promise<boolean> {
    try {
      const codeMapInfo = await this.detectExistingCodeMap(projectPath);

      if (!codeMapInfo) {
        return true; // No code map exists, so it's "stale"
      }

      const ageThreshold = maxAge || this.config.maxAge;
      const age = Date.now() - codeMapInfo.generatedAt.getTime();

      return age > ageThreshold;

    } catch (error) {
      logger.warn({ err: error, projectPath }, 'Failed to check code map staleness');
      return true; // Assume stale if we can't check
    }
  }

  /**
   * Refresh code map if stale or force refresh
   */
  async refreshCodeMap(projectPath: string, force = false): Promise<CodeMapResult> {
    try {
      const isStale = force || await this.isCodeMapStale(projectPath);

      if (!isStale) {
        logger.debug({ projectPath }, 'Code map is fresh, skipping refresh');
        const existing = await this.detectExistingCodeMap(projectPath);

        return {
          success: true,
          filePath: existing?.filePath,
          generationTime: 0
        };
      }

      logger.info({ projectPath, force }, 'Refreshing code map');
      return await this.generateCodeMap(projectPath);

    } catch (error) {
      logger.error({ err: error, projectPath }, 'Failed to refresh code map');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Extract architectural information from code map
   */
  async extractArchitecturalInfo(projectPath: string): Promise<ArchitectureInfo> {
    try {
      const codeMapInfo = await this.detectExistingCodeMap(projectPath);

      if (!codeMapInfo) {
        throw new Error('No code map found for project');
      }

      // Read and parse the code map file
      const codeMapContent = await fs.readFile(codeMapInfo.filePath, 'utf-8');

      return this.parseArchitecturalInfo(codeMapContent, projectPath);

    } catch (error) {
      logger.error({ err: error, projectPath }, 'Failed to extract architectural info');
      throw error;
    }
  }

  /**
   * Extract dependency information from code map
   */
  async extractDependencyInfo(projectPath: string): Promise<DependencyInfo[]> {
    try {
      const codeMapInfo = await this.detectExistingCodeMap(projectPath);

      if (!codeMapInfo) {
        throw new Error('No code map found for project');
      }

      // Read and parse the code map file
      const codeMapContent = await fs.readFile(codeMapInfo.filePath, 'utf-8');

      return this.parseDependencyInfo(codeMapContent);

    } catch (error) {
      logger.error({ err: error, projectPath }, 'Failed to extract dependency info');
      throw error;
    }
  }

  /**
   * Extract relevant files for a task description
   */
  async extractRelevantFiles(projectPath: string, taskDescription: string): Promise<string[]> {
    try {
      const codeMapInfo = await this.detectExistingCodeMap(projectPath);

      if (!codeMapInfo) {
        logger.warn({ projectPath }, 'No code map found, cannot extract relevant files');
        return [];
      }

      // Read and parse the code map file
      const codeMapContent = await fs.readFile(codeMapInfo.filePath, 'utf-8');

      return this.findRelevantFiles(codeMapContent, taskDescription);

    } catch (error) {
      logger.error({ err: error, projectPath, taskDescription }, 'Failed to extract relevant files');
      return [];
    }
  }

  /**
   * Integrate code map context into project context
   */
  async integrateCodeMapContext(
    projectContext: ProjectContext,
    projectPath: string
  ): Promise<ProjectContext> {
    try {
      // Ensure we have a fresh code map
      if (this.config.autoRefresh) {
        await this.refreshCodeMap(projectPath);
      }

      // Extract architectural and dependency information
      const [architecturalInfo, dependencyInfo] = await Promise.all([
        this.extractArchitecturalInfo(projectPath).catch(() => null),
        this.extractDependencyInfo(projectPath).catch(() => [])
      ]);

      // Enhance project context with code map information
      const enhancedContext: ProjectContext = {
        ...projectContext,
        // Add architectural information
        architecturalPatterns: architecturalInfo?.patterns || [],
        entryPoints: architecturalInfo?.entryPoints || [],

        // Enhance existing information
        frameworks: [
          ...new Set([
            ...projectContext.frameworks,
            ...(architecturalInfo?.frameworks || [])
          ])
        ],
        languages: [
          ...new Set([
            ...projectContext.languages,
            ...(architecturalInfo?.languages || [])
          ])
        ],

        // Add code map specific context
        codeMapContext: {
          hasCodeMap: true,
          lastGenerated: (await this.detectExistingCodeMap(projectPath))?.generatedAt,
          directoryStructure: architecturalInfo?.directoryStructure || [],
          dependencyCount: dependencyInfo.length,
          externalDependencies: dependencyInfo.filter(d => d.isExternal).length,
          configFiles: architecturalInfo?.configFiles || []
        }
      };

      logger.debug({
        projectPath,
        enhancedFrameworks: enhancedContext.frameworks.length,
        enhancedLanguages: enhancedContext.languages.length,
        dependencyCount: dependencyInfo.length
      }, 'Integrated code map context');

      return enhancedContext;

    } catch (error) {
      logger.warn({ err: error, projectPath }, 'Failed to integrate code map context, using original');
      return projectContext;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.codeMapCache.clear();
    logger.debug('Code map cache cleared');
  }

  // Private helper methods

  /**
   * Validate project path exists and is accessible
   */
  private async validateProjectPath(projectPath: string): Promise<void> {
    try {
      const stats = await fs.stat(projectPath);
      if (!stats || typeof stats.isDirectory !== 'function') {
        throw new Error(`Invalid file stats for path: ${projectPath}`);
      }
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${projectPath}`);
      }
    } catch (error) {
      throw new Error(`Invalid project path: ${projectPath} - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract file path from code map generation result
   */
  private extractFilePathFromResult(resultContent: string): string | null {
    try {
      // Look for file path patterns in the result content
      const patterns = [
        /Generated code map: (.+\.md)/,
        /Generated Markdown output: (.+\.md)/,  // Match actual output format
        /\*\*Output saved to:\*\* (.+\.md)/,    // Match **Output saved to:** format
        /Output file: (.+\.md)/,
        /Saved to: (.+\.md)/,
        /File saved: (.+\.md)/,
        /(?:^|\n)(.+\.md)(?:\n|$)/
      ];

      for (const pattern of patterns) {
        const match = resultContent.match(pattern);
        if (match && match[1]) {
          return match[1].trim();
        }
      }

      // If no pattern matches, try to find any .md file path
      const lines = resultContent.split('\n');
      for (const line of lines) {
        if (line.includes('.md') && (line.includes('/') || line.includes('\\'))) {
          const trimmed = line.trim();
          if (trimmed.endsWith('.md')) {
            return trimmed;
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn({ err: error, resultContent }, 'Failed to extract file path from result');
      return null;
    }
  }

  /**
   * Update code map cache with new information
   */
  private async updateCodeMapCache(projectPath: string, filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      const absoluteProjectPath = path.resolve(projectPath);

      const codeMapInfo: CodeMapInfo = {
        filePath,
        generatedAt: stats.mtime,
        projectPath: absoluteProjectPath,
        fileSize: stats.size,
        isStale: false
      };

      this.codeMapCache.set(absoluteProjectPath, codeMapInfo);
      logger.debug({ projectPath: absoluteProjectPath, filePath }, 'Updated code map cache');

    } catch (error) {
      logger.warn({ err: error, projectPath, filePath }, 'Failed to update code map cache');
    }
  }

  /**
   * Find existing code map files for a project
   */
  private async findCodeMapFiles(projectPath: string): Promise<CodeMapInfo[]> {
    try {
      // Get the output directory from environment or default
      const outputBaseDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
      const codeMapOutputDir = path.join(outputBaseDir, 'code-map-generator');

      // Check if output directory exists
      try {
        await fs.access(codeMapOutputDir);
      } catch {
        return []; // No output directory means no code maps
      }

      // Find all .md files in the output directory
      const files = await fs.readdir(codeMapOutputDir, { withFileTypes: true });

      // Validate files is an array
      if (!Array.isArray(files)) {
        logger.warn({ projectPath, filesType: typeof files }, 'readdir returned non-array');
        return [];
      }

      const codeMapFiles: CodeMapInfo[] = [];

      for (const file of files) {
        // Validate file object has required methods
        if (!file || typeof file.isFile !== 'function' || typeof file.name !== 'string') {
          logger.warn({ projectPath, fileType: typeof file }, 'Invalid file object from readdir');
          continue;
        }

        if (file.isFile() && file.name.endsWith('.md')) {
          const filePath = path.join(codeMapOutputDir, file.name);

          try {
            const stats = await fs.stat(filePath);

            // Validate stats object
            if (!stats || typeof stats.mtime === 'undefined' || typeof stats.size === 'undefined') {
              logger.warn({ filePath, statsType: typeof stats }, 'Invalid stats object from fs.stat');
              continue;
            }

            // Check if this code map is for the current project
            // This is a heuristic - we could improve this by reading the file content
            const isForProject = await this.isCodeMapForProject(filePath, projectPath);

            if (isForProject) {
              codeMapFiles.push({
                filePath,
                generatedAt: stats.mtime,
                projectPath,
                fileSize: stats.size,
                isStale: Date.now() - stats.mtime.getTime() > this.config.maxAge
              });
            }
          } catch (error) {
            logger.warn({ err: error, filePath }, 'Failed to stat code map file');
          }
        }
      }

      return codeMapFiles;

    } catch (error) {
      logger.warn({ err: error, projectPath }, 'Failed to find code map files');
      return [];
    }
  }

  /**
   * Check if a code map file is for a specific project
   */
  private async isCodeMapForProject(filePath: string, projectPath: string): Promise<boolean> {
    try {
      // Read the first few lines of the file to check for project path
      const content = await fs.readFile(filePath, 'utf-8');

      // Validate content is a string
      if (typeof content !== 'string') {
        logger.warn({ filePath, projectPath, contentType: typeof content }, 'Invalid content type from readFile');
        return false;
      }

      const lines = content.split('\n').slice(0, 20); // Check first 20 lines

      const absoluteProjectPath = path.resolve(projectPath);

      // Look for project path in the content
      for (const line of lines) {
        if (line.includes(absoluteProjectPath) || line.includes(path.basename(absoluteProjectPath))) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, filePath, projectPath }, 'Failed to check if code map is for project');
      return false;
    }
  }

  /**
   * Parse architectural information from code map content
   */
  private parseArchitecturalInfo(content: string, _projectPath: string): ArchitectureInfo {
    const info: ArchitectureInfo = {
      directoryStructure: [],
      patterns: [],
      entryPoints: [],
      configFiles: [],
      frameworks: [],
      languages: []
    };

    try {
      // Validate content is a string
      if (typeof content !== 'string') {
        logger.warn({ projectPath: _projectPath, contentType: typeof content }, 'Invalid content type for parseArchitecturalInfo');
        return info;
      }

      const lines = content.split('\n');
      let currentSection = '';

      for (const line of lines) {
        const trimmed = line.trim();

        // Detect sections
        if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
          currentSection = trimmed.toLowerCase();
          continue;
        }

        // Parse directory structure
        if (currentSection.includes('directory') || currentSection.includes('structure')) {
          const dirMatch = trimmed.match(/^[-*]\s*(.+?)(?:\s*\((\d+)\s*files?\))?/);
          if (dirMatch) {
            info.directoryStructure.push({
              path: dirMatch[1],
              purpose: this.inferDirectoryPurpose(dirMatch[1]),
              fileCount: parseInt(dirMatch[2] || '0', 10)
            });
          }
        }

        // Parse frameworks and languages
        if (trimmed.includes('framework') || trimmed.includes('library')) {
          const frameworks = this.extractFrameworks(trimmed);
          info.frameworks.push(...frameworks);
        }

        if (trimmed.includes('language') || trimmed.includes('extension')) {
          const languages = this.extractLanguages(trimmed);
          info.languages.push(...languages);
        }

        // Parse entry points
        if (trimmed.includes('main') || trimmed.includes('index') || trimmed.includes('entry')) {
          if (trimmed.includes('.js') || trimmed.includes('.ts') || trimmed.includes('.py')) {
            const entryPoint = this.extractFilePath(trimmed);
            if (entryPoint) {
              info.entryPoints.push(entryPoint);
            }
          }
        }

        // Parse config files
        if (this.isConfigFile(trimmed)) {
          const configFile = this.extractFilePath(trimmed);
          if (configFile) {
            info.configFiles.push(configFile);
          }
        }

        // Parse architectural patterns
        if (trimmed.includes('pattern') || trimmed.includes('architecture')) {
          const patterns = this.extractPatterns(trimmed);
          info.patterns.push(...patterns);
        }
      }

      // Deduplicate arrays
      info.frameworks = [...new Set(info.frameworks)];
      info.languages = [...new Set(info.languages)];
      info.entryPoints = [...new Set(info.entryPoints)];
      info.configFiles = [...new Set(info.configFiles)];
      info.patterns = [...new Set(info.patterns)];

      return info;

    } catch (error) {
      logger.warn({ err: error }, 'Failed to parse architectural info, returning empty');
      return info;
    }
  }

  /**
   * Parse dependency information from code map content
   */
  private parseDependencyInfo(content: string): DependencyInfo[] {
    const dependencies: DependencyInfo[] = [];

    try {
      // Validate content is a string
      if (typeof content !== 'string') {
        logger.warn({ contentType: typeof content }, 'Invalid content type for parseDependencyInfo');
        return dependencies;
      }

      const lines = content.split('\n');
      let inDependencySection = false;

      for (const line of lines) {
        const trimmed = line.trim();

        // Detect dependency sections
        if (trimmed.toLowerCase().includes('import') ||
            trimmed.toLowerCase().includes('depend') ||
            trimmed.toLowerCase().includes('require')) {
          inDependencySection = true;
          continue;
        }

        // Reset section detection
        if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
          inDependencySection = trimmed.toLowerCase().includes('import') ||
                               trimmed.toLowerCase().includes('depend');
          continue;
        }

        if (inDependencySection && trimmed) {
          const dependency = this.parseDependencyLine(trimmed);
          if (dependency) {
            dependencies.push(dependency);
          }
        }
      }

      return dependencies;

    } catch (error) {
      logger.warn({ err: error }, 'Failed to parse dependency info, returning empty');
      return [];
    }
  }

  /**
   * Find relevant files based on task description
   */
  private findRelevantFiles(content: string, taskDescription: string): string[] {
    const relevantFiles: string[] = [];

    try {
      const keywords = this.extractKeywords(taskDescription);
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        // Look for file paths
        if (this.containsFilePath(trimmed)) {
          const filePath = this.extractFilePath(trimmed);

          if (filePath && this.isRelevantToKeywords(trimmed, keywords)) {
            relevantFiles.push(filePath);
          }
        }
      }

      return [...new Set(relevantFiles)];

    } catch (error) {
      logger.warn({ err: error, taskDescription }, 'Failed to find relevant files, returning empty');
      return [];
    }
  }

  // Additional helper methods for parsing

  private inferDirectoryPurpose(dirPath: string): string {
    const name = path.basename(dirPath).toLowerCase();

    const purposes: Record<string, string> = {
      'src': 'Source code',
      'lib': 'Library code',
      'test': 'Test files',
      'tests': 'Test files',
      'spec': 'Test specifications',
      'docs': 'Documentation',
      'config': 'Configuration',
      'build': 'Build artifacts',
      'dist': 'Distribution files',
      'public': 'Public assets',
      'assets': 'Static assets',
      'components': 'UI components',
      'services': 'Service layer',
      'utils': 'Utility functions',
      'types': 'Type definitions',
      'models': 'Data models',
      'controllers': 'Controllers',
      'routes': 'Route definitions',
      'middleware': 'Middleware',
      'api': 'API endpoints'
    };

    return purposes[name] || 'General purpose';
  }

  private extractFrameworks(text: string): string[] {
    const frameworks: string[] = [];
    const frameworkPatterns = [
      /react/i, /vue/i, /angular/i, /svelte/i,
      /express/i, /fastify/i, /koa/i, /nest/i,
      /next/i, /nuxt/i, /gatsby/i,
      /django/i, /flask/i, /fastapi/i,
      /spring/i, /laravel/i, /rails/i
    ];

    for (const pattern of frameworkPatterns) {
      const match = text.match(pattern);
      if (match) {
        frameworks.push(match[0].toLowerCase());
      }
    }

    return frameworks;
  }

  private extractLanguages(text: string): string[] {
    const languages: string[] = [];
    const languagePatterns = [
      /\.js\b/g, /\.ts\b/g, /\.py\b/g, /\.java\b/g,
      /\.cpp?\b/g, /\.cs\b/g, /\.php\b/g, /\.rb\b/g,
      /\.go\b/g, /\.rs\b/g, /\.swift\b/g, /\.kt\b/g
    ];

    const languageMap: Record<string, string> = {
      '.js': 'JavaScript',
      '.ts': 'TypeScript',
      '.py': 'Python',
      '.java': 'Java',
      '.cpp': 'C++',
      '.c': 'C',
      '.cs': 'C#',
      '.php': 'PHP',
      '.rb': 'Ruby',
      '.go': 'Go',
      '.rs': 'Rust',
      '.swift': 'Swift',
      '.kt': 'Kotlin'
    };

    for (const pattern of languagePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          const language = languageMap[match];
          if (language) {
            languages.push(language);
          }
        }
      }
    }

    return languages;
  }

  private extractFilePath(text: string): string | null {
    const pathPatterns = [
      /([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/,
      /"([^"]+\.[a-zA-Z0-9]+)"/,
      /'([^']+\.[a-zA-Z0-9]+)'/,
      /`([^`]+\.[a-zA-Z0-9]+)`/
    ];

    for (const pattern of pathPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  private isConfigFile(text: string): boolean {
    const configPatterns = [
      /package\.json/i, /tsconfig\.json/i, /webpack\.config/i,
      /babel\.config/i, /eslint/i, /prettier/i,
      /\.env/i, /config\./i, /settings\./i
    ];

    return configPatterns.some(pattern => pattern.test(text));
  }

  private extractPatterns(text: string): string[] {
    const patterns: string[] = [];
    const patternKeywords = [
      'mvc', 'mvp', 'mvvm', 'microservices', 'monolith',
      'layered', 'hexagonal', 'clean architecture',
      'repository', 'factory', 'singleton', 'observer'
    ];

    for (const keyword of patternKeywords) {
      if (text.toLowerCase().includes(keyword)) {
        patterns.push(keyword);
      }
    }

    return patterns;
  }

  private parseDependencyLine(line: string): DependencyInfo | null {
    try {
      // Parse different dependency formats
      const importMatch = line.match(/import\s+.*?from\s+['"]([^'"]+)['"]/);
      const requireMatch = line.match(/require\(['"]([^'"]+)['"]\)/);
      const includeMatch = line.match(/#include\s+[<"]([^>"]+)[>"]/);

      let target: string | null = null;
      let type: DependencyInfo['type'] = 'import';

      if (importMatch) {
        target = importMatch[1];
        type = 'import';
      } else if (requireMatch) {
        target = requireMatch[1];
        type = 'require';
      } else if (includeMatch) {
        target = includeMatch[1];
        type = 'include';
      }

      if (!target) {
        return null;
      }

      const isExternal = !target.startsWith('.') && !target.startsWith('/');
      const packageName = isExternal ? target.split('/')[0] : undefined;

      return {
        source: 'unknown', // Would need more context to determine source
        target,
        type,
        isExternal,
        packageName
      };

    } catch {
      return null;
    }
  }

  private extractKeywords(taskDescription: string): string[] {
    const words = taskDescription.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['the', 'and', 'for', 'with', 'this', 'that'].includes(word));

    return words;
  }

  private containsFilePath(text: string): boolean {
    return /[a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+/.test(text);
  }

  private isRelevantToKeywords(text: string, keywords: string[]): boolean {
    const lowerText = text.toLowerCase();
    return keywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Extract error message from result content
   */
  private extractErrorMessage(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      // Extract text from content array
      const textParts = content
        .filter(item => item && typeof item === 'object' && item.type === 'text')
        .map(item => item.text)
        .filter(text => typeof text === 'string');

      return textParts.join('\n') || 'Unknown error occurred';
    }

    if (content && typeof content === 'object' && 'text' in content && typeof (content as { text: unknown }).text === 'string') {
      return (content as { text: string }).text;
    }

    return 'Unknown error occurred';
  }

  /**
   * Extract content string from result content
   */
  private extractContentString(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      // Extract text from content array
      const textParts = content
        .filter(item => item && typeof item === 'object' && item.type === 'text')
        .map(item => item.text)
        .filter(text => typeof text === 'string');

      return textParts.join('\n');
    }

    if (content && typeof content === 'object' && 'text' in content && typeof (content as { text: unknown }).text === 'string') {
      return (content as { text: string }).text;
    }

    return '';
  }

  // ===== NEW ENHANCED METHODS FOR EPIC 6.1 =====

  /**
   * Configure code map generation for a project
   */
  async configureCodeMapGeneration(projectPath: string, config: Record<string, unknown>): Promise<void> {
    try {
      logger.debug(`Configuring code map generation for project: ${projectPath}`);

      // Store configuration for future use
      const configPath = path.join(projectPath, '.vibe-codemap-config.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      logger.info(`Code map configuration saved for project: ${projectPath}`);
    } catch (error) {
      logger.error(`Failed to configure code map generation: ${error}`);
      throw new Error(`Failed to configure code map generation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get code map metadata
   */
  async getCodeMapMetadata(projectPath: string): Promise<CodeMapMetadata> {
    try {
      const codeMapInfo = await this.detectExistingCodeMap(projectPath);
      if (!codeMapInfo) {
        throw new Error('No code map found for project');
      }

      const stats = await fs.stat(codeMapInfo.filePath);
      const content = await fs.readFile(codeMapInfo.filePath, 'utf-8');

      // Extract performance metrics if available
      const performanceMetrics = this.performanceMetrics.get(projectPath) || {
        generationTime: 0,
        parseTime: 0,
        fileCount: 0,
        lineCount: content.split('\n').length
      };

      // Load generation config if exists
      const configPath = path.join(projectPath, '.vibe-codemap-config.json');
      let generationConfig: Record<string, unknown> = {};
      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        generationConfig = JSON.parse(configContent);
      } catch {
        // Config file doesn't exist or is invalid
      }

      return {
        filePath: codeMapInfo.filePath,
        projectPath,
        generatedAt: codeMapInfo.generatedAt,
        fileSize: stats.size,
        version: '1.0.0', // Could be extracted from content or config
        isOptimized: false, // Could be determined from content analysis
        generationConfig,
        performanceMetrics
      };
    } catch (error) {
      logger.error(`Failed to get code map metadata: ${error}`);
      throw new Error(`Failed to get code map metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate code map integrity
   */
  async validateCodeMapIntegrity(projectPath: string): Promise<ValidationResult> {
    try {
      const startTime = Date.now();
      const errors: string[] = [];
      const warnings: string[] = [];
      let integrityScore = 1.0;

      const codeMapInfo = await this.detectExistingCodeMap(projectPath);
      if (!codeMapInfo) {
        return {
          isValid: false,
          errors: ['No code map found for project'],
          warnings: [],
          integrityScore: 0,
          validatedAt: new Date()
        };
      }

      // Check file existence and readability
      try {
        const content = await fs.readFile(codeMapInfo.filePath, 'utf-8');

        // Basic content validation
        if (content.length === 0) {
          errors.push('Code map file is empty');
          integrityScore -= 0.5;
        }

        // Check for required sections
        const requiredSections = ['# Code Map', '## Project Structure', '## Dependencies'];
        for (const section of requiredSections) {
          if (!content.includes(section)) {
            warnings.push(`Missing section: ${section}`);
            integrityScore -= 0.1;
          }
        }

        // Check for file paths validity
        const filePathMatches = content.match(/`[^`]+\.(ts|js|py|java|cpp|c|h|hpp|go|rs|rb|php|cs|swift|kt|scala|clj|ex|elm|hs|ml|fs|vb|pas|d|nim|zig|odin|v|cr|dart|lua|r|jl|m|mm|pl|pm|sh|bash|zsh|fish|ps1|bat|cmd|dockerfile|yaml|yml|json|xml|html|css|scss|sass|less|styl|vue|svelte|jsx|tsx|md|rst|txt|cfg|ini|toml|lock|gitignore|gitattributes|editorconfig|prettierrc|eslintrc|tsconfig|package|requirements|cargo|go\.mod|pom\.xml|build\.gradle|makefile|cmake|dockerfile|docker-compose)`/gi);
        if (filePathMatches && filePathMatches.length > 0) {
          // Validate a sample of file paths
          const samplePaths = filePathMatches.slice(0, 10);
          for (const pathMatch of samplePaths) {
            const filePath = pathMatch.replace(/`/g, '');
            const fullPath = path.resolve(projectPath, filePath);
            try {
              await fs.access(fullPath);
            } catch {
              warnings.push(`Referenced file not found: ${filePath}`);
              integrityScore -= 0.05;
            }
          }
        }

      } catch (error) {
        errors.push(`Failed to read code map file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        integrityScore -= 0.3;
      }

      // Check staleness
      if (await this.isCodeMapStale(projectPath)) {
        warnings.push('Code map is stale and may need regeneration');
        integrityScore -= 0.1;
      }

      const isValid = errors.length === 0 && integrityScore > 0.5;

      logger.debug(`Code map validation completed in ${Date.now() - startTime}ms`);

      return {
        isValid,
        errors,
        warnings,
        integrityScore: Math.max(0, integrityScore),
        validatedAt: new Date()
      };
    } catch (error) {
      logger.error(`Failed to validate code map integrity: ${error}`);
      return {
        isValid: false,
        errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        integrityScore: 0,
        validatedAt: new Date()
      };
    }
  }

  /**
   * Request specific code map data
   */
  async requestCodeMapData(projectPath: string, dataType: CodeMapDataType): Promise<unknown> {
    try {
      logger.debug(`Requesting code map data type: ${dataType} for project: ${projectPath}`);

      switch (dataType) {
        case 'architectural_info':
          return await this.extractArchitecturalInfo(projectPath);

        case 'dependency_info':
          return await this.extractDependencyInfo(projectPath);

        case 'relevant_files':
          throw new Error('relevant_files requires task description parameter');

        case 'metadata':
          return await this.getCodeMapMetadata(projectPath);

        case 'full_content': {
          const codeMapInfo = await this.detectExistingCodeMap(projectPath);
          if (!codeMapInfo) {
            throw new Error('No code map found for project');
          }
          return await fs.readFile(codeMapInfo.filePath, 'utf-8');
        }

        case 'performance_metrics':
          return this.performanceMetrics.get(projectPath) || null;

        default:
          throw new Error(`Unknown data type: ${dataType}`);
      }
    } catch (error) {
      logger.error(`Failed to request code map data: ${error}`);
      throw new Error(`Failed to request code map data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Subscribe to code map updates
   */
  subscribeToCodeMapUpdates(projectPath: string, callback: UpdateCallback): void {
    try {
      if (!this.updateSubscriptions.has(projectPath)) {
        this.updateSubscriptions.set(projectPath, []);
      }

      const callbacks = this.updateSubscriptions.get(projectPath)!;
      callbacks.push(callback);

      logger.debug(`Subscribed to code map updates for project: ${projectPath}`);
    } catch (error) {
      logger.error(`Failed to subscribe to code map updates: ${error}`);
    }
  }

  /**
   * Notify subscribers of code map updates
   */
  private notifySubscribers(event: CodeMapUpdateEvent): void {
    try {
      const callbacks = this.updateSubscriptions.get(event.projectPath);
      if (callbacks) {
        for (const callback of callbacks) {
          try {
            callback(event);
          } catch (error) {
            logger.error(`Error in update callback: ${error}`);
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to notify subscribers: ${error}`);
    }
  }

  /**
   * Enhanced refresh with performance monitoring and notifications
   */
  async refreshCodeMapWithMonitoring(projectPath: string, force = false): Promise<void> {
    const startTime = Date.now();

    try {
      // Notify subscribers that refresh is starting
      this.notifySubscribers({
        type: 'generated',
        projectPath,
        timestamp: new Date(),
        data: { status: 'starting' }
      });

      // Perform the refresh
      await this.refreshCodeMap(projectPath, force);

      // Record performance metrics
      const generationTime = Date.now() - startTime;
      if (this.config.enablePerformanceMonitoring) {
        const existingMetrics = this.performanceMetrics.get(projectPath) || {
          generationTime: 0,
          parseTime: 0,
          fileCount: 0,
          lineCount: 0
        };

        this.performanceMetrics.set(projectPath, {
          ...existingMetrics,
          generationTime
        });
      }

      // Notify subscribers of completion
      this.notifySubscribers({
        type: 'refreshed',
        projectPath,
        timestamp: new Date(),
        data: {
          status: 'completed',
          generationTime
        }
      });

      logger.info(`Code map refresh completed in ${generationTime}ms for project: ${projectPath}`);
    } catch (error) {
      // Notify subscribers of error
      this.notifySubscribers({
        type: 'error',
        projectPath,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }
  }
}
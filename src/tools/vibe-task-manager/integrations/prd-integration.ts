/**
 * PRD Integration Service
 *
 * Integrates with the existing prd-generator tool to provide project context
 * for task decomposition. Handles PRD discovery, parsing, and context integration
 * with error handling and caching.
 */

import fs from 'fs/promises';
import path from 'path';
import logger from '../../../logger.js';
import type { PRDInfo, ParsedPRD } from '../types/artifact-types.js';
import type { ProjectContext } from '../types/project-context.js';
import { PathSecurityValidator } from '../utils/path-security-validator.js';

/**
 * PRD parsing result
 */
export interface PRDResult {
  /** Success status */
  success: boolean;
  /** Parsed PRD data */
  prdData?: ParsedPRD;
  /** Error message if parsing failed */
  error?: string;
  /** Parsing time in milliseconds */
  parsingTime?: number;
}

/**
 * PRD integration configuration
 */
interface PRDIntegrationConfig {
  /** Maximum age of PRD before considering it stale (in milliseconds) */
  maxAge: number;
  /** Whether to cache PRD results */
  enableCaching: boolean;
  /** Maximum number of cached PRDs */
  maxCacheSize: number;
  /** Performance monitoring enabled */
  enablePerformanceMonitoring: boolean;
}

/**
 * PRD metadata information
 */
export interface PRDMetadata {
  /** PRD file path */
  filePath: string;
  /** Project path */
  projectPath: string;
  /** Creation timestamp */
  createdAt: Date;
  /** File size in bytes */
  fileSize: number;
  /** PRD version */
  version: string;
  /** Performance metrics */
  performanceMetrics: {
    parsingTime: number;
    fileSize: number;
    featureCount: number;
    sectionCount: number;
  };
}

/**
 * PRD validation result
 */
export interface PRDValidationResult {
  /** Whether the PRD is valid */
  isValid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Completeness score (0-1) */
  completenessScore: number;
  /** Validation timestamp */
  validatedAt: Date;
}

/**
 * PRD data types for API requests
 */
export type PRDDataType =
  | 'overview'
  | 'features'
  | 'technical'
  | 'constraints'
  | 'metadata'
  | 'full_content';

/**
 * PRD Integration Service implementation
 */
export class PRDIntegrationService {
  private static instance: PRDIntegrationService;
  private config: PRDIntegrationConfig;
  private prdCache = new Map<string, PRDInfo>();
  private performanceMetrics = new Map<string, PRDMetadata['performanceMetrics']>();
  private pathValidator: PathSecurityValidator;

  private constructor() {
    this.config = {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      enableCaching: true,
      maxCacheSize: 50,
      enablePerformanceMonitoring: true
    };

    // Initialize path security validator with PRD-specific configuration
    this.pathValidator = new PathSecurityValidator({
      allowedExtensions: ['.md'],
      strictMode: true,
      allowSymlinks: false
    });

    logger.debug('PRD integration service initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PRDIntegrationService {
    if (!PRDIntegrationService.instance) {
      PRDIntegrationService.instance = new PRDIntegrationService();
    }
    return PRDIntegrationService.instance;
  }

  /**
   * Parse PRD for a project
   */
  async parsePRD(prdFilePath: string): Promise<PRDResult> {
    const startTime = Date.now();

    try {
      logger.info({ prdFilePath }, 'Starting PRD parsing');

      // Validate PRD file path
      await this.validatePRDPath(prdFilePath);

      // Read PRD content
      const prdContent = await fs.readFile(prdFilePath, 'utf-8');

      // Parse PRD content
      const prdData = await this.parsePRDContent(prdContent, prdFilePath);

      const parsingTime = Date.now() - startTime;

      // Update cache
      if (this.config.enableCaching) {
        await this.updatePRDCache(prdFilePath);
      }

      logger.info({
        prdFilePath,
        parsingTime,
        featureCount: prdData.features.length
      }, 'PRD parsing completed successfully');

      return {
        success: true,
        prdData,
        parsingTime
      };

    } catch (error) {
      const parsingTime = Date.now() - startTime;
      logger.error({ err: error, prdFilePath }, 'PRD parsing failed with exception');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        parsingTime
      };
    }
  }

  /**
   * Detect existing PRD for a project
   */
  async detectExistingPRD(projectPath?: string): Promise<PRDInfo | null> {
    try {
      // Check cache first
      if (this.config.enableCaching && projectPath && this.prdCache.has(projectPath)) {
        const cached = this.prdCache.get(projectPath)!;

        // Verify file still exists
        try {
          await fs.access(cached.filePath);
          return cached;
        } catch {
          // File no longer exists, remove from cache
          this.prdCache.delete(projectPath);
        }
      }

      // Look for PRD files in the output directory
      const prdFiles = await this.findPRDFiles(projectPath);

      if (prdFiles.length === 0) {
        return null;
      }

      // Get the most recent PRD
      const mostRecent = prdFiles.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      // Update cache
      if (this.config.enableCaching && projectPath) {
        this.prdCache.set(projectPath, mostRecent);
      }

      return mostRecent;

    } catch (error) {
      logger.warn({ err: error, projectPath }, 'Failed to detect existing PRD');
      return null;
    }
  }

  /**
   * Validate PRD file path with security checks
   */
  private async validatePRDPath(prdFilePath: string): Promise<void> {
    try {
      // Use secure path validation
      const validationResult = await this.pathValidator.validatePath(prdFilePath);

      if (!validationResult.isValid) {
        throw new Error(`Security validation failed: ${validationResult.error}`);
      }

      // Log any security warnings
      if (validationResult.warnings && validationResult.warnings.length > 0) {
        logger.warn({
          prdFilePath,
          warnings: validationResult.warnings
        }, 'PRD path validation warnings');
      }

      // Additional PRD-specific validation
      if (!prdFilePath.endsWith('.md')) {
        throw new Error('PRD file must be a Markdown file (.md)');
      }

    } catch (error) {
      logger.error({ err: error, prdFilePath }, 'PRD path validation failed');
      throw new Error(`Invalid PRD file path: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update PRD cache
   */
  private async updatePRDCache(prdFilePath: string): Promise<void> {
    try {
      const stats = await fs.stat(prdFilePath);
      const fileName = path.basename(prdFilePath);
      
      // Extract project name and creation date from filename
      const { projectName, createdAt } = this.extractPRDMetadataFromFilename(fileName);

      const prdInfo: PRDInfo = {
        filePath: prdFilePath,
        fileName,
        createdAt,
        projectName,
        fileSize: stats.size,
        isAccessible: true,
        lastModified: stats.mtime
      };

      // Use project name as cache key
      this.prdCache.set(projectName, prdInfo);

      // Maintain cache size limit
      if (this.prdCache.size > this.config.maxCacheSize) {
        const oldestKey = this.prdCache.keys().next().value;
        if (oldestKey) {
          this.prdCache.delete(oldestKey);
        }
      }

    } catch (error) {
      logger.warn({ err: error, prdFilePath }, 'Failed to update PRD cache');
    }
  }

  /**
   * Extract metadata from PRD filename
   */
  private extractPRDMetadataFromFilename(fileName: string): { projectName: string; createdAt: Date } {
    // Expected format: YYYY-MM-DDTHH-mm-ss-sssZ-project-name-prd.md
    const match = fileName.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-(.+)-prd\.md$/);

    if (match) {
      const [, timestamp, projectSlug] = match;
      const createdAt = new Date(timestamp.replace(/-/g, ':').replace(/T(\d{2}):(\d{2}):(\d{2}):(\d{3})Z/, 'T$1:$2:$3.$4Z'));
      const projectName = projectSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      return { projectName, createdAt };
    }

    // Fallback for non-standard filenames
    return {
      projectName: fileName.replace(/-prd\.md$/, '').replace(/-/g, ' '),
      createdAt: new Date()
    };
  }

  /**
   * Find existing PRD files for a project
   */
  private async findPRDFiles(projectPath?: string): Promise<PRDInfo[]> {
    try {
      // Get the output directory from environment or default
      const outputBaseDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
      const prdOutputDir = path.join(outputBaseDir, 'prd-generator');

      // Check if output directory exists
      try {
        await fs.access(prdOutputDir);
      } catch {
        return []; // No output directory means no PRDs
      }

      // Find all .md files in the output directory
      const files = await fs.readdir(prdOutputDir, { withFileTypes: true });
      const prdFiles: PRDInfo[] = [];

      for (const file of files) {
        if (file.isFile() && file.name.endsWith('-prd.md')) {
          const filePath = path.join(prdOutputDir, file.name);

          try {
            const stats = await fs.stat(filePath);
            const { projectName, createdAt } = this.extractPRDMetadataFromFilename(file.name);

            // If projectPath is specified, filter by project name
            if (projectPath) {
              const expectedProjectName = path.basename(projectPath).toLowerCase();
              if (!projectName.toLowerCase().includes(expectedProjectName)) {
                continue;
              }
            }

            prdFiles.push({
              filePath,
              fileName: file.name,
              createdAt,
              projectName,
              fileSize: stats.size,
              isAccessible: true,
              lastModified: stats.mtime
            });

          } catch (error) {
            logger.warn({ err: error, fileName: file.name }, 'Failed to process PRD file');

            // Add as inaccessible file
            const { projectName, createdAt } = this.extractPRDMetadataFromFilename(file.name);
            prdFiles.push({
              filePath: path.join(prdOutputDir, file.name),
              fileName: file.name,
              createdAt,
              projectName,
              fileSize: 0,
              isAccessible: false,
              lastModified: new Date()
            });
          }
        }
      }

      return prdFiles;

    } catch (error) {
      logger.error({ err: error, projectPath }, 'Failed to find PRD files');
      return [];
    }
  }

  /**
   * Parse PRD content from markdown
   */
  private async parsePRDContent(content: string, filePath: string): Promise<ParsedPRD> {
    const startTime = Date.now();

    try {
      // Validate file path before accessing file system
      const validationResult = await this.pathValidator.validatePath(filePath);
      if (!validationResult.isValid) {
        throw new Error(`Security validation failed: ${validationResult.error}`);
      }

      const lines = content.split('\n');
      const fileName = path.basename(filePath);
      const { projectName, createdAt } = this.extractPRDMetadataFromFilename(fileName);
      const stats = await fs.stat(validationResult.sanitizedPath!);

      // Initialize parsed PRD structure
      const parsedPRD: ParsedPRD = {
        metadata: {
          filePath,
          projectName,
          createdAt,
          fileSize: stats.size
        },
        overview: {
          description: '',
          businessGoals: [],
          productGoals: [],
          successMetrics: []
        },
        targetAudience: {
          primaryUsers: [],
          demographics: [],
          userNeeds: []
        },
        features: [],
        technical: {
          techStack: [],
          architecturalPatterns: [],
          performanceRequirements: [],
          securityRequirements: [],
          scalabilityRequirements: []
        },
        constraints: {
          timeline: [],
          budget: [],
          resources: [],
          technical: []
        }
      };

      // Parse content sections
      let currentSection = '';
      let currentSubsection = '';
      let featureId = 1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect main sections
        if (line.startsWith('# ')) {
          currentSection = line.substring(2).toLowerCase();
          currentSubsection = '';
          continue;
        }

        // Detect subsections
        if (line.startsWith('## ')) {
          currentSubsection = line.substring(3).toLowerCase();
          continue;
        }

        // Detect sub-subsections
        if (line.startsWith('### ')) {
          currentSubsection = line.substring(4).toLowerCase();
          continue;
        }

        // Parse content based on current section
        this.parsePRDSection(line, currentSection, currentSubsection, parsedPRD, featureId);

        // Increment feature ID for features section
        if (currentSection.includes('feature') && line.startsWith('- **') && line.includes(':**')) {
          featureId++;
        }
      }

      // Record performance metrics
      if (this.config.enablePerformanceMonitoring) {
        const parsingTime = Date.now() - startTime;
        this.performanceMetrics.set(filePath, {
          parsingTime,
          fileSize: stats.size,
          featureCount: parsedPRD.features.length,
          sectionCount: 5 // overview, target audience, features, technical, constraints
        });
      }

      return parsedPRD;

    } catch (error) {
      logger.error({ err: error, filePath }, 'Failed to parse PRD content');
      throw error;
    }
  }

  /**
   * Parse individual PRD section content
   */
  private parsePRDSection(
    line: string,
    section: string,
    subsection: string,
    parsedPRD: ParsedPRD,
    featureId: number
  ): void {
    if (!line || line.startsWith('#')) return;

    // Parse based on section and subsection
    if (section.includes('introduction') || section.includes('overview') || section.includes('comprehensive app prd')) {
      if (subsection.includes('description') && line.length > 10 && !line.startsWith('- ')) {
        parsedPRD.overview.description += line + ' ';
      } else if (line.startsWith('- ')) {
        if (subsection.includes('business') && subsection.includes('goal')) {
          parsedPRD.overview.businessGoals.push(line.substring(2));
        } else if (subsection.includes('product') && subsection.includes('goal')) {
          parsedPRD.overview.productGoals.push(line.substring(2));
        } else if (subsection.includes('success') && subsection.includes('metric')) {
          parsedPRD.overview.successMetrics.push(line.substring(2));
        }
      }
      // Handle direct content under main section
      if (!subsection && line.length > 10 && !line.startsWith('- ') && !line.startsWith('#')) {
        parsedPRD.overview.description += line + ' ';
      }
    }

    if (section.includes('target') || section.includes('audience')) {
      if (line.startsWith('- ')) {
        if (subsection.includes('user') || subsection.includes('primary')) {
          parsedPRD.targetAudience.primaryUsers.push(line.substring(2));
        } else if (subsection.includes('demographic')) {
          parsedPRD.targetAudience.demographics.push(line.substring(2));
        } else if (subsection.includes('need')) {
          parsedPRD.targetAudience.userNeeds.push(line.substring(2));
        }
      }
    }

    if (section.includes('feature') || section.includes('functionality')) {
      if (line.startsWith('- **') && line.includes(':**')) {
        // New feature
        const match = line.match(/- \*\*(.+?):\*\*\s*(.+)/);
        if (match) {
          const [, title, description] = match;
          parsedPRD.features.push({
            id: `F${featureId.toString().padStart(3, '0')}`,
            title: title.trim(),
            description: description.trim(),
            userStories: [],
            acceptanceCriteria: [],
            priority: 'medium'
          });
        }
      } else if (line.startsWith('  - ') && parsedPRD.features.length > 0) {
        // Feature details
        const lastFeature = parsedPRD.features[parsedPRD.features.length - 1];
        if (subsection.includes('story') || subsection.includes('user')) {
          lastFeature.userStories.push(line.substring(4));
        } else if (subsection.includes('criteria') || subsection.includes('acceptance')) {
          lastFeature.acceptanceCriteria.push(line.substring(4));
        }
      }
    }

    if (section.includes('technical') || section.includes('technology')) {
      if (line.startsWith('- ')) {
        if (subsection.includes('stack') || subsection.includes('technology')) {
          parsedPRD.technical.techStack.push(line.substring(2));
        } else if (subsection.includes('pattern') || subsection.includes('architecture')) {
          parsedPRD.technical.architecturalPatterns.push(line.substring(2));
        } else if (subsection.includes('performance')) {
          parsedPRD.technical.performanceRequirements.push(line.substring(2));
        } else if (subsection.includes('security')) {
          parsedPRD.technical.securityRequirements.push(line.substring(2));
        } else if (subsection.includes('scalability')) {
          parsedPRD.technical.scalabilityRequirements.push(line.substring(2));
        }
      }
    }

    if (section.includes('constraint') || section.includes('limitation')) {
      if (line.startsWith('- ')) {
        if (subsection.includes('timeline') || subsection.includes('schedule')) {
          parsedPRD.constraints.timeline.push(line.substring(2));
        } else if (subsection.includes('budget') || subsection.includes('cost')) {
          parsedPRD.constraints.budget.push(line.substring(2));
        } else if (subsection.includes('resource') || subsection.includes('team')) {
          parsedPRD.constraints.resources.push(line.substring(2));
        } else if (subsection.includes('technical')) {
          parsedPRD.constraints.technical.push(line.substring(2));
        }
      }
    }
  }

  /**
   * Get PRD metadata
   */
  async getPRDMetadata(prdFilePath: string): Promise<PRDMetadata> {
    try {
      // Validate PRD file path first
      await this.validatePRDPath(prdFilePath);

      const stats = await fs.stat(prdFilePath);
      const fileName = path.basename(prdFilePath);
      const { projectName, createdAt } = this.extractPRDMetadataFromFilename(fileName);

      // Get performance metrics if available
      const performanceMetrics = this.performanceMetrics.get(prdFilePath) || {
        parsingTime: 0,
        fileSize: stats.size,
        featureCount: 0,
        sectionCount: 0
      };

      return {
        filePath: prdFilePath,
        projectPath: '', // Will be determined by caller
        createdAt,
        fileSize: stats.size,
        version: '1.0', // Default version
        performanceMetrics
      };

    } catch (error) {
      logger.error({ err: error, prdFilePath }, 'Failed to get PRD metadata');
      throw error;
    }
  }

  /**
   * Clear PRD cache
   */
  clearCache(): void {
    this.prdCache.clear();
    this.performanceMetrics.clear();
    logger.info('PRD integration cache cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PRDIntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.debug({ config: this.config }, 'PRD integration configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): PRDIntegrationConfig {
    return { ...this.config };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): Map<string, PRDMetadata['performanceMetrics']> {
    return new Map(this.performanceMetrics);
  }
}

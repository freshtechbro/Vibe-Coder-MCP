/**
 * Context Curator Service - Main Orchestration Service
 * 
 * Orchestrates the complete Context Curator workflow:
 * Intent Analysis → Prompt Refinement → File Discovery → Relevance Scoring → Meta-Prompt Generation
 */

import { promises as fs } from 'fs';
import path from 'path';
import { ContextCuratorLLMService } from './llm-integration.js';
import { ContextCuratorConfigLoader } from './config-loader.js';
import { OutputFormatterService } from './output-formatter.js';
import { jobManager, JobStatus } from '../../../services/job-manager/index.js';
// import { JobDetails } from '../../../services/job-manager/jobStatusMessage.js'; // Currently unused
import { executeCodeMapGeneration } from '../../code-map-generator/index.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { UnifiedSecurityConfiguration } from '../../vibe-task-manager/security/unified-security-config.js';
import { SecurityBoundaryValidator } from '../../code-map-generator/utils/securityBoundaryValidator.js';
import {
  ContextCuratorInput,
  ContextPackage as OriginalContextPackage,
  ContextCuratorConfig,
  // validateContextCuratorInput, // Currently unused
  contextPackageSchema,
  PrioritizedFile,
  MultiStrategyFileDiscoveryResult,
  OutputFormat,
  ContextFile
} from '../types/context-curator.js';
import { ContextPackage as OutputContextPackage, ProcessedFile, FileReference } from '../types/output-package.js';

// Use the original ContextPackage type for the WorkflowContext
type ContextPackage = OriginalContextPackage;
import {
  FileDiscoveryResult,
  FileDiscoveryFile,
  LanguageAnalysisResult,
  ProjectTypeAnalysisResult,
  IntentAnalysisResult,
  PromptRefinementResult,
  RelevanceScoringResult,
  MetaPromptGenerationResult
} from '../types/llm-tasks.js';
// import { XMLFormatter } from '../utils/xml-formatter.js'; // Currently unused
import { ContextCuratorError } from '../utils/error-handling.js';
import { TokenEstimator } from '../utils/token-estimator.js';
// import { LanguageHandlerRegistry } from '../../code-map-generator/languageHandlers/registry.js'; // Currently unused
import { languageConfigurations } from '../../code-map-generator/parser.js';
import logger from '../../../logger.js';

// Type-safe helper functions for OutputContextPackage properties
function getPackageFilesIncluded(pkg: OutputContextPackage): number {
  return pkg.metadata.filesIncluded;
}

function getPackageTotalTokenEstimate(pkg: OutputContextPackage): number {
  return pkg.metadata.totalTokenEstimate;
}

function getMaxFilesFromContext(context: unknown): number | undefined {
  if (context && typeof context === 'object' && 'maxFiles' in context) {
    const maxFiles = (context as { maxFiles: unknown }).maxFiles;
    return typeof maxFiles === 'number' ? maxFiles : undefined;
  }
  return undefined;
}

/**
 * Context Curator workflow phases
 */
export enum WorkflowPhase {
  INITIALIZATION = 'initialization',
  INTENT_ANALYSIS = 'intent_analysis',
  PROMPT_REFINEMENT = 'prompt_refinement',
  FILE_DISCOVERY = 'file_discovery',
  RELEVANCE_SCORING = 'relevance_scoring',
  META_PROMPT_GENERATION = 'meta_prompt_generation',
  PACKAGE_ASSEMBLY = 'package_assembly',
  OUTPUT_GENERATION = 'output_generation',
  COMPLETED = 'completed'
}

/**
 * Workflow execution context
 */
interface WorkflowContext {
  jobId: string;
  input: ContextCuratorInput;
  config: OpenRouterConfig;
  contextCuratorConfig?: Record<string, unknown>; // Context Curator specific config
  securityConfig?: UnifiedSecurityConfiguration; // Security configuration
  securityValidator?: SecurityBoundaryValidator; // Security boundary validator
  currentPhase: WorkflowPhase;
  startTime: number;

  // Phase results
  codemapSummary?: string; // Kept for backward compatibility
  codemapContent?: string; // Complete codemap content
  codemapPath?: string; // Path to the generated codemap file
  fileContents?: Map<string, string>; // File path -> content mapping with optimization
  intentAnalysis?: IntentAnalysisResult;
  promptRefinement?: PromptRefinementResult;
  fileDiscovery?: FileDiscoveryResult;
  relevanceScoring?: RelevanceScoringResult;
  metaPromptGeneration?: MetaPromptGenerationResult;
  contextPackage?: ContextPackage;

  // Progress tracking
  totalPhases: number;
  completedPhases: number;
  errors: string[];
  warnings: string[];
}

/**
 * Language-agnostic project type detection interfaces
 */
// Currently unused interface
// interface LanguageInfo {
//   extension: string;
//   name: string;
//   category: string;
//   ecosystems: string[];
//   projectTypes: string[];
// }

interface LanguageProfile {
  primary: string;
  secondary: string[];
  distribution: Map<string, number>;
  totalFiles: number;
  confidence: number;
}

interface PackageManagerInfo {
  pattern: string;
  manager: string;
  ecosystem: string;
  supportedLanguages: string[];
  confidence: number;
}

interface StructurePattern {
  pattern: string;
  types: string[];
  weight: number;
  evidence: string[];
}

interface StructureAnalysis {
  patterns: StructurePattern[];
  projectTypes: string[];
  confidence: number;
}

interface TechnologyProfile {
  detectedTechnologies: string[];
  primaryStack: string;
  confidence: number;
}

interface ProjectTypeScore {
  type: string;
  confidence: number;
  evidence: string[];
  sources: string[];
}

// Unused interface - removing
// interface ValidationResult {
//   isValid: boolean;
//   confidence: number;
//   failedChecks: string[];
//   recommendations: string[];
// }

/**
 * Main Context Curator Service
 */
export class ContextCuratorService {
  private static instance: ContextCuratorService | null = null;
  private llmService: ContextCuratorLLMService;
  private configLoader: ContextCuratorConfigLoader;
  private outputFormatter: OutputFormatterService;

  private constructor() {
    this.llmService = ContextCuratorLLMService.getInstance();
    this.configLoader = ContextCuratorConfigLoader.getInstance();
    this.outputFormatter = OutputFormatterService.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ContextCuratorService {
    if (!ContextCuratorService.instance) {
      ContextCuratorService.instance = new ContextCuratorService();
    }
    return ContextCuratorService.instance;
  }

  /**
   * Execute the complete Context Curator workflow
   */
  async executeWorkflow(
    jobId: string,
    input: ContextCuratorInput,
    config: OpenRouterConfig
  ): Promise<ContextPackage> {
    const context: WorkflowContext = {
      jobId,
      input,
      config,
      currentPhase: WorkflowPhase.INITIALIZATION,
      startTime: Date.now(),
      totalPhases: 8,
      completedPhases: 0,
      errors: [],
      warnings: []
    };

    logger.info({ 
      jobId, 
      userPrompt: input.userPrompt.substring(0, 100) + '...',
      projectPath: input.projectPath,
      taskType: input.taskType
    }, 'Starting Context Curator workflow execution');

    try {
      // Update job status to running
      jobManager.updateJobStatus(
        jobId,
        JobStatus.RUNNING,
        'Context Curator workflow execution started',
        0,
        {
          currentStage: 'initialization',
          diagnostics: [`Starting 8-phase workflow for ${input.taskType} task`],
          metadata: {
            taskType: input.taskType,
            projectPath: input.projectPath,
            totalPhases: 8
          }
        }
      );

      // Execute workflow phases
      await this.executeInitialization(context);
      await this.executeIntentAnalysis(context);
      await this.executePromptRefinement(context);
      await this.executeFileDiscovery(context);
      await this.executeRelevanceScoring(context);
      await this.executeMetaPromptGeneration(context);
      await this.executePackageAssembly(context);
      await this.executeOutputGeneration(context);

      // Mark as completed
      context.currentPhase = WorkflowPhase.COMPLETED;
      const executionTime = Date.now() - context.startTime;

      logger.info({ 
        jobId, 
        executionTime,
        totalFiles: context.contextPackage?.files.length || 0,
        totalTokens: context.contextPackage?.statistics.totalTokens || 0
      }, 'Context Curator workflow completed successfully');

      // Update job status to completed
      jobManager.updateJobStatus(
        jobId,
        JobStatus.COMPLETED,
        'Context Curator workflow completed successfully',
        100,
        {
          currentStage: 'workflow_complete',
          diagnostics: [
            `All 8 phases completed successfully`,
            `Total execution time: ${executionTime}ms`,
            `Total files processed: ${context.contextPackage?.files.length || 0}`,
            `Total tokens generated: ${context.contextPackage?.statistics.totalTokens || 0}`,
            `Task type: ${input.taskType}`,
            `Project: ${input.projectPath}`
          ],
          subProgress: 100,
          metadata: {
            executionTimeMs: executionTime,
            totalFiles: context.contextPackage?.files.length || 0,
            totalTokens: context.contextPackage?.statistics.totalTokens || 0,
            taskType: input.taskType,
            projectPath: input.projectPath,
            allPhasesCompleted: true,
            phase: 'complete'
          }
        }
      );

      return context.contextPackage!;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ jobId, error: errorMessage, phase: context.currentPhase }, 'Context Curator workflow failed');

      // Update job status to failed
      jobManager.updateJobStatus(
        jobId,
        JobStatus.FAILED,
        `Workflow failed in ${context.currentPhase}: ${errorMessage}`,
        Math.round((context.completedPhases / context.totalPhases) * 100)
      );

      throw new ContextCuratorError(`Workflow failed in ${context.currentPhase}: ${errorMessage}`);
    }
  }

  /**
   * Phase 1: Initialization - Load configuration and generate codemap
   */
  private async executeInitialization(context: WorkflowContext): Promise<void> {
    context.currentPhase = WorkflowPhase.INITIALIZATION;
    logger.info({ jobId: context.jobId }, 'Executing initialization phase');

    try {
      // Load configuration
      const configResult = await this.configLoader.loadConfig();
      if (!configResult.success) {
        context.warnings.push(`Configuration warning: ${configResult.error}`);
      }
      context.contextCuratorConfig = this.configLoader.getConfig() || undefined;

      // Initialize security configuration using environment variables and input
      // Use CODE_MAP_ALLOWED_DIR as the primary read directory since Context Curator
      // needs to read from the same directory that Code Map Generator maps
      const allowedReadDirectory = process.env.CODE_MAP_ALLOWED_DIR ||
                                   process.env.VIBE_TASK_MANAGER_READ_DIR ||
                                   context.input.projectPath ||
                                   process.cwd();
      const allowedWriteDirectory = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');

      context.securityConfig = {
        allowedReadDirectory,
        allowedWriteDirectory,
        securityMode: (process.env.VIBE_TASK_MANAGER_SECURITY_MODE as 'strict' | 'permissive') || 'strict',
        allowedDirectories: [allowedReadDirectory, allowedWriteDirectory],
        performanceThresholdMs: 50,
        enablePermissionChecking: true,
        enableBlacklist: true,
        enableExtensionFiltering: true,
        maxPathLength: 4096,
        // Code-map-generator compatibility aliases
        allowedDir: allowedReadDirectory,
        outputDir: allowedWriteDirectory,
        // Service-specific boundaries for all services
        serviceBoundaries: {
          vibeTaskManager: {
            readDir: allowedReadDirectory,
            writeDir: allowedWriteDirectory
          },
          codeMapGenerator: {
            allowedDir: allowedReadDirectory,
            outputDir: allowedWriteDirectory
          },
          contextCurator: {
            readDir: allowedReadDirectory,
            outputDir: allowedWriteDirectory
          }
        }
      };

      // Create security boundary validator with proper read/write directories
      context.securityValidator = new SecurityBoundaryValidator(
        allowedReadDirectory,
        allowedWriteDirectory
      );

      logger.info({
        allowedReadDirectory,
        allowedWriteDirectory,
        securityMode: context.securityConfig?.securityMode || 'strict',
        configSource: process.env.CODE_MAP_ALLOWED_DIR ? 'CODE_MAP_ALLOWED_DIR' :
                     process.env.VIBE_TASK_MANAGER_READ_DIR ? 'VIBE_TASK_MANAGER_READ_DIR' :
                     context.input.projectPath ? 'input.projectPath' : 'process.cwd()'
      }, 'Context Curator security configuration initialized');



      // Check for cached codemap first, then generate if needed
      logger.debug({
        jobId: context.jobId,
        projectPath: context.input.projectPath,
        useCache: context.input.useCodeMapCache,
        maxAgeMinutes: context.input.codeMapCacheMaxAgeMinutes
      }, 'Checking for cached codemap');

      let codemapContent = '';
      let codemapPath = '';
      let fromCache = false;

      // Try to use cached codemap if enabled
      if (context.input.useCodeMapCache) {
        try {
          const { CodemapCacheManager } = await import('../utils/codemap-cache.js');
          const cachedResult = await CodemapCacheManager.findRecentCodemap(
            context.input.codeMapCacheMaxAgeMinutes,
            context.securityConfig?.allowedWriteDirectory
          );

          if (cachedResult) {
            codemapContent = cachedResult.content;
            codemapPath = cachedResult.path;
            fromCache = true;

            logger.info({
              jobId: context.jobId,
              codemapPath,
              ageMinutes: Math.round((Date.now() - cachedResult.timestamp.getTime()) / (60 * 1000)),
              contentLength: codemapContent.length
            }, 'Using cached codemap - skipping generation');
          } else {
            logger.debug({ jobId: context.jobId }, 'No recent cached codemap found, generating fresh');
          }
        } catch (cacheError) {
          logger.warn({
            jobId: context.jobId,
            error: cacheError instanceof Error ? cacheError.message : 'Unknown cache error'
          }, 'Cache check failed, falling back to fresh generation');
        }
      } else {
        logger.debug({ jobId: context.jobId }, 'Codemap cache disabled, generating fresh');
      }

      // Generate fresh codemap if not using cache or cache miss
      if (!fromCache) {
        logger.debug({ jobId: context.jobId, projectPath: context.input.projectPath }, 'Generating fresh codemap');

        // Inherit maxContentLength from Code-Map Generator defaults (0 = maximum aggressive optimization)
        const maxContentLength = (context.contextCuratorConfig as ContextCuratorConfig)?.contentDensity?.maxContentLength ?? 0;

      // Create enhanced configuration with security settings for Code Map Generator
      const enhancedConfig = {
        ...context.config,
        // Ensure Code Map Generator uses the same security configuration
        config: {
          ...context.config.config,
          'map-codebase': {
            allowedMappingDirectory: context.securityConfig?.allowedReadDirectory,
            outputDirectory: context.securityConfig?.allowedWriteDirectory
          }
        }
      };

      const codemapResult = await executeCodeMapGeneration(
        {
          allowedMappingDirectory: context.securityConfig?.allowedReadDirectory,
          maxOptimizationLevel: 'aggressive',
          contentDensity: {
            maxContentLength, // Inherit from configuration
            preserveComments: (context.contextCuratorConfig as ContextCuratorConfig)?.contentDensity?.preserveComments ?? true,
            preserveTypes: (context.contextCuratorConfig as ContextCuratorConfig)?.contentDensity?.preserveTypes ?? true,
            optimizationThreshold: (context.contextCuratorConfig as ContextCuratorConfig)?.contentDensity?.optimizationThreshold ?? 1000
          }
        },
        enhancedConfig,
        {
          sessionId: `context-curator-${context.jobId}`,
          transportType: 'stdio'
        },
        context.jobId
      );

      if (codemapResult.isError) {
        const errorMessage = codemapResult.content?.[0]?.text || 'Unknown error';
        throw new Error(`Codemap generation failed: ${errorMessage}`);
      }

        // Extract the actual codemap path from the result and read the file content
        try {
        const resultText = codemapResult.content[0]?.text;
        logger.debug({
          resultTextType: typeof resultText,
          resultTextLength: typeof resultText === 'string' ? resultText.length : 0,
          resultTextPreview: typeof resultText === 'string' ? resultText.substring(0, 200) : 'NOT_STRING'
        }, 'Analyzing codemap result text');

        if (typeof resultText === 'string') {
          // The result text is a summary, not JSON. Extract the file path from the summary.
          // Look for pattern: "**Output saved to:** /path/to/file.md"
          const outputPathMatch = resultText.match(/\*\*Output saved to:\*\*\s*(.+\.md)/);

          if (outputPathMatch) {
            codemapPath = outputPathMatch[1].trim();

            logger.debug({
              extractedPath: codemapPath,
              matchedText: outputPathMatch[0]
            }, 'Extracted codemap path from summary text');

            // Read the actual codemap file content
            const fs = await import('fs/promises');
            const fsExtra = await import('fs-extra');
            if (await fsExtra.pathExists(codemapPath)) {
              codemapContent = await fs.readFile(codemapPath, 'utf-8');
              logger.info({
                codemapPath,
                codemapSize: codemapContent.length
              }, 'Codemap file read successfully');
            } else {
              logger.warn({ codemapPath }, 'Codemap file does not exist');
              // Fallback to result content if file doesn't exist
              codemapContent = resultText;
            }
          } else {
            logger.warn({ resultText: resultText.substring(0, 500) }, 'No codemap output path found in summary text');
            // Fallback to result content
            codemapContent = resultText;
          }
        } else {
          logger.warn('Codemap result text is not a string');
          throw new Error('Invalid codemap result format');
        }
      } catch (parseError) {
        logger.warn({
          parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
          parseErrorStack: parseError instanceof Error ? parseError.stack : undefined
        }, 'Failed to extract codemap path from summary, using raw content');
        // Fallback to raw result content
        if (codemapResult.content && codemapResult.content.length > 0) {
          const firstContent = codemapResult.content[0];
          if (firstContent.type === 'text' && typeof firstContent.text === 'string') {
            codemapContent = firstContent.text;
          } else {
            throw new Error('Invalid codemap content format');
          }
        } else {
          throw new Error('No codemap content generated');
        }
      }
      }

      // Use the complete codemap content for comprehensive analysis
      // Include full semantic information: classes, functions, imports, exports, etc.
      context.codemapContent = codemapContent;
      context.codemapPath = codemapPath;

      // Also extract file contents with optimization for large files
      logger.info({
        codemapContentLength: codemapContent.length,
        codemapContentPreview: codemapContent.substring(0, 500),
        codemapContentType: typeof codemapContent,
        fromCache
      }, 'About to extract file contents from codemap');

      context.fileContents = await this.extractFileContentsWithOptimization(codemapContent);

      context.completedPhases++;
      const progress = Math.round((context.completedPhases / context.totalPhases) * 100);

      const statusMessage = fromCache ?
        'Initialization completed - using cached codemap' :
        'Initialization completed - codemap generated';

      jobManager.updateJobStatus(
        context.jobId,
        JobStatus.RUNNING,
        statusMessage,
        progress,
        {
          currentStage: 'initialization_complete',
          diagnostics: [
            fromCache ?
              `Cached codemap loaded with ${codemapContent.length} characters` :
              `Codemap generated with ${codemapContent.length} characters`,
            `File contents extracted for ${context.fileContents?.size || 0} files`,
            fromCache ? 'Cache hit - performance optimized' : 'Fresh generation completed'
          ],
          subProgress: 100,
          metadata: {
            codemapSize: codemapContent.length,
            fileContentsCount: context.fileContents?.size || 0,
            phase: 'initialization',
            fromCache,
            cacheEnabled: context.input.useCodeMapCache,
            maxCacheAgeMinutes: context.input.codeMapCacheMaxAgeMinutes
          }
        }
      );

      logger.info({
        jobId: context.jobId,
        codemapLength: codemapContent.length,
        fileContentsCount: context.fileContents?.size || 0,
        fromCache,
        cacheEnabled: context.input.useCodeMapCache
      }, 'Initialization phase completed');

    } catch (error) {
      throw new Error(`Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Phase 2: Intent Analysis - Analyze user intent and task requirements
   */
  private async executeIntentAnalysis(context: WorkflowContext): Promise<void> {
    context.currentPhase = WorkflowPhase.INTENT_ANALYSIS;
    logger.info({ jobId: context.jobId }, 'Executing intent analysis phase');

    try {
      // Enhanced analysis with language detection and comprehensive project analysis
      const patternAnalysis = this.extractArchitecturalPatterns(context.codemapContent!);
      const projectAnalysis = this.detectProjectType(context.codemapContent!);
      const languageAnalysis = await this.detectPrimaryLanguages(context.codemapContent!);

      const additionalContext = {
        projectType: projectAnalysis.projectType,
        projectAnalysis,
        languageAnalysis,
        existingPatterns: patternAnalysis.patterns,
        patternConfidence: patternAnalysis.confidence,
        patternEvidence: patternAnalysis.evidence,
        technicalConstraints: []
      };

      const baseIntentAnalysis = await this.llmService.performIntentAnalysis(
        context.input.userPrompt,
        context.codemapContent!,
        context.config,
        additionalContext
      );

      // Enhance intent analysis result with Phase 2 analysis data
      context.intentAnalysis = {
        ...baseIntentAnalysis,
        projectAnalysis,
        languageAnalysis,
        patternAnalysis: {
          patterns: patternAnalysis.patterns,
          confidence: patternAnalysis.confidence,
          evidence: patternAnalysis.evidence
        }
      };

      context.completedPhases++;
      const progress = Math.round((context.completedPhases / context.totalPhases) * 100);
      
      jobManager.updateJobStatus(
        context.jobId,
        JobStatus.RUNNING,
        `Enhanced intent analysis completed - detected ${context.intentAnalysis.taskType} task`,
        progress,
        {
          currentStage: 'intent_analysis_complete',
          diagnostics: [
            `Task type detected: ${context.intentAnalysis.taskType}`,
            `Project type: ${context.intentAnalysis.projectAnalysis?.projectType || 'unknown'}`,
            `Primary language: ${context.intentAnalysis.languageAnalysis?.primaryLanguage || 'unknown'}`,
            `Patterns detected: ${context.intentAnalysis.patternAnalysis?.patterns.length || 0}`
          ],
          subProgress: 100,
          metadata: {
            taskType: context.intentAnalysis.taskType,
            projectType: context.intentAnalysis.projectAnalysis?.projectType,
            primaryLanguage: context.intentAnalysis.languageAnalysis?.primaryLanguage,
            patternsCount: context.intentAnalysis.patternAnalysis?.patterns.length || 0,
            phase: 'intent_analysis'
          }
        }
      );

      logger.info({
        jobId: context.jobId,
        taskType: context.intentAnalysis.taskType,
        confidence: context.intentAnalysis.confidence,
        enhancedAnalysis: {
          projectType: projectAnalysis.projectType,
          projectConfidence: projectAnalysis.confidence,
          secondaryTypes: projectAnalysis.secondaryTypes.length,
          primaryLanguage: languageAnalysis.primaryLanguage,
          detectedLanguages: languageAnalysis.languages.length,
          frameworkStack: projectAnalysis.frameworkStack.length,
          architecturalPatterns: patternAnalysis.patterns.length,
          averagePatternConfidence: patternAnalysis.patterns.length > 0
            ? Object.values(patternAnalysis.confidence).reduce((sum, conf) => sum + conf, 0) / patternAnalysis.patterns.length
            : 0
        }
      }, 'Enhanced intent analysis phase completed with comprehensive project understanding');

    } catch (error) {
      throw new Error(`Intent analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Phase 3: Prompt Refinement - Refine user prompt with context
   */
  private async executePromptRefinement(context: WorkflowContext): Promise<void> {
    context.currentPhase = WorkflowPhase.PROMPT_REFINEMENT;
    logger.info({ jobId: context.jobId }, 'Executing prompt refinement phase');

    try {
      const patternAnalysis = this.extractArchitecturalPatterns(context.codemapContent!);

      // Enhanced additional context using Phase 2 analysis data
      const additionalContext = {
        projectAnalysis: context.intentAnalysis?.projectAnalysis,
        languageAnalysis: context.intentAnalysis?.languageAnalysis,
        existingPatterns: context.intentAnalysis?.patternAnalysis?.patterns || patternAnalysis.patterns,
        patternConfidence: context.intentAnalysis?.patternAnalysis?.confidence || patternAnalysis.confidence,
        patternEvidence: context.intentAnalysis?.patternAnalysis?.evidence || patternAnalysis.evidence,
        technicalConstraints: this.deriveConstraintsFromProject(context.intentAnalysis?.projectAnalysis),
        qualityRequirements: this.deriveQualityRequirements(context.intentAnalysis?.languageAnalysis),
        timelineConstraints: undefined,
        teamExpertise: this.inferTeamExpertise(context.intentAnalysis?.projectAnalysis)
      };

      context.promptRefinement = await this.llmService.performPromptRefinement(
        context.input.userPrompt,
        context.intentAnalysis!,
        context.codemapContent!,
        context.config,
        additionalContext
      );

      context.completedPhases++;
      const progress = Math.round((context.completedPhases / context.totalPhases) * 100);

      jobManager.updateJobStatus(
        context.jobId,
        JobStatus.RUNNING,
        'Enhanced prompt refinement completed',
        progress
      );

      logger.info({
        jobId: context.jobId,
        originalLength: context.input.userPrompt.length,
        refinedLength: context.promptRefinement.refinedPrompt.length,
        projectType: context.intentAnalysis?.projectAnalysis?.projectType,
        primaryLanguage: context.intentAnalysis?.languageAnalysis?.primaryLanguage
      }, 'Enhanced prompt refinement phase completed with project context');

    } catch (error) {
      throw new Error(`Prompt refinement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Enhanced language-agnostic project type detection
   * Uses Code Map Generator infrastructure for comprehensive multi-language support
   * Detects 12+ modern architectural patterns and project types across 35+ languages
   */
  private detectProjectType(codemapContent: string): ProjectTypeAnalysisResult {
    try {
      // Use enhanced language-agnostic detection
      return this.enhancedProjectTypeDetection(codemapContent);
    } catch (error) {
      logger.warn({ err: error }, 'Enhanced project type detection failed, falling back to legacy method');
      // Fallback to legacy detection for safety
      return this.legacyProjectTypeDetection(codemapContent);
    }
  }

  /**
   * Enhanced language-agnostic project type detection implementation
   * Leverages Code Map Generator's language support for accurate detection
   */
  private enhancedProjectTypeDetection(codemapContent: string): ProjectTypeAnalysisResult {
    // Phase 1: Build language profile from codemap
    const languageProfile = this.buildLanguageProfileFromCodemap(codemapContent);

    // Phase 2: Detect package managers and ecosystems
    const packageManagers = this.detectPackageManagersFromCodemap(codemapContent);

    // Phase 3: Analyze project structure patterns
    const structureAnalysis = this.analyzeUniversalProjectStructure(codemapContent);

    // Phase 4: Perform semantic technology inference
    const technologyProfile = this.performSemanticTechnologyInference(codemapContent);

    // Phase 5: Calculate weighted project type scores
    const projectTypeScores = this.calculateMultiDimensionalScores(
      languageProfile,
      packageManagers,
      structureAnalysis,
      technologyProfile,
      codemapContent
    );

    // Phase 6: Validate and select best match
    const bestMatch = this.selectAndValidateProjectType(
      projectTypeScores,
      languageProfile,
      packageManagers,
      structureAnalysis
    );

    // Phase 7: Generate comprehensive analysis result
    return this.buildProjectTypeAnalysisResult(
      bestMatch,
      projectTypeScores,
      languageProfile,
      packageManagers,
      structureAnalysis,
      technologyProfile,
      codemapContent
    );
  }

  /**
   * Legacy project type detection (fallback)
   * Maintains backward compatibility
   */
  private legacyProjectTypeDetection(codemapContent: string): ProjectTypeAnalysisResult {
    const content = codemapContent.toLowerCase();
    const projectTypes: { type: string; confidence: number; evidence: string[] }[] = [];

    // Web Frontend Applications
    this.analyzeWebFrontendProject(content, projectTypes);

    // Backend/API Applications
    this.analyzeBackendProject(content, projectTypes);

    // Mobile Applications
    this.analyzeMobileProject(content, projectTypes);

    // Desktop Applications
    this.analyzeDesktopProject(content, projectTypes);

    // Data/ML Applications
    this.analyzeDataMLProject(content, projectTypes);

    // DevOps/Infrastructure
    this.analyzeDevOpsProject(content, projectTypes);

    // Game Development
    this.analyzeGameProject(content, projectTypes);

    // Blockchain/Web3
    this.analyzeBlockchainProject(content, projectTypes);

    // Sort by confidence and select primary type
    projectTypes.sort((a, b) => b.confidence - a.confidence);

    const primaryType = projectTypes[0] || { type: 'General Application', confidence: 0.5, evidence: ['Unknown project structure'] };
    const secondaryTypes = projectTypes.slice(1, 4).map(p => p.type);

    // Detect framework stack
    const frameworkStack = this.detectFrameworkStack(content);

    // Detect architecture style
    const architectureStyle = this.detectArchitectureStyle(content);

    // Detect development environment
    const developmentEnvironment = this.detectDevelopmentEnvironment(content);

    return {
      projectType: primaryType.type,
      secondaryTypes,
      confidence: primaryType.confidence,
      evidence: primaryType.evidence,
      frameworkStack,
      architectureStyle,
      developmentEnvironment
    };
  }

  // ========== LANGUAGE-AGNOSTIC PROJECT TYPE DETECTION METHODS ==========

  /**
   * Build language profile from codemap content using Code Map Generator infrastructure
   */
  private buildLanguageProfileFromCodemap(codemapContent: string): LanguageProfile {
    // const registry = LanguageHandlerRegistry.getInstance(); // Currently unused
    // const _supportedExtensions = registry.getRegisteredExtensions(); // Currently unused

    // Extract file extensions from codemap
    const fileExtensions = this.extractFileExtensionsFromCodemap(codemapContent);

    // Map extensions to languages using Code Map Generator configurations
    const languageDistribution = new Map<string, number>();
    let totalFiles = 0;

    for (const [extension, count] of fileExtensions) {
      const config = languageConfigurations[extension];
      if (config) {
        const languageName = config.name;
        languageDistribution.set(languageName, (languageDistribution.get(languageName) || 0) + count);
        totalFiles += count;
      }
    }

    // Calculate percentages and identify primary/secondary languages
    const sortedLanguages = Array.from(languageDistribution.entries())
      .map(([lang, count]) => ({ language: lang, count, percentage: count / totalFiles }))
      .sort((a, b) => b.count - a.count);

    const primary = sortedLanguages[0]?.language || 'Unknown';
    const secondary = sortedLanguages.slice(1, 4).map(l => l.language);

    // Calculate confidence based on primary language dominance
    const primaryPercentage = sortedLanguages[0]?.percentage || 0;
    const confidence = Math.min(primaryPercentage + 0.2, 1.0);

    return {
      primary,
      secondary,
      distribution: languageDistribution,
      totalFiles,
      confidence
    };
  }

  /**
   * Extract file extensions from codemap content
   */
  private extractFileExtensionsFromCodemap(codemapContent: string): Map<string, number> {
    const extensionCounts = new Map<string, number>();

    // Enhanced patterns to match various codemap formats
    const filePatterns = [
      // Pattern: - src/file.ts, ├── file.ts, │   └── file.ts
      /^[\s]*[├│└─\-*•]\s*(.+\.[a-zA-Z0-9]+)/gm,
      // Pattern: src/file.ts (direct file paths)
      /^[\s]*([a-zA-Z0-9_\-/\\]+\.[a-zA-Z0-9]+)[\s]*$/gm,
      // Pattern: ### src/file.ts, ## file.ts
      /^#+\s+(.+\.[a-zA-Z0-9]+)/gm,
      // Pattern: file.ts (simple file names)
      /([a-zA-Z0-9_-]+\.[a-zA-Z0-9]+)/g
    ];

    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(codemapContent)) !== null) {
        const filePath = match[1];
        const extension = this.extractExtension(filePath);
        if (extension && this.isValidFileExtension(extension)) {
          extensionCounts.set(extension, (extensionCounts.get(extension) || 0) + 1);
        }
      }
    }

    // Also look for explicit file mentions in text
    const explicitFilePattern = /\b([a-zA-Z0-9_-]+\.(ts|tsx|js|jsx|py|java|kt|swift|dart|rs|go|rb|php|cs|cpp|c|h|vue|html|css|scss|sass|less|json|yaml|yml|toml|xml|md|txt|sql|sh|bat|ps1|dockerfile|makefile))\b/gi;
    let explicitMatch;
    while ((explicitMatch = explicitFilePattern.exec(codemapContent)) !== null) {
      const fileName = explicitMatch[1];
      const extension = this.extractExtension(fileName);
      if (extension) {
        extensionCounts.set(extension, (extensionCounts.get(extension) || 0) + 1);
      }
    }

    return extensionCounts;
  }

  /**
   * Check if extension is a valid file extension (not a directory or other artifact)
   */
  private isValidFileExtension(extension: string): boolean {
    const validExtensions = [
      '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.kt', '.swift', '.dart',
      '.rs', '.go', '.rb', '.php', '.cs', '.cpp', '.c', '.h', '.hpp', '.cc',
      '.vue', '.html', '.css', '.scss', '.sass', '.less', '.json', '.yaml',
      '.yml', '.toml', '.xml', '.md', '.txt', '.sql', '.sh', '.bat', '.ps1',
      '.dockerfile', '.makefile', '.gradle', '.maven', '.sbt', '.clj', '.cljs',
      '.elm', '.ex', '.exs', '.erl', '.hrl', '.hs', '.lhs', '.ml', '.mli',
      '.fs', '.fsx', '.fsi', '.scala', '.groovy', '.lua', '.r', '.jl', '.nim',
      '.zig', '.odin', '.v', '.cr', '.d', '.pas', '.pp', '.ada', '.adb', '.ads'
    ];

    return validExtensions.includes(extension.toLowerCase());
  }

  /**
   * Extract file extension from file path
   */
  private extractExtension(filePath: string): string | null {
    const match = filePath.match(/\.([a-zA-Z0-9]+)$/);
    return match ? `.${match[1].toLowerCase()}` : null;
  }

  /**
   * Detect package managers from codemap content
   */
  private detectPackageManagersFromCodemap(codemapContent: string): PackageManagerInfo[] {
    const packageManagerPatterns = new Map([
      // JavaScript/TypeScript Ecosystem
      ['package.json', { manager: 'npm/yarn/pnpm', ecosystem: 'JavaScript', languages: ['JavaScript', 'TypeScript'] }],
      ['yarn.lock', { manager: 'yarn', ecosystem: 'JavaScript', languages: ['JavaScript', 'TypeScript'] }],
      ['pnpm-lock.yaml', { manager: 'pnpm', ecosystem: 'JavaScript', languages: ['JavaScript', 'TypeScript'] }],

      // Python Ecosystem
      ['requirements.txt', { manager: 'pip', ecosystem: 'Python', languages: ['Python'] }],
      ['pyproject.toml', { manager: 'poetry/pip', ecosystem: 'Python', languages: ['Python'] }],
      ['Pipfile', { manager: 'pipenv', ecosystem: 'Python', languages: ['Python'] }],
      ['conda.yaml', { manager: 'conda', ecosystem: 'Python', languages: ['Python'] }],
      ['environment.yml', { manager: 'conda', ecosystem: 'Python', languages: ['Python'] }],

      // Java Ecosystem
      ['pom.xml', { manager: 'maven', ecosystem: 'Java', languages: ['Java', 'Scala', 'Kotlin'] }],
      ['build.gradle', { manager: 'gradle', ecosystem: 'Java', languages: ['Java', 'Scala', 'Kotlin'] }],
      ['build.gradle.kts', { manager: 'gradle', ecosystem: 'Kotlin', languages: ['Kotlin', 'Java'] }],
      ['build.sbt', { manager: 'sbt', ecosystem: 'Scala', languages: ['Scala', 'Java'] }],

      // .NET Ecosystem
      ['.csproj', { manager: 'nuget', ecosystem: 'C#', languages: ['C#'] }],
      ['.sln', { manager: 'nuget', ecosystem: 'C#', languages: ['C#'] }],
      ['packages.config', { manager: 'nuget', ecosystem: 'C#', languages: ['C#'] }],

      // Go Ecosystem
      ['go.mod', { manager: 'go modules', ecosystem: 'Go', languages: ['Go'] }],
      ['go.sum', { manager: 'go modules', ecosystem: 'Go', languages: ['Go'] }],

      // Rust Ecosystem
      ['Cargo.toml', { manager: 'cargo', ecosystem: 'Rust', languages: ['Rust'] }],
      ['Cargo.lock', { manager: 'cargo', ecosystem: 'Rust', languages: ['Rust'] }],

      // Ruby Ecosystem
      ['Gemfile', { manager: 'bundler', ecosystem: 'Ruby', languages: ['Ruby'] }],
      ['Gemfile.lock', { manager: 'bundler', ecosystem: 'Ruby', languages: ['Ruby'] }],
      ['.gemspec', { manager: 'gem', ecosystem: 'Ruby', languages: ['Ruby'] }],

      // PHP Ecosystem
      ['composer.json', { manager: 'composer', ecosystem: 'PHP', languages: ['PHP'] }],
      ['composer.lock', { manager: 'composer', ecosystem: 'PHP', languages: ['PHP'] }],

      // Swift Ecosystem
      ['Package.swift', { manager: 'swift package manager', ecosystem: 'Swift', languages: ['Swift'] }],
      ['Podfile', { manager: 'cocoapods', ecosystem: 'iOS', languages: ['Swift', 'Objective-C'] }],

      // Dart/Flutter Ecosystem
      ['pubspec.yaml', { manager: 'pub', ecosystem: 'Dart', languages: ['Dart'] }],
      ['pubspec.lock', { manager: 'pub', ecosystem: 'Dart', languages: ['Dart'] }],

      // Elixir Ecosystem
      ['mix.exs', { manager: 'mix', ecosystem: 'Elixir', languages: ['Elixir'] }],
      ['mix.lock', { manager: 'mix', ecosystem: 'Elixir', languages: ['Elixir'] }],

      // R Ecosystem
      ['DESCRIPTION', { manager: 'R packages', ecosystem: 'R', languages: ['R'] }],
      ['renv.lock', { manager: 'renv', ecosystem: 'R', languages: ['R'] }],

      // Lua Ecosystem
      ['rockspec', { manager: 'luarocks', ecosystem: 'Lua', languages: ['Lua'] }],

      // OCaml Ecosystem
      ['dune-project', { manager: 'dune', ecosystem: 'OCaml', languages: ['OCaml'] }],
      ['opam', { manager: 'opam', ecosystem: 'OCaml', languages: ['OCaml'] }],

      // Elm Ecosystem
      ['elm.json', { manager: 'elm', ecosystem: 'Elm', languages: ['Elm'] }],

      // Zig Ecosystem
      ['build.zig', { manager: 'zig build', ecosystem: 'Zig', languages: ['Zig'] }]
    ]);

    const detectedManagers: PackageManagerInfo[] = [];

    for (const [pattern, info] of packageManagerPatterns) {
      if (codemapContent.includes(pattern)) {
        detectedManagers.push({
          pattern,
          manager: info.manager,
          ecosystem: info.ecosystem,
          supportedLanguages: info.languages,
          confidence: this.calculatePackageManagerConfidence(pattern, codemapContent)
        });
      }
    }

    return detectedManagers;
  }

  /**
   * Calculate package manager confidence based on context
   */
  private calculatePackageManagerConfidence(pattern: string, codemapContent: string): number {
    // Base confidence
    let confidence = 0.7;

    // Boost confidence for common patterns
    const commonPatterns = ['package.json', 'requirements.txt', 'pom.xml', 'Cargo.toml', 'go.mod'];
    if (commonPatterns.includes(pattern)) {
      confidence += 0.2;
    }

    // Check for related files that increase confidence
    const relatedFiles = {
      'package.json': ['yarn.lock', 'package-lock.json', 'node_modules'],
      'requirements.txt': ['setup.py', 'pyproject.toml', '__pycache__'],
      'pom.xml': ['target/', 'src/main/java'],
      'Cargo.toml': ['Cargo.lock', 'src/main.rs', 'target/'],
      'go.mod': ['go.sum', 'main.go', 'cmd/']
    };

    const related = relatedFiles[pattern as keyof typeof relatedFiles];
    if (related) {
      const foundRelated = related.filter(file => codemapContent.includes(file));
      confidence += foundRelated.length * 0.05;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Analyze universal project structure patterns
   */
  private analyzeUniversalProjectStructure(codemapContent: string): StructureAnalysis {
    const universalPatterns = [
      // Web Application Patterns
      { pattern: /src\/components/i, types: ['React App', 'Vue App', 'Angular App'], weight: 0.9 },
      { pattern: /public\/.*\.(html|css|js)/i, types: ['Web Application'], weight: 0.8 },
      { pattern: /dist\/|build\/|out\//i, types: ['Build-based Project'], weight: 0.7 },
      { pattern: /pages\/.*\.(js|ts|jsx|tsx)/i, types: ['Next.js App', 'Nuxt.js App'], weight: 0.9 },

      // Backend API Patterns
      { pattern: /routes\/|controllers\/|handlers\//i, types: ['Web API', 'REST API'], weight: 0.9 },
      { pattern: /models\/|entities\/|schemas\//i, types: ['Database-driven App'], weight: 0.8 },
      { pattern: /middleware\/|interceptors\//i, types: ['Web Framework App'], weight: 0.8 },
      { pattern: /api\/|endpoints\//i, types: ['API Service'], weight: 0.8 },

      // Mobile Application Patterns
      { pattern: /android\/.*\.(java|kt)/i, types: ['Android App'], weight: 0.95 },
      { pattern: /ios\/.*\.(swift|m)/i, types: ['iOS App'], weight: 0.95 },
      { pattern: /lib\/.*\.dart/i, types: ['Flutter App'], weight: 0.9 },
      { pattern: /src\/.*\.(swift|kt|java)/i, types: ['Mobile App'], weight: 0.7 },

      // Desktop Application Patterns
      { pattern: /src-tauri\//i, types: ['Tauri Desktop App'], weight: 0.95 },
      { pattern: /electron\/|main\.(js|ts)/i, types: ['Electron App'], weight: 0.9 },
      { pattern: /\.desktop|\.app\//i, types: ['Desktop Application'], weight: 0.8 },

      // Data Science/ML Patterns
      { pattern: /notebooks\/.*\.ipynb/i, types: ['Jupyter Project', 'Data Science'], weight: 0.9 },
      { pattern: /models\/.*\.(pkl|h5|pt|onnx)/i, types: ['ML Project'], weight: 0.9 },
      { pattern: /data\/.*\.(csv|json|parquet|h5)/i, types: ['Data Analysis'], weight: 0.8 },
      { pattern: /experiments\/|research\//i, types: ['Research Project'], weight: 0.7 },

      // DevOps/Infrastructure Patterns
      { pattern: /docker\/|Dockerfile/i, types: ['Containerized App'], weight: 0.8 },
      { pattern: /k8s\/|kubernetes\//i, types: ['Kubernetes App'], weight: 0.9 },
      { pattern: /terraform\/.*\.tf/i, types: ['Infrastructure as Code'], weight: 0.9 },
      { pattern: /ansible\/.*\.yml/i, types: ['Configuration Management'], weight: 0.8 },
      { pattern: /\.github\/workflows\//i, types: ['CI/CD Project'], weight: 0.7 },

      // Game Development Patterns
      { pattern: /assets\/.*\.(png|jpg|wav|ogg)/i, types: ['Game Project'], weight: 0.7 },
      { pattern: /scenes\/|levels\//i, types: ['Game Project'], weight: 0.8 },
      { pattern: /unity\/|unreal\//i, types: ['Game Engine Project'], weight: 0.9 },

      // Blockchain Patterns
      { pattern: /contracts\/.*\.sol/i, types: ['Smart Contract Project'], weight: 0.95 },
      { pattern: /migrations\/|deploy\//i, types: ['Blockchain Project'], weight: 0.8 },

      // Library/Framework Patterns
      { pattern: /lib\/|library\//i, types: ['Library Project'], weight: 0.7 },
      { pattern: /examples\/|demo\//i, types: ['Example/Demo Project'], weight: 0.6 },
      { pattern: /docs\/|documentation\//i, types: ['Documentation Project'], weight: 0.6 },

      // Testing Patterns
      { pattern: /tests?\/|spec\/|__tests__\//i, types: ['Test Suite'], weight: 0.5 },
      { pattern: /e2e\/|integration\//i, types: ['Testing Framework'], weight: 0.6 },

      // Microservices Patterns
      { pattern: /services\/.*\//i, types: ['Microservices'], weight: 0.8 },
      { pattern: /packages\/.*\//i, types: ['Monorepo'], weight: 0.8 }
    ];

    const matchedPatterns = universalPatterns
      .filter(p => p.pattern.test(codemapContent))
      .map(p => ({
        pattern: p.pattern.source,
        types: p.types,
        weight: p.weight,
        evidence: this.extractPatternEvidence(codemapContent, p.pattern)
      }));

    return {
      patterns: matchedPatterns,
      projectTypes: this.aggregateProjectTypes(matchedPatterns),
      confidence: this.calculateStructureConfidence(matchedPatterns)
    };
  }

  /**
   * Extract pattern evidence from codemap
   */
  private extractPatternEvidence(codemapContent: string, pattern: RegExp): string[] {
    const matches = codemapContent.match(pattern);
    return matches ? matches.slice(0, 5) : []; // Limit to 5 examples
  }

  /**
   * Aggregate project types from matched patterns
   */
  private aggregateProjectTypes(patterns: StructurePattern[]): string[] {
    const typeScores = new Map<string, number>();

    for (const pattern of patterns) {
      for (const type of pattern.types) {
        typeScores.set(type, (typeScores.get(type) || 0) + pattern.weight);
      }
    }

    return Array.from(typeScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type]) => type);
  }

  /**
   * Calculate structure confidence
   */
  private calculateStructureConfidence(patterns: StructurePattern[]): number {
    if (patterns.length === 0) return 0.3;

    const totalWeight = patterns.reduce((sum, p) => sum + p.weight, 0);
    const averageWeight = totalWeight / patterns.length;

    return Math.min(averageWeight + (patterns.length * 0.1), 1.0);
  }

  /**
   * Extract comprehensive architectural patterns from complete codemap content
   * Detects 20+ modern architectural patterns with confidence scoring and evidence collection
   */
  private extractArchitecturalPatterns(codemapContent: string): {
    patterns: string[];
    confidence: { [pattern: string]: number };
    evidence: { [pattern: string]: string[] };
  } {
    const content = codemapContent.toLowerCase();
    const detectedPatterns: string[] = [];
    const confidence: { [pattern: string]: number } = {};
    const evidence: { [pattern: string]: string[] } = {};

    // Architectural Patterns Detection
    this.detectLayeredArchitecture(content, detectedPatterns, confidence, evidence);
    this.detectMicroservicesArchitecture(content, detectedPatterns, confidence, evidence);
    this.detectEventDrivenArchitecture(content, detectedPatterns, confidence, evidence);
    this.detectCQRSPattern(content, detectedPatterns, confidence, evidence);
    this.detectHexagonalArchitecture(content, detectedPatterns, confidence, evidence);
    this.detectCleanArchitecture(content, detectedPatterns, confidence, evidence);
    this.detectMVCPattern(content, detectedPatterns, confidence, evidence);
    this.detectMVVMPattern(content, detectedPatterns, confidence, evidence);
    this.detectMicrokernelArchitecture(content, detectedPatterns, confidence, evidence);
    this.detectSpaceBasedArchitecture(content, detectedPatterns, confidence, evidence);

    // Design Patterns Detection
    this.detectSingletonPattern(content, detectedPatterns, confidence, evidence);
    this.detectFactoryPattern(content, detectedPatterns, confidence, evidence);
    this.detectObserverPattern(content, detectedPatterns, confidence, evidence);
    this.detectRepositoryPattern(content, detectedPatterns, confidence, evidence);
    this.detectStrategyPattern(content, detectedPatterns, confidence, evidence);
    this.detectAdapterPattern(content, detectedPatterns, confidence, evidence);
    this.detectDecoratorPattern(content, detectedPatterns, confidence, evidence);
    this.detectCommandPattern(content, detectedPatterns, confidence, evidence);
    this.detectBuilderPattern(content, detectedPatterns, confidence, evidence);
    this.detectFacadePattern(content, detectedPatterns, confidence, evidence);

    return {
      patterns: detectedPatterns,
      confidence,
      evidence
    };
  }

  // ========== ARCHITECTURAL PATTERN DETECTION METHODS ==========

  /**
   * Detect Layered Architecture pattern
   */
  private detectLayeredArchitecture(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'layers/', 'layer', 'presentation', 'business', 'data', 'dal', 'bll', 'ui',
      'controller', 'service', 'repository', 'model', 'view', 'dto', 'entity'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 3) {
      patterns.push('Layered Architecture');
      confidence['Layered Architecture'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Layered Architecture'] = foundIndicators;
    }
  }

  /**
   * Detect Microservices Architecture pattern
   */
  private detectMicroservicesArchitecture(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'microservice', 'microservices', 'service-', 'api-gateway', 'docker', 'kubernetes',
      'k8s', 'helm', 'istio', 'consul', 'eureka', 'circuit-breaker', 'load-balancer'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('Microservices Architecture');
      confidence['Microservices Architecture'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Microservices Architecture'] = foundIndicators;
    }
  }

  /**
   * Detect Event-Driven Architecture pattern
   */
  private detectEventDrivenArchitecture(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'event', 'events', 'eventbus', 'event-driven', 'publish', 'subscribe',
      'pubsub', 'kafka', 'rabbitmq', 'redis', 'message', 'queue', 'broker'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('Event-Driven Architecture');
      confidence['Event-Driven Architecture'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Event-Driven Architecture'] = foundIndicators;
    }
  }

  /**
   * Detect CQRS (Command Query Responsibility Segregation) pattern
   */
  private detectCQRSPattern(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'cqrs', 'command', 'query', 'commandhandler', 'queryhandler',
      'readmodel', 'writemodel', 'eventstore', 'projection'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('CQRS');
      confidence['CQRS'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['CQRS'] = foundIndicators;
    }
  }

  /**
   * Detect Hexagonal Architecture (Ports and Adapters) pattern
   */
  private detectHexagonalArchitecture(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'hexagonal', 'ports', 'adapters', 'port', 'adapter', 'domain',
      'infrastructure', 'application', 'primary', 'secondary'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 3) {
      patterns.push('Hexagonal Architecture');
      confidence['Hexagonal Architecture'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Hexagonal Architecture'] = foundIndicators;
    }
  }

  /**
   * Detect Clean Architecture pattern
   */
  private detectCleanArchitecture(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'clean', 'entities', 'usecases', 'use-cases', 'gateways', 'presenters',
      'frameworks', 'drivers', 'interface-adapters', 'enterprise'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 3) {
      patterns.push('Clean Architecture');
      confidence['Clean Architecture'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Clean Architecture'] = foundIndicators;
    }
  }

  /**
   * Detect MVC (Model-View-Controller) pattern
   */
  private detectMVCPattern(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'mvc', 'model-view-controller', 'models/', 'views/', 'controllers/',
      'model.', 'view.', 'controller.', '@controller', '@model'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('MVC');
      confidence['MVC'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['MVC'] = foundIndicators;
    }
  }

  /**
   * Detect MVVM (Model-View-ViewModel) pattern
   */
  private detectMVVMPattern(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'mvvm', 'model-view-viewmodel', 'viewmodel', 'databinding', 'binding',
      'observable', 'command', 'inotifypropertychanged', 'wpf', 'xaml'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('MVVM');
      confidence['MVVM'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['MVVM'] = foundIndicators;
    }
  }

  /**
   * Detect Microkernel Architecture (Plugin) pattern
   */
  private detectMicrokernelArchitecture(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'plugin', 'plugins', 'microkernel', 'extension', 'extensions',
      'addon', 'addons', 'module', 'modules', 'kernel', 'core'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('Microkernel Architecture');
      confidence['Microkernel Architecture'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Microkernel Architecture'] = foundIndicators;
    }
  }

  /**
   * Detect Space-based Architecture pattern
   */
  private detectSpaceBasedArchitecture(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'space-based', 'grid', 'distributed', 'cache', 'hazelcast',
      'coherence', 'ignite', 'gemfire', 'tuple', 'space'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('Space-based Architecture');
      confidence['Space-based Architecture'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Space-based Architecture'] = foundIndicators;
    }
  }

  // ========== DESIGN PATTERN DETECTION METHODS ==========

  /**
   * Detect Singleton pattern
   */
  private detectSingletonPattern(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'singleton', 'getinstance', 'instance', 'static instance',
      'private constructor', 'lazy initialization'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 1) {
      patterns.push('Singleton Pattern');
      confidence['Singleton Pattern'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Singleton Pattern'] = foundIndicators;
    }
  }

  /**
   * Detect Factory pattern
   */
  private detectFactoryPattern(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'factory', 'factories', 'create', 'builder', 'abstractfactory',
      'factorymethod', 'creational', 'instantiate'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 1) {
      patterns.push('Factory Pattern');
      confidence['Factory Pattern'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Factory Pattern'] = foundIndicators;
    }
  }

  /**
   * Detect Observer pattern
   */
  private detectObserverPattern(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'observer', 'observable', 'subscribe', 'notify', 'listener',
      'event', 'emit', 'on(', 'addEventListener', 'subject'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('Observer Pattern');
      confidence['Observer Pattern'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Observer Pattern'] = foundIndicators;
    }
  }

  /**
   * Detect Repository pattern
   */
  private detectRepositoryPattern(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'repository', 'repositories', 'repo', 'findby', 'save',
      'delete', 'update', 'getall', 'getbyid', 'irepository'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('Repository Pattern');
      confidence['Repository Pattern'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Repository Pattern'] = foundIndicators;
    }
  }

  /**
   * Detect Strategy pattern
   */
  private detectStrategyPattern(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'strategy', 'strategies', 'algorithm', 'istrategy', 'context',
      'setstrategy', 'execute', 'behavior', 'policy'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('Strategy Pattern');
      confidence['Strategy Pattern'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Strategy Pattern'] = foundIndicators;
    }
  }

  /**
   * Detect Adapter pattern
   */
  private detectAdapterPattern(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'adapter', 'adapters', 'wrapper', 'bridge', 'convert',
      'translate', 'iadapter', 'adaptee', 'target'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('Adapter Pattern');
      confidence['Adapter Pattern'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Adapter Pattern'] = foundIndicators;
    }
  }

  /**
   * Detect Decorator pattern
   */
  private detectDecoratorPattern(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'decorator', 'decorators', '@decorator', 'wrap', 'enhance',
      'extend', 'component', 'concretecomponent', 'basedecorator'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('Decorator Pattern');
      confidence['Decorator Pattern'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Decorator Pattern'] = foundIndicators;
    }
  }

  /**
   * Detect Command pattern
   */
  private detectCommandPattern(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'command', 'commands', 'icommand', 'execute', 'undo',
      'redo', 'invoker', 'receiver', 'macro'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('Command Pattern');
      confidence['Command Pattern'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Command Pattern'] = foundIndicators;
    }
  }

  /**
   * Detect Builder pattern
   */
  private detectBuilderPattern(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'builder', 'builders', 'build', 'ibuilder', 'director',
      'product', 'construct', 'step', 'fluent'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('Builder Pattern');
      confidence['Builder Pattern'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Builder Pattern'] = foundIndicators;
    }
  }

  /**
   * Detect Facade pattern
   */
  private detectFacadePattern(
    content: string,
    patterns: string[],
    confidence: { [pattern: string]: number },
    evidence: { [pattern: string]: string[] }
  ): void {
    const indicators = [
      'facade', 'facades', 'ifacade', 'simplify', 'unified',
      'interface', 'subsystem', 'wrapper', 'api'
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));

    if (foundIndicators.length >= 2) {
      patterns.push('Facade Pattern');
      confidence['Facade Pattern'] = Math.min(foundIndicators.length / indicators.length, 1.0);
      evidence['Facade Pattern'] = foundIndicators;
    }
  }

  // ========== LANGUAGE DETECTION METHODS ==========

  /**
   * Detect primary programming languages based on file extensions in codemap content
   * Cross-references against available Code-Map Generator grammar files
   */
  private async detectPrimaryLanguages(codemapContent: string): Promise<LanguageAnalysisResult> {
    try {
      return await this.performLanguageDetection(codemapContent);
    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Language detection failed, falling back to basic detection');

      // Fallback to basic file extension analysis
      return this.performBasicLanguageDetection(codemapContent);
    }
  }

  /**
   * Perform comprehensive language detection with grammar support analysis
   */
  private async performLanguageDetection(codemapContent: string): Promise<LanguageAnalysisResult> {
    // Extract file extensions from codemap content
    const fileExtensionRegex = /\.([a-zA-Z0-9]+)(?:\s|$|\/)/g;
    const foundExtensions = new Map<string, number>();
    const frameworkIndicators = new Set<string>();
    const buildSystemIndicators = new Set<string>();

    let match;
    let totalFiles = 0;
    while ((match = fileExtensionRegex.exec(codemapContent)) !== null) {
      const ext = `.${match[1].toLowerCase()}`;
      foundExtensions.set(ext, (foundExtensions.get(ext) || 0) + 1);
      totalFiles++;
    }

    // Detect framework indicators
    this.detectFrameworkIndicators(codemapContent, frameworkIndicators);

    // Detect build system indicators
    this.detectBuildSystemIndicators(codemapContent, buildSystemIndicators);

    // Import language configurations from Code-Map Generator
    const { languageConfigurations } = await import('../../code-map-generator/parser.js');

    // Map extensions to languages and check grammar support
    const languageMapping = this.mapExtensionsToLanguages(Array.from(foundExtensions.keys()), languageConfigurations);
    const grammarSupport = this.checkGrammarSupport(languageMapping, languageConfigurations);

    // Calculate language distribution
    const languageDistribution = this.calculateLanguageDistribution(foundExtensions, languageMapping);

    // Calculate language confidence scores
    const languageConfidence = this.calculateLanguageConfidence(languageDistribution, grammarSupport);

    // Determine primary and secondary languages
    const sortedLanguages = Object.entries(languageDistribution)
      .sort(([, a], [, b]) => b - a)
      .map(([lang]) => lang);

    const primaryLanguage = sortedLanguages[0] || 'Unknown';
    const secondaryLanguages = sortedLanguages.slice(1, 5); // Top 4 secondary languages

    return {
      languages: Object.keys(languageMapping),
      fileExtensions: Array.from(foundExtensions.keys()),
      grammarSupport,
      languageDistribution,
      primaryLanguage,
      secondaryLanguages,
      frameworkIndicators: Array.from(frameworkIndicators),
      buildSystemIndicators: Array.from(buildSystemIndicators),
      languageConfidence,
      totalFilesAnalyzed: totalFiles
    };
  }

  /**
   * Fallback basic language detection using simple file extension analysis
   */
  private performBasicLanguageDetection(codemapContent: string): LanguageAnalysisResult {
    const fileExtensionRegex = /\.([a-zA-Z0-9]+)(?:\s|$|\/)/g;
    const foundExtensions = new Map<string, number>();

    let match;
    let totalFiles = 0;
    while ((match = fileExtensionRegex.exec(codemapContent)) !== null) {
      const ext = `.${match[1].toLowerCase()}`;
      foundExtensions.set(ext, (foundExtensions.get(ext) || 0) + 1);
      totalFiles++;
    }

    // Basic extension to language mapping
    const basicLanguageMapping: { [ext: string]: string } = {
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.py': 'Python',
      '.java': 'Java',
      '.cs': 'C#',
      '.go': 'Go',
      '.rb': 'Ruby',
      '.rs': 'Rust',
      '.php': 'PHP',
      '.html': 'HTML',
      '.css': 'CSS',
      '.json': 'JSON',
      '.yaml': 'YAML',
      '.yml': 'YAML'
    };

    const languages = new Set<string>();
    const languageDistribution: { [language: string]: number } = {};

    for (const [ext, count] of foundExtensions.entries()) {
      const language = basicLanguageMapping[ext] || 'Unknown';
      languages.add(language);
      languageDistribution[language] = (languageDistribution[language] || 0) + count;
    }

    const sortedLanguages = Object.entries(languageDistribution)
      .sort(([, a], [, b]) => b - a)
      .map(([lang]) => lang);

    return {
      languages: Array.from(languages),
      fileExtensions: Array.from(foundExtensions.keys()),
      grammarSupport: {},
      languageDistribution,
      primaryLanguage: sortedLanguages[0] || 'Unknown',
      secondaryLanguages: sortedLanguages.slice(1, 5),
      frameworkIndicators: [],
      buildSystemIndicators: [],
      languageConfidence: {},
      totalFilesAnalyzed: totalFiles
    };
  }

  /**
   * Detect framework indicators in codemap content
   */
  private detectFrameworkIndicators(codemapContent: string, indicators: Set<string>): void {
    const frameworkPatterns = [
      // JavaScript/TypeScript frameworks
      { pattern: /react/i, name: 'React' },
      { pattern: /vue/i, name: 'Vue.js' },
      { pattern: /angular/i, name: 'Angular' },
      { pattern: /next\.js|nextjs/i, name: 'Next.js' },
      { pattern: /nuxt/i, name: 'Nuxt.js' },
      { pattern: /svelte/i, name: 'Svelte' },
      { pattern: /express/i, name: 'Express.js' },
      { pattern: /fastify/i, name: 'Fastify' },
      { pattern: /nest\.js|nestjs/i, name: 'NestJS' },

      // Python frameworks
      { pattern: /django/i, name: 'Django' },
      { pattern: /flask/i, name: 'Flask' },
      { pattern: /fastapi/i, name: 'FastAPI' },
      { pattern: /pyramid/i, name: 'Pyramid' },

      // Java frameworks
      { pattern: /spring/i, name: 'Spring' },
      { pattern: /hibernate/i, name: 'Hibernate' },
      { pattern: /struts/i, name: 'Struts' },

      // .NET frameworks
      { pattern: /\.net|dotnet/i, name: '.NET' },
      { pattern: /asp\.net/i, name: 'ASP.NET' },
      { pattern: /blazor/i, name: 'Blazor' },

      // Other frameworks
      { pattern: /rails/i, name: 'Ruby on Rails' },
      { pattern: /laravel/i, name: 'Laravel' },
      { pattern: /symfony/i, name: 'Symfony' }
    ];

    for (const { pattern, name } of frameworkPatterns) {
      if (pattern.test(codemapContent)) {
        indicators.add(name);
      }
    }
  }

  /**
   * Detect build system indicators in codemap content
   */
  private detectBuildSystemIndicators(codemapContent: string, indicators: Set<string>): void {
    const buildSystemPatterns = [
      { pattern: /package\.json/i, name: 'npm' },
      { pattern: /yarn\.lock/i, name: 'Yarn' },
      { pattern: /pnpm-lock\.yaml/i, name: 'pnpm' },
      { pattern: /webpack/i, name: 'Webpack' },
      { pattern: /vite/i, name: 'Vite' },
      { pattern: /rollup/i, name: 'Rollup' },
      { pattern: /parcel/i, name: 'Parcel' },
      { pattern: /gradle/i, name: 'Gradle' },
      { pattern: /maven/i, name: 'Maven' },
      { pattern: /pom\.xml/i, name: 'Maven' },
      { pattern: /build\.gradle/i, name: 'Gradle' },
      { pattern: /requirements\.txt/i, name: 'pip' },
      { pattern: /poetry\.lock/i, name: 'Poetry' },
      { pattern: /pipfile/i, name: 'Pipenv' },
      { pattern: /cargo\.toml/i, name: 'Cargo' },
      { pattern: /go\.mod/i, name: 'Go Modules' },
      { pattern: /composer\.json/i, name: 'Composer' },
      { pattern: /gemfile/i, name: 'Bundler' }
    ];

    for (const { pattern, name } of buildSystemPatterns) {
      if (pattern.test(codemapContent)) {
        indicators.add(name);
      }
    }
  }

  /**
   * Map file extensions to programming languages
   */
  private mapExtensionsToLanguages(
    extensions: string[],
    languageConfigurations: { [ext: string]: { name: string; wasmPath: string } }
  ): { [language: string]: string[] } {
    const languageMapping: { [language: string]: string[] } = {};

    for (const ext of extensions) {
      const config = languageConfigurations[ext];
      if (config) {
        const language = config.name;
        if (!languageMapping[language]) {
          languageMapping[language] = [];
        }
        languageMapping[language].push(ext);
      }
    }

    return languageMapping;
  }

  /**
   * Check grammar support for detected languages
   */
  private checkGrammarSupport(
    languageMapping: { [language: string]: string[] },
    languageConfigurations: { [ext: string]: { name: string; wasmPath: string } }
  ): { [language: string]: boolean } {
    const grammarSupport: { [language: string]: boolean } = {};

    for (const language of Object.keys(languageMapping)) {
      // Check if any extension for this language has grammar support
      const extensions = languageMapping[language];
      grammarSupport[language] = extensions.some(ext => languageConfigurations[ext] !== undefined);
    }

    return grammarSupport;
  }

  /**
   * Calculate language distribution based on file counts
   */
  private calculateLanguageDistribution(
    foundExtensions: Map<string, number>,
    languageMapping: { [language: string]: string[] }
  ): { [language: string]: number } {
    const languageDistribution: { [language: string]: number } = {};

    for (const [language, extensions] of Object.entries(languageMapping)) {
      let totalFiles = 0;
      for (const ext of extensions) {
        totalFiles += foundExtensions.get(ext) || 0;
      }
      if (totalFiles > 0) {
        languageDistribution[language] = totalFiles;
      }
    }

    return languageDistribution;
  }

  /**
   * Calculate confidence scores for language detection
   */
  private calculateLanguageConfidence(
    languageDistribution: { [language: string]: number },
    grammarSupport: { [language: string]: boolean }
  ): { [language: string]: number } {
    const languageConfidence: { [language: string]: number } = {};
    const totalFiles = Object.values(languageDistribution).reduce((sum, count) => sum + count, 0);

    for (const [language, fileCount] of Object.entries(languageDistribution)) {
      let confidence = fileCount / totalFiles; // Base confidence from file prevalence

      // Boost confidence if grammar support is available
      if (grammarSupport[language]) {
        confidence = Math.min(confidence * 1.2, 1.0);
      }

      languageConfidence[language] = Math.round(confidence * 100) / 100; // Round to 2 decimal places
    }

    return languageConfidence;
  }

  // ========== PROJECT TYPE ANALYSIS METHODS ==========

  /**
   * Analyze Web Frontend project indicators
   */
  private analyzeWebFrontendProject(
    content: string,
    projectTypes: { type: string; confidence: number; evidence: string[] }[]
  ): void {
    // React Application
    const reactIndicators = ['react', 'jsx', 'tsx', 'create-react-app', 'next.js', 'gatsby'];
    const reactEvidence = reactIndicators.filter(indicator => content.includes(indicator));
    if (reactEvidence.length > 0) {
      projectTypes.push({
        type: 'React Application',
        confidence: Math.min(reactEvidence.length / reactIndicators.length + 0.2, 1.0),
        evidence: reactEvidence
      });
    }

    // Vue.js Application
    const vueIndicators = ['vue', '.vue', 'nuxt', 'vue-cli', 'vite'];
    const vueEvidence = vueIndicators.filter(indicator => content.includes(indicator));
    if (vueEvidence.length > 0) {
      projectTypes.push({
        type: 'Vue.js Application',
        confidence: Math.min(vueEvidence.length / vueIndicators.length + 0.2, 1.0),
        evidence: vueEvidence
      });
    }

    // Angular Application
    const angularIndicators = ['angular', '@angular', 'ng-', 'angular.json', 'angular-cli'];
    const angularEvidence = angularIndicators.filter(indicator => content.includes(indicator));
    if (angularEvidence.length > 0) {
      projectTypes.push({
        type: 'Angular Application',
        confidence: Math.min(angularEvidence.length / angularIndicators.length + 0.2, 1.0),
        evidence: angularEvidence
      });
    }

    // Svelte Application
    const svelteIndicators = ['svelte', 'sveltekit', '.svelte'];
    const svelteEvidence = svelteIndicators.filter(indicator => content.includes(indicator));
    if (svelteEvidence.length > 0) {
      projectTypes.push({
        type: 'Svelte Application',
        confidence: Math.min(svelteEvidence.length / svelteIndicators.length + 0.2, 1.0),
        evidence: svelteEvidence
      });
    }
  }

  /**
   * Analyze Backend/API project indicators
   */
  private analyzeBackendProject(
    content: string,
    projectTypes: { type: string; confidence: number; evidence: string[] }[]
  ): void {
    // Node.js Backend
    const nodeIndicators = ['express', 'fastify', 'koa', 'nest.js', 'hapi', 'restify'];
    const nodeEvidence = nodeIndicators.filter(indicator => content.includes(indicator));
    if (nodeEvidence.length > 0) {
      projectTypes.push({
        type: 'Node.js Backend',
        confidence: Math.min(nodeEvidence.length / nodeIndicators.length + 0.3, 1.0),
        evidence: nodeEvidence
      });
    }

    // Python Backend
    const pythonIndicators = ['django', 'flask', 'fastapi', 'pyramid', 'tornado', 'bottle'];
    const pythonEvidence = pythonIndicators.filter(indicator => content.includes(indicator));
    if (pythonEvidence.length > 0) {
      projectTypes.push({
        type: 'Python Backend',
        confidence: Math.min(pythonEvidence.length / pythonIndicators.length + 0.3, 1.0),
        evidence: pythonEvidence
      });
    }

    // Java Backend
    const javaIndicators = ['spring', 'springboot', 'hibernate', 'struts', 'jersey', 'dropwizard'];
    const javaEvidence = javaIndicators.filter(indicator => content.includes(indicator));
    if (javaEvidence.length > 0) {
      projectTypes.push({
        type: 'Java Backend',
        confidence: Math.min(javaEvidence.length / javaIndicators.length + 0.3, 1.0),
        evidence: javaEvidence
      });
    }

    // .NET Backend
    const dotnetIndicators = ['asp.net', 'dotnet', '.net', 'webapi', 'mvc', 'blazor'];
    const dotnetEvidence = dotnetIndicators.filter(indicator => content.includes(indicator));
    if (dotnetEvidence.length > 0) {
      projectTypes.push({
        type: '.NET Backend',
        confidence: Math.min(dotnetEvidence.length / dotnetIndicators.length + 0.3, 1.0),
        evidence: dotnetEvidence
      });
    }
  }

  /**
   * Analyze Mobile project indicators
   */
  private analyzeMobileProject(
    content: string,
    projectTypes: { type: string; confidence: number; evidence: string[] }[]
  ): void {
    // React Native
    const reactNativeIndicators = ['react-native', 'expo', 'metro', 'react-navigation'];
    const reactNativeEvidence = reactNativeIndicators.filter(indicator => content.includes(indicator));
    if (reactNativeEvidence.length > 0) {
      projectTypes.push({
        type: 'React Native Mobile',
        confidence: Math.min(reactNativeEvidence.length / reactNativeIndicators.length + 0.4, 1.0),
        evidence: reactNativeEvidence
      });
    }

    // Flutter - Context-aware detection using language-agnostic false positive detection
    const flutterStrongIndicators = ['pubspec.yaml', 'flutter_test'];
    const flutterWeakIndicators = ['flutter', 'dart'];

    const strongEvidence = flutterStrongIndicators.filter(indicator => content.includes(indicator));
    const weakEvidence = flutterWeakIndicators.filter(indicator => content.includes(indicator));

    // Use language-agnostic false positive detection
    const hasFlutterFalsePositives = this.detectFalsePositives(content, 'flutter');
    const hasDartFalsePositives = this.detectFalsePositives(content, 'dart');

    // Only detect Flutter if we have strong evidence OR weak evidence without false positives
    const hasStrongEvidence = strongEvidence.length > 0;
    const hasCleanWeakEvidence = weakEvidence.length > 0 && !hasFlutterFalsePositives && !hasDartFalsePositives;

    if (hasStrongEvidence || hasCleanWeakEvidence) {
      const confidence = hasStrongEvidence
        ? Math.min(strongEvidence.length / flutterStrongIndicators.length + 0.5, 1.0)
        : Math.min(weakEvidence.length / flutterWeakIndicators.length + 0.3, 0.7);

      projectTypes.push({
        type: 'Flutter Mobile',
        confidence,
        evidence: [...strongEvidence, ...weakEvidence]
      });
    }

    // Native iOS
    const iosIndicators = ['swift', 'objective-c', 'xcode', 'cocoapods', 'carthage'];
    const iosEvidence = iosIndicators.filter(indicator => content.includes(indicator));
    if (iosEvidence.length > 0) {
      projectTypes.push({
        type: 'iOS Native',
        confidence: Math.min(iosEvidence.length / iosIndicators.length + 0.4, 1.0),
        evidence: iosEvidence
      });
    }

    // Native Android - Enhanced with context-aware false positive detection
    const androidIndicators = ['android', 'kotlin', 'gradle', 'androidx', 'android.manifest'];
    const androidEvidence = androidIndicators.filter(indicator => content.includes(indicator));

    // Use language-agnostic false positive detection
    const hasAndroidFalsePositives = this.detectFalsePositives(content, 'android');
    const hasKotlinFalsePositives = this.detectFalsePositives(content, 'kotlin');

    // Only detect Android if we have evidence without false positives
    if (androidEvidence.length > 0 && !hasAndroidFalsePositives && !hasKotlinFalsePositives) {
      projectTypes.push({
        type: 'Android Native',
        confidence: Math.min(androidEvidence.length / androidIndicators.length + 0.4, 1.0),
        evidence: androidEvidence
      });
    }
  }

  /**
   * Language-agnostic false positive detection
   * Detects when keywords appear in support files, comments, or unrelated contexts
   */
  private detectFalsePositives(content: string, keyword: string): boolean {
    const supportFilePatterns = [
      /languageHandlers\/.*\.ts/i,
      /grammars\/.*\.wasm/i,
      /__tests__\/.*\.test\.ts/i,
      /tools\/.*\/.*\.ts/i,
      /node_modules\//i,
      /\.d\.ts$/i,
      /test.*\.ts$/i,
      /spec.*\.ts$/i
    ];

    // Check if keyword appears primarily in support files
    const keywordRegex = new RegExp(keyword, 'gi');
    const matches = content.match(keywordRegex) || [];

    if (matches.length === 0) return false;

    // Count matches in support file contexts
    let supportFileMatches = 0;
    for (const pattern of supportFilePatterns) {
      const supportFileRegex = new RegExp(`${pattern.source}.*${keyword}`, 'gi');
      const supportMatches = content.match(supportFileRegex) || [];
      supportFileMatches += supportMatches.length;
    }

    // If more than 70% of matches are in support files, consider it a false positive
    const falsePositiveRatio = supportFileMatches / matches.length;
    return falsePositiveRatio > 0.7;
  }

  /**
   * Perform semantic technology inference
   */
  private performSemanticTechnologyInference(codemapContent: string): TechnologyProfile {
    const semanticIndicators = this.extractSemanticIndicators(codemapContent);
    const technologyClusters = this.clusterTechnologies(semanticIndicators);

    return {
      detectedTechnologies: technologyClusters,
      primaryStack: this.identifyPrimaryStack(technologyClusters),
      confidence: this.calculateSemanticConfidence(semanticIndicators)
    };
  }

  /**
   * Extract semantic indicators from codemap
   */
  private extractSemanticIndicators(codemapContent: string): string[] {
    const indicators = [
      // Framework/Library patterns
      'react', 'vue', 'angular', 'express', 'django', 'flask', 'spring', 'rails',
      // Database patterns
      'mongodb', 'postgresql', 'mysql', 'redis', 'sqlite',
      // Cloud/Infrastructure patterns
      'aws', 'azure', 'gcp', 'docker', 'kubernetes',
      // Development tools
      'webpack', 'vite', 'babel', 'eslint', 'prettier'
    ];

    return indicators.filter(indicator =>
      new RegExp(indicator, 'i').test(codemapContent)
    );
  }

  /**
   * Cluster technologies by type
   */
  private clusterTechnologies(indicators: string[]): string[] {
    // Simple clustering - in a real implementation, this would be more sophisticated
    return indicators.slice(0, 10); // Limit to top 10
  }

  /**
   * Identify primary technology stack
   */
  private identifyPrimaryStack(technologies: string[]): string {
    if (technologies.includes('react')) return 'React Stack';
    if (technologies.includes('vue')) return 'Vue.js Stack';
    if (technologies.includes('angular')) return 'Angular Stack';
    if (technologies.includes('django')) return 'Django Stack';
    if (technologies.includes('express')) return 'Node.js Stack';
    if (technologies.includes('spring')) return 'Spring Stack';
    return 'Mixed Stack';
  }

  /**
   * Calculate semantic confidence
   */
  private calculateSemanticConfidence(indicators: string[]): number {
    return Math.min(indicators.length * 0.1 + 0.3, 1.0);
  }

  /**
   * Calculate multi-dimensional project type scores
   */
  private calculateMultiDimensionalScores(
    languageProfile: LanguageProfile,
    packageManagers: PackageManagerInfo[],
    structureAnalysis: StructureAnalysis,
    technologyProfile: TechnologyProfile,
    codemapContent: string
  ): Map<string, ProjectTypeScore> {
    const scores = new Map<string, ProjectTypeScore>();

    // Language-based scoring (40% weight)
    this.scoreByLanguageEcosystem(scores, languageProfile, 0.4);

    // Package manager-based scoring (30% weight)
    this.scoreByPackageManagers(scores, packageManagers, 0.3);

    // Structure-based scoring (20% weight)
    this.scoreByStructure(scores, structureAnalysis, 0.2);

    // Content semantic scoring (10% weight)
    this.scoreBySemanticContent(scores, codemapContent, 0.1);

    return scores;
  }

  /**
   * Score by language ecosystem with enhanced confidence
   */
  private scoreByLanguageEcosystem(
    scores: Map<string, ProjectTypeScore>,
    languageProfile: LanguageProfile,
    weight: number
  ): void {
    const { primary, secondary } = languageProfile;

    // Enhanced scoring with higher confidence for clear indicators

    // Web Development Scoring
    if (this.isWebEcosystem(primary, secondary)) {
      this.addWeightedScore(scores, 'Web Application', 0.95 * weight, ['Language Analysis'], [primary]);
    }

    // Backend Service Scoring
    if (this.isBackendEcosystem(primary, secondary)) {
      this.addWeightedScore(scores, 'Backend Service', 0.9 * weight, ['Language Analysis'], [primary]);

      // Specific language backend scoring
      if (primary === 'Python') {
        this.addWeightedScore(scores, 'Python Backend', 0.85 * weight, ['Language Analysis'], ['Python']);
      } else if (primary === 'Java') {
        this.addWeightedScore(scores, 'Java Backend', 0.85 * weight, ['Language Analysis'], ['Java']);
      } else if (primary === 'JavaScript' || primary === 'TypeScript') {
        this.addWeightedScore(scores, 'Node.js Backend', 0.85 * weight, ['Language Analysis'], [primary]);
      }
    }

    // Mobile Development Scoring
    if (this.isMobileEcosystem(primary, secondary)) {
      this.addWeightedScore(scores, 'Mobile Application', 0.95 * weight, ['Language Analysis'], [primary]);

      // Specific mobile platform scoring
      if (primary === 'Swift' || secondary.includes('Swift')) {
        this.addWeightedScore(scores, 'iOS Application', 0.9 * weight, ['Language Analysis'], ['Swift']);
      } else if (primary === 'Dart') {
        this.addWeightedScore(scores, 'Flutter Application', 0.9 * weight, ['Language Analysis'], ['Dart']);
      } else if (primary === 'Kotlin' || primary === 'Java') {
        this.addWeightedScore(scores, 'Android Application', 0.85 * weight, ['Language Analysis'], [primary]);
      }
    }

    // Data Science Scoring
    if (this.isDataScienceEcosystem(primary, secondary)) {
      this.addWeightedScore(scores, 'Data Science', 0.9 * weight, ['Language Analysis'], [primary]);
    }

    // Systems Programming
    if (primary === 'Rust') {
      this.addWeightedScore(scores, 'Rust System Service', 0.85 * weight, ['Language Analysis'], ['Rust']);
    } else if (primary === 'Go') {
      this.addWeightedScore(scores, 'Go Microservice', 0.85 * weight, ['Language Analysis'], ['Go']);
    } else if (primary === 'C#') {
      this.addWeightedScore(scores, '.NET Backend', 0.85 * weight, ['Language Analysis'], ['C#']);
    }
  }

  /**
   * Analyze Desktop project indicators
   */
  private analyzeDesktopProject(
    content: string,
    projectTypes: { type: string; confidence: number; evidence: string[] }[]
  ): void {
    // Electron
    const electronIndicators = ['electron', 'electron-builder', 'electron-packager'];
    const electronEvidence = electronIndicators.filter(indicator => content.includes(indicator));
    if (electronEvidence.length > 0) {
      projectTypes.push({
        type: 'Electron Desktop',
        confidence: Math.min(electronEvidence.length / electronIndicators.length + 0.4, 1.0),
        evidence: electronEvidence
      });
    }

    // Tauri
    const tauriIndicators = ['tauri', 'tauri.conf.json', 'src-tauri'];
    const tauriEvidence = tauriIndicators.filter(indicator => content.includes(indicator));
    if (tauriEvidence.length > 0) {
      projectTypes.push({
        type: 'Tauri Desktop',
        confidence: Math.min(tauriEvidence.length / tauriIndicators.length + 0.4, 1.0),
        evidence: tauriEvidence
      });
    }

    // WPF/.NET Desktop
    const wpfIndicators = ['wpf', 'xaml', 'winforms', 'windows.forms'];
    const wpfEvidence = wpfIndicators.filter(indicator => content.includes(indicator));
    if (wpfEvidence.length > 0) {
      projectTypes.push({
        type: 'WPF Desktop',
        confidence: Math.min(wpfEvidence.length / wpfIndicators.length + 0.4, 1.0),
        evidence: wpfEvidence
      });
    }
  }

  /**
   * Analyze Data/ML project indicators
   */
  private analyzeDataMLProject(
    content: string,
    projectTypes: { type: string; confidence: number; evidence: string[] }[]
  ): void {
    // Machine Learning
    const mlIndicators = ['tensorflow', 'pytorch', 'scikit-learn', 'keras', 'pandas', 'numpy'];
    const mlEvidence = mlIndicators.filter(indicator => content.includes(indicator));
    if (mlEvidence.length > 0) {
      projectTypes.push({
        type: 'Machine Learning',
        confidence: Math.min(mlEvidence.length / mlIndicators.length + 0.3, 1.0),
        evidence: mlEvidence
      });
    }

    // Data Analysis
    const dataIndicators = ['jupyter', 'notebook', 'pandas', 'matplotlib', 'seaborn', 'plotly'];
    const dataEvidence = dataIndicators.filter(indicator => content.includes(indicator));
    if (dataEvidence.length > 0) {
      projectTypes.push({
        type: 'Data Analysis',
        confidence: Math.min(dataEvidence.length / dataIndicators.length + 0.3, 1.0),
        evidence: dataEvidence
      });
    }

    // Big Data
    const bigDataIndicators = ['spark', 'hadoop', 'kafka', 'elasticsearch', 'mongodb', 'cassandra'];
    const bigDataEvidence = bigDataIndicators.filter(indicator => content.includes(indicator));
    if (bigDataEvidence.length > 0) {
      projectTypes.push({
        type: 'Big Data',
        confidence: Math.min(bigDataEvidence.length / bigDataIndicators.length + 0.3, 1.0),
        evidence: bigDataEvidence
      });
    }
  }

  /**
   * Analyze DevOps/Infrastructure project indicators
   */
  private analyzeDevOpsProject(
    content: string,
    projectTypes: { type: string; confidence: number; evidence: string[] }[]
  ): void {
    // DevOps/Infrastructure
    const devopsIndicators = ['docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'gitlab-ci'];
    const devopsEvidence = devopsIndicators.filter(indicator => content.includes(indicator));
    if (devopsEvidence.length > 0) {
      projectTypes.push({
        type: 'DevOps/Infrastructure',
        confidence: Math.min(devopsEvidence.length / devopsIndicators.length + 0.3, 1.0),
        evidence: devopsEvidence
      });
    }

    // Cloud Native
    const cloudIndicators = ['aws', 'azure', 'gcp', 'serverless', 'lambda', 'cloudformation'];
    const cloudEvidence = cloudIndicators.filter(indicator => content.includes(indicator));
    if (cloudEvidence.length > 0) {
      projectTypes.push({
        type: 'Cloud Native',
        confidence: Math.min(cloudEvidence.length / cloudIndicators.length + 0.3, 1.0),
        evidence: cloudEvidence
      });
    }
  }

  /**
   * Analyze Game Development project indicators
   */
  private analyzeGameProject(
    content: string,
    projectTypes: { type: string; confidence: number; evidence: string[] }[]
  ): void {
    const gameIndicators = ['unity', 'unreal', 'godot', 'phaser', 'three.js', 'babylon.js'];
    const gameEvidence = gameIndicators.filter(indicator => content.includes(indicator));
    if (gameEvidence.length > 0) {
      projectTypes.push({
        type: 'Game Development',
        confidence: Math.min(gameEvidence.length / gameIndicators.length + 0.4, 1.0),
        evidence: gameEvidence
      });
    }
  }

  /**
   * Analyze Blockchain/Web3 project indicators
   */
  private analyzeBlockchainProject(
    content: string,
    projectTypes: { type: string; confidence: number; evidence: string[] }[]
  ): void {
    const blockchainIndicators = ['solidity', 'web3', 'ethereum', 'truffle', 'hardhat', 'metamask'];
    const blockchainEvidence = blockchainIndicators.filter(indicator => content.includes(indicator));
    if (blockchainEvidence.length > 0) {
      projectTypes.push({
        type: 'Blockchain/Web3',
        confidence: Math.min(blockchainEvidence.length / blockchainIndicators.length + 0.4, 1.0),
        evidence: blockchainEvidence
      });
    }
  }

  /**
   * Detect framework stack from codemap content
   */
  private detectFrameworkStack(content: string): string[] {
    const frameworks = new Set<string>();

    // Frontend frameworks
    if (content.includes('react')) frameworks.add('React');
    if (content.includes('vue')) frameworks.add('Vue.js');
    if (content.includes('angular')) frameworks.add('Angular');
    if (content.includes('svelte')) frameworks.add('Svelte');

    // Backend frameworks
    if (content.includes('express')) frameworks.add('Express.js');
    if (content.includes('fastify')) frameworks.add('Fastify');
    if (content.includes('nest.js')) frameworks.add('NestJS');
    if (content.includes('django')) frameworks.add('Django');
    if (content.includes('flask')) frameworks.add('Flask');
    if (content.includes('spring')) frameworks.add('Spring');

    // Database frameworks
    if (content.includes('mongoose')) frameworks.add('Mongoose');
    if (content.includes('sequelize')) frameworks.add('Sequelize');
    if (content.includes('typeorm')) frameworks.add('TypeORM');
    if (content.includes('prisma')) frameworks.add('Prisma');

    // Testing frameworks
    if (content.includes('jest')) frameworks.add('Jest');
    if (content.includes('mocha')) frameworks.add('Mocha');
    if (content.includes('cypress')) frameworks.add('Cypress');
    if (content.includes('playwright')) frameworks.add('Playwright');

    return Array.from(frameworks);
  }

  /**
   * Detect architecture style from codemap content
   */
  private detectArchitectureStyle(content: string): string[] {
    const styles = new Set<string>();

    // Architectural styles
    if (content.includes('microservice')) styles.add('Microservices');
    if (content.includes('monolith')) styles.add('Monolithic');
    if (content.includes('serverless')) styles.add('Serverless');
    if (content.includes('jamstack')) styles.add('JAMstack');
    if (content.includes('spa')) styles.add('Single Page Application');
    if (content.includes('ssr')) styles.add('Server-Side Rendering');
    if (content.includes('ssg')) styles.add('Static Site Generation');
    if (content.includes('pwa')) styles.add('Progressive Web App');

    // API styles
    if (content.includes('rest') || content.includes('restful')) styles.add('REST API');
    if (content.includes('graphql')) styles.add('GraphQL');
    if (content.includes('grpc')) styles.add('gRPC');
    if (content.includes('websocket')) styles.add('WebSocket');

    return Array.from(styles);
  }

  /**
   * Detect development environment indicators
   */
  private detectDevelopmentEnvironment(content: string): string[] {
    const environment = new Set<string>();

    // Package managers
    if (content.includes('package.json')) environment.add('npm');
    if (content.includes('yarn.lock')) environment.add('Yarn');
    if (content.includes('pnpm-lock')) environment.add('pnpm');
    if (content.includes('requirements.txt')) environment.add('pip');
    if (content.includes('poetry.lock')) environment.add('Poetry');
    if (content.includes('cargo.toml')) environment.add('Cargo');

    // Build tools
    if (content.includes('webpack')) environment.add('Webpack');
    if (content.includes('vite')) environment.add('Vite');
    if (content.includes('rollup')) environment.add('Rollup');
    if (content.includes('parcel')) environment.add('Parcel');
    if (content.includes('esbuild')) environment.add('esbuild');

    // Development tools
    if (content.includes('eslint')) environment.add('ESLint');
    if (content.includes('prettier')) environment.add('Prettier');
    if (content.includes('typescript')) environment.add('TypeScript');
    if (content.includes('babel')) environment.add('Babel');

    // Containerization
    if (content.includes('docker')) environment.add('Docker');
    if (content.includes('kubernetes')) environment.add('Kubernetes');

    // CI/CD
    if (content.includes('github') && content.includes('workflow')) environment.add('GitHub Actions');
    if (content.includes('gitlab-ci')) environment.add('GitLab CI');
    if (content.includes('jenkins')) environment.add('Jenkins');

    return Array.from(environment);
  }

  // ========== LANGUAGE-AGNOSTIC HELPER METHODS ==========

  /**
   * Check if language combination indicates web ecosystem
   */
  private isWebEcosystem(primary: string, secondary: string[]): boolean {
    const webLanguages = ['JavaScript', 'TypeScript', 'HTML', 'CSS', 'Vue', 'React'];
    return webLanguages.includes(primary) ||
           secondary.some(lang => webLanguages.includes(lang));
  }

  /**
   * Check if language combination indicates backend ecosystem
   */
  private isBackendEcosystem(primary: string, secondary: string[]): boolean {
    const backendLanguages = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'Go',
      'Ruby', 'PHP', 'Rust', 'Kotlin', 'Scala', 'Elixir'
    ];
    return backendLanguages.includes(primary) ||
           secondary.some(lang => backendLanguages.includes(lang));
  }

  /**
   * Check if language combination indicates mobile ecosystem
   */
  private isMobileEcosystem(primary: string, secondary: string[]): boolean {
    const mobileLanguages = ['Swift', 'Objective-C', 'Java', 'Kotlin', 'Dart'];
    return mobileLanguages.includes(primary) ||
           secondary.some(lang => mobileLanguages.includes(lang));
  }

  /**
   * Check if language combination indicates data science ecosystem
   */
  private isDataScienceEcosystem(primary: string, secondary: string[]): boolean {
    const dataLanguages = ['Python', 'R', 'Julia', 'Scala', 'SQL'];
    return dataLanguages.includes(primary) ||
           secondary.some(lang => dataLanguages.includes(lang));
  }

  /**
   * Score by package managers with enhanced confidence
   */
  private scoreByPackageManagers(
    scores: Map<string, ProjectTypeScore>,
    packageManagers: PackageManagerInfo[],
    weight: number
  ): void {
    for (const pm of packageManagers) {
      const ecosystemTypes = this.getProjectTypesForEcosystem(pm.ecosystem);

      // Enhanced confidence for strong package manager indicators
      const enhancedConfidence = Math.min(pm.confidence + 0.3, 1.0);

      for (const type of ecosystemTypes) {
        this.addWeightedScore(scores, type, enhancedConfidence * weight, ['Package Manager'], [pm.manager]);
      }

      // Special handling for specific package managers
      if (pm.pattern === 'pubspec.yaml') {
        this.addWeightedScore(scores, 'Flutter Application', 0.95 * weight, ['Package Manager'], ['pub']);
      } else if (pm.pattern === 'Cargo.toml') {
        this.addWeightedScore(scores, 'Rust System Service', 0.9 * weight, ['Package Manager'], ['cargo']);
      } else if (pm.pattern === 'go.mod') {
        this.addWeightedScore(scores, 'Go Microservice', 0.9 * weight, ['Package Manager'], ['go modules']);
      } else if (pm.pattern === 'requirements.txt') {
        this.addWeightedScore(scores, 'Python Backend', 0.85 * weight, ['Package Manager'], ['pip']);
      } else if (pm.pattern === 'pom.xml') {
        this.addWeightedScore(scores, 'Java Backend', 0.85 * weight, ['Package Manager'], ['maven']);
      }
    }
  }

  /**
   * Score by structure analysis with enhanced confidence
   */
  private scoreByStructure(
    scores: Map<string, ProjectTypeScore>,
    structureAnalysis: StructureAnalysis,
    weight: number
  ): void {
    for (const pattern of structureAnalysis.patterns) {
      for (const type of pattern.types) {
        // Enhanced confidence for high-weight patterns
        const enhancedConfidence = Math.min(pattern.weight + 0.2, 1.0);
        this.addWeightedScore(scores, type, enhancedConfidence * weight, ['Structure Analysis'], pattern.evidence);
      }
    }

    // Additional scoring for aggregate project types
    for (const type of structureAnalysis.projectTypes) {
      const enhancedConfidence = Math.min(structureAnalysis.confidence + 0.15, 1.0);
      this.addWeightedScore(scores, type, enhancedConfidence * weight, ['Structure Analysis'], ['Directory patterns']);
    }
  }

  /**
   * Score by semantic content
   */
  private scoreBySemanticContent(
    scores: Map<string, ProjectTypeScore>,
    codemapContent: string,
    weight: number
  ): void {
    // Simple semantic scoring - can be enhanced
    const semanticIndicators = this.extractSemanticIndicators(codemapContent);
    const semanticScore = Math.min(semanticIndicators.length * 0.1, 1.0);

    if (semanticScore > 0.3) {
      this.addWeightedScore(scores, 'General Application', semanticScore * weight, ['Semantic Analysis'], semanticIndicators);
    }
  }

  /**
   * Add weighted score to project type scores
   */
  private addWeightedScore(
    scores: Map<string, ProjectTypeScore>,
    type: string,
    score: number,
    sources: string[],
    evidence: string[]
  ): void {
    const existing = scores.get(type);
    if (existing) {
      existing.confidence = Math.min(existing.confidence + score, 1.0);
      existing.sources.push(...sources);
      existing.evidence.push(...evidence);
    } else {
      scores.set(type, {
        type,
        confidence: score,
        evidence: [...evidence],
        sources: [...sources]
      });
    }
  }

  /**
   * Get project types for ecosystem
   */
  private getProjectTypesForEcosystem(ecosystem: string): string[] {
    const ecosystemMap: { [key: string]: string[] } = {
      'JavaScript': ['Web Application', 'Node.js Backend'],
      'Python': ['Python Backend', 'Data Science Project', 'Machine Learning'],
      'Java': ['Java Backend', 'Enterprise Application'],
      'C#': ['.NET Backend', 'Desktop Application'],
      'Go': ['Go Microservice', 'Backend Service'],
      'Rust': ['Rust System Service', 'Systems Software'],
      'Swift': ['iOS Application', 'Mobile Application'],
      'Dart': ['Flutter Application', 'Mobile Application'],
      'Ruby': ['Ruby Backend', 'Web Application'],
      'PHP': ['PHP Backend', 'Web Application']
    };

    return ecosystemMap[ecosystem] || ['General Application'];
  }

  /**
   * Select and validate project type
   */
  private selectAndValidateProjectType(
    projectTypeScores: Map<string, ProjectTypeScore>,
    languageProfile: LanguageProfile,
    _packageManagers: PackageManagerInfo[],
    _structureAnalysis: StructureAnalysis
  ): ProjectTypeScore {
    // Sort by confidence
    const sortedTypes = Array.from(projectTypeScores.values())
      .sort((a, b) => b.confidence - a.confidence);

    if (sortedTypes.length === 0) {
      return {
        type: 'General Application',
        confidence: 0.5,
        evidence: ['Unknown project structure'],
        sources: ['Fallback']
      };
    }

    const bestMatch = sortedTypes[0];

    // Validate against primary language
    const isValid = this.validateProjectTypeAgainstLanguage(bestMatch.type, languageProfile.primary);

    if (!isValid && bestMatch.confidence < 0.8) {
      // If validation fails and confidence is low, use fallback
      return {
        type: `${languageProfile.primary} Application`,
        confidence: 0.6,
        evidence: [languageProfile.primary],
        sources: ['Language-based fallback']
      };
    }

    return bestMatch;
  }

  /**
   * Validate project type against primary language
   */
  private validateProjectTypeAgainstLanguage(projectType: string, primaryLanguage: string): boolean {
    const compatibilityMap: { [key: string]: string[] } = {
      'Android Native': ['Java', 'Kotlin'],
      'iOS Application': ['Swift', 'Objective-C'],
      'Flutter Application': ['Dart'],
      'React Application': ['JavaScript', 'TypeScript'],
      'Vue.js Application': ['JavaScript', 'TypeScript'],
      'Angular Application': ['JavaScript', 'TypeScript'],
      'Node.js Backend': ['JavaScript', 'TypeScript'],
      'Python Backend': ['Python'],
      'Java Backend': ['Java', 'Kotlin', 'Scala'],
      '.NET Backend': ['C#'],
      'Go Microservice': ['Go'],
      'Rust System Service': ['Rust'],
      'Data Science Project': ['Python', 'R', 'Julia'],
      'Machine Learning': ['Python', 'R']
    };

    const compatibleLanguages = compatibilityMap[projectType];
    return !compatibleLanguages || compatibleLanguages.includes(primaryLanguage);
  }

  /**
   * Build project type analysis result
   */
  private buildProjectTypeAnalysisResult(
    bestMatch: ProjectTypeScore,
    projectTypeScores: Map<string, ProjectTypeScore>,
    languageProfile: LanguageProfile,
    packageManagers: PackageManagerInfo[],
    structureAnalysis: StructureAnalysis,
    technologyProfile: TechnologyProfile,
    codemapContent: string
  ): ProjectTypeAnalysisResult {
    const sortedTypes = Array.from(projectTypeScores.values())
      .sort((a, b) => b.confidence - a.confidence);

    return {
      projectType: bestMatch.type,
      confidence: bestMatch.confidence,
      evidence: bestMatch.evidence,
      secondaryTypes: sortedTypes.slice(1, 4).map(t => t.type),
      frameworkStack: this.detectFrameworkStack(codemapContent),
      architectureStyle: this.detectArchitectureStyle(codemapContent),
      developmentEnvironment: this.detectDevelopmentEnvironment(codemapContent)
    };
  }

  /**
   * Phase 4: File Discovery - Multi-strategy discovery with concurrent execution
   */
  private async executeFileDiscovery(context: WorkflowContext): Promise<void> {
    context.currentPhase = WorkflowPhase.FILE_DISCOVERY;
    logger.info({ jobId: context.jobId }, 'Executing multi-strategy file discovery phase');

    try {
      // Enhanced configuration for multi-strategy approach
      const MAX_FILES_PER_STRATEGY = 50;
      // const _TOTAL_MAX_FILES = 200; // Currently unused
      const TOKEN_BUDGET = context.input.maxTokenBudget || 250000; // Use configured token budget

      const strategies: Array<'semantic_similarity' | 'keyword_matching' | 'semantic_and_keyword' | 'structural_analysis'> = [
        'semantic_similarity',
        'keyword_matching',
        'semantic_and_keyword',
        'structural_analysis'
      ];

      const additionalContext = {
        filePatterns: context.input.includePatterns,
        excludePatterns: context.input.excludePatterns,
        focusDirectories: context.input.focusAreas,
        maxFiles: MAX_FILES_PER_STRATEGY,
        tokenBudget: TOKEN_BUDGET
      };

      // Execute all strategies with resilient error handling
      logger.info({ jobId: context.jobId, strategies: strategies.length }, 'Starting resilient strategy execution');

      const strategyResults = await this.executeStrategiesWithFallback(
        strategies,
        context,
        additionalContext
      );

      // Process and deduplicate results
      const consolidatedResult = await this.consolidateMultiStrategyResults(
        strategyResults,
        context.codemapContent!,
        context.securityConfig
      );

      context.fileDiscovery = consolidatedResult;

      context.completedPhases++;
      const progress = Math.round((context.completedPhases / context.totalPhases) * 100);

      jobManager.updateJobStatus(
        context.jobId,
        JobStatus.RUNNING,
        `Multi-strategy file discovery completed - found ${consolidatedResult.relevantFiles.length} relevant files`,
        progress,
        {
          currentStage: 'file_discovery_complete',
          diagnostics: [
            `Found ${consolidatedResult.relevantFiles.length} relevant files`,
            `Total files analyzed: ${consolidatedResult.totalFilesAnalyzed}`,
            `Search strategy: ${consolidatedResult.searchStrategy}`,
            `Duplicates removed: ${consolidatedResult.coverageMetrics.duplicatesRemoved}`,
            `Average confidence: ${Math.round(consolidatedResult.coverageMetrics.averageConfidence * 100)}%`
          ],
          subProgress: 100,
          metadata: {
            relevantFilesCount: consolidatedResult.relevantFiles.length,
            totalAnalyzed: consolidatedResult.totalFilesAnalyzed,
            searchStrategy: consolidatedResult.searchStrategy,
            duplicatesRemoved: consolidatedResult.coverageMetrics.duplicatesRemoved,
            averageConfidence: consolidatedResult.coverageMetrics.averageConfidence,
            phase: 'file_discovery'
          }
        }
      );

      logger.info({
        jobId: context.jobId,
        filesFound: consolidatedResult.relevantFiles.length,
        totalAnalyzed: consolidatedResult.totalFilesAnalyzed,
        strategy: consolidatedResult.searchStrategy,
        duplicatesRemoved: consolidatedResult.coverageMetrics.duplicatesRemoved
      }, 'Multi-strategy file discovery phase completed');

    } catch (error) {
      throw new Error(`Multi-strategy file discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Phase 5: Relevance Scoring - Score and rank discovered files
   */
  private async executeRelevanceScoring(context: WorkflowContext): Promise<void> {
    context.currentPhase = WorkflowPhase.RELEVANCE_SCORING;
    logger.info({ jobId: context.jobId }, 'Executing relevance scoring phase');

    try {
      if (!context.intentAnalysis) {
        throw new Error('Intent analysis is required for relevance scoring phase');
      }

      const scoringStrategy = this.determineScoringStrategy(context.intentAnalysis.taskType);

      // Enhanced additional context using Phase 2 analysis data
      const additionalContext = {
        codemapContent: context.codemapContent,
        projectAnalysis: context.intentAnalysis.projectAnalysis,
        languageAnalysis: context.intentAnalysis.languageAnalysis,
        architecturalPatterns: context.intentAnalysis.patternAnalysis,
        priorityWeights: this.getEnhancedPriorityWeights(
          scoringStrategy,
          context.intentAnalysis.projectAnalysis
        ),
        categoryFilters: this.getProjectSpecificFilters(
          context.intentAnalysis.projectAnalysis
        ),
        minRelevanceThreshold: this.getAdaptiveThreshold(
          context.intentAnalysis.languageAnalysis
        )
      };

      // Track relevance scoring diagnostics
      if (!context.fileDiscovery) {
        throw new Error('File discovery is required for relevance scoring phase');
      }
      
      const fileCount = context.fileDiscovery.relevantFiles.length;
      const useChunkedProcessing = fileCount > 40;
      const diagnostics: string[] = [];

      if (useChunkedProcessing) {
        diagnostics.push(`File count (${fileCount}) exceeds threshold (40). Using chunked processing.`);
        diagnostics.push(`Expected chunks: ${Math.ceil(fileCount / 20)}`);
      } else {
        diagnostics.push(`File count (${fileCount}) within threshold. Using standard processing.`);
      }

      // Update status before starting relevance scoring
      jobManager.updateJobStatus(
        context.jobId,
        JobStatus.RUNNING,
        `Starting relevance scoring for ${fileCount} files`,
        Math.round(((context.completedPhases + 0.1) / context.totalPhases) * 100),
        {
          currentStage: 'relevance_scoring_start',
          diagnostics,
          subProgress: 10,
          metadata: {
            filesToScore: fileCount,
            chunkingRequired: useChunkedProcessing,
            threshold: 40,
            chunkSize: 20,
            scoringStrategy,
            phase: 'relevance_scoring'
          }
        }
      );

      if (!context.promptRefinement) {
        throw new Error('Prompt refinement is required for relevance scoring phase');
      }

      context.relevanceScoring = await this.llmService.performRelevanceScoring(
        context.input.userPrompt,
        context.intentAnalysis,
        context.promptRefinement.refinedPrompt,
        context.fileDiscovery,
        context.config,
        scoringStrategy,
        additionalContext,
        context.jobId // Pass jobId for enhanced diagnostic logging
      );

      context.completedPhases++;
      const progress = Math.round((context.completedPhases / context.totalPhases) * 100);

      // Enhanced completion diagnostics
      const completionDiagnostics = [
        `Scored ${context.relevanceScoring.fileScores.length} files successfully`,
        `Average relevance score: ${context.relevanceScoring.overallMetrics.averageRelevance.toFixed(2)}`,
        `High relevance files: ${context.relevanceScoring.overallMetrics.highRelevanceCount}`,
        `Scoring strategy: ${scoringStrategy}`,
        `Processing time: ${context.relevanceScoring.overallMetrics.processingTimeMs || 'N/A'}ms`
      ];

      jobManager.updateJobStatus(
        context.jobId,
        JobStatus.RUNNING,
        `Enhanced relevance scoring completed - scored ${context.relevanceScoring.fileScores.length} files`,
        progress,
        {
          currentStage: 'relevance_scoring_complete',
          diagnostics: completionDiagnostics,
          subProgress: 100,
          metadata: {
            filesScored: context.relevanceScoring.fileScores.length,
            averageRelevance: context.relevanceScoring!.overallMetrics.averageRelevance,
            highRelevanceCount: context.relevanceScoring.overallMetrics.highRelevanceCount,
            scoringStrategy,
            processingTimeMs: context.relevanceScoring.overallMetrics.processingTimeMs,
            phase: 'relevance_scoring'
          }
        }
      );

      logger.info({
        jobId: context.jobId,
        filesScored: context.relevanceScoring.fileScores.length,
        averageRelevance: context.relevanceScoring!.overallMetrics.averageRelevance,
        highRelevanceCount: context.relevanceScoring.overallMetrics.highRelevanceCount,
        projectType: context.intentAnalysis.projectAnalysis?.projectType,
        adaptiveThreshold: this.getAdaptiveThreshold(context.intentAnalysis.languageAnalysis)
      }, 'Enhanced relevance scoring phase completed with project-aware analysis');

    } catch (error) {
      throw new Error(`Relevance scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Phase 6: Meta-Prompt Generation - Generate comprehensive meta-prompt
   */
  private async executeMetaPromptGeneration(context: WorkflowContext): Promise<void> {
    context.currentPhase = WorkflowPhase.META_PROMPT_GENERATION;
    logger.info({ jobId: context.jobId }, 'Executing meta-prompt generation phase');

    try {
      if (!context.intentAnalysis) {
        throw new Error('Intent analysis is required for meta-prompt generation phase');
      }

      // Enhanced architectural pattern detection with confidence scoring
      const patternAnalysis = this.extractArchitecturalPatterns(context.codemapContent!);

      // Enhanced additional context using Phase 2 analysis data
      const additionalContext = {
        codemapContent: context.codemapContent,
        projectAnalysis: context.intentAnalysis.projectAnalysis,
        languageAnalysis: context.intentAnalysis.languageAnalysis,
        architecturalPatterns: context.intentAnalysis.patternAnalysis?.patterns || patternAnalysis.patterns,
        patternConfidence: context.intentAnalysis.patternAnalysis?.confidence || patternAnalysis.confidence,
        patternEvidence: context.intentAnalysis.patternAnalysis?.evidence || patternAnalysis.evidence,
        technicalConstraints: this.deriveConstraintsFromProject(context.intentAnalysis.projectAnalysis),
        qualityRequirements: this.deriveQualityRequirements(context.intentAnalysis.languageAnalysis),
        teamExpertise: this.inferTeamExpertise(context.intentAnalysis.projectAnalysis),
        timelineConstraints: undefined,
        existingGuidelines: this.getFrameworkGuidelines(context.intentAnalysis.projectAnalysis?.frameworkStack)
      };

      if (!context.relevanceScoring) {
        throw new Error('Relevance scoring is required for meta-prompt generation phase');
      }

      if (!context.promptRefinement) {
        throw new Error('Prompt refinement is required for meta-prompt generation phase');
      }

      context.metaPromptGeneration = await this.llmService.performMetaPromptGeneration(
        context.input.userPrompt,
        context.intentAnalysis,
        context.promptRefinement!.refinedPrompt,
        context.relevanceScoring,
        context.config,
        additionalContext
      );

      context.completedPhases++;
      const progress = Math.round((context.completedPhases / context.totalPhases) * 100);

      jobManager.updateJobStatus(
        context.jobId,
        JobStatus.RUNNING,
        'Meta-prompt generation completed',
        progress,
        {
          currentStage: 'meta_prompt_generation_complete',
          diagnostics: [
            `Quality score: ${context.metaPromptGeneration.qualityScore.toFixed(2)}`,
            `Estimated complexity: ${context.metaPromptGeneration.estimatedComplexity}`,
            `Generated ${context.metaPromptGeneration.taskDecomposition.epics.length} epics`,
            `Detected ${patternAnalysis.patterns.length} architectural patterns`
          ],
          subProgress: 100,
          metadata: {
            qualityScore: context.metaPromptGeneration.qualityScore,
            estimatedComplexity: context.metaPromptGeneration.estimatedComplexity,
            epicsCount: context.metaPromptGeneration.taskDecomposition.epics.length,
            patternsDetected: patternAnalysis.patterns.length,
            phase: 'meta_prompt_generation'
          }
        }
      );

      // Calculate average confidence for detected patterns
      const averagePatternConfidence = patternAnalysis.patterns.length > 0
        ? Object.values(patternAnalysis.confidence).reduce((sum, conf) => sum + conf, 0) / patternAnalysis.patterns.length
        : 0;

      logger.info({
        jobId: context.jobId,
        qualityScore: context.metaPromptGeneration.qualityScore,
        complexity: context.metaPromptGeneration.estimatedComplexity,
        epicsCount: context.metaPromptGeneration.taskDecomposition.epics.length,
        detectedPatterns: {
          count: patternAnalysis.patterns.length,
          patterns: patternAnalysis.patterns,
          averageConfidence: averagePatternConfidence
        }
      }, 'Enhanced meta-prompt generation phase completed with architectural pattern analysis');

    } catch (error) {
      throw new Error(`Meta-prompt generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Phase 7: Package Assembly - Enhanced with validation, compression, and caching
   */
  private async executePackageAssembly(context: WorkflowContext): Promise<void> {
    context.currentPhase = WorkflowPhase.PACKAGE_ASSEMBLY;
    logger.info({ jobId: context.jobId }, 'Executing enhanced package assembly phase');

    try {
      // Import Phase 7 enhancement services
      const { PackageCache } = await import('./package-cache.js');
      const { PackageValidator } = await import('./package-validator.js');
      const { PackageCompressor } = await import('./package-compressor.js');

      // Check cache first
      const cacheKey = PackageCache.generateCacheKey(
        context.input.projectPath,
        context.input.userPrompt,
        context.input.taskType
      );

      const cachedResult = await PackageCache.getCachedPackage(cacheKey);
      if (cachedResult) {
        context.contextPackage = cachedResult.package;

        // Update cache metadata in the package
        context.contextPackage.cacheMetadata = {
          cacheKey,
          fromCache: true,
          cachedAt: cachedResult.metadata.cachedAt,
          hitCount: cachedResult.metadata.hitCount,
          ttlMs: cachedResult.metadata.ttlMs
        };

        context.completedPhases++;
        const progress = Math.round((context.completedPhases / context.totalPhases) * 100);

        jobManager.updateJobStatus(
          context.jobId,
          JobStatus.RUNNING,
          'Using cached context package',
          progress,
          {
            currentStage: 'package_assembly_cached',
            diagnostics: [
              `Cache hit for key: ${cacheKey}`,
              `Cache hit count: ${cachedResult.metadata.hitCount}`,
              `Cached at: ${new Date(cachedResult.metadata.cachedAt).toISOString()}`
            ],
            subProgress: 100,
            metadata: {
              fromCache: true,
              cacheKey,
              hitCount: cachedResult.metadata.hitCount,
              phase: 'package_assembly'
            }
          }
        );

        logger.info({
          jobId: context.jobId,
          cacheKey,
          hitCount: cachedResult.metadata.hitCount
        }, 'Enhanced package assembly completed using cache');
        return;
      }

      // Build enhanced package
      const contextPackage = await this.buildEnhancedPackage(context);

      // Validate package quality
      const validationResult = await PackageValidator.validatePackage(contextPackage);
      if (!validationResult.isValid) {
        throw new Error(`Package validation failed: ${validationResult.errors.join(', ')}`);
      }

      // Add quality metrics to package
      contextPackage.qualityMetrics = {
        overallScore: validationResult.qualityScore,
        schemaCompliance: validationResult.qualityMetrics.schemaCompliance,
        contentCompleteness: validationResult.qualityMetrics.contentCompleteness,
        metaPromptQuality: validationResult.qualityMetrics.metaPromptQuality,
        fileRelevance: validationResult.qualityMetrics.fileRelevance,
        tokenEfficiency: validationResult.qualityMetrics.tokenEfficiency,
        taskDecompositionQuality: validationResult.qualityMetrics.taskDecompositionQuality
      };

      // Optimize and compress package
      const optimizedPackage = PackageCompressor.optimizeForCompression(contextPackage);
      const compressedResult = await PackageCompressor.compressPackage(optimizedPackage);

      // Add compression metadata to package
      contextPackage.compressionMetadata = compressedResult.metadata;

      // Add cache metadata
      contextPackage.cacheMetadata = {
        cacheKey,
        fromCache: false
      };

      // Cache the package for future use
      await PackageCache.cachePackage(cacheKey, contextPackage);

      // Validate the final package
      const validatedPackage = contextPackageSchema.parse(contextPackage);
      context.contextPackage = validatedPackage;

      context.completedPhases++;
      const progress = Math.round((context.completedPhases / context.totalPhases) * 100);

      jobManager.updateJobStatus(
        context.jobId,
        JobStatus.RUNNING,
        `Enhanced package assembly completed - Quality: ${(validationResult.qualityScore * 100).toFixed(1)}%`,
        progress,
        {
          currentStage: 'package_assembly_complete',
          diagnostics: [
            `Package validation passed with quality score: ${(validationResult.qualityScore * 100).toFixed(1)}%`,
            `Total files included: ${contextPackage.files.length}`,
            `Total tokens: ${contextPackage.statistics.totalTokens}`,
            `Compression ratio: ${compressedResult.metadata.compressionRatio.toFixed(2)}`,
            `Package cached with key: ${cacheKey}`
          ],
          subProgress: 100,
          metadata: {
            qualityScore: validationResult.qualityScore,
            totalFiles: contextPackage.files.length,
            totalTokens: contextPackage.statistics.totalTokens,
            compressionRatio: compressedResult.metadata.compressionRatio,
            fromCache: false,
            cacheKey,
            phase: 'package_assembly'
          }
        }
      );

      logger.info({
        jobId: context.jobId,
        totalFiles: contextPackage.files.length,
        totalTokens: contextPackage.statistics.totalTokens,
        qualityScore: validationResult.qualityScore,
        compressionRatio: compressedResult.metadata.compressionRatio,
        cacheKey,
        validationSummary: PackageValidator.getValidationSummary(validationResult)
      }, 'Enhanced package assembly phase completed');

    } catch (error) {
      throw new Error(`Enhanced package assembly failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Phase 8: Output Generation - Enhanced multi-format output with validation
   */
  private async executeOutputGeneration(context: WorkflowContext): Promise<void> {
    context.currentPhase = WorkflowPhase.OUTPUT_GENERATION;
    logger.info({ jobId: context.jobId }, 'Executing enhanced output generation phase');

    try {
      if (!context.contextPackage) {
        throw new Error('Context package is not available for output generation');
      }

      // Determine output format from configuration
      const configRecord = context.config as unknown as Record<string, unknown>;
      const outputFormat: OutputFormat = (configRecord.outputFormat as { format?: OutputFormat })?.format || 'xml';

      // Create output directory using the proper base output directory function
      const baseOutputDir = process.env.VIBE_CODER_OUTPUT_DIR
        ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
        : path.join(process.cwd(), 'VibeCoderOutput');
      const outputDir = path.join(baseOutputDir, 'context-curator');
      await fs.mkdir(outputDir, { recursive: true });

      // Convert context package to new format for output formatter
      const convertedPackage = await this.convertContextPackageFormat(context.contextPackage, context.securityConfig);

      // Generate formatted output using the new formatter service
      const formattedOutput = await this.outputFormatter.formatOutput(
        convertedPackage,
        outputFormat,
        context.config as unknown as ContextCuratorConfig,
        {
          projectName: path.basename(context.input.projectPath),
          targetDirectory: context.input.projectPath,
          totalFiles: getPackageFilesIncluded(convertedPackage),
          totalTokens: getPackageTotalTokenEstimate(convertedPackage)
        }
      );

      // Save primary format output
      const primaryOutputPath = path.join(outputDir, `context-package-${context.jobId}.${outputFormat}`);
      await fs.writeFile(primaryOutputPath, formattedOutput.content, 'utf-8');

      // Generate and save additional formats if validation passed
      const additionalOutputs: Array<{ format: OutputFormat; path: string; size: number }> = [];

      if (this.isValidationPassed(formattedOutput.validation)) {
        // Generate JSON format for programmatic access
        if (outputFormat !== 'json') {
          const jsonOutput = await this.outputFormatter.formatOutput(
            convertedPackage,
            'json',
            context.config as unknown as ContextCuratorConfig
          );
          const jsonPath = path.join(outputDir, `context-package-${context.jobId}.json`);
          await fs.writeFile(jsonPath, jsonOutput.content, 'utf-8');
          additionalOutputs.push({ format: 'json', path: jsonPath, size: jsonOutput.size });
        }

        // Generate XML format if not primary (for compatibility)
        if (outputFormat !== 'xml') {
          const xmlOutput = await this.outputFormatter.formatOutput(
            convertedPackage,
            'xml',
            context.config as unknown as ContextCuratorConfig
          );
          const xmlPath = path.join(outputDir, `context-package-${context.jobId}.xml`);
          await fs.writeFile(xmlPath, xmlOutput.content, 'utf-8');
          additionalOutputs.push({ format: 'xml', path: xmlPath, size: xmlOutput.size });
        }
      }

      context.completedPhases++;
      const progress = Math.round((context.completedPhases / context.totalPhases) * 100);

      const statusMessage = this.isValidationPassed(formattedOutput.validation)
        ? `Enhanced output generated successfully - ${outputFormat.toUpperCase()} saved to ${primaryOutputPath}`
        : `Output generated with validation warnings - ${outputFormat.toUpperCase()} saved to ${primaryOutputPath}`;

      jobManager.updateJobStatus(
        context.jobId,
        JobStatus.RUNNING,
        statusMessage,
        progress,
        {
          currentStage: 'output_generation_complete',
          diagnostics: [
            `Primary format: ${outputFormat.toUpperCase()}`,
            `Primary output saved to: ${primaryOutputPath}`,
            `Primary file size: ${formattedOutput.size} bytes`,
            `Additional formats generated: ${additionalOutputs.length}`,
            `Validation passed: ${this.isValidationPassed(formattedOutput.validation)}`,
            `Processing time: ${formattedOutput.processingTimeMs}ms`
          ],
          subProgress: 100,
          metadata: {
            primaryFormat: outputFormat,
            primaryOutputPath,
            primarySize: formattedOutput.size,
            additionalFormats: additionalOutputs.length,
            validationPassed: this.isValidationPassed(formattedOutput.validation),
            processingTimeMs: formattedOutput.processingTimeMs,
            phase: 'output_generation'
          }
        }
      );

      logger.info({
        jobId: context.jobId,
        primaryFormat: outputFormat,
        primaryOutputPath,
        primarySize: formattedOutput.size,
        additionalOutputs,
        processingTimeMs: formattedOutput.processingTimeMs,
        validationPassed: this.isValidationPassed(formattedOutput.validation),
        validationDetails: formattedOutput.validation
      }, 'Enhanced output generation phase completed');

    } catch (error) {
      throw new Error(`Enhanced output generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute strategies with resilient error handling and fallback mechanisms
   * ISOLATED TO CONTEXT CURATOR - NO IMPACT ON OTHER TOOLS
   */
  private async executeStrategiesWithFallback(
    strategies: Array<'semantic_similarity' | 'keyword_matching' | 'semantic_and_keyword' | 'structural_analysis'>,
    context: WorkflowContext,
    additionalContext: Record<string, unknown>
  ): Promise<Array<{ strategy: string; result: FileDiscoveryResult }>> {
    const results: Array<{ strategy: string; result?: FileDiscoveryResult; error?: Error }> = [];

    // Try all strategies, collecting both successes and failures
    for (const [index, strategy] of strategies.entries()) {
      logger.debug({ jobId: context.jobId, strategy, index }, 'Executing strategy with resilient error handling');

      try {
        if (!context.intentAnalysis) {
          throw new Error('Intent analysis is required for file discovery');
        }
        
        const result = await this.llmService.performFileDiscovery(
          context.input.userPrompt,
          context.intentAnalysis,
          context.codemapContent!, // Using complete codemap content
          context.config,
          strategy,
          additionalContext
        );

        results.push({ strategy, result });

        logger.info({
          jobId: context.jobId,
          strategy,
          filesFound: result.relevantFiles.length,
          success: true
        }, 'Context Curator: Strategy executed successfully');

      } catch (error) {
        const errorObj = error as Error;
        results.push({ strategy, error: errorObj });

        logger.warn({
          jobId: context.jobId,
          strategy,
          index,
          error: errorObj.message,
          errorType: this.categorizeStrategyError(errorObj),
          success: false
        }, 'Context Curator: Strategy failed, continuing with others');
      }
    }

    // Filter successful results
    const successfulResults = results.filter(r => r.result).map(r => ({
      strategy: r.strategy,
      result: r.result!
    }));

    // Log strategy execution summary
    const failedStrategies = results.filter(r => r.error);
    logger.info({
      jobId: context.jobId,
      totalStrategies: strategies.length,
      successfulStrategies: successfulResults.length,
      failedStrategies: failedStrategies.length,
      failedStrategyNames: failedStrategies.map(r => r.strategy),
      networkErrors: failedStrategies.filter(r => this.isNetworkError(r.error!)).length
    }, 'Context Curator: Multi-strategy execution completed');

    // If no strategies succeeded, try fallback approach
    if (successfulResults.length === 0) {
      logger.warn({
        jobId: context.jobId,
        allErrors: failedStrategies.map(r => ({ strategy: r.strategy, error: r.error!.message }))
      }, 'Context Curator: All strategies failed, attempting fallback');

      const fallbackResult = await this.generateFallbackResult(context, additionalContext);
      if (fallbackResult) {
        return [{ strategy: 'codemap_fallback', result: fallbackResult }];
      }

      // If even fallback fails, throw with detailed error information
      const networkErrorCount = failedStrategies.filter(r => this.isNetworkError(r.error!)).length;
      const errorSummary = networkErrorCount > 0
        ? `${networkErrorCount} network errors, ${failedStrategies.length - networkErrorCount} other errors`
        : `${failedStrategies.length} strategy errors`;

      throw new Error(`All file discovery strategies failed: ${errorSummary}. First error: ${failedStrategies[0]?.error?.message || 'Unknown error'}`);
    }

    return successfulResults;
  }

  /**
   * Categorize strategy errors for better diagnostics
   * PRIVATE METHOD - NO EXTERNAL IMPACT
   */
  private categorizeStrategyError(error: Error): string {
    const message = error.message.toLowerCase();

    if (message.includes('ssl') || message.includes('tls') || message.includes('bad record mac')) {
      return 'ssl_tls_error';
    }
    if (message.includes('epipe') || message.includes('econnreset')) {
      return 'connection_reset';
    }
    if (message.includes('timeout')) {
      return 'timeout';
    }
    if (message.includes('network') || message.includes('connection')) {
      return 'network_error';
    }
    if (message.includes('validation') || message.includes('format')) {
      return 'response_validation_error';
    }

    return 'unknown_error';
  }

  /**
   * Check if an error is network-related
   * PRIVATE METHOD - NO EXTERNAL IMPACT
   */
  private isNetworkError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('ssl') ||
      message.includes('tls') ||
      message.includes('epipe') ||
      message.includes('econnreset') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection')
    );
  }

  /**
   * Generate fallback result using codemap analysis when all strategies fail
   * PRIVATE METHOD - NO EXTERNAL IMPACT
   */
  private async generateFallbackResult(
    context: WorkflowContext,
    additionalContext: Record<string, unknown>
  ): Promise<FileDiscoveryResult | null> {
    try {
      logger.info({ jobId: context.jobId }, 'Context Curator: Generating codemap-based fallback result');

      // Extract files from codemap using pattern matching
      const codemapFiles = this.extractFilesFromCodemap(context.codemapContent!);

      // Apply basic filtering based on task type and user prompt
      if (!context.intentAnalysis) {
        throw new Error('Intent analysis is required for file filtering');
      }
      
      const relevantFiles = this.filterFilesByRelevance(
        codemapFiles,
        context.input.userPrompt,
        context.intentAnalysis.taskType,
        getMaxFilesFromContext(additionalContext) || 50
      );

      if (relevantFiles.length === 0) {
        logger.warn({ jobId: context.jobId }, 'Context Curator: Fallback result generation failed - no relevant files found');
        return null;
      }

      const fallbackResult: FileDiscoveryResult = {
        relevantFiles,
        totalFilesAnalyzed: codemapFiles.length,
        processingTimeMs: 100, // Minimal processing time for fallback
        searchStrategy: 'semantic_similarity' as const,
        coverageMetrics: {
          totalTokens: relevantFiles.reduce((sum, f) => sum + f.estimatedTokens, 0),
          averageConfidence: 0.5 // Conservative confidence for fallback
        }
      };

      logger.info({
        jobId: context.jobId,
        fallbackFilesFound: relevantFiles.length,
        totalAnalyzed: codemapFiles.length
      }, 'Context Curator: Fallback result generated successfully');

      return fallbackResult;

    } catch (error) {
      logger.error({
        jobId: context.jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Context Curator: Fallback result generation failed');
      return null;
    }
  }

  /**
   * Extract files from codemap content
   * PRIVATE METHOD - NO EXTERNAL IMPACT
   */
  private extractFilesFromCodemap(codemapContent: string): Array<{ path: string; estimatedTokens: number }> {
    const files: Array<{ path: string; estimatedTokens: number }> = [];

    // Extract file paths using regex pattern
    const filePathRegex = /^[\s]*[├└│]\s*[─]*\s*(.+\.(ts|js|tsx|jsx|py|java|cpp|c|h|hpp|cs|php|rb|go|rs|swift|kt|scala|clj|hs|ml|fs|vb|pas|pl|sh|bat|ps1|yaml|yml|json|xml|html|css|scss|sass|less|md|txt))\s*$/gm;
    const matches = codemapContent.matchAll(filePathRegex);

    for (const match of matches) {
      const filePath = match[1].trim();
      // Estimate tokens based on file type and typical file sizes
      const estimatedTokens = this.estimateFileTokens(filePath);
      files.push({ path: filePath, estimatedTokens });
    }

    return files;
  }

  /**
   * Filter files by relevance using basic heuristics
   * PRIVATE METHOD - NO EXTERNAL IMPACT
   */
  private filterFilesByRelevance(
    files: Array<{ path: string; estimatedTokens: number }>,
    userPrompt: string,
    taskType: string,
    maxFiles: number
  ): FileDiscoveryFile[] {
    const promptKeywords = userPrompt.toLowerCase().split(/\s+/).filter(word => word.length > 3);

    const scoredFiles = files.map(file => {
      const fileName = file.path.toLowerCase();
      let relevanceScore = 0.3; // Base score

      // Keyword matching
      for (const keyword of promptKeywords) {
        if (fileName.includes(keyword)) {
          relevanceScore += 0.2;
        }
      }

      // Task type specific scoring
      if (taskType === 'feature_addition' && (fileName.includes('component') || fileName.includes('service'))) {
        relevanceScore += 0.2;
      }
      if (taskType === 'bug_fix' && (fileName.includes('test') || fileName.includes('spec'))) {
        relevanceScore += 0.1;
      }

      // File type scoring
      if (fileName.endsWith('.ts') || fileName.endsWith('.js')) {
        relevanceScore += 0.1;
      }

      return {
        path: file.path,
        priority: relevanceScore > 0.6 ? 'high' : relevanceScore > 0.4 ? 'medium' : 'low',
        reasoning: `Codemap fallback: keyword match score ${relevanceScore.toFixed(2)}`,
        confidence: Math.min(relevanceScore, 0.8), // Cap confidence for fallback
        estimatedTokens: file.estimatedTokens,
        modificationLikelihood: relevanceScore > 0.6 ? 'high' : 'medium'
      } as FileDiscoveryFile;
    });

    // Sort by confidence and take top files
    return scoredFiles
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxFiles);
  }

  /**
   * Estimate file tokens based on file path and type
   * PRIVATE METHOD - NO EXTERNAL IMPACT
   */
  private estimateFileTokens(filePath: string): number {
    const extension = filePath.split('.').pop()?.toLowerCase() || '';

    // Base estimates by file type
    const baseEstimates: { [key: string]: number } = {
      'ts': 300, 'js': 250, 'tsx': 400, 'jsx': 350,
      'py': 200, 'java': 400, 'cpp': 350, 'c': 300,
      'cs': 350, 'php': 250, 'rb': 200, 'go': 300,
      'rs': 350, 'swift': 300, 'kt': 350,
      'json': 100, 'yaml': 80, 'yml': 80,
      'md': 150, 'txt': 100,
      'html': 200, 'css': 150, 'scss': 180
    };

    return baseEstimates[extension] || 200; // Default estimate
  }

  /**
   * Consolidate results from multiple search strategies
   */
  private async consolidateMultiStrategyResults(
    strategyResults: Array<{
      strategy: string;
      result: FileDiscoveryResult;
    }>,
    codemapContent: string,
    securityConfig?: UnifiedSecurityConfiguration
  ): Promise<MultiStrategyFileDiscoveryResult> {
    // const startTime = Date.now(); // Currently unused

    // Collect all files from all strategies
    const allFiles: Array<FileDiscoveryFile & { strategy: string }> = [];
    const strategyBreakdown: Record<string, unknown> = {};

    for (const { strategy, result } of strategyResults) {
      // Add strategy info to each file
      const filesWithStrategy = result.relevantFiles.map(file => ({
        ...file,
        strategy
      }));
      allFiles.push(...filesWithStrategy);

      // Build strategy breakdown
      strategyBreakdown[strategy] = {
        filesFound: result.relevantFiles.length,
        averageConfidence: result.coverageMetrics.averageConfidence,
        processingTimeMs: result.processingTimeMs
      };
    }

    // Deduplicate files and prioritize
    const prioritizedFiles = this.deduplicateFilesByPriority(allFiles);

    // Extract file contents based on priority
    const filesWithContent = await this.extractFileContentsByPriority(
      prioritizedFiles,
      codemapContent,
      securityConfig
    );

    // Calculate metrics
    const totalFilesAnalyzed = strategyResults.reduce(
      (sum, { result }) => sum + result.totalFilesAnalyzed,
      0
    );

    const totalProcessingTime = strategyResults.reduce(
      (sum, { result }) => sum + result.processingTimeMs,
      0
    );

    const duplicatesRemoved = allFiles.length - prioritizedFiles.length;

    const priorityDistribution = {
      high: prioritizedFiles.filter(f => f.priorityLevel === 'high').length,
      medium: prioritizedFiles.filter(f => f.priorityLevel === 'medium').length,
      low: prioritizedFiles.filter(f => f.priorityLevel === 'low').length
    };

    const contentInclusionStats = {
      filesWithContent: filesWithContent.filter(f => f.includeContent).length,
      filesPathOnly: filesWithContent.filter(f => !f.includeContent).length,
      totalContentTokens: filesWithContent
        .filter(f => f.includeContent)
        .reduce((sum, f) => sum + f.estimatedTokens, 0)
    };

    const averageConfidence = prioritizedFiles.length > 0
      ? prioritizedFiles.reduce((sum, f) => sum + f.confidence, 0) / prioritizedFiles.length
      : 0;

    return {
      searchStrategy: 'multi_strategy',
      strategyBreakdown: strategyBreakdown as {
        semantic_similarity: { processingTimeMs: number; averageConfidence: number; filesFound: number };
        keyword_matching: { processingTimeMs: number; averageConfidence: number; filesFound: number };
        semantic_and_keyword: { processingTimeMs: number; averageConfidence: number; filesFound: number };
        structural_analysis: { processingTimeMs: number; averageConfidence: number; filesFound: number };
      },
      relevantFiles: filesWithContent,
      totalFilesAnalyzed,
      processingTimeMs: totalProcessingTime,
      coverageMetrics: {
        totalTokens: contentInclusionStats.totalContentTokens,
        averageConfidence,
        duplicatesRemoved,
        priorityDistribution,
        contentInclusionStats
      }
    };
  }

  /**
   * Deduplicate files by priority, keeping highest priority for each unique path
   */
  private deduplicateFilesByPriority(
    allFiles: Array<FileDiscoveryFile & { strategy: string }>
  ): PrioritizedFile[] {
    const fileMap = new Map<string, PrioritizedFile>();

    for (const file of allFiles) {
      const priorityLevel = this.categorizePriorityLevel(file.confidence);
      const prioritizedFile: PrioritizedFile = {
        path: file.path,
        priority: file.priority,
        reasoning: file.reasoning,
        confidence: file.confidence,
        estimatedTokens: file.estimatedTokens,
        modificationLikelihood: file.modificationLikelihood,
        strategy: file.strategy as 'semantic_similarity' | 'keyword_matching' | 'semantic_and_keyword' | 'structural_analysis',
        priorityLevel,
        includeContent: priorityLevel === 'high' || priorityLevel === 'medium',
        content: undefined
      };

      const existingFile = fileMap.get(file.path);
      if (!existingFile || this.getHighestPriority(priorityLevel, existingFile.priorityLevel) === priorityLevel) {
        fileMap.set(file.path, prioritizedFile);
      }
    }

    return Array.from(fileMap.values());
  }

  /**
   * Categorize priority level based on confidence score
   */
  private categorizePriorityLevel(confidence: number): 'high' | 'medium' | 'low' {
    if (confidence >= 0.8) {
      return 'high';
    } else if (confidence >= 0.6) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Get highest priority between two priority levels
   */
  private getHighestPriority(priority1: string, priority2: string): 'high' | 'medium' | 'low' {
    const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
    return (priorityOrder as Record<string, number>)[priority1] >= (priorityOrder as Record<string, number>)[priority2] ? priority1 as 'high' | 'medium' | 'low' : priority2 as 'high' | 'medium' | 'low';
  }

  /**
   * Extract file contents based on priority level
   */
  private async extractFileContentsByPriority(
    prioritizedFiles: PrioritizedFile[],
    codemapContent: string,
    securityConfig?: UnifiedSecurityConfiguration
  ): Promise<PrioritizedFile[]> {
    const filesWithContent: PrioritizedFile[] = [];

    for (const file of prioritizedFiles) {
      if (file.includeContent && (file.priorityLevel === 'high' || file.priorityLevel === 'medium')) {
        // Extract actual file content for high and medium priority files
        const result = await this.extractSingleFileContent(file.path, securityConfig);
        filesWithContent.push({
          ...file,
          content: result?.content || undefined,
          // Update the path to use the resolved path if available
          path: result?.resolvedPath || file.path
        });
      } else {
        // For low priority files, just include path information
        filesWithContent.push({
          ...file,
          content: undefined
        });
      }
    }

    return filesWithContent;
  }

  /**
   * Extract content for a single file using secure file reading
   */
  private async extractSingleFileContent(filePath: string, securityConfig?: UnifiedSecurityConfiguration): Promise<{ content: string; resolvedPath: string } | null> {
    try {
      const { readFileSecure } = await import('../../code-map-generator/fsUtils.js');
      const path = await import('path');

      // Use security configuration if available, otherwise fallback to project root
      const allowedReadDirectory = securityConfig?.allowedReadDirectory || process.cwd();

      // Normalize the file path to handle both relative and absolute paths
      let normalizedPath = filePath;

      // If the path is already relative to allowed read directory, use it as-is
      // If it's just a filename (like "package.json"), treat it as root-level
      if (!filePath.includes('/') && !filePath.includes('\\')) {
        // Root-level file
        normalizedPath = filePath;
      } else if (path.isAbsolute(filePath)) {
        // Convert absolute path to relative path from allowed read directory
        normalizedPath = path.relative(allowedReadDirectory, filePath);
      }

      logger.debug({
        originalPath: filePath,
        normalizedPath,
        allowedReadDirectory
      }, 'Extracting file content with security validation');

      try {
        // Use secure file reading with proper directory validation
        const content = await readFileSecure(normalizedPath, allowedReadDirectory);
        const lineCount = content.split('\n').length;

        logger.info({
          filePath: normalizedPath,
          lineCount,
          contentLength: content.length
        }, 'Successfully extracted file content');

        const finalContent = lineCount > 1000
          ? await this.optimizeFileContent(content, normalizedPath)
          : content;

        // Construct the full resolved path
        const path = await import('path');
        const fullResolvedPath = path.isAbsolute(normalizedPath)
          ? normalizedPath
          : path.resolve(allowedReadDirectory, normalizedPath);

        return {
          content: finalContent,
          resolvedPath: fullResolvedPath
        };
      } catch (secureReadError) {
        // If secure read fails, try alternative path resolution
        logger.debug({
          filePath,
          normalizedPath,
          error: secureReadError instanceof Error ? secureReadError.message : 'Unknown error'
        }, 'Secure file read failed, trying path resolution');

        // Try resolving as relative path against the allowed directory
        try {
          const { resolveSecurePath } = await import('../../code-map-generator/pathUtils.js');
          const resolvedPath = resolveSecurePath(filePath, allowedReadDirectory);
          const content = await readFileSecure(resolvedPath, allowedReadDirectory);
          const lineCount = content.split('\n').length;

          logger.info({
            originalPath: filePath,
            resolvedPath,
            lineCount
          }, 'Successfully resolved file as relative path');

          const finalContent = lineCount > 1000
            ? await this.optimizeFileContent(content, resolvedPath)
            : content;

          return {
            content: finalContent,
            resolvedPath
          };
        } catch (resolveError) {
          logger.debug({
            originalPath: filePath,
            error: resolveError instanceof Error ? resolveError.message : 'Unknown error'
          }, 'Failed to resolve as relative path, trying codemap search');

          // Fallback: Search in codemap for actual file path
          const codemapPath = await this.findFileInCodemap(filePath, allowedReadDirectory);
          if (codemapPath) {
            try {
              const content = await readFileSecure(codemapPath, allowedReadDirectory);
              const lineCount = content.split('\n').length;

              logger.info({
                originalPath: filePath,
                resolvedPath: codemapPath,
                lineCount
              }, 'Successfully found file using codemap search');

              const finalContent = lineCount > 1000
                ? await this.optimizeFileContent(content, codemapPath)
                : content;

              return {
                content: finalContent,
                resolvedPath: codemapPath
              };
            } catch (codemapError) {
              logger.debug({
                originalPath: filePath,
                codemapPath,
                error: codemapError instanceof Error ? codemapError.message : 'Unknown error'
              }, 'Failed to read file found in codemap');
            }
          }
        }

        // Try to resolve abstract file path to actual path
        if (!filePath.includes('/') && !filePath.includes('\\')) {
          const resolvedPath = await this.resolveAbstractFilePathToActual(filePath);
          if (resolvedPath) {
            try {
              const content = await readFileSecure(resolvedPath, allowedReadDirectory);
              const lineCount = content.split('\n').length;

              logger.info({
                originalPath: filePath,
                resolvedPath,
                lineCount
              }, 'Successfully resolved and extracted file content');

              const finalContent = lineCount > 1000
                ? await this.optimizeFileContent(content, resolvedPath)
                : content;

              return {
                content: finalContent,
                resolvedPath
              };
            } catch (resolvedReadError) {
              logger.warn({
                filePath,
                resolvedPath,
                error: resolvedReadError instanceof Error ? resolvedReadError.message : 'Unknown error'
              }, 'Failed to read resolved file path');
            }
          }
        }

        throw secureReadError;
      }
    } catch (error) {
      logger.warn({
        filePath,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to extract file content');
      return null;
    }
  }

  /**
   * Find file in codemap content and return secure path
   */
  private async findFileInCodemap(
    abstractPath: string,
    allowedReadDirectory: string
  ): Promise<string | null> {
    try {
      // Get codemap content from context or read from file
      let codemapContent = '';

      // Try to get codemap content from the current context
      // This is a simplified approach - in a full implementation,
      // we would pass the codemap content as a parameter
      const fs = await import('fs-extra');
      const path = await import('path');
      const { resolveSecurePath } = await import('../../code-map-generator/pathUtils.js');

      // Look for recent codemap files in the output directory
      const outputDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
      const codemapDir = path.join(outputDir, 'code-map-generator');

      if (await fs.pathExists(codemapDir)) {
        const files = await fs.readdir(codemapDir);
        const codemapFiles = files.filter(f => f.endsWith('.md')).sort().reverse();

        if (codemapFiles.length > 0) {
          const latestCodemap = path.join(codemapDir, codemapFiles[0]);
          codemapContent = await fs.readFile(latestCodemap, 'utf-8');
        }
      }

      if (!codemapContent) {
        logger.warn('No codemap content available for file path resolution');
        return null;
      }

      // Extract all file paths from codemap using the same regex as extractFileContentsWithOptimization
      const filePathRegex = /^[\s]*[├└│]\s*[─]*\s*(.+\.(ts|js|py|java|cpp|c|h|hpp|cs|php|rb|go|rs|swift|kt|scala|clj|hs|ml|fs|vb|pas|pl|sh|bat|ps1|yaml|yml|json|xml|html|css|scss|sass|less|md|txt))\s*$/gm;
      const matches = codemapContent.matchAll(filePathRegex);

      for (const match of matches) {
        const actualPath = match[1].trim();

        // Check if this path matches our abstract path
        if (actualPath.endsWith(abstractPath) ||
            actualPath.includes(abstractPath) ||
            abstractPath.includes(actualPath)) {
          try {
            // Validate the path is within security boundaries
            const securePath = resolveSecurePath(actualPath, allowedReadDirectory);

            logger.debug({
              abstractPath,
              actualPath,
              securePath
            }, 'Found matching file in codemap');

            return securePath;
          } catch (error) {
            // Path is outside security boundary, continue searching
            logger.debug({
              abstractPath,
              actualPath,
              error: error instanceof Error ? error.message : 'Unknown error'
            }, 'File path outside security boundary, continuing search');
            continue;
          }
        }
      }

      logger.debug({
        abstractPath,
        allowedReadDirectory
      }, 'No matching file found in codemap');

      return null;
    } catch (error) {
      logger.warn({
        abstractPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error searching for file in codemap');
      return null;
    }
  }

  /**
   * Resolve abstract file path to actual filesystem path
   */
  private async resolveAbstractFilePathToActual(abstractPath: string): Promise<string | null> {
    try {
      // const fs = await import('fs-extra'); // Currently unused
      // const path = await import('path'); // Currently unused
      const glob = (await import('glob')).glob;

      // Convert abstract names to potential file patterns
      const patterns = this.generateFilePatterns(abstractPath);

      for (const pattern of patterns) {
        try {
          const matches = await glob(pattern, {
            cwd: process.cwd(),
            ignore: ['node_modules/**', '.git/**', 'build/**', 'dist/**']
          });

          if (Array.isArray(matches) && matches.length > 0) {
            // Return the first match (could be enhanced with better scoring)
            return matches[0];
          }
        } catch (globError) {
          logger.debug({ pattern, error: globError }, 'Glob pattern failed');
        }
      }

      return null;
    } catch (error) {
      logger.warn({ abstractPath, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to resolve abstract file path');
      return null;
    }
  }

  /**
   * Generate file patterns for abstract names
   */
  private generateFilePatterns(abstractName: string): string[] {
    const patterns: string[] = [];

    // Convert camelCase/PascalCase to kebab-case and snake_case
    const kebabCase = abstractName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
    const snakeCase = abstractName.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
    const lowerCase = abstractName.toLowerCase();

    // Common file extensions
    const extensions = ['ts', 'js', 'tsx', 'jsx'];

    // Generate patterns for different naming conventions
    for (const ext of extensions) {
      patterns.push(`**/${lowerCase}.${ext}`);
      patterns.push(`**/${kebabCase}.${ext}`);
      patterns.push(`**/${snakeCase}.${ext}`);
      patterns.push(`**/*${lowerCase}*.${ext}`);
      patterns.push(`**/*${kebabCase}*.${ext}`);
      patterns.push(`**/*${snakeCase}*.${ext}`);
    }

    return patterns;
  }

  /**
   * Determine search strategy based on task type
   */
  private determineSearchStrategy(taskType: string): 'semantic_similarity' | 'keyword_matching' | 'semantic_and_keyword' | 'structural_analysis' {
    switch (taskType) {
      case 'refactoring':
        return 'semantic_similarity';
      case 'bug_fix':
        return 'keyword_matching';
      case 'feature_addition':
        return 'semantic_and_keyword';
      default:
        return 'structural_analysis';
    }
  }

  /**
   * Determine scoring strategy based on task type
   */
  private determineScoringStrategy(taskType: string): 'semantic_similarity' | 'keyword_density' | 'structural_importance' | 'hybrid' {
    switch (taskType) {
      case 'refactoring':
        return 'semantic_similarity';
      case 'bug_fix':
        return 'keyword_density';
      case 'feature_addition':
        return 'hybrid';
      default:
        return 'structural_importance';
    }
  }

  /**
   * Get priority weights for scoring strategy
   */
  private getPriorityWeights(strategy: string): { semantic: number; keyword: number; structural: number } {
    switch (strategy) {
      case 'semantic_similarity':
        return { semantic: 0.7, keyword: 0.2, structural: 0.1 };
      case 'keyword_density':
        return { semantic: 0.2, keyword: 0.7, structural: 0.1 };
      case 'structural_importance':
        return { semantic: 0.2, keyword: 0.1, structural: 0.7 };
      case 'hybrid':
      default:
        return { semantic: 0.4, keyword: 0.3, structural: 0.3 };
    }
  }

  /**
   * Map relevance score to priority level
   */
  private mapRelevanceToPriority(relevanceScore: number): 'critical' | 'high' | 'medium' | 'low' {
    if (relevanceScore >= 0.9) return 'critical';
    if (relevanceScore >= 0.7) return 'high';
    if (relevanceScore >= 0.5) return 'medium';
    return 'low';
  }

  /**
   * Convert ContextFile to ProcessedFile format
   */
  private convertToProcessedFile(file: ContextFile): ProcessedFile {
    return {
      path: file.path,
      content: file.content || '',
      isOptimized: file.isOptimized,
      totalLines: file.content?.split('\n').length || 0,
      fullContentLines: file.isOptimized ? undefined : file.content?.split('\n').length || 0,
      optimizedLines: file.isOptimized ? file.content?.split('\n').length || 0 : undefined,
      tokenEstimate: file.tokenCount,
      contentSections: [],
      relevanceScore: {
        overall: 0.5,
        confidence: 0.8,
        modificationLikelihood: 'medium' as const,
        reasoning: ['Included based on file discovery'],
        categories: [],
        imports: [],
        exports: [],
        functions: [],
        classes: []
      },
      reasoning: `Included ${file.language} file based on analysis`,
      language: file.language,
      lastModified: file.lastModified,
      size: file.size
    };
  }

  /**
   * Convert ContextFile to FileReference format
   */
  private convertToFileReference(file: ContextFile): FileReference {
    return {
      path: file.path,
      relevanceScore: 0.3, // Low priority files have lower relevance
      reasoning: `Low priority ${file.language} file included for reference`,
      tokenEstimate: file.tokenCount,
      lastModified: file.lastModified,
      size: file.size,
      language: file.language
    };
  }

  /**
   * Convert old context package format to new output package format
   */
  private async convertContextPackageFormat(oldPackage: ContextPackage, securityConfig?: UnifiedSecurityConfiguration): Promise<OutputContextPackage> {
    // Ensure generatedAt is a proper Date object
    let generationTimestamp: Date;
    if (oldPackage.generatedAt instanceof Date) {
      generationTimestamp = oldPackage.generatedAt;
    } else if (typeof oldPackage.generatedAt === 'string') {
      generationTimestamp = new Date(oldPackage.generatedAt);
    } else {
      generationTimestamp = new Date();
    }

    // Ensure we have valid arrays for priority files
    const highPriorityContextFiles = await this.extractPriorityFiles(oldPackage, 'high', securityConfig) || [];
    const mediumPriorityContextFiles = await this.extractPriorityFiles(oldPackage, 'medium', securityConfig) || [];
    const lowPriorityContextFiles = await this.extractPriorityFiles(oldPackage, 'low', securityConfig) || [];

    // Convert ContextFile[] to ProcessedFile[] and FileReference[]
    const highPriorityFiles: ProcessedFile[] = highPriorityContextFiles.map(file => this.convertToProcessedFile(file));
    const mediumPriorityFiles: ProcessedFile[] = mediumPriorityContextFiles.map(file => this.convertToProcessedFile(file));
    const lowPriorityFiles: FileReference[] = lowPriorityContextFiles.map(file => this.convertToFileReference(file));

    // Calculate total token estimate from all priority files
    const totalTokenEstimate = [
      ...highPriorityContextFiles,
      ...mediumPriorityContextFiles,
      ...lowPriorityContextFiles
    ].reduce((total, file) => total + (file.tokenCount || 0), 0);

    logger.debug({
      totalFiles: oldPackage.files?.length || 0,
      highPriorityCount: highPriorityFiles.length,
      mediumPriorityCount: mediumPriorityFiles.length,
      lowPriorityCount: lowPriorityFiles.length,
      totalTokenEstimate
    }, 'Context package conversion completed');

    return {
      metadata: {
        generationTimestamp,
        targetDirectory: oldPackage.projectPath || '/unknown',
        originalPrompt: oldPackage.userPrompt || '',
        refinedPrompt: oldPackage.refinedPrompt || oldPackage.userPrompt || '',
        totalTokenEstimate,
        processingTimeMs: 0,
        taskType: oldPackage.taskType,
        version: '1.0.0',
        formatVersion: '1.0.0',
        toolVersion: '1.0.0',
        codemapCacheUsed: false,
        filesAnalyzed: oldPackage.statistics?.totalFiles || 0,
        filesIncluded: oldPackage.files?.length || 0
      },
      refinedPrompt: oldPackage.refinedPrompt || oldPackage.userPrompt || '',
      codemapPath: oldPackage.codemapPath || '',
      highPriorityFiles,
      mediumPriorityFiles,
      lowPriorityFiles,
      metaPrompt: oldPackage.metaPrompt?.systemPrompt
    };
  }

  /**
   * Extract files by priority level from context package
   */
  private async extractPriorityFiles(contextPackage: ContextPackage, priorityLevel: 'high' | 'medium' | 'low', securityConfig?: UnifiedSecurityConfiguration): Promise<ContextFile[]> {
    if (!contextPackage || !contextPackage.files || !Array.isArray(contextPackage.files)) {
      logger.warn({ priorityLevel, hasPackage: !!contextPackage, hasFiles: !!contextPackage?.files },
        'No files available for priority extraction');
      return [];
    }

    const priorityFiles: ContextFile[] = [];

    for (const file of contextPackage.files) {
      const relevanceScore = file.relevanceScore?.score || 0;
      const confidence = file.relevanceScore?.confidence || 0;

      // Determine priority level based on relevance score and confidence
      let filePriorityLevel: 'high' | 'medium' | 'low';
      if (relevanceScore >= 0.7 && confidence >= 0.8) {
        filePriorityLevel = 'high';
      } else if (relevanceScore >= 0.4 && confidence >= 0.6) {
        filePriorityLevel = 'medium';
      } else {
        filePriorityLevel = 'low';
      }

      if (filePriorityLevel === priorityLevel) {
        const hasContent = file.file?.content !== null && file.file?.content !== undefined;

        logger.debug({
          filePath: file.file?.path,
          priorityLevel,
          relevanceScore,
          hasContent,
          contentLength: file.file?.content?.length || 0,
          isOptimized: file.file?.isOptimized || false
        }, 'Converting file to priority format');

        // Note: reasoning extraction removed as it's not used in the current implementation

        // Ensure content is properly included for high and medium priority files
        let fileContent = file.file?.content;
        if ((priorityLevel === 'high' || priorityLevel === 'medium') && !hasContent) {
          logger.warn({
            filePath: file.file?.path,
            priorityLevel,
            relevanceScore,
            confidence
          }, 'High/medium priority file missing content - attempting to extract');

          // Attempt to extract content if missing for high/medium priority files
          try {
            const result = await this.extractSingleFileContent(file.file?.path || '', securityConfig);
            if (result) {
              fileContent = result.content;
              // Update the file path to use the resolved path
              if (file.file) {
                file.file.path = result.resolvedPath;
              }
              logger.info({
                filePath: result.resolvedPath,
                priorityLevel,
                contentLength: result.content.length
              }, 'Successfully extracted missing content for priority file');
            }
          } catch (error) {
            logger.error({
              filePath: file.file?.path,
              priorityLevel,
              error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Failed to extract missing content for priority file');
          }
        }

        // Calculate actual token estimate for the content
        const actualContent = fileContent || (priorityLevel === 'low' ? null : file.file?.content || '');
        let tokenEstimate = 0;

        if (actualContent && typeof actualContent === 'string') {
          try {
            tokenEstimate = TokenEstimator.estimateTokens(actualContent);
            logger.debug({
              filePath: file.file?.path,
              priorityLevel,
              contentLength: actualContent.length,
              tokenEstimate
            }, 'Calculated token estimate for priority file');
          } catch (error) {
            // Fallback to character-based estimation (rough estimate: characters ÷ 4)
            tokenEstimate = Math.ceil(actualContent.length / 4);
            logger.warn({
              filePath: file.file?.path,
              priorityLevel,
              error: error instanceof Error ? error.message : 'Unknown error',
              fallbackTokenEstimate: tokenEstimate
            }, 'Token estimation failed, using fallback calculation');
          }
        }

        const finalPath = file.file?.path || '';

        logger.debug({
          originalPath: finalPath,
          priorityLevel,
          hasContent: !!actualContent,
          pathType: finalPath.startsWith('/') ? 'absolute' : 'relative'
        }, 'Creating prioritized file with resolved path');

        const prioritizedFile: ContextFile = {
          path: finalPath,
          content: actualContent,
          size: file.file?.size || 0,
          lastModified: file.file?.lastModified instanceof Date ? file.file.lastModified : new Date(file.file?.lastModified || Date.now()),
          language: file.file?.language || 'unknown',
          isOptimized: file.file?.isOptimized || false,
          tokenCount: tokenEstimate,
          optimizedSummary: file.file?.isOptimized ? 'Optimized content' : undefined
        };

        priorityFiles.push(prioritizedFile);
      }
    }

    return priorityFiles;
  }

  /**
   * Check if output validation passed
   */
  private isValidationPassed(validation: Record<string, unknown>): boolean {
    if ('isWellFormed' in validation) {
      // XML validation
      return Boolean(validation.hasXmlDeclaration) && Boolean(validation.isWellFormed) && Boolean(validation.schemaCompliant);
    } else if ('isValidJson' in validation) {
      // JSON validation
      return Boolean(validation.isValidJson) && Boolean(validation.schemaCompliant) && Boolean(validation.hasRequiredFields);
    } else if ('isValidYaml' in validation) {
      // YAML validation
      return Boolean(validation.isValidYaml) && Boolean(validation.schemaCompliant) && Boolean(validation.hasRequiredFields);
    }
    return false;
  }

  /**
   * Generate simple XML output for context package (legacy method - kept for compatibility)
   */
  private generateSimpleXMLOutput(contextPackage: ContextPackage): string {
    const escapeXml = (text: string | undefined | null): string => {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    return `<?xml version="1.0" encoding="UTF-8"?>
<context-package id="${escapeXml(contextPackage.id || 'unknown')}" generated-at="${escapeXml(contextPackage.generatedAt?.toISOString() || new Date().toISOString())}">
  <metadata>
    <task-type>${escapeXml(contextPackage.taskType)}</task-type>
    <project-path>${escapeXml(contextPackage.projectPath)}</project-path>
    <user-prompt>${escapeXml(contextPackage.userPrompt)}</user-prompt>
  </metadata>

  <statistics>
    <total-files>${contextPackage.statistics?.totalFiles || 0}</total-files>
    <total-tokens>${contextPackage.statistics?.totalTokens || 0}</total-tokens>
    <average-relevance-score>${contextPackage.statistics?.averageRelevanceScore || 0}</average-relevance-score>
    <processing-time-ms>${contextPackage.statistics?.processingTimeMs || 0}</processing-time-ms>
    <cache-hit-rate>${contextPackage.statistics?.cacheHitRate || 0}</cache-hit-rate>
  </statistics>

  <files>
${(contextPackage.files || []).map(file => `    <file path="${escapeXml(file.file?.path || 'unknown')}">
      <relevance-score>${file.relevanceScore?.score || 0}</relevance-score>
      <confidence>${file.relevanceScore?.confidence || 0}</confidence>
      <reasoning>${escapeXml(file.relevanceScore?.reasoning || '')}</reasoning>
      <categories>${(file.categories || []).map(cat => escapeXml(cat)).join(', ')}</categories>
      <token-count>${file.file?.tokenCount || 0}</token-count>
    </file>`).join('\n')}
  </files>

  <meta-prompt>
    <system-prompt><![CDATA[${contextPackage.metaPrompt?.systemPrompt || ''}]]></system-prompt>
    <user-prompt><![CDATA[${contextPackage.metaPrompt?.userPrompt || ''}]]></user-prompt>
    <context-summary><![CDATA[${contextPackage.metaPrompt?.contextSummary || ''}]]></context-summary>
    <estimated-complexity>${escapeXml(contextPackage.metaPrompt?.estimatedComplexity || 'medium')}</estimated-complexity>

    <guidelines>
${(contextPackage.metaPrompt?.guidelines || []).map(guideline => `      <guideline>${escapeXml(guideline)}</guideline>`).join('\n')}
    </guidelines>

    <task-decomposition>
${(contextPackage.metaPrompt?.taskDecomposition?.epics || []).map(epic => `      <epic id="${escapeXml(epic.id || 'unknown')}">
        <title>${escapeXml(epic.title || '')}</title>
        <description>${escapeXml(epic.description || '')}</description>
        <tasks>
${(epic.tasks || []).map(task => `          <task id="${escapeXml(task.id || 'unknown')}">
            <title>${escapeXml(task.title || '')}</title>
            <description>${escapeXml(task.description || '')}</description>
            <subtasks>
${(task.subtasks || []).map(subtask => `              <subtask id="${escapeXml(subtask.id || 'unknown')}">
                <title>${escapeXml(subtask.title || '')}</title>
                <description>${escapeXml(subtask.description || '')}</description>
              </subtask>`).join('\n')}
            </subtasks>
          </task>`).join('\n')}
        </tasks>
      </epic>`).join('\n')}
    </task-decomposition>
  </meta-prompt>
</context-package>`;
  }

  /**
   * Extract file contents with optimization for files above 1000 LOC
   */
  private async extractFileContentsWithOptimization(codemapContent: string): Promise<Map<string, string>> {
    const fileContents = new Map<string, string>();

    try {
      // Parse the codemap to extract file paths and their information
      // Updated regex to match tree structure format: "  ├── filename.ext" or "  └── filename.ext"
      const filePathRegex = /^[\s]*[├└│]\s*[─]*\s*(.+\.(ts|js|py|java|cpp|c|h|hpp|cs|php|rb|go|rs|swift|kt|scala|clj|hs|ml|fs|vb|pas|pl|sh|bat|ps1|yaml|yml|json|xml|html|css|scss|sass|less|md|txt))\s*$/gm;
      const matches = codemapContent.matchAll(filePathRegex);

      let matchCount = 0;
      for (const match of matches) {
        matchCount++;
        const filePath = match[1].trim();
        logger.debug(`File path match ${matchCount}: "${match[0]}" -> "${filePath}"`);

        try {
          // Read the file content
          const fs = await import('fs/promises');
          const fsExtra = await import('fs-extra');
          const path = await import('path');

          const fullPath = path.resolve(filePath);
          if (await fsExtra.pathExists(fullPath)) {
            const content = await fs.readFile(fullPath, 'utf-8');
            const lineCount = content.split('\n').length;

            if (lineCount > 1000) {
              // Apply optimization for large files
              const optimizedContent = await this.optimizeFileContent(content, filePath);
              fileContents.set(filePath, optimizedContent);
            } else {
              // Use unoptimized content for smaller files
              fileContents.set(filePath, content);
            }
          }
        } catch (error) {
          logger.warn({ filePath, error: error instanceof Error ? error.message : 'Unknown error' },
            'Failed to read file content');
        }
      }

      logger.info({
        totalMatches: matchCount,
        totalFiles: fileContents.size,
        optimizedFiles: Array.from(fileContents.entries()).filter(([_, content]) =>
          content.includes('// [OPTIMIZED]')).length
      }, 'File contents extracted with optimization');

      return fileContents;
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to extract file contents');
      return new Map();
    }
  }

  /**
   * Optimize file content for files above 1000 LOC
   */
  private async optimizeFileContent(content: string, filePath: string): Promise<string> {
    try {
      // For now, use simple content optimization since UniversalClassOptimizer
      // is designed for class information, not raw file content
      const lines = content.split('\n');
      const totalLines = lines.length;

      // Keep first 1000 lines (after line 1000) and add summary
      const keepLines = 1000;
      const optimizedLines = lines.slice(0, keepLines);

      // Add optimization summary
      const summary = `
// [OPTIMIZED] Original file: ${totalLines} lines, showing first ${keepLines} lines
// File: ${filePath}
// Optimization applied due to size > 1000 LOC
// Remaining ${totalLines - keepLines} lines contain implementation details
`;

      return summary + optimizedLines.join('\n');
    } catch (error) {
      logger.warn({ filePath, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to optimize file content, using truncated version');

      // Fallback: simple truncation
      const lines = content.split('\n');
      const truncatedLines = lines.slice(0, 100);
      return `// [TRUNCATED] File truncated due to optimization failure (${lines.length} LOC)\n${truncatedLines.join('\n')}`;
    }
  }

  // ========== PHASE 2D ENHANCEMENT HELPER METHODS ==========

  /**
   * Get enhanced priority weights based on project analysis
   */
  private getEnhancedPriorityWeights(
    strategy: string,
    projectAnalysis?: ProjectTypeAnalysisResult
  ): { semantic: number; keyword: number; structural: number } {
    const baseWeights = this.getPriorityWeights(strategy);

    if (!projectAnalysis) return baseWeights;

    // Adjust weights based on project type while maintaining the required structure
    let adjustmentFactor = 1.0;

    switch (projectAnalysis.projectType) {
      case 'React Application':
      case 'Vue.js Application':
      case 'Angular Application':
        // Frontend projects benefit from semantic analysis for component relationships
        adjustmentFactor = 1.1;
        return {
          semantic: Math.min(baseWeights.semantic * adjustmentFactor, 1.0),
          keyword: baseWeights.keyword,
          structural: Math.max(baseWeights.structural * 0.9, 0.1)
        };
      case 'Node.js Backend':
      case 'Python Backend':
      case 'Java Backend':
      case '.NET Backend':
        // Backend projects benefit from structural analysis for API patterns
        adjustmentFactor = 1.1;
        return {
          semantic: baseWeights.semantic,
          keyword: baseWeights.keyword,
          structural: Math.min(baseWeights.structural * adjustmentFactor, 1.0)
        };
      default:
        return baseWeights;
    }
  }

  /**
   * Get project-specific category filters
   */
  private getProjectSpecificFilters(
    projectAnalysis?: ProjectTypeAnalysisResult
  ): string[] {
    if (!projectAnalysis) return [];

    const filters: string[] = [];

    // Add filters based on project type
    if (projectAnalysis.projectType.includes('Frontend') ||
        projectAnalysis.projectType.includes('React') ||
        projectAnalysis.projectType.includes('Vue') ||
        projectAnalysis.projectType.includes('Angular')) {
      filters.push('components', 'styles', 'assets', 'hooks', 'composables');
    }

    if (projectAnalysis.projectType.includes('Backend') ||
        projectAnalysis.projectType.includes('API')) {
      filters.push('api', 'models', 'controllers', 'services', 'middleware');
    }

    if (projectAnalysis.projectType.includes('Mobile')) {
      filters.push('screens', 'navigation', 'components', 'services');
    }

    if (projectAnalysis.projectType.includes('Desktop')) {
      filters.push('windows', 'views', 'components', 'services');
    }

    // Add framework-specific filters
    if (projectAnalysis.frameworkStack.includes('Django')) {
      filters.push('models', 'views', 'serializers', 'urls');
    }

    if (projectAnalysis.frameworkStack.includes('Spring')) {
      filters.push('controllers', 'services', 'repositories', 'entities');
    }

    return filters;
  }

  /**
   * Get adaptive relevance threshold based on language analysis
   */
  private getAdaptiveThreshold(
    languageAnalysis?: LanguageAnalysisResult
  ): number {
    if (!languageAnalysis) return 0.3;

    // Lower threshold for projects with good grammar support
    const supportedLanguages = Object.values(languageAnalysis.grammarSupport)
      .filter(supported => supported).length;

    const supportRatio = supportedLanguages / languageAnalysis.languages.length;

    // Better grammar support = lower threshold (more inclusive)
    // More languages = slightly higher threshold (more selective)
    const grammarAdjustment = supportRatio * 0.2;
    const languageAdjustment = Math.min(languageAnalysis.languages.length / 10, 0.1);

    const result = Math.max(0.2, 0.4 - grammarAdjustment + languageAdjustment);

    // Round to avoid floating point precision issues
    return Math.round(result * 100) / 100;
  }

  /**
   * Derive technical constraints from project analysis
   */
  private deriveConstraintsFromProject(
    projectAnalysis?: ProjectTypeAnalysisResult
  ): string[] {
    if (!projectAnalysis) return [];

    const constraints: string[] = [];

    // Framework-specific constraints
    if (projectAnalysis.frameworkStack.includes('React')) {
      constraints.push('Follow React hooks patterns', 'Use functional components', 'Maintain component purity');
    }

    if (projectAnalysis.frameworkStack.includes('Vue.js')) {
      constraints.push('Follow Vue composition API', 'Use reactive patterns', 'Maintain component lifecycle');
    }

    if (projectAnalysis.frameworkStack.includes('Angular')) {
      constraints.push('Follow Angular style guide', 'Use dependency injection', 'Maintain module structure');
    }

    if (projectAnalysis.frameworkStack.includes('Django')) {
      constraints.push('Follow Django conventions', 'Use Django ORM patterns', 'Maintain MVT architecture');
    }

    if (projectAnalysis.frameworkStack.includes('Spring')) {
      constraints.push('Follow Spring conventions', 'Use dependency injection', 'Maintain layered architecture');
    }

    // Architecture-specific constraints
    if (projectAnalysis.architectureStyle.includes('Microservices')) {
      constraints.push('Maintain service boundaries', 'Use async communication', 'Ensure service independence');
    }

    if (projectAnalysis.architectureStyle.includes('Serverless')) {
      constraints.push('Keep functions stateless', 'Minimize cold start time', 'Use managed services');
    }

    return constraints;
  }

  /**
   * Derive quality requirements from language analysis
   */
  private deriveQualityRequirements(
    languageAnalysis?: LanguageAnalysisResult
  ): string[] {
    if (!languageAnalysis) return [];

    const requirements: string[] = [];

    // Language-specific quality requirements
    if (languageAnalysis.languages.includes('TypeScript')) {
      requirements.push('Maintain strict typing', 'Use proper interfaces', 'Avoid any types');
    }

    if (languageAnalysis.languages.includes('JavaScript')) {
      requirements.push('Use ESLint rules', 'Follow modern ES6+ patterns', 'Maintain code consistency');
    }

    if (languageAnalysis.languages.includes('Python')) {
      requirements.push('Follow PEP 8 style guide', 'Use type hints', 'Maintain docstring standards');
    }

    if (languageAnalysis.languages.includes('Java')) {
      requirements.push('Follow Java conventions', 'Use proper exception handling', 'Maintain SOLID principles');
    }

    // Framework-specific quality requirements
    if (languageAnalysis.frameworkIndicators.includes('React')) {
      requirements.push('Use React best practices', 'Optimize re-renders', 'Follow accessibility guidelines');
    }

    if (languageAnalysis.frameworkIndicators.includes('Django')) {
      requirements.push('Use Django best practices', 'Maintain security standards', 'Follow DRY principles');
    }

    return requirements;
  }

  /**
   * Infer team expertise from project analysis
   */
  private inferTeamExpertise(
    projectAnalysis?: ProjectTypeAnalysisResult
  ): string[] {
    if (!projectAnalysis) return [];

    const expertise: string[] = [];

    // Infer expertise based on project type and frameworks
    if (projectAnalysis.projectType.includes('Frontend') ||
        projectAnalysis.projectType.includes('React') ||
        projectAnalysis.projectType.includes('Vue') ||
        projectAnalysis.projectType.includes('Angular') ||
        projectAnalysis.secondaryTypes.includes('Frontend')) {
      expertise.push('Frontend Development', 'UI/UX Design', 'Web Technologies');
    }

    if (projectAnalysis.projectType.includes('Backend') ||
        projectAnalysis.secondaryTypes.includes('Backend')) {
      expertise.push('Backend Development', 'API Design', 'Database Management');
    }

    if (projectAnalysis.projectType.includes('Mobile') ||
        projectAnalysis.secondaryTypes.includes('Mobile')) {
      expertise.push('Mobile Development', 'Cross-platform Development', 'Mobile UI/UX');
    }

    // Framework-specific expertise
    projectAnalysis.frameworkStack.forEach(framework => {
      expertise.push(`${framework} Development`);
    });

    // Architecture-specific expertise
    projectAnalysis.architectureStyle.forEach(style => {
      expertise.push(`${style} Architecture`);
    });

    return expertise;
  }

  /**
   * Get framework-specific guidelines
   */
  private getFrameworkGuidelines(
    frameworkStack?: string[]
  ): string[] {
    if (!frameworkStack) return [];

    const guidelines: string[] = [];

    frameworkStack.forEach(framework => {
      switch (framework) {
        case 'React':
          guidelines.push(
            'Use functional components with hooks',
            'Implement proper error boundaries',
            'Follow React performance best practices'
          );
          break;
        case 'Vue.js':
          guidelines.push(
            'Use Composition API for complex logic',
            'Implement proper component communication',
            'Follow Vue.js style guide'
          );
          break;
        case 'Angular':
          guidelines.push(
            'Use Angular CLI for consistency',
            'Implement proper dependency injection',
            'Follow Angular coding standards'
          );
          break;
        case 'Django':
          guidelines.push(
            'Follow Django project structure',
            'Use Django ORM best practices',
            'Implement proper security measures'
          );
          break;
        case 'Spring':
          guidelines.push(
            'Use Spring Boot conventions',
            'Implement proper exception handling',
            'Follow Spring security best practices'
          );
          break;
      }
    });

    return guidelines;
  }

  // ========== PHASE 7 ENHANCEMENT HELPER METHODS ==========

  /**
   * Build enhanced context package with all Phase 7 improvements
   */
  private async buildEnhancedPackage(context: WorkflowContext): Promise<ContextPackage> {
    logger.info({ jobId: context.jobId }, 'Building enhanced context package');

    try {
      // Calculate enhanced statistics
      const totalTokens = context.relevanceScoring!.fileScores.reduce(
        (sum: number, file: Record<string, unknown>) => sum + (Number(file.estimatedTokens) || 0),
        0
      );

      // Build enhanced file list with better metadata
      const enhancedFiles = await this.buildEnhancedFileList(context);

      // Transform ContextFile[] to FileRelevance[] format
      const fileRelevances = enhancedFiles.map(file => ({
        file,
        relevanceScore: {
          score: 0.7,
          confidence: 0.8,
          reasoning: `Included ${file.language} file based on relevance analysis`
        },
        categories: ['relevant'],
        extractedKeywords: []
      }));

      // Create enhanced context package with codemap content
      const contextPackage: ContextPackage = {
        id: context.jobId,
        userPrompt: context.input.userPrompt,
        refinedPrompt: context.promptRefinement!.refinedPrompt, // Add the refined prompt
        taskType: context.intentAnalysis!.taskType,
        projectPath: context.input.projectPath,
        generatedAt: new Date(),
        codemapPath: context.codemapPath || '',
        codemapContent: context.codemapContent || '', // Include full codemap content
        files: fileRelevances,
        metaPrompt: {
          taskType: context.intentAnalysis!.taskType,
          systemPrompt: context.metaPromptGeneration!.systemPrompt,
          userPrompt: context.metaPromptGeneration!.userPrompt,
          contextSummary: context.metaPromptGeneration!.contextSummary,
          taskDecomposition: context.metaPromptGeneration!.taskDecomposition,
          guidelines: context.metaPromptGeneration!.guidelines,
          estimatedComplexity: context.metaPromptGeneration!.estimatedComplexity,
          aiAgentResponseFormat: context.metaPromptGeneration!.aiAgentResponseFormat
        },
        statistics: {
          totalFiles: fileRelevances.length,
          totalTokens,
          averageRelevanceScore: context.relevanceScoring!.overallMetrics.averageRelevance,
          processingTimeMs: Date.now() - context.startTime,
          cacheHitRate: 0 // Will be updated if cache is used
        },
        // Include additional context for debugging and validation
        debugInfo: {
          codemapContentLength: context.codemapContent?.length || 0,
          filesWithContent: fileRelevances.filter(f => f.file.content !== null).length,
          totalFilesAnalyzed: fileRelevances.length,
          intentAnalysisConfidence: context.intentAnalysis!.confidence,
          averageFileRelevance: context.relevanceScoring!.overallMetrics.averageRelevance
        }
      };

      logger.info({
        jobId: context.jobId,
        totalFiles: fileRelevances.length,
        totalTokens,
        averageRelevance: context.relevanceScoring!.overallMetrics.averageRelevance
      }, 'Enhanced context package built successfully');

      return contextPackage;

    } catch (error) {
      logger.error({
        jobId: context.jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to build enhanced context package');
      throw error;
    }
  }

  /**
   * Build enhanced file list with better metadata and content handling
   */
  private async buildEnhancedFileList(context: WorkflowContext): Promise<ContextFile[]> {
    const enhancedFiles: ContextFile[] = [];

    for (const fileScore of context.relevanceScoring!.fileScores) {
      try {
        // Detect file language more accurately
        const language = this.detectFileLanguage(fileScore.filePath);

        // Get file stats if available
        const fileStats = await this.getFileStats(fileScore.filePath);

        // Extract keywords from file path and reasoning
        // Note: keyword extraction removed as it's not currently used

        // Extract actual file content based on relevance score
        let fileContent: string | null = null;
        let isOptimized = false;

        // Include content for high relevance files (score >= 0.7)
        if (fileScore.relevanceScore >= 0.7) {
          logger.debug({
            filePath: fileScore.filePath,
            relevanceScore: fileScore.relevanceScore
          }, 'Attempting to extract file content for high relevance file');

          const result = await this.extractSingleFileContent(fileScore.filePath, context.securityConfig);

          if (result) {
            fileContent = result.content;
            // Update the file path to use the resolved path
            fileScore.filePath = result.resolvedPath;
          }

          logger.info({
            filePath: fileScore.filePath,
            contentExtracted: fileContent !== null,
            contentLength: fileContent?.length || 0,
            isOptimized: fileContent?.includes('[OPTIMIZED]') || false
          }, 'File content extraction result');

          if (fileContent && fileContent.includes('[OPTIMIZED]')) {
            isOptimized = true;
          }
        } else {
          logger.debug({
            filePath: fileScore.filePath,
            relevanceScore: fileScore.relevanceScore
          }, 'Skipping content extraction for low relevance file');
        }

        // Calculate actual token count for the file content
        let actualTokenCount = 0;
        if (fileContent && typeof fileContent === 'string') {
          try {
            actualTokenCount = TokenEstimator.estimateTokens(fileContent);
            logger.debug({
              filePath: fileScore.filePath,
              contentLength: fileContent.length,
              tokenCount: actualTokenCount
            }, 'Calculated token count for enhanced file');
          } catch (error) {
            // Fallback to character-based estimation (rough estimate: characters ÷ 4)
            actualTokenCount = Math.ceil(fileContent.length / 4);
            logger.warn({
              filePath: fileScore.filePath,
              error: error instanceof Error ? error.message : 'Unknown error',
              fallbackTokenCount: actualTokenCount
            }, 'Token estimation failed for enhanced file, using fallback calculation');
          }
        }

        const enhancedFile: ContextFile = {
          size: fileStats?.size || 0,
          path: fileScore.filePath,
          content: fileContent,
          lastModified: fileStats?.lastModified instanceof Date ? fileStats.lastModified : new Date(fileStats?.lastModified || Date.now()),
          language,
          isOptimized,
          tokenCount: actualTokenCount,
          optimizedSummary: isOptimized ? 'Content optimized for relevance' : undefined
        };

        enhancedFiles.push(enhancedFile);

      } catch (error) {
        logger.warn({
          filePath: fileScore.filePath,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to enhance file metadata, using basic info');

        // Fallback to basic file info with content extraction for high relevance files
        let fallbackContent: string | null = null;
        let fallbackTokenCount = 0;

        if (fileScore.relevanceScore >= 0.7) {
          try {
            const result = await this.extractSingleFileContent(fileScore.filePath, context.securityConfig);

            if (result) {
              fallbackContent = result.content;
              // Update the file path to use the resolved path
              fileScore.filePath = result.resolvedPath;
            }

            // Calculate token count for fallback content
            if (fallbackContent && typeof fallbackContent === 'string') {
              try {
                fallbackTokenCount = TokenEstimator.estimateTokens(fallbackContent);
              } catch (error) {
                fallbackTokenCount = Math.ceil(fallbackContent.length / 4);
                logger.warn({
                  filePath: fileScore.filePath,
                  error: error instanceof Error ? error.message : 'Unknown error',
                  fallbackTokenCount
                }, 'Token estimation failed for fallback content, using character-based estimation');
              }
            }
          } catch (error) {
            logger.warn({ filePath: fileScore.filePath, error }, 'Failed to extract content in fallback');
          }
        }

        enhancedFiles.push({
          size: 0,
          path: fileScore.filePath,
          content: fallbackContent,
          lastModified: new Date(),
          language: 'unknown',
          isOptimized: false,
          tokenCount: fallbackTokenCount,
          optimizedSummary: undefined
        });
      }
    }

    return enhancedFiles;
  }

  /**
   * Detect file language from file extension and content
   */
  private detectFileLanguage(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();

    const languageMap: { [key: string]: string } = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'h': 'c',
      'hpp': 'cpp',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'clj': 'clojure',
      'hs': 'haskell',
      'ml': 'ocaml',
      'fs': 'fsharp',
      'vb': 'vbnet',
      'pas': 'pascal',
      'pl': 'perl',
      'sh': 'shell',
      'bat': 'batch',
      'ps1': 'powershell',
      'yaml': 'yaml',
      'yml': 'yaml',
      'json': 'json',
      'xml': 'xml',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'less': 'less',
      'md': 'markdown',
      'txt': 'text'
    };

    return languageMap[extension || ''] || 'unknown';
  }

  /**
   * Get file statistics (size, modification time)
   */
  private async getFileStats(filePath: string): Promise<{ size: number; lastModified: Date } | null> {
    try {
      const fs = await import('fs-extra');
      const path = await import('path');

      const fullPath = path.resolve(filePath);
      if (await fs.pathExists(fullPath)) {
        const stats = await fs.stat(fullPath);
        return {
          size: stats.size,
          lastModified: stats.mtime
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract keywords from file path and reasoning
   */
  private extractKeywords(filePath: string, reasoning: string): string[] {
    const keywords = new Set<string>();

    // Extract from file path
    const pathParts = filePath.split(/[/\\]/).join(' ').split(/[._-]/).join(' ');
    const pathWords = pathParts.toLowerCase().match(/\b\w{3,}\b/g) || [];
    pathWords.forEach(word => keywords.add(word));

    // Extract from reasoning
    const reasoningWords = reasoning.toLowerCase().match(/\b\w{4,}\b/g) || [];
    reasoningWords.forEach(word => {
      if (!['this', 'that', 'with', 'from', 'they', 'have', 'will', 'been', 'were', 'said'].includes(word)) {
        keywords.add(word);
      }
    });

    return Array.from(keywords).slice(0, 10); // Limit to top 10 keywords
  }

}

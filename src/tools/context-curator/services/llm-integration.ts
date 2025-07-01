/**
 * LLM Integration Service for Context Curator
 * 
 * Handles all LLM interactions for the Context Curator workflow,
 * including format-aware calls, response validation, and error handling.
 */

import { performFormatAwareLlmCall, intelligentJsonParse } from '../../../utils/llmHelper.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { ContextCuratorConfigLoader } from './config-loader.js';
import logger from '../../../logger.js';

// Import prompt templates and validation functions
import { 
  buildIntentAnalysisPrompt, 
  INTENT_ANALYSIS_SYSTEM_PROMPT,
  validateIntentAnalysisResponse,
  getIntentAnalysisTaskId
} from '../prompts/intent-analysis.js';

import {
  buildPromptRefinementPrompt,
  PROMPT_REFINEMENT_SYSTEM_PROMPT,
  getPromptRefinementTaskId
} from '../prompts/prompt-refinement.js';

import {
  buildFileDiscoveryPrompt,
  FILE_DISCOVERY_SYSTEM_PROMPT,
  validateFileDiscoveryResponse,
  getFileDiscoveryTaskId
} from '../prompts/file-discovery.js';

import {
  buildRelevanceScoringPrompt,
  RELEVANCE_SCORING_SYSTEM_PROMPT,
  validateRelevanceScoringResponse,
  enhanceRelevanceScoringResponse,
  getRelevanceScoringTaskId
} from '../prompts/relevance-scoring.js';

import { preprocessRelevanceScoringResponse } from '../utils/json-preprocessing.js';

import {
  buildMetaPromptGenerationPrompt,
  META_PROMPT_GENERATION_SYSTEM_PROMPT,
  validateMetaPromptGenerationResponse,
  attemptResponseRecovery,
  getMetaPromptGenerationTaskId
} from '../prompts/meta-prompt-generation.js';

import type {
  IntentAnalysisResult,
  PromptRefinementResult,
  FileDiscoveryResult,
  FileDiscoveryFile,
  RelevanceScoringResult,
  MetaPromptGenerationResult,
  ProjectTypeAnalysisResult,
  LanguageAnalysisResult
} from '../types/llm-tasks.js';

/**
 * LLM Integration Service for Context Curator operations
 */
export class ContextCuratorLLMService {
  private static instance: ContextCuratorLLMService | null = null;
  private configLoader: ContextCuratorConfigLoader;

  private constructor() {
    this.configLoader = ContextCuratorConfigLoader.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ContextCuratorLLMService {
    if (!ContextCuratorLLMService.instance) {
      ContextCuratorLLMService.instance = new ContextCuratorLLMService();
    }
    return ContextCuratorLLMService.instance;
  }

  /**
   * Resilient LLM call wrapper specifically for Context Curator
   * Handles SSL/TLS and network errors with retry logic
   * ISOLATED TO CONTEXT CURATOR - NO IMPACT ON OTHER TOOLS
   */
  private async performResilientLlmCall(
    prompt: string,
    systemPrompt: string,
    config: OpenRouterConfig,
    taskId: string,
    expectedFormat: 'json' | 'markdown' | 'text' | 'yaml' = 'json',
    maxRetries: number = 3
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use existing performFormatAwareLlmCall - no changes to shared code
        return await performFormatAwareLlmCall(
          prompt,
          systemPrompt,
          config,
          taskId,
          expectedFormat
        );
      } catch (error) {
        lastError = error as Error;

        // Only retry on specific SSL/network errors
        if (this.isRetryableNetworkError(error) && attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000;

          logger.warn({
            taskId,
            attempt,
            maxRetries,
            backoffMs,
            error: error instanceof Error ? error.message : String(error),
            errorType: this.categorizeNetworkError(error)
          }, 'Context Curator: Network error, retrying with exponential backoff');

          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        // Log final failure with diagnostics
        if (attempt === maxRetries) {
          logger.error({
            taskId,
            totalAttempts: maxRetries,
            finalError: error instanceof Error ? error.message : String(error),
            errorType: this.categorizeNetworkError(error),
            suggestedAction: this.getSuggestedAction(error),
            networkDiagnostics: {
              sslConfigured: true,
              retryableError: this.isRetryableNetworkError(error),
              errorCategory: this.categorizeNetworkError(error)
            }
          }, 'Context Curator: All retry attempts failed');
        }

        throw error;
      }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError || new Error('Unexpected error in resilient LLM call');
  }

  /**
   * Determines if an error is retryable (network/SSL related)
   * PRIVATE METHOD - NO EXTERNAL IMPACT
   */
  private isRetryableNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();
    return (
      message.includes('ssl') ||
      message.includes('tls') ||
      message.includes('epipe') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('bad record mac') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('socket') ||
      message.includes('connection')
    );
  }

  /**
   * Categorizes network errors for better diagnostics
   * PRIVATE METHOD - NO EXTERNAL IMPACT
   */
  private categorizeNetworkError(error: unknown): string {
    if (!(error instanceof Error)) return 'unknown';

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
    if (message.includes('econnrefused')) {
      return 'connection_refused';
    }

    return 'network_error';
  }

  /**
   * Provides suggested actions for different error types
   * PRIVATE METHOD - NO EXTERNAL IMPACT
   */
  private getSuggestedAction(error: unknown): string {
    const errorType = this.categorizeNetworkError(error);

    switch (errorType) {
      case 'ssl_tls_error':
        return 'Check network connectivity and SSL/TLS configuration. Possible proxy or firewall interference.';
      case 'connection_reset':
        return 'Network connection was reset. Check internet connectivity and API endpoint availability.';
      case 'timeout':
        return 'Request timed out. Check network speed and API response times.';
      case 'connection_refused':
        return 'Connection refused by server. Check API endpoint URL and availability.';
      default:
        return 'General network error. Check internet connectivity and try again.';
    }
  }

  /**
   * Perform intent analysis using LLM
   */
  async performIntentAnalysis(
    userPrompt: string,
    codemapContent: string,
    config: OpenRouterConfig,
    additionalContext?: {
      projectType?: string;
      projectAnalysis?: ProjectTypeAnalysisResult;
      languageAnalysis?: LanguageAnalysisResult;
      existingPatterns?: string[];
      patternConfidence?: { [pattern: string]: number };
      patternEvidence?: { [pattern: string]: string[] };
      technicalConstraints?: string[];
    }
  ): Promise<IntentAnalysisResult> {
    const taskId = getIntentAnalysisTaskId();
    const model = this.configLoader.getLLMModel('intent_analysis');

    logger.info({ taskId, model }, 'Starting intent analysis');

    try {
      const userPromptContent = buildIntentAnalysisPrompt(userPrompt, codemapContent, additionalContext);
      
      const responseText = await performFormatAwareLlmCall(
        userPromptContent,
        INTENT_ANALYSIS_SYSTEM_PROMPT,
        config,
        taskId,
        'json'
      );

      // Use intelligent JSON parsing to handle LLM responses that may contain markdown code blocks
      // This aligns with the enhanced JSON normalization pipeline used throughout the system
      const response = intelligentJsonParse(responseText, taskId);

      if (!validateIntentAnalysisResponse(response)) {
        throw new Error('Invalid intent analysis response format');
      }

      const typedResponse = response as IntentAnalysisResult;
      logger.info({ taskId, taskType: typedResponse.taskType, confidence: typedResponse.confidence }, 'Intent analysis completed successfully');
      return response as IntentAnalysisResult;

    } catch (error) {
      logger.error({ taskId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Intent analysis failed');
      throw new Error(`Intent analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform prompt refinement using LLM
   */
  async performPromptRefinement(
    originalPrompt: string,
    intentAnalysis: IntentAnalysisResult,
    codemapContent: string,
    config: OpenRouterConfig,
    additionalContext?: {
      projectAnalysis?: ProjectTypeAnalysisResult;
      languageAnalysis?: LanguageAnalysisResult;
      existingPatterns?: string[];
      patternConfidence?: { [pattern: string]: number };
      patternEvidence?: { [pattern: string]: string[] };
      technicalConstraints?: string[];
      qualityRequirements?: string[];
      timelineConstraints?: string;
      teamExpertise?: string[];
    }
  ): Promise<PromptRefinementResult> {
    const taskId = getPromptRefinementTaskId();
    const model = this.configLoader.getLLMModel('prompt_refinement');

    logger.info({ taskId, model, taskType: intentAnalysis.taskType }, 'Starting prompt refinement');

    try {
      const userPromptContent = buildPromptRefinementPrompt(
        originalPrompt,
        intentAnalysis,
        codemapContent,
        additionalContext
      );
      
      const responseText = await this.performResilientLlmCall(
        userPromptContent,
        PROMPT_REFINEMENT_SYSTEM_PROMPT,
        config,
        taskId,
        'json',
        3 // Max retries for prompt refinement
      );

      // Use intelligent JSON parsing to handle LLM responses that may contain markdown code blocks
      // This aligns with the enhanced JSON normalization pipeline used throughout the system
      const response = intelligentJsonParse(responseText, taskId);

      // Validate basic structure first
      if (!response || typeof response !== 'object') {
        logger.error({ taskId, response: typeof response }, 'Prompt refinement response is not an object');
        throw new Error('Invalid prompt refinement response format: not an object');
      }

      const obj = response as Record<string, unknown>;

      // Log the actual response for debugging
      logger.debug({
        taskId,
        responseKeys: Object.keys(obj),
        refinedPromptType: typeof obj.refinedPrompt,
        enhancementReasoningType: typeof obj.enhancementReasoning,
        enhancementReasoningIsArray: Array.isArray(obj.enhancementReasoning),
        enhancementReasoningLength: Array.isArray(obj.enhancementReasoning) ? obj.enhancementReasoning.length : 'not array',
        addedContextType: typeof obj.addedContext,
        addedContextIsArray: Array.isArray(obj.addedContext),
        responsePreview: JSON.stringify(obj).substring(0, 500)
      }, 'Prompt refinement response structure analysis');

      // Check for required basic fields
      if (typeof obj.refinedPrompt !== 'string' || obj.refinedPrompt.length === 0) {
        logger.error({ taskId, refinedPromptType: typeof obj.refinedPrompt, refinedPromptValue: obj.refinedPrompt }, 'Invalid refinedPrompt field');
        throw new Error('Invalid prompt refinement response format: missing or invalid refinedPrompt');
      }

      // Handle enhancementReasoning field with more flexibility
      let enhancementReasoning: string[] = [];
      if (Array.isArray(obj.enhancementReasoning)) {
        enhancementReasoning = obj.enhancementReasoning.filter(item => typeof item === 'string' && item.length > 0);
      } else if (typeof obj.enhancementReasoning === 'string') {
        // Handle case where LLM returns a single string instead of array
        enhancementReasoning = [obj.enhancementReasoning];
      } else if (obj.enhancementReasoning) {
        logger.warn({ taskId, enhancementReasoningType: typeof obj.enhancementReasoning, enhancementReasoningValue: obj.enhancementReasoning }, 'Unexpected enhancementReasoning format, attempting to convert');
        enhancementReasoning = [String(obj.enhancementReasoning)];
      }

      // If enhancementReasoning is missing or empty, generate default reasoning based on the refined prompt
      if (enhancementReasoning.length === 0) {
        logger.info({ taskId, originalEnhancementReasoning: obj.enhancementReasoning }, 'enhancementReasoning is missing, generating default reasoning');

        // Generate intelligent default reasoning based on the refined prompt content
        const refinedPrompt = obj.refinedPrompt as string;
        const originalLength = originalPrompt.length;
        const refinedLength = refinedPrompt.length;

        enhancementReasoning = [
          `Enhanced prompt from ${originalLength} to ${refinedLength} characters for better clarity and specificity`,
          'Added contextual information to improve development guidance',
          'Structured requirements for more comprehensive implementation'
        ];

        // Add specific reasoning based on content analysis
        if (refinedPrompt.toLowerCase().includes('cli') || refinedPrompt.toLowerCase().includes('command line')) {
          enhancementReasoning.push('Added CLI-specific requirements and interface specifications');
        }
        if (refinedPrompt.toLowerCase().includes('test') || refinedPrompt.toLowerCase().includes('testing')) {
          enhancementReasoning.push('Included testing requirements and quality assurance guidelines');
        }
        if (refinedPrompt.toLowerCase().includes('error') || refinedPrompt.toLowerCase().includes('handling')) {
          enhancementReasoning.push('Enhanced error handling and robustness requirements');
        }

        logger.debug({ taskId, generatedReasoningCount: enhancementReasoning.length }, 'Generated default enhancement reasoning');
      }

      // Handle addedContext field with more flexibility
      let addedContext: string[] = [];
      if (Array.isArray(obj.addedContext)) {
        addedContext = obj.addedContext.filter(item => typeof item === 'string');
      } else if (typeof obj.addedContext === 'string') {
        // Handle case where LLM returns a single string instead of array
        addedContext = [obj.addedContext];
      } else if (obj.addedContext) {
        logger.warn({ taskId, addedContextType: typeof obj.addedContext, addedContextValue: obj.addedContext }, 'Unexpected addedContext format, attempting to convert');
        addedContext = [String(obj.addedContext)];
      }

      // addedContext can be empty, so we don't throw an error for it

      // Calculate missing metrics if not provided
      const enhancementCount = enhancementReasoning.length;

      // Import the helper functions
      const { calculateImprovementMetrics, extractContextualEnhancements } = await import('../prompts/prompt-refinement.js');

      const metrics = calculateImprovementMetrics(originalPrompt, obj.refinedPrompt as string, enhancementCount);
      const contextualEnhancements = extractContextualEnhancements(
        enhancementReasoning,
        addedContext
      );

      // Build complete response with calculated fields
      const completeResponse: PromptRefinementResult = {
        refinedPrompt: obj.refinedPrompt as string,
        enhancementReasoning: enhancementReasoning,
        addedContext: addedContext,
        originalLength: metrics.originalLength,
        refinedLength: metrics.refinedLength,
        improvementScore: metrics.improvementScore,
        contextualEnhancements
      };

      logger.info({
        taskId,
        refinedLength: completeResponse.refinedPrompt.length,
        enhancementCount: completeResponse.enhancementReasoning.length,
        addedContextCount: completeResponse.addedContext.length,
        improvementScore: completeResponse.improvementScore,
        contextualEnhancements: completeResponse.contextualEnhancements
      }, 'Prompt refinement completed successfully');

      return completeResponse;

    } catch (error) {
      logger.error({ taskId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Prompt refinement failed');
      throw new Error(`Prompt refinement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform file discovery using LLM
   */
  async performFileDiscovery(
    originalPrompt: string,
    intentAnalysis: IntentAnalysisResult,
    codemapContent: string,
    config: OpenRouterConfig,
    searchStrategy: 'semantic_similarity' | 'keyword_matching' | 'semantic_and_keyword' | 'structural_analysis' = 'semantic_similarity',
    additionalContext?: {
      filePatterns?: string[];
      excludePatterns?: string[];
      focusDirectories?: string[];
      maxFiles?: number;
      tokenBudget?: number;
    }
  ): Promise<FileDiscoveryResult> {
    const taskId = getFileDiscoveryTaskId(searchStrategy);
    const model = this.configLoader.getLLMModel('file_discovery');

    logger.info({ taskId, model, searchStrategy, taskType: intentAnalysis.taskType }, 'Starting file discovery');

    try {
      const userPromptContent = buildFileDiscoveryPrompt(
        originalPrompt,
        intentAnalysis,
        codemapContent,
        searchStrategy,
        additionalContext
      );
      
      const responseText = await this.performResilientLlmCall(
        userPromptContent,
        FILE_DISCOVERY_SYSTEM_PROMPT,
        config,
        taskId,
        'json',
        3 // Max retries for file discovery
      );

      // Debug logging for file discovery response
      logger.error({
        taskId,
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 500),
        fullResponse: responseText // Include full response for debugging
      }, 'File discovery LLM response received - DEBUG');

      // Use intelligent JSON parsing to handle LLM responses that may contain markdown code blocks
      // This aligns with the enhanced JSON normalization pipeline used throughout the system
      const response = intelligentJsonParse(responseText, taskId);

      // Debug logging for parsed response
      logger.info({
        taskId,
        parsedResponseType: typeof response,
        parsedResponseKeys: response && typeof response === 'object' ? Object.keys(response) : 'not an object',
        hasRelevantFiles: response && typeof response === 'object' && 'relevantFiles' in response,
        relevantFilesLength: response && typeof response === 'object' && 'relevantFiles' in response && Array.isArray(response.relevantFiles) ? response.relevantFiles.length : 'not an array'
      }, 'File discovery response parsed');

      // Enhanced debug logging for validation failure
      if (!validateFileDiscoveryResponse(response)) {
        logger.error({
          taskId,
          response: JSON.stringify(response, null, 2),
          validationDetails: {
            hasRelevantFiles: response && typeof response === 'object' && 'relevantFiles' in response,
            relevantFilesType: response && typeof response === 'object' && 'relevantFiles' in response ? typeof response.relevantFiles : 'missing',
            relevantFilesIsArray: response && typeof response === 'object' && 'relevantFiles' in response ? Array.isArray(response.relevantFiles) : false,
            firstFileExample: response && typeof response === 'object' && 'relevantFiles' in response && Array.isArray(response.relevantFiles) && response.relevantFiles.length > 0 ? response.relevantFiles[0] : 'no files',
            requiredFields: ['relevantFiles', 'totalFilesAnalyzed', 'processingTimeMs', 'searchStrategy', 'coverageMetrics'],
            presentFields: response && typeof response === 'object' ? Object.keys(response) : []
          }
        }, 'File discovery response validation failed - DETAILED DEBUG');

        // Try to fix abstract file names before throwing error
        const fixedResponse = this.fixAbstractFileNames(response, codemapContent, taskId);
        if (fixedResponse && validateFileDiscoveryResponse(fixedResponse)) {
          logger.info({
            taskId,
            originalFiles: response && typeof response === 'object' && 'relevantFiles' in response && Array.isArray(response.relevantFiles) ? response.relevantFiles.map((f: FileDiscoveryFile) => f.path) : [],
            fixedFiles: fixedResponse.relevantFiles.map((f: FileDiscoveryFile) => f.path)
          }, 'Successfully fixed abstract file names');
          return fixedResponse;
        }

        throw new Error('Invalid file discovery response format');
      }

      const typedResponse = response as FileDiscoveryResult;
      logger.info({
        taskId,
        filesFound: typedResponse.relevantFiles.length,
        totalAnalyzed: typedResponse.totalFilesAnalyzed,
        strategy: typedResponse.searchStrategy
      }, 'File discovery completed successfully');

      return response as FileDiscoveryResult;

    } catch (error) {
      logger.error({
        taskId,
        searchStrategy,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        errorName: error instanceof Error ? error.name : undefined
      }, 'File discovery failed - DETAILED ERROR');
      throw new Error(`File discovery failed for strategy ${searchStrategy}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fix abstract file names by mapping them to actual file paths from the codemap
   */
  private fixAbstractFileNames(response: unknown, codemapContent: string, taskId: string): FileDiscoveryResult | null {
    try {
      if (!response || typeof response !== 'object' || !Array.isArray((response as Record<string, unknown>).relevantFiles)) {
        return null;
      }

      // Extract actual file paths from codemap
      const filePathRegex = /(?:^|\s)([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.[a-zA-Z0-9]+)(?:\s|$)/gm;
      const actualFilePaths = new Set<string>();
      let match;
      while ((match = filePathRegex.exec(codemapContent)) !== null) {
        actualFilePaths.add(match[1]);
      }

      // Also extract paths from directory structure patterns
      const directoryPathRegex = /(?:^|\n)\s*([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.[a-zA-Z0-9]+)/gm;
      while ((match = directoryPathRegex.exec(codemapContent)) !== null) {
        actualFilePaths.add(match[1]);
      }

      const actualFilePathsArray = Array.from(actualFilePaths);
      logger.debug({
        taskId,
        extractedPaths: actualFilePathsArray.slice(0, 10), // Log first 10 for debugging
        totalPaths: actualFilePathsArray.length
      }, 'Extracted actual file paths from codemap');

      // Fix each file in the response
      const fixedFiles = (response as FileDiscoveryResult).relevantFiles.map((file: FileDiscoveryFile) => {
        if (!file || typeof file !== 'object' || typeof file.path !== 'string') {
          return file;
        }

        const originalPath = file.path;

        // If the path already looks like a real file path, keep it
        if (originalPath.includes('/') && originalPath.includes('.')) {
          return file;
        }

        // Try to find a matching actual file path
        const matchingPath = this.findBestFilePathMatch(originalPath, actualFilePathsArray);

        if (matchingPath) {
          logger.debug({
            taskId,
            originalPath,
            matchingPath
          }, 'Fixed abstract file name');

          return {
            ...file,
            path: matchingPath
          };
        }

        // If no match found, keep original (will likely fail validation)
        return file;
      });

      return {
        ...(response as FileDiscoveryResult),
        relevantFiles: fixedFiles
      };
    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Error fixing abstract file names');
      return null;
    }
  }

  /**
   * Find the best matching file path for an abstract name
   */
  private findBestFilePathMatch(abstractName: string, actualPaths: string[]): string | null {
    const normalizedAbstract = abstractName.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Try exact matches first
    for (const path of actualPaths) {
      const fileName = path.split('/').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      if (fileName === normalizedAbstract) {
        return path;
      }
    }

    // Try partial matches
    for (const path of actualPaths) {
      const fileName = path.split('/').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      if (fileName.includes(normalizedAbstract) || normalizedAbstract.includes(fileName)) {
        return path;
      }
    }

    // Try directory + file name matches
    for (const path of actualPaths) {
      const normalizedPath = path.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedPath.includes(normalizedAbstract) || normalizedAbstract.includes(normalizedPath)) {
        return path;
      }
    }

    return null;
  }

  /**
   * Retry relevance scoring with enhanced prompt for incomplete responses
   * ISOLATED TO CONTEXT CURATOR - NO IMPACT ON OTHER TOOLS
   */
  private async retryRelevanceScoring(
    originalPrompt: string,
    expectedFiles: Array<{ path: string; estimatedTokens: number }>,
    config: OpenRouterConfig,
    taskId: string,
    attempt: number = 1,
    maxAttempts: number = 2
  ): Promise<string | null> {
    if (attempt > maxAttempts) {
      logger.warn({
        taskId,
        maxAttempts,
        finalAttempt: attempt
      }, `Context Curator: Max retry attempts (${maxAttempts}) reached. Using original response.`);
      return null;
    }

    logger.info({
      taskId,
      attempt,
      maxAttempts,
      expectedFileCount: expectedFiles.length
    }, `Context Curator: Retry attempt ${attempt}/${maxAttempts} for relevance scoring`);

    // Enhanced prompt for retry
    const retryPrompt = `${originalPrompt}

CRITICAL RETRY INSTRUCTIONS:
- Previous attempt returned incomplete response
- You MUST score ALL ${expectedFiles.length} files
- Return JSON array format with fileScores containing ${expectedFiles.length} objects
- Do NOT return a single file object
- Validate your response contains exactly ${expectedFiles.length} file scores before responding`;

    try {
      const responseText = await this.performResilientLlmCall(
        retryPrompt,
        RELEVANCE_SCORING_SYSTEM_PROMPT,
        config,
        taskId,
        'json',
        2 // Reduced retries for retry attempts
      );

      logger.info({
        taskId,
        attempt,
        responseLength: responseText.length,
        containsFileScores: responseText.includes('fileScores')
      }, `Context Curator: Retry attempt ${attempt} completed`);

      return responseText;
    } catch (error) {
      logger.error({
        taskId,
        attempt,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, `Context Curator: Retry attempt ${attempt} failed`);
      return null;
    }
  }

  /**
   * Process files in chunks for large file sets
   * ISOLATED TO CONTEXT CURATOR - NO IMPACT ON OTHER TOOLS
   */
  private async processFilesInChunks(
    originalPrompt: string,
    intentAnalysis: IntentAnalysisResult,
    refinedPrompt: string,
    fileDiscoveryResult: FileDiscoveryResult,
    config: OpenRouterConfig,
    scoringStrategy: 'semantic_similarity' | 'keyword_density' | 'structural_importance' | 'hybrid',
    additionalContext: {
      codemapContent?: string;
      projectAnalysis?: ProjectTypeAnalysisResult;
      languageAnalysis?: LanguageAnalysisResult;
      architecturalPatterns?: Record<string, unknown>;
      priorityWeights?: {
        semantic: number;
        keyword: number;
        structural: number;
      };
      categoryFilters?: string[];
      minRelevanceThreshold?: number;
    } | undefined,
    chunkSize: number = 20
  ): Promise<RelevanceScoringResult> {
    const files = fileDiscoveryResult.relevantFiles;
    const chunks = [];
    for (let i = 0; i < files.length; i += chunkSize) {
      chunks.push(files.slice(i, i + chunkSize));
    }

    logger.info({
      totalFiles: files.length,
      totalChunks: chunks.length,
      chunkSize,
      scoringStrategy
    }, `Context Curator: Processing ${files.length} files in ${chunks.length} chunks of ${chunkSize} files each`);

    const allFileScores: Array<{
      filePath: string;
      relevanceScore: number;
      confidence: number;
      reasoning: string;
      categories: string[];
      modificationLikelihood: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
      estimatedTokens: number;
    }> = [];
    let totalProcessingTime = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      logger.info({
        chunkIndex: i + 1,
        totalChunks: chunks.length,
        chunkSize: chunk.length
      }, `Context Curator: Processing chunk ${i + 1}/${chunks.length} with ${chunk.length} files`);

      // Create chunk-specific file discovery result
      const chunkFileDiscoveryResult: FileDiscoveryResult = {
        ...fileDiscoveryResult,
        relevantFiles: chunk
      };

      try {
        const chunkPrompt = buildRelevanceScoringPrompt(
          originalPrompt,
          intentAnalysis,
          refinedPrompt,
          chunkFileDiscoveryResult,
          scoringStrategy,
          additionalContext
        );

        const enhancedChunkPrompt = `${chunkPrompt}

CHUNK PROCESSING: This is chunk ${i + 1} of ${chunks.length}
Score these ${chunk.length} files from the complete list of ${files.length} files:

${chunk.map(f => `- ${f.path}`).join('\n')}

Return the same JSON format but only for these ${chunk.length} files.`;

        const startTime = Date.now();
        const chunkResponseText = await this.performResilientLlmCall(
          enhancedChunkPrompt,
          RELEVANCE_SCORING_SYSTEM_PROMPT,
          config,
          `${getRelevanceScoringTaskId()}_chunk_${i + 1}`,
          'json',
          2 // Reduced retries for chunks
        );
        const chunkProcessingTime = Date.now() - startTime;
        totalProcessingTime += chunkProcessingTime;

        logger.info({
          chunkIndex: i + 1,
          processingTime: chunkProcessingTime,
          responseLength: chunkResponseText.length
        }, `Context Curator: Chunk ${i + 1} processed in ${chunkProcessingTime}ms`);

        // Process chunk response
        const preprocessedResponse = preprocessRelevanceScoringResponse(chunkResponseText, `chunk_${i + 1}`);
        const chunkResponse = intelligentJsonParse(preprocessedResponse, `chunk_${i + 1}`);

        if (chunkResponse && typeof chunkResponse === 'object') {
          const obj = chunkResponse as Record<string, unknown>;

          if (Array.isArray(obj.fileScores)) {
            allFileScores.push(...obj.fileScores.map(score => ({
              filePath: String(score.filePath || ''),
              relevanceScore: Number(score.relevanceScore || 0),
              confidence: Number(score.confidence || 0),
              reasoning: String(score.reasoning || ''),
              categories: Array.isArray(score.categories) ? score.categories.map(String) : [],
              modificationLikelihood: (['very_high', 'high', 'medium', 'low', 'very_low'].includes(String(score.modificationLikelihood || 'low')) ? String(score.modificationLikelihood || 'low') : 'low') as 'very_high' | 'high' | 'medium' | 'low' | 'very_low',
              estimatedTokens: Number(score.estimatedTokens || 0)
            })));
            logger.info({
              chunkIndex: i + 1,
              scoresAdded: obj.fileScores.length,
              totalScores: allFileScores.length
            }, `Context Curator: Added ${obj.fileScores.length} scores from chunk ${i + 1}`);
          } else if ('filePath' in obj && 'relevanceScore' in obj) {
            // Handle single file response in chunk
            allFileScores.push({
              filePath: String(obj.filePath || ''),
              relevanceScore: Number(obj.relevanceScore || 0),
              confidence: Number(obj.confidence || 0),
              reasoning: String(obj.reasoning || ''),
              categories: Array.isArray(obj.categories) ? obj.categories.map(String) : [],
              modificationLikelihood: (['very_high', 'high', 'medium', 'low', 'very_low'].includes(String(obj.modificationLikelihood || 'low')) ? String(obj.modificationLikelihood || 'low') : 'low') as 'very_high' | 'high' | 'medium' | 'low' | 'very_low',
              estimatedTokens: Number(obj.estimatedTokens || 0)
            });
            logger.info({
              chunkIndex: i + 1,
              scoresAdded: 1,
              totalScores: allFileScores.length
            }, `Context Curator: Added 1 score (single file format) from chunk ${i + 1}`);
          }
        }
      } catch (error) {
        logger.warn({
          chunkIndex: i + 1,
          chunkSize: chunk.length,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, `Context Curator: Error processing chunk ${i + 1}, adding default scores for chunk files`);

        // Add default scores for failed chunk
        for (const file of chunk) {
          allFileScores.push({
            filePath: file.path,
            relevanceScore: 0.3,
            confidence: 0.5,
            reasoning: 'Auto-generated score: Chunk processing failed',
            categories: ['utility'],
            modificationLikelihood: 'low',
            estimatedTokens: file.estimatedTokens
          });
        }
      }
    }

    logger.info({
      totalFiles: files.length,
      totalScored: allFileScores.length,
      totalProcessingTime,
      chunksProcessed: chunks.length
    }, `Context Curator: Chunked processing completed. Total files scored: ${allFileScores.length}/${files.length}`);

    // Combine results
    const averageRelevance = allFileScores.length > 0
      ? allFileScores.reduce((sum, f) => sum + (f.relevanceScore || 0.3), 0) / allFileScores.length
      : 0;

    const result: RelevanceScoringResult = {
      fileScores: allFileScores,
      overallMetrics: {
        averageRelevance: Math.round(averageRelevance * 100) / 100,
        totalFilesScored: allFileScores.length,
        highRelevanceCount: allFileScores.filter(f => (f.relevanceScore || 0) >= 0.7).length,
        processingTimeMs: totalProcessingTime
      },
      scoringStrategy: scoringStrategy,
      chunkingUsed: true,
      totalChunks: chunks.length,
      chunkSize: chunkSize
    };

    return result;
  }

  /**
   * Perform relevance scoring using LLM
   */
  async performRelevanceScoring(
    originalPrompt: string,
    intentAnalysis: IntentAnalysisResult,
    refinedPrompt: string,
    fileDiscoveryResult: FileDiscoveryResult,
    config: OpenRouterConfig,
    scoringStrategy: 'semantic_similarity' | 'keyword_density' | 'structural_importance' | 'hybrid' = 'semantic_similarity',
    additionalContext?: {
      codemapContent?: string;
      projectAnalysis?: ProjectTypeAnalysisResult;
      languageAnalysis?: LanguageAnalysisResult;
      architecturalPatterns?: Record<string, unknown>;
      priorityWeights?: {
        semantic: number;
        keyword: number;
        structural: number;
      };
      categoryFilters?: string[];
      minRelevanceThreshold?: number;
    },
    externalTaskId?: string
  ): Promise<RelevanceScoringResult> {
    const taskId = externalTaskId || getRelevanceScoringTaskId();
    const model = this.configLoader.getLLMModel('relevance_ranking');

    // FIX 1: Add diagnostic logging to trace exact file count at threshold evaluation
    const fileCount = fileDiscoveryResult.relevantFiles.length;
    logger.info({
      taskId,
      model,
      scoringStrategy,
      filesToScore: fileCount,
      thresholdCheck: fileCount > 40,
      chunkingRequired: fileCount > 40 ? 'YES' : 'NO'
    }, 'Context Curator: Starting relevance scoring with threshold diagnostics');

    try {
      // FIX 1: Enhanced chunked processing threshold check with explicit logging
      if (fileCount > 40) {
        logger.info({
          taskId,
          fileCount,
          threshold: 40,
          chunkSize: 20,
          expectedChunks: Math.ceil(fileCount / 20)
        }, `Context Curator: File count (${fileCount}) exceeds threshold (40). Using chunked processing.`);

        return this.processFilesInChunks(
          originalPrompt,
          intentAnalysis,
          refinedPrompt,
          fileDiscoveryResult,
          config,
          scoringStrategy,
          additionalContext,
          20
        );
      }

      // Log when NOT using chunked processing
      logger.info({
        taskId,
        fileCount,
        threshold: 40,
        processingMode: 'single_batch'
      }, `Context Curator: File count (${fileCount}) is within threshold (40). Using single batch processing.`);

      const userPromptContent = buildRelevanceScoringPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        fileDiscoveryResult,
        scoringStrategy,
        additionalContext
      );

      let responseText = await this.performResilientLlmCall(
        userPromptContent,
        RELEVANCE_SCORING_SYSTEM_PROMPT,
        config,
        taskId,
        'json',
        3 // Max retries for relevance scoring
      );

      // Context Curator diagnostic logging for relevance scoring
      logger.info({
        taskId,
        expectedFileCount: fileDiscoveryResult.relevantFiles.length,
        responseContainsFileScores: responseText.includes('fileScores'),
        responseContainsSingleFile: responseText.includes('filePath') && !responseText.includes('fileScores'),
        responseLength: responseText.length
      }, 'Context Curator: Relevance scoring response analysis');

      // Enhanced debug logging for relevance scoring response
      logger.info({
        taskId,
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 500),
        responseEnd: responseText.substring(Math.max(0, responseText.length - 200)),
        containsFileScores: responseText.includes('fileScores'),
        containsOverallMetrics: responseText.includes('overallMetrics'),
        containsScoringStrategy: responseText.includes('scoringStrategy'),
        startsWithBrace: responseText.trim().startsWith('{'),
        endsWithBrace: responseText.trim().endsWith('}')
      }, 'Relevance scoring LLM response received - DETAILED DEBUG');

      // NEW: Apply Context Curator-specific preprocessing to handle large responses
      // that get truncated by shared JSON extraction logic
      const preprocessedResponse = preprocessRelevanceScoringResponse(responseText, taskId);

      // Use intelligent JSON parsing to handle LLM responses that may contain markdown code blocks
      // This aligns with the enhanced JSON normalization pipeline used throughout the system
      let response = intelligentJsonParse(preprocessedResponse, taskId);

      // FIX 2: Enhanced validation and retry logic for single file responses
      let retryAttempted = false;
      if (response && typeof response === 'object') {
        const obj = response as Record<string, unknown>;

        // Check if LLM returned single file instead of array
        if ('filePath' in obj && 'relevanceScore' in obj && !('fileScores' in obj)) {
          logger.warn({
            taskId,
            expectedFiles: fileDiscoveryResult.relevantFiles.length,
            responseType: 'single_file',
            retryAttempt: 'initiating'
          }, `Context Curator: LLM returned single file instead of array for ${fileDiscoveryResult.relevantFiles.length} files. Retrying with modified prompt.`);

          const expectedFiles = fileDiscoveryResult.relevantFiles.map(f => ({
            path: f.path,
            estimatedTokens: f.estimatedTokens
          }));

          const retryResponse = await this.retryRelevanceScoring(userPromptContent, expectedFiles, config, taskId, 1);
          retryAttempted = true;

          if (retryResponse) {
            responseText = retryResponse;
            response = intelligentJsonParse(preprocessRelevanceScoringResponse(retryResponse, taskId), taskId);
            logger.info({
              taskId,
              retrySuccess: true,
              newResponseLength: retryResponse.length,
              containsFileScores: retryResponse.includes('fileScores')
            }, 'Context Curator: Retry for single file response completed successfully');
          } else {
            logger.warn({
              taskId,
              retrySuccess: false,
              fallbackRequired: true
            }, 'Context Curator: Retry for single file response failed, will use fallback enhancement');
          }
        }
        // Check if fileScores array is incomplete (less than 80% of expected files)
        else if (Array.isArray(obj.fileScores) && obj.fileScores.length < fileDiscoveryResult.relevantFiles.length * 0.8) {
          const completionRate = Math.round(obj.fileScores.length / fileDiscoveryResult.relevantFiles.length * 100);
          logger.warn({
            taskId,
            scoredFiles: obj.fileScores.length,
            expectedFiles: fileDiscoveryResult.relevantFiles.length,
            completionRate,
            retryAttempt: 'initiating'
          }, `Context Curator: LLM only scored ${obj.fileScores.length}/${fileDiscoveryResult.relevantFiles.length} files (${completionRate}%). Retrying.`);

          const expectedFiles = fileDiscoveryResult.relevantFiles.map(f => ({
            path: f.path,
            estimatedTokens: f.estimatedTokens
          }));

          const retryResponse = await this.retryRelevanceScoring(userPromptContent, expectedFiles, config, taskId, 1);
          retryAttempted = true;

          if (retryResponse) {
            responseText = retryResponse;
            response = intelligentJsonParse(preprocessRelevanceScoringResponse(retryResponse, taskId), taskId);
            logger.info({
              taskId,
              retrySuccess: true,
              newResponseLength: retryResponse.length,
              containsFileScores: retryResponse.includes('fileScores')
            }, 'Context Curator: Retry for incomplete array completed successfully');
          } else {
            logger.warn({
              taskId,
              retrySuccess: false,
              fallbackRequired: true
            }, 'Context Curator: Retry for incomplete array failed, will use fallback enhancement');
          }
        }
      }

      // FIX 3: More restrictive fallback logic - only apply after retry attempts
      const expectedFiles = fileDiscoveryResult.relevantFiles.map(f => ({
        path: f.path,
        estimatedTokens: f.estimatedTokens
      }));

      // Only apply fallback enhancement if we haven't retried or retry failed
      let enhancedResponse;
      if (retryAttempted) {
        // If retry was attempted, be more restrictive about fallback
        if (response && typeof response === 'object') {
          const obj = response as Record<string, unknown>;

          // Only apply fallback for genuine parsing failures, not format violations
          if (!('fileScores' in obj) && !('filePath' in obj)) {
            // Genuine parsing failure - apply fallback
            logger.info({
              taskId,
              reason: 'parsing_failure_after_retry'
            }, 'Context Curator: Applying fallback enhancement after retry due to parsing failure');
            enhancedResponse = enhanceRelevanceScoringResponse(response, scoringStrategy, fileDiscoveryResult.processingTimeMs, expectedFiles);
          } else {
            // Format violation after retry - use response as-is but log warning
            logger.warn({
              taskId,
              reason: 'format_violation_after_retry',
              hasFileScores: 'fileScores' in obj,
              hasSingleFile: 'filePath' in obj
            }, 'Context Curator: Format violation persists after retry, using response as-is');
            enhancedResponse = enhanceRelevanceScoringResponse(response, scoringStrategy, fileDiscoveryResult.processingTimeMs, expectedFiles);
          }
        } else {
          // Invalid response after retry
          logger.warn({
            taskId,
            reason: 'invalid_response_after_retry'
          }, 'Context Curator: Invalid response after retry, applying fallback enhancement');
          enhancedResponse = enhanceRelevanceScoringResponse(response, scoringStrategy, fileDiscoveryResult.processingTimeMs, expectedFiles);
        }
      } else {
        // No retry attempted - apply normal fallback logic
        logger.info({
          taskId,
          reason: 'no_retry_needed'
        }, 'Context Curator: No retry needed, applying standard enhancement');
        enhancedResponse = enhanceRelevanceScoringResponse(response, scoringStrategy, fileDiscoveryResult.processingTimeMs, expectedFiles);
      }

      if (!validateRelevanceScoringResponse(enhancedResponse)) {
        logger.error({
          taskId,
          originalResponse: response,
          enhancedResponse,
          responseKeys: enhancedResponse && typeof enhancedResponse === 'object' ? Object.keys(enhancedResponse) : 'not an object',
          retryAttempted
        }, 'Enhanced relevance scoring response validation failed');
        throw new Error('Invalid relevance scoring response format after enhancement');
      }

      const typedResponse = enhancedResponse as RelevanceScoringResult;

      logger.info({
        taskId,
        filesScored: typedResponse.fileScores.length,
        averageRelevance: typedResponse.overallMetrics.averageRelevance,
        highRelevanceCount: typedResponse.overallMetrics.highRelevanceCount
      }, 'Relevance scoring completed successfully');

      return typedResponse;

    } catch (error) {
      logger.error({ taskId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Relevance scoring failed');
      throw new Error(`Relevance scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform meta-prompt generation using LLM
   */
  async performMetaPromptGeneration(
    originalPrompt: string,
    intentAnalysis: IntentAnalysisResult,
    refinedPrompt: string,
    relevanceScoringResult: RelevanceScoringResult,
    config: OpenRouterConfig,
    additionalContext?: {
      codemapContent?: string;
      projectAnalysis?: ProjectTypeAnalysisResult;
      languageAnalysis?: LanguageAnalysisResult;
      architecturalPatterns?: string[];
      patternConfidence?: { [pattern: string]: number };
      patternEvidence?: { [pattern: string]: string[] };
      technicalConstraints?: string[];
      qualityRequirements?: string[];
      teamExpertise?: string[];
      timelineConstraints?: string;
      existingGuidelines?: string[];
    }
  ): Promise<MetaPromptGenerationResult> {
    const taskId = getMetaPromptGenerationTaskId();
    const model = this.configLoader.getLLMModel('meta_prompt_generation');
    
    logger.info({ 
      taskId, 
      model, 
      taskType: intentAnalysis.taskType,
      relevantFiles: relevanceScoringResult.fileScores.length
    }, 'Starting meta-prompt generation');

    try {
      const userPromptContent = buildMetaPromptGenerationPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        relevanceScoringResult,
        additionalContext
      );
      
      const responseText = await this.performResilientLlmCall(
        userPromptContent,
        META_PROMPT_GENERATION_SYSTEM_PROMPT,
        config,
        taskId,
        'json',
        3 // Max retries for meta-prompt generation
      );

      // Context Curator diagnostic logging for meta-prompt generation
      logger.info({
        taskId,
        responseContainsSystemPrompt: responseText.includes('systemPrompt'),
        responseContainsTaskDecomposition: responseText.includes('taskDecomposition'),
        responseContainsEpicsArray: responseText.includes('"epics":['),
        responseIsLikelySingleEpic: responseText.includes('"id":"epic-') && !responseText.includes('systemPrompt'),
        responseLength: responseText.length
      }, 'Context Curator: Meta-prompt generation response analysis');

      // Use intelligent JSON parsing to handle LLM responses that may contain markdown code blocks
      // This aligns with the enhanced JSON normalization pipeline used throughout the system
      let response = intelligentJsonParse(responseText, taskId);

      // Enhanced logging for meta-prompt generation responses
      const responseStructure = response && typeof response === 'object' ? {
        hasSystemPrompt: 'systemPrompt' in response,
        hasUserPrompt: 'userPrompt' in response,
        hasContextSummary: 'contextSummary' in response,
        hasTaskDecomposition: 'taskDecomposition' in response,
        hasGuidelines: 'guidelines' in response,
        hasEstimatedComplexity: 'estimatedComplexity' in response,
        hasQualityScore: 'qualityScore' in response,
        hasAiAgentResponseFormat: 'aiAgentResponseFormat' in response,
        hasEpicsArray: response && typeof response === 'object' && 'taskDecomposition' in response && response.taskDecomposition && typeof response.taskDecomposition === 'object' && 'epics' in response.taskDecomposition ? Array.isArray((response.taskDecomposition as Record<string, unknown>).epics) : false,
        isSingleEpic: 'id' in response && 'title' in response && 'tasks' in response,
        topLevelKeys: Object.keys(response),
        taskDecompositionKeys: response && typeof response === 'object' && 'taskDecomposition' in response && response.taskDecomposition && typeof response.taskDecomposition === 'object' ? Object.keys(response.taskDecomposition) : []
      } : null;

      logger.info({
        taskId,
        parsedResponseType: typeof response,
        parsedResponseKeys: response && typeof response === 'object' ? Object.keys(response) : 'not an object',
        responseStructure,
        responsePreview: typeof response === 'object' ? JSON.stringify(response).substring(0, 500) : String(response).substring(0, 500),
        rawResponseLength: responseText.length,
        rawResponsePreview: responseText.substring(0, 300)
      }, 'Meta-prompt generation response parsed');

      logger.debug({
        taskId,
        responseStructure,
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 500)
      }, 'Meta-prompt response structure analysis');

      // Attempt recovery if validation fails
      if (!validateMetaPromptGenerationResponse(response)) {
        logger.warn({
          taskId,
          originalResponseKeys: response && typeof response === 'object' ? Object.keys(response) : 'not an object'
        }, 'Initial validation failed, attempting response recovery');

        const recoveredResponse = attemptResponseRecovery(response);

        if (validateMetaPromptGenerationResponse(recoveredResponse)) {
          logger.info({
            taskId,
            recoveredResponseKeys: recoveredResponse && typeof recoveredResponse === 'object' ? Object.keys(recoveredResponse) : 'not an object'
          }, 'Response recovery successful');
          response = recoveredResponse;
        } else {
          // Enhanced error logging for validation failure
          logger.error({
            taskId,
            originalResponse: typeof response === 'object' ? JSON.stringify(response, null, 2) : response,
            recoveredResponse: typeof recoveredResponse === 'object' ? JSON.stringify(recoveredResponse, null, 2) : recoveredResponse,
            responseType: typeof response,
            responseKeys: response && typeof response === 'object' ? Object.keys(response) : 'not an object'
          }, 'Meta-prompt generation response validation failed even after recovery attempt');
          throw new Error('Invalid meta-prompt generation response format');
        }
      }

      const finalResponse = response as MetaPromptGenerationResult;
      logger.info({
        taskId,
        qualityScore: finalResponse.qualityScore,
        complexity: finalResponse.estimatedComplexity,
        epicsCount: finalResponse.taskDecomposition.epics.length,
        guidelinesCount: finalResponse.guidelines.length
      }, 'Meta-prompt generation completed successfully');

      return response as MetaPromptGenerationResult;

    } catch (error) {
      logger.error({ taskId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Meta-prompt generation failed');
      throw new Error(`Meta-prompt generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

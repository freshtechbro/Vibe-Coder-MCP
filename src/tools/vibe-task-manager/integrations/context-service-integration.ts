import { ContextEnrichmentService } from '../services/context-enrichment-service.js';
import { FileSearchService, FileReaderService } from '../../../services/file-search-service/index.js';
import type {
  ContextRequest,
  ContextResult
} from '../services/context-enrichment-service.js';
import logger from '../../../logger.js';
import { EventEmitter } from 'events';
import crypto from 'crypto';

/**
 * Enhanced context request with integration-specific features
 */
export interface EnhancedContextRequest extends ContextRequest {
  /** Session ID for tracking */
  sessionId?: string;
  /** Task ID for context association */
  taskId?: string;
  /** Project ID for context scoping */
  projectId?: string;
  /** Context priority level */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Cache strategy */
  cacheStrategy: 'none' | 'session' | 'persistent' | 'adaptive';
  /** Real-time updates enabled */
  enableRealTimeUpdates?: boolean;
  /** Context enrichment depth */
  enrichmentDepth: 'shallow' | 'medium' | 'deep';
  /** Include architectural patterns */
  includeArchitecturalPatterns?: boolean;
  /** Include dependency analysis */
  includeDependencyAnalysis?: boolean;
  /** Include code quality metrics */
  includeCodeQualityMetrics?: boolean;
  /** Custom scoring weights */
  scoringWeights?: {
    recency: number;
    relevance: number;
    complexity: number;
    usage: number;
  };
}

/**
 * Enhanced context result with integration features
 */
export interface EnhancedContextResult extends ContextResult {
  /** Context session information */
  sessionInfo: {
    sessionId: string;
    taskId?: string;
    projectId?: string;
    timestamp: number;
    enrichmentDepth: string;
  };
  /** Architectural insights */
  architecturalInsights?: {
    patterns: string[];
    frameworks: string[];
    designPrinciples: string[];
    codeStructure: {
      complexity: number;
      maintainability: number;
      testability: number;
    };
  };
  /** Dependency analysis */
  dependencyAnalysis?: {
    directDependencies: string[];
    transitiveDependencies: string[];
    circularDependencies: string[];
    unusedDependencies: string[];
    dependencyGraph: Record<string, string[]>;
  };
  /** Code quality metrics */
  codeQualityMetrics?: {
    overallScore: number;
    maintainabilityIndex: number;
    technicalDebt: number;
    testCoverage: number;
    codeSmells: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high';
      file: string;
      description: string;
    }>;
  };
  /** Context recommendations */
  recommendations: {
    suggestedFiles: string[];
    missingContext: string[];
    optimizationTips: string[];
    nextSteps: string[];
  };
  /** Enhanced performance metrics */
  enhancedMetrics: {
    contextQualityScore: number;
    completenessScore: number;
    relevanceDistribution: Record<string, number>;
    processingStages: Record<string, number>;
    memoryUsage: number;
    cacheEfficiency: number;
  };
}

/**
 * Context subscription callback types
 */
export type ContextUpdateCallback = (result: EnhancedContextResult) => void;
export type ContextProgressCallback = (stage: string, progress: number, message?: string) => void;

/**
 * Context service configuration
 */
export interface ContextServiceConfig {
  /** Maximum concurrent context requests */
  maxConcurrentRequests: number;
  /** Default cache TTL in milliseconds */
  defaultCacheTTL: number;
  /** Enable performance monitoring */
  enablePerformanceMonitoring: boolean;
  /** Context quality thresholds */
  qualityThresholds: {
    minimum: number;
    good: number;
    excellent: number;
  };
  /** Real-time update intervals */
  updateIntervals: {
    fast: number;
    normal: number;
    slow: number;
  };
  /** Memory management settings */
  memoryManagement: {
    maxCacheSize: number;
    cleanupInterval: number;
    maxSessionAge: number;
  };
}

/**
 * Advanced Context Service Integration
 * Extends the base context enrichment service with advanced integration features
 */
export class ContextServiceIntegration extends EventEmitter {
  private static instance: ContextServiceIntegration;
  private contextService: ContextEnrichmentService;
  private fileSearchService: FileSearchService;
  private fileReaderService: FileReaderService;
  private config: ContextServiceConfig;
  private activeRequests = new Map<string, Promise<EnhancedContextResult>>();
  private contextCache = new Map<string, EnhancedContextResult>();
  private sessionContexts = new Map<string, EnhancedContextResult[]>();
  private contextSubscriptions = new Map<string, ContextUpdateCallback[]>();
  private progressSubscriptions = new Map<string, ContextProgressCallback[]>();
  private performanceMetrics = new Map<string, unknown>();
  private cleanupInterval?: NodeJS.Timeout;

  private constructor(config?: Partial<ContextServiceConfig>) {
    super();
    this.contextService = ContextEnrichmentService.getInstance();
    this.fileSearchService = FileSearchService.getInstance();
    this.fileReaderService = FileReaderService.getInstance();

    this.config = {
      maxConcurrentRequests: 5,
      defaultCacheTTL: 300000, // 5 minutes
      enablePerformanceMonitoring: true,
      qualityThresholds: {
        minimum: 0.3,
        good: 0.7,
        excellent: 0.9
      },
      updateIntervals: {
        fast: 1000,
        normal: 5000,
        slow: 15000
      },
      memoryManagement: {
        maxCacheSize: 100,
        cleanupInterval: 60000, // 1 minute
        maxSessionAge: 3600000 // 1 hour
      },
      ...config
    };

    this.startCleanupProcess();
    logger.info({ config: this.config }, 'Context Service Integration initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<ContextServiceConfig>): ContextServiceIntegration {
    if (!ContextServiceIntegration.instance) {
      ContextServiceIntegration.instance = new ContextServiceIntegration(config);
    }
    return ContextServiceIntegration.instance;
  }

  /**
   * Gather enhanced context with advanced features
   */
  async gatherEnhancedContext(request: EnhancedContextRequest): Promise<EnhancedContextResult> {
    const startTime = Date.now();
    const requestId = this.generateRequestId(request);

    try {
      // Check if request is already in progress
      if (this.activeRequests.has(requestId)) {
        logger.debug({ requestId }, 'Context request already in progress, returning existing promise');
        return await this.activeRequests.get(requestId)!;
      }

      // Check cache first
      const cachedResult = this.getCachedContext(requestId, request.cacheStrategy);
      if (cachedResult) {
        logger.debug({ requestId, cacheStrategy: request.cacheStrategy }, 'Returning cached context result');
        return cachedResult;
      }

      // Create and track the request promise
      const requestPromise = this.executeContextRequest(request, requestId, startTime);
      this.activeRequests.set(requestId, requestPromise);

      try {
        const result = await requestPromise;

        // Cache the result
        this.cacheContextResult(requestId, result, request.cacheStrategy);

        // Store in session context
        if (request.sessionId) {
          this.addToSessionContext(request.sessionId, result);
        }

        // Emit completion event
        this.emit('context_gathered', result);

        return result;

      } finally {
        this.activeRequests.delete(requestId);
      }

    } catch (error) {
      this.activeRequests.delete(requestId);
      logger.error({ err: error, requestId }, 'Enhanced context gathering failed');
      throw new Error(`Failed to gather enhanced context: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute the context request with progress tracking
   */
  private async executeContextRequest(
    request: EnhancedContextRequest,
    requestId: string,
    startTime: number
  ): Promise<EnhancedContextResult> {
    const progressCallbacks = this.progressSubscriptions.get(requestId) || [];

    // Stage 1: Basic context gathering
    this.notifyProgress(progressCallbacks, 'gathering_basic_context', 10, 'Gathering basic context');

    const basicContextResult = await this.contextService.gatherContext(request);

    this.notifyProgress(progressCallbacks, 'basic_context_complete', 30, 'Basic context gathered');

    // Stage 2: Enhanced analysis based on enrichment depth
    let architecturalInsights: EnhancedContextResult['architecturalInsights'];
    let dependencyAnalysis: EnhancedContextResult['dependencyAnalysis'];
    let codeQualityMetrics: EnhancedContextResult['codeQualityMetrics'];

    if (request.enrichmentDepth !== 'shallow') {
      this.notifyProgress(progressCallbacks, 'analyzing_architecture', 50, 'Analyzing architecture');

      if (request.includeArchitecturalPatterns) {
        architecturalInsights = await this.analyzeArchitecturalPatterns(basicContextResult);
      }

      if (request.includeDependencyAnalysis) {
        this.notifyProgress(progressCallbacks, 'analyzing_dependencies', 65, 'Analyzing dependencies');
        dependencyAnalysis = await this.analyzeDependencies(basicContextResult, request.projectPath);
      }

      if (request.includeCodeQualityMetrics) {
        this.notifyProgress(progressCallbacks, 'analyzing_quality', 80, 'Analyzing code quality');
        codeQualityMetrics = await this.analyzeCodeQuality(basicContextResult);
      }
    }

    // Stage 3: Generate recommendations
    this.notifyProgress(progressCallbacks, 'generating_recommendations', 90, 'Generating recommendations');

    const recommendations = await this.generateRecommendations(basicContextResult, request);

    // Stage 4: Calculate enhanced metrics
    this.notifyProgress(progressCallbacks, 'calculating_metrics', 95, 'Calculating enhanced metrics');

    const enhancedMetrics = this.calculateEnhancedMetrics(basicContextResult, startTime);

    // Stage 5: Finalize result
    this.notifyProgress(progressCallbacks, 'finalizing', 100, 'Finalizing context result');

    const enhancedResult: EnhancedContextResult = {
      ...basicContextResult,
      sessionInfo: {
        sessionId: request.sessionId || this.generateSessionId(),
        taskId: request.taskId,
        projectId: request.projectId,
        timestamp: startTime,
        enrichmentDepth: request.enrichmentDepth
      },
      architecturalInsights,
      dependencyAnalysis,
      codeQualityMetrics,
      recommendations,
      enhancedMetrics
    };

    // Record performance metrics
    if (this.config.enablePerformanceMonitoring) {
      this.recordPerformanceMetrics(requestId, enhancedResult, startTime);
    }

    return enhancedResult;
  }

  /**
   * Get context for multiple tasks with optimization
   */
  async gatherBatchContext(
    requests: EnhancedContextRequest[]
  ): Promise<Map<string, EnhancedContextResult>> {
    const results = new Map<string, EnhancedContextResult>();
    const batches = this.optimizeBatchRequests(requests);

    for (const batch of batches) {
      const batchPromises = batch.map(async (request) => {
        const requestId = this.generateRequestId(request);
        try {
          const result = await this.gatherEnhancedContext(request);
          return { requestId, result };
        } catch (error) {
          logger.error({ err: error, requestId }, 'Batch context request failed');
          throw error;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, index) => {
        const requestId = this.generateRequestId(batch[index]);
        if (result.status === 'fulfilled') {
          results.set(requestId, result.value.result);
        } else {
          logger.error({ requestId, error: result.reason }, 'Batch request failed');
        }
      });
    }

    return results;
  }

  /**
   * Get context summary for a session
   */
  getSessionContextSummary(sessionId: string): {
    totalContexts: number;
    averageQuality: number;
    totalFiles: number;
    totalSize: number;
    topFileTypes: string[];
    recommendations: string[];
  } | null {
    const sessionContexts = this.sessionContexts.get(sessionId);
    if (!sessionContexts || sessionContexts.length === 0) {
      return null;
    }

    const totalContexts = sessionContexts.length;
    const averageQuality = sessionContexts.reduce((sum, ctx) =>
      sum + ctx.enhancedMetrics.contextQualityScore, 0) / totalContexts;

    const totalFiles = sessionContexts.reduce((sum, ctx) =>
      sum + ctx.summary.totalFiles, 0);

    const totalSize = sessionContexts.reduce((sum, ctx) =>
      sum + ctx.summary.totalSize, 0);

    // Aggregate file types
    const fileTypeCounts = new Map<string, number>();
    sessionContexts.forEach(ctx => {
      ctx.summary.topFileTypes.forEach(type => {
        fileTypeCounts.set(type, (fileTypeCounts.get(type) || 0) + 1);
      });
    });

    const topFileTypes = Array.from(fileTypeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type]) => type);

    // Aggregate recommendations
    const allRecommendations = new Set<string>();
    sessionContexts.forEach(ctx => {
      ctx.recommendations.optimizationTips.forEach(tip => allRecommendations.add(tip));
      ctx.recommendations.nextSteps.forEach(step => allRecommendations.add(step));
    });

    return {
      totalContexts,
      averageQuality,
      totalFiles,
      totalSize,
      topFileTypes,
      recommendations: Array.from(allRecommendations).slice(0, 10)
    };
  }

  /**
   * Subscribe to context updates
   */
  subscribeToContextUpdates(requestId: string, callback: ContextUpdateCallback): () => void {
    if (!this.contextSubscriptions.has(requestId)) {
      this.contextSubscriptions.set(requestId, []);
    }
    this.contextSubscriptions.get(requestId)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.contextSubscriptions.get(requestId);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Subscribe to context progress updates
   */
  subscribeToContextProgress(requestId: string, callback: ContextProgressCallback): () => void {
    if (!this.progressSubscriptions.has(requestId)) {
      this.progressSubscriptions.set(requestId, []);
    }
    this.progressSubscriptions.get(requestId)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.progressSubscriptions.get(requestId);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Invalidate context cache
   */
  invalidateContextCache(pattern?: string): number {
    let invalidatedCount = 0;

    if (pattern) {
      // Invalidate specific pattern
      for (const [key] of this.contextCache) {
        if (key.includes(pattern)) {
          this.contextCache.delete(key);
          invalidatedCount++;
        }
      }
    } else {
      // Invalidate all
      invalidatedCount = this.contextCache.size;
      this.contextCache.clear();
    }

    logger.info({ invalidatedCount, pattern }, 'Context cache invalidated');
    this.emit('cache_invalidated', { pattern, count: invalidatedCount });

    return invalidatedCount;
  }

  /**
   * Get context service statistics
   */
  getContextStatistics(): {
    activeRequests: number;
    cacheSize: number;
    sessionCount: number;
    totalContextsGathered: number;
    averageGatheringTime: number;
    cacheHitRate: number;
    memoryUsage: number;
    qualityDistribution: Record<string, number>;
  } {
    const totalContexts = Array.from(this.sessionContexts.values())
      .reduce((sum, contexts) => sum + contexts.length, 0);

    const allMetrics = Array.from(this.performanceMetrics.values());
    const averageGatheringTime = allMetrics.length > 0
      ? allMetrics.reduce((sum, m) => sum + m.totalTime, 0) / allMetrics.length
      : 0;

    const cacheHitRate = allMetrics.length > 0
      ? allMetrics.reduce((sum, m) => sum + (m.cacheHit ? 1 : 0), 0) / allMetrics.length
      : 0;

    // Calculate quality distribution
    const qualityDistribution = { low: 0, medium: 0, high: 0, excellent: 0 };
    Array.from(this.sessionContexts.values()).flat().forEach(ctx => {
      const quality = ctx.enhancedMetrics.contextQualityScore;
      if (quality < this.config.qualityThresholds.minimum) {
        qualityDistribution.low++;
      } else if (quality < this.config.qualityThresholds.good) {
        qualityDistribution.medium++;
      } else if (quality < this.config.qualityThresholds.excellent) {
        qualityDistribution.high++;
      } else {
        qualityDistribution.excellent++;
      }
    });

    return {
      activeRequests: this.activeRequests.size,
      cacheSize: this.contextCache.size,
      sessionCount: this.sessionContexts.size,
      totalContextsGathered: totalContexts,
      averageGatheringTime,
      cacheHitRate,
      memoryUsage: this.estimateMemoryUsage(),
      qualityDistribution
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ContextServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info({ config: this.config }, 'Context service configuration updated');
    this.emit('config_updated', this.config);
  }

  /**
   * Clear session context
   */
  clearSessionContext(sessionId: string): boolean {
    const existed = this.sessionContexts.has(sessionId);
    this.sessionContexts.delete(sessionId);

    if (existed) {
      logger.info({ sessionId }, 'Session context cleared');
      this.emit('session_cleared', sessionId);
    }

    return existed;
  }

  /**
   * Dispose of the service
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    this.activeRequests.clear();
    this.contextCache.clear();
    this.sessionContexts.clear();
    this.contextSubscriptions.clear();
    this.progressSubscriptions.clear();
    this.performanceMetrics.clear();
    this.removeAllListeners();

    logger.info('Context Service Integration disposed');
  }

  // Private helper methods

  /**
   * Generate unique request ID
   */
  private generateRequestId(request: EnhancedContextRequest): string {
    const key = `${request.projectPath}-${request.taskDescription}-${request.enrichmentDepth}-${request.priority}`;
    // Use a hash instead of truncated base64 to avoid collisions
    return crypto.createHash('md5').update(key).digest('hex').slice(0, 16);
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get cached context result
   */
  private getCachedContext(requestId: string, cacheStrategy: string): EnhancedContextResult | null {
    if (cacheStrategy === 'none') {
      return null;
    }

    const cached = this.contextCache.get(requestId);
    if (!cached) {
      return null;
    }

    // Check if cache is still valid
    const age = Date.now() - cached.sessionInfo.timestamp;
    if (age > this.config.defaultCacheTTL) {
      this.contextCache.delete(requestId);
      return null;
    }

    return cached;
  }

  /**
   * Cache context result
   */
  private cacheContextResult(
    requestId: string,
    result: EnhancedContextResult,
    cacheStrategy: string
  ): void {
    if (cacheStrategy === 'none') {
      return;
    }

    // Implement cache size limit
    if (this.contextCache.size >= this.config.memoryManagement.maxCacheSize) {
      // Remove oldest entries
      const entries = Array.from(this.contextCache.entries());
      entries.sort((a, b) => a[1].sessionInfo.timestamp - b[1].sessionInfo.timestamp);

      const toRemove = Math.floor(this.config.memoryManagement.maxCacheSize * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.contextCache.delete(entries[i][0]);
      }
    }

    this.contextCache.set(requestId, result);
  }

  /**
   * Add result to session context
   */
  private addToSessionContext(sessionId: string, result: EnhancedContextResult): void {
    if (!this.sessionContexts.has(sessionId)) {
      this.sessionContexts.set(sessionId, []);
    }
    this.sessionContexts.get(sessionId)!.push(result);
  }

  /**
   * Notify progress callbacks
   */
  private notifyProgress(
    callbacks: ContextProgressCallback[],
    stage: string,
    progress: number,
    message?: string
  ): void {
    callbacks.forEach(callback => {
      try {
        callback(stage, progress, message);
      } catch (error) {
        logger.error({ err: error, stage }, 'Error in progress callback');
      }
    });
  }

  /**
   * Analyze architectural patterns
   */
  private async analyzeArchitecturalPatterns(
    contextResult: ContextResult
  ): Promise<EnhancedContextResult['architecturalInsights']> {
    const patterns: string[] = [];
    const frameworks: string[] = [];
    const designPrinciples: string[] = [];

    // Analyze file patterns and content
    for (const file of contextResult.contextFiles) {
      // Detect common patterns
      if (file.filePath.includes('controller') || file.filePath.includes('Controller')) {
        patterns.push('MVC Pattern');
      }
      if (file.filePath.includes('service') || file.filePath.includes('Service')) {
        patterns.push('Service Layer Pattern');
      }
      if (file.filePath.includes('repository') || file.filePath.includes('Repository')) {
        patterns.push('Repository Pattern');
      }
      if (file.filePath.includes('factory') || file.filePath.includes('Factory')) {
        patterns.push('Factory Pattern');
      }

      // Detect frameworks
      if (file.content.includes('React') || file.content.includes('react')) {
        frameworks.push('React');
      }
      if (file.content.includes('Express') || file.content.includes('express')) {
        frameworks.push('Express.js');
      }
      if (file.content.includes('Vue') || file.content.includes('vue')) {
        frameworks.push('Vue.js');
      }
    }

    // Calculate code structure metrics
    const totalComplexity = contextResult.contextFiles.reduce((sum, file) => {
      // Simple complexity estimation based on file size and content
      const complexity = Math.min(file.charCount / 1000, 10);
      return sum + complexity;
    }, 0);

    const averageComplexity = totalComplexity / Math.max(contextResult.contextFiles.length, 1);

    return {
      patterns: [...new Set(patterns)],
      frameworks: [...new Set(frameworks)],
      designPrinciples,
      codeStructure: {
        complexity: Math.round(averageComplexity * 10) / 10,
        maintainability: Math.max(0, 10 - averageComplexity),
        testability: contextResult.contextFiles.some(f =>
          f.filePath.includes('test') || f.filePath.includes('spec')) ? 8 : 4
      }
    };
  }

  /**
   * Analyze dependencies
   */
  private async analyzeDependencies(
    contextResult: ContextResult,
    _projectPath: string
  ): Promise<EnhancedContextResult['dependencyAnalysis']> {
    const directDependencies: string[] = [];
    const transitiveDependencies: string[] = [];
    const dependencyGraph: Record<string, string[]> = {};

    // Simple dependency analysis based on import statements
    for (const file of contextResult.contextFiles) {
      const imports = this.extractImports(file.content);
      directDependencies.push(...imports);
      dependencyGraph[file.filePath] = imports;
    }

    return {
      directDependencies: [...new Set(directDependencies)],
      transitiveDependencies,
      circularDependencies: [],
      unusedDependencies: [],
      dependencyGraph
    };
  }

  /**
   * Extract imports from file content
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * Analyze code quality
   */
  private async analyzeCodeQuality(
    contextResult: ContextResult
  ): Promise<EnhancedContextResult['codeQualityMetrics']> {
    let totalScore = 0;
    const codeSmells: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high';
      file: string;
      description: string;
    }> = [];

    for (const file of contextResult.contextFiles) {
      let fileScore = 10;

      // Check for code smells
      if (file.charCount > 5000) {
        fileScore -= 2;
        codeSmells.push({
          type: 'Large File',
          severity: 'medium',
          file: file.filePath,
          description: 'File is very large and may be difficult to maintain'
        });
      }

      // Check for long lines
      const lines = file.content.split('\n');
      const longLines = lines.filter(line => line.length > 120);
      if (longLines.length > lines.length * 0.1) {
        fileScore -= 1;
        codeSmells.push({
          type: 'Long Lines',
          severity: 'low',
          file: file.filePath,
          description: 'Many lines exceed recommended length'
        });
      }

      totalScore += fileScore;
    }

    const averageScore = totalScore / Math.max(contextResult.contextFiles.length, 1);

    return {
      overallScore: Math.round(averageScore * 10) / 10,
      maintainabilityIndex: Math.round(averageScore * 10),
      technicalDebt: Math.max(0, 10 - averageScore),
      testCoverage: contextResult.contextFiles.some(f =>
        f.filePath.includes('test') || f.filePath.includes('spec')) ? 75 : 25,
      codeSmells
    };
  }

  /**
   * Generate recommendations
   */
  private async generateRecommendations(
    contextResult: ContextResult,
    request: EnhancedContextRequest
  ): Promise<EnhancedContextResult['recommendations']> {
    const suggestedFiles: string[] = [];
    const missingContext: string[] = [];
    const optimizationTips: string[] = [];
    const nextSteps: string[] = [];

    // Analyze context completeness
    if (contextResult.summary.totalFiles < 5) {
      missingContext.push('Consider including more relevant files for better context');
      optimizationTips.push('Expand search patterns to include more file types');
    }

    if (contextResult.summary.averageRelevance < 0.5) {
      optimizationTips.push('Refine search criteria to improve relevance scores');
    }

    // Suggest next steps based on task description
    if (request.taskDescription.toLowerCase().includes('test')) {
      nextSteps.push('Consider implementing unit tests');
      nextSteps.push('Set up test coverage reporting');
    }

    if (request.taskDescription.toLowerCase().includes('api')) {
      nextSteps.push('Document API endpoints');
      nextSteps.push('Implement API validation');
    }

    return {
      suggestedFiles,
      missingContext,
      optimizationTips,
      nextSteps
    };
  }

  /**
   * Calculate enhanced metrics
   */
  private calculateEnhancedMetrics(
    contextResult: ContextResult,
    startTime: number
  ): EnhancedContextResult['enhancedMetrics'] {
    const totalTime = Date.now() - startTime;

    // Calculate context quality score
    const qualityScore = Math.min(
      (contextResult.summary.averageRelevance * 0.4) +
      (Math.min(contextResult.summary.totalFiles / 10, 1) * 0.3) +
      (Math.min(contextResult.summary.totalSize / 50000, 1) * 0.3),
      1
    );

    // Calculate completeness score
    const completenessScore = Math.min(
      contextResult.summary.totalFiles / 15,
      1
    );

    return {
      contextQualityScore: Math.round(qualityScore * 100) / 100,
      completenessScore: Math.round(completenessScore * 100) / 100,
      relevanceDistribution: this.calculateRelevanceDistribution(contextResult),
      processingStages: {
        gathering: contextResult.metrics.searchTime,
        reading: contextResult.metrics.readTime,
        scoring: contextResult.metrics.scoringTime,
        total: totalTime
      },
      memoryUsage: this.estimateMemoryUsage(),
      cacheEfficiency: contextResult.metrics.cacheHitRate
    };
  }

  /**
   * Calculate relevance distribution
   */
  private calculateRelevanceDistribution(contextResult: ContextResult): Record<string, number> {
    const distribution = { low: 0, medium: 0, high: 0 };

    contextResult.contextFiles.forEach(file => {
      const relevance = file.relevance.overallScore;
      if (relevance < 0.3) {
        distribution.low++;
      } else if (relevance < 0.7) {
        distribution.medium++;
      } else {
        distribution.high++;
      }
    });

    return distribution;
  }

  /**
   * Optimize batch requests
   */
  private optimizeBatchRequests(requests: EnhancedContextRequest[]): EnhancedContextRequest[][] {
    // Group by project path and priority
    const groups = new Map<string, EnhancedContextRequest[]>();

    requests.forEach(request => {
      const key = `${request.projectPath}-${request.priority}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(request);
    });

    // Create batches respecting concurrency limits
    const batches: EnhancedContextRequest[][] = [];
    const maxBatchSize = this.config.maxConcurrentRequests;

    for (const group of groups.values()) {
      for (let i = 0; i < group.length; i += maxBatchSize) {
        batches.push(group.slice(i, i + maxBatchSize));
      }
    }

    return batches;
  }

  /**
   * Record performance metrics
   */
  private recordPerformanceMetrics(
    requestId: string,
    result: EnhancedContextResult,
    startTime: number
  ): void {
    const metrics = {
      requestId,
      totalTime: Date.now() - startTime,
      contextQuality: result.enhancedMetrics.contextQualityScore,
      filesGathered: result.summary.totalFiles,
      totalSize: result.summary.totalSize,
      cacheHit: false, // Will be set by cache logic
      timestamp: startTime
    };

    this.performanceMetrics.set(requestId, metrics);
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0;

    // Estimate cache size
    for (const result of this.contextCache.values()) {
      totalSize += result.summary.totalSize;
    }

    // Estimate session context size
    for (const contexts of this.sessionContexts.values()) {
      totalSize += contexts.reduce((sum, ctx) => sum + ctx.summary.totalSize, 0);
    }

    return totalSize;
  }

  /**
   * Start cleanup process
   */
  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.config.memoryManagement.cleanupInterval);
  }

  /**
   * Perform cleanup of old data
   */
  private performCleanup(): void {
    const now = Date.now();
    const maxAge = this.config.memoryManagement.maxSessionAge;

    // Clean up old sessions
    for (const [sessionId, contexts] of this.sessionContexts.entries()) {
      const oldestContext = contexts[0];
      if (oldestContext && (now - oldestContext.sessionInfo.timestamp) > maxAge) {
        this.sessionContexts.delete(sessionId);
        logger.debug({ sessionId }, 'Cleaned up old session context');
      }
    }

    // Clean up old cache entries
    for (const [requestId, result] of this.contextCache.entries()) {
      if ((now - result.sessionInfo.timestamp) > this.config.defaultCacheTTL) {
        this.contextCache.delete(requestId);
      }
    }

    // Clean up old performance metrics
    for (const [requestId, metrics] of this.performanceMetrics.entries()) {
      if ((now - metrics.timestamp) > maxAge) {
        this.performanceMetrics.delete(requestId);
      }
    }
  }
}

// Export singleton instance
export const contextServiceIntegration = ContextServiceIntegration.getInstance();

// Export convenience function
export function getContextServiceIntegration(config?: Partial<ContextServiceConfig>): ContextServiceIntegration {
  return ContextServiceIntegration.getInstance(config);
}

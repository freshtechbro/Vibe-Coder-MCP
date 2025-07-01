import { performResearchQuery } from '../../../utils/researchHelper.js';
import { performFormatAwareLlmCall } from '../../../utils/llmHelper.js';
import { OpenRouterConfigManager } from '../../../utils/openrouter-config-manager.js';
import type { OpenRouterConfig } from '../../../types/workflow.js';
import logger from '../../../logger.js';
import { EventEmitter } from 'events';
import crypto from 'crypto';

/**
 * Circuit breaker for research operations
 */
class ResearchCircuitBreaker {
  private failures = new Map<string, number>();
  private lastFailure = new Map<string, number>();
  private readonly maxFailures: number;
  private readonly cooldownPeriod: number; // milliseconds

  constructor(maxFailures = 3, cooldownPeriod = 300000) { // 5 minutes cooldown
    this.maxFailures = maxFailures;
    this.cooldownPeriod = cooldownPeriod;
  }

  canAttempt(operation: string): boolean {
    const failures = this.failures.get(operation) || 0;
    const lastFailure = this.lastFailure.get(operation) || 0;
    const now = Date.now();

    // If we haven't exceeded max failures, allow attempt
    if (failures < this.maxFailures) {
      return true;
    }

    // If we've exceeded max failures, check if cooldown period has passed
    return now - lastFailure > this.cooldownPeriod;
  }

  recordFailure(operation: string): void {
    const failures = (this.failures.get(operation) || 0) + 1;
    this.failures.set(operation, failures);
    this.lastFailure.set(operation, Date.now());
  }

  recordSuccess(operation: string): void {
    this.failures.delete(operation);
    this.lastFailure.delete(operation);
  }

  getFailureCount(operation: string): number {
    return this.failures.get(operation) || 0;
  }

  getTimeUntilRetry(operation: string): number {
    const lastFailure = this.lastFailure.get(operation) || 0;
    const timeSinceFailure = Date.now() - lastFailure;
    return Math.max(0, this.cooldownPeriod - timeSinceFailure);
  }
}

/**
 * Task decomposition request interface for research integration
 */
export interface TaskDecompositionRequest {
  taskDescription: string;
  projectPath?: string;
  domain?: string;
  context?: Record<string, unknown>;
}

/**
 * Research enhancement request configuration
 */
export interface ResearchRequest {
  /** Primary research query */
  query: string;
  /** Task context for research focus */
  taskContext?: {
    taskId?: string;
    taskDescription?: string;
    projectPath?: string;
    domain?: string;
    technology?: string[];
  };
  /** Research scope and depth */
  scope: {
    depth: 'shallow' | 'medium' | 'deep';
    focus: 'technical' | 'business' | 'market' | 'comprehensive';
    timeframe: 'current' | 'recent' | 'historical' | 'future';
  };
  /** Research optimization settings */
  optimization: {
    cacheStrategy: 'none' | 'session' | 'persistent' | 'adaptive';
    qualityThreshold: number; // 0-1 scale
    maxQueries: number;
    parallelQueries: boolean;
    enhanceResults: boolean;
  };
  /** Integration preferences */
  integration: {
    includeInDecomposition: boolean;
    generateSubQueries: boolean;
    extractActionItems: boolean;
    createKnowledgeBase: boolean;
  };
}

/**
 * Enhanced research result with integration features
 */
export interface EnhancedResearchResult {
  /** Primary research content */
  content: string;
  /** Research metadata */
  metadata: {
    query: string;
    timestamp: number;
    model: string;
    qualityScore: number;
    relevanceScore: number;
    completenessScore: number;
    sources: string[];
    researchTime: number;
  };
  /** Extracted insights */
  insights: {
    keyFindings: string[];
    actionItems: string[];
    recommendations: string[];
    risks: string[];
    opportunities: string[];
    technicalConsiderations: string[];
  };
  /** Integration data */
  integrationData: {
    suggestedTasks: Array<{
      title: string;
      description: string;
      priority: 'low' | 'medium' | 'high';
      estimatedHours: number;
      dependencies: string[];
    }>;
    knowledgeEntries: Array<{
      topic: string;
      summary: string;
      relevance: number;
      tags: string[];
    }>;
    contextEnrichment: {
      additionalQueries: string[];
      relatedTopics: string[];
      expertiseAreas: string[];
    };
  };
  /** Performance metrics */
  performance: {
    cacheHit: boolean;
    processingStages: Record<string, number>;
    memoryUsage: number;
    apiCalls: number;
    enhancementTime?: number;
  };
}

/**
 * Research subscription callback types
 */
export type ResearchProgressCallback = (stage: string, progress: number, message?: string) => void;
export type ResearchCompleteCallback = (result: EnhancedResearchResult) => void;

/**
 * Performance metrics for research operations
 */
export interface ResearchPerformanceMetrics {
  query: string;
  totalTime: number;
  qualityScore: number;
  cacheHit: boolean;
  timestamp: number;
  memoryUsage?: number;
  apiCalls?: number;
}

/**
 * Research integration configuration
 */
export interface ResearchIntegrationConfig {
  /** Maximum concurrent research requests */
  maxConcurrentRequests: number;
  /** Default cache TTL in milliseconds */
  defaultCacheTTL: number;
  /** Research quality thresholds */
  qualityThresholds: {
    minimum: number;
    good: number;
    excellent: number;
  };
  /** Performance optimization settings */
  performance: {
    enableCaching: boolean;
    enableParallelQueries: boolean;
    maxQueryDepth: number;
    timeoutMs: number;
  };
  /** Integration settings */
  integration: {
    autoEnhanceDecomposition: boolean;
    generateSubQueries: boolean;
    extractActionItems: boolean;
    createKnowledgeBase: boolean;
  };
}

/**
 * Advanced Research Enhancement Integration
 * Integrates research capabilities with task decomposition and context enrichment
 */
export class ResearchIntegration extends EventEmitter {
  private static instance: ResearchIntegration;
  private config: ResearchIntegrationConfig;
  private openRouterConfig?: OpenRouterConfig;
  private activeRequests = new Map<string, Promise<EnhancedResearchResult>>();
  private researchCache = new Map<string, EnhancedResearchResult>();
  private progressSubscriptions = new Map<string, ResearchProgressCallback[]>();
  private completeSubscriptions = new Map<string, ResearchCompleteCallback[]>();
  private performanceMetrics = new Map<string, ResearchPerformanceMetrics>();
  private cleanupInterval?: NodeJS.Timeout;
  private circuitBreaker = new ResearchCircuitBreaker();

  private constructor(config?: Partial<ResearchIntegrationConfig>) {
    super();

    this.config = {
      maxConcurrentRequests: 3,
      defaultCacheTTL: 1800000, // 30 minutes
      qualityThresholds: {
        minimum: 0.4,
        good: 0.7,
        excellent: 0.9
      },
      performance: {
        enableCaching: true,
        enableParallelQueries: true,
        maxQueryDepth: 3,
        timeoutMs: 120000 // 2 minutes
      },
      integration: {
        autoEnhanceDecomposition: true,
        generateSubQueries: true,
        extractActionItems: true,
        createKnowledgeBase: true
      },
      ...config
    };

    this.initializeConfig();
    this.startCleanupProcess();

    logger.info({ config: this.config }, 'Research Integration initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<ResearchIntegrationConfig>): ResearchIntegration {
    if (!ResearchIntegration.instance) {
      ResearchIntegration.instance = new ResearchIntegration(config);
    }
    return ResearchIntegration.instance;
  }

  /**
   * Perform enhanced research with advanced integration features
   */
  async performEnhancedResearch(request: ResearchRequest): Promise<EnhancedResearchResult> {
    const startTime = Date.now();
    const requestId = this.generateRequestId(request);

    try {
      // Check if request is already in progress
      if (this.activeRequests.has(requestId)) {
        logger.debug({ requestId }, 'Research request already in progress');
        return await this.activeRequests.get(requestId)!;
      }

      // Check cache first
      if (this.config.performance.enableCaching) {
        const cachedResult = this.getCachedResearch(requestId, request.optimization.cacheStrategy);
        if (cachedResult) {
          logger.debug({ requestId, cacheStrategy: request.optimization.cacheStrategy }, 'Returning cached research result');
          // Mark as cache hit
          const cachedResultWithHit = {
            ...cachedResult,
            performance: {
              ...cachedResult.performance,
              cacheHit: true
            }
          };
          return cachedResultWithHit;
        }
      }

      // Create and track the request promise
      const requestPromise = this.executeResearchRequest(request, requestId, startTime);
      this.activeRequests.set(requestId, requestPromise);

      try {
        const result = await requestPromise;

        // Cache the result
        if (this.config.performance.enableCaching) {
          this.cacheResearchResult(requestId, result, request.optimization.cacheStrategy);
        }

        // Emit completion event
        this.emit('research_completed', result);
        this.notifyCompleteSubscribers(requestId, result);

        return result;

      } finally {
        this.activeRequests.delete(requestId);
      }

    } catch (error) {
      this.activeRequests.delete(requestId);
      logger.error({ err: error, requestId }, 'Enhanced research failed');
      throw new Error(`Failed to perform enhanced research: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Enhance task decomposition with research insights
   */
  async enhanceDecompositionWithResearch(
    decompositionRequest: TaskDecompositionRequest,
    researchScope?: Partial<ResearchRequest['scope']>
  ): Promise<{
    enhancedRequest: TaskDecompositionRequest;
    researchResults: EnhancedResearchResult[];
    integrationMetrics: {
      researchTime: number;
      queriesExecuted: number;
      insightsGenerated: number;
      tasksEnhanced: number;
    };
  }> {
    const startTime = Date.now();

    try {
      // Generate research queries based on decomposition request
      const researchQueries = this.generateResearchQueries(decompositionRequest);

      // Execute research queries
      const researchResults: EnhancedResearchResult[] = [];

      if (this.config.performance.enableParallelQueries && researchQueries.length > 1) {
        // Execute queries in parallel with circuit breaker protection
        const researchPromises = researchQueries.map((query, index) => {
          const operationKey = `research_query_${index}`;
          
          // Check circuit breaker before attempting
          if (!this.circuitBreaker.canAttempt(operationKey)) {
            const timeUntilRetry = this.circuitBreaker.getTimeUntilRetry(operationKey);
            logger.warn({ 
              query, 
              operationKey,
              timeUntilRetry,
              failureCount: this.circuitBreaker.getFailureCount(operationKey)
            }, 'Research query blocked by circuit breaker');
            return Promise.reject(new Error(`Circuit breaker open for ${operationKey}. Retry in ${Math.ceil(timeUntilRetry / 1000)}s`));
          }

          return this.performEnhancedResearch({
            query,
            taskContext: {
              taskDescription: decompositionRequest.taskDescription,
              projectPath: decompositionRequest.projectPath,
              domain: decompositionRequest.domain
            },
            scope: {
              depth: 'medium',
              focus: 'technical',
              timeframe: 'current',
              ...researchScope
            },
            optimization: {
              cacheStrategy: 'session',
              qualityThreshold: this.config.qualityThresholds.good,
              maxQueries: 2,
              parallelQueries: false, // Avoid nested parallelism
              enhanceResults: true
            },
            integration: {
              includeInDecomposition: true,
              generateSubQueries: false,
              extractActionItems: true,
              createKnowledgeBase: true
            }
          });
        });

        const results = await Promise.allSettled(researchPromises);
        results.forEach((result, index) => {
          const operationKey = `research_query_${index}`;
          
          if (result.status === 'fulfilled') {
            researchResults.push(result.value);
            this.circuitBreaker.recordSuccess(operationKey);
          } else {
            // Record failure in circuit breaker
            this.circuitBreaker.recordFailure(operationKey);
            
            // Enhanced error capture with proper error serialization
            const errorDetails = this.extractErrorDetails(result.reason);
            logger.warn({ 
              query: researchQueries[index], 
              error: errorDetails,
              queryIndex: index,
              operation: 'parallel_research_query',
              circuitBreakerFailures: this.circuitBreaker.getFailureCount(operationKey)
            }, 'Research query failed');
          }
        });
      } else {
        // Execute queries sequentially with circuit breaker protection
        for (let i = 0; i < researchQueries.length; i++) {
          const query = researchQueries[i];
          const operationKey = `research_query_sequential_${i}`;
          
          try {
            // Check circuit breaker before attempting
            if (!this.circuitBreaker.canAttempt(operationKey)) {
              const timeUntilRetry = this.circuitBreaker.getTimeUntilRetry(operationKey);
              logger.warn({ 
                query, 
                operationKey,
                timeUntilRetry,
                failureCount: this.circuitBreaker.getFailureCount(operationKey)
              }, 'Research query blocked by circuit breaker');
              continue; // Skip this query
            }
            const result = await this.performEnhancedResearch({
              query,
              taskContext: {
                taskDescription: decompositionRequest.taskDescription,
                projectPath: decompositionRequest.projectPath,
                domain: decompositionRequest.domain
              },
              scope: {
                depth: 'medium',
                focus: 'technical',
                timeframe: 'current',
                ...researchScope
              },
              optimization: {
                cacheStrategy: 'session',
                qualityThreshold: this.config.qualityThresholds.good,
                maxQueries: 2,
                parallelQueries: false,
                enhanceResults: true
              },
              integration: {
                includeInDecomposition: true,
                generateSubQueries: false,
                extractActionItems: true,
                createKnowledgeBase: true
              }
            });
            researchResults.push(result);
            this.circuitBreaker.recordSuccess(operationKey);
          } catch (error) {
            // Record failure in circuit breaker
            this.circuitBreaker.recordFailure(operationKey);
            
            // Enhanced error capture with proper error serialization
            const errorDetails = this.extractErrorDetails(error);
            logger.warn({ 
              query, 
              error: errorDetails,
              operation: 'sequential_research_query',
              circuitBreakerFailures: this.circuitBreaker.getFailureCount(operationKey)
            }, 'Research query failed');
          }
        }
      }

      // Integrate research insights into decomposition request with graceful degradation
      const enhancedRequest = researchResults.length > 0 
        ? this.integrateResearchIntoDecomposition(decompositionRequest, researchResults)
        : this.createDegradedDecompositionRequest(decompositionRequest, 'All research queries failed');

      const integrationMetrics = {
        researchTime: Date.now() - startTime,
        queriesExecuted: researchResults.length,
        insightsGenerated: researchResults.reduce((sum, r) => sum + r.insights.keyFindings.length, 0),
        tasksEnhanced: researchResults.reduce((sum, r) => sum + r.integrationData.suggestedTasks.length, 0)
      };

      logger.info({
        originalTaskDescription: decompositionRequest.taskDescription,
        researchQueries: researchQueries.length,
        researchResults: researchResults.length,
        integrationMetrics
      }, 'Task decomposition enhanced with research');

      return {
        enhancedRequest,
        researchResults,
        integrationMetrics
      };

    } catch (error) {
      logger.error({ err: error, decompositionRequest }, 'Failed to enhance decomposition with research');
      throw new Error(`Failed to enhance decomposition with research: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate intelligent research queries for task decomposition
   */
  async generateIntelligentResearchQueries(
    taskDescription: string,
    context?: {
      projectPath?: string;
      domain?: string;
      technology?: string[];
      existingKnowledge?: string[];
    }
  ): Promise<string[]> {
    try {
      if (!this.openRouterConfig) {
        throw new Error('OpenRouter configuration not initialized');
      }

      const queryGenerationPrompt = `
Generate 2-4 focused research queries to help with the following software development task:

Task: ${taskDescription}
${context?.projectPath ? `Project Path: ${context.projectPath}` : ''}
${context?.domain ? `Domain: ${context.domain}` : ''}
${context?.technology ? `Technologies: ${context.technology.join(', ')}` : ''}
${context?.existingKnowledge ? `Existing Knowledge: ${context.existingKnowledge.join(', ')}` : ''}

Generate research queries that will help understand:
1. Best practices and implementation approaches
2. Common challenges and solutions
3. Technical requirements and considerations
4. Industry standards and patterns

Return only the queries, one per line, without numbering or formatting.
`;

      const systemPrompt = `You are an expert software development researcher. Generate focused, actionable research queries that will provide practical insights for software development tasks. Focus on technical implementation, best practices, and real-world considerations.`;

      const response = await performFormatAwareLlmCall(
        queryGenerationPrompt,
        systemPrompt,
        this.openRouterConfig,
        'research_query_generation',
        'text', // Explicitly specify text format for query generation
        undefined, // No schema for text
        0.3
      );

      const queries = response
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 10 && !line.match(/^\d+\./))
        .slice(0, 4);

      logger.debug({ taskDescription, generatedQueries: queries.length }, 'Generated intelligent research queries');

      return queries;

    } catch (error) {
      logger.error({ err: error, taskDescription }, 'Failed to generate intelligent research queries');
      // Fallback to basic queries
      return [
        `Best practices for: ${taskDescription}`,
        `Common challenges and solutions for: ${taskDescription}`,
        `Technical implementation approaches for: ${taskDescription}`
      ];
    }
  }

  /**
   * Assess research result quality
   */
  assessResearchQuality(content: string, query: string): {
    qualityScore: number;
    relevanceScore: number;
    completenessScore: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let qualityScore = 1.0;
    let relevanceScore = 1.0;
    let completenessScore = 1.0;

    // Content length assessment
    if (content.length < 300) {
      qualityScore -= 0.3;
      completenessScore -= 0.4;
      issues.push('Content is too short for comprehensive research');
    } else if (content.length < 600) {
      qualityScore -= 0.1;
      completenessScore -= 0.2;
      issues.push('Content could be more comprehensive');
    }

    // Relevance assessment based on query keywords
    const queryKeywords = query.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const contentLower = content.toLowerCase();
    const keywordMatches = queryKeywords.filter(keyword => contentLower.includes(keyword));

    const keywordRelevance = keywordMatches.length / Math.max(queryKeywords.length, 1);
    if (keywordRelevance < 0.3) {
      relevanceScore -= 0.5;
      issues.push('Content has low relevance to the query');
    } else if (keywordRelevance < 0.6) {
      relevanceScore -= 0.2;
      issues.push('Content relevance could be improved');
    }

    // Structure and formatting assessment
    const hasHeaders = /#{1,6}\s/.test(content);
    const hasBulletPoints = /^\s*[-*+]\s/m.test(content);
    const hasNumberedLists = /^\s*\d+\.\s/m.test(content);

    if (!hasHeaders && !hasBulletPoints && !hasNumberedLists) {
      qualityScore -= 0.1; // Reduced penalty for structure
      issues.push('Content could benefit from better structure');
    }

    // Technical depth assessment
    const technicalIndicators = [
      'implementation', 'architecture', 'design pattern', 'best practice',
      'performance', 'security', 'scalability', 'testing', 'deployment',
      'technical', 'configure', 'setup', 'authentication', 'api'
    ];
    const technicalMatches = technicalIndicators.filter(indicator =>
      contentLower.includes(indicator)
    );

    if (technicalMatches.length < 2) {
      completenessScore -= 0.2; // Reduced penalty
      issues.push('Content could include more technical depth');
    }

    // Ensure scores are within bounds
    qualityScore = Math.max(0, Math.min(1, qualityScore));
    relevanceScore = Math.max(0, Math.min(1, relevanceScore));
    completenessScore = Math.max(0, Math.min(1, completenessScore));

    return {
      qualityScore,
      relevanceScore,
      completenessScore,
      issues
    };
  }

  /**
   * Subscribe to research progress updates
   */
  subscribeToResearchProgress(requestId: string, callback: ResearchProgressCallback): () => void {
    if (!this.progressSubscriptions.has(requestId)) {
      this.progressSubscriptions.set(requestId, []);
    }
    this.progressSubscriptions.get(requestId)!.push(callback);

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
   * Subscribe to research completion
   */
  subscribeToResearchComplete(requestId: string, callback: ResearchCompleteCallback): () => void {
    if (!this.completeSubscriptions.has(requestId)) {
      this.completeSubscriptions.set(requestId, []);
    }
    this.completeSubscriptions.get(requestId)!.push(callback);

    return () => {
      const callbacks = this.completeSubscriptions.get(requestId);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Get research statistics
   */
  getResearchStatistics(): {
    activeRequests: number;
    cacheSize: number;
    totalResearchPerformed: number;
    averageResearchTime: number;
    cacheHitRate: number;
    qualityDistribution: Record<string, number>;
    topQueries: Array<{ query: string; count: number; avgQuality: number }>;
  } {
    const allMetrics = Array.from(this.performanceMetrics.values());
    const totalResearch = allMetrics.length;

    const averageResearchTime = totalResearch > 0
      ? allMetrics.reduce((sum, m) => sum + m.totalTime, 0) / totalResearch
      : 0;

    const cacheHitRate = totalResearch > 0
      ? allMetrics.reduce((sum, m) => sum + (m.cacheHit ? 1 : 0), 0) / totalResearch
      : 0;

    // Calculate quality distribution
    const qualityDistribution = { low: 0, medium: 0, high: 0, excellent: 0 };
    const queryStats = new Map<string, { count: number; totalQuality: number }>();

    allMetrics.forEach(metric => {
      const quality = metric.qualityScore || 0;
      if (quality < this.config.qualityThresholds.minimum) {
        qualityDistribution.low++;
      } else if (quality < this.config.qualityThresholds.good) {
        qualityDistribution.medium++;
      } else if (quality < this.config.qualityThresholds.excellent) {
        qualityDistribution.high++;
      } else {
        qualityDistribution.excellent++;
      }

      // Track query statistics
      const query = metric.query || 'unknown';
      if (!queryStats.has(query)) {
        queryStats.set(query, { count: 0, totalQuality: 0 });
      }
      const stats = queryStats.get(query)!;
      stats.count++;
      stats.totalQuality += quality;
    });

    // Get top queries
    const topQueries = Array.from(queryStats.entries())
      .map(([query, stats]) => ({
        query,
        count: stats.count,
        avgQuality: stats.totalQuality / stats.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      activeRequests: this.activeRequests.size,
      cacheSize: this.researchCache.size,
      totalResearchPerformed: totalResearch,
      averageResearchTime,
      cacheHitRate,
      qualityDistribution,
      topQueries
    };
  }

  /**
   * Clear research cache
   */
  clearResearchCache(pattern?: string): number {
    let clearedCount = 0;

    if (pattern) {
      for (const [key] of this.researchCache) {
        if (key.includes(pattern)) {
          this.researchCache.delete(key);
          clearedCount++;
        }
      }
    } else {
      clearedCount = this.researchCache.size;
      this.researchCache.clear();
    }

    logger.info({ clearedCount, pattern }, 'Research cache cleared');
    this.emit('cache_cleared', { pattern, count: clearedCount });

    return clearedCount;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ResearchIntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info({ config: this.config }, 'Research integration configuration updated');
    this.emit('config_updated', this.config);
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
    this.researchCache.clear();
    this.progressSubscriptions.clear();
    this.completeSubscriptions.clear();
    this.performanceMetrics.clear();
    this.removeAllListeners();

    logger.info('Research Integration disposed');
  }

  // Private helper methods

  /**
   * Initialize OpenRouter configuration using centralized manager
   */
  private async initializeConfig(): Promise<void> {
    try {
      const configManager = OpenRouterConfigManager.getInstance();
      this.openRouterConfig = await configManager.getOpenRouterConfig();

      logger.debug({
        hasApiKey: Boolean(this.openRouterConfig.apiKey),
        baseUrl: this.openRouterConfig.baseUrl,
        mappingCount: Object.keys(this.openRouterConfig.llm_mapping || {}).length
      }, 'Research integration initialized with centralized OpenRouter config');

    } catch (error) {
      logger.warn({ err: error }, 'Failed to initialize OpenRouter config with centralized manager, using fallback');

      // Fallback to basic configuration if centralized manager fails
      this.openRouterConfig = {
        baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY || '',
        geminiModel: process.env.GEMINI_MODEL || process.env.VIBE_DEFAULT_LLM_MODEL || 'google/gemini-2.5-flash-preview-05-20',
        perplexityModel: process.env.PERPLEXITY_MODEL || 'perplexity/llama-3.1-sonar-small-128k-online',
        llm_mapping: {}
      };
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(request: ResearchRequest): string {
    const key = `${request.query}-${request.scope.depth}-${request.scope.focus}-${request.optimization.qualityThreshold}`;
    return crypto.createHash('md5').update(key).digest('hex').slice(0, 16);
  }

  /**
   * Get cached research result
   */
  private getCachedResearch(requestId: string, cacheStrategy: string): EnhancedResearchResult | null {
    if (cacheStrategy === 'none') {
      return null;
    }

    const cached = this.researchCache.get(requestId);
    if (!cached) {
      return null;
    }

    // Check if cache is still valid
    const age = Date.now() - cached.metadata.timestamp;
    if (age > this.config.defaultCacheTTL) {
      this.researchCache.delete(requestId);
      return null;
    }

    return cached;
  }

  /**
   * Cache research result
   */
  private cacheResearchResult(
    requestId: string,
    result: EnhancedResearchResult,
    cacheStrategy: string
  ): void {
    if (cacheStrategy === 'none') {
      return;
    }

    // Implement cache size limit (max 50 entries)
    if (this.researchCache.size >= 50) {
      const entries = Array.from(this.researchCache.entries());
      entries.sort((a, b) => a[1].metadata.timestamp - b[1].metadata.timestamp);

      const toRemove = Math.floor(50 * 0.2); // Remove 20% of oldest entries
      for (let i = 0; i < toRemove; i++) {
        this.researchCache.delete(entries[i][0]);
      }
    }

    this.researchCache.set(requestId, result);
  }

  /**
   * Execute the research request with progress tracking
   */
  private async executeResearchRequest(
    request: ResearchRequest,
    requestId: string,
    startTime: number
  ): Promise<EnhancedResearchResult> {
    const progressCallbacks = this.progressSubscriptions.get(requestId) || [];

    try {
      if (!this.openRouterConfig) {
        throw new Error('OpenRouter configuration not initialized');
      }

      // Stage 1: Perform primary research
      this.notifyProgress(progressCallbacks, 'performing_research', 20, 'Performing primary research');

      const researchContent = await performResearchQuery(request.query, this.openRouterConfig);

      this.notifyProgress(progressCallbacks, 'research_complete', 40, 'Primary research complete');

      // Stage 2: Enhance results if requested
      let enhancedContent = researchContent;
      let enhancementTime = 0;

      if (request.optimization.enhanceResults) {
        this.notifyProgress(progressCallbacks, 'enhancing_results', 60, 'Enhancing research results');

        const enhanceStartTime = Date.now();
        const enhancementPrompt = this.buildEnhancementPrompt(request, researchContent);

        enhancedContent = await performFormatAwareLlmCall(
          enhancementPrompt,
          this.getResearchSystemPrompt(request),
          this.openRouterConfig,
          'research_enhancement',
          'markdown', // Explicitly specify markdown format
          undefined, // No schema for markdown
          0.3
        );

        enhancementTime = Date.now() - enhanceStartTime;
        this.notifyProgress(progressCallbacks, 'enhancement_complete', 80, 'Enhancement complete');
      }

      // Stage 3: Assess quality and extract insights
      this.notifyProgress(progressCallbacks, 'analyzing_results', 90, 'Analyzing results and extracting insights');

      const qualityAssessment = this.assessResearchQuality(enhancedContent, request.query);
      const insights = await this.extractInsights(enhancedContent, request);
      const integrationData = await this.generateIntegrationData(enhancedContent, request);

      // Stage 4: Finalize result
      this.notifyProgress(progressCallbacks, 'finalizing', 100, 'Finalizing research result');

      const result: EnhancedResearchResult = {
        content: enhancedContent,
        metadata: {
          query: request.query,
          timestamp: startTime,
          model: this.openRouterConfig.perplexityModel || 'perplexity/sonar-deep-research',
          qualityScore: qualityAssessment.qualityScore,
          relevanceScore: qualityAssessment.relevanceScore,
          completenessScore: qualityAssessment.completenessScore,
          sources: this.extractSources(enhancedContent),
          researchTime: Date.now() - startTime
        },
        insights,
        integrationData,
        performance: {
          cacheHit: false,
          processingStages: {
            research: Date.now() - startTime - enhancementTime,
            enhancement: enhancementTime,
            analysis: 0, // Minimal time for analysis
            total: Date.now() - startTime
          },
          memoryUsage: this.estimateMemoryUsage(enhancedContent),
          apiCalls: request.optimization.enhanceResults ? 2 : 1,
          enhancementTime
        }
      };

      // Record performance metrics
      this.recordPerformanceMetrics(requestId, result);

      return result;

    } catch (error) {
      logger.error({ err: error, requestId, query: request.query }, 'Research request execution failed');
      throw error;
    }
  }

  /**
   * Generate research queries for task decomposition
   */
  private generateResearchQueries(decompositionRequest: TaskDecompositionRequest): string[] {
    const queries: string[] = [];

    // Base query from task description
    queries.push(`Best practices and implementation approaches for: ${decompositionRequest.taskDescription}`);

    // Domain-specific query
    if (decompositionRequest.domain) {
      queries.push(`${decompositionRequest.domain} specific considerations for: ${decompositionRequest.taskDescription}`);
    } else {
      queries.push(`Technical considerations and requirements for: ${decompositionRequest.taskDescription}`);
    }

    // Technology-specific query
    if (decompositionRequest.projectPath) {
      const pathParts = decompositionRequest.projectPath.split('/');
      const projectName = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
      queries.push(`Common challenges and solutions for ${projectName} projects: ${decompositionRequest.taskDescription}`);
    } else {
      queries.push(`Common challenges and solutions for: ${decompositionRequest.taskDescription}`);
    }

    // Architecture and design query
    queries.push(`Architecture patterns and design considerations for: ${decompositionRequest.taskDescription}`);

    // Ensure we always return exactly 4 queries
    return queries.slice(0, 4);
  }

  /**
   * Integrate research results into decomposition request
   */
  private integrateResearchIntoDecomposition(
    originalRequest: TaskDecompositionRequest,
    researchResults: EnhancedResearchResult[]
  ): TaskDecompositionRequest {
    // Aggregate insights from all research results
    const allInsights = researchResults.reduce((acc, result) => {
      acc.keyFindings.push(...result.insights.keyFindings);
      acc.actionItems.push(...result.insights.actionItems);
      acc.recommendations.push(...result.insights.recommendations);
      acc.technicalConsiderations.push(...result.insights.technicalConsiderations);
      return acc;
    }, {
      keyFindings: [] as string[],
      actionItems: [] as string[],
      recommendations: [] as string[],
      technicalConsiderations: [] as string[]
    });

    // Enhance the task description with research insights
    const enhancedDescription = this.enhanceTaskDescription(
      originalRequest.taskDescription,
      allInsights
    );

    // Add research context to the request
    const researchContext = researchResults.map(result => ({
      query: result.metadata.query,
      keyFindings: result.insights.keyFindings.slice(0, 3), // Top 3 findings
      recommendations: result.insights.recommendations.slice(0, 2) // Top 2 recommendations
    }));

    return {
      ...originalRequest,
      taskDescription: enhancedDescription,
      context: {
        ...originalRequest.context,
        researchInsights: allInsights,
        researchContext
      }
    };
  }

  /**
   * Enhance task description with research insights
   */
  private enhanceTaskDescription(
    originalDescription: string,
    insights: {
      keyFindings: string[];
      recommendations: string[];
      technicalConsiderations: string[];
    }
  ): string {
    let enhanced = originalDescription;

    // Add key technical considerations if available
    if (insights.technicalConsiderations.length > 0) {
      const considerations = insights.technicalConsiderations
        .slice(0, 3)
        .filter(c => c && c.trim().length > 0)
        .map(c => c.replace(/^[-*+]\s*/, '').trim())
        .filter(c => c.length > 0);

      if (considerations.length > 0) {
        enhanced += `\n\nKey Technical Considerations:\n${considerations.map(c => `- ${c}`).join('\n')}`;
      }
    }

    // Add top recommendations if available
    if (insights.recommendations.length > 0) {
      const recommendations = insights.recommendations
        .slice(0, 2)
        .filter(r => r && r.trim().length > 0)
        .map(r => r.replace(/^[-*+]\s*/, '').trim())
        .filter(r => r.length > 0);

      if (recommendations.length > 0) {
        enhanced += `\n\nRecommended Approaches:\n${recommendations.map(r => `- ${r}`).join('\n')}`;
      }
    }

    return enhanced;
  }

  /**
   * Build enhancement prompt for research results
   */
  private buildEnhancementPrompt(request: ResearchRequest, content: string): string {
    return `
Enhance and structure the following research findings for a software development task:

Original Query: ${request.query}
Task Context: ${request.taskContext?.taskDescription || 'Not specified'}
Focus Area: ${request.scope.focus}
Depth Required: ${request.scope.depth}

Research Findings:
${content}

Please enhance this research by:
1. Structuring the information clearly with headers and bullet points
2. Extracting key technical insights and best practices
3. Identifying potential challenges and solutions
4. Providing actionable recommendations
5. Highlighting important considerations for implementation

Format the response as a comprehensive, well-structured research report.
`;
  }

  /**
   * Get research system prompt based on request
   */
  private getResearchSystemPrompt(request: ResearchRequest): string {
    const focusInstructions = {
      technical: 'Focus on technical implementation details, code examples, and engineering best practices.',
      business: 'Focus on business value, market considerations, and strategic implications.',
      market: 'Focus on market trends, competitive analysis, and industry standards.',
      comprehensive: 'Provide a balanced view covering technical, business, and market aspects.'
    };

    return `
You are an expert research analyst specializing in software development. Your task is to enhance and structure research findings to provide maximum value for development teams.

${focusInstructions[request.scope.focus]}

Ensure your analysis is:
- Accurate and up-to-date
- Actionable and practical
- Well-structured and easy to understand
- Focused on the specific context provided
- Comprehensive within the requested scope

Always provide clear recommendations and highlight potential risks or challenges.
`;
  }

  /**
   * Extract insights from research content
   */
  private async extractInsights(content: string, _request: ResearchRequest): Promise<EnhancedResearchResult['insights']> {
    // Simple extraction based on content analysis
    const lines = content.split('\n').filter(line => line.trim().length > 0);

    const insights = {
      keyFindings: [] as string[],
      actionItems: [] as string[],
      recommendations: [] as string[],
      risks: [] as string[],
      opportunities: [] as string[],
      technicalConsiderations: [] as string[]
    };

    // Extract different types of insights based on keywords and patterns
    lines.forEach(line => {
      const lowerLine = line.toLowerCase();

      if (lowerLine.includes('best practice') || lowerLine.includes('recommended') || lowerLine.includes('should')) {
        insights.recommendations.push(line.trim());
      } else if (lowerLine.includes('risk') || lowerLine.includes('challenge') || lowerLine.includes('problem')) {
        insights.risks.push(line.trim());
      } else if (lowerLine.includes('opportunity') || lowerLine.includes('benefit') || lowerLine.includes('advantage')) {
        insights.opportunities.push(line.trim());
      } else if (lowerLine.includes('implement') || lowerLine.includes('configure') || lowerLine.includes('setup')) {
        insights.actionItems.push(line.trim());
      } else if (lowerLine.includes('technical') || lowerLine.includes('architecture') || lowerLine.includes('design') ||
                 lowerLine.includes('configure') || lowerLine.includes('cors') || lowerLine.includes('https') ||
                 lowerLine.includes('security') || lowerLine.includes('performance')) {
        insights.technicalConsiderations.push(line.trim());
      } else if (line.startsWith('- ') || line.startsWith('* ') || /^\d+\./.test(line)) {
        insights.keyFindings.push(line.trim());
      }
    });

    // Limit each category to top items
    Object.keys(insights).forEach(key => {
      insights[key as keyof typeof insights] = insights[key as keyof typeof insights].slice(0, 5);
    });

    return insights;
  }

  /**
   * Generate integration data for research results
   */
  private async generateIntegrationData(
    content: string,
    request: ResearchRequest
  ): Promise<EnhancedResearchResult['integrationData']> {
    const integrationData = {
      suggestedTasks: [] as Array<{
        title: string;
        description: string;
        priority: 'low' | 'medium' | 'high';
        estimatedHours: number;
        dependencies: string[];
      }>,
      knowledgeEntries: [] as Array<{
        topic: string;
        summary: string;
        relevance: number;
        tags: string[];
      }>,
      contextEnrichment: {
        additionalQueries: [] as string[],
        relatedTopics: [] as string[],
        expertiseAreas: [] as string[]
      }
    };

    // Extract potential tasks from action items and recommendations
    const actionWords = ['implement', 'setup', 'configure', 'create', 'build', 'develop', 'test', 'deploy'];
    const lines = content.split('\n');

    lines.forEach(line => {
      const lowerLine = line.toLowerCase();
      actionWords.forEach(action => {
        if (lowerLine.includes(action) && line.length > 20 && line.length < 200) {
          integrationData.suggestedTasks.push({
            title: line.trim().replace(/^[-*+]\s*/, ''),
            description: `Task derived from research: ${line.trim()}`,
            priority: lowerLine.includes('critical') || lowerLine.includes('important') ? 'high' : 'medium',
            estimatedHours: this.estimateTaskHours(line),
            dependencies: []
          });
        }
      });
    });

    // Generate knowledge entries from key topics
    const topics = this.extractTopics(content);
    topics.forEach(topic => {
      integrationData.knowledgeEntries.push({
        topic,
        summary: `Research findings related to ${topic}`,
        relevance: this.calculateTopicRelevance(topic, request.query),
        tags: this.generateTopicTags(topic)
      });
    });

    // Generate additional research queries
    integrationData.contextEnrichment.additionalQueries = [
      `Advanced ${request.scope.focus} considerations for: ${request.query}`,
      `Performance optimization for: ${request.query}`,
      `Security best practices for: ${request.query}`
    ];

    // Extract related topics
    integrationData.contextEnrichment.relatedTopics = this.extractRelatedTopics(content);
    integrationData.contextEnrichment.expertiseAreas = this.extractExpertiseAreas(content);

    return integrationData;
  }

  /**
   * Extract sources from research content
   */
  private extractSources(content: string): string[] {
    const sources: string[] = [];
    const urlRegex = /https?:\/\/[^\s]+/g;
    const matches = content.match(urlRegex);

    if (matches) {
      sources.push(...matches.slice(0, 10)); // Limit to 10 sources
    }

    return sources;
  }

  /**
   * Estimate memory usage for content
   */
  private estimateMemoryUsage(content: string): number {
    // Rough estimation: 2 bytes per character + overhead
    return content.length * 2 + 1024;
  }

  /**
   * Record performance metrics
   */
  private recordPerformanceMetrics(requestId: string, result: EnhancedResearchResult): void {
    const metrics = {
      requestId,
      query: result.metadata.query,
      totalTime: result.metadata.researchTime,
      qualityScore: result.metadata.qualityScore,
      relevanceScore: result.metadata.relevanceScore,
      completenessScore: result.metadata.completenessScore,
      cacheHit: result.performance.cacheHit,
      apiCalls: result.performance.apiCalls,
      timestamp: result.metadata.timestamp
    };

    this.performanceMetrics.set(requestId, metrics);
  }

  /**
   * Notify progress subscribers
   */
  private notifyProgress(
    callbacks: ResearchProgressCallback[],
    stage: string,
    progress: number,
    message?: string
  ): void {
    callbacks.forEach(callback => {
      try {
        callback(stage, progress, message);
      } catch (error) {
        logger.error({ err: error, stage }, 'Error in research progress callback');
      }
    });
  }

  /**
   * Notify completion subscribers
   */
  private notifyCompleteSubscribers(requestId: string, result: EnhancedResearchResult): void {
    const callbacks = this.completeSubscriptions.get(requestId) || [];
    callbacks.forEach(callback => {
      try {
        callback(result);
      } catch (error) {
        logger.error({ err: error, requestId }, 'Error in research completion callback');
      }
    });
  }

  /**
   * Start cleanup process
   */
  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 300000); // 5 minutes
  }

  /**
   * Perform cleanup of old data
   */
  private performCleanup(): void {
    const now = Date.now();
    const maxAge = this.config.defaultCacheTTL * 2; // Double the TTL for cleanup

    // Clean up old cache entries
    for (const [requestId, result] of this.researchCache.entries()) {
      if ((now - result.metadata.timestamp) > maxAge) {
        this.researchCache.delete(requestId);
      }
    }

    // Clean up old performance metrics
    for (const [requestId, metrics] of this.performanceMetrics.entries()) {
      if ((now - metrics.timestamp) > maxAge) {
        this.performanceMetrics.delete(requestId);
      }
    }
  }

  // Helper methods for content analysis

  private estimateTaskHours(taskDescription: string): number {
    const complexity = taskDescription.toLowerCase();
    if (complexity.includes('complex') || complexity.includes('advanced')) return 8;
    if (complexity.includes('simple') || complexity.includes('basic')) return 2;
    if (complexity.includes('setup') || complexity.includes('configure')) return 4;
    return 6; // Default
  }

  private extractTopics(content: string): string[] {
    const topics = new Set<string>();
    const words = content.toLowerCase().split(/\s+/);

    // Look for technical terms and concepts
    const technicalTerms = ['api', 'database', 'authentication', 'security', 'performance', 'testing', 'deployment'];
    technicalTerms.forEach(term => {
      if (words.includes(term)) {
        topics.add(term);
      }
    });

    return Array.from(topics).slice(0, 10);
  }

  private calculateTopicRelevance(topic: string, query: string): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const topicWords = topic.toLowerCase().split(/\s+/);

    const matches = topicWords.filter(word => queryWords.includes(word));
    return matches.length / Math.max(topicWords.length, 1);
  }

  private generateTopicTags(topic: string): string[] {
    const tags = [topic];

    // Add related tags based on topic
    if (topic.includes('api')) tags.push('integration', 'web-services');
    if (topic.includes('database')) tags.push('data', 'storage');
    if (topic.includes('security')) tags.push('authentication', 'authorization');

    return tags.slice(0, 5);
  }

  private extractRelatedTopics(content: string): string[] {
    const topics = new Set<string>();
    const lines = content.split('\n');

    lines.forEach(line => {
      if (line.includes('related') || line.includes('similar') || line.includes('also')) {
        const words = line.split(/\s+/).filter(word => word.length > 4);
        topics.add(words.slice(0, 3).join(' '));
      }
    });

    return Array.from(topics).slice(0, 5);
  }

  private extractExpertiseAreas(content: string): string[] {
    const areas = new Set<string>();
    const expertiseKeywords = ['expert', 'specialist', 'professional', 'experienced', 'skilled'];
    const lines = content.split('\n');

    lines.forEach(line => {
      expertiseKeywords.forEach(keyword => {
        if (line.toLowerCase().includes(keyword)) {
          const words = line.split(/\s+/).filter(word => word.length > 4);
          areas.add(words.slice(0, 2).join(' '));
        }
      });
    });

    return Array.from(areas).slice(0, 5);
  }

  /**
   * Create a degraded decomposition request when research fails
   */
  private createDegradedDecompositionRequest(
    originalRequest: TaskDecompositionRequest,
    reason: string
  ): TaskDecompositionRequest {
    logger.info({ 
      originalTask: originalRequest.taskDescription,
      reason 
    }, 'Creating degraded decomposition request due to research failure');

    // Add fallback context to help with decomposition
    const fallbackContext = {
      ...originalRequest.context,
      researchStatus: 'unavailable',
      fallbackReason: reason,
      degradationApplied: true,
      suggestedApproach: 'Use standard best practices and conventional patterns',
      recommendedTechnologies: this.inferTechnologiesFromDescription(originalRequest.taskDescription),
      estimatedComplexity: this.inferComplexityFromDescription(originalRequest.taskDescription)
    };

    return {
      ...originalRequest,
      context: fallbackContext
    };
  }

  /**
   * Infer likely technologies from task description for degraded mode
   */
  private inferTechnologiesFromDescription(description: string): string[] {
    const tech: string[] = [];
    const lowerDesc = description.toLowerCase();

    // Common technology patterns
    const techPatterns = [
      { pattern: /react|jsx/i, tech: 'React' },
      { pattern: /vue/i, tech: 'Vue.js' },
      { pattern: /angular/i, tech: 'Angular' },
      { pattern: /node|express/i, tech: 'Node.js' },
      { pattern: /python|django|flask/i, tech: 'Python' },
      { pattern: /java|spring/i, tech: 'Java' },
      { pattern: /typescript|ts/i, tech: 'TypeScript' },
      { pattern: /javascript|js/i, tech: 'JavaScript' },
      { pattern: /database|sql|mongodb/i, tech: 'Database' },
      { pattern: /api|rest|graphql/i, tech: 'API' },
      { pattern: /docker|kubernetes/i, tech: 'Container' },
      { pattern: /aws|azure|gcp/i, tech: 'Cloud' }
    ];

    techPatterns.forEach(({ pattern, tech: techName }) => {
      if (pattern.test(lowerDesc)) {
        tech.push(techName);
      }
    });

    return tech.length > 0 ? tech : ['Web Development'];
  }

  /**
   * Infer complexity level from task description for degraded mode
   */
  private inferComplexityFromDescription(description: string): 'low' | 'medium' | 'high' {
    const lowerDesc = description.toLowerCase();
    
    // High complexity indicators
    if (lowerDesc.includes('architecture') || lowerDesc.includes('system') || 
        lowerDesc.includes('framework') || lowerDesc.includes('integration') ||
        lowerDesc.includes('migration') || lowerDesc.includes('performance')) {
      return 'high';
    }
    
    // Medium complexity indicators
    if (lowerDesc.includes('api') || lowerDesc.includes('database') || 
        lowerDesc.includes('component') || lowerDesc.includes('service') ||
        lowerDesc.includes('optimization') || lowerDesc.includes('security')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Extract detailed error information for logging
   */
  private extractErrorDetails(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      const baseError = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };

      // Include any additional error properties safely
      const additionalProps: Record<string, unknown> = {};
      
      if ('cause' in error && error.cause) {
        additionalProps.cause = this.extractErrorDetails(error.cause);
      }
      
      // For API errors, include response data if available
      if ('response' in error && error.response) {
        const response = error.response as Record<string, unknown>;
        additionalProps.response = {
          status: response.status,
          statusText: response.statusText,
          data: response.data
        };
      }
      
      // For AxiosError, include request details
      if ('config' in error && error.config) {
        const config = error.config as Record<string, unknown>;
        additionalProps.request = {
          method: config.method,
          url: config.url,
          timeout: config.timeout
        };
      }

      return { ...baseError, ...additionalProps };
    } else if (typeof error === 'object' && error !== null) {
      return {
        type: 'object',
        value: JSON.stringify(error),
        properties: Object.keys(error)
      };
    } else {
      return {
        type: typeof error,
        value: String(error)
      };
    }
  }
}

// Export singleton instance
export const researchIntegration = ResearchIntegration.getInstance();

// Export convenience function
export function getResearchIntegration(config?: Partial<ResearchIntegrationConfig>): ResearchIntegration {
  return ResearchIntegration.getInstance(config);
}

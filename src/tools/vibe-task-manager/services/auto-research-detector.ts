/**
 * Auto-Research Detector Service
 * 
 * Determines when automatic research should be triggered based on:
 * - Project type detection (greenfield vs existing)
 * - Task complexity analysis
 * - Knowledge gap detection
 * - Domain-specific requirements
 */

import { AtomicTask } from '../types/task.js';
import { ProjectContext } from '../core/atomic-detector.js';
import { ContextResult } from './context-enrichment-service.js';
import {
  AutoResearchDetectorConfig,
  ResearchTriggerContext,
  ResearchTriggerDecision,
  ResearchTriggerConditions,
  ResearchTriggerEvaluation
} from '../types/research-types.js';
import { getVibeTaskManagerConfig } from '../utils/config-loader.js';
import {
  EnhancedError,
  ValidationError,
  createErrorContext
} from '../utils/enhanced-errors.js';
import logger from '../../../logger.js';

/**
 * Auto-Research Detector implementation following singleton pattern
 */
export class AutoResearchDetector {
  private static instance: AutoResearchDetector;
  private config: AutoResearchDetectorConfig;
  private evaluationCache: Map<string, ResearchTriggerEvaluation> = new Map();
  private performanceMetrics: {
    totalEvaluations: number;
    cacheHits: number;
    averageEvaluationTime: number;
  } = {
    totalEvaluations: 0,
    cacheHits: 0,
    averageEvaluationTime: 0
  };

  private constructor() {
    this.config = this.getDefaultConfig();
    this.initializeConfig();
    logger.debug('Auto-Research Detector initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): AutoResearchDetector {
    if (!AutoResearchDetector.instance) {
      AutoResearchDetector.instance = new AutoResearchDetector();
    }
    return AutoResearchDetector.instance;
  }

  /**
   * Evaluate whether research should be triggered for a given context
   */
  async evaluateResearchNeed(context: ResearchTriggerContext): Promise<ResearchTriggerEvaluation> {
    const startTime = Date.now();
    const evaluationId = this.generateEvaluationId(context);

    try {
      // Check cache first
      if (this.config.performance.enableCaching) {
        const cached = this.getCachedEvaluation(evaluationId);
        if (cached) {
          this.performanceMetrics.cacheHits++;
          logger.debug({ evaluationId }, 'Returning cached research evaluation');
          return cached;
        }
      }

      logger.info({
        taskId: context.task.id,
        projectId: context.projectContext.projectId,
        sessionId: context.sessionId
      }, 'Evaluating research need');

      // Evaluate trigger conditions
      const conditions = await this.evaluateTriggerConditions(context);

      // Make research decision
      const decision = this.makeResearchDecision(conditions, context);

      // Create evaluation result
      const evaluation: ResearchTriggerEvaluation = {
        decision,
        context,
        timestamp: Date.now(),
        metadata: {
          detectorVersion: '1.0.0',
          configSnapshot: {
            enabled: this.config.enabled,
            thresholds: { ...this.config.thresholds }
          },
          performance: {
            totalTime: Date.now() - startTime,
            conditionEvaluationTime: 0, // Will be updated
            decisionTime: 0, // Will be updated
            cacheOperationTime: 0
          }
        }
      };

      // Cache the result
      if (this.config.performance.enableCaching) {
        this.cacheEvaluation(evaluationId, evaluation);
      }

      // Update performance metrics
      this.updatePerformanceMetrics(evaluation.metadata.performance.totalTime);

      logger.info({
        taskId: context.task.id,
        shouldTriggerResearch: decision.shouldTriggerResearch,
        primaryReason: decision.primaryReason,
        confidence: decision.confidence,
        evaluationTime: evaluation.metadata.performance.totalTime
      }, 'Research evaluation completed');

      return evaluation;

    } catch (error) {
      const errorContext = createErrorContext('AutoResearchDetector', 'evaluateResearchNeed')
        .taskId(context.task.id)
        .metadata({
          projectId: context.projectContext.projectId,
          sessionId: context.sessionId,
          evaluationId
        })
        .build();

      logger.error({ err: error, context: errorContext }, 'Research evaluation failed');

      // Return a safe fallback decision
      const fallbackDecision: ResearchTriggerDecision = {
        shouldTriggerResearch: false,
        confidence: 0.1,
        primaryReason: 'sufficient_context',
        reasoning: ['Evaluation failed, defaulting to no research'],
        recommendedScope: {
          depth: 'shallow',
          focus: 'technical',
          priority: 'low',
          estimatedQueries: 0
        },
        evaluatedConditions: this.getEmptyConditions(),
        metrics: {
          evaluationTime: Date.now() - startTime,
          conditionsChecked: 0,
          cacheHits: 0
        }
      };

      return {
        decision: fallbackDecision,
        context,
        timestamp: Date.now(),
        metadata: {
          detectorVersion: '1.0.0',
          configSnapshot: { enabled: false },
          performance: {
            totalTime: Date.now() - startTime,
            conditionEvaluationTime: 0,
            decisionTime: 0,
            cacheOperationTime: 0
          }
        }
      };
    }
  }

  /**
   * Evaluate all trigger conditions
   */
  private async evaluateTriggerConditions(context: ResearchTriggerContext): Promise<ResearchTriggerConditions> {
    const startTime = Date.now();

    const conditions: ResearchTriggerConditions = {
      projectType: await this.evaluateProjectType(context),
      taskComplexity: this.evaluateTaskComplexity(context),
      knowledgeGap: this.evaluateKnowledgeGap(context),
      domainSpecific: this.evaluateDomainSpecific(context)
    };

    logger.debug({
      taskId: context.task.id,
      evaluationTime: Date.now() - startTime,
      conditions: {
        projectType: conditions.projectType.isGreenfield,
        complexityScore: conditions.taskComplexity.complexityScore,
        hasInsufficientContext: conditions.knowledgeGap.hasInsufficientContext,
        specializedDomain: conditions.domainSpecific.specializedDomain
      }
    }, 'Trigger conditions evaluated');

    return conditions;
  }

  /**
   * Evaluate project type (greenfield vs existing)
   */
  private async evaluateProjectType(context: ResearchTriggerContext): Promise<ResearchTriggerConditions['projectType']> {
    const { projectContext, contextResult } = context;

    // Check if we have existing codebase context
    const hasCodebaseContext = contextResult && contextResult.summary.totalFiles > 0;
    const codebaseSize = contextResult?.summary.totalFiles || 0;
    const averageRelevance = contextResult?.summary.averageRelevance || 0;

    // Determine project maturity
    let codebaseMaturity: 'new' | 'developing' | 'mature' | 'legacy' = 'new';
    let confidence = 0.5;

    if (codebaseSize === 0) {
      codebaseMaturity = 'new';
      confidence = 0.9;
    } else if (codebaseSize < 10) {
      codebaseMaturity = 'developing';
      confidence = 0.7;
    } else if (codebaseSize < 50) {
      codebaseMaturity = 'mature';
      confidence = 0.8;
    } else {
      codebaseMaturity = 'legacy';
      confidence = 0.6;
    }

    // Greenfield detection: no files OR very few files with low relevance
    const isGreenfield = codebaseSize === 0 ||
                        (codebaseSize < 3 && averageRelevance < 0.5);

    return {
      isGreenfield,
      hasExistingCodebase: hasCodebaseContext || false,
      codebaseMaturity,
      confidence
    };
  }

  /**
   * Evaluate task complexity
   */
  private evaluateTaskComplexity(context: ResearchTriggerContext): ResearchTriggerConditions['taskComplexity'] {
    const { task } = context;
    const description = (task.description || task.title).toLowerCase();

    const complexityIndicators: string[] = [];
    let complexityScore = 0;

    // Check high-complexity indicators
    for (const indicator of this.config.complexityIndicators.highComplexity) {
      if (description.includes(indicator.toLowerCase())) {
        complexityIndicators.push(indicator);
        complexityScore += 0.3;
      }
    }

    // Check medium-complexity indicators
    for (const indicator of this.config.complexityIndicators.mediumComplexity) {
      if (description.includes(indicator.toLowerCase())) {
        complexityIndicators.push(indicator);
        complexityScore += 0.2;
      }
    }

    // Check architectural indicators
    for (const indicator of this.config.complexityIndicators.architectural) {
      if (description.includes(indicator.toLowerCase())) {
        complexityIndicators.push(indicator);
        complexityScore += 0.25;
      }
    }

    // Check integration indicators
    for (const indicator of this.config.complexityIndicators.integration) {
      if (description.includes(indicator.toLowerCase())) {
        complexityIndicators.push(indicator);
        complexityScore += 0.2;
      }
    }

    // Normalize complexity score
    complexityScore = Math.min(complexityScore, 1.0);

    // Estimate research value
    const estimatedResearchValue = complexityScore * 0.8 + (complexityIndicators.length > 0 ? 0.2 : 0);

    // Check if requires specialized knowledge
    const requiresSpecializedKnowledge = complexityScore > this.config.thresholds.minComplexityScore;

    return {
      complexityScore,
      complexityIndicators,
      estimatedResearchValue,
      requiresSpecializedKnowledge
    };
  }

  /**
   * Evaluate knowledge gap based on context enrichment results
   */
  private evaluateKnowledgeGap(context: ResearchTriggerContext): ResearchTriggerConditions['knowledgeGap'] {
    const { contextResult } = context;

    if (!contextResult) {
      return {
        contextQuality: 0,
        relevanceScore: 0,
        filesFound: 0,
        averageRelevance: 0,
        hasInsufficientContext: true
      };
    }

    const { summary } = contextResult;
    const contextQuality = this.calculateContextQuality(summary);
    const hasInsufficientContext = this.determineInsufficientContext(summary);

    return {
      contextQuality,
      relevanceScore: summary.averageRelevance,
      filesFound: summary.totalFiles,
      averageRelevance: summary.averageRelevance,
      hasInsufficientContext
    };
  }

  /**
   * Evaluate domain-specific requirements
   */
  private evaluateDomainSpecific(context: ResearchTriggerContext): ResearchTriggerConditions['domainSpecific'] {
    const { task, projectContext } = context;
    const description = (task.description || task.title).toLowerCase();

    const technologyStack = this.extractTechnologyStack(context);
    const unfamiliarTechnologies = this.identifyUnfamiliarTechnologies(technologyStack);
    const specializedDomain = this.isSpecializedDomain(description, technologyStack);
    const domainComplexity = this.calculateDomainComplexity(technologyStack, unfamiliarTechnologies);

    return {
      technologyStack,
      unfamiliarTechnologies,
      specializedDomain,
      domainComplexity
    };
  }

  /**
   * Make research decision based on evaluated conditions
   */
  private makeResearchDecision(
    conditions: ResearchTriggerConditions,
    context: ResearchTriggerContext
  ): ResearchTriggerDecision {
    const reasoning: string[] = [];
    let shouldTriggerResearch = false;
    let confidence = 0.5;
    let primaryReason: ResearchTriggerDecision['primaryReason'] = 'sufficient_context';

    // Override if disabled
    if (!this.config.enabled) {
      shouldTriggerResearch = false;
      primaryReason = 'sufficient_context';
      confidence = 0.1;
      reasoning.push('Auto-research disabled in configuration');
      return this.createDecision(shouldTriggerResearch, confidence, primaryReason, reasoning, conditions);
    }

    // Priority 1: Project type (greenfield projects need research)
    if (conditions.projectType.isGreenfield && conditions.projectType.confidence > 0.7) {
      shouldTriggerResearch = true;
      primaryReason = 'project_type';
      confidence = conditions.projectType.confidence;
      reasoning.push('Greenfield project detected - research recommended for best practices');
    }
    // Priority 2: Task complexity (high complexity tasks need research)
    else if (conditions.taskComplexity.complexityScore > this.config.thresholds.minComplexityScore) {
      shouldTriggerResearch = true;
      primaryReason = 'task_complexity';
      confidence = conditions.taskComplexity.complexityScore;
      reasoning.push(`High complexity task (score: ${conditions.taskComplexity.complexityScore.toFixed(2)}) - research recommended`);
    }
    // Priority 3: Knowledge gap (insufficient context needs research)
    else if (conditions.knowledgeGap.hasInsufficientContext) {
      shouldTriggerResearch = true;
      primaryReason = 'knowledge_gap';
      confidence = 0.8;
      reasoning.push('Insufficient context found - research needed to fill knowledge gaps');
    }
    // Priority 4: Domain-specific (specialized domains need research)
    else if (conditions.domainSpecific.specializedDomain) {
      shouldTriggerResearch = true;
      primaryReason = 'domain_specific';
      confidence = conditions.domainSpecific.domainComplexity;
      reasoning.push('Specialized domain detected - research recommended for domain expertise');
    }
    // Default: Sufficient context available
    else {
      shouldTriggerResearch = false;
      primaryReason = 'sufficient_context';
      confidence = Math.max(conditions.knowledgeGap.contextQuality, 0.6);
      reasoning.push('Sufficient context available - research not needed');
    }

    return this.createDecision(shouldTriggerResearch, confidence, primaryReason, reasoning, conditions);
  }

  /**
   * Create research decision object
   */
  private createDecision(
    shouldTriggerResearch: boolean,
    confidence: number,
    primaryReason: ResearchTriggerDecision['primaryReason'],
    reasoning: string[],
    conditions: ResearchTriggerConditions
  ): ResearchTriggerDecision {
    // Determine recommended scope
    const recommendedScope = this.determineResearchScope(conditions, shouldTriggerResearch);

    return {
      shouldTriggerResearch,
      confidence,
      primaryReason,
      reasoning,
      recommendedScope,
      evaluatedConditions: conditions,
      metrics: {
        evaluationTime: 0, // Will be set by caller
        conditionsChecked: 4,
        cacheHits: 0
      }
    };
  }

  /**
   * Helper methods for evaluation
   */
  private calculateContextQuality(summary: ContextResult['summary']): number {
    if (summary.totalFiles === 0) return 0;

    const fileScore = Math.min(summary.totalFiles / this.config.thresholds.minFilesForSufficientContext, 1);
    const relevanceScore = summary.averageRelevance;

    return (fileScore * 0.4 + relevanceScore * 0.6);
  }

  private determineInsufficientContext(summary: ContextResult['summary']): boolean {
    return summary.totalFiles < this.config.thresholds.minFilesForSufficientContext ||
           summary.averageRelevance < this.config.thresholds.minAverageRelevance;
  }

  private extractTechnologyStack(context: ResearchTriggerContext): string[] {
    const { projectContext, task } = context;
    const technologies: string[] = [];

    // Extract from project context
    if (projectContext.languages) {
      technologies.push(...projectContext.languages);
    }
    if (projectContext.frameworks) {
      technologies.push(...projectContext.frameworks);
    }
    if (projectContext.tools) {
      technologies.push(...projectContext.tools);
    }

    // Extract from task description
    const description = (task.description || task.title).toLowerCase();
    for (const tech of [...this.config.specializedTechnologies.emerging,
                          ...this.config.specializedTechnologies.complexFrameworks]) {
      if (description.includes(tech.toLowerCase())) {
        technologies.push(tech);
      }
    }

    return [...new Set(technologies)];
  }

  private identifyUnfamiliarTechnologies(technologyStack: string[]): string[] {
    const unfamiliar: string[] = [];

    for (const tech of technologyStack) {
      if (this.config.specializedTechnologies.emerging.includes(tech) ||
          this.config.specializedTechnologies.complexFrameworks.includes(tech) ||
          this.config.specializedTechnologies.enterprise.includes(tech)) {
        unfamiliar.push(tech);
      }
    }

    return unfamiliar;
  }

  private isSpecializedDomain(description: string, technologyStack: string[]): boolean {
    // Check for specialized domain keywords
    for (const domain of this.config.specializedTechnologies.domains) {
      if (description.includes(domain.toLowerCase())) {
        return true;
      }
    }

    // Check for unfamiliar technologies
    const unfamiliarTechs = this.identifyUnfamiliarTechnologies(technologyStack);
    return unfamiliarTechs.length > 0;
  }

  private calculateDomainComplexity(technologyStack: string[], unfamiliarTechnologies: string[]): number {
    const totalTechs = technologyStack.length;
    const unfamiliarRatio = totalTechs > 0 ? unfamiliarTechnologies.length / totalTechs : 0;

    return Math.min(unfamiliarRatio + (totalTechs > 5 ? 0.2 : 0), 1.0);
  }

  private determineResearchScope(
    conditions: ResearchTriggerConditions,
    shouldTriggerResearch: boolean
  ): ResearchTriggerDecision['recommendedScope'] {
    if (!shouldTriggerResearch) {
      return {
        depth: 'shallow',
        focus: 'technical',
        priority: 'low',
        estimatedQueries: 0
      };
    }

    let depth: 'shallow' | 'medium' | 'deep' = 'medium';
    let focus: 'technical' | 'business' | 'market' | 'comprehensive' = 'technical';
    let priority: 'low' | 'medium' | 'high' = 'medium';
    let estimatedQueries = 2;

    // Adjust based on complexity
    if (conditions.taskComplexity.complexityScore > 0.7) {
      depth = 'deep';
      priority = 'high';
      estimatedQueries = 4;
    } else if (conditions.taskComplexity.complexityScore < 0.3) {
      depth = 'shallow';
      priority = 'low';
      estimatedQueries = 1;
    }

    // Adjust based on domain specificity
    if (conditions.domainSpecific.specializedDomain) {
      focus = 'comprehensive';
      estimatedQueries += 1;
    }

    // Adjust based on project type
    if (conditions.projectType.isGreenfield) {
      focus = 'comprehensive';
      estimatedQueries += 1;
    }

    return { depth, focus, priority, estimatedQueries };
  }

  /**
   * Cache and utility methods
   */
  private generateEvaluationId(context: ResearchTriggerContext): string {
    const taskId = context.task.id;
    const projectId = context.projectContext.projectId;
    const taskHash = this.hashString(context.task.description || context.task.title);
    return `${projectId}-${taskId}-${taskHash}`;
  }

  private getCachedEvaluation(evaluationId: string): ResearchTriggerEvaluation | null {
    const cached = this.evaluationCache.get(evaluationId);
    if (!cached) return null;

    const now = Date.now();
    const age = now - cached.timestamp;

    if (age > this.config.performance.cacheTTL) {
      this.evaluationCache.delete(evaluationId);
      return null;
    }

    return cached;
  }

  private cacheEvaluation(evaluationId: string, evaluation: ResearchTriggerEvaluation): void {
    this.evaluationCache.set(evaluationId, evaluation);

    // Clean up old entries if cache is getting large
    if (this.evaluationCache.size > 100) {
      const oldestKey = this.evaluationCache.keys().next().value;
      if (oldestKey) {
        this.evaluationCache.delete(oldestKey);
      }
    }
  }

  private updatePerformanceMetrics(evaluationTime: number): void {
    this.performanceMetrics.totalEvaluations++;
    const total = this.performanceMetrics.totalEvaluations;
    const current = this.performanceMetrics.averageEvaluationTime;
    this.performanceMetrics.averageEvaluationTime = (current * (total - 1) + evaluationTime) / total;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private getEmptyConditions(): ResearchTriggerConditions {
    return {
      projectType: {
        isGreenfield: false,
        hasExistingCodebase: false,
        codebaseMaturity: 'new',
        confidence: 0
      },
      taskComplexity: {
        complexityScore: 0,
        complexityIndicators: [],
        estimatedResearchValue: 0,
        requiresSpecializedKnowledge: false
      },
      knowledgeGap: {
        contextQuality: 0,
        relevanceScore: 0,
        filesFound: 0,
        averageRelevance: 0,
        hasInsufficientContext: true
      },
      domainSpecific: {
        technologyStack: [],
        unfamiliarTechnologies: [],
        specializedDomain: false,
        domainComplexity: 0
      }
    };
  }

  /**
   * Configuration methods
   */
  private async initializeConfig(): Promise<void> {
    try {
      const vibeConfig = await getVibeTaskManagerConfig();
      // Merge with any config from vibe task manager
      // For now, use defaults
      logger.debug('Auto-research detector configuration initialized');
    } catch (error) {
      logger.warn({ err: error }, 'Failed to load config, using defaults');
    }
  }

  private getDefaultConfig(): AutoResearchDetectorConfig {
    return {
      enabled: true,
      thresholds: {
        minComplexityScore: 0.4,
        maxContextQuality: 0.8,
        minDecisionConfidence: 0.6,
        minFilesForSufficientContext: 3,
        minAverageRelevance: 0.5
      },
      complexityIndicators: {
        highComplexity: ['architecture', 'system', 'framework', 'migration', 'refactor'],
        mediumComplexity: ['integration', 'optimization', 'performance', 'security'],
        architectural: ['design', 'pattern', 'structure', 'component', 'module'],
        integration: ['api', 'service', 'database', 'external', 'third-party']
      },
      specializedTechnologies: {
        emerging: ['rust', 'deno', 'bun', 'astro', 'qwik', 'solid'],
        complexFrameworks: ['kubernetes', 'terraform', 'ansible', 'docker', 'microservices'],
        enterprise: ['sap', 'oracle', 'salesforce', 'sharepoint', 'dynamics'],
        domains: ['blockchain', 'machine-learning', 'ai', 'iot', 'embedded', 'gaming']
      },
      performance: {
        enableCaching: true,
        cacheTTL: 300000, // 5 minutes
        maxEvaluationTime: 5000, // 5 seconds
        enableParallelEvaluation: true
      }
    };
  }

  /**
   * Public utility methods
   */
  updateConfig(newConfig: Partial<AutoResearchDetectorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.debug({ config: this.config }, 'Auto-research detector configuration updated');
  }

  getConfig(): AutoResearchDetectorConfig {
    return { ...this.config };
  }

  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      cacheSize: this.evaluationCache.size,
      cacheHitRate: this.performanceMetrics.totalEvaluations > 0
        ? this.performanceMetrics.cacheHits / this.performanceMetrics.totalEvaluations
        : 0
    };
  }

  clearCache(): void {
    this.evaluationCache.clear();
    logger.debug('Auto-research detector cache cleared');
  }
}

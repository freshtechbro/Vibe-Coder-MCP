/**
 * Intent Recognition Engine
 * Orchestrates multi-strategy intent recognition with pattern matching and LLM fallback
 */

import { Intent, IntentRecognitionConfig, ConfidenceLevel } from '../types/nl.js';
import { IntentPatternEngine, IntentMatch } from './patterns.js';
import { LLMFallbackSystem } from './llm-fallback.js';
import { ConfigLoader, VibeTaskManagerConfig } from '../utils/config-loader.js';
import logger from '../../../logger.js';

/**
 * Recognition strategy type
 */
export type RecognitionStrategy = 'pattern' | 'llm' | 'hybrid';

/**
 * Recognition result with strategy information
 */
export interface RecognitionResult {
  intent: Intent;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  entities: Record<string, unknown>;
  strategy: RecognitionStrategy;
  alternatives: Array<{
    intent: Intent;
    confidence: number;
    strategy: RecognitionStrategy;
  }>;
  processingTime: number;
  metadata: {
    patternMatches?: IntentMatch[];
    llmUsed?: boolean;
    fallbackReason?: string;
    timestamp: Date;
  };
}

/**
 * Intent Recognition Engine implementation
 */
export class IntentRecognitionEngine {
  private static instance: IntentRecognitionEngine;
  private config: IntentRecognitionConfig;
  private patternEngine: IntentPatternEngine;
  private llmFallback: LLMFallbackSystem;
  private recognitionStats = {
    totalRequests: 0,
    successfulRecognitions: 0,
    failedRecognitions: 0,
    strategyUsage: {
      pattern: 0,
      llm: 0,
      hybrid: 0
    }
  };

  private constructor() {
    // Initialize with default config first
    this.config = this.getDefaultConfig();
    this.patternEngine = new IntentPatternEngine();
    this.llmFallback = LLMFallbackSystem.getInstance();

    // Then load actual config asynchronously
    this.initializeConfig();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): IntentRecognitionEngine {
    if (!IntentRecognitionEngine.instance) {
      IntentRecognitionEngine.instance = new IntentRecognitionEngine();
    }
    return IntentRecognitionEngine.instance;
  }

  /**
   * Initialize configuration from config loader
   */
  private initializeConfig(): void {
    // Load config asynchronously without blocking constructor
    const configLoader = ConfigLoader.getInstance();

    // Try to get existing config first
    const existingConfig = configLoader.getConfig();
    if (existingConfig) {
      this.updateConfigFromLoaded(existingConfig);
      return;
    }

    // If no config exists, load it asynchronously
    configLoader.loadConfig()
      .then(result => {
        if (result.success && result.data) {
          this.updateConfigFromLoaded(result.data);
          logger.info({ config: this.config }, 'Intent Recognition Engine configuration loaded');
        } else {
          logger.error({ error: result.error }, 'Failed to load configuration, using defaults');
        }
      })
      .catch((error: Error) => {
        logger.error({ err: error }, 'Failed to load configuration, using defaults');
        // Keep the default config that was already set
      });
  }

  /**
   * Update config from loaded configuration
   */
  private updateConfigFromLoaded(config: VibeTaskManagerConfig): void {
    this.config = {
      primaryMethod: config.taskManager.nlpSettings.primaryMethod,
      fallbackMethod: config.taskManager.nlpSettings.fallbackMethod,
      minConfidence: config.taskManager.nlpSettings.minConfidence,
      useLlmForAmbiguous: true,
      maxProcessingTime: config.taskManager.nlpSettings.maxProcessingTime,
      cacheResults: true,
      cacheTTL: 300,
      learningEnabled: false,
      customPatterns: []
    };
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): IntentRecognitionConfig {
    return {
      primaryMethod: 'hybrid',
      fallbackMethod: 'pattern',
      minConfidence: 0.7,
      useLlmForAmbiguous: true,
      maxProcessingTime: 5000,
      cacheResults: true,
      cacheTTL: 300,
      learningEnabled: false,
      customPatterns: []
    };
  }

  /**
   * Recognize intent from natural language text
   */
  async recognizeIntent(text: string, context?: Record<string, unknown>): Promise<RecognitionResult | null> {
    const startTime = Date.now();
    this.recognitionStats.totalRequests++;

    try {
      logger.debug({ text: text.substring(0, 100), strategy: this.config.primaryMethod }, 'Starting intent recognition');

      let result: RecognitionResult | null = null;

      // Execute primary strategy
      switch (this.config.primaryMethod) {
        case 'pattern':
          result = await this.recognizeWithPatterns(text, context, startTime);
          break;
        case 'llm':
          result = await this.recognizeWithLLM(text, context, startTime);
          break;
        case 'hybrid':
          result = await this.recognizeWithHybrid(text, context, startTime);
          break;
      }

      // Try fallback if primary failed or confidence too low
      if (!result || result.confidence < this.config.minConfidence) {
        const fallbackResult = await this.tryFallbackStrategy(text, context, startTime, result);
        if (fallbackResult && fallbackResult.confidence > (result?.confidence || 0)) {
          result = fallbackResult;
        }
      }

      // Update statistics
      if (result) {
        this.recognitionStats.successfulRecognitions++;
        this.recognitionStats.strategyUsage[result.strategy]++;
      } else {
        this.recognitionStats.failedRecognitions++;
      }

      const processingTime = Date.now() - startTime;
      logger.info({
        success: !!result,
        intent: result?.intent,
        confidence: result?.confidence,
        strategy: result?.strategy,
        processingTime
      }, 'Intent recognition completed');

      return result;

    } catch (error) {
      this.recognitionStats.failedRecognitions++;
      logger.error({ err: error, text: text.substring(0, 100) }, 'Intent recognition failed');
      return null;
    }
  }

  /**
   * Recognize intent using pattern matching only
   */
  private async recognizeWithPatterns(
    text: string,
    context?: Record<string, unknown>,
    startTime?: number
  ): Promise<RecognitionResult | null> {
    const matches = this.patternEngine.matchIntent(text);

    if (matches.length === 0) {
      return null;
    }

    const bestMatch = matches[0];
    const processingTime = startTime ? Date.now() - startTime : bestMatch.processingTime;

    return {
      intent: bestMatch.intent,
      confidence: bestMatch.confidence,
      confidenceLevel: bestMatch.confidenceLevel,
      entities: bestMatch.entities,
      strategy: 'pattern',
      alternatives: matches.slice(1, 3).map(match => ({
        intent: match.intent,
        confidence: match.confidence,
        strategy: 'pattern' as RecognitionStrategy
      })),
      processingTime,
      metadata: {
        patternMatches: matches,
        timestamp: new Date()
      }
    };
  }

  /**
   * Recognize intent using LLM only
   */
  private async recognizeWithLLM(
    text: string,
    context?: Record<string, unknown>,
    startTime?: number
  ): Promise<RecognitionResult | null> {
    const llmResult = await this.llmFallback.recognizeIntent(text, 0, context);

    if (!llmResult) {
      return null;
    }

    const processingTime = startTime ? Date.now() - startTime : llmResult.metadata.processingTime;

    return {
      intent: llmResult.intent,
      confidence: llmResult.confidence,
      confidenceLevel: llmResult.confidenceLevel,
      entities: Array.isArray(llmResult.entities) 
        ? llmResult.entities.reduce((acc: Record<string, unknown>, entity: unknown) => {
            if (entity && typeof entity === 'object' && 'type' in entity) {
              const entityObj = entity as { type: string; value?: unknown; text?: unknown };
              acc[entityObj.type] = entityObj.value || entityObj.text || entity;
            }
            return acc;
          }, {})
        : llmResult.entities || {},
      strategy: 'llm',
      alternatives: llmResult.alternatives.map(alt => ({
        intent: alt.intent,
        confidence: alt.confidence,
        strategy: 'llm' as RecognitionStrategy
      })),
      processingTime,
      metadata: {
        llmUsed: true,
        timestamp: new Date()
      }
    };
  }

  /**
   * Recognize intent using hybrid approach (patterns first, LLM for ambiguous cases)
   */
  private async recognizeWithHybrid(
    text: string,
    context?: Record<string, unknown>,
    startTime?: number
  ): Promise<RecognitionResult | null> {
    // First try pattern matching
    const patternResult = await this.recognizeWithPatterns(text, context, startTime);

    // If pattern matching succeeded with high confidence, use it
    if (patternResult && patternResult.confidence >= this.config.minConfidence) {
      patternResult.strategy = 'hybrid';
      return patternResult;
    }

    // If pattern matching failed or low confidence, try LLM
    if (this.config.useLlmForAmbiguous) {
      const llmResult = await this.recognizeWithLLM(text, context, startTime);

      if (llmResult) {
        llmResult.strategy = 'hybrid';
        llmResult.metadata.fallbackReason = patternResult
          ? 'low_pattern_confidence'
          : 'no_pattern_match';

        // Combine pattern matches in metadata if available
        if (patternResult?.metadata.patternMatches) {
          llmResult.metadata.patternMatches = patternResult.metadata.patternMatches;
        }

        return llmResult;
      }
    }

    // Return pattern result even if low confidence, or null if no patterns matched
    if (patternResult) {
      patternResult.strategy = 'hybrid';
      return patternResult;
    }

    return null;
  }

  /**
   * Try fallback strategy if primary failed
   */
  private async tryFallbackStrategy(
    text: string,
    context: Record<string, unknown> | undefined,
    startTime: number,
    primaryResult: RecognitionResult | null
  ): Promise<RecognitionResult | null> {
    if (this.config.fallbackMethod === 'none') {
      return null;
    }

    logger.debug({
      fallbackMethod: this.config.fallbackMethod,
      primarySuccess: !!primaryResult,
      primaryConfidence: primaryResult?.confidence
    }, 'Trying fallback strategy');

    let fallbackResult: RecognitionResult | null = null;

    switch (this.config.fallbackMethod) {
      case 'pattern':
        if (this.config.primaryMethod !== 'pattern') {
          fallbackResult = await this.recognizeWithPatterns(text, context, startTime);
        }
        break;
      case 'llm':
        if (this.config.primaryMethod !== 'llm') {
          fallbackResult = await this.recognizeWithLLM(text, context, startTime);
        }
        break;
    }

    if (fallbackResult) {
      fallbackResult.metadata.fallbackReason = 'primary_strategy_failed';
    }

    return fallbackResult;
  }

  /**
   * Disambiguate between multiple high-confidence intents
   */
  async disambiguateIntents(
    text: string,
    candidates: RecognitionResult[],
    _context?: Record<string, unknown>
  ): Promise<RecognitionResult | null> {
    if (candidates.length <= 1) {
      return candidates[0] || null;
    }

    // If we have a clear winner (significantly higher confidence), use it
    const sorted = candidates.sort((a, b) => b.confidence - a.confidence);
    const best = sorted[0];
    const second = sorted[1];

    if (best.confidence - second.confidence > 0.2) {
      return best;
    }

    // Use LLM for disambiguation if enabled
    if (this.config.useLlmForAmbiguous) {
      // const disambiguationPrompt = this.buildDisambiguationPrompt(text, candidates);
      // This would require a specialized disambiguation LLM call
      // For now, return the highest confidence result
    }

    return best;
  }

  /**
   * Build disambiguation prompt for LLM
   */
  private buildDisambiguationPrompt(text: string, candidates: RecognitionResult[]): string {
    let prompt = `The following text has multiple possible interpretations:\n\n"${text}"\n\n`;
    prompt += `Possible intents:\n`;

    candidates.forEach((candidate, index) => {
      prompt += `${index + 1}. ${candidate.intent} (confidence: ${candidate.confidence.toFixed(2)})\n`;
    });

    prompt += `\nPlease select the most likely intent and explain your reasoning.`;
    return prompt;
  }

  /**
   * Learn from user feedback (placeholder for future implementation)
   */
  async learnFromFeedback(
    originalText: string,
    recognizedIntent: Intent,
    correctIntent: Intent,
    userFeedback: string
  ): Promise<void> {
    if (!this.config.learningEnabled) {
      return;
    }

    // Placeholder for learning implementation
    logger.info({
      originalText: originalText.substring(0, 100),
      recognizedIntent,
      correctIntent,
      userFeedback
    }, 'Learning from user feedback');
  }

  /**
   * Get recognition statistics
   */
  getStatistics() {
    return {
      ...this.recognitionStats,
      successRate: this.recognitionStats.totalRequests > 0
        ? this.recognitionStats.successfulRecognitions / this.recognitionStats.totalRequests
        : 0
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<IntentRecognitionConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info({ config: this.config }, 'Intent Recognition Engine configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): IntentRecognitionConfig {
    return { ...this.config };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.recognitionStats = {
      totalRequests: 0,
      successfulRecognitions: 0,
      failedRecognitions: 0,
      strategyUsage: {
        pattern: 0,
        llm: 0,
        hybrid: 0
      }
    };
    logger.info('Recognition statistics reset');
  }
}

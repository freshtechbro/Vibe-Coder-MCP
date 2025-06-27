/**
 * LLM Fallback System for Intent Recognition
 * Provides LLM-based intent recognition when pattern matching fails or has low confidence
 */

import { Intent, RecognizedIntent, ConfidenceLevel, Entity } from '../types/nl.js';
import { performFormatAwareLlmCall } from '../../../utils/llmHelper.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { getPromptService } from '../services/prompt-service.js';
import { OpenRouterConfigManager } from '../../../utils/openrouter-config-manager.js';
import logger from '../../../logger.js';

/**
 * LLM fallback configuration
 */
export interface LLMFallbackConfig {
  /** Minimum confidence threshold to trigger LLM fallback */
  minPatternConfidence: number;
  /** Maximum processing time for LLM calls (ms) */
  maxProcessingTime: number;
  /** Temperature for LLM calls */
  temperature: number;
  /** Whether to cache LLM results */
  enableCaching: boolean;
  /** Cache TTL in seconds */
  cacheTTL: number;
  /** Maximum retries for failed LLM calls */
  maxRetries: number;
}

/**
 * LLM response structure for intent recognition
 */
interface LLMIntentResponse {
  intent: Intent;
  confidence: number;
  parameters: Record<string, any>;
  context: {
    temporal?: string;
    project_scope?: string;
    urgency?: string;
  };
  alternatives?: Array<{
    intent: Intent;
    confidence: number;
    reasoning: string;
  }>;
  clarifications_needed?: string[];
}

/**
 * Cache entry for LLM results
 */
interface CacheEntry {
  response: RecognizedIntent;
  timestamp: Date;
  expiresAt: Date;
}

/**
 * LLM Fallback System implementation
 */
export class LLMFallbackSystem {
  private static instance: LLMFallbackSystem;
  private config: LLMFallbackConfig;
  private openRouterConfig: OpenRouterConfig | null = null;
  private cache = new Map<string, CacheEntry>();
  private promptService = getPromptService();

  private constructor(config: Partial<LLMFallbackConfig> = {}) {
    this.config = {
      minPatternConfidence: config.minPatternConfidence ?? 0.7,
      maxProcessingTime: config.maxProcessingTime ?? 5000,
      temperature: config.temperature ?? 0.1,
      enableCaching: config.enableCaching ?? true,
      cacheTTL: config.cacheTTL ?? 300, // 5 minutes
      maxRetries: config.maxRetries ?? 2
    };

    this.initializeConfig();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<LLMFallbackConfig>): LLMFallbackSystem {
    if (!LLMFallbackSystem.instance) {
      LLMFallbackSystem.instance = new LLMFallbackSystem(config);
    }
    return LLMFallbackSystem.instance;
  }

  /**
   * Initialize OpenRouter configuration
   */
  private async initializeConfig(): Promise<void> {
    try {
      const configManager = OpenRouterConfigManager.getInstance();
      await configManager.initialize();
      this.openRouterConfig = await configManager.getOpenRouterConfig();

      logger.info('LLM Fallback System initialized with OpenRouter config');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize LLM Fallback System config');
    }
  }

  /**
   * Recognize intent using LLM when pattern matching fails or has low confidence
   */
  async recognizeIntent(
    text: string,
    patternConfidence: number = 0,
    context?: Record<string, any>
  ): Promise<RecognizedIntent | null> {
    const startTime = Date.now();

    try {
      // Ensure config is initialized
      if (!this.openRouterConfig) {
        await this.initializeConfig();
        if (!this.openRouterConfig) {
          throw new Error('OpenRouter configuration not available');
        }
      }

      // Check if we should use LLM fallback
      if (patternConfidence >= this.config.minPatternConfidence) {
        logger.debug({ patternConfidence }, 'Pattern confidence sufficient, skipping LLM fallback');
        return null;
      }

      // Check cache first
      if (this.config.enableCaching) {
        const cached = this.getCachedResult(text);
        if (cached) {
          logger.debug('Returning cached LLM intent recognition result');
          return cached;
        }
      }

      // Get system prompt for intent recognition
      const systemPrompt = await this.promptService.getPrompt('intent_recognition');

      // Build user prompt with context
      const userPrompt = this.buildUserPrompt(text, context);

      // Call LLM for intent recognition
      const llmResponse = await this.callLLMWithRetry(userPrompt, systemPrompt);

      // Parse and validate LLM response
      const parsedResponse = this.parseLLMResponse(llmResponse);

      // Convert to RecognizedIntent format
      const recognizedIntent = this.convertToRecognizedIntent(text, parsedResponse, startTime);

      // Cache the result
      if (this.config.enableCaching) {
        this.cacheResult(text, recognizedIntent);
      }

      logger.info({
        intent: recognizedIntent.intent,
        confidence: recognizedIntent.confidence,
        processingTime: recognizedIntent.metadata.processingTime
      }, 'LLM intent recognition completed');

      return recognizedIntent;

    } catch (error) {
      logger.error({ err: error, text: text.substring(0, 100) }, 'LLM intent recognition failed');
      return null;
    }
  }

  /**
   * Build user prompt for LLM intent recognition
   */
  private buildUserPrompt(text: string, context?: Record<string, any>): string {
    let prompt = `Please analyze the following user input and identify the intent:\n\n"${text}"\n\n`;

    if (context) {
      prompt += `Additional context:\n`;
      for (const [key, value] of Object.entries(context)) {
        prompt += `- ${key}: ${value}\n`;
      }
      prompt += '\n';
    }

    prompt += `Respond with valid JSON matching the specified format. Focus on accuracy and provide confidence scores based on how clear the intent is.`;

    return prompt;
  }

  /**
   * Call LLM with retry logic
   */
  private async callLLMWithRetry(userPrompt: string, systemPrompt: string): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await performFormatAwareLlmCall(
          userPrompt,
          systemPrompt,
          this.openRouterConfig!,
          'intent_recognition',
          'json', // Explicitly specify JSON format
          undefined, // Schema will be inferred from task name
          this.config.temperature
        );

        return response;
      } catch (error) {
        lastError = error as Error;
        logger.warn({
          attempt,
          maxRetries: this.config.maxRetries,
          error: error
        }, 'LLM call failed, retrying');

        if (attempt < this.config.maxRetries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('LLM call failed after all retries');
  }

  /**
   * Parse LLM response JSON
   */
  private parseLLMResponse(response: string): LLMIntentResponse {
    try {
      // Clean up response - remove markdown code blocks if present
      const cleanedResponse = response
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const parsed = JSON.parse(cleanedResponse);

      // Validate required fields
      if (!parsed.intent || typeof parsed.confidence !== 'number') {
        throw new Error('Invalid LLM response structure');
      }

      // Ensure confidence is within bounds
      parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

      return parsed as LLMIntentResponse;
    } catch (error) {
      logger.error({ err: error, response: response.substring(0, 200) }, 'Failed to parse LLM response');
      throw new Error('Invalid JSON response from LLM');
    }
  }

  /**
   * Convert LLM response to RecognizedIntent format
   */
  private convertToRecognizedIntent(
    originalInput: string,
    llmResponse: LLMIntentResponse,
    startTime: number
  ): RecognizedIntent {
    const processingTime = Date.now() - startTime;

    // Handle unrecognized intents - convert to 'unknown' with low confidence
    let intent = llmResponse.intent;
    let confidence = llmResponse.confidence;

    if (intent === 'unrecognized_intent' || intent === 'clarification_needed') {
      intent = 'unknown';
      // For unrecognized intents, confidence should be low regardless of LLM confidence
      confidence = Math.min(confidence, 0.3);

      logger.debug({
        originalIntent: llmResponse.intent,
        originalConfidence: llmResponse.confidence,
        adjustedConfidence: confidence
      }, 'Adjusted confidence for unrecognized intent');
    } else if (!this.isValidIntent(intent)) {
      // For invalid intents that aren't explicitly unrecognized, keep original confidence
      // but convert to unknown
      intent = 'unknown';

      logger.debug({
        originalIntent: llmResponse.intent,
        originalConfidence: llmResponse.confidence,
        adjustedIntent: intent
      }, 'Converted invalid intent to unknown');
    }

    return {
      intent: intent as Intent,
      confidence,
      confidenceLevel: this.getConfidenceLevel(confidence),
      entities: this.convertParametersToEntities(llmResponse.parameters || {}),
      originalInput,
      processedInput: originalInput.toLowerCase().trim(),
      alternatives: llmResponse.alternatives?.map(alt => ({
        intent: this.isValidIntent(alt.intent) ? alt.intent as Intent : 'unknown',
        confidence: alt.confidence
      })) || [],
      metadata: {
        processingTime,
        method: 'llm',
        modelUsed: this.openRouterConfig?.llm_mapping?.intent_recognition || 'unknown',
        timestamp: new Date()
      }
    };
  }

  /**
   * Convert parameters to Entity array format
   */
  private convertParametersToEntities(parameters: Record<string, any>): Entity[] {
    const entityArray: Entity[] = [];

    for (const [type, value] of Object.entries(parameters)) {
      if (value !== undefined && value !== null) {
        entityArray.push({
          type,
          value: String(value),
          confidence: 0.8 // Default confidence for LLM-extracted entities
        });
      }
    }

    return entityArray;
  }

  /**
   * Get confidence level from numeric confidence
   */
  private getConfidenceLevel(confidence: number): ConfidenceLevel {
    if (confidence >= 0.9) return 'very_high';
    if (confidence >= 0.7) return 'high';
    if (confidence >= 0.5) return 'medium';
    if (confidence >= 0.3) return 'low';
    return 'very_low';
  }

  /**
   * Check if an intent is valid according to the Intent type
   */
  private isValidIntent(intent: string): boolean {
    const validIntents = [
      'create_project', 'list_projects', 'open_project', 'update_project', 'archive_project',
      'create_task', 'list_tasks', 'run_task', 'check_status',
      'decompose_task', 'decompose_project', 'search_files', 'search_content',
      'refine_task', 'assign_task', 'get_help', 'parse_prd', 'parse_tasks',
      'import_artifact', 'unrecognized_intent', 'clarification_needed', 'unknown'
    ];
    return validIntents.includes(intent);
  }

  /**
   * Get cached result if available and not expired
   */
  private getCachedResult(text: string): RecognizedIntent | null {
    const cacheKey = this.getCacheKey(text);
    const entry = this.cache.get(cacheKey);

    if (entry && entry.expiresAt > new Date()) {
      return entry.response;
    }

    // Remove expired entry
    if (entry) {
      this.cache.delete(cacheKey);
    }

    return null;
  }

  /**
   * Cache recognition result
   */
  private cacheResult(text: string, result: RecognizedIntent): void {
    const cacheKey = this.getCacheKey(text);
    const expiresAt = new Date(Date.now() + this.config.cacheTTL * 1000);

    this.cache.set(cacheKey, {
      response: result,
      timestamp: new Date(),
      expiresAt
    });

    // Clean up expired entries periodically
    if (this.cache.size > 100) {
      this.cleanupExpiredCache();
    }
  }

  /**
   * Generate cache key for text
   */
  private getCacheKey(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = new Date();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    logger.debug({ removedCount, remainingCount: this.cache.size }, 'Cleaned up expired cache entries');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LLMFallbackConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info({ config: this.config }, 'LLM Fallback configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): LLMFallbackConfig {
    return { ...this.config };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('LLM Fallback cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    expiredEntries: number;
  } {
    const now = new Date();
    let expiredCount = 0;

    for (const entry of this.cache.values()) {
      if (entry.expiresAt <= now) {
        expiredCount++;
      }
    }

    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses for accurate calculation
      expiredEntries: expiredCount
    };
  }
}

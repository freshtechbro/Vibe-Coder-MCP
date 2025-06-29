/**
 * LLM Prompt Optimization System
 * Reduces JSON errors at the source by optimizing prompts for better JSON generation
 */

import logger from '../logger.js';

export interface PromptOptimizationConfig {
  enableJsonOptimization: boolean;
  includeSchemaHints: boolean;
  useErrorPatternLearning: boolean;
  maxPromptLength: number;
}

export interface JsonPromptTemplate {
  systemPromptEnhancement: string;
  userPromptEnhancement: string;
  outputFormatInstructions: string;
  errorPreventionRules: string[];
}

export interface PromptOptimizationResult {
  optimizedSystemPrompt: string;
  optimizedUserPrompt: string;
  optimizationApplied: string[];
  confidenceScore: number;
}

export interface ErrorPattern {
  pattern: string;
  frequency: number;
  lastSeen: Date;
  preventionRule: string;
}

/**
 * Core prompt optimization service for reducing JSON generation errors
 */
export class PromptOptimizer {
  private static instance: PromptOptimizer;
  private config: PromptOptimizationConfig;
  private errorPatterns: Map<string, ErrorPattern> = new Map();
  private promptSuccessRates: Map<string, { successes: number; total: number }> = new Map();

  private constructor(config: PromptOptimizationConfig) {
    this.config = config;
    this.loadErrorPatterns();
  }

  public static getInstance(config?: PromptOptimizationConfig): PromptOptimizer {
    if (!PromptOptimizer.instance) {
      const defaultConfig: PromptOptimizationConfig = {
        enableJsonOptimization: true,
        includeSchemaHints: true,
        useErrorPatternLearning: true,
        maxPromptLength: 4000
      };
      PromptOptimizer.instance = new PromptOptimizer(config || defaultConfig);
    }
    return PromptOptimizer.instance;
  }

  /**
   * Reset the singleton instance (for testing purposes)
   */
  public static resetInstance(): void {
    PromptOptimizer.instance = undefined as unknown as PromptOptimizer;
  }

  /**
   * Main optimization method - enhances prompts for better JSON generation
   */
  public optimizeForJsonGeneration(
    systemPrompt: string,
    userPrompt: string,
    taskName: string,
    expectedSchema?: object
  ): PromptOptimizationResult {
    if (!this.config.enableJsonOptimization) {
      return {
        optimizedSystemPrompt: systemPrompt,
        optimizedUserPrompt: userPrompt,
        optimizationApplied: [],
        confidenceScore: 1.0
      };
    }

    const optimizations: string[] = [];
    let optimizedSystem = systemPrompt;
    let optimizedUser = userPrompt;

    // Apply JSON-specific optimizations
    const jsonTemplate = this.getJsonPromptTemplate(taskName);

    // Enhance system prompt
    optimizedSystem = this.enhanceSystemPrompt(optimizedSystem, jsonTemplate);
    optimizations.push('json-system-enhancement');

    // Enhance user prompt
    optimizedUser = this.enhanceUserPrompt(optimizedUser, jsonTemplate, expectedSchema);
    optimizations.push('json-user-enhancement');

    // Apply error prevention rules
    const errorPreventionRules = this.getErrorPreventionRules(taskName);
    if (errorPreventionRules.length > 0) {
      optimizedSystem += '\n\n' + errorPreventionRules.join('\n');
      optimizations.push('error-prevention-rules');
    }

    // Apply schema hints if available
    if (this.config.includeSchemaHints && expectedSchema) {
      const schemaHints = this.generateSchemaHints(expectedSchema);
      optimizedUser += '\n\n' + schemaHints;
      optimizations.push('schema-hints');
    }

    // Calculate confidence score based on historical success rates
    const confidenceScore = this.calculateConfidenceScore(taskName, optimizations);

    logger.debug({
      taskName,
      optimizations,
      confidenceScore,
      originalSystemLength: systemPrompt.length,
      optimizedSystemLength: optimizedSystem.length,
      originalUserLength: userPrompt.length,
      optimizedUserLength: optimizedUser.length
    }, 'Prompt optimization completed');

    return {
      optimizedSystemPrompt: optimizedSystem,
      optimizedUserPrompt: optimizedUser,
      optimizationApplied: optimizations,
      confidenceScore
    };
  }

  /**
   * Get JSON-specific prompt template for a task
   */
  private getJsonPromptTemplate(taskName: string): JsonPromptTemplate {
    const baseTemplate: JsonPromptTemplate = {
      systemPromptEnhancement: `
CRITICAL JSON OUTPUT REQUIREMENTS:
- You MUST respond with valid, parseable JSON only
- Do NOT include markdown code blocks, backticks, or any formatting
- Do NOT add explanatory text before or after the JSON
- Start your response with { and end with }
- Ensure all strings are properly quoted with double quotes
- Ensure all object keys are strings in double quotes
- Do NOT use trailing commas
- Do NOT use single quotes
- Escape special characters properly (\\n, \\t, \\", \\\\)`,

      userPromptEnhancement: `
OUTPUT FORMAT: Respond with a single, valid JSON object. No additional text, formatting, or explanations.`,

      outputFormatInstructions: `
Your response must be a single JSON object that can be parsed by JSON.parse() without any modifications.`,

      errorPreventionRules: [
        'Never use single quotes - always use double quotes for strings and keys',
        'Never include trailing commas after the last property',
        'Always escape special characters in strings (\\n, \\t, \\", \\\\)',
        'Never include comments in JSON output',
        'Ensure all brackets and braces are properly matched',
        'Use null instead of undefined for missing values'
      ]
    };

    // Task-specific customizations
    if (taskName.includes('module_selection') || taskName.includes('yaml')) {
      baseTemplate.errorPreventionRules.push(
        'For large numbers (>15 digits), use strings to prevent precision loss',
        'Ensure nested objects have proper comma separation',
        'Validate that all required schema fields are included'
      );
    }

    return baseTemplate;
  }

  /**
   * Enhance system prompt with JSON optimization
   */
  private enhanceSystemPrompt(systemPrompt: string, template: JsonPromptTemplate): string {
    // Insert JSON requirements at the beginning for maximum visibility
    return template.systemPromptEnhancement + '\n\n' + systemPrompt + '\n\n' + template.outputFormatInstructions;
  }

  /**
   * Enhance user prompt with JSON optimization
   */
  private enhanceUserPrompt(userPrompt: string, template: JsonPromptTemplate, _schema?: object): string {
    let enhanced = userPrompt;

    // Always add output format instructions for JSON tasks
    enhanced += '\n\n' + template.userPromptEnhancement;

    // Add specific format reminder
    enhanced += '\n\nIMPORTANT: Your entire response must be a single, valid JSON object with no additional text.';

    return enhanced;
  }

  /**
   * Generate schema hints from expected schema
   */
  private generateSchemaHints(schema: object): string {
    try {
      const schemaStr = JSON.stringify(schema, null, 2);
      return `EXPECTED JSON STRUCTURE EXAMPLE:\n${schemaStr}\n\nEnsure your response matches this structure exactly.`;
    } catch (error) {
      logger.warn({ error }, 'Failed to generate schema hints');
      return '';
    }
  }

  /**
   * Get error prevention rules based on learned patterns
   */
  private getErrorPreventionRules(taskName: string): string[] {
    const rules: string[] = [];

    // Add rules based on error patterns
    for (const [, errorData] of this.errorPatterns) {
      if (errorData.frequency > 1) { // Include errors that occur more than once
        rules.push(`AVOID: ${errorData.preventionRule}`);
      }
    }

    // Add task-specific rules
    if (taskName.includes('module_selection') || taskName.includes('yaml')) {
      rules.push('AVOID: Using large numbers without string conversion');
      rules.push('AVOID: Missing commas between nested object properties');
      rules.push('AVOID: Omitting required schema fields');
    }

    return rules;
  }

  /**
   * Calculate confidence score based on historical success rates
   */
  private calculateConfidenceScore(taskName: string, optimizations: string[]): number {
    const baseScore = 0.7; // Base confidence for optimized prompts
    const optimizationBonus = optimizations.length * 0.05; // Bonus for each optimization

    // Historical success rate bonus
    const successData = this.promptSuccessRates.get(taskName);
    const historicalBonus = successData
      ? (successData.successes / successData.total) * 0.2
      : 0;

    return Math.min(1.0, baseScore + optimizationBonus + historicalBonus);
  }

  /**
   * Record parsing success/failure for learning
   */
  public recordParsingResult(taskName: string, success: boolean, error?: string): void {
    if (!this.config.useErrorPatternLearning) return;

    // Update success rates
    const successData = this.promptSuccessRates.get(taskName) || { successes: 0, total: 0 };
    successData.total++;
    if (success) {
      successData.successes++;
    }
    this.promptSuccessRates.set(taskName, successData);

    // Learn from errors
    if (!success && error) {
      this.learnFromError(error);
    }

    logger.debug({
      taskName,
      success,
      successRate: successData.successes / successData.total,
      totalAttempts: successData.total
    }, 'Recorded parsing result for prompt optimization learning');
  }

  /**
   * Learn from parsing errors to improve future prompts
   */
  private learnFromError(error: string): void {
    const patterns = this.extractErrorPatterns(error);

    for (const pattern of patterns) {
      const existing = this.errorPatterns.get(pattern.pattern) || {
        pattern: pattern.pattern,
        frequency: 0,
        lastSeen: new Date(),
        preventionRule: pattern.preventionRule
      };

      existing.frequency++;
      existing.lastSeen = new Date();
      this.errorPatterns.set(pattern.pattern, existing);
    }
  }

  /**
   * Extract error patterns from error messages
   */
  private extractErrorPatterns(error: string): Array<{ pattern: string; preventionRule: string }> {
    const patterns: Array<{ pattern: string; preventionRule: string }> = [];

    if (error.includes('position 2572') || error.includes('missing comma')) {
      patterns.push({
        pattern: 'missing_comma',
        preventionRule: 'Always include commas between object properties'
      });
    }

    if (error.includes('control character') || error.includes('position 1210')) {
      patterns.push({
        pattern: 'control_character',
        preventionRule: 'Escape control characters in strings (\\n, \\t, etc.)'
      });
    }

    if (error.includes('trailing comma')) {
      patterns.push({
        pattern: 'trailing_comma',
        preventionRule: 'Never include trailing commas after the last property'
      });
    }

    if (error.includes('single quote') || error.includes("'")) {
      patterns.push({
        pattern: 'single_quotes',
        preventionRule: 'Always use double quotes, never single quotes'
      });
    }

    return patterns;
  }

  /**
   * Load error patterns from persistent storage (placeholder for future implementation)
   */
  private loadErrorPatterns(): void {
    // TODO: Implement persistent storage for error patterns
    // For now, start with empty patterns that will be learned during runtime
    logger.debug('Error patterns loaded (currently empty - will be learned during runtime)');
  }

  /**
   * Get optimization statistics
   */
  public getOptimizationStats(): {
    totalTasks: number;
    averageSuccessRate: number;
    errorPatterns: number;
    topErrors: Array<{ pattern: string; frequency: number }>;
  } {
    const totalTasks = this.promptSuccessRates.size;
    const averageSuccessRate = Array.from(this.promptSuccessRates.values())
      .reduce((sum, data) => sum + (data.successes / data.total), 0) / totalTasks || 0;

    const topErrors = Array.from(this.errorPatterns.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5)
      .map(error => ({ pattern: error.pattern, frequency: error.frequency }));

    return {
      totalTasks,
      averageSuccessRate,
      errorPatterns: this.errorPatterns.size,
      topErrors
    };
  }
}

/**
 * Convenience function to get prompt optimizer instance
 */
export function getPromptOptimizer(config?: PromptOptimizationConfig): PromptOptimizer {
  return PromptOptimizer.getInstance(config);
}

/**
 * Convenience function to optimize prompts for JSON generation
 */
export function optimizeJsonPrompts(
  systemPrompt: string,
  userPrompt: string,
  taskName: string,
  expectedSchema?: object
): PromptOptimizationResult {
  const optimizer = getPromptOptimizer();
  return optimizer.optimizeForJsonGeneration(systemPrompt, userPrompt, taskName, expectedSchema);
}

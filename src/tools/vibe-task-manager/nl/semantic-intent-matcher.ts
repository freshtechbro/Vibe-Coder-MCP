/**
 * Semantic Intent Matcher
 *
 * Advanced intent matching using semantic analysis and context awareness
 * for improved natural language understanding in the Vibe Task Manager.
 */

import { Intent, RecognizedIntent, Entity } from '../types/nl.js';
import logger from '../../../logger.js';

/**
 * Semantic matching configuration
 */
export interface SemanticMatchConfig {
  /** Minimum confidence threshold for semantic matches */
  minConfidence: number;
  /** Enable context-aware matching */
  useContext: boolean;
  /** Enable synonym expansion */
  useSynonyms: boolean;
  /** Enable entity relationship analysis */
  useEntityRelations: boolean;
}

/**
 * Semantic match result
 */
export interface SemanticMatch {
  intent: Intent;
  confidence: number;
  semanticScore: number;
  contextScore: number;
  entityScore: number;
  reasoning: string[];
}

/**
 * Semantic Intent Matcher
 * Provides advanced intent matching using semantic analysis
 */
export class SemanticIntentMatcher {
  private config: SemanticMatchConfig;
  private synonymMap: Map<string, string[]> = new Map();
  private intentKeywords: Map<Intent, string[]> = new Map();
  private entityPatterns: Map<string, RegExp[]> = new Map();

  constructor(config: Partial<SemanticMatchConfig> = {}) {
    this.config = {
      minConfidence: 0.6,
      useContext: true,
      useSynonyms: true,
      useEntityRelations: true,
      ...config
    };

    this.initializeMaps();
  }

  /**
   * Perform semantic intent matching
   */
  async matchIntent(
    text: string,
    context?: Record<string, any>,
    existingEntities?: Entity[]
  ): Promise<SemanticMatch[]> {
    try {
      logger.debug({ text: text.substring(0, 100) }, 'Starting semantic intent matching');

      const normalizedText = this.normalizeText(text);
      const matches: SemanticMatch[] = [];

      // Analyze each potential intent
      for (const intent of this.getSupportedIntents()) {
        const match = await this.analyzeIntentMatch(intent, normalizedText, context, existingEntities);

        if (match.confidence >= this.config.minConfidence) {
          matches.push(match);
        }
      }

      // Sort by confidence
      matches.sort((a, b) => b.confidence - a.confidence);

      logger.debug({
        matchCount: matches.length,
        topIntent: matches[0]?.intent,
        topConfidence: matches[0]?.confidence
      }, 'Semantic matching completed');

      return matches;

    } catch (error) {
      logger.error({ err: error, text }, 'Semantic intent matching failed');
      return [];
    }
  }

  /**
   * Analyze intent match for a specific intent
   */
  private async analyzeIntentMatch(
    intent: Intent,
    text: string,
    context?: Record<string, any>,
    existingEntities?: Entity[]
  ): Promise<SemanticMatch> {
    const reasoning: string[] = [];

    // Calculate semantic score
    const semanticScore = this.calculateSemanticScore(intent, text, reasoning);

    // Calculate context score
    const contextScore = this.config.useContext
      ? this.calculateContextScore(intent, text, context, reasoning)
      : 0;

    // Calculate entity score
    const entityScore = this.config.useEntityRelations
      ? this.calculateEntityScore(intent, text, existingEntities, reasoning)
      : 0;

    // Combine scores with weights
    const confidence = this.combineScores(semanticScore, contextScore, entityScore);

    return {
      intent,
      confidence,
      semanticScore,
      contextScore,
      entityScore,
      reasoning
    };
  }

  /**
   * Calculate semantic similarity score
   */
  private calculateSemanticScore(intent: Intent, text: string, reasoning: string[]): number {
    const keywords = this.intentKeywords.get(intent) || [];
    let score = 0;
    let matches = 0;

    // Direct keyword matching
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 0.8;
        matches++;
        reasoning.push(`Direct keyword match: "${keyword}"`);
      }
    }

    // Synonym matching
    if (this.config.useSynonyms) {
      for (const keyword of keywords) {
        const synonyms = this.synonymMap.get(keyword) || [];
        for (const synonym of synonyms) {
          if (text.includes(synonym.toLowerCase())) {
            score += 0.6;
            matches++;
            reasoning.push(`Synonym match: "${synonym}" for "${keyword}"`);
          }
        }
      }
    }

    // Normalize by keyword count
    const normalizedScore = keywords.length > 0 ? score / keywords.length : 0;

    if (matches > 0) {
      reasoning.push(`Semantic score: ${normalizedScore.toFixed(3)} (${matches} matches)`);
    }

    return Math.min(normalizedScore, 1.0);
  }

  /**
   * Calculate context-aware score
   */
  private calculateContextScore(
    intent: Intent,
    text: string,
    context?: Record<string, any>,
    reasoning: string[] = []
  ): number {
    if (!context) return 0;

    let score = 0;

    // Context-specific scoring rules
    switch (intent) {
      case 'decompose_task':
      case 'decompose_project':
        if (context.currentTask || context.currentProject) {
          score += 0.3;
          reasoning.push('Context: Current task/project available for decomposition');
        }
        break;

      case 'search_files':
      case 'search_content':
        if (context.currentProject) {
          score += 0.2;
          reasoning.push('Context: Current project available for search');
        }
        break;

      case 'create_task':
        if (context.currentProject) {
          score += 0.4;
          reasoning.push('Context: Current project available for task creation');
        }
        break;

      case 'list_tasks':
        if (context.currentProject || context.currentTask) {
          score += 0.2;
          reasoning.push('Context: Current project/task context for listing');
        }
        break;
    }

    // Conversation history context
    if (context.conversationHistory && Array.isArray(context.conversationHistory)) {
      const recentIntents = context.conversationHistory
        .slice(-3)
        .map((item: any) => item.intent)
        .filter(Boolean);

      if (this.isRelatedIntent(intent, recentIntents)) {
        score += 0.2;
        reasoning.push('Context: Related to recent conversation');
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate entity-based score
   */
  private calculateEntityScore(
    intent: Intent,
    text: string,
    existingEntities?: Entity[],
    reasoning: string[] = []
  ): number {
    if (!existingEntities || existingEntities.length === 0) return 0;

    let score = 0;
    const relevantEntities = this.getRelevantEntities(intent);

    for (const entity of existingEntities) {
      if (relevantEntities.includes(entity.type)) {
        score += 0.3;
        reasoning.push(`Entity match: ${entity.type} = "${entity.value}"`);
      }
    }

    // Check for entity patterns in text
    for (const [entityType, patterns] of this.entityPatterns.entries()) {
      if (relevantEntities.includes(entityType)) {
        for (const pattern of patterns) {
          if (pattern.test(text)) {
            score += 0.2;
            reasoning.push(`Entity pattern match: ${entityType}`);
          }
        }
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Combine scores with appropriate weights
   */
  private combineScores(semanticScore: number, contextScore: number, entityScore: number): number {
    const weights = {
      semantic: 0.6,
      context: 0.25,
      entity: 0.15
    };

    return (
      semanticScore * weights.semantic +
      contextScore * weights.context +
      entityScore * weights.entity
    );
  }

  /**
   * Initialize keyword and synonym maps
   */
  private initializeMaps(): void {
    // Initialize intent keywords
    this.intentKeywords = new Map([
      ['decompose_task', ['decompose', 'break down', 'split', 'divide', 'breakdown', 'task']],
      ['decompose_project', ['decompose', 'break down', 'split', 'divide', 'breakdown', 'project']],
      ['search_files', ['find', 'search', 'locate', 'files', 'file']],
      ['search_content', ['find', 'search', 'locate', 'content', 'code', 'text']],
      ['create_task', ['create', 'add', 'new', 'make', 'task']],
      ['create_project', ['create', 'add', 'new', 'make', 'project']],
      ['list_tasks', ['list', 'show', 'display', 'tasks']],
      ['list_projects', ['list', 'show', 'display', 'projects']],
      ['run_task', ['run', 'execute', 'start', 'begin', 'task']],
      ['check_status', ['status', 'check', 'progress', 'state']]
    ]);

    // Initialize synonym map
    this.synonymMap = new Map([
      ['decompose', ['break down', 'split up', 'divide', 'separate', 'breakdown']],
      ['search', ['find', 'locate', 'look for', 'seek']],
      ['create', ['add', 'make', 'new', 'build', 'generate']],
      ['list', ['show', 'display', 'view', 'get']],
      ['run', ['execute', 'start', 'begin', 'launch']],
      ['task', ['todo', 'item', 'work', 'job']],
      ['project', ['app', 'application', 'system', 'codebase']],
      ['files', ['documents', 'code', 'scripts']],
      ['content', ['text', 'code', 'data', 'information']]
    ]);

    // Initialize entity patterns
    this.entityPatterns = new Map([
      ['taskId', [/\b[Tt]\d+\b/, /\btask[-_]?\d+\b/i, /\b[A-Z]+-\d+\b/]],
      ['projectId', [/\bPID[-_]?\w+[-_]?\d+\b/i, /\bproject[-_]?\d+\b/i]],
      ['fileName', [/\w+\.\w+/, /["']([^"']+\.\w+)["']/]],
      ['searchPattern', [/["']([^"']+)["']/, /\b\w+\*?\b/]]
    ]);
  }

  /**
   * Get supported intents
   */
  private getSupportedIntents(): Intent[] {
    return Array.from(this.intentKeywords.keys());
  }

  /**
   * Get relevant entities for an intent
   */
  private getRelevantEntities(intent: Intent): string[] {
    const entityMap: Record<Intent, string[]> = {
      'decompose_task': ['taskId'],
      'decompose_project': ['projectId'],
      'search_files': ['fileName', 'searchPattern'],
      'search_content': ['searchPattern'],
      'create_task': ['projectId'],
      'create_project': [],
      'update_project': ['projectId'],
      'list_tasks': ['projectId'],
      'list_projects': [],
      'run_task': ['taskId'],
      'check_status': ['taskId', 'projectId'],
      'unknown': [],
      'open_project': ['projectId'],
      'refine_task': ['taskId'],
      'assign_task': ['taskId', 'assignee'],
      'get_help': [],
      'parse_prd': ['projectName', 'filePath'],
      'parse_tasks': ['projectName', 'filePath'],
      'import_artifact': ['artifactType', 'projectName', 'filePath'],
      'unrecognized_intent': [],
      'clarification_needed': []
    };

    return entityMap[intent] || [];
  }

  /**
   * Check if intents are related
   */
  private isRelatedIntent(intent: Intent, recentIntents: Intent[]): boolean {
    const relatedGroups = [
      ['decompose_task', 'decompose_project', 'create_task'],
      ['search_files', 'search_content'],
      ['list_tasks', 'list_projects', 'check_status'],
      ['create_task', 'create_project', 'run_task']
    ];

    for (const group of relatedGroups) {
      if (group.includes(intent) && recentIntents.some(recent => group.includes(recent))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Normalize text for analysis
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

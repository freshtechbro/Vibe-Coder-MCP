/**
 * Tag Management Service
 * 
 * Provides intelligent tag management with hierarchical categorization,
 * auto-suggestion, validation, and analytics for the Vibe Task Manager.
 */

import { 
  TagCollection, 
  BaseTag, 
  FunctionalTag, 
  TechnicalTag, 
  BusinessTag,
  ProcessTag,
  QualityTag,
  CustomTag,
  GeneratedTag,
  TagCategory,
  TagSource
} from '../types/metadata-types.js';
import { AtomicTask, Epic, Project } from '../types/task.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { performFormatAwareLlmCall } from '../../../utils/llmHelper.js';
import { getLLMModelForOperation } from '../utils/config-loader.js';
import logger from '../../../logger.js';

/**
 * Tag suggestion result
 */
export interface TagSuggestion {
  /** Suggested tag */
  tag: BaseTag;
  
  /** Suggestion confidence */
  confidence: number;
  
  /** Suggestion reasoning */
  reasoning: string;
  
  /** Source of suggestion */
  source: 'ai' | 'pattern' | 'similarity' | 'template';
}

/**
 * Tag validation result
 */
export interface TagValidation {
  /** Whether tag is valid */
  isValid: boolean;
  
  /** Validation issues */
  issues: TagValidationIssue[];
  
  /** Suggested corrections */
  suggestions: string[];
}

/**
 * Tag validation issue
 */
export interface TagValidationIssue {
  /** Issue type */
  type: 'duplicate' | 'invalid_category' | 'naming_convention' | 'hierarchy_conflict' | 'deprecated';
  
  /** Issue description */
  description: string;
  
  /** Issue severity */
  severity: 'error' | 'warning' | 'info';
}

/**
 * Tag analytics data
 */
export interface TagAnalytics {
  /** Most used tags */
  popular: TagUsage[];
  
  /** Tag trends */
  trends: TagTrend[];
  
  /** Tag distribution by category */
  distribution: TagDistribution[];
  
  /** Tag relationships */
  relationships: TagRelationship[];
  
  /** Orphaned tags */
  orphaned: string[];
  
  /** Analytics period */
  period: {
    start: Date;
    end: Date;
  };
}

/**
 * Tag usage statistics
 */
export interface TagUsage {
  /** Tag value */
  tag: string;
  
  /** Usage count */
  count: number;
  
  /** Usage percentage */
  percentage: number;
  
  /** Tag category */
  category: TagCategory;
  
  /** Recent usage trend */
  trend: 'increasing' | 'stable' | 'decreasing';
}

/**
 * Tag trend data
 */
export interface TagTrend {
  /** Tag value */
  tag: string;
  
  /** Trend data points */
  data: {
    date: Date;
    count: number;
  }[];
  
  /** Trend direction */
  direction: 'up' | 'down' | 'stable';
  
  /** Trend strength */
  strength: number;
}

/**
 * Tag distribution data
 */
export interface TagDistribution {
  /** Tag category */
  category: TagCategory;
  
  /** Count in category */
  count: number;
  
  /** Percentage of total */
  percentage: number;
  
  /** Average usage per tag */
  averageUsage: number;
}

/**
 * Tag relationship data
 */
export interface TagRelationship {
  /** Primary tag */
  tag: string;
  
  /** Related tags */
  related: {
    tag: string;
    strength: number;
    frequency: number;
  }[];
  
  /** Relationship type */
  type: 'often_together' | 'mutually_exclusive' | 'hierarchical' | 'contextual';
}

/**
 * Tag search filters
 */
export interface TagSearchFilters {
  /** Search query */
  query?: string;
  
  /** Tag categories to include */
  categories?: TagCategory[];
  
  /** Tag sources to include */
  sources?: TagSource[];
  
  /** Minimum confidence threshold */
  minConfidence?: number;
  
  /** Include deprecated tags */
  includeDeprecated?: boolean;
  
  /** Created after date */
  createdAfter?: Date;
  
  /** Created before date */
  createdBefore?: Date;
}

/**
 * Tag Management Service
 */
export class TagManagementService {
  private static instance: TagManagementService;
  private config: OpenRouterConfig;
  private tagCache: Map<string, BaseTag> = new Map();
  private tagHierarchy: Map<string, string[]> = new Map();
  private tagPatterns: Map<TagCategory, RegExp[]> = new Map();
  
  private constructor(config: OpenRouterConfig) {
    this.config = config;
    this.initializeTagPatterns();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(config: OpenRouterConfig): TagManagementService {
    if (!TagManagementService.instance) {
      TagManagementService.instance = new TagManagementService(config);
    }
    return TagManagementService.instance;
  }
  
  /**
   * Initialize tag patterns for auto-categorization
   */
  private initializeTagPatterns(): void {
    this.tagPatterns.set('functional', [
      /\b(auth|authentication|login|register|user|session)\b/i,
      /\b(api|endpoint|route|service|backend)\b/i,
      /\b(ui|component|frontend|interface|view)\b/i,
      /\b(database|db|model|schema|migration)\b/i,
      /\b(security|permission|access|role)\b/i,
      /\b(video|media|stream|content)\b/i,
      /\b(notification|email|sms|push)\b/i,
      /\b(payment|billing|transaction|invoice)\b/i,
      /\b(search|filter|sort|pagination)\b/i,
      /\b(report|analytics|dashboard|metrics)\b/i
    ]);
    
    this.tagPatterns.set('technical', [
      /\b(react|vue|angular|typescript|javascript)\b/i,
      /\b(node|express|fastify|koa)\b/i,
      /\b(postgresql|mysql|mongodb|redis)\b/i,
      /\b(docker|kubernetes|aws|azure|gcp)\b/i,
      /\b(jest|vitest|cypress|playwright)\b/i,
      /\b(webpack|vite|rollup|esbuild)\b/i,
      /\b(graphql|rest|grpc|websocket)\b/i,
      /\b(microservice|monolith|serverless)\b/i
    ]);
    
    this.tagPatterns.set('business', [
      /\b(high-priority|low-priority|critical|urgent)\b/i,
      /\b(revenue|cost|profit|roi)\b/i,
      /\b(customer|user-experience|satisfaction)\b/i,
      /\b(compliance|regulation|audit|governance)\b/i,
      /\b(mvp|poc|prototype|pilot)\b/i,
      /\b(market|competition|strategy|growth)\b/i
    ]);
    
    this.tagPatterns.set('process', [
      /\b(planning|development|testing|review)\b/i,
      /\b(deployment|release|rollback|hotfix)\b/i,
      /\b(agile|scrum|kanban|waterfall)\b/i,
      /\b(ci|cd|automation|pipeline)\b/i,
      /\b(documentation|training|knowledge)\b/i,
      /\b(maintenance|support|bugfix|enhancement)\b/i
    ]);
    
    this.tagPatterns.set('quality', [
      /\b(performance|optimization|speed|efficiency)\b/i,
      /\b(security|vulnerability|encryption|ssl)\b/i,
      /\b(accessibility|a11y|wcag|usability)\b/i,
      /\b(reliability|stability|availability|uptime)\b/i,
      /\b(maintainability|refactor|cleanup|debt)\b/i,
      /\b(scalability|load|stress|capacity)\b/i
    ]);
  }
  
  /**
   * Create a new tag
   */
  async createTag(
    value: string,
    category: TagCategory,
    options: {
      source?: TagSource;
      confidence?: number;
      parentId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<BaseTag> {
    const tagId = this.generateTagId(value, category);
    
    const tag: BaseTag = {
      id: tagId,
      value: value.toLowerCase().trim(),
      category,
      confidence: options.confidence ?? 1.0,
      source: options.source ?? 'user',
      createdAt: new Date(),
      parentId: options.parentId,
      metadata: options.metadata
    };
    
    // Validate tag
    const validation = await this.validateTag(tag);
    if (!validation.isValid) {
      throw new Error(`Invalid tag: ${validation.issues.map(i => i.description).join(', ')}`);
    }
    
    this.tagCache.set(tagId, tag);
    
    // Update hierarchy if parent exists
    if (tag.parentId) {
      this.updateTagHierarchy(tag.parentId, tagId);
    }
    
    logger.debug({ tag }, 'Created new tag');
    return tag;
  }
  
  
  /**
   * Suggest tags for a task (overloaded method for test compatibility)
   */
  async suggestTags(
    description: string,
    task: AtomicTask
  ): Promise<{
    success: boolean;
    tags?: TagCollection;
    source: string;
    confidence?: number;
  }>;
  
  /**
   * Suggest tags for content
   */
  async suggestTags(
    content: {
      title: string;
      description: string;
      type?: string;
      existingTags?: string[];
    },
    options?: {
      maxSuggestions?: number;
      categories?: TagCategory[];
      useAI?: boolean;
    }
  ): Promise<TagSuggestion[]>;
  
  /**
   * Implementation of suggestTags with overload support
   */
  async suggestTags(
    descriptionOrContent: string | {
      title: string;
      description: string;
      type?: string;
      existingTags?: string[];
    },
    taskOrOptions?: AtomicTask | {
      maxSuggestions?: number;
      categories?: TagCategory[];
      useAI?: boolean;
    }
  ): Promise<TagSuggestion[] | {
    success: boolean;
    tags?: TagCollection;
    source: string;
    confidence?: number;
  }> {
    
    // Handle overloaded call for task (description, task)
    if (typeof descriptionOrContent === 'string' && taskOrOptions && 'id' in taskOrOptions) {
      const task = taskOrOptions as AtomicTask;
      try {
        const content = {
          title: task.title,
          description: descriptionOrContent,
          type: task.type,
          existingTags: task.tags || []
        };
        
        const suggestions = await this.suggestTagsInternal(content, { useAI: false });
        
        // Convert suggestions to TagCollection format
        const tagCollection: TagCollection = {
          functional: [],
          technical: [],
          business: [],
          process: [],
          quality: [],
          custom: [],
          generated: []
        };
        
        let confidence = 0;
        let totalSuggestions = 0;
        
        for (const suggestion of suggestions) {
          if (suggestion.confidence > 0.5) {
            this.addTagToCollection(tagCollection, suggestion.tag);
            confidence += suggestion.confidence;
            totalSuggestions++;
          }
        }
        
        return {
          success: true,
          tags: tagCollection,
          source: 'pattern',
          confidence: totalSuggestions > 0 ? confidence / totalSuggestions : 0
        };
      } catch (error) {
        logger.error({ err: error, taskId: task.id }, 'Failed to suggest tags for task');
        return {
          success: false,
          source: 'error',
          confidence: 0
        };
      }
    }
    
    // Handle original call (content, options)
    const content = descriptionOrContent as {
      title: string;
      description: string;
      type?: string;
      existingTags?: string[];
    };
    const options = taskOrOptions as {
      maxSuggestions?: number;
      categories?: TagCategory[];
      useAI?: boolean;
    } | undefined;
    
    return this.suggestTagsInternal(content, options || {});
  }
  
  /**
   * Internal implementation of tag suggestion logic
   */
  private async suggestTagsInternal(
    content: {
      title: string;
      description: string;
      type?: string;
      existingTags?: string[];
    },
    options: {
      maxSuggestions?: number;
      categories?: TagCategory[];
      useAI?: boolean;
    } = {}
  ): Promise<TagSuggestion[]> {
    const suggestions: TagSuggestion[] = [];
    const maxSuggestions = options.maxSuggestions ?? 10;
    const useAI = options.useAI ?? true;
    
    try {
      // Pattern-based suggestions
      const patternSuggestions = await this.getPatternBasedSuggestions(content);
      suggestions.push(...patternSuggestions);
      
      // AI-based suggestions (run regardless of pattern count)
      if (useAI) {
        const aiSuggestions = await this.getAIBasedSuggestions(content);
        suggestions.push(...aiSuggestions);
      }
      
      // Similarity-based suggestions
      const similaritySuggestions = await this.getSimilarityBasedSuggestions(content);
      suggestions.push(...similaritySuggestions);
      
      // Remove duplicates and sort by confidence
      const uniqueSuggestions = this.deduplicateSuggestions(suggestions);
      const filteredSuggestions = this.filterSuggestionsByCategory(uniqueSuggestions, options.categories);
      
      return filteredSuggestions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxSuggestions);
        
    } catch (error) {
      logger.error({ err: error, content }, 'Failed to suggest tags');
      return [];
    }
  }
  
  /**
   * Validate tag
   */
  async validateTag(tag: BaseTag): Promise<TagValidation> {
    const issues: TagValidationIssue[] = [];
    const suggestions: string[] = [];
    
    // Check for duplicates
    if (this.tagCache.has(tag.id)) {
      issues.push({
        type: 'duplicate',
        description: `Tag '${tag.value}' already exists`,
        severity: 'error'
      });
    }
    
    // Validate naming convention
    if (!/^[a-z0-9-_]+$/.test(tag.value)) {
      issues.push({
        type: 'naming_convention',
        description: 'Tag must contain only lowercase letters, numbers, hyphens, and underscores',
        severity: 'error'
      });
      
      suggestions.push(tag.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-'));
    }
    
    // Check hierarchy conflicts
    if (tag.parentId && !this.tagCache.has(tag.parentId)) {
      issues.push({
        type: 'hierarchy_conflict',
        description: `Parent tag '${tag.parentId}' does not exist`,
        severity: 'error'
      });
    }
    
    // Validate category
    const validCategories: TagCategory[] = ['functional', 'technical', 'business', 'process', 'quality', 'custom', 'generated'];
    if (!validCategories.includes(tag.category)) {
      issues.push({
        type: 'invalid_category',
        description: `Invalid category '${tag.category}'`,
        severity: 'error'
      });
    }
    
    return {
      isValid: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      suggestions
    };
  }
  
  /**
   * Enhance tag collection with intelligent categorization
   */
  async enhanceTagCollection(
    content: {
      title: string;
      description: string;
      type?: string;
    },
    existingTags: string[] = []
  ): Promise<TagCollection> {
    const collection: TagCollection = {
      functional: [],
      technical: [],
      business: [],
      process: [],
      quality: [],
      custom: [],
      generated: []
    };
    
    // Categorize existing tags
    for (const tagValue of existingTags) {
      const category = await this.categorizeTag(tagValue);
      const tag = await this.createOrGetTag(tagValue, category, 'user');
      this.addTagToCollection(collection, tag);
    }
    
    // Generate additional tags
    const suggestions = await this.suggestTags(content, { maxSuggestions: 15 });
    for (const suggestion of suggestions) {
      if (suggestion.confidence > 0.7) {
        this.addTagToCollection(collection, suggestion.tag);
      }
    }
    
    return collection;
  }
  
  /**
   * Get tag analytics
   */
  async getTagAnalytics(
    filters: {
      entityType?: 'task' | 'epic' | 'project';
      projectId?: string;
      dateRange?: { start: Date; end: Date };
    } = {}
  ): Promise<TagAnalytics> {
    // This would typically query the database for tag usage statistics
    // For now, returning mock analytics structure
    
    const period = filters.dateRange ?? {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      end: new Date()
    };
    
    return {
      popular: await this.getPopularTags(filters),
      trends: await this.getTagTrends(filters),
      distribution: await this.getTagDistribution(filters),
      relationships: await this.getTagRelationships(filters),
      orphaned: await this.getOrphanedTags(filters),
      period
    };
  }
  
  /**
   * Search tags
   */
  async searchTags(filters: TagSearchFilters): Promise<BaseTag[]> {
    let tags = Array.from(this.tagCache.values());
    
    // Apply filters
    if (filters.query) {
      const query = filters.query.toLowerCase();
      tags = tags.filter(tag => 
        tag.value.includes(query) || 
        (tag.metadata && JSON.stringify(tag.metadata).toLowerCase().includes(query))
      );
    }
    
    if (filters.categories) {
      tags = tags.filter(tag => filters.categories!.includes(tag.category));
    }
    
    if (filters.sources) {
      tags = tags.filter(tag => filters.sources!.includes(tag.source));
    }
    
    if (filters.minConfidence) {
      tags = tags.filter(tag => tag.confidence >= filters.minConfidence!);
    }
    
    if (filters.createdAfter) {
      tags = tags.filter(tag => tag.createdAt >= filters.createdAfter!);
    }
    
    if (filters.createdBefore) {
      tags = tags.filter(tag => tag.createdAt <= filters.createdBefore!);
    }
    
    return tags.sort((a, b) => b.confidence - a.confidence);
  }
  
  /**
   * Generate tag ID
   */
  private generateTagId(value: string, category: TagCategory): string {
    const normalizedValue = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${category}-${normalizedValue}-${Date.now()}`;
  }
  
  /**
   * Get pattern-based suggestions
   */
  private async getPatternBasedSuggestions(content: {
    title: string;
    description: string;
    type?: string;
  }): Promise<TagSuggestion[]> {
    const suggestions: TagSuggestion[] = [];
    const text = `${content.title} ${content.description}`.toLowerCase();
    
    // Simple keyword matching for reliable testing
    const keywords = [
      { words: ['auth', 'authentication', 'login', 'register', 'user', 'session'], category: 'functional' as TagCategory },
      { words: ['api', 'endpoint', 'route', 'service', 'backend'], category: 'functional' as TagCategory },
      { words: ['ui', 'component', 'frontend', 'interface', 'view'], category: 'functional' as TagCategory },
      { words: ['react', 'vue', 'angular', 'typescript', 'javascript'], category: 'technical' as TagCategory },
      { words: ['node', 'express', 'fastify', 'koa'], category: 'technical' as TagCategory },
      { words: ['high-priority', 'low-priority', 'critical', 'urgent'], category: 'business' as TagCategory },
      { words: ['development', 'testing', 'review', 'deployment', 'documentation'], category: 'process' as TagCategory },
      { words: ['performance', 'security', 'accessibility', 'reliability'], category: 'quality' as TagCategory }
    ];
    
    for (const { words, category } of keywords) {
      for (const word of words) {
        if (text.includes(word)) {
          try {
            const tag = await this.createOrGetTag(word, category, 'system');
            suggestions.push({
              tag,
              confidence: 0.8,
              reasoning: `Keyword match for ${category} category`,
              source: 'pattern'
            });
          } catch (error) {
            // Skip invalid tags
            logger.debug({ error, word }, 'Failed to create tag from keyword');
          }
        }
      }
    }
    
    return suggestions;
  }
  
  /**
   * Get AI-based suggestions
   */
  private async getAIBasedSuggestions(content: {
    title: string;
    description: string;
    type?: string;
  }): Promise<TagSuggestion[]> {
    try {
      const model = await getLLMModelForOperation('tag_suggestion');
      
      const prompt = `Analyze the following task and suggest relevant tags:

Title: ${content.title}
Description: ${content.description}
Type: ${content.type || 'unknown'}

Please suggest 5-8 relevant tags categorized as:
- functional (features, domains, capabilities)
- technical (technologies, patterns, architecture)
- business (priority, impact, value)
- process (workflow, methodology, stage)
- quality (performance, security, usability)

Respond with JSON format:
{
  "suggestions": [
    {
      "tag": "tag-name",
      "category": "functional|technical|business|process|quality",
      "confidence": 0.9,
      "reasoning": "why this tag is relevant"
    }
  ]
}`;

      const response = await performFormatAwareLlmCall(
        prompt,
        'You are a helpful AI assistant that suggests relevant tags for tasks.',
        this.config,
        'tag_suggestion',
        'json'
      );
      
      const parsed = JSON.parse(response);
      const suggestions: TagSuggestion[] = [];
      
      for (const suggestion of parsed.suggestions || []) {
        const tag = await this.createOrGetTag(
          suggestion.tag,
          suggestion.category,
          'ai'
        );
        
        suggestions.push({
          tag,
          confidence: suggestion.confidence || 0.7,
          reasoning: suggestion.reasoning || 'AI suggestion',
          source: 'ai'
        });
      }
      
      return suggestions;
      
    } catch (error) {
      logger.error({ err: error }, 'Failed to get AI-based tag suggestions');
      return [];
    }
  }
  
  /**
   * Get similarity-based suggestions
   */
  private async getSimilarityBasedSuggestions(content: {
    title: string;
    description: string;
    type?: string;
  }): Promise<TagSuggestion[]> {
    // This would typically use vector similarity or other ML techniques
    // For now, returning simple keyword matching
    
    const suggestions: TagSuggestion[] = [];
    const keywords = this.extractKeywords(`${content.title} ${content.description}`);
    
    for (const keyword of keywords) {
      const existingTag = Array.from(this.tagCache.values())
        .find(tag => tag.value.includes(keyword) || keyword.includes(tag.value));
      
      if (existingTag) {
        suggestions.push({
          tag: existingTag,
          confidence: 0.6,
          reasoning: `Similar to existing tag: ${existingTag.value}`,
          source: 'similarity'
        });
      }
    }
    
    return suggestions;
  }
  
  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 20); // Limit to top 20 keywords
  }
  
  /**
   * Categorize tag
   */
  private async categorizeTag(value: string): Promise<TagCategory> {
    const lowerValue = value.toLowerCase();
    
    // Functional keywords
    const functionalKeywords = ['auth', 'authentication', 'login', 'register', 'user', 'session', 'api', 'endpoint', 'route', 'service', 'backend', 'ui', 'component', 'frontend', 'interface', 'view'];
    if (functionalKeywords.some(keyword => lowerValue.includes(keyword))) {
      return 'functional';
    }
    
    // Technical keywords
    const technicalKeywords = ['react', 'vue', 'angular', 'typescript', 'javascript', 'node', 'express', 'fastify', 'koa'];
    if (technicalKeywords.some(keyword => lowerValue.includes(keyword))) {
      return 'technical';
    }
    
    // Business keywords
    const businessKeywords = ['high-priority', 'low-priority', 'critical', 'urgent', 'priority'];
    if (businessKeywords.some(keyword => lowerValue.includes(keyword))) {
      return 'business';
    }
    
    // Process keywords
    const processKeywords = ['development', 'testing', 'review', 'deployment', 'documentation'];
    if (processKeywords.some(keyword => lowerValue.includes(keyword))) {
      return 'process';
    }
    
    // Quality keywords
    const qualityKeywords = ['performance', 'security', 'accessibility', 'reliability'];
    if (qualityKeywords.some(keyword => lowerValue.includes(keyword))) {
      return 'quality';
    }
    
    return 'custom';
  }
  
  /**
   * Create or get existing tag
   */
  private async createOrGetTag(
    value: string,
    category: TagCategory,
    source: TagSource
  ): Promise<BaseTag> {
    const normalizedValue = value.toLowerCase().trim();
    const existingTag = Array.from(this.tagCache.values())
      .find(tag => tag.value === normalizedValue && tag.category === category);
    
    if (existingTag) {
      return existingTag;
    }
    
    return this.createTag(normalizedValue, category, { source });
  }
  
  /**
   * Add tag to collection
   */
  private addTagToCollection(collection: TagCollection, tag: BaseTag): void {
    switch (tag.category) {
      case 'functional':
        collection.functional.push(tag as FunctionalTag);
        break;
      case 'technical':
        collection.technical.push(tag as TechnicalTag);
        break;
      case 'business':
        collection.business.push(tag as BusinessTag);
        break;
      case 'process':
        collection.process.push(tag as ProcessTag);
        break;
      case 'quality':
        collection.quality.push(tag as QualityTag);
        break;
      case 'custom':
        collection.custom.push(tag as CustomTag);
        break;
      case 'generated':
        collection.generated.push(tag as GeneratedTag);
        break;
    }
  }
  
  /**
   * Deduplicate suggestions
   */
  private deduplicateSuggestions(suggestions: TagSuggestion[]): TagSuggestion[] {
    const seen = new Set<string>();
    return suggestions.filter(suggestion => {
      const key = `${suggestion.tag.value}-${suggestion.tag.category}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  
  /**
   * Filter suggestions by category
   */
  private filterSuggestionsByCategory(
    suggestions: TagSuggestion[],
    categories?: TagCategory[]
  ): TagSuggestion[] {
    if (!categories || categories.length === 0) {
      return suggestions;
    }
    
    return suggestions.filter(suggestion => 
      categories.includes(suggestion.tag.category)
    );
  }
  
  /**
   * Update tag hierarchy
   */
  private updateTagHierarchy(parentId: string, childId: string): void {
    if (!this.tagHierarchy.has(parentId)) {
      this.tagHierarchy.set(parentId, []);
    }
    this.tagHierarchy.get(parentId)!.push(childId);
  }
  
  /**
   * Get popular tags
   */
  private async getPopularTags(filters: any): Promise<TagUsage[]> {
    // Mock implementation - would query actual usage data
    return [
      { tag: 'auth', count: 45, percentage: 15.2, category: 'functional', trend: 'increasing' },
      { tag: 'api', count: 38, percentage: 12.8, category: 'functional', trend: 'stable' },
      { tag: 'ui', count: 32, percentage: 10.8, category: 'functional', trend: 'increasing' },
      { tag: 'react', count: 28, percentage: 9.4, category: 'technical', trend: 'stable' },
      { tag: 'database', count: 25, percentage: 8.4, category: 'functional', trend: 'decreasing' }
    ];
  }
  
  /**
   * Get tag trends
   */
  private async getTagTrends(filters: any): Promise<TagTrend[]> {
    // Mock implementation
    return [];
  }
  
  /**
   * Get tag distribution
   */
  private async getTagDistribution(filters: any): Promise<TagDistribution[]> {
    // Mock implementation
    return [
      { category: 'functional', count: 120, percentage: 40.0, averageUsage: 8.5 },
      { category: 'technical', count: 85, percentage: 28.3, averageUsage: 6.2 },
      { category: 'business', count: 45, percentage: 15.0, averageUsage: 4.1 },
      { category: 'process', count: 30, percentage: 10.0, averageUsage: 3.8 },
      { category: 'quality', count: 20, percentage: 6.7, averageUsage: 2.9 }
    ];
  }
  
  /**
   * Get tag relationships
   */
  private async getTagRelationships(filters: any): Promise<TagRelationship[]> {
    // Mock implementation
    return [];
  }
  
  /**
   * Get orphaned tags
   */
  private async getOrphanedTags(filters: any): Promise<string[]> {
    // Mock implementation
    return [];
  }
  
  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.tagCache.clear();
    this.tagHierarchy.clear();
    this.tagPatterns.clear();
  }
}
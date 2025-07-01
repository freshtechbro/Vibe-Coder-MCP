/**
 * Metadata Service
 * 
 * Provides centralized metadata management with change tracking,
 * validation, versioning, and intelligent enrichment capabilities.
 */

import {
  BaseMetadata,
  TaskMetadata,
  EpicMetadata,
  ProjectMetadata,
  MetadataChange,
  MetadataValue,
  EntityLifecycle,
  ComplexityMetadata,
  PerformanceMetadata,
  QualityMetadata,
  TagCollection,
  CollaborationMetadata,
  IntegrationMetadata,
  ComplexityFactor,
  QualityGate,
  ScopeMetadata,
  ProgressMetadata,
  ResourceMetadata,
  ProjectClassification,
  BusinessMetadata,
  TechnicalMetadata,
  GovernanceMetadata
} from '../types/metadata-types.js';
import { AtomicTask, Epic, Project } from '../types/task.js';
import { TagManagementService } from './tag-management-service.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import logger from '../../../logger.js';

/**
 * Metadata enrichment options
 */
export interface MetadataEnrichmentOptions {
  /** Enable AI-powered enrichment */
  useAI?: boolean;
  
  /** Include complexity analysis */
  analyzeComplexity?: boolean;
  
  /** Include performance estimation */
  estimatePerformance?: boolean;
  
  /** Include quality assessment */
  assessQuality?: boolean;
  
  /** Generate enhanced tags */
  enhanceTags?: boolean;
  
  /** Update existing metadata */
  updateExisting?: boolean;
}

/**
 * Metadata validation result
 */
export interface MetadataValidationResult {
  /** Whether metadata is valid */
  isValid: boolean;
  
  /** Validation errors */
  errors: MetadataValidationError[];
  
  /** Validation warnings */
  warnings: MetadataValidationWarning[];
  
  /** Suggested improvements */
  suggestions: MetadataImprovement[];
}

/**
 * Metadata validation error
 */
export interface MetadataValidationError {
  /** Error field */
  field: string;
  
  /** Error message */
  message: string;
  
  /** Error severity */
  severity: 'error' | 'critical';
  
  /** Suggested fix */
  suggestedFix?: string;
}

/**
 * Metadata validation warning
 */
export interface MetadataValidationWarning {
  /** Warning field */
  field: string;
  
  /** Warning message */
  message: string;
  
  /** Warning impact */
  impact: 'low' | 'medium' | 'high';
}

/**
 * Metadata improvement suggestion
 */
export interface MetadataImprovement {
  /** Field to improve */
  field: string;
  
  /** Improvement description */
  description: string;
  
  /** Suggested value */
  suggestedValue?: MetadataValue;
  
  /** Improvement benefit */
  benefit: string;
}

/**
 * Metadata search filters
 */
export interface MetadataSearchFilters {
  /** Entity type */
  entityType?: 'task' | 'epic' | 'project';
  
  /** Entity IDs */
  entityIds?: string[];
  
  /** Lifecycle stages */
  lifecycles?: EntityLifecycle[];
  
  /** Created by users */
  createdBy?: string[];
  
  /** Date range */
  dateRange?: {
    start: Date;
    end: Date;
  };
  
  /** Attribute filters */
  attributes?: Record<string, MetadataValue>;
  
  /** Minimum version */
  minVersion?: number;
  
  /** Tag filters */
  tags?: string[];
}

/**
 * Metadata analytics
 */
export interface MetadataAnalytics {
  /** Total entities with metadata */
  totalEntities: number;
  
  /** Metadata completeness */
  completeness: {
    average: number;
    byEntityType: Record<string, number>;
    byLifecycle: Record<EntityLifecycle, number>;
  };
  
  /** Change frequency */
  changeFrequency: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  
  /** Most active users */
  activeUsers: {
    user: string;
    changes: number;
    percentage: number;
  }[];
  
  /** Common attributes */
  commonAttributes: {
    attribute: string;
    usage: number;
    percentage: number;
  }[];
  
  /** Quality metrics */
  quality: {
    average: number;
    distribution: Record<string, number>;
    trends: {
      improving: number;
      stable: number;
      declining: number;
    };
  };
}

/**
 * Metadata Service
 */
export class MetadataService {
  private static instance: MetadataService;
  private config: OpenRouterConfig;
  private tagService: TagManagementService;
  private metadataCache: Map<string, BaseMetadata> = new Map();
  private changeHistory: Map<string, MetadataChange[]> = new Map();
  
  private constructor(config: OpenRouterConfig) {
    this.config = config;
    this.tagService = TagManagementService.getInstance(config);
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(config: OpenRouterConfig): MetadataService {
    if (!MetadataService.instance) {
      MetadataService.instance = new MetadataService(config);
    }
    return MetadataService.instance;
  }
  
  /**
   * Create metadata for task
   */
  async createTaskMetadata(
    task: AtomicTask,
    options: MetadataEnrichmentOptions = {}
  ): Promise<TaskMetadata> {
    const baseMetadata = this.createBaseMetadata(task.createdBy);
    
    let metadata: TaskMetadata = {
      ...baseMetadata,
      tags: await this.createTagCollection(task, options.enhanceTags),
      complexity: await this.analyzeComplexity(task, options.analyzeComplexity),
      performance: await this.estimatePerformance(task, options.estimatePerformance),
      quality: await this.assessQuality(task, options.assessQuality),
      collaboration: await this.createCollaborationMetadata(task),
      integration: await this.createIntegrationMetadata(task)
    };
    
    // AI-powered enrichment
    if (options.useAI) {
      metadata = await this.enrichTaskMetadataWithAI(task, metadata);
    }
    
    // Cache metadata
    this.metadataCache.set(task.id, metadata);
    
    // Record creation
    this.recordChange(task.id, {
      timestamp: new Date(),
      changedBy: task.createdBy,
      type: 'create',
      field: 'metadata',
      newValue: metadata,
      reason: 'Initial metadata creation'
    });
    
    logger.debug({ taskId: task.id, metadata }, 'Created task metadata');
    return metadata;
  }
  
  /**
   * Create metadata for epic
   */
  async createEpicMetadata(
    epic: Epic,
    options: MetadataEnrichmentOptions = {}
  ): Promise<EpicMetadata> {
    const baseMetadata = this.createBaseMetadata(epic.metadata.createdBy);
    
    let metadata: EpicMetadata = {
      ...baseMetadata,
      tags: await this.createTagCollection({ 
        title: epic.title, 
        description: epic.description, 
        type: 'epic' 
      }, options.enhanceTags),
      scope: await this.createScopeMetadata(epic),
      progress: await this.createProgressMetadata(epic),
      resources: await this.createResourceMetadata(epic)
    };
    
    // AI-powered enrichment
    if (options.useAI) {
      metadata = await this.enrichEpicMetadataWithAI(epic, metadata);
    }
    
    this.metadataCache.set(epic.id, metadata);
    
    logger.debug({ epicId: epic.id, metadata }, 'Created epic metadata');
    return metadata;
  }
  
  /**
   * Create metadata for project
   */
  async createProjectMetadata(
    project: Project,
    options: MetadataEnrichmentOptions = {}
  ): Promise<ProjectMetadata> {
    const baseMetadata = this.createBaseMetadata(project.metadata.createdBy);
    
    let metadata: ProjectMetadata = {
      ...baseMetadata,
      tags: await this.createTagCollection({
        title: project.name,
        description: project.description,
        type: 'project'
      }, options.enhanceTags),
      classification: await this.createProjectClassification(project),
      business: await this.createBusinessMetadata(project),
      technical: await this.createTechnicalMetadata(project),
      governance: await this.createGovernanceMetadata(project)
    };
    
    // AI-powered enrichment
    if (options.useAI) {
      metadata = await this.enrichProjectMetadataWithAI(project, metadata);
    }
    
    this.metadataCache.set(project.id, metadata);
    
    logger.debug({ projectId: project.id, metadata }, 'Created project metadata');
    return metadata;
  }
  
  /**
   * Update metadata
   */
  async updateMetadata(
    entityId: string,
    updates: Partial<BaseMetadata>,
    updatedBy: string,
    reason?: string
  ): Promise<BaseMetadata> {
    const existingMetadata = this.metadataCache.get(entityId);
    if (!existingMetadata) {
      throw new Error(`Metadata not found for entity: ${entityId}`);
    }
    
    // Create updated metadata
    const updatedMetadata: BaseMetadata = {
      ...existingMetadata,
      ...updates,
      updatedAt: new Date(),
      updatedBy,
      version: existingMetadata.version + 1
    };
    
    // Record changes
    for (const [field, newValue] of Object.entries(updates)) {
      const previousValue = (existingMetadata as unknown as Record<string, MetadataValue>)[field];
      if (JSON.stringify(previousValue) !== JSON.stringify(newValue)) {
        this.recordChange(entityId, {
          timestamp: new Date(),
          changedBy: updatedBy,
          type: 'update',
          field,
          previousValue,
          newValue,
          reason
        });
      }
    }
    
    // Update cache
    this.metadataCache.set(entityId, updatedMetadata);
    
    logger.debug({ entityId, updates, version: updatedMetadata.version }, 'Updated metadata');
    return updatedMetadata;
  }
  
  /**
   * Validate metadata
   */
  async validateMetadata(metadata: BaseMetadata): Promise<MetadataValidationResult> {
    const errors: MetadataValidationError[] = [];
    const warnings: MetadataValidationWarning[] = [];
    const suggestions: MetadataImprovement[] = [];
    
    // Validate required fields
    if (!metadata.createdAt) {
      errors.push({
        field: 'createdAt',
        message: 'Creation date is required',
        severity: 'error',
        suggestedFix: 'Set createdAt to current date'
      });
    }
    
    if (!metadata.createdBy) {
      errors.push({
        field: 'createdBy',
        message: 'Creator is required',
        severity: 'error',
        suggestedFix: 'Set createdBy to current user'
      });
    }
    
    if (metadata.version < 1) {
      errors.push({
        field: 'version',
        message: 'Version must be positive',
        severity: 'error',
        suggestedFix: 'Set version to 1 or higher'
      });
    }
    
    // Validate lifecycle
    const validLifecycles: EntityLifecycle[] = ['draft', 'active', 'in_progress', 'completed', 'archived', 'deprecated'];
    if (!validLifecycles.includes(metadata.lifecycle)) {
      errors.push({
        field: 'lifecycle',
        message: `Invalid lifecycle: ${metadata.lifecycle}`,
        severity: 'error',
        suggestedFix: `Use one of: ${validLifecycles.join(', ')}`
      });
    }
    
    // Check for missing attributes
    if (!metadata.attributes || Object.keys(metadata.attributes).length === 0) {
      warnings.push({
        field: 'attributes',
        message: 'No custom attributes defined',
        impact: 'medium'
      });
      
      suggestions.push({
        field: 'attributes',
        description: 'Add custom attributes for better organization',
        benefit: 'Improved searchability and organization'
      });
    }
    
    // Check for outdated metadata
    if (metadata.updatedAt && metadata.updatedAt instanceof Date) {
      const daysSinceUpdate = (Date.now() - metadata.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate > 30) {
        warnings.push({
          field: 'updatedAt',
          message: `Metadata hasn't been updated in ${Math.floor(daysSinceUpdate)} days`,
          impact: 'low'
        });
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }
  
  /**
   * Get metadata analytics
   */
  async getMetadataAnalytics(
    filters: MetadataSearchFilters = {}
  ): Promise<MetadataAnalytics> {
    // This would typically query the database for analytics
    // For now, returning mock analytics based on cache
    
    const allMetadata = Array.from(this.metadataCache.values());
    const filteredMetadata = this.applyFilters(allMetadata, filters);
    
    const totalEntities = filteredMetadata.length;
    const changeHistoryEntries = Array.from(this.changeHistory.values()).flat();
    
    return {
      totalEntities,
      completeness: {
        average: this.calculateAverageCompleteness(filteredMetadata),
        byEntityType: this.calculateCompletenessByType(filteredMetadata),
        byLifecycle: this.calculateCompletenessByLifecycle(filteredMetadata)
      },
      changeFrequency: this.calculateChangeFrequency(changeHistoryEntries),
      activeUsers: this.calculateActiveUsers(changeHistoryEntries),
      commonAttributes: this.calculateCommonAttributes(filteredMetadata),
      quality: this.calculateQualityMetrics(filteredMetadata)
    };
  }
  
  /**
   * Search metadata
   */
  async searchMetadata(filters: MetadataSearchFilters): Promise<BaseMetadata[]> {
    const allMetadata = Array.from(this.metadataCache.values());
    return this.applyFilters(allMetadata, filters);
  }
  
  /**
   * Get change history
   */
  getChangeHistory(entityId: string): MetadataChange[] {
    return this.changeHistory.get(entityId) || [];
  }
  
  /**
   * Create base metadata
   */
  private createBaseMetadata(createdBy: string): BaseMetadata {
    return {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy,
      version: 1,
      lifecycle: 'draft',
      attributes: {},
      changeHistory: []
    };
  }
  
  /**
   * Create tag collection
   */
  private async createTagCollection(
    content: { title: string; description: string; type?: string },
    enhance: boolean = true
  ): Promise<TagCollection> {
    if (enhance) {
      return this.tagService.enhanceTagCollection(content);
    }
    
    return {
      functional: [],
      technical: [],
      business: [],
      process: [],
      quality: [],
      custom: [],
      generated: []
    };
  }
  
  /**
   * Analyze complexity
   */
  private async analyzeComplexity(
    task: AtomicTask,
    analyze: boolean = true
  ): Promise<ComplexityMetadata> {
    if (!analyze) {
      return {
        overallScore: 0.5,
        technical: 0.5,
        business: 0.5,
        integration: 0.5,
        factors: [],
        analysis: {
          computedAt: new Date(),
          method: 'default',
          confidence: 0.1
        }
      };
    }
    
    // Basic complexity analysis
    const technicalComplexity = this.calculateTechnicalComplexity(task);
    const businessComplexity = this.calculateBusinessComplexity(task);
    const integrationComplexity = this.calculateIntegrationComplexity(task);
    
    const overallScore = (technicalComplexity + businessComplexity + integrationComplexity) / 3;
    
    return {
      overallScore,
      technical: technicalComplexity,
      business: businessComplexity,
      integration: integrationComplexity,
      factors: await this.identifyComplexityFactors(task),
      analysis: {
        computedAt: new Date(),
        method: 'heuristic',
        confidence: 0.7
      }
    };
  }
  
  /**
   * Estimate performance
   */
  private async estimatePerformance(
    task: AtomicTask,
    estimate: boolean = true
  ): Promise<PerformanceMetadata> {
    if (!estimate) {
      return {
        estimatedTime: task.estimatedHours * 60, // minutes
        targets: {},
        metrics: {
          efficiency: 0.8,
          resourceUtilization: 0.7,
          scalability: 0.6
        }
      };
    }
    
    return {
      estimatedTime: task.estimatedHours * 60,
      targets: {
        responseTime: 200, // ms
        throughput: 1000,  // requests/sec
        memoryUsage: 512,  // MB
        cpuUsage: 50       // %
      },
      metrics: {
        efficiency: this.calculateEfficiency(task),
        resourceUtilization: this.calculateResourceUtilization(task),
        scalability: this.calculateScalability(task)
      }
    };
  }
  
  /**
   * Assess quality
   */
  private async assessQuality(
    task: AtomicTask,
    assess: boolean = true
  ): Promise<QualityMetadata> {
    if (!assess) {
      return {
        score: 0.8,
        dimensions: {
          codeQuality: 0.8,
          testCoverage: 0.7,
          documentation: 0.6,
          maintainability: 0.8,
          reliability: 0.9
        },
        gates: [],
        standards: []
      };
    }
    
    const dimensions = {
      codeQuality: 0.8,
      testCoverage: task.testingRequirements.coverageTarget / 100,
      documentation: task.qualityCriteria.documentation.length > 0 ? 0.8 : 0.3,
      maintainability: 0.8,
      reliability: 0.9
    };
    
    const score = Object.values(dimensions).reduce((sum, val) => sum + val, 0) / Object.keys(dimensions).length;
    
    return {
      score,
      dimensions,
      gates: await this.createQualityGates(task),
      standards: ['coding-standards', 'security-standards']
    };
  }
  
  /**
   * Create collaboration metadata
   */
  private async createCollaborationMetadata(task: AtomicTask): Promise<CollaborationMetadata> {
    return {
      assignees: task.assignedAgent ? [task.assignedAgent] : [],
      reviewers: [],
      stakeholders: [task.createdBy],
      patterns: {
        pairProgramming: false,
        codeReview: true,
        mobProgramming: false
      },
      channels: ['slack', 'email']
    };
  }
  
  /**
   * Create integration metadata
   */
  private async createIntegrationMetadata(task: AtomicTask): Promise<IntegrationMetadata> {
    return {
      externalSystems: [],
      dependencies: {
        internal: task.dependencies,
        external: [],
        optional: []
      },
      integrationPoints: [],
      contracts: []
    };
  }
  
  /**
   * Record metadata change
   */
  private recordChange(entityId: string, change: MetadataChange): void {
    if (!this.changeHistory.has(entityId)) {
      this.changeHistory.set(entityId, []);
    }
    
    this.changeHistory.get(entityId)!.push(change);
    
    // Limit history to last 100 changes
    const history = this.changeHistory.get(entityId)!;
    if (history.length > 100) {
      this.changeHistory.set(entityId, history.slice(-100));
    }
  }
  
  /**
   * Calculate technical complexity
   */
  private calculateTechnicalComplexity(task: AtomicTask): number {
    let complexity = 0.3; // Base complexity
    
    // File paths indicate scope
    complexity += Math.min(task.filePaths.length * 0.1, 0.3);
    
    // Testing requirements
    if (task.testingRequirements.coverageTarget > 80) complexity += 0.1;
    if (task.testingRequirements.unitTests.length > 0) complexity += 0.1;
    if (task.testingRequirements.integrationTests.length > 0) complexity += 0.1;
    
    // Quality criteria
    if (task.qualityCriteria.typeScript) complexity += 0.05;
    if (task.qualityCriteria.eslint) complexity += 0.05;
    
    return Math.min(complexity, 1.0);
  }
  
  /**
   * Calculate business complexity
   */
  private calculateBusinessComplexity(task: AtomicTask): number {
    let complexity = 0.2; // Base complexity
    
    // Priority impact
    switch (task.priority) {
      case 'critical': complexity += 0.4; break;
      case 'high': complexity += 0.3; break;
      case 'medium': complexity += 0.2; break;
      case 'low': complexity += 0.1; break;
    }
    
    // Acceptance criteria count
    complexity += Math.min(task.acceptanceCriteria.length * 0.05, 0.2);
    
    return Math.min(complexity, 1.0);
  }
  
  /**
   * Calculate integration complexity
   */
  private calculateIntegrationComplexity(task: AtomicTask): number {
    let complexity = 0.1; // Base complexity
    
    // Dependencies
    complexity += Math.min(task.dependencies.length * 0.1, 0.4);
    
    // Integration criteria
    complexity += Math.min(task.integrationCriteria.compatibility.length * 0.1, 0.3);
    complexity += Math.min(task.integrationCriteria.patterns.length * 0.1, 0.2);
    
    return Math.min(complexity, 1.0);
  }
  
  /**
   * Identify complexity factors
   */
  private async identifyComplexityFactors(task: AtomicTask): Promise<ComplexityFactor[]> {
    const factors = [];
    
    if (task.filePaths.length > 5) {
      factors.push({
        name: 'Multiple Files',
        weight: 0.3,
        description: 'Task affects multiple files',
        category: 'technical' as const
      });
    }
    
    if (task.dependencies.length > 3) {
      factors.push({
        name: 'Complex Dependencies',
        weight: 0.4,
        description: 'Task has multiple dependencies',
        category: 'integration' as const
      });
    }
    
    if (task.priority === 'critical') {
      factors.push({
        name: 'Critical Priority',
        weight: 0.5,
        description: 'Task is business critical',
        category: 'business' as const
      });
    }
    
    return factors;
  }
  
  /**
   * Calculate efficiency
   */
  private calculateEfficiency(task: AtomicTask): number {
    // Simple heuristic based on estimated hours
    if (task.estimatedHours <= 1) return 0.9;
    if (task.estimatedHours <= 4) return 0.8;
    if (task.estimatedHours <= 8) return 0.7;
    return 0.6;
  }
  
  /**
   * Calculate resource utilization
   */
  private calculateResourceUtilization(task: AtomicTask): number {
    // Based on task type and complexity
    switch (task.type) {
      case 'development': return 0.8;
      case 'testing': return 0.7;
      case 'documentation': return 0.6;
      case 'research': return 0.5;
      default: return 0.7;
    }
  }
  
  /**
   * Calculate scalability
   */
  private calculateScalability(task: AtomicTask): number {
    // Based on architectural impact
    const architecturalKeywords = ['architecture', 'framework', 'infrastructure', 'scalability'];
    const hasArchitecturalImpact = architecturalKeywords.some(keyword =>
      task.title.toLowerCase().includes(keyword) ||
      task.description.toLowerCase().includes(keyword)
    );
    
    return hasArchitecturalImpact ? 0.9 : 0.6;
  }
  
  /**
   * Create quality gates
   */
  private async createQualityGates(task: AtomicTask): Promise<QualityGate[]> {
    const gates = [];
    
    if (task.testingRequirements.coverageTarget > 0) {
      gates.push({
        name: 'Test Coverage',
        criteria: `Minimum ${task.testingRequirements.coverageTarget}% coverage`,
        status: 'pending' as const,
        result: {
          value: 0,
          threshold: task.testingRequirements.coverageTarget,
          message: 'Test coverage gate'
        }
      });
    }
    
    if (task.qualityCriteria.typeScript) {
      gates.push({
        name: 'TypeScript Compliance',
        criteria: 'No TypeScript errors',
        status: 'pending' as const
      });
    }
    
    return gates;
  }
  
  /**
   * Apply search filters
   */
  private applyFilters(metadata: BaseMetadata[], filters: MetadataSearchFilters): BaseMetadata[] {
    let filtered = metadata;
    
    if (filters.lifecycles && filters.lifecycles.length > 0) {
      filtered = filtered.filter(m => filters.lifecycles!.includes(m.lifecycle));
    }
    
    if (filters.createdBy && filters.createdBy.length > 0) {
      filtered = filtered.filter(m => filters.createdBy!.includes(m.createdBy));
    }
    
    if (filters.dateRange) {
      filtered = filtered.filter(m =>
        m.createdAt >= filters.dateRange!.start &&
        m.createdAt <= filters.dateRange!.end
      );
    }
    
    if (filters.minVersion) {
      filtered = filtered.filter(m => m.version >= filters.minVersion!);
    }
    
    return filtered;
  }
  
  /**
   * Calculate average completeness
   */
  private calculateAverageCompleteness(metadata: BaseMetadata[]): number {
    if (metadata.length === 0) return 0;
    
    const totalCompleteness = metadata.reduce((sum, m) => {
      const attributeCount = Object.keys(m.attributes).length;
      const completeness = Math.min(attributeCount / 5, 1); // Assume 5 attributes is "complete"
      return sum + completeness;
    }, 0);
    
    return totalCompleteness / metadata.length;
  }
  
  /**
   * Calculate completeness by type
   */
  private calculateCompletenessByType(_metadata: BaseMetadata[]): Record<string, number> {
    // Mock implementation - would need entity type information
    return {
      task: 0.8,
      epic: 0.7,
      project: 0.9
    };
  }
  
  /**
   * Calculate completeness by lifecycle
   */
  private calculateCompletenessByLifecycle(metadata: BaseMetadata[]): Record<EntityLifecycle, number> {
    const byLifecycle: Record<EntityLifecycle, BaseMetadata[]> = {
      draft: [],
      active: [],
      in_progress: [],
      completed: [],
      archived: [],
      deprecated: []
    };
    
    metadata.forEach(m => {
      byLifecycle[m.lifecycle].push(m);
    });
    
    const result: Record<EntityLifecycle, number> = {} as Record<EntityLifecycle, number>;
    for (const [lifecycle, items] of Object.entries(byLifecycle)) {
      result[lifecycle as EntityLifecycle] = this.calculateAverageCompleteness(items);
    }
    
    return result;
  }
  
  /**
   * Calculate change frequency
   */
  private calculateChangeFrequency(changes: MetadataChange[]): { daily: number; weekly: number; monthly: number; } {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    return {
      daily: changes.filter(c => c.timestamp >= oneDayAgo).length,
      weekly: changes.filter(c => c.timestamp >= oneWeekAgo).length,
      monthly: changes.filter(c => c.timestamp >= oneMonthAgo).length
    };
  }
  
  /**
   * Calculate active users
   */
  private calculateActiveUsers(changes: MetadataChange[]): Array<{ user: string; changes: number; percentage: number; }> {
    const userChanges = new Map<string, number>();
    
    changes.forEach(change => {
      const count = userChanges.get(change.changedBy) || 0;
      userChanges.set(change.changedBy, count + 1);
    });
    
    const totalChanges = changes.length;
    
    return Array.from(userChanges.entries())
      .map(([user, changes]) => ({
        user,
        changes,
        percentage: (changes / totalChanges) * 100
      }))
      .sort((a, b) => b.changes - a.changes)
      .slice(0, 10);
  }
  
  /**
   * Calculate common attributes
   */
  private calculateCommonAttributes(metadata: BaseMetadata[]): Array<{ attribute: string; usage: number; percentage: number; }> {
    const attributeCounts = new Map<string, number>();
    let totalAttributes = 0;
    
    metadata.forEach(m => {
      Object.keys(m.attributes).forEach(attr => {
        const count = attributeCounts.get(attr) || 0;
        attributeCounts.set(attr, count + 1);
        totalAttributes++;
      });
    });
    
    return Array.from(attributeCounts.entries())
      .map(([attribute, usage]) => ({
        attribute,
        usage,
        percentage: (usage / totalAttributes) * 100
      }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 10);
  }
  
  /**
   * Calculate quality metrics
   */
  private calculateQualityMetrics(_metadata: BaseMetadata[]): { average: number; distribution: Record<string, number>; trends: { improving: number; stable: number; declining: number; }; } {
    // Mock implementation
    return {
      average: 0.8,
      distribution: {
        excellent: 30,
        good: 45,
        fair: 20,
        poor: 5
      },
      trends: {
        improving: 60,
        stable: 30,
        declining: 10
      }
    };
  }
  
  /**
   * AI-powered enrichment methods (placeholder implementations)
   */
  private async enrichTaskMetadataWithAI(task: AtomicTask, metadata: TaskMetadata): Promise<TaskMetadata> {
    // Would use AI to enhance metadata
    return metadata;
  }
  
  private async enrichEpicMetadataWithAI(epic: Epic, metadata: EpicMetadata): Promise<EpicMetadata> {
    return metadata;
  }
  
  private async enrichProjectMetadataWithAI(project: Project, metadata: ProjectMetadata): Promise<ProjectMetadata> {
    return metadata;
  }
  
  /**
   * Placeholder implementations for missing methods
   */
  private async createScopeMetadata(_epic: Epic): Promise<ScopeMetadata> {
    return {
      definition: _epic.description,
      boundaries: [],
      includes: [],
      excludes: [],
      changes: []
    };
  }
  
  private async createProgressMetadata(_epic: Epic): Promise<ProgressMetadata> {
    return {
      percentage: 0,
      milestones: [],
      tracking: {
        method: 'manual',
        frequency: 'weekly',
        lastUpdated: new Date()
      },
      blockers: []
    };
  }
  
  private async createResourceMetadata(_epic: Epic): Promise<ResourceMetadata> {
    return {
      allocated: {
        people: 1,
        budget: 10000,
        tools: [],
        timeframe: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      },
      utilization: {
        actual: 0,
        planned: 1,
        efficiency: 0.8
      },
      constraints: []
    };
  }
  
  private async createProjectClassification(_project: Project): Promise<ProjectClassification> {
    return {
      type: 'greenfield',
      size: 'medium',
      domain: [],
      methodologies: ['agile'],
      riskLevel: 'medium'
    };
  }
  
  private async createBusinessMetadata(_project: Project): Promise<BusinessMetadata> {
    return {
      objectives: [],
      successMetrics: [],
      stakeholders: [],
      value: {
        financial: 0,
        strategic: 0,
        operational: 0
      },
      market: {
        segment: '',
        competition: [],
        opportunities: []
      }
    };
  }
  
  private async createTechnicalMetadata(project: Project): Promise<TechnicalMetadata> {
    return {
      architecture: [],
      stack: {
        frontend: project.techStack?.frameworks?.filter(f => ['react', 'vue', 'angular'].includes(f.toLowerCase())) || [],
        backend: project.techStack?.frameworks?.filter(f => ['express', 'fastify', 'koa'].includes(f.toLowerCase())) || [],
        database: [],
        infrastructure: [],
        tools: project.techStack?.tools || []
      },
      constraints: [],
      performance: {
        responseTime: 200,
        throughput: 1000,
        availability: 99.9,
        scalability: 'horizontal'
      },
      security: {
        classification: 'internal',
        compliance: [],
        threats: []
      }
    };
  }
  
  private async createGovernanceMetadata(_project: Project): Promise<GovernanceMetadata> {
    return {
      approvals: [],
      compliance: [],
      audit: [],
      risk: {
        overallScore: 0.5,
        categories: {
          technical: 0.4,
          business: 0.5,
          security: 0.3,
          operational: 0.6
        },
        risks: [],
        mitigation: [],
        assessedAt: new Date(),
        nextReview: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      },
      changeControl: {
        process: 'standard',
        approvers: [],
        documentation: []
      }
    };
  }
  
  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.metadataCache.clear();
    this.changeHistory.clear();
    await this.tagService.cleanup();
  }
}
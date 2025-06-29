/**
 * Enhanced Metadata and Tagging Type Definitions
 * 
 * Provides comprehensive metadata management with versioning, validation,
 * and hierarchical tagging support for the Vibe Task Manager.
 */

/**
 * Base metadata interface for all entities
 */
export interface BaseMetadata {
  /** Creation timestamp */
  createdAt: Date;
  
  /** Last update timestamp */
  updatedAt: Date;
  
  /** User who created the entity */
  createdBy: string;
  
  /** User who last updated the entity */
  updatedBy?: string;
  
  /** Metadata version for change tracking */
  version: number;
  
  /** Change history summary */
  changeHistory?: MetadataChange[];
  
  /** Entity lifecycle stage */
  lifecycle: EntityLifecycle;
  
  /** Custom attributes */
  attributes: Record<string, MetadataValue>;
}

/**
 * Enhanced metadata for tasks
 */
export interface TaskMetadata extends BaseMetadata {
  /** Hierarchical tags with categories */
  tags: TagCollection;
  
  /** Task complexity metrics */
  complexity: ComplexityMetadata;
  
  /** Performance tracking */
  performance: PerformanceMetadata;
  
  /** Quality metrics */
  quality: QualityMetadata;
  
  /** Collaboration metadata */
  collaboration: CollaborationMetadata;
  
  /** Integration metadata */
  integration: IntegrationMetadata;
}

/**
 * Enhanced metadata for epics
 */
export interface EpicMetadata extends BaseMetadata {
  /** Epic-specific tags */
  tags: TagCollection;
  
  /** Epic scope and planning */
  scope: ScopeMetadata;
  
  /** Progress tracking */
  progress: ProgressMetadata;
  
  /** Resource allocation */
  resources: ResourceMetadata;
}

/**
 * Enhanced metadata for projects
 */
export interface ProjectMetadata extends BaseMetadata {
  /** Project-wide tags */
  tags: TagCollection;
  
  /** Project classification */
  classification: ProjectClassification;
  
  /** Business context */
  business: BusinessMetadata;
  
  /** Technical context */
  technical: TechnicalMetadata;
  
  /** Governance metadata */
  governance: GovernanceMetadata;
}

/**
 * Tag collection with hierarchical support
 */
export interface TagCollection {
  /** Primary functional tags */
  functional: FunctionalTag[];
  
  /** Technical tags */
  technical: TechnicalTag[];
  
  /** Business/domain tags */
  business: BusinessTag[];
  
  /** Process/workflow tags */
  process: ProcessTag[];
  
  /** Quality/attribute tags */
  quality: QualityTag[];
  
  /** Custom user-defined tags */
  custom: CustomTag[];
  
  /** Auto-generated tags */
  generated: GeneratedTag[];
}

/**
 * Base tag interface
 */
export interface BaseTag {
  /** Tag identifier */
  id: string;
  
  /** Tag value/name */
  value: string;
  
  /** Tag category */
  category: TagCategory;
  
  /** Tag confidence (for auto-generated tags) */
  confidence: number;
  
  /** Tag source */
  source: TagSource;
  
  /** Tag creation timestamp */
  createdAt: Date;
  
  /** Parent tag for hierarchical structure */
  parentId?: string;
  
  /** Tag metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Functional area tags
 */
export interface FunctionalTag extends BaseTag {
  category: 'functional';
  /** Functional domain */
  domain: 'auth' | 'api' | 'ui' | 'database' | 'security' | 'integration' | 'workflow' | 'analytics' | string;
  /** Feature specificity level */
  specificity: 'general' | 'specific' | 'detailed';
}

/**
 * Technical implementation tags
 */
export interface TechnicalTag extends BaseTag {
  category: 'technical';
  /** Technology stack component */
  stack: 'frontend' | 'backend' | 'database' | 'infrastructure' | 'tooling' | string;
  /** Implementation complexity */
  complexity: 'simple' | 'moderate' | 'complex' | 'critical';
}

/**
 * Business/domain tags
 */
export interface BusinessTag extends BaseTag {
  category: 'business';
  /** Business priority */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Business impact */
  impact: 'local' | 'feature' | 'system' | 'strategic';
}

/**
 * Process/workflow tags
 */
export interface ProcessTag extends BaseTag {
  category: 'process';
  /** Workflow stage */
  stage: 'planning' | 'development' | 'testing' | 'review' | 'deployment' | 'maintenance';
  /** Process type */
  type: 'sequential' | 'parallel' | 'conditional' | 'iterative';
}

/**
 * Quality attribute tags
 */
export interface QualityTag extends BaseTag {
  category: 'quality';
  /** Quality dimension */
  dimension: 'performance' | 'reliability' | 'usability' | 'maintainability' | 'security' | 'accessibility';
  /** Quality level */
  level: 'basic' | 'standard' | 'enhanced' | 'premium';
}

/**
 * Custom user-defined tags
 */
export interface CustomTag extends BaseTag {
  category: 'custom';
  /** Custom category defined by user */
  customCategory: string;
  /** Tag purpose */
  purpose?: string;
}

/**
 * Auto-generated tags from AI analysis
 */
export interface GeneratedTag extends BaseTag {
  category: 'generated';
  /** Generation method */
  method: 'llm_analysis' | 'pattern_matching' | 'ml_classification' | 'heuristic';
  /** Generation timestamp */
  generatedAt: Date;
  /** Validation status */
  validated: boolean;
}

/**
 * Tag categories
 */
export type TagCategory = 'functional' | 'technical' | 'business' | 'process' | 'quality' | 'custom' | 'generated';

/**
 * Tag sources
 */
export type TagSource = 'user' | 'system' | 'ai' | 'integration' | 'migration' | 'template';

/**
 * Entity lifecycle stages
 */
export type EntityLifecycle = 'draft' | 'active' | 'in_progress' | 'completed' | 'archived' | 'deprecated';

/**
 * Metadata value types
 */
export type MetadataValue = string | number | boolean | Date | object | null;

/**
 * Metadata change tracking
 */
export interface MetadataChange {
  /** Change timestamp */
  timestamp: Date;
  
  /** User who made the change */
  changedBy: string;
  
  /** Change type */
  type: 'create' | 'update' | 'delete' | 'tag_added' | 'tag_removed' | 'attribute_changed';
  
  /** Changed field */
  field: string;
  
  /** Previous value */
  previousValue?: MetadataValue;
  
  /** New value */
  newValue?: MetadataValue;
  
  /** Change reason */
  reason?: string;
}

/**
 * Complexity metadata
 */
export interface ComplexityMetadata {
  /** Overall complexity score */
  overallScore: number;
  
  /** Technical complexity */
  technical: number;
  
  /** Business complexity */
  business: number;
  
  /** Integration complexity */
  integration: number;
  
  /** Complexity factors */
  factors: ComplexityFactor[];
  
  /** Complexity analysis */
  analysis: {
    computedAt: Date;
    method: string;
    confidence: number;
  };
}

/**
 * Complexity factor
 */
export interface ComplexityFactor {
  /** Factor name */
  name: string;
  
  /** Factor weight */
  weight: number;
  
  /** Factor description */
  description: string;
  
  /** Factor category */
  category: 'technical' | 'business' | 'integration' | 'process';
}

/**
 * Performance metadata
 */
export interface PerformanceMetadata {
  /** Estimated execution time */
  estimatedTime: number;
  
  /** Actual execution time */
  actualTime?: number;
  
  /** Performance targets */
  targets: {
    responseTime?: number;
    throughput?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
  
  /** Performance metrics */
  metrics: {
    efficiency: number;
    resourceUtilization: number;
    scalability: number;
  };
}

/**
 * Quality metadata
 */
export interface QualityMetadata {
  /** Quality score */
  score: number;
  
  /** Quality dimensions */
  dimensions: {
    codeQuality: number;
    testCoverage: number;
    documentation: number;
    maintainability: number;
    reliability: number;
  };
  
  /** Quality gates */
  gates: QualityGate[];
  
  /** Quality standards compliance */
  standards: string[];
}

/**
 * Quality gate
 */
export interface QualityGate {
  /** Gate name */
  name: string;
  
  /** Gate criteria */
  criteria: string;
  
  /** Gate status */
  status: 'passed' | 'failed' | 'pending' | 'skipped';
  
  /** Gate result */
  result?: {
    value: number;
    threshold: number;
    message: string;
  };
}

/**
 * Collaboration metadata
 */
export interface CollaborationMetadata {
  /** Assigned team members */
  assignees: string[];
  
  /** Reviewers */
  reviewers: string[];
  
  /** Stakeholders */
  stakeholders: string[];
  
  /** Collaboration patterns */
  patterns: {
    pairProgramming: boolean;
    codeReview: boolean;
    mobProgramming: boolean;
  };
  
  /** Communication channels */
  channels: string[];
}

/**
 * Integration metadata
 */
export interface IntegrationMetadata {
  /** External systems */
  externalSystems: string[];
  
  /** Dependencies */
  dependencies: {
    internal: string[];
    external: string[];
    optional: string[];
  };
  
  /** Integration points */
  integrationPoints: IntegrationPoint[];
  
  /** API contracts */
  contracts: string[];
}

/**
 * Integration point
 */
export interface IntegrationPoint {
  /** Integration name */
  name: string;
  
  /** Integration type */
  type: 'api' | 'database' | 'queue' | 'webhook' | 'file' | 'stream';
  
  /** Integration direction */
  direction: 'inbound' | 'outbound' | 'bidirectional';
  
  /** Integration criticality */
  criticality: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Scope metadata for epics
 */
export interface ScopeMetadata {
  /** Scope definition */
  definition: string;
  
  /** Scope boundaries */
  boundaries: string[];
  
  /** Included features */
  includes: string[];
  
  /** Excluded features */
  excludes: string[];
  
  /** Scope change tracking */
  changes: ScopeChange[];
}

/**
 * Scope change
 */
export interface ScopeChange {
  /** Change timestamp */
  timestamp: Date;
  
  /** Change type */
  type: 'addition' | 'removal' | 'modification';
  
  /** Change description */
  description: string;
  
  /** Change impact */
  impact: 'low' | 'medium' | 'high';
  
  /** Change approver */
  approvedBy: string;
}

/**
 * Progress metadata
 */
export interface ProgressMetadata {
  /** Progress percentage */
  percentage: number;
  
  /** Progress milestones */
  milestones: Milestone[];
  
  /** Progress tracking */
  tracking: {
    method: 'manual' | 'automated' | 'hybrid';
    frequency: 'daily' | 'weekly' | 'milestone';
    lastUpdated: Date;
  };
  
  /** Progress blockers */
  blockers: Blocker[];
}

/**
 * Milestone
 */
export interface Milestone {
  /** Milestone name */
  name: string;
  
  /** Milestone description */
  description: string;
  
  /** Target date */
  targetDate: Date;
  
  /** Actual completion date */
  completedDate?: Date;
  
  /** Milestone status */
  status: 'pending' | 'in_progress' | 'completed' | 'delayed';
  
  /** Completion criteria */
  criteria: string[];
}

/**
 * Blocker
 */
export interface Blocker {
  /** Blocker ID */
  id: string;
  
  /** Blocker description */
  description: string;
  
  /** Blocker type */
  type: 'technical' | 'resource' | 'external' | 'dependency' | 'approval';
  
  /** Blocker severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  /** Blocker status */
  status: 'open' | 'in_progress' | 'resolved';
  
  /** Resolution plan */
  resolution?: string;
  
  /** Created date */
  createdAt: Date;
  
  /** Resolved date */
  resolvedAt?: Date;
}

/**
 * Resource metadata
 */
export interface ResourceMetadata {
  /** Allocated resources */
  allocated: {
    people: number;
    budget: number;
    tools: string[];
    timeframe: {
      start: Date;
      end: Date;
    };
  };
  
  /** Resource utilization */
  utilization: {
    actual: number;
    planned: number;
    efficiency: number;
  };
  
  /** Resource constraints */
  constraints: string[];
}

/**
 * Project classification
 */
export interface ProjectClassification {
  /** Project type */
  type: 'greenfield' | 'brownfield' | 'maintenance' | 'research' | 'migration';
  
  /** Project size */
  size: 'small' | 'medium' | 'large' | 'enterprise';
  
  /** Project domain */
  domain: string[];
  
  /** Project methodologies */
  methodologies: string[];
  
  /** Risk level */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Business metadata
 */
export interface BusinessMetadata {
  /** Business objectives */
  objectives: string[];
  
  /** Success metrics */
  successMetrics: SuccessMetric[];
  
  /** Stakeholder mapping */
  stakeholders: StakeholderInfo[];
  
  /** Business value */
  value: {
    financial: number;
    strategic: number;
    operational: number;
  };
  
  /** Market context */
  market: {
    segment: string;
    competition: string[];
    opportunities: string[];
  };
}

/**
 * Success metric
 */
export interface SuccessMetric {
  /** Metric name */
  name: string;
  
  /** Metric type */
  type: 'kpi' | 'okr' | 'metric' | 'target';
  
  /** Target value */
  target: number;
  
  /** Current value */
  current?: number;
  
  /** Measurement unit */
  unit: string;
  
  /** Measurement frequency */
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
}

/**
 * Stakeholder information
 */
export interface StakeholderInfo {
  /** Stakeholder name */
  name: string;
  
  /** Stakeholder role */
  role: string;
  
  /** Stakeholder influence */
  influence: 'low' | 'medium' | 'high';
  
  /** Stakeholder interest */
  interest: 'low' | 'medium' | 'high';
  
  /** Communication preferences */
  communication: string[];
}

/**
 * Technical metadata
 */
export interface TechnicalMetadata {
  /** Architecture patterns */
  architecture: string[];
  
  /** Technology stack */
  stack: {
    frontend: string[];
    backend: string[];
    database: string[];
    infrastructure: string[];
    tools: string[];
  };
  
  /** Technical constraints */
  constraints: TechnicalConstraint[];
  
  /** Performance requirements */
  performance: {
    responseTime: number;
    throughput: number;
    availability: number;
    scalability: string;
  };
  
  /** Security requirements */
  security: {
    classification: 'public' | 'internal' | 'confidential' | 'restricted';
    compliance: string[];
    threats: string[];
  };
}

/**
 * Technical constraint
 */
export interface TechnicalConstraint {
  /** Constraint type */
  type: 'platform' | 'technology' | 'performance' | 'security' | 'compliance';
  
  /** Constraint description */
  description: string;
  
  /** Constraint impact */
  impact: 'low' | 'medium' | 'high';
  
  /** Mitigation strategies */
  mitigation: string[];
}

/**
 * Governance metadata
 */
export interface GovernanceMetadata {
  /** Approval workflows */
  approvals: ApprovalWorkflow[];
  
  /** Compliance requirements */
  compliance: ComplianceRequirement[];
  
  /** Audit trail */
  audit: AuditEntry[];
  
  /** Risk assessment */
  risk: RiskAssessment;
  
  /** Change control */
  changeControl: {
    process: string;
    approvers: string[];
    documentation: string[];
  };
}

/**
 * Approval workflow
 */
export interface ApprovalWorkflow {
  /** Workflow name */
  name: string;
  
  /** Workflow type */
  type: 'sequential' | 'parallel' | 'conditional';
  
  /** Approval steps */
  steps: ApprovalStep[];
  
  /** Workflow status */
  status: 'pending' | 'in_progress' | 'approved' | 'rejected';
}

/**
 * Approval step
 */
export interface ApprovalStep {
  /** Step name */
  name: string;
  
  /** Required approver */
  approver: string;
  
  /** Step status */
  status: 'pending' | 'approved' | 'rejected';
  
  /** Approval date */
  approvedAt?: Date;
  
  /** Approval comments */
  comments?: string;
}

/**
 * Compliance requirement
 */
export interface ComplianceRequirement {
  /** Requirement name */
  name: string;
  
  /** Compliance framework */
  framework: string;
  
  /** Requirement level */
  level: 'mandatory' | 'recommended' | 'optional';
  
  /** Compliance status */
  status: 'compliant' | 'non_compliant' | 'pending' | 'not_applicable';
  
  /** Evidence */
  evidence: string[];
}

/**
 * Audit entry
 */
export interface AuditEntry {
  /** Entry timestamp */
  timestamp: Date;
  
  /** User who performed the action */
  user: string;
  
  /** Action performed */
  action: string;
  
  /** Entity affected */
  entity: {
    type: 'task' | 'epic' | 'project';
    id: string;
  };
  
  /** Action details */
  details: Record<string, unknown>;
  
  /** Audit result */
  result: 'success' | 'failure' | 'partial';
}

/**
 * Risk assessment
 */
export interface RiskAssessment {
  /** Overall risk score */
  overallScore: number;
  
  /** Risk categories */
  categories: {
    technical: number;
    business: number;
    security: number;
    operational: number;
  };
  
  /** Identified risks */
  risks: IdentifiedRisk[];
  
  /** Mitigation strategies */
  mitigation: RiskMitigation[];
  
  /** Assessment date */
  assessedAt: Date;
  
  /** Next review date */
  nextReview: Date;
}

/**
 * Identified risk
 */
export interface IdentifiedRisk {
  /** Risk ID */
  id: string;
  
  /** Risk description */
  description: string;
  
  /** Risk category */
  category: 'technical' | 'business' | 'security' | 'operational';
  
  /** Risk probability */
  probability: 'low' | 'medium' | 'high';
  
  /** Risk impact */
  impact: 'low' | 'medium' | 'high';
  
  /** Risk score */
  score: number;
  
  /** Risk owner */
  owner: string;
}

/**
 * Risk mitigation
 */
export interface RiskMitigation {
  /** Risk ID this mitigation addresses */
  riskId: string;
  
  /** Mitigation strategy */
  strategy: 'avoid' | 'mitigate' | 'transfer' | 'accept';
  
  /** Mitigation actions */
  actions: string[];
  
  /** Mitigation owner */
  owner: string;
  
  /** Implementation timeline */
  timeline: {
    start: Date;
    end: Date;
  };
  
  /** Mitigation status */
  status: 'planned' | 'in_progress' | 'completed' | 'deferred';
}
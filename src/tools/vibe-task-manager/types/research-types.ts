/**
 * Auto-Research Triggering Types
 * 
 * Defines types for automatic research triggering based on project context,
 * task complexity, knowledge gaps, and domain-specific requirements.
 */

import { AtomicTask } from './task.js';
import { ProjectContext } from '../types/project-context.js';
import { ContextResult } from '../services/context-enrichment-service.js';

/**
 * Research trigger conditions
 */
export interface ResearchTriggerConditions {
  /** Project type detection results */
  projectType: {
    isGreenfield: boolean;
    hasExistingCodebase: boolean;
    codebaseMaturity: 'new' | 'developing' | 'mature' | 'legacy';
    confidence: number; // 0-1 scale
  };
  
  /** Task complexity analysis */
  taskComplexity: {
    complexityScore: number; // 0-1 scale
    complexityIndicators: string[];
    estimatedResearchValue: number; // 0-1 scale
    requiresSpecializedKnowledge: boolean;
  };
  
  /** Knowledge gap detection */
  knowledgeGap: {
    contextQuality: number; // 0-1 scale
    relevanceScore: number; // 0-1 scale
    filesFound: number;
    averageRelevance: number;
    hasInsufficientContext: boolean;
  };
  
  /** Domain-specific requirements */
  domainSpecific: {
    technologyStack: string[];
    unfamiliarTechnologies: string[];
    specializedDomain: boolean;
    domainComplexity: number; // 0-1 scale
  };
}

/**
 * Research trigger decision
 */
export interface ResearchTriggerDecision {
  /** Whether research should be triggered */
  shouldTriggerResearch: boolean;
  
  /** Confidence in the decision */
  confidence: number; // 0-1 scale
  
  /** Primary reason for triggering/not triggering */
  primaryReason: 'project_type' | 'task_complexity' | 'knowledge_gap' | 'domain_specific' | 'sufficient_context';
  
  /** Detailed reasoning */
  reasoning: string[];
  
  /** Research scope recommendations */
  recommendedScope: {
    depth: 'shallow' | 'medium' | 'deep';
    focus: 'technical' | 'business' | 'market' | 'comprehensive';
    priority: 'low' | 'medium' | 'high';
    estimatedQueries: number;
  };
  
  /** Trigger conditions that were evaluated */
  evaluatedConditions: ResearchTriggerConditions;
  
  /** Performance metrics */
  metrics: {
    evaluationTime: number;
    conditionsChecked: number;
    cacheHits: number;
  };
}

/**
 * Auto-research detector configuration
 */
export interface AutoResearchDetectorConfig {
  /** Enable/disable auto-research triggering */
  enabled: boolean;
  
  /** Thresholds for triggering research */
  thresholds: {
    /** Minimum complexity score to trigger research */
    minComplexityScore: number;
    
    /** Maximum context quality before skipping research */
    maxContextQuality: number;
    
    /** Minimum confidence required for decisions */
    minDecisionConfidence: number;
    
    /** Minimum files found before considering context sufficient */
    minFilesForSufficientContext: number;
    
    /** Minimum average relevance for sufficient context */
    minAverageRelevance: number;
  };
  
  /** Complexity indicators that suggest research is needed */
  complexityIndicators: {
    /** High-complexity keywords */
    highComplexity: string[];
    
    /** Medium-complexity keywords */
    mediumComplexity: string[];
    
    /** Architecture-related keywords */
    architectural: string[];
    
    /** Integration-related keywords */
    integration: string[];
  };
  
  /** Technology stacks that require specialized knowledge */
  specializedTechnologies: {
    /** Emerging technologies */
    emerging: string[];
    
    /** Complex frameworks */
    complexFrameworks: string[];
    
    /** Enterprise technologies */
    enterprise: string[];
    
    /** Specialized domains */
    domains: string[];
  };
  
  /** Performance settings */
  performance: {
    /** Enable caching of detection results */
    enableCaching: boolean;
    
    /** Cache TTL in milliseconds */
    cacheTTL: number;
    
    /** Maximum evaluation time in milliseconds */
    maxEvaluationTime: number;
    
    /** Enable parallel condition checking */
    enableParallelEvaluation: boolean;
  };
}

/**
 * Research trigger context for evaluation
 */
export interface ResearchTriggerContext {
  /** Task being evaluated */
  task: AtomicTask;
  
  /** Project context */
  projectContext: ProjectContext;
  
  /** Context enrichment results (if available) */
  contextResult?: ContextResult;
  
  /** Project path for analysis */
  projectPath: string;
  
  /** Session ID for tracking */
  sessionId?: string;
  
  /** Additional metadata */
  metadata?: {
    /** Previous research results for this project */
    previousResearch?: string[];
    
    /** User preferences */
    userPreferences?: {
      researchPreference: 'minimal' | 'balanced' | 'comprehensive';
      autoResearchEnabled: boolean;
    };
    
    /** Time constraints */
    timeConstraints?: {
      maxResearchTime: number;
      urgentTask: boolean;
    };
  };
}

/**
 * Research trigger evaluation result
 */
export interface ResearchTriggerEvaluation {
  /** The trigger decision */
  decision: ResearchTriggerDecision;
  
  /** Context used for evaluation */
  context: ResearchTriggerContext;
  
  /** Timestamp of evaluation */
  timestamp: number;
  
  /** Evaluation metadata */
  metadata: {
    /** Detector version */
    detectorVersion: string;
    
    /** Configuration used */
    configSnapshot: Partial<AutoResearchDetectorConfig>;
    
    /** Performance metrics */
    performance: {
      totalTime: number;
      conditionEvaluationTime: number;
      decisionTime: number;
      cacheOperationTime: number;
    };
  };
}

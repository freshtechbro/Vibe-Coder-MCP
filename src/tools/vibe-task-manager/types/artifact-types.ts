/**
 * Artifact Types
 *
 * Defines the structure for external artifact information used in task decomposition
 * and project creation from PRD Generator and Task List Generator outputs.
 */

/**
 * PRD (Product Requirements Document) information
 */
export interface PRDInfo {
  /** File path to the PRD */
  filePath: string;
  
  /** PRD file name */
  fileName: string;
  
  /** Creation timestamp from filename */
  createdAt: Date;
  
  /** Project name extracted from filename */
  projectName: string;
  
  /** File size in bytes */
  fileSize: number;
  
  /** Whether the file is accessible */
  isAccessible: boolean;
  
  /** Last modified timestamp */
  lastModified: Date;
}

/**
 * Task List information
 */
export interface TaskListInfo {
  /** File path to the task list */
  filePath: string;
  
  /** Task list file name */
  fileName: string;
  
  /** Creation timestamp from filename */
  createdAt: Date;
  
  /** Project name extracted from filename */
  projectName: string;
  
  /** File size in bytes */
  fileSize: number;
  
  /** Whether the file is accessible */
  isAccessible: boolean;
  
  /** Last modified timestamp */
  lastModified: Date;
  
  /** Task list type (detailed, summary, etc.) */
  listType: string;
}

/**
 * Parsed PRD content structure
 */
export interface ParsedPRD {
  /** PRD metadata */
  metadata: {
    /** Original file path */
    filePath: string;
    /** Project name */
    projectName: string;
    /** Creation date */
    createdAt: Date;
    /** File size */
    fileSize: number;
  };
  
  /** Project overview */
  overview: {
    /** Product description */
    description: string;
    /** Business goals */
    businessGoals: string[];
    /** Product goals */
    productGoals: string[];
    /** Success metrics */
    successMetrics: string[];
  };
  
  /** Target audience information */
  targetAudience: {
    /** Primary users */
    primaryUsers: string[];
    /** User demographics */
    demographics: string[];
    /** User needs */
    userNeeds: string[];
  };
  
  /** Features and functionality */
  features: {
    /** Feature ID */
    id: string;
    /** Feature title */
    title: string;
    /** Feature description */
    description: string;
    /** User stories */
    userStories: string[];
    /** Acceptance criteria */
    acceptanceCriteria: string[];
    /** Priority level */
    priority: 'low' | 'medium' | 'high' | 'critical';
  }[];
  
  /** Technical considerations */
  technical: {
    /** Technology stack */
    techStack: string[];
    /** Architecture patterns */
    architecturalPatterns: string[];
    /** Performance requirements */
    performanceRequirements: string[];
    /** Security requirements */
    securityRequirements: string[];
    /** Scalability requirements */
    scalabilityRequirements: string[];
  };
  
  /** Project constraints */
  constraints: {
    /** Timeline constraints */
    timeline: string[];
    /** Budget constraints */
    budget: string[];
    /** Resource constraints */
    resources: string[];
    /** Technical constraints */
    technical: string[];
  };
}

/**
 * Task List Item from parsed task list
 */
export interface TaskListItem {
  /** Task ID */
  id: string;

  /** Task title */
  title: string;

  /** Task description */
  description: string;

  /** User story */
  userStory: string;

  /** Priority level */
  priority: 'low' | 'medium' | 'high' | 'critical';

  /** Dependencies */
  dependencies: string[];

  /** Estimated effort */
  estimatedEffort: string;

  /** Phase this task belongs to */
  phase: string;

  /** Original markdown content */
  markdownContent: string;

  /** Sub-tasks if any */
  subTasks?: TaskListItem[];
}

/**
 * Task List Metadata
 */
export interface TaskListMetadata {
  /** Original file path */
  filePath: string;

  /** Project name */
  projectName: string;

  /** Creation date */
  createdAt: Date;

  /** File size */
  fileSize: number;

  /** Total number of tasks */
  totalTasks: number;

  /** Number of phases */
  phaseCount: number;

  /** Task list type */
  listType: string;

  /** Performance metrics */
  performanceMetrics?: {
    parsingTime: number;
    fileSize: number;
    taskCount: number;
    phaseCount: number;
  };
}

/**
 * Parsed Task List content structure
 */
export interface ParsedTaskList {
  /** Task list metadata */
  metadata: TaskListMetadata;

  /** Project overview from task list */
  overview: {
    /** Project description */
    description: string;
    /** Project goals */
    goals: string[];
    /** Technology stack mentioned */
    techStack: string[];
  };

  /** Phases with their tasks */
  phases: {
    /** Phase name */
    name: string;
    /** Phase description */
    description: string;
    /** Tasks in this phase */
    tasks: TaskListItem[];
    /** Estimated duration for phase */
    estimatedDuration: string;
  }[];

  /** Overall project statistics */
  statistics: {
    /** Total estimated hours */
    totalEstimatedHours: number;
    /** Task count by priority */
    tasksByPriority: Record<string, number>;
    /** Task count by phase */
    tasksByPhase: Record<string, number>;
  };
}

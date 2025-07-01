/**
 * Core task and project type definitions for the Vibe Task Manager
 */

/**
 * Represents the status of a task or project
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled' | 'failed';

/**
 * Represents the priority level of a task
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Represents the type of a task
 */
export type TaskType = 'development' | 'testing' | 'documentation' | 'research' | 'deployment' | 'review';

/**
 * Represents an atomic task - the smallest unit of work that cannot be decomposed further
 */
export interface AtomicTask {
  /** Unique identifier in format T#### */
  id: string;

  /** Human-readable title */
  title: string;

  /** Detailed description of the task */
  description: string;

  /** Current status of the task */
  status: TaskStatus;

  /** Priority level */
  priority: TaskPriority;

  /** Type of task */
  type: TaskType;

  /** Estimated duration in hours */
  estimatedHours: number;

  /** Actual hours spent (if completed) */
  actualHours?: number;

  /** Epic this task belongs to */
  epicId: string;

  /** Project this task belongs to */
  projectId: string;

  /** List of task IDs this task depends on */
  dependencies: string[];

  /** List of task IDs that depend on this task */
  dependents: string[];

  /** File paths this task will modify */
  filePaths: string[];

  /** Acceptance criteria for completion */
  acceptanceCriteria: string[];

  /** Testing requirements */
  testingRequirements: {
    unitTests: string[];
    integrationTests: string[];
    performanceTests: string[];
    coverageTarget: number;
  };

  /** Performance criteria */
  performanceCriteria: {
    responseTime?: string;
    memoryUsage?: string;
    throughput?: string;
  };

  /** Quality criteria */
  qualityCriteria: {
    codeQuality: string[];
    documentation: string[];
    typeScript: boolean;
    eslint: boolean;
  };

  /** Integration criteria */
  integrationCriteria: {
    compatibility: string[];
    patterns: string[];
  };

  /** Validation methods */
  validationMethods: {
    automated: string[];
    manual: string[];
  };

  /** Agent assignment information */
  assignedAgent?: string;

  /** Execution context and results */
  executionContext?: {
    sessionId: string;
    startTime?: Date;
    endTime?: Date;
    logs: string[];
    errors: string[];
  };

  /** Creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;

  /** Task start timestamp */
  startedAt?: Date;

  /** Task completion timestamp */
  completedAt?: Date;

  /** User who created this task */
  createdBy: string;

  /** Tags for categorization */
  tags: string[];

  /** Metadata */
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    tags: string[];
  };
}

/**
 * Represents an epic - a collection of related atomic tasks
 */
export interface Epic {
  /** Unique identifier in format E### */
  id: string;

  /** Human-readable title */
  title: string;

  /** Detailed description */
  description: string;

  /** Current status */
  status: TaskStatus;

  /** Priority level */
  priority: TaskPriority;

  /** Project this epic belongs to */
  projectId: string;

  /** Estimated duration in hours */
  estimatedHours: number;

  /** List of task IDs in this epic */
  taskIds: string[];

  /** List of epic IDs this epic depends on */
  dependencies: string[];

  /** List of epic IDs that depend on this epic */
  dependents: string[];

  /** Metadata */
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    tags: string[];
  };
}

/**
 * Represents a project - the top-level container for epics and tasks
 */
export interface Project {
  /** Unique identifier in format PID */
  id: string;

  /** Human-readable name */
  name: string;

  /** Detailed description */
  description: string;

  /** Current status */
  status: TaskStatus;

  /** Project configuration */
  config: ProjectConfig;

  /** List of epic IDs in this project */
  epicIds: string[];

  /** Root directory path for the project */
  rootPath: string;

  /** Technology stack information */
  techStack: {
    languages: string[];
    frameworks: string[];
    tools: string[];
  };

  /** Metadata */
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    tags: string[];
    version: string;
  };
}

/**
 * Project configuration settings
 */
export interface ProjectConfig {
  /** Maximum number of concurrent tasks */
  maxConcurrentTasks: number;

  /** Default task template to use */
  defaultTaskTemplate: string;

  /** Agent configuration */
  agentConfig: {
    maxAgents: number;
    defaultAgent: string;
    agentCapabilities: Record<string, string[] | boolean>;
  };

  /** Performance targets */
  performanceTargets: {
    maxResponseTime: number;
    maxMemoryUsage: number;
    minTestCoverage: number;
  };

  /** Integration settings */
  integrationSettings: {
    codeMapEnabled: boolean;
    researchEnabled: boolean;
    notificationsEnabled: boolean;
  };

  /** File system settings */
  fileSystemSettings: {
    cacheSize: number;
    cacheTTL: number;
    backupEnabled: boolean;
  };
}

/**
 * Task template for generating new tasks
 */
export interface TaskTemplate {
  /** Template identifier */
  id: string;

  /** Template name */
  name: string;

  /** Template description */
  description: string;

  /** Task type this template is for */
  taskType: TaskType;

  /** Template content with placeholders */
  template: {
    title: string;
    description: string;
    estimatedHours: number;
    acceptanceCriteria: string[];
    testingRequirements: AtomicTask['testingRequirements'];
    performanceCriteria: AtomicTask['performanceCriteria'];
    qualityCriteria: AtomicTask['qualityCriteria'];
    integrationCriteria: AtomicTask['integrationCriteria'];
    validationMethods: AtomicTask['validationMethods'];
  };

  /** Parameters that can be substituted */
  parameters: {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array';
    description: string;
    required: boolean;
    defaultValue?: unknown;
  }[];
}

/**
 * Task decomposition result
 */
export interface DecompositionResult {
  /** Original task or epic being decomposed */
  sourceId: string;

  /** Generated atomic tasks */
  atomicTasks: AtomicTask[];

  /** Generated epics (if decomposing a project) */
  epics?: Epic[];

  /** Dependency relationships */
  dependencies: {
    from: string;
    to: string;
    type: 'blocks' | 'enables' | 'requires';
  }[];

  /** Decomposition metadata */
  metadata: {
    decomposedAt: Date;
    decomposedBy: string;
    method: 'llm' | 'template' | 'manual';
    confidence: number;
    atomicityScore: number;
  };
}

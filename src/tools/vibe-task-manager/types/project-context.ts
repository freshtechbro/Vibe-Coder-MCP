/**
 * Project Context Types
 *
 * Defines the structure for project context information used in task decomposition
 * and code map integration.
 */

/**
 * Unified project context information
 * Combines comprehensive project metadata with atomic task analysis requirements
 */
export interface ProjectContext {
  /** Project unique identifier (required for atomic task analysis) */
  projectId: string;

  /** Project root path */
  projectPath: string;

  /** Project name */
  projectName: string;

  /** Project description */
  description?: string;

  /** Programming languages used in the project */
  languages: string[];

  /** Frameworks and libraries used */
  frameworks: string[];

  /** Build tools and package managers */
  buildTools: string[];

  /** Development tools and utilities */
  tools: string[];

  /** Configuration files found */
  configFiles: string[];

  /** Main entry points */
  entryPoints: string[];

  /** Architectural patterns identified */
  architecturalPatterns: string[];

  /** Existing tasks for context (used in atomic analysis) */
  existingTasks: import('./task.js').AtomicTask[];

  /** Codebase size assessment */
  codebaseSize: 'small' | 'medium' | 'large';

  /** Team size for complexity assessment */
  teamSize: number;

  /** Overall project complexity */
  complexity: 'low' | 'medium' | 'high';

  /** Enhanced codebase context from context enrichment service */
  codebaseContext?: {
    relevantFiles: Array<{
      path: string;
      relevance: number;
      type: string;
      size: number;
    }>;
    contextSummary: string;
    gatheringMetrics: {
      searchTime: number;
      readTime: number;
      scoringTime: number;
      totalTime: number;
      cacheHitRate: number;
    };
    totalContextSize: number;
    averageRelevance: number;
  };

  /** Project structure information */
  structure: {
    /** Main source directories */
    sourceDirectories: string[];
    /** Test directories */
    testDirectories: string[];
    /** Documentation directories */
    docDirectories: string[];
    /** Build/output directories */
    buildDirectories: string[];
  };
  
  /** Dependencies information */
  dependencies: {
    /** Production dependencies */
    production: string[];
    /** Development dependencies */
    development: string[];
    /** External packages */
    external: string[];
  };
  
  /** Code map specific context */
  codeMapContext?: {
    /** Whether a code map exists for this project */
    hasCodeMap: boolean;
    /** When the code map was last generated */
    lastGenerated?: Date;
    /** Directory structure from code map */
    directoryStructure: Array<{
      path: string;
      purpose: string;
      fileCount: number;
    }>;
    /** Number of dependencies found */
    dependencyCount: number;
    /** Number of external dependencies */
    externalDependencies: number;
    /** Configuration files identified */
    configFiles: string[];
  };
  
  /** Git repository information */
  git?: {
    /** Whether this is a git repository */
    isRepository: boolean;
    /** Current branch */
    currentBranch?: string;
    /** Remote URL */
    remoteUrl?: string;
    /** Whether there are uncommitted changes */
    hasUncommittedChanges?: boolean;
  };
  
  /** Package manager information */
  packageManager?: {
    /** Type of package manager (npm, yarn, pnpm, etc.) */
    type: string;
    /** Package manager version */
    version?: string;
    /** Lock file present */
    hasLockFile: boolean;
  };
  
  /** Testing framework information */
  testing?: {
    /** Testing frameworks used */
    frameworks: string[];
    /** Test file patterns */
    patterns: string[];
    /** Coverage tools */
    coverageTools: string[];
  };
  
  /** Linting and formatting tools */
  codeQuality?: {
    /** Linters used */
    linters: string[];
    /** Formatters used */
    formatters: string[];
    /** Pre-commit hooks */
    preCommitHooks: string[];
  };
  
  /** CI/CD information */
  cicd?: {
    /** CI/CD platforms used */
    platforms: string[];
    /** Configuration files */
    configFiles: string[];
    /** Deployment targets */
    deploymentTargets: string[];
  };
  
  /** Documentation information */
  documentation?: {
    /** Documentation tools used */
    tools: string[];
    /** Documentation formats */
    formats: string[];
    /** API documentation */
    hasApiDocs: boolean;
  };
  
  /** Environment configuration */
  environment?: {
    /** Environment files */
    envFiles: string[];
    /** Docker configuration */
    hasDocker: boolean;
    /** Container orchestration */
    orchestration: string[];
  };
  
  /** Metadata */
  metadata: {
    /** When this context was created */
    createdAt: Date;
    /** When this context was last updated */
    updatedAt: Date;
    /** Version of the context schema */
    version: string;
    /** Source of the context information */
    source: 'manual' | 'auto-detected' | 'code-map' | 'hybrid';
  };
}

/**
 * Project context creation options
 */
export interface ProjectContextOptions {
  /** Whether to include code map integration */
  includeCodeMap?: boolean;
  
  /** Whether to analyze git repository */
  analyzeGit?: boolean;
  
  /** Whether to detect package manager */
  detectPackageManager?: boolean;
  
  /** Whether to analyze testing setup */
  analyzeTesting?: boolean;
  
  /** Whether to detect CI/CD configuration */
  detectCICD?: boolean;
  
  /** Maximum depth for directory scanning */
  maxDepth?: number;
  
  /** File patterns to ignore */
  ignorePatterns?: string[];
  
  /** Whether to use cached results */
  useCache?: boolean;
}

/**
 * Project context update result
 */
export interface ProjectContextUpdateResult {
  /** Whether the update was successful */
  success: boolean;
  
  /** Updated project context */
  context?: ProjectContext;
  
  /** Error message if update failed */
  error?: string;
  
  /** What was updated */
  updatedFields: string[];
  
  /** Update duration in milliseconds */
  duration: number;
}

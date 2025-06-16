/**
 * Intent Pattern Engine for Natural Language Processing
 * Implements regex-based pattern matching for intent recognition
 */

import { Intent, IntentPattern, RecognizedIntent, ConfidenceLevel } from '../types/nl.js';
import logger from '../../../logger.js';

/**
 * Entity extractor function type
 */
export type EntityExtractor = (text: string, match: RegExpMatchArray) => Record<string, any>;

/**
 * Intent match result
 */
export interface IntentMatch {
  intent: Intent;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  entities: Record<string, any>;
  pattern: IntentPattern;
  matchedText: string;
  processingTime: number;
}

/**
 * Pattern engine configuration
 */
export interface PatternEngineConfig {
  /** Minimum confidence threshold for pattern matches */
  minConfidence: number;
  /** Maximum number of patterns to check per intent */
  maxPatternsPerIntent: number;
  /** Whether to enable fuzzy matching */
  enableFuzzyMatching: boolean;
  /** Fuzzy matching threshold (0-1) */
  fuzzyThreshold: number;
}

/**
 * Default entity extractors for common patterns
 */
export class EntityExtractors {
  /**
   * Extract project name from text
   */
  static projectName(text: string, match: RegExpMatchArray): Record<string, any> {
    const entities: Record<string, any> = {};

    // Look for project name in quotes or after keywords
    const projectPatterns = [
      // Quoted patterns (highest priority)
      /called\s+["']([^"']+)["']/i,
      /project\s+["']([^"']+)["']/i,
      /["']([^"']+)["']\s+project/i,
      /for\s+["']([^"']+)["']/i,
      // Multi-word patterns without quotes (capture until end of string or common stop words)
      /called\s+([A-Za-z0-9\s\-_]+?)(?:\s+(?:project|task|file|document|prd|tasks?|list)|\s*$)/i,
      /project\s+([A-Za-z0-9\s\-_]+?)(?:\s+(?:project|task|file|document|prd|tasks?|list)|\s*$)/i,
      /for\s+(?:the\s+)?([A-Za-z0-9\s\-_]+?)(?:\s+(?:project|task|file|document|prd|tasks?|list)|\s*$)/i,
      // Single word patterns (fallback)
      /called\s+(\w+)/i,
      /project\s+(\w+)/i,
      /for\s+(\w+)/i
    ];

    for (const pattern of projectPatterns) {
      const projectMatch = text.match(pattern);
      if (projectMatch) {
        let projectName = projectMatch[1].trim();

        // Clean up common artifacts
        projectName = projectName.replace(/\s+/g, ' '); // Normalize whitespace
        projectName = projectName.replace(/\s+(project|task|file|document|prd|tasks?|list)$/i, ''); // Remove trailing keywords

        if (projectName.length > 0) {
          entities.projectName = projectName;
          break;
        }
      }
    }

    return entities;
  }

  /**
   * Extract task information from text
   */
  static taskInfo(text: string, match: RegExpMatchArray): Record<string, any> {
    const entities: Record<string, any> = {};

    // Extract task title - try patterns with and without quotes
    const titlePatterns = [
      /task\s+["']([^"']+)["']/i,
      /["']([^"']+)["']\s+task/i,
      /for\s+["']([^"']+)["']/i,
      /called\s+["']([^"']+)["']/i,
      /to\s+["']([^"']+)["']/i,
      // Patterns without quotes
      /called\s+(\w+)/i,
      /for\s+(\w+)/i,
      /task\s+(\w+)/i,
      /(\w+)\s+task/i
    ];

    for (const pattern of titlePatterns) {
      const titleMatch = text.match(pattern);
      if (titleMatch) {
        entities.taskTitle = titleMatch[1].trim();
        break;
      }
    }

    // Extract priority
    const priorityMatch = text.match(/\b(low|medium|high|critical)\s+priority\b/i) ||
                         text.match(/priority\s+(low|medium|high|critical)\b/i);
    if (priorityMatch) {
      entities.priority = priorityMatch[1].toLowerCase();
    }

    // Extract task type
    const typeMatch = text.match(/\b(development|testing|documentation|research|bug|feature)\b/i);
    if (typeMatch) {
      entities.type = typeMatch[1].toLowerCase();
    }

    return entities;
  }

  /**
   * Extract status information from text
   */
  static statusInfo(text: string, match: RegExpMatchArray): Record<string, any> {
    const entities: Record<string, any> = {};

    // Extract status
    const statusMatch = text.match(/\b(pending|in_progress|completed|blocked|cancelled)\b/i);
    if (statusMatch) {
      entities.status = statusMatch[1].toLowerCase();
    }

    // Extract timeframe
    const timePatterns = [
      /\b(today|tomorrow|this\s+week|next\s+week|this\s+month)\b/i,
      /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,
      /\b(\d{4}-\d{2}-\d{2})\b/
    ];

    for (const pattern of timePatterns) {
      const timeMatch = text.match(pattern);
      if (timeMatch) {
        entities.timeframe = timeMatch[1];
        break;
      }
    }

    return entities;
  }

  /**
   * Extract agent information from text
   */
  static agentInfo(text: string, match: RegExpMatchArray): Record<string, any> {
    const entities: Record<string, any> = {};

    // Extract agent name
    const agentPatterns = [
      /agent\s+["']([^"']+)["']/i,
      /to\s+["']([^"']+)["']/i,
      /assign\s+to\s+(\w+)/i,
      /give\s+(\w+)\s+the/i
    ];

    for (const pattern of agentPatterns) {
      const agentMatch = text.match(pattern);
      if (agentMatch) {
        entities.assignee = agentMatch[1].trim();
        break;
      }
    }

    return entities;
  }

  /**
   * Extract description information from text
   */
  static descriptionInfo(text: string, match: RegExpMatchArray): Record<string, any> {
    const entities: Record<string, any> = {};

    // Extract description from various patterns
    const descriptionPatterns = [
      /with\s+focus\s+on\s+(.+)/i,
      /considering\s+(.+)/i,
      /taking\s+into\s+account\s+(.+)/i,
      /for\s+(.+)/i,
      /description\s+["']([^"']+)["']/i,
      /context\s+["']([^"']+)["']/i
    ];

    for (const pattern of descriptionPatterns) {
      const descMatch = text.match(pattern);
      if (descMatch) {
        entities.description = descMatch[1].trim();
        break;
      }
    }

    return entities;
  }

  /**
   * Extract search information from text
   */
  static searchInfo(text: string, match: RegExpMatchArray): Record<string, any> {
    const entities: Record<string, any> = {};

    // Extract search pattern from various formats
    const searchPatterns = [
      /(?:find|search\s+for|locate)\s+(.+?)\s+files?/i,
      /(?:find|search\s+for|locate)\s+(.+)/i,
      /files?\s+(?:named|called|matching)\s+(.+)/i,
      /(.+?)\s+files?/i,
      /"([^"]+)"/,
      /'([^']+)'/
    ];

    for (const pattern of searchPatterns) {
      const searchMatch = text.match(pattern);
      if (searchMatch) {
        entities.searchPattern = searchMatch[1].trim();
        break;
      }
    }

    // Extract file extensions
    const extMatch = text.match(/\.(\w+)\s+files?|(\w+)\s+files?/);
    if (extMatch) {
      const ext = extMatch[1] || extMatch[2];
      if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'css', 'html'].includes(ext)) {
        entities.extensions = [`.${ext}`];
      }
    }

    return entities;
  }

  /**
   * Extract content search information from text
   */
  static contentInfo(text: string, match: RegExpMatchArray): Record<string, any> {
    const entities: Record<string, any> = {};

    // Extract search query from various patterns
    const contentPatterns = [
      /(?:find|search\s+for|locate)\s+(.+?)\s+(?:in\s+files?|in\s+code)/i,
      /(?:find|search\s+for|locate)\s+"(.+?)"/i,
      /(?:find|search\s+for|locate)\s+'(.+?)'/i,
      /(?:find|search\s+for|locate)\s+(.+)/i,
      /content\s+(?:containing|with)\s+(.+)/i
    ];

    for (const pattern of contentPatterns) {
      const contentMatch = text.match(pattern);
      if (contentMatch) {
        entities.searchQuery = contentMatch[1].trim();
        entities.content = contentMatch[1].trim();
        break;
      }
    }

    // Check for case sensitivity
    if (text.toLowerCase().includes('case sensitive') || text.toLowerCase().includes('exact case')) {
      entities.caseSensitive = true;
    }

    // Check for regex
    if (text.toLowerCase().includes('regex') || text.toLowerCase().includes('regular expression')) {
      entities.useRegex = true;
    }

    return entities;
  }

  /**
   * Extract artifact information from text
   */
  static artifactInfo(text: string, match: RegExpMatchArray): Record<string, any> {
    const entities: Record<string, any> = {};

    // Extract artifact type
    const artifactTypePatterns = [
      /\b(prd|product\s+requirements?\s+document)\b/i,
      /\b(task\s+list|tasks?)\b/i,
      /\b(task\s+breakdown)\b/i,
      /\b(artifact|document|file)\b/i
    ];

    for (const pattern of artifactTypePatterns) {
      const typeMatch = text.match(pattern);
      if (typeMatch) {
        let artifactType = typeMatch[1].toLowerCase();
        // Normalize artifact types
        if (artifactType.includes('prd') || artifactType.includes('product') || artifactType.includes('requirements')) {
          artifactType = 'prd';
        } else if (artifactType.includes('task')) {
          artifactType = 'tasks';
        } else if (artifactType.includes('artifact') || artifactType.includes('document') || artifactType.includes('file')) {
          artifactType = 'artifact';
        }
        entities.artifactType = artifactType;
        break;
      }
    }

    // Extract file path
    const filePathPatterns = [
      /from\s+["']([^"']+)["']/i,
      /from\s+(\S+\.(?:md|txt|json|yaml|yml))/i,
      /from\s+(\S+)/i,
      /["']([^"']*\.(?:md|txt|json|yaml|yml))["']/i,
      /(\S+\.(?:md|txt|json|yaml|yml))/i
    ];

    for (const pattern of filePathPatterns) {
      const pathMatch = text.match(pattern);
      if (pathMatch) {
        entities.filePath = pathMatch[1].trim();
        break;
      }
    }

    return entities;
  }

  /**
   * Extract general entities from text
   */
  static general(text: string, match: RegExpMatchArray): Record<string, any> {
    const entities: Record<string, any> = {};

    // Extract tags
    const tagMatches = text.match(/#(\w+)/g);
    if (tagMatches) {
      entities.tags = tagMatches.map(tag => tag.substring(1));
    }

    // Extract numbers (could be IDs, hours, etc.)
    const numberMatches = text.match(/\b\d+\b/g);
    if (numberMatches) {
      entities.numbers = numberMatches.map(num => parseInt(num, 10));
    }

    return entities;
  }
}

/**
 * Intent Pattern Engine implementation
 */
export class IntentPatternEngine {
  private patterns = new Map<Intent, IntentPattern[]>();
  private config: PatternEngineConfig;

  constructor(config: Partial<PatternEngineConfig> = {}) {
    this.config = {
      minConfidence: config.minConfidence ?? 0.3,
      maxPatternsPerIntent: config.maxPatternsPerIntent ?? 10,
      enableFuzzyMatching: config.enableFuzzyMatching ?? false,
      fuzzyThreshold: config.fuzzyThreshold ?? 0.7
    };

    this.initializeDefaultPatterns();
  }

  /**
   * Initialize default patterns for common intents
   */
  private initializeDefaultPatterns(): void {
    // Project creation patterns - Enhanced with more diverse variations
    this.addPattern('create_project', {
      id: 'create_project_basic',
      intent: 'create_project',
      patterns: [
        'create\\s+(?:a\\s+)?(?:new\\s+)?project',
        'start\\s+(?:a\\s+)?(?:new\\s+)?project',
        'set\\s+up\\s+(?:a\\s+)?(?:new\\s+)?project',
        'initialize\\s+(?:a\\s+)?(?:new\\s+)?project',
        'create\\s+(?:something\\s+)?(?:new\\s+)?(?:for\\s+the\\s+)?project',
        'make\\s+(?:a\\s+)?(?:new\\s+)?project',
        // Enhanced patterns for diverse commands
        'build\\s+(?:a\\s+)?(?:new\\s+)?project',
        'develop\\s+(?:a\\s+)?(?:new\\s+)?project',
        'generate\\s+(?:a\\s+)?(?:new\\s+)?project',
        'setup\\s+(?:a\\s+)?(?:new\\s+)?project',
        'begin\\s+(?:a\\s+)?(?:new\\s+)?project',
        'launch\\s+(?:a\\s+)?(?:new\\s+)?project',
        'establish\\s+(?:a\\s+)?(?:new\\s+)?project',
        'initiate\\s+(?:a\\s+)?(?:new\\s+)?project',
        // Natural variations
        '(?:let\'s\\s+)?(?:create|start|build|make)\\s+(?:a\\s+)?(?:new\\s+)?project',
        'i\\s+(?:want\\s+to\\s+|need\\s+to\\s+)?(?:create|start|build|make)\\s+(?:a\\s+)?(?:new\\s+)?project',
        'can\\s+(?:you\\s+)?(?:create|start|build|make)\\s+(?:a\\s+)?(?:new\\s+)?project'
      ],
      keywords: ['create', 'start', 'setup', 'initialize', 'project', 'new', 'make', 'build', 'develop', 'generate', 'launch'],
      requiredEntities: [],
      optionalEntities: ['projectName', 'description'],
      priority: 10,
      active: true,
      examples: [
        'Create a new project called "Web App"',
        'Start a project for the mobile app',
        'Set up a new project',
        'Build a new project for streaming platform',
        'Let\'s create a new project',
        'I want to create a project',
        'Can you make a new project?'
      ]
    });

    // Task creation patterns
    this.addPattern('create_task', {
      id: 'create_task_basic',
      intent: 'create_task',
      patterns: [
        'create\\s+(?:a\\s+)?(?:new\\s+)?(?:high\\s+priority\\s+)?(?:development\\s+)?task',
        'add\\s+(?:a\\s+)?(?:new\\s+)?task',
        'make\\s+(?:a\\s+)?(?:new\\s+)?task',
        'need\\s+(?:a\\s+)?(?:new\\s+)?task',
        'create\\s+(?:a\\s+)?(?:high|medium|low|critical)\\s+priority\\s+(?:development|testing|documentation|research|bug|feature)\\s+task',
        'create\\s+(?:a\\s+)?(?:development|testing|documentation|research|bug|feature)\\s+task'
      ],
      keywords: ['create', 'add', 'make', 'need', 'task', 'new', 'priority', 'development', 'high'],
      requiredEntities: [],
      optionalEntities: ['taskTitle', 'priority', 'type', 'assignee'],
      priority: 10,
      active: true,
      examples: [
        'Create a task for implementing authentication',
        'Add a new task to fix the login bug',
        'Make a task for testing the API',
        'Create a high priority development task for implementing authentication'
      ]
    });

    // Listing patterns
    this.addPattern('list_projects', {
      id: 'list_projects_basic',
      intent: 'list_projects',
      patterns: [
        'list\\s+(?:all\\s+)?projects',
        'show\\s+(?:me\\s+)?(?:all\\s+)?projects',
        'display\\s+(?:all\\s+)?projects',
        'what\\s+projects',
        'show\\s+(?:me\\s+)?(?:all\\s+)?(?:completed|pending|in_progress|blocked|cancelled)\\s+projects',
        'list\\s+(?:all\\s+)?(?:completed|pending|in_progress)\\s+projects',
        'show\\s+(?:me\\s+)?(?:all\\s+)?(?:completed|pending|in_progress|blocked|cancelled)\\s+projects\\s+(?:from\\s+)?(?:today|tomorrow|this\\s+week|next\\s+week|this\\s+month)'
      ],
      keywords: ['list', 'show', 'display', 'projects', 'all', 'completed', 'pending', 'week'],
      requiredEntities: [],
      optionalEntities: ['status', 'timeframe'],
      priority: 10,
      active: true,
      examples: [
        'List all projects',
        'Show me the projects',
        'What projects do we have?',
        'Show me all completed projects from this week'
      ]
    });

    // Task listing patterns
    this.addPattern('list_tasks', {
      id: 'list_tasks_basic',
      intent: 'list_tasks',
      patterns: [
        'list\\s+(?:all\\s+)?tasks',
        'show\\s+(?:me\\s+)?(?:all\\s+)?tasks',
        'display\\s+(?:all\\s+)?tasks',
        'what\\s+tasks',
        'show\\s+(?:completed|pending|in_progress|blocked|cancelled)\\s+tasks',
        'list\\s+(?:all\\s+)?(?:pending|completed|in_progress)\\s+tasks',
        'show\\s+(?:completed|pending|in_progress|blocked|cancelled)\\s+tasks\\s+(?:from\\s+)?(?:today|tomorrow|this\\s+week|next\\s+week|this\\s+month)',
        'list\\s+(?:all\\s+)?(?:pending|completed|in_progress)\\s+tasks\\s+assigned\\s+to\\s+me'
      ],
      keywords: ['list', 'show', 'display', 'tasks', 'all', 'completed', 'pending', 'today', 'assigned'],
      requiredEntities: [],
      optionalEntities: ['status', 'priority', 'assignee', 'timeframe'],
      priority: 10,
      active: true,
      examples: [
        'List all tasks',
        'Show me pending tasks',
        'What tasks are assigned to me?',
        'Show completed tasks from today',
        'List all pending tasks assigned to me'
      ]
    });

    // Status checking patterns
    this.addPattern('check_status', {
      id: 'check_status_basic',
      intent: 'check_status',
      patterns: [
        'status\\s+of',
        'check\\s+(?:the\\s+)?status',
        'what(?:\'s|\\s+is)\\s+the\\s+status',
        'how\\s+is\\s+.+\\s+(?:going|progressing)',
        'show\\s+(?:project\\s+)?status',
        'show\\s+(?:me\\s+)?(?:the\\s+)?(?:project\\s+)?status',
        'what(?:\'s|\\s+is)\\s+the\\s+status\\s+of\\s+the\\s+.+\\s+(?:application\\s+)?project'
      ],
      keywords: ['status', 'check', 'progress', 'how', 'going', 'show', 'project'],
      requiredEntities: [],
      optionalEntities: ['projectName', 'taskId'],
      priority: 10,
      active: true,
      examples: [
        'What\'s the status of the web project?',
        'Check the status of task 123',
        'How is the development going?',
        'Show project status',
        'What\'s the status of the web application project?'
      ]
    });

    // Task execution patterns
    this.addPattern('run_task', {
      id: 'run_task_basic',
      intent: 'run_task',
      patterns: [
        'run\\s+(?:the\\s+)?(?:\\w+\\s+)?task',
        'execute\\s+(?:the\\s+)?(?:\\w+\\s+)?task',
        'start\\s+(?:working\\s+on\\s+)?(?:the\\s+)?(?:\\w+\\s+)?task',
        'begin\\s+(?:the\\s+)?(?:\\w+\\s+)?task',
        'run\\s+(?:task\\s+)?\\d+',
        'execute\\s+(?:task\\s+)?\\d+',
        'run\\s+(?:the\\s+)?\\w+\\s+task',
        'execute\\s+(?:the\\s+)?\\w+\\s+task'
      ],
      keywords: ['run', 'execute', 'start', 'begin', 'task', 'authentication'],
      requiredEntities: [],
      optionalEntities: ['taskId', 'taskTitle'],
      priority: 10,
      active: true,
      examples: [
        'Run task 123',
        'Execute the authentication task',
        'Start working on the login feature',
        'Run the authentication task'
      ]
    });

    // Task decomposition patterns
    this.addPattern('decompose_task', {
      id: 'decompose_task_basic',
      intent: 'decompose_task',
      patterns: [
        'decompose\\s+(?:the\\s+)?(?:\\w+\\s+)?task',
        'break\\s+down\\s+(?:the\\s+)?(?:\\w+\\s+)?task',
        'split\\s+(?:up\\s+)?(?:the\\s+)?(?:\\w+\\s+)?task',
        'divide\\s+(?:the\\s+)?(?:\\w+\\s+)?task',
        'breakdown\\s+(?:the\\s+)?(?:\\w+\\s+)?task',
        'decompose\\s+task\\s+\\w+',
        'break\\s+down\\s+task\\s+\\w+',
        'split\\s+task\\s+\\w+'
      ],
      keywords: ['decompose', 'break down', 'split', 'divide', 'breakdown', 'task'],
      requiredEntities: [],
      optionalEntities: ['taskId', 'description'],
      priority: 10,
      active: true,
      examples: [
        'Decompose task T001',
        'Break down the authentication task',
        'Split up this task',
        'Decompose the login feature task'
      ]
    });

    // Project decomposition patterns - Enhanced with more natural variations
    this.addPattern('decompose_project', {
      id: 'decompose_project_basic',
      intent: 'decompose_project',
      patterns: [
        'decompose\\s+(?:the\\s+)?(?:\\w+\\s+)?project',
        'break\\s+down\\s+(?:the\\s+)?(?:\\w+\\s+)?project',
        'split\\s+(?:up\\s+)?(?:the\\s+)?(?:\\w+\\s+)?project',
        'divide\\s+(?:the\\s+)?(?:\\w+\\s+)?project',
        'breakdown\\s+(?:the\\s+)?(?:\\w+\\s+)?project',
        'decompose\\s+project\\s+\\w+',
        'break\\s+down\\s+project\\s+\\w+',
        // Enhanced natural language variations
        'analyze\\s+(?:the\\s+)?(?:\\w+\\s+)?project',
        'plan\\s+(?:out\\s+)?(?:the\\s+)?(?:\\w+\\s+)?project',
        'organize\\s+(?:the\\s+)?(?:\\w+\\s+)?project',
        'structure\\s+(?:the\\s+)?(?:\\w+\\s+)?project',
        'outline\\s+(?:the\\s+)?(?:\\w+\\s+)?project',
        // Conversational patterns
        '(?:can\\s+you\\s+)?(?:decompose|break\\s+down|analyze)\\s+(?:this\\s+|the\\s+)?project',
        'i\\s+(?:want\\s+to\\s+|need\\s+to\\s+)?(?:decompose|break\\s+down|analyze)\\s+(?:this\\s+|the\\s+)?project',
        '(?:let\'s\\s+)?(?:decompose|break\\s+down|analyze)\\s+(?:this\\s+|the\\s+)?project',
        // Task-oriented patterns
        'create\\s+tasks\\s+for\\s+(?:the\\s+)?(?:\\w+\\s+)?project',
        'generate\\s+tasks\\s+for\\s+(?:the\\s+)?(?:\\w+\\s+)?project'
      ],
      keywords: ['decompose', 'break down', 'split', 'divide', 'breakdown', 'project', 'analyze', 'plan', 'organize', 'tasks'],
      requiredEntities: [],
      optionalEntities: ['projectId', 'projectName', 'description'],
      priority: 10,
      active: true,
      examples: [
        'Decompose project PID-WEBAPP-001',
        'Break down the web app project',
        'Analyze this project',
        'Can you decompose the project?',
        'I need to break down this project',
        'Create tasks for the streaming project'
      ]
    });

    // File search patterns
    this.addPattern('search_files', {
      id: 'search_files_basic',
      intent: 'search_files',
      patterns: [
        'find\\s+(?:all\\s+)?(?:\\w+\\s+)?files?',
        'search\\s+(?:for\\s+)?(?:all\\s+)?(?:\\w+\\s+)?files?',
        'locate\\s+(?:all\\s+)?(?:\\w+\\s+)?files?',
        'show\\s+(?:me\\s+)?(?:all\\s+)?(?:\\w+\\s+)?files?',
        'list\\s+(?:all\\s+)?(?:\\w+\\s+)?files?',
        'find\\s+files?\\s+(?:named|called|matching)\\s+\\w+',
        'search\\s+files?\\s+(?:named|called|matching)\\s+\\w+'
      ],
      keywords: ['find', 'search', 'locate', 'show', 'list', 'files', 'file'],
      requiredEntities: [],
      optionalEntities: ['searchPattern', 'fileName', 'extensions'],
      priority: 10,
      active: true,
      examples: [
        'Find auth files',
        'Search for component files',
        'Locate all .ts files',
        'Show me test files'
      ]
    });

    // Content search patterns
    this.addPattern('search_content', {
      id: 'search_content_basic',
      intent: 'search_content',
      patterns: [
        'find\\s+(?:all\\s+)?(?:instances\\s+of\\s+)?\\w+\\s+(?:in\\s+)?(?:files?|code)',
        'search\\s+(?:for\\s+)?(?:all\\s+)?(?:instances\\s+of\\s+)?\\w+\\s+(?:in\\s+)?(?:files?|code)',
        'locate\\s+(?:all\\s+)?(?:instances\\s+of\\s+)?\\w+\\s+(?:in\\s+)?(?:files?|code)',
        'find\\s+content\\s+(?:containing|with)\\s+\\w+',
        'search\\s+content\\s+(?:containing|with)\\s+\\w+',
        'find\\s+"[^"]+"\\s+(?:in\\s+)?(?:files?|code)',
        'search\\s+"[^"]+"\\s+(?:in\\s+)?(?:files?|code)'
      ],
      keywords: ['find', 'search', 'locate', 'content', 'code', 'in files', 'instances'],
      requiredEntities: [],
      optionalEntities: ['searchQuery', 'content', 'extensions'],
      priority: 10,
      active: true,
      examples: [
        'Find useState in files',
        'Search for authentication code',
        'Locate all instances of "login"',
        'Find content containing API'
      ]
    });

    // PRD parsing patterns
    this.addPattern('parse_prd', {
      id: 'parse_prd_basic',
      intent: 'parse_prd',
      patterns: [
        'parse\\s+(?:the\\s+)?(?:prd|product\\s+requirements?\\s+document)',
        'load\\s+(?:the\\s+)?(?:prd|product\\s+requirements?\\s+document)',
        'read\\s+(?:the\\s+)?(?:prd|product\\s+requirements?\\s+document)',
        'process\\s+(?:the\\s+)?(?:prd|product\\s+requirements?\\s+document)',
        'analyze\\s+(?:the\\s+)?(?:prd|product\\s+requirements?\\s+document)',
        'import\\s+(?:the\\s+)?(?:prd|product\\s+requirements?\\s+document)',
        'open\\s+(?:the\\s+)?(?:prd|product\\s+requirements?\\s+document)',
        // With project context
        'parse\\s+(?:the\\s+)?(?:prd|product\\s+requirements?\\s+document)\\s+for\\s+(?:the\\s+)?(?:project\\s+)?\\w+',
        'load\\s+(?:the\\s+)?(?:prd|product\\s+requirements?\\s+document)\\s+for\\s+(?:the\\s+)?(?:project\\s+)?\\w+',
        'parse\\s+(?:prd|product\\s+requirements?\\s+document)\\s+for\\s+["\'](.*?)["\']',
        // Shortened forms
        'parse\\s+prd',
        'load\\s+prd',
        'read\\s+prd',
        'process\\s+prd',
        'analyze\\s+prd',
        'import\\s+prd',
        'open\\s+prd'
      ],
      keywords: ['parse', 'load', 'read', 'process', 'analyze', 'import', 'open', 'prd', 'product', 'requirements', 'document'],
      requiredEntities: [],
      optionalEntities: ['projectName', 'filePath'],
      priority: 10,
      active: true,
      examples: [
        'Parse the PRD',
        'Load PRD for my project',
        'Read the product requirements document',
        'Process PRD file',
        'Analyze the PRD',
        'Parse PRD for "E-commerce Platform"',
        'Load the product requirements document for the web app'
      ]
    });

    // Task list parsing patterns
    this.addPattern('parse_tasks', {
      id: 'parse_tasks_basic',
      intent: 'parse_tasks',
      patterns: [
        'parse\\s+(?:the\\s+)?(?:task\\s+list|tasks?)',
        'load\\s+(?:the\\s+)?(?:task\\s+list|tasks?)',
        'read\\s+(?:the\\s+)?(?:task\\s+list|tasks?)',
        'process\\s+(?:the\\s+)?(?:task\\s+list|tasks?)',
        'analyze\\s+(?:the\\s+)?(?:task\\s+list|tasks?)',
        'import\\s+(?:the\\s+)?(?:task\\s+list|tasks?)',
        'open\\s+(?:the\\s+)?(?:task\\s+list|tasks?)',
        // With project context
        'parse\\s+(?:the\\s+)?(?:task\\s+list|tasks?)\\s+for\\s+(?:the\\s+)?(?:project\\s+)?\\w+',
        'load\\s+(?:the\\s+)?(?:task\\s+list|tasks?)\\s+for\\s+(?:the\\s+)?(?:project\\s+)?\\w+',
        'parse\\s+(?:task\\s+list|tasks?)\\s+for\\s+["\'](.*?)["\']',
        // Alternative forms
        'parse\\s+(?:the\\s+)?(?:task\\s+breakdown|task\\s+file)',
        'load\\s+(?:the\\s+)?(?:task\\s+breakdown|task\\s+file)',
        'read\\s+(?:the\\s+)?(?:task\\s+breakdown|task\\s+file)',
        'process\\s+(?:the\\s+)?(?:task\\s+breakdown|task\\s+file)',
        'analyze\\s+(?:the\\s+)?(?:task\\s+breakdown|task\\s+file)'
      ],
      keywords: ['parse', 'load', 'read', 'process', 'analyze', 'import', 'open', 'task', 'tasks', 'list', 'breakdown', 'file'],
      requiredEntities: [],
      optionalEntities: ['projectName', 'filePath'],
      priority: 10,
      active: true,
      examples: [
        'Parse the task list',
        'Load task list for project',
        'Read the tasks file',
        'Process task list',
        'Analyze the task breakdown',
        'Parse tasks for "Mobile App"',
        'Load the task list for the web application'
      ]
    });

    // Artifact import patterns
    this.addPattern('import_artifact', {
      id: 'import_artifact_basic',
      intent: 'import_artifact',
      patterns: [
        'import\\s+(?:prd|product\\s+requirements?\\s+document)\\s+from\\s+\\S+',
        'import\\s+(?:task\\s+list|tasks?)\\s+from\\s+\\S+',
        'import\\s+(?:artifact|document|file)\\s+from\\s+\\S+',
        'load\\s+(?:prd|product\\s+requirements?\\s+document)\\s+from\\s+\\S+',
        'load\\s+(?:task\\s+list|tasks?)\\s+from\\s+\\S+',
        'load\\s+(?:artifact|document|file)\\s+from\\s+\\S+',
        // With file paths
        'import\\s+(?:prd|product\\s+requirements?\\s+document)\\s+from\\s+["\'](.*?)["\']',
        'import\\s+(?:task\\s+list|tasks?)\\s+from\\s+["\'](.*?)["\']',
        'import\\s+(?:artifact|document|file)\\s+from\\s+["\'](.*?)["\']',
        'load\\s+(?:prd|product\\s+requirements?\\s+document)\\s+from\\s+["\'](.*?)["\']',
        'load\\s+(?:task\\s+list|tasks?)\\s+from\\s+["\'](.*?)["\']',
        'load\\s+(?:artifact|document|file)\\s+from\\s+["\'](.*?)["\']',
        // Simplified forms
        'import\\s+prd\\s+from\\s+\\S+',
        'import\\s+tasks?\\s+from\\s+\\S+',
        'load\\s+prd\\s+from\\s+\\S+',
        'load\\s+tasks?\\s+from\\s+\\S+',
        'import\\s+from\\s+\\S+',
        'load\\s+from\\s+\\S+',
        // Forms without explicit "from"
        'load\\s+(?:prd|product\\s+requirements?\\s+document)\\s+file',
        'load\\s+(?:task\\s+list|tasks?)\\s+file',
        'import\\s+(?:prd|product\\s+requirements?\\s+document)\\s+file',
        'import\\s+(?:task\\s+list|tasks?)\\s+file',
        'load\\s+prd\\s+file',
        'load\\s+tasks?\\s+file',
        'import\\s+prd\\s+file',
        'import\\s+tasks?\\s+file'
      ],
      keywords: ['import', 'load', 'from', 'prd', 'product', 'requirements', 'document', 'task', 'tasks', 'list', 'artifact', 'file'],
      requiredEntities: [],
      optionalEntities: ['artifactType', 'filePath', 'projectName'],
      priority: 10,
      active: true,
      examples: [
        'Import PRD from file.md',
        'Load task list from path/to/file.md',
        'Import artifact from document.md',
        'Load PRD file',
        'Import tasks from file',
        'Import PRD from "/path/to/requirements.md"',
        'Load task list from "project-tasks.md"'
      ]
    });

    logger.info({ patternCount: this.getTotalPatternCount() }, 'Default patterns initialized');
  }

  /**
   * Add a pattern for an intent
   */
  addPattern(intent: Intent, pattern: IntentPattern): void {
    if (!this.patterns.has(intent)) {
      this.patterns.set(intent, []);
    }

    const intentPatterns = this.patterns.get(intent)!;

    // Check if pattern already exists
    const existingPattern = intentPatterns.find(p => p.id === pattern.id);
    if (existingPattern) {
      logger.warn({ patternId: pattern.id, intent }, 'Pattern already exists, updating');
      Object.assign(existingPattern, pattern);
    } else {
      intentPatterns.push(pattern);
      intentPatterns.sort((a, b) => b.priority - a.priority); // Sort by priority descending
    }

    logger.debug({ patternId: pattern.id, intent, priority: pattern.priority }, 'Pattern added');
  }

  /**
   * Remove a pattern by ID
   */
  removePattern(intent: Intent, patternId: string): boolean {
    const intentPatterns = this.patterns.get(intent);
    if (!intentPatterns) {
      return false;
    }

    const index = intentPatterns.findIndex(p => p.id === patternId);
    if (index === -1) {
      return false;
    }

    intentPatterns.splice(index, 1);
    logger.debug({ patternId, intent }, 'Pattern removed');
    return true;
  }

  /**
   * Match intent from text using pattern matching
   */
  matchIntent(text: string): IntentMatch[] {
    const startTime = Date.now();
    const matches: IntentMatch[] = [];
    const normalizedText = text.toLowerCase().trim();

    for (const [intent, intentPatterns] of this.patterns) {
      for (const pattern of intentPatterns) {
        if (!pattern.active) continue;

        const match = this.matchPattern(normalizedText, pattern, text);
        if (match) {
          matches.push({
            intent,
            confidence: match.confidence,
            confidenceLevel: this.getConfidenceLevel(match.confidence),
            entities: match.entities,
            pattern,
            matchedText: match.matchedText,
            processingTime: Date.now() - startTime
          });
        }
      }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);

    // Filter by minimum confidence
    const filteredMatches = matches.filter(m => m.confidence >= this.config.minConfidence);

    logger.debug({
      inputLength: text.length,
      totalMatches: matches.length,
      filteredMatches: filteredMatches.length,
      processingTime: Date.now() - startTime
    }, 'Intent matching completed');

    return filteredMatches;
  }

  /**
   * Match a single pattern against text
   */
  private matchPattern(text: string, pattern: IntentPattern, originalText: string): {
    confidence: number;
    entities: Record<string, any>;
    matchedText: string;
  } | null {
    let bestMatch: RegExpMatchArray | null = null;
    let bestConfidence = 0;

    // Try each regex pattern
    for (const patternStr of pattern.patterns) {
      try {
        const regex = new RegExp(patternStr, 'i');
        const match = text.match(regex);

        if (match) {
          // Calculate confidence based on match quality
          const confidence = this.calculatePatternConfidence(text, match, pattern);

          if (confidence > bestConfidence) {
            bestMatch = match;
            bestConfidence = confidence;
          }
        }
      } catch (error) {
        logger.warn({ pattern: patternStr, error }, 'Invalid regex pattern');
      }
    }

    if (!bestMatch || bestConfidence < this.config.minConfidence) {
      return null;
    }

    // Extract entities using original text to preserve case
    const entities = this.extractEntities(originalText, bestMatch, pattern);

    return {
      confidence: bestConfidence,
      entities,
      matchedText: bestMatch[0]
    };
  }

  /**
   * Calculate confidence score for a pattern match
   */
  private calculatePatternConfidence(text: string, match: RegExpMatchArray, pattern: IntentPattern): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence for exact keyword matches
    const keywordMatches = pattern.keywords.filter(keyword =>
      text.toLowerCase().includes(keyword.toLowerCase())
    );
    confidence += (keywordMatches.length / pattern.keywords.length) * 0.3;

    // Boost confidence for longer matches
    const matchRatio = match[0].length / text.length;
    confidence += Math.min(matchRatio * 0.2, 0.2);

    // Boost confidence for matches at the beginning of text
    if (match.index === 0) {
      confidence += 0.1;
    }

    // Ensure confidence is within bounds
    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * Extract entities from matched text
   */
  private extractEntities(originalText: string, match: RegExpMatchArray, pattern: IntentPattern): Record<string, any> {
    const entities: Record<string, any> = {};

    // Apply built-in entity extractors based on intent using original text to preserve case
    switch (pattern.intent) {
      case 'create_project':
      case 'open_project':
        Object.assign(entities, EntityExtractors.projectName(originalText, match));
        break;
      case 'create_task':
      case 'run_task':
        Object.assign(entities, EntityExtractors.taskInfo(originalText, match));
        break;
      case 'list_projects':
        Object.assign(entities, EntityExtractors.statusInfo(originalText, match));
        break;
      case 'list_tasks':
        Object.assign(entities, EntityExtractors.statusInfo(originalText, match));
        Object.assign(entities, EntityExtractors.agentInfo(originalText, match));
        break;
      case 'check_status':
        Object.assign(entities, EntityExtractors.statusInfo(originalText, match));
        Object.assign(entities, EntityExtractors.projectName(originalText, match));
        break;
      case 'assign_task':
        Object.assign(entities, EntityExtractors.agentInfo(originalText, match));
        Object.assign(entities, EntityExtractors.taskInfo(originalText, match));
        break;
      case 'decompose_task':
        Object.assign(entities, EntityExtractors.taskInfo(originalText, match));
        Object.assign(entities, EntityExtractors.descriptionInfo(originalText, match));
        break;
      case 'decompose_project':
        Object.assign(entities, EntityExtractors.projectName(originalText, match));
        Object.assign(entities, EntityExtractors.descriptionInfo(originalText, match));
        break;
      case 'search_files':
        Object.assign(entities, EntityExtractors.searchInfo(originalText, match));
        break;
      case 'search_content':
        Object.assign(entities, EntityExtractors.searchInfo(originalText, match));
        Object.assign(entities, EntityExtractors.contentInfo(originalText, match));
        break;
      case 'parse_prd':
        Object.assign(entities, EntityExtractors.projectName(originalText, match));
        Object.assign(entities, EntityExtractors.artifactInfo(originalText, match));
        break;
      case 'parse_tasks':
        Object.assign(entities, EntityExtractors.projectName(originalText, match));
        Object.assign(entities, EntityExtractors.artifactInfo(originalText, match));
        break;
      case 'import_artifact':
        Object.assign(entities, EntityExtractors.projectName(originalText, match));
        Object.assign(entities, EntityExtractors.artifactInfo(originalText, match));
        break;
    }

    // Always apply general extractors
    Object.assign(entities, EntityExtractors.general(originalText, match));

    return entities;
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
   * Get total number of patterns across all intents
   */
  getTotalPatternCount(): number {
    let total = 0;
    for (const patterns of this.patterns.values()) {
      total += patterns.length;
    }
    return total;
  }

  /**
   * Get patterns for a specific intent
   */
  getPatternsForIntent(intent: Intent): IntentPattern[] {
    return this.patterns.get(intent) || [];
  }

  /**
   * Get all supported intents
   */
  getSupportedIntents(): Intent[] {
    return Array.from(this.patterns.keys());
  }

  /**
   * Update pattern engine configuration
   */
  updateConfig(config: Partial<PatternEngineConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info({ config: this.config }, 'Pattern engine configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): PatternEngineConfig {
    return { ...this.config };
  }

  /**
   * Clear all patterns
   */
  clearPatterns(): void {
    this.patterns.clear();
    logger.info('All patterns cleared');
  }

  /**
   * Export patterns to JSON
   */
  exportPatterns(): Record<string, IntentPattern[]> {
    const exported: Record<string, IntentPattern[]> = {};
    for (const [intent, patterns] of this.patterns) {
      exported[intent] = patterns;
    }
    return exported;
  }

  /**
   * Import patterns from JSON
   */
  importPatterns(patterns: Record<string, IntentPattern[]>): void {
    this.clearPatterns();
    for (const [intent, intentPatterns] of Object.entries(patterns)) {
      for (const pattern of intentPatterns) {
        this.addPattern(intent as Intent, pattern);
      }
    }
    logger.info({ intentCount: Object.keys(patterns).length }, 'Patterns imported');
  }
}

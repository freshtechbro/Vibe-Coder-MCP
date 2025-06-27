/**
 * Natural language processing types for the Vibe Task Manager
 */

/**
 * Supported natural language intents
 */
export type Intent =
  | 'create_project'
  | 'list_projects'
  | 'open_project'
  | 'update_project'
  | 'create_task'
  | 'list_tasks'
  | 'run_task'
  | 'check_status'
  | 'decompose_task'
  | 'decompose_project'
  | 'search_files'
  | 'search_content'
  | 'refine_task'
  | 'assign_task'
  | 'get_help'
  | 'parse_prd'
  | 'parse_tasks'
  | 'import_artifact'
  | 'unrecognized_intent'
  | 'clarification_needed'
  | 'unknown';

/**
 * Confidence levels for intent recognition
 */
export type ConfidenceLevel = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';

/**
 * Entity extracted from natural language input
 */
export interface Entity {
  /** Entity type */
  type: string;

  /** Extracted value */
  value: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Position in original text */
  start?: number;
  end?: number;
}

/**
 * Represents a recognized intent from natural language input
 */
export interface RecognizedIntent {
  /** The recognized intent */
  intent: Intent;

  /** Confidence score (0-1) */
  confidence: number;

  /** Confidence level category */
  confidenceLevel: ConfidenceLevel;

  /** Extracted entities from the input */
  entities: Entity[];

  /** Original user input */
  originalInput: string;

  /** Processed/normalized input */
  processedInput: string;

  /** Alternative intents with lower confidence */
  alternatives: {
    intent: Intent;
    confidence: number;
  }[];

  /** Processing metadata */
  metadata: {
    processingTime: number;
    method: 'pattern' | 'llm' | 'hybrid';
    modelUsed?: string;
    timestamp: Date;
  };
}

/**
 * Intent recognition pattern
 */
export interface IntentPattern {
  /** Pattern identifier */
  id: string;

  /** Intent this pattern recognizes */
  intent: Intent;

  /** Regular expression patterns */
  patterns: string[];

  /** Keywords that indicate this intent */
  keywords: string[];

  /** Required entities for this intent */
  requiredEntities: string[];

  /** Optional entities for this intent */
  optionalEntities: string[];

  /** Pattern priority (higher = checked first) */
  priority: number;

  /** Whether this pattern is active */
  active: boolean;

  /** Examples of inputs that match this pattern */
  examples: string[];
}

/**
 * Entity extraction result
 */
export interface ExtractedEntity {
  /** Entity type */
  type: string;

  /** Extracted value */
  value: string;

  /** Normalized value */
  normalizedValue: string;

  /** Confidence score */
  confidence: number;

  /** Position in original text */
  position: {
    start: number;
    end: number;
  };

  /** Extraction method */
  method: 'regex' | 'nlp' | 'llm';
}

/**
 * Natural language command processing result
 */
export interface CommandProcessingResult {
  /** Whether the command was successfully processed */
  success: boolean;

  /** Recognized intent */
  intent: RecognizedIntent;

  /** Generated tool parameters */
  toolParams: Record<string, unknown>;

  /** Validation errors (if any) */
  validationErrors: string[];

  /** Suggested corrections */
  suggestions: string[];

  /** Processing metadata */
  metadata: {
    processingTime: number;
    confidence: number;
    requiresConfirmation: boolean;
    ambiguousInput: boolean;
  };
}

/**
 * Natural language response generation
 */
export interface NLResponse {
  /** Response text */
  text: string;

  /** Response type */
  type: 'success' | 'error' | 'warning' | 'info' | 'confirmation';

  /** Structured data (if applicable) */
  data?: Record<string, unknown>;

  /** Suggested follow-up actions */
  suggestions?: string[];

  /** Whether this response requires user confirmation */
  requiresConfirmation: boolean;

  /** Response metadata */
  metadata: {
    generatedAt: Date;
    method: 'template' | 'llm' | 'hybrid';
    confidence: number;
  };
}

/**
 * Intent recognition configuration
 */
export interface IntentRecognitionConfig {
  /** Primary recognition method */
  primaryMethod: 'pattern' | 'llm' | 'hybrid';

  /** Fallback method if primary fails */
  fallbackMethod: 'pattern' | 'llm' | 'none';

  /** Minimum confidence threshold */
  minConfidence: number;

  /** Whether to use LLM for ambiguous cases */
  useLlmForAmbiguous: boolean;

  /** Maximum processing time (ms) */
  maxProcessingTime: number;

  /** Whether to cache recognition results */
  cacheResults: boolean;

  /** Cache TTL in seconds */
  cacheTTL: number;

  /** Whether to learn from user corrections */
  learningEnabled: boolean;

  /** Custom patterns to include */
  customPatterns: IntentPattern[];
}

/**
 * Natural language processing statistics
 */
export interface NLProcessingStats {
  /** Total requests processed */
  totalRequests: number;

  /** Successful recognitions */
  successfulRecognitions: number;

  /** Failed recognitions */
  failedRecognitions: number;

  /** Average confidence score */
  averageConfidence: number;

  /** Average processing time */
  averageProcessingTime: number;

  /** Intent distribution */
  intentDistribution: Record<Intent, number>;

  /** Method usage statistics */
  methodUsage: {
    pattern: number;
    llm: number;
    hybrid: number;
  };

  /** Error statistics */
  errorStats: {
    lowConfidence: number;
    timeout: number;
    parseError: number;
    validationError: number;
  };

  /** Performance metrics */
  performance: {
    p50ProcessingTime: number;
    p95ProcessingTime: number;
    p99ProcessingTime: number;
    errorRate: number;
  };
}

/**
 * Conversation context for multi-turn interactions
 */
export interface ConversationContext {
  /** Conversation session ID */
  sessionId: string;

  /** Current project context */
  currentProject?: string;

  /** Current task context */
  currentTask?: string;

  /** Previous intents in this session */
  intentHistory: RecognizedIntent[];

  /** Unresolved entities from previous turns */
  pendingEntities: Record<string, string>;

  /** User preferences learned in this session */
  userPreferences: Record<string, unknown>;

  /** Conversation state */
  state: 'active' | 'waiting_confirmation' | 'waiting_input' | 'completed';

  /** Last interaction timestamp */
  lastInteractionAt: Date;

  /** Session metadata */
  metadata: {
    startedAt: Date;
    totalInteractions: number;
    averageConfidence: number;
    primaryLanguage: string;
  };
}

/**
 * Context-Aware Parameter Extraction - DRY-Compliant Enhancement
 * 
 * Enhances existing context-extractor to provide intelligent parameter
 * extraction across all 15 MCP tools with context awareness.
 * 
 * ARCHITECTURE COMPLIANCE:
 * - Extends existing ContextExtractor functionality
 * - Leverages proven parameter extraction patterns
 * - Integrates with existing entity extraction systems
 * - Maintains DRY principles by enhancing vs duplicating
 */

import { extractProjectFromContext } from '../../tools/vibe-task-manager/utils/context-extractor.js';
import { CommandExecutionContext } from '../../tools/vibe-task-manager/nl/command-handlers.js';
import { RecognizedIntent, Entity } from '../../tools/vibe-task-manager/types/nl.js';
import { UnifiedCommandContext } from './unified-command-gateway.js';
import { ToolCandidate } from './intent-registry.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { VibeTaskManagerConfig } from '../../tools/vibe-task-manager/utils/config-loader.js';
import logger from '../../logger.js';

/**
 * Enhanced parameter extraction result
 */
export interface ParameterExtractionResult {
  parameters: Record<string, unknown>;
  confidence: number;
  source: 'context' | 'entities' | 'patterns' | 'inference' | 'defaults';
  suggestions: string[];
  missingRequired?: string[];
}

/**
 * Tool parameter specification for validation
 */
interface ToolParameterSpec {
  required: string[];
  optional: string[];
  types: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>;
  defaults: Record<string, unknown>;
  contextFields?: Record<string, string>; // Maps context fields to parameters
}

/**
 * Context-Aware Parameter Extractor
 * 
 * DRY-COMPLIANT: Enhances existing context extraction with intelligent
 * parameter mapping for all 15 MCP tools without duplicating functionality.
 */
export class ContextAwareParameterExtractor {
  
  // Tool parameter specifications for intelligent extraction
  private readonly toolSpecs: Record<string, ToolParameterSpec> = {
    'research-manager': {
      required: ['topic'],
      optional: ['depth', 'focus', 'sources'],
      types: {
        topic: 'string',
        depth: 'string',
        focus: 'array',
        sources: 'array'
      },
      defaults: {
        depth: 'comprehensive',
        sources: ['technical', 'documentation']
      }
    },
    
    'prd-generator': {
      required: ['product', 'feature'],
      optional: ['stakeholders', 'timeline', 'scope'],
      types: {
        product: 'string',
        feature: 'string',
        stakeholders: 'array',
        timeline: 'string',
        scope: 'string'
      },
      defaults: {
        scope: 'MVP'
      },
      contextFields: {
        currentProject: 'product'
      }
    },
    
    'user-stories-generator': {
      required: ['feature'],
      optional: ['persona', 'acceptance_criteria', 'priority'],
      types: {
        feature: 'string',
        persona: 'string',
        acceptance_criteria: 'boolean',
        priority: 'string'
      },
      defaults: {
        acceptance_criteria: true,
        priority: 'medium'
      }
    },
    
    'task-list-generator': {
      required: ['requirement'],
      optional: ['breakdown_level', 'include_dependencies', 'format'],
      types: {
        requirement: 'string',
        breakdown_level: 'string',
        include_dependencies: 'boolean',
        format: 'string'
      },
      defaults: {
        breakdown_level: 'detailed',
        include_dependencies: true,
        format: 'markdown'
      }
    },
    
    'fullstack-starter-kit-generator': {
      required: ['project_name'],
      optional: ['frontend', 'backend', 'database', 'features'],
      types: {
        project_name: 'string',
        frontend: 'string',
        backend: 'string',
        database: 'string',
        features: 'array'
      },
      defaults: {
        frontend: 'React',
        backend: 'Node.js',
        database: 'PostgreSQL'
      },
      contextFields: {
        currentProject: 'project_name'
      }
    },
    
    'rules-generator': {
      required: ['project_type'],
      optional: ['language', 'framework', 'style_guide', 'linting'],
      types: {
        project_type: 'string',
        language: 'string',
        framework: 'string',
        style_guide: 'string',
        linting: 'boolean'
      },
      defaults: {
        linting: true
      }
    },
    
    'map-codebase': {
      required: ['path'],
      optional: ['include_tests', 'max_depth', 'file_types', 'output_format'],
      types: {
        path: 'string',
        include_tests: 'boolean',
        max_depth: 'number',
        file_types: 'array',
        output_format: 'string'
      },
      defaults: {
        path: '.',
        include_tests: false,
        max_depth: 5,
        output_format: 'mermaid'
      }
    },
    
    'curate-context': {
      required: ['prompt'],
      optional: ['codebase_path', 'relevance_threshold', 'max_files'],
      types: {
        prompt: 'string',
        codebase_path: 'string',
        relevance_threshold: 'number',
        max_files: 'number'
      },
      defaults: {
        codebase_path: '.',
        relevance_threshold: 0.7,
        max_files: 20
      }
    },
    
    'run-workflow': {
      required: ['workflowName'],
      optional: ['workflowInput', 'async_execution', 'notification'],
      types: {
        workflowName: 'string',
        workflowInput: 'object',
        async_execution: 'boolean',
        notification: 'boolean'
      },
      defaults: {
        async_execution: false,
        notification: true
      }
    },
    
    'get-job-result': {
      required: ['jobId'],
      optional: ['wait_timeout', 'include_logs'],
      types: {
        jobId: 'string',
        wait_timeout: 'number',
        include_logs: 'boolean'
      },
      defaults: {
        wait_timeout: 30000,
        include_logs: false
      }
    },
    
    'register-agent': {
      required: ['agentId'],
      optional: ['capabilities', 'transport', 'priority'],
      types: {
        agentId: 'string',
        capabilities: 'array',
        transport: 'string',
        priority: 'number'
      },
      defaults: {
        transport: 'stdio',
        priority: 5
      }
    },
    
    'get-agent-tasks': {
      required: ['agentId'],
      optional: ['capabilities', 'limit', 'timeout'],
      types: {
        agentId: 'string',
        capabilities: 'array',
        limit: 'number',
        timeout: 'number'
      },
      defaults: {
        limit: 10,
        timeout: 5000
      }
    },
    
    'submit-task-response': {
      required: ['taskId', 'status'],
      optional: ['result', 'error_message', 'completion_metadata'],
      types: {
        taskId: 'string',
        status: 'string',
        result: 'object',
        error_message: 'string',
        completion_metadata: 'object'
      },
      defaults: {}
    },
    
    'vibe-task-manager': {
      required: ['command'],
      optional: ['projectName', 'taskId', 'description', 'options'],
      types: {
        command: 'string',
        projectName: 'string',
        taskId: 'string',
        description: 'string',
        options: 'object'
      },
      defaults: {},
      contextFields: {
        currentProject: 'projectName',
        currentTask: 'taskId'
      }
    },
    
    'process-request': {
      required: ['request'],
      optional: ['context', 'preferences', 'confirmation_threshold'],
      types: {
        request: 'string',
        context: 'object',
        preferences: 'object',
        confirmation_threshold: 'number'
      },
      defaults: {
        confirmation_threshold: 0.8
      }
    }
  };

  /**
   * Extract parameters with enhanced context awareness
   * LEVERAGES EXISTING: Uses proven context extraction patterns
   */
  async extractParameters(
    intent: RecognizedIntent,
    input: string,
    context: UnifiedCommandContext,
    toolCandidates: ToolCandidate[]
  ): Promise<Record<string, unknown>> {
    try {
      const bestTool = toolCandidates[0]?.tool || 'process-request';
      const spec = this.toolSpecs[bestTool];
      
      if (!spec) {
        logger.debug({ tool: bestTool }, 'No parameter spec found for tool, using basic extraction');
        return this.performBasicExtraction(intent, input, context);
      }

      // Multi-source parameter extraction
      const results = await Promise.all([
        this.extractFromContext(spec, context),
        this.extractFromEntities(spec, intent.entities),
        this.extractFromPatterns(spec, input, bestTool),
        this.extractFromInference(spec, input, context)
      ]);

      // Combine results with priority: context > entities > patterns > inference > defaults
      const parameters = this.combineExtractionResults(results, spec);
      
      // Validate and enrich parameters
      const enrichedParameters = await this.validateAndEnrichParameters(
        parameters,
        spec,
        context,
        bestTool
      );

      logger.debug({
        tool: bestTool,
        extractedParams: Object.keys(enrichedParameters),
        sources: results.map(r => r.source)
      }, 'Parameter extraction completed');

      return enrichedParameters;

    } catch (error) {
      logger.error({ err: error, intent: intent.intent }, 'Parameter extraction failed');
      return this.performBasicExtraction(intent, input, context);
    }
  }

  /**
   * Map extracted parameters to tool-specific format
   * ENHANCES EXISTING: Builds on existing parameter mapping patterns
   */
  async mapToToolParameters(
    toolName: string,
    intent: RecognizedIntent,
    extractedParams: Record<string, unknown>,
    context: UnifiedCommandContext
  ): Promise<Record<string, unknown>> {
    const spec = this.toolSpecs[toolName];
    
    if (!spec) {
      return { ...extractedParams, _intent: intent.intent };
    }

    const mappedParams: Record<string, unknown> = {};

    // Map required parameters
    for (const param of spec.required) {
      if (extractedParams[param] !== undefined) {
        mappedParams[param] = this.castParameterType(
          extractedParams[param],
          spec.types[param]
        );
      } else {
        // Try to find the parameter under alternative names
        const alternative = this.findAlternativeParameter(param, extractedParams);
        if (alternative !== null) {
          mappedParams[param] = this.castParameterType(alternative, spec.types[param]);
        }
      }
    }

    // Map optional parameters
    for (const param of spec.optional) {
      if (extractedParams[param] !== undefined) {
        mappedParams[param] = this.castParameterType(
          extractedParams[param],
          spec.types[param]
        );
      } else {
        // Apply default if available
        if (spec.defaults[param] !== undefined) {
          mappedParams[param] = spec.defaults[param];
        }
      }
    }

    // Add tool-specific enrichments
    await this.addToolSpecificEnrichments(toolName, mappedParams, context, intent);

    return mappedParams;
  }

  /**
   * Extract parameters from context (session, project, user preferences)
   */
  private async extractFromContext(
    spec: ToolParameterSpec,
    context: UnifiedCommandContext
  ): Promise<ParameterExtractionResult> {
    const parameters: Record<string, unknown> = {};
    const confidence = 0.9; // High confidence for context data

    try {
      // Map context fields to parameters if specified
      if (spec.contextFields) {
        for (const [contextField, paramName] of Object.entries(spec.contextFields)) {
          const contextValue = (context as unknown as Record<string, unknown>)[contextField];
          if (contextValue) {
            parameters[paramName] = contextValue;
          }
        }
      }

      // Extract project context using existing functionality
      if (spec.required.includes('path') || spec.optional.includes('path')) {
        try {
          const projectContext = await extractProjectFromContext({
            sessionId: context.sessionId,
            currentProject: context.currentProject,
            config: {} as OpenRouterConfig,
            taskManagerConfig: {} as VibeTaskManagerConfig
          } as CommandExecutionContext);
          
          if (projectContext.confidence > 0.7) {
            parameters.path = process.cwd();
            parameters.projectName = projectContext.projectName;
          }
        } catch (error) {
          logger.debug({ err: error }, 'Project context extraction failed');
        }
      }

      // Use user preferences if available
      if (context.userPreferences && Object.keys(context.userPreferences).length > 0) {
        for (const [key, value] of Object.entries(context.userPreferences)) {
          if (spec.optional.includes(key) || spec.required.includes(key)) {
            parameters[key] = value;
          }
        }
      }

      return {
        parameters,
        confidence,
        source: 'context',
        suggestions: []
      };

    } catch (error) {
      logger.debug({ err: error }, 'Context extraction failed');
      return {
        parameters: {},
        confidence: 0,
        source: 'context',
        suggestions: []
      };
    }
  }

  /**
   * Extract parameters from recognized entities
   */
  private async extractFromEntities(
    spec: ToolParameterSpec,
    entities: Entity[]
  ): Promise<ParameterExtractionResult> {
    const parameters: Record<string, unknown> = {};
    const suggestions: string[] = [];
    let confidence = 0.8;

    for (const entity of entities) {
      // Map common entity types to parameter names
      const paramName = this.mapEntityTypeToParameter(entity.type, spec);
      
      if (paramName && (spec.required.includes(paramName) || spec.optional.includes(paramName))) {
        parameters[paramName] = entity.value;
        
        // Reduce confidence for low-confidence entities
        if (entity.confidence < 0.7) {
          confidence *= 0.9;
        }
      }
    }

    return {
      parameters,
      confidence,
      source: 'entities',
      suggestions
    };
  }

  /**
   * Extract parameters using pattern matching
   */
  private async extractFromPatterns(
    spec: ToolParameterSpec,
    input: string,
    toolName: string
  ): Promise<ParameterExtractionResult> {
    const parameters: Record<string, unknown> = {};
    const suggestions: string[] = [];
    const confidence = 0.7;

    // Tool-specific pattern extraction
    switch (toolName) {
      case 'research-manager':
        Object.assign(parameters, this.extractResearchPatterns(input));
        break;
        
      case 'prd-generator':
        Object.assign(parameters, this.extractPRDPatterns(input));
        break;
        
      case 'fullstack-starter-kit-generator':
        Object.assign(parameters, this.extractStarterKitPatterns(input));
        break;
        
      case 'map-codebase':
        Object.assign(parameters, this.extractCodebasePatterns(input));
        break;
        
      case 'curate-context':
        Object.assign(parameters, this.extractContextCuratorPatterns(input));
        break;
        
      // Add more tool-specific patterns as needed
    }

    return {
      parameters,
      confidence,
      source: 'patterns',
      suggestions
    };
  }

  /**
   * Extract parameters through intelligent inference
   */
  private async extractFromInference(
    spec: ToolParameterSpec,
    input: string,
    context: UnifiedCommandContext
  ): Promise<ParameterExtractionResult> {
    const parameters: Record<string, unknown> = {};
    const suggestions: string[] = [];
    const confidence = 0.6; // Lower confidence for inferred parameters

    // Infer missing required parameters based on context and input
    for (const param of spec.required) {
      if (!parameters[param]) {
        const inferred = await this.inferParameter(param, input, context, spec);
        if (inferred) {
          parameters[param] = inferred.value;
          suggestions.push(inferred.suggestion);
        }
      }
    }

    return {
      parameters,
      confidence,
      source: 'inference',
      suggestions
    };
  }

  /**
   * Combine extraction results with proper priority
   */
  private combineExtractionResults(
    results: ParameterExtractionResult[],
    spec: ToolParameterSpec
  ): Record<string, unknown> {
    const combined: Record<string, unknown> = {};
    
    // Apply results in reverse priority order (defaults first, context last)
    const priorityOrder = ['defaults', 'inference', 'patterns', 'entities', 'context'];
    
    // Apply defaults first
    Object.assign(combined, spec.defaults);
    
    // Apply other results in priority order
    for (const priority of priorityOrder) {
      const result = results.find(r => r.source === priority);
      if (result) {
        Object.assign(combined, result.parameters);
      }
    }

    return combined;
  }

  /**
   * Validate and enrich parameters
   */
  private async validateAndEnrichParameters(
    parameters: Record<string, unknown>,
    spec: ToolParameterSpec,
    context: UnifiedCommandContext,
    toolName: string
  ): Promise<Record<string, unknown>> {
    const enriched = { ...parameters };

    // Validate required parameters
    for (const required of spec.required) {
      if (enriched[required] === undefined || enriched[required] === null || enriched[required] === '') {
        // Try to provide intelligent defaults or suggestions
        const fallback = await this.provideFallbackValue(required, toolName, context);
        if (fallback) {
          enriched[required] = fallback;
        }
      }
    }

    // Type validation and casting
    for (const [param, type] of Object.entries(spec.types)) {
      if (enriched[param] !== undefined) {
        enriched[param] = this.castParameterType(enriched[param], type);
      }
    }

    return enriched;
  }

  /**
   * Perform basic extraction when no spec is available
   */
  private performBasicExtraction(
    intent: RecognizedIntent,
    input: string,
    context: UnifiedCommandContext
  ): Record<string, unknown> {
    const parameters: Record<string, unknown> = {
      request: intent.originalInput,
      intent: intent.intent,
      sessionId: context.sessionId
    };

    // Extract entities as parameters
    for (const entity of intent.entities) {
      parameters[entity.type] = entity.value;
    }

    // Add context information
    if (context.currentProject) {
      parameters.currentProject = context.currentProject;
    }
    if (context.currentTask) {
      parameters.currentTask = context.currentTask;
    }

    return parameters;
  }

  /**
   * Map entity type to parameter name based on tool spec
   */
  private mapEntityTypeToParameter(entityType: string, spec: ToolParameterSpec): string | null {
    const mappings: Record<string, string> = {
      'project_name': 'project',
      'product_name': 'product',
      'feature_name': 'feature',
      'task_name': 'task',
      'file_path': 'path',
      'technology': 'language',
      'topic': 'topic',
      'requirement': 'requirement'
    };

    const mapped = mappings[entityType] || entityType;
    
    // Check if the mapped name exists in the spec
    if (spec.required.includes(mapped) || spec.optional.includes(mapped)) {
      return mapped;
    }

    return null;
  }

  /**
   * Cast parameter to appropriate type
   */
  private castParameterType(value: unknown, type: string): unknown {
    switch (type) {
      case 'string':
        return String(value);
      case 'number':
        return typeof value === 'number' ? value : parseFloat(String(value)) || 0;
      case 'boolean':
        return typeof value === 'boolean' ? value : 
               ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
      case 'array':
        return Array.isArray(value) ? value : [value];
      case 'object':
        return typeof value === 'object' ? value : { value };
      default:
        return value;
    }
  }

  /**
   * Find alternative parameter name
   */
  private findAlternativeParameter(
    targetParam: string,
    parameters: Record<string, unknown>
  ): unknown {
    const alternatives: Record<string, string[]> = {
      'topic': ['query', 'subject', 'research_topic'],
      'product': ['project', 'application', 'system'],
      'feature': ['functionality', 'capability', 'requirement'],
      'path': ['directory', 'folder', 'location'],
      'task': ['description', 'title', 'name']
    };

    const alternativeNames = alternatives[targetParam] || [];
    
    for (const alt of alternativeNames) {
      if (parameters[alt] !== undefined) {
        return parameters[alt];
      }
    }

    return null;
  }

  /**
   * Provide fallback value for missing required parameters
   */
  private async provideFallbackValue(
    param: string,
    toolName: string,
    context: UnifiedCommandContext
  ): Promise<unknown> {
    const fallbacks: Record<string, Record<string, unknown>> = {
      'research-manager': {
        topic: 'general technical research'
      },
      'map-codebase': {
        path: '.'
      },
      'prd-generator': {
        product: context.currentProject || 'New Product'
      },
      'fullstack-starter-kit-generator': {
        project_name: context.currentProject || 'new-project'
      }
    };

    return fallbacks[toolName]?.[param];
  }

  /**
   * Add tool-specific enrichments
   */
  private async addToolSpecificEnrichments(
    toolName: string,
    parameters: Record<string, unknown>,
    context: UnifiedCommandContext,
    intent: RecognizedIntent
  ): Promise<void> {
    // Add common metadata
    parameters._sessionId = context.sessionId;
    parameters._intent = intent.intent;
    parameters._confidence = intent.confidence;
    parameters._timestamp = new Date().toISOString();

    // Tool-specific enrichments
    switch (toolName) {
      case 'vibe-task-manager':
        // Add project context for task manager
        if (!parameters.projectName && context.currentProject) {
          parameters.projectName = context.currentProject;
        }
        break;
        
      case 'curate-context':
        // Add codebase context for context curator
        if (!parameters.codebase_path) {
          parameters.codebase_path = process.cwd();
        }
        break;
    }
  }

  /**
   * Infer parameter value based on context and input
   */
  private async inferParameter(
    param: string,
    input: string,
    context: UnifiedCommandContext,
    _spec: ToolParameterSpec
  ): Promise<{ value: unknown; suggestion: string } | null> {
    // Parameter-specific inference logic
    switch (param) {
      case 'topic': {
        // Infer research topic from input
        const topicMatch = input.match(/(?:research|about|regarding|on)\s+(.+?)(?:\s|$)/i);
        if (topicMatch) {
          return {
            value: topicMatch[1].trim(),
            suggestion: `Inferred research topic: ${topicMatch[1].trim()}`
          };
        }
        break;
      }
        
      case 'feature': {
        // Infer feature from input
        const featureMatch = input.match(/(?:feature|functionality|capability)\s+(.+?)(?:\s|$)/i);
        if (featureMatch) {
          return {
            value: featureMatch[1].trim(),
            suggestion: `Inferred feature: ${featureMatch[1].trim()}`
          };
        }
        break;
      }
        
      case 'product':
        // Use current project as product if available
        if (context.currentProject) {
          return {
            value: context.currentProject,
            suggestion: `Using current project as product: ${context.currentProject}`
          };
        }
        break;
    }

    return null;
  }

  // Tool-specific pattern extraction methods

  private extractResearchPatterns(input: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    
    // Extract topic
    const topicMatch = input.match(/(?:research|study|investigate|analyze)\s+(.+?)(?:\s|$)/i);
    if (topicMatch) {
      params.topic = topicMatch[1].trim();
    }

    // Extract depth indicators
    if (input.includes('deep') || input.includes('comprehensive') || input.includes('detailed')) {
      params.depth = 'comprehensive';
    } else if (input.includes('quick') || input.includes('brief') || input.includes('overview')) {
      params.depth = 'brief';
    }

    return params;
  }

  private extractPRDPatterns(input: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    
    // Extract product/feature
    const productMatch = input.match(/(?:prd|requirements?)\s+for\s+(.+?)(?:\s|$)/i);
    if (productMatch) {
      params.product = productMatch[1].trim();
    }

    return params;
  }

  private extractStarterKitPatterns(input: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    
    // Extract project name
    const projectMatch = input.match(/(?:create|generate|setup)\s+(?:project\s+)?(.+?)(?:\s|$)/i);
    if (projectMatch) {
      params.project_name = projectMatch[1].trim();
    }

    // Extract technology mentions
    const techPatterns = {
      frontend: /\b(react|vue|angular|svelte)\b/gi,
      backend: /\b(node|express|fastify|nestjs|python|django|flask)\b/gi,
      database: /\b(postgres|mysql|mongodb|sqlite|redis)\b/gi
    };

    for (const [key, pattern] of Object.entries(techPatterns)) {
      const match = input.match(pattern);
      if (match) {
        params[key] = match[0].toLowerCase();
      }
    }

    return params;
  }

  private extractCodebasePatterns(input: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    
    // Extract path
    const pathMatch = input.match(/(?:map|analyze)\s+(.+?)(?:\s|$)/i);
    if (pathMatch && pathMatch[1].includes('/')) {
      params.path = pathMatch[1].trim();
    }

    return params;
  }

  private extractContextCuratorPatterns(input: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    
    // Extract the task/prompt after common patterns
    const patterns = [
      /curate\s+context\s+for\s+(.+)$/i,
      /prepare\s+context\s+for\s+(.+)$/i,
      /analyze\s+(?:codebase\s+)?for\s+(.+)$/i,
      /generate\s+meta-?prompt\s+for\s+(.+)$/i,
      /create\s+context\s+package\s+for\s+(.+)$/i
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        params.prompt = match[1].trim();
        break;
      }
    }
    
    // If no pattern match, use the entire input as the prompt
    if (!params.prompt) {
      params.prompt = input.trim();
    }
    
    return params;
  }
}
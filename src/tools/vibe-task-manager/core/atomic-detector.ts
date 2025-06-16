import { performFormatAwareLlmCall } from '../../../utils/llmHelper.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { getLLMModelForOperation } from '../utils/config-loader.js';
import { AtomicTask, TaskPriority, TaskType } from '../types/task.js';
import { getPrompt } from '../services/prompt-service.js';
import logger from '../../../logger.js';

/**
 * Analysis result for atomic task detection
 */
export interface AtomicityAnalysis {
  isAtomic: boolean;
  confidence: number;
  reasoning: string;
  estimatedHours: number;
  complexityFactors: string[];
  recommendations: string[];
}

/**
 * Project context for task analysis
 */
export interface ProjectContext {
  projectId: string;
  languages: string[];
  frameworks: string[];
  tools: string[];
  existingTasks: AtomicTask[];
  codebaseSize: 'small' | 'medium' | 'large';
  teamSize: number;
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

  /** Research context from auto-research integration */
  researchContext?: {
    researchResults: string[];
    researchSummary: string;
    researchQueries: string[];
    researchTime: number;
    knowledgeBase: string[];
    actionItems: string[];
  };
}

/**
 * Atomic task detector using AI analysis
 */
export class AtomicTaskDetector {
  private config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    this.config = config;
  }

  /**
   * Analyze if a task is atomic using multiple criteria
   */
  async analyzeTask(task: AtomicTask, context: ProjectContext): Promise<AtomicityAnalysis> {
    logger.info({ taskId: task.id, projectId: context.projectId }, 'Starting atomic task analysis');

    try {
      // Prepare analysis prompt
      const analysisPrompt = this.buildAnalysisPrompt(task, context);
      const systemPrompt = await getPrompt('atomic_detection');

      // Get LLM model for task decomposition
      const model = await getLLMModelForOperation('task_decomposition');
      logger.debug({ model, taskId: task.id }, 'Using LLM model for atomic analysis');

      // Perform LLM analysis
      const response = await performFormatAwareLlmCall(
        analysisPrompt,
        systemPrompt,
        this.config,
        'task_decomposition',
        'json', // Explicitly specify JSON format for atomic analysis
        undefined, // Schema will be inferred from task name
        0.1 // Low temperature for consistent analysis
      );

      // Parse and validate response
      const analysis = this.parseAnalysisResponse(response);

      // Apply additional validation rules
      const validatedAnalysis = this.validateAnalysis(analysis, task, context);

      logger.info({
        taskId: task.id,
        isAtomic: validatedAnalysis.isAtomic,
        confidence: validatedAnalysis.confidence,
        estimatedHours: validatedAnalysis.estimatedHours
      }, 'Atomic task analysis completed');

      return validatedAnalysis;

    } catch (error) {
      logger.error({ err: error, taskId: task.id }, 'Failed to analyze task atomicity');

      // Return fallback analysis
      return this.getFallbackAnalysis(task, context);
    }
  }

  /**
   * Build the analysis prompt for the LLM
   */
  private buildAnalysisPrompt(task: AtomicTask, context: ProjectContext): string {
    let prompt = `Analyze the following task to determine if it is atomic (cannot be meaningfully decomposed further):

TASK DETAILS:
- Title: ${task.title}
- Description: ${task.description}
- Type: ${task.type}
- Priority: ${task.priority}
- Estimated Hours: ${task.estimatedHours}
- Acceptance Criteria: ${task.acceptanceCriteria.join(', ')}
- File Paths: ${task.filePaths.join(', ')}

PROJECT CONTEXT:
- Project ID: ${context.projectId}
- Languages: ${context.languages.join(', ')}
- Frameworks: ${context.frameworks.join(', ')}
- Tools: ${context.tools.join(', ')}
- Codebase Size: ${context.codebaseSize}
- Team Size: ${context.teamSize}
- Project Complexity: ${context.complexity}
- Existing Tasks Count: ${context.existingTasks.length}`;

    // Add enhanced codebase context if available
    if (context.codebaseContext) {
      prompt += `

ENHANCED CODEBASE CONTEXT:
- Relevant Files Found: ${context.codebaseContext.relevantFiles.length}
- Total Context Size: ${Math.round(context.codebaseContext.totalContextSize / 1024)}KB
- Average File Relevance: ${(context.codebaseContext.averageRelevance * 100).toFixed(1)}%
- Context Gathering Time: ${context.codebaseContext.gatheringMetrics.totalTime}ms

RELEVANT FILES:
${context.codebaseContext.relevantFiles
  .slice(0, 10) // Show top 10 most relevant files
  .map(f => `- ${f.path} (${(f.relevance * 100).toFixed(1)}% relevant, ${f.type})`)
  .join('\n')}

CODEBASE INSIGHTS:
${context.codebaseContext.contextSummary.substring(0, 1000)}${context.codebaseContext.contextSummary.length > 1000 ? '...' : ''}`;
    }

    prompt += `

ATOMIC TASK DEFINITION:
An atomic task is a task that:
1. Takes 5-10 minutes maximum to complete
2. Involves exactly ONE specific action/step
3. Has exactly ONE clear acceptance criteria
4. Focuses on ONE thing only
5. Is simple and straightforward
6. Cannot be broken down into smaller meaningful tasks
7. Can be started and completed without planning additional tasks
8. Requires no coordination between multiple actions

ANALYSIS CRITERIA:
1. Duration Test: Can this be completed in 5-10 minutes? (If no, NOT ATOMIC)
2. Single Action Test: Does this involve exactly ONE action? (If multiple actions, NOT ATOMIC)
3. Single Focus Test: Does this focus on ONE specific thing? (If multiple focuses, NOT ATOMIC)
4. Acceptance Criteria Test: Does this have exactly ONE acceptance criteria? (If multiple, NOT ATOMIC)
5. Simplicity Test: Is this simple and straightforward? (If complex, NOT ATOMIC)
6. Decomposition Test: Can this be broken down further? (If yes, NOT ATOMIC)
7. Immediate Action Test: Can a developer start and finish this immediately? (If planning needed, NOT ATOMIC)

VALIDATION RULES:
- Tasks over 20 minutes are NEVER atomic
- Tasks with multiple acceptance criteria are NEVER atomic
- Tasks with "and" in the title/description are usually NOT atomic
- Tasks requiring multiple file changes are usually NOT atomic
- Tasks with words like "implement", "create and", "setup and" are usually NOT atomic

Please provide your analysis in the following JSON format:
{
  "isAtomic": boolean,
  "confidence": number (0-1),
  "reasoning": "detailed explanation",
  "estimatedHours": number,
  "complexityFactors": ["factor1", "factor2"],
  "recommendations": ["recommendation1", "recommendation2"]
}`;

    return prompt;
  }



  /**
   * Parse the LLM response into an AtomicityAnalysis object
   */
  private parseAnalysisResponse(response: string): AtomicityAnalysis {
    try {
      // Extract JSON from response (handle potential markdown formatting)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (typeof parsed.isAtomic !== 'boolean') {
        throw new Error('Invalid isAtomic field');
      }

      return {
        isAtomic: parsed.isAtomic,
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || 'No reasoning provided',
        estimatedHours: Math.max(0.08, parsed.estimatedHours || 0.1), // Use atomic range: 5 minutes minimum
        complexityFactors: Array.isArray(parsed.complexityFactors) ? parsed.complexityFactors : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : []
      };

    } catch (error) {
      logger.warn({ err: error, response }, 'Failed to parse LLM analysis response');
      throw new Error(`Failed to parse analysis response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Apply additional validation rules to the analysis
   */
  private validateAnalysis(
    analysis: AtomicityAnalysis,
    task: AtomicTask,
    context: ProjectContext
  ): AtomicityAnalysis {
    const validatedAnalysis = { ...analysis };

    // Rule 1: Tasks over 20 minutes are NEVER atomic
    if (validatedAnalysis.estimatedHours > 0.33) { // 20 minutes
      validatedAnalysis.isAtomic = false;
      validatedAnalysis.confidence = 0.0;
      validatedAnalysis.recommendations.push('Task exceeds 20-minute validation threshold - must be broken down further');
    }

    // Rule 2: Tasks under 5 minutes might be too granular
    if (validatedAnalysis.estimatedHours < 0.08) { // 5 minutes
      validatedAnalysis.confidence = Math.min(validatedAnalysis.confidence, 0.7);
      validatedAnalysis.recommendations.push('Task might be too granular - consider combining with related task');
    }

    // Rule 3: Tasks must have exactly ONE acceptance criteria
    if (task.acceptanceCriteria.length !== 1) {
      validatedAnalysis.isAtomic = false;
      validatedAnalysis.confidence = 0.0;
      validatedAnalysis.recommendations.push('Atomic tasks must have exactly ONE acceptance criteria');
    }

    // Rule 4: Tasks with "and" in title/description indicate multiple actions
    const hasAndOperator = task.title.toLowerCase().includes(' and ') ||
                          task.description.toLowerCase().includes(' and ');
    if (hasAndOperator) {
      validatedAnalysis.isAtomic = false;
      validatedAnalysis.confidence = 0.0;
      validatedAnalysis.complexityFactors.push('Task contains "and" operator indicating multiple actions');
      validatedAnalysis.recommendations.push('Remove "and" operations - split into separate atomic tasks');
    }

    // Rule 5: Tasks with multiple file modifications are likely not atomic
    if (task.filePaths.length > 2) {
      validatedAnalysis.isAtomic = false;
      validatedAnalysis.confidence = 0.0; // Set to 0 for consistency with other non-atomic rules
      validatedAnalysis.complexityFactors.push('Multiple file modifications indicate non-atomic task');
      validatedAnalysis.recommendations.push('Split into separate tasks - one per file modification');
    }

    // Rule 6: Tasks with complex action words are not atomic
    const complexActionWords = [
      'implement', 'create and', 'setup and', 'design and', 'build and',
      'configure and', 'develop', 'establish', 'integrate', 'coordinate',
      'build', 'construct', 'architect', 'engineer'
    ];
    const hasComplexAction = complexActionWords.some(word =>
      task.title.toLowerCase().includes(word) || task.description.toLowerCase().includes(word)
    );
    if (hasComplexAction) {
      validatedAnalysis.isAtomic = false;
      validatedAnalysis.confidence = Math.min(validatedAnalysis.confidence, 0.3);
      validatedAnalysis.complexityFactors.push('Task uses complex action words suggesting multiple steps');
      validatedAnalysis.recommendations.push('Use simple action verbs: Add, Create, Write, Update, Import, Export');
    }

    // Rule 7: Tasks with vague descriptions are not atomic
    const vagueWords = ['various', 'multiple', 'several', 'different', 'appropriate', 'necessary', 'proper', 'suitable'];
    const hasVagueWords = vagueWords.some(word =>
      task.description.toLowerCase().includes(word)
    );
    if (hasVagueWords) {
      validatedAnalysis.isAtomic = false;
      validatedAnalysis.confidence = Math.min(validatedAnalysis.confidence, 0.4);
      validatedAnalysis.complexityFactors.push('Task description contains vague terms');
      validatedAnalysis.recommendations.push('Use specific, concrete descriptions instead of vague terms');
    }

    // Rule 8: Epic time constraint validation
    const epicTimeLimit = 8; // 8 hours maximum per epic
    if (context.existingTasks && context.existingTasks.length > 0) {
      const totalEpicTime = context.existingTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
      if (totalEpicTime + validatedAnalysis.estimatedHours > epicTimeLimit) {
        validatedAnalysis.confidence = Math.min(validatedAnalysis.confidence, 0.5);
        validatedAnalysis.recommendations.push('Adding this task would exceed 8-hour epic limit');
      }
    }

    return validatedAnalysis;
  }

  /**
   * Provide fallback analysis when LLM analysis fails
   */
  private getFallbackAnalysis(task: AtomicTask, context: ProjectContext): AtomicityAnalysis {
    logger.warn({ taskId: task.id }, 'Using fallback atomic analysis');

    // Simple heuristic-based analysis with updated atomic criteria
    const isLikelyAtomic = task.estimatedHours <= 0.17 && // 10 minutes max
                          task.estimatedHours >= 0.08 && // 5 minutes min
                          task.filePaths.length <= 2 &&
                          task.acceptanceCriteria.length === 1 && // Exactly one criteria
                          !task.title.toLowerCase().includes(' and ') &&
                          !task.description.toLowerCase().includes(' and ');

    return {
      isAtomic: isLikelyAtomic,
      confidence: 0.4, // Low confidence for fallback
      reasoning: 'Fallback analysis based on atomic task heuristics due to LLM analysis failure',
      estimatedHours: Math.max(0.08, Math.min(0.17, task.estimatedHours)), // Clamp to 5-10 minutes
      complexityFactors: ['LLM analysis unavailable'],
      recommendations: ['Manual review recommended due to analysis failure', 'Verify task meets 5-10 minute atomic criteria']
    };
  }
}

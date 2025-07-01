import { performFormatAwareLlmCall } from '../../../utils/llmHelper.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { getLLMModelForOperation } from '../utils/config-loader.js';
import { AtomicTask } from '../types/task.js';
import { ProjectContext } from '../types/project-context.js';
import { getPrompt } from '../services/prompt-service.js';
import { AutoResearchDetector } from '../services/auto-research-detector.js';
import { ContextEnrichmentService } from '../services/context-enrichment-service.js';
import { ResearchIntegration } from '../integrations/research-integration.js';
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
 * Enhanced validation result with contextual insights
 */
export interface EnhancedValidationResult {
  analysis: AtomicityAnalysis;
  contextualFactors: {
    projectComplexity: number;
    researchRequired: boolean;
    contextEnhancementUsed: boolean;
    technicalDebtImpact: number;
    teamExperienceLevel: number;
  };
  qualityMetrics: {
    descriptionQuality: number;
    acceptanceClarityScore: number;
    filePathRealism: number;
    technologyAlignment: number;
  };
  dependencyInsights: {
    requiredSkills: string[];
    technicalPrerequisites: string[];
    externalDependencies: string[];
    riskFactors: string[];
  };
  autoEnhancements: {
    researchTriggered: boolean;
    contextGathered: boolean;
    promptEnhanced: boolean;
    suggestedImprovements: string[];
  };
}

/**
 * Batch validation result for multiple tasks
 */
export interface BatchValidationResult {
  individual: EnhancedValidationResult[];
  batchMetrics: {
    overallValid: boolean;
    averageConfidence: number;
    totalEffort: number;
    duplicateCount: number;
    skillDistribution: Record<string, number>;
    riskDistribution: Record<string, number>;
  };
  batchRecommendations: string[];
}



/**
 * Enhanced atomic task detector with contextual validation and auto-research integration
 */
export class AtomicTaskDetector {
  private config: OpenRouterConfig;
  private autoResearchDetector: AutoResearchDetector;
  private contextEnrichmentService: ContextEnrichmentService;
  private researchIntegration: ResearchIntegration;

  constructor(config: OpenRouterConfig) {
    this.config = config;
    this.autoResearchDetector = AutoResearchDetector.getInstance();
    this.contextEnrichmentService = ContextEnrichmentService.getInstance();
    this.researchIntegration = ResearchIntegration.getInstance();
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

      // Perform LLM analysis with timeout protection
      const response = await Promise.race([
        performFormatAwareLlmCall(
          analysisPrompt,
          systemPrompt,
          this.config,
          'task_decomposition',
          'json', // Explicitly specify JSON format for atomic analysis
          undefined, // Schema will be inferred from task name
          0.1 // Low temperature for consistent analysis
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Atomic task analysis timeout after 60 seconds')), 60000)
        )
      ]);

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
- Acceptance Criteria: ${(task.acceptanceCriteria || []).join(', ')}
- File Paths: ${(task.filePaths || []).join(', ')}

PROJECT CONTEXT:
- Project ID: ${context.projectId}
- Languages: ${(context.languages && context.languages.length > 0 ? context.languages : ['unknown']).join(', ')}
- Frameworks: ${(context.frameworks && context.frameworks.length > 0 ? context.frameworks : ['unknown']).join(', ')}
- Tools: ${(context.tools || []).join(', ')}
- Codebase Size: ${context.codebaseSize || 'unknown'}
- Team Size: ${context.teamSize || 'unknown'}
- Project Complexity: ${context.complexity || 'unknown'}
- Existing Tasks Count: ${(context.existingTasks || []).length}`;

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
    if ((task.acceptanceCriteria || []).length !== 1) {
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
    if ((task.filePaths || []).length > 2) {
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
  private getFallbackAnalysis(task: AtomicTask, _context: ProjectContext): AtomicityAnalysis {
    logger.warn({ taskId: task.id }, 'Using fallback atomic analysis');

    // Simple heuristic-based analysis with updated atomic criteria
    const isLikelyAtomic = task.estimatedHours <= 0.17 && // 10 minutes max
                          task.estimatedHours >= 0.08 && // 5 minutes min
                          (task.filePaths || []).length <= 2 &&
                          (task.acceptanceCriteria || []).length === 1 && // Exactly one criteria
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

  // ===== ENHANCED VALIDATION METHODS =====

  /**
   * Enhanced validation with auto-research and context integration
   */
  async validateTaskEnhanced(
    task: AtomicTask,
    context: ProjectContext
  ): Promise<EnhancedValidationResult> {
    logger.info({ taskId: task.id, projectId: context.projectId }, 'Starting enhanced task validation');

    try {
      // Step 1: Check if research is required
      const researchEvaluation = await this.autoResearchDetector.evaluateResearchNeed({
        task,
        projectContext: context,
        projectPath: context.projectPath || '/tmp'
      });

      let enhancedContext = context;
      let researchTriggered = false;
      let contextGathered = false;

      // Step 2: Trigger auto-research if needed
      if (researchEvaluation.decision.shouldTriggerResearch && researchEvaluation.decision.confidence > 0.7) {
        logger.info({ taskId: task.id }, 'Triggering auto-research for enhanced validation');
        
        try {
          // Note: ResearchIntegration doesn't have enhanceWithResearch method directly
          // For now, we'll mark research as triggered and use the research decision
          researchTriggered = true;
          
          // Enhance task description with research context
          task = {
            ...task,
            description: `${task.description}\n\nResearch Context: ${researchEvaluation.decision.reasoning.join('; ')}`
          };
        } catch (error) {
          logger.warn({ err: error, taskId: task.id }, 'Auto-research failed, continuing with original task');
        }
      }

      // Step 3: Enhance context if needed
      if (!context.codebaseContext) {
        logger.info({ taskId: task.id }, 'Gathering enhanced context for validation');
        
        try {
          const contextResult = await this.contextEnrichmentService.gatherContext({
            taskDescription: task.description,
            projectPath: context.projectPath || '/tmp',
            contentKeywords: this.extractKeywords(task),
            maxFiles: 10,
            maxContentSize: 50000
          });

          if (contextResult && contextResult.contextFiles && contextResult.contextFiles.length > 0) {
            enhancedContext = {
              ...context,
              codebaseContext: {
                relevantFiles: contextResult.contextFiles.map(file => ({
                  path: file.filePath,
                  relevance: file.relevance?.overallScore || 0.5,
                  size: file.charCount,
                  type: file.filePath.split('.').pop() || 'unknown'
                })),
                contextSummary: `Context gathered from ${contextResult.contextFiles.length} files`,
                totalContextSize: contextResult.contextFiles.reduce((sum: number, f) => sum + (f.charCount || 0), 0),
                averageRelevance: contextResult.summary.averageRelevance,
                gatheringMetrics: { 
                  totalTime: contextResult.metrics.totalTime, 
                  searchTime: contextResult.metrics.searchTime,
                  readTime: contextResult.metrics.readTime,
                  scoringTime: contextResult.metrics.scoringTime,
                  cacheHitRate: contextResult.metrics.cacheHitRate
                }
              }
            };
            contextGathered = true;
          }
        } catch (error) {
          logger.warn({ err: error, taskId: task.id }, 'Context enhancement failed, continuing with original context');
        }
      }

      // Step 4: Perform enhanced atomic analysis
      const analysis = await this.analyzeTask(task, enhancedContext);

      // Step 5: Calculate contextual factors
      const contextualFactors = this.calculateContextualFactors(enhancedContext, researchEvaluation.decision as unknown as Record<string, unknown>);

      // Step 6: Calculate quality metrics
      const qualityMetrics = this.calculateQualityMetrics(task, enhancedContext);

      // Step 7: Analyze dependencies
      const dependencyInsights = this.analyzeDependencyInsights(task, enhancedContext);

      // Step 8: Generate auto-enhancements
      const autoEnhancements = {
        researchTriggered,
        contextGathered,
        promptEnhanced: researchTriggered || contextGathered,
        suggestedImprovements: this.generateTaskImprovements(task, analysis, enhancedContext)
      };

      const result: EnhancedValidationResult = {
        analysis,
        contextualFactors,
        qualityMetrics,
        dependencyInsights,
        autoEnhancements
      };

      logger.info({
        taskId: task.id,
        isValid: analysis.isAtomic,
        confidence: analysis.confidence,
        researchTriggered,
        contextGathered,
        qualityScore: qualityMetrics.descriptionQuality
      }, 'Enhanced task validation completed');

      return result;

    } catch (error) {
      logger.error({ err: error, taskId: task.id }, 'Enhanced task validation failed');
      
      // Fallback to basic analysis
      const basicAnalysis = await this.analyzeTask(task, context);
      return {
        analysis: basicAnalysis,
        contextualFactors: {
          projectComplexity: 0.5,
          researchRequired: false,
          contextEnhancementUsed: false,
          technicalDebtImpact: 0.3,
          teamExperienceLevel: 0.6
        },
        qualityMetrics: {
          descriptionQuality: 0.5,
          acceptanceClarityScore: 0.5,
          filePathRealism: 0.5,
          technologyAlignment: 0.5
        },
        dependencyInsights: {
          requiredSkills: [],
          technicalPrerequisites: [],
          externalDependencies: [],
          riskFactors: ['Validation error occurred']
        },
        autoEnhancements: {
          researchTriggered: false,
          contextGathered: false,
          promptEnhanced: false,
          suggestedImprovements: ['Manual review required due to validation error']
        }
      };
    }
  }

  /**
   * Validate multiple tasks with cross-task analysis
   */
  async validateTaskBatch(
    tasks: AtomicTask[],
    context: ProjectContext
  ): Promise<BatchValidationResult> {
    logger.info({ projectId: context.projectId, taskCount: tasks.length }, 'Starting batch task validation');

    // Validate individual tasks
    const individual = await Promise.all(
      tasks.map(task => this.validateTaskEnhanced(task, context))
    );

    // Calculate batch metrics
    const batchMetrics = this.calculateBatchMetrics(individual, tasks);

    // Generate batch recommendations
    const batchRecommendations = this.generateBatchRecommendations(individual, tasks);

    return {
      individual,
      batchMetrics,
      batchRecommendations
    };
  }

  // ===== HELPER METHODS =====

  /**
   * Extract keywords from task for context gathering
   */
  private extractKeywords(task: AtomicTask): string[] {
    const text = `${task.title} ${task.description}`.toLowerCase();
    const words = text.split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    
    return words
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter(word => /^[a-zA-Z]+$/.test(word))
      .slice(0, 10); // Limit to top 10 keywords
  }

  /**
   * Calculate contextual factors affecting validation
   */
  private calculateContextualFactors(
    context: ProjectContext,
    researchDecision: Record<string, unknown>
  ): EnhancedValidationResult['contextualFactors'] {
    let projectComplexity = 0.5;
    if (context.complexity === 'high') projectComplexity = 0.9;
    else if (context.complexity === 'medium') projectComplexity = 0.7;
    else if (context.complexity === 'low') projectComplexity = 0.3;

    const technicalDebtImpact = context.codebaseSize === 'large' ? 0.7 : 
                               context.codebaseSize === 'medium' ? 0.4 : 0.2;

    const teamExperienceLevel = context.teamSize && context.teamSize > 5 ? 0.8 : 0.6;

    return {
      projectComplexity,
      researchRequired: (researchDecision.shouldTrigger as boolean) || false,
      contextEnhancementUsed: !!context.codebaseContext,
      technicalDebtImpact,
      teamExperienceLevel
    };
  }

  /**
   * Calculate quality metrics for task
   */
  private calculateQualityMetrics(
    task: AtomicTask,
    context: ProjectContext
  ): EnhancedValidationResult['qualityMetrics'] {
    // Description quality (0-1)
    const descLength = task.description.length;
    const descriptionQuality = Math.min(1, Math.max(0, (descLength - 20) / 100));

    // Acceptance criteria clarity (0-1)
    const criteriaCount = task.acceptanceCriteria?.length || 0;
    const acceptanceClarityScore = criteriaCount === 1 ? 1 : criteriaCount === 0 ? 0 : 0.5;

    // File path realism (0-1)
    let filePathRealism = 0.5; // default
    if (task.filePaths && task.filePaths.length > 0) {
      const hasValidPaths = task.filePaths.every(path => 
        path.includes('/') && path.includes('.')
      );
      filePathRealism = hasValidPaths ? 0.9 : 0.3;
    }

    // Technology alignment (0-1)
    let technologyAlignment = 0.5; // default
    if (context.languages && context.languages.length > 0) {
      const mentionsLanguage = context.languages.some(lang => 
        task.description.toLowerCase().includes(lang.toLowerCase())
      );
      technologyAlignment = mentionsLanguage ? 0.9 : 0.4;
    }

    return {
      descriptionQuality,
      acceptanceClarityScore,
      filePathRealism,
      technologyAlignment
    };
  }

  /**
   * Analyze dependency insights
   */
  private analyzeDependencyInsights(
    task: AtomicTask,
    context: ProjectContext
  ): EnhancedValidationResult['dependencyInsights'] {
    const requiredSkills: string[] = [];
    const technicalPrerequisites: string[] = [];
    const externalDependencies: string[] = [];
    const riskFactors: string[] = [];

    // Skill analysis
    if (task.type === 'development') {
      requiredSkills.push('programming');
      if (context.languages) requiredSkills.push(...context.languages);
    }

    if (task.type === 'testing') {
      requiredSkills.push('testing', 'quality assurance');
    }

    // Technical prerequisites
    if (task.description.toLowerCase().includes('database')) {
      technicalPrerequisites.push('database setup');
    }

    if (task.description.toLowerCase().includes('api')) {
      technicalPrerequisites.push('API framework');
      externalDependencies.push('external API');
    }

    // Risk factors
    if (task.estimatedHours > 4) {
      riskFactors.push('High time complexity');
    }

    if ((task.filePaths?.length || 0) > 2) {
      riskFactors.push('Multiple file modifications');
    }

    return {
      requiredSkills: [...new Set(requiredSkills)],
      technicalPrerequisites: [...new Set(technicalPrerequisites)],
      externalDependencies: [...new Set(externalDependencies)],
      riskFactors: [...new Set(riskFactors)]
    };
  }

  /**
   * Generate task improvement suggestions
   */
  private generateTaskImprovements(
    task: AtomicTask,
    analysis: AtomicityAnalysis,
    context: ProjectContext
  ): string[] {
    const improvements: string[] = [];

    if (!analysis.isAtomic) {
      improvements.push('Break down into smaller atomic sub-tasks');
    }

    if (task.description.length < 30) {
      improvements.push('Add more detailed implementation guidance');
    }

    if (!task.acceptanceCriteria || task.acceptanceCriteria.length === 0) {
      improvements.push('Add specific acceptance criteria');
    }

    if (!task.filePaths || task.filePaths.length === 0) {
      improvements.push('Specify target files for implementation');
    }

    if (context.languages && !context.languages.some(lang => 
      task.description.toLowerCase().includes(lang.toLowerCase())
    )) {
      improvements.push(`Consider mentioning technology stack: ${context.languages.join(', ')}`);
    }

    return improvements;
  }

  /**
   * Calculate batch metrics
   */
  private calculateBatchMetrics(
    results: EnhancedValidationResult[],
    tasks: AtomicTask[]
  ): BatchValidationResult['batchMetrics'] {
    const validTasks = results.filter(r => r.analysis.isAtomic);
    const overallValid = validTasks.length === results.length;

    const averageConfidence = results.reduce((sum, r) => sum + r.analysis.confidence, 0) / results.length;
    const totalEffort = results.reduce((sum, r) => sum + r.analysis.estimatedHours, 0);

    // Detect duplicates
    const duplicateCount = this.detectDuplicates(tasks).length;

    // Skill distribution
    const skillDistribution: Record<string, number> = {};
    results.forEach(r => {
      r.dependencyInsights.requiredSkills.forEach(skill => {
        skillDistribution[skill] = (skillDistribution[skill] || 0) + 1;
      });
    });

    // Risk distribution
    const riskDistribution = {
      low: results.filter(r => r.analysis.confidence > 0.8).length,
      medium: results.filter(r => r.analysis.confidence > 0.5 && r.analysis.confidence <= 0.8).length,
      high: results.filter(r => r.analysis.confidence <= 0.5).length
    };

    return {
      overallValid,
      averageConfidence,
      totalEffort,
      duplicateCount,
      skillDistribution,
      riskDistribution
    };
  }

  /**
   * Generate batch recommendations
   */
  private generateBatchRecommendations(
    results: EnhancedValidationResult[],
    tasks: AtomicTask[]
  ): string[] {
    const recommendations: string[] = [];

    const invalidCount = results.filter(r => !r.analysis.isAtomic).length;
    if (invalidCount > 0) {
      recommendations.push(`${invalidCount} tasks need revision before proceeding`);
    }

    const totalEffort = results.reduce((sum, r) => sum + r.analysis.estimatedHours, 0);
    if (totalEffort > 40) {
      recommendations.push('Consider breaking into multiple development cycles');
    }

    const lowConfidenceCount = results.filter(r => r.analysis.confidence < 0.6).length;
    if (lowConfidenceCount > tasks.length * 0.3) {
      recommendations.push('High uncertainty detected - consider additional planning');
    }

    const researchTriggeredCount = results.filter(r => r.autoEnhancements.researchTriggered).length;
    if (researchTriggeredCount > 0) {
      recommendations.push(`${researchTriggeredCount} tasks enhanced with research insights`);
    }

    return recommendations;
  }

  /**
   * Detect duplicate tasks
   */
  private detectDuplicates(tasks: AtomicTask[]): Array<{ task1: string; task2: string }> {
    const duplicates: Array<{ task1: string; task2: string }> = [];

    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        const similarity = this.calculateSimilarity(tasks[i], tasks[j]);
        if (similarity > 0.8) {
          duplicates.push({ task1: tasks[i].id, task2: tasks[j].id });
        }
      }
    }

    return duplicates;
  }

  /**
   * Calculate similarity between tasks
   */
  private calculateSimilarity(task1: AtomicTask, task2: AtomicTask): number {
    const title1 = task1.title.toLowerCase();
    const title2 = task2.title.toLowerCase();
    
    // Simple similarity based on common words
    const words1 = new Set(title1.split(/\s+/));
    const words2 = new Set(title2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
}

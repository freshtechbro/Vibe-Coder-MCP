/**
 * Natural Language Response Generator
 * Generates natural language responses for user commands
 */

import { Intent, RecognizedIntent, NLResponse } from '../types/nl.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CommandExecutionResult } from './command-handlers.js';
import logger from '../../../logger.js';

/**
 * Response generation context
 */
export interface ResponseContext {
  sessionId: string;
  userId?: string;
  userPreferences: Record<string, unknown>;
  conversationHistory: RecognizedIntent[];
  currentProject?: string;
  currentTask?: string;
}

/**
 * Response generation configuration
 */
export interface ResponseGeneratorConfig {
  /** Whether to include suggestions in responses */
  includeSuggestions: boolean;
  /** Maximum number of suggestions to include */
  maxSuggestions: number;
  /** Whether to personalize responses */
  enablePersonalization: boolean;
  /** Response tone (formal, casual, technical) */
  tone: 'formal' | 'casual' | 'technical';
  /** Whether to include emojis in responses */
  includeEmojis: boolean;
}

/**
 * Natural Language Response Generator
 * Converts command execution results into natural language responses
 */
export class ResponseGenerator {
  private static instance: ResponseGenerator;
  private config: ResponseGeneratorConfig;

  private constructor() {
    this.config = {
      includeSuggestions: true,
      maxSuggestions: 3,
      enablePersonalization: true,
      tone: 'casual',
      includeEmojis: true
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ResponseGenerator {
    if (!ResponseGenerator.instance) {
      ResponseGenerator.instance = new ResponseGenerator();
    }
    return ResponseGenerator.instance;
  }

  /**
   * Generate natural language response from command execution result
   */
  generateResponse(
    executionResult: CommandExecutionResult,
    recognizedIntent: RecognizedIntent,
    context: ResponseContext
  ): NLResponse {
    try {
      logger.debug({
        intent: recognizedIntent.intent,
        success: executionResult.success,
        sessionId: context.sessionId
      }, 'Generating natural language response');

      if (executionResult.success) {
        return this.generateSuccessResponse(executionResult, recognizedIntent, context);
      } else {
        return this.generateErrorResponse(executionResult, recognizedIntent, context);
      }
    } catch (error) {
      logger.error({ err: error, sessionId: context.sessionId }, 'Response generation failed');

      return {
        text: 'I encountered an error while processing your request. Please try again.',
        type: 'error',
        requiresConfirmation: false,
        suggestions: ['Try rephrasing your request', 'Check the command syntax'],
        metadata: {
          generatedAt: new Date(),
          method: 'template',
          confidence: 0
        }
      };
    }
  }

  /**
   * Generate success response
   */
  private generateSuccessResponse(
    executionResult: CommandExecutionResult,
    recognizedIntent: RecognizedIntent,
    context: ResponseContext
  ): NLResponse {
    const baseText = this.extractTextFromResult(executionResult.result);
    const personalizedText = this.personalizeResponse(baseText, recognizedIntent, context);
    const suggestions = this.generateSuggestions(executionResult, recognizedIntent, context);

    return {
      text: personalizedText,
      type: 'success',
      data: {
        intent: recognizedIntent.intent,
        confidence: recognizedIntent.confidence,
        updatedContext: executionResult.updatedContext
      },
      suggestions,
      requiresConfirmation: false,
      metadata: {
        generatedAt: new Date(),
        method: 'template',
        confidence: recognizedIntent.confidence
      }
    };
  }

  /**
   * Generate error response
   */
  private generateErrorResponse(
    executionResult: CommandExecutionResult,
    recognizedIntent: RecognizedIntent,
    context: ResponseContext
  ): NLResponse {
    const baseText = this.extractTextFromResult(executionResult.result);
    const helpfulText = this.makeErrorHelpful(baseText, recognizedIntent, context);
    const suggestions = this.generateErrorSuggestions(executionResult, recognizedIntent, context);

    return {
      text: helpfulText,
      type: 'error',
      data: {
        intent: recognizedIntent.intent,
        confidence: recognizedIntent.confidence
      },
      suggestions,
      requiresConfirmation: false,
      metadata: {
        generatedAt: new Date(),
        method: 'template',
        confidence: recognizedIntent.confidence
      }
    };
  }

  /**
   * Extract text content from CallToolResult
   */
  private extractTextFromResult(result: CallToolResult): string {
    if (result.content && result.content.length > 0) {
      const textContent = result.content.find(c => c.type === 'text');
      return textContent ? textContent.text : 'Command completed successfully.';
    }
    return 'Command completed successfully.';
  }

  /**
   * Personalize response based on context and preferences
   */
  private personalizeResponse(
    text: string,
    recognizedIntent: RecognizedIntent,
    context: ResponseContext
  ): string {
    if (!this.config.enablePersonalization) {
      return text;
    }

    let personalizedText = text;

    // Add context-aware greetings for first interaction
    if (context.conversationHistory.length === 0) {
      const greeting = this.getContextualGreeting(recognizedIntent.intent);
      if (greeting) {
        personalizedText = `${greeting}\n\n${personalizedText}`;
      }
    }

    // Add project context if relevant
    if (context.currentProject && !text.includes(context.currentProject)) {
      const projectContext = this.getProjectContext(recognizedIntent.intent, context.currentProject);
      if (projectContext) {
        personalizedText += `\n\n${projectContext}`;
      }
    }

    // Adjust tone based on configuration
    personalizedText = this.adjustTone(personalizedText, this.config.tone);

    return personalizedText;
  }

  /**
   * Get contextual greeting for first interaction
   */
  private getContextualGreeting(intent: Intent): string | null {
    const greetings: Partial<Record<Intent, string>> = {
      'create_project': '🚀 Great! Let\'s get your new project started.',
      'create_task': '📝 Perfect! I\'ll help you create that task.',
      'list_projects': '📋 Here\'s an overview of your projects.',
      'list_tasks': '📝 Let me show you your tasks.',
      'run_task': '⚡ Time to get some work done!',
      'check_status': '📊 Let me check on that for you.',
      'decompose_task': '🔍 I\'ll break that down into manageable pieces.',
      'refine_task': '✨ Let\'s refine that task to make it clearer.',
      'assign_task': '👥 I\'ll help you assign that task.',
      'get_help': '💡 I\'m here to help!',
      'open_project': '📂 Opening that project for you.'
    };

    return greetings[intent] || null;
  }

  /**
   * Get project context information
   */
  private getProjectContext(intent: Intent, currentProject: string): string | null {
    const contextMessages: Partial<Record<Intent, string>> = {
      'create_task': `This task will be added to your current project: ${currentProject}.`,
      'list_tasks': `Showing tasks for your current project: ${currentProject}.`,
      'check_status': `Current project context: ${currentProject}.`,
      'run_task': `Executing within project: ${currentProject}.`
    };

    return contextMessages[intent] || null;
  }

  /**
   * Adjust response tone
   */
  private adjustTone(text: string, tone: 'formal' | 'casual' | 'technical'): string {
    switch (tone) {
      case 'formal':
        return text
          .replace(/Great!/g, 'Excellent.')
          .replace(/Perfect!/g, 'Very good.')
          .replace(/Let's/g, 'We shall')
          .replace(/I'll/g, 'I will');

      case 'technical':
        return text
          .replace(/Great!/g, 'Operation successful.')
          .replace(/Perfect!/g, 'Command executed.')
          .replace(/Let me/g, 'Processing');

      case 'casual':
      default:
        return text; // Keep casual tone as default
    }
  }

  /**
   * Generate suggestions for successful commands
   */
  private generateSuggestions(
    executionResult: CommandExecutionResult,
    recognizedIntent: RecognizedIntent,
    context: ResponseContext
  ): string[] {
    const suggestions: string[] = [];

    // Use follow-up suggestions from execution result if available
    if (executionResult.followUpSuggestions) {
      suggestions.push(...executionResult.followUpSuggestions.slice(0, this.config.maxSuggestions));
    }

    // Add intent-specific suggestions if we have room
    if (suggestions.length < this.config.maxSuggestions) {
      const intentSuggestions = this.getIntentSpecificSuggestions(recognizedIntent.intent, context);
      const remainingSlots = this.config.maxSuggestions - suggestions.length;
      suggestions.push(...intentSuggestions.slice(0, remainingSlots));
    }

    return suggestions;
  }

  /**
   * Generate suggestions for error responses
   */
  private generateErrorSuggestions(
    executionResult: CommandExecutionResult,
    recognizedIntent: RecognizedIntent,
    context: ResponseContext
  ): string[] {
    const suggestions = [
      'Try rephrasing your request',
      'Check the command syntax',
      'Ask for help with available commands'
    ];

    // Add intent-specific error suggestions
    const intentSuggestions = this.getErrorSuggestionsForIntent(recognizedIntent.intent);
    suggestions.push(...intentSuggestions);

    return suggestions.slice(0, this.config.maxSuggestions);
  }

  /**
   * Get intent-specific suggestions
   */
  private getIntentSpecificSuggestions(intent: Intent, context: ResponseContext): string[] {
    const suggestions: Record<Intent, string[]> = {
      'create_project': ['Add tasks to your project', 'Set project priorities', 'Invite team members'],
      'update_project': ['Modify project settings', 'Change project configuration', 'Update project details'],
      'create_task': ['Run the task', 'Set task dependencies', 'Assign the task'],
      'list_projects': ['Create a new project', 'Check project status', 'Archive old projects'],
      'list_tasks': ['Create a new task', 'Run a task', 'Update task status'],
      'run_task': ['Check task progress', 'View execution logs', 'Stop task execution'],
      'check_status': ['Update project status', 'View detailed reports', 'Set status alerts'],
      'decompose_task': ['Review subtasks', 'Assign subtasks', 'Set task priorities'],
      'decompose_project': ['Review project breakdown', 'Create epics', 'Set project priorities'],
      'search_files': ['Search for content', 'List all files', 'Open a file'],
      'search_content': ['Search for files', 'Show file details', 'Edit a file'],
      'refine_task': ['Update task description', 'Set acceptance criteria', 'Add task notes'],
      'assign_task': ['Set task deadlines', 'Add task comments', 'Track assignment'],
      'get_help': ['View command examples', 'Check documentation', 'Contact support'],
      'open_project': ['View project details', 'Edit project settings', 'Add project members'],
      'parse_prd': ['Generate epics from PRD', 'Create tasks from features', 'Review PRD content'],
      'parse_tasks': ['Execute task list', 'Review task dependencies', 'Assign tasks to agents'],
      'import_artifact': ['Parse specific artifact type', 'Review imported content', 'Create project from artifact'],
      'unrecognized_intent': ['Try being more specific', 'Ask for help', 'View available commands'],
      'clarification_needed': ['Provide more details', 'Be more specific', 'Try a different approach'],
      'unknown': ['Try a different command', 'Ask for help', 'View available commands']
    };

    return suggestions[intent] || [];
  }

  /**
   * Get error suggestions for specific intents
   */
  private getErrorSuggestionsForIntent(intent: Intent): string[] {
    const errorSuggestions: Partial<Record<Intent, string[]>> = {
      'create_project': ['Provide a project name', 'Check project name format'],
      'create_task': ['Specify task details', 'Set a project context'],
      'run_task': ['Provide a valid task ID', 'Check task status'],
      'check_status': ['Specify what to check', 'Provide project or task name']
    };

    return errorSuggestions[intent] || [];
  }

  /**
   * Make error messages more helpful
   */
  private makeErrorHelpful(
    errorText: string,
    recognizedIntent: RecognizedIntent,
    context: ResponseContext
  ): string {
    let helpfulText = errorText;

    // Add context about what went wrong
    if (recognizedIntent.confidence < 0.5) {
      helpfulText += '\n\nI wasn\'t very confident about understanding your request. ';
      helpfulText += 'Could you try rephrasing it more specifically?';
    }

    // Add examples for common errors
    if (errorText.includes('required')) {
      helpfulText += '\n\nFor example, try: "Create a project called MyApp" or "Run task 123"';
    }

    return helpfulText;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ResponseGeneratorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info({ config: this.config }, 'Response Generator configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): ResponseGeneratorConfig {
    return { ...this.config };
  }
}

/**
 * Convenience function to get response generator instance
 */
export function getResponseGenerator(): ResponseGenerator {
  return ResponseGenerator.getInstance();
}

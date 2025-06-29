/**
 * Schema-Aware LLM Helper
 * 
 * Provides enhanced LLM functions with built-in Zod schema validation
 * and improved prompt engineering for structured output generation.
 * 
 * This is a NEW module that doesn't modify existing functions,
 * ensuring zero impact on other tools in the Vibe Coder MCP ecosystem.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { performFormatAwareLlmCall, intelligentJsonParse } from './llmHelper.js';
import { OpenRouterConfig } from '../types/workflow.js';
import { ValidationError } from './errors.js';
import logger from '../logger.js';

/**
 * Configuration options for schema-aware LLM calls
 */
export interface SchemaAwareLlmOptions {
  /** Maximum number of retry attempts for validation failures */
  maxRetries?: number;
  /** Temperature for LLM calls (default: 0.1 for deterministic output) */
  temperature?: number;
  /** Whether to include schema in prompt for better guidance */
  includeSchemaInPrompt?: boolean;
  /** Whether to include validation examples in prompt */
  includeExamples?: boolean;
  /** Custom validation error messages to include in retry prompts */
  customErrorMessages?: string[];
}

/**
 * Result of a schema-aware LLM call
 */
export interface SchemaAwareLlmResult<T> {
  /** The validated and parsed result */
  data: T;
  /** Number of attempts made */
  attempts: number;
  /** Whether any retries were needed */
  hadRetries: boolean;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Raw LLM response before parsing */
  rawResponse: string;
}

/**
 * Enhanced LLM call with built-in Zod schema validation and retry logic
 * 
 * This function provides:
 * - Automatic schema validation with detailed error messages
 * - Intelligent retry logic with enhanced prompts
 * - Schema inclusion in prompts for better LLM guidance
 * - Comprehensive error handling and logging
 * 
 * @param prompt The user prompt to send to the LLM
 * @param systemPrompt The system prompt defining the LLM's role
 * @param config OpenRouter configuration
 * @param logicalTaskName Task identifier for logging and model selection
 * @param zodSchema Zod schema for validation
 * @param options Additional configuration options
 * @returns Promise resolving to validated result
 */
export async function performSchemaAwareLlmCall<T>(
  prompt: string,
  systemPrompt: string,
  config: OpenRouterConfig,
  logicalTaskName: string,
  zodSchema: z.ZodSchema<T>,
  options: SchemaAwareLlmOptions = {}
): Promise<SchemaAwareLlmResult<T>> {
  const startTime = Date.now();
  const {
    maxRetries = 3,
    temperature = 0.1,
    includeSchemaInPrompt = true,
    includeExamples = true,
    customErrorMessages = []
  } = options;

  let lastError: Error | undefined;
  let rawResponse = '';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Build enhanced prompt with schema guidance
      const enhancedPrompt = buildSchemaGuidedPrompt(
        prompt,
        zodSchema,
        {
          includeSchema: includeSchemaInPrompt,
          includeExamples,
          attempt,
          previousErrors: attempt > 1 ? [lastError?.message || 'Previous attempt failed validation'] : [],
          customErrorMessages
        }
      );

      logger.debug({
        logicalTaskName,
        attempt,
        maxRetries,
        promptLength: enhancedPrompt.length,
        includeSchemaInPrompt,
        includeExamples
      }, 'Performing schema-aware LLM call');

      // Make the LLM call
      rawResponse = await performFormatAwareLlmCall(
        enhancedPrompt,
        systemPrompt,
        config,
        logicalTaskName,
        'json',
        undefined, // We handle schema validation ourselves
        temperature
      );

      // Parse the response
      const parsed = intelligentJsonParse(rawResponse, `${logicalTaskName}-attempt-${attempt}`);
      
      // Validate against schema
      const validated = zodSchema.parse(parsed);
      
      const processingTime = Date.now() - startTime;
      
      logger.info({
        logicalTaskName,
        attempt,
        success: true,
        processingTimeMs: processingTime,
        hadRetries: attempt > 1,
        responseLength: rawResponse.length
      }, 'Schema-aware LLM call succeeded');

      return {
        data: validated,
        attempts: attempt,
        hadRetries: attempt > 1,
        processingTimeMs: processingTime,
        rawResponse
      };
      
    } catch (error) {
      lastError = error as Error;
      
      logger.warn({
        logicalTaskName,
        attempt,
        maxRetries,
        error: error instanceof Error ? error.message : String(error),
        isZodError: error instanceof z.ZodError,
        zodIssues: error instanceof z.ZodError ? error.issues : undefined
      }, 'Schema-aware LLM call attempt failed');
      
      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        break;
      }
      
      // Add error context for next attempt
      if (error instanceof z.ZodError) {
        const validationErrors = error.issues.map(issue => 
          `${issue.path.join('.')}: ${issue.message}`
        ).join('; ');
        customErrorMessages.push(`Validation failed: ${validationErrors}`);
      }
    }
  }
  
  const processingTime = Date.now() - startTime;
  
  // All attempts failed
  throw new ValidationError(
    `Schema-aware LLM call failed after ${maxRetries} attempts for task: ${logicalTaskName}`,
    undefined, // No specific Zod issues available
    {
      lastError: lastError?.message,
      attempts: maxRetries,
      processingTimeMs: processingTime,
      rawResponse: rawResponse.substring(0, 500) // Include truncated response for debugging
    }
  );
}

/**
 * Builds an enhanced prompt with schema guidance and validation instructions
 */
function buildSchemaGuidedPrompt(
  originalPrompt: string,
  zodSchema: z.ZodSchema,
  options: {
    includeSchema: boolean;
    includeExamples: boolean;
    attempt: number;
    previousErrors: string[];
    customErrorMessages: string[];
  }
): string {
  const { includeSchema, includeExamples, attempt, previousErrors, customErrorMessages } = options;
  
  let enhancedPrompt = originalPrompt;
  
  // Add retry context if this is not the first attempt
  if (attempt > 1) {
    enhancedPrompt += `\n\n⚠️ RETRY ATTEMPT ${attempt}:\n`;
    if (previousErrors.length > 0) {
      enhancedPrompt += `Previous attempt failed with: ${previousErrors.join('; ')}\n`;
    }
    if (customErrorMessages.length > 0) {
      enhancedPrompt += `Specific issues to fix: ${customErrorMessages.join('; ')}\n`;
    }
    enhancedPrompt += `Please ensure your response exactly matches the required schema.\n`;
  }
  
  // Add schema guidance
  if (includeSchema) {
    try {
      const jsonSchema = zodToJsonSchema(zodSchema, {
        name: 'ResponseSchema',
        $refStrategy: 'none' // Inline all references for clarity
      });
      
      enhancedPrompt += `\n\n📋 REQUIRED JSON SCHEMA:\n`;
      enhancedPrompt += `Your response must be valid JSON that exactly matches this schema:\n\n`;
      enhancedPrompt += `\`\`\`json\n${JSON.stringify(jsonSchema, null, 2)}\n\`\`\`\n`;
    } catch (error) {
      logger.warn({ error }, 'Failed to convert Zod schema to JSON schema');
    }
  }
  
  // Add validation requirements
  enhancedPrompt += `\n\n✅ CRITICAL REQUIREMENTS:\n`;
  enhancedPrompt += `1. Response must be valid JSON only - no markdown, no explanations, no code blocks\n`;
  enhancedPrompt += `2. All required fields must be present and correctly typed\n`;
  enhancedPrompt += `3. Use double quotes for all strings\n`;
  enhancedPrompt += `4. No trailing commas\n`;
  enhancedPrompt += `5. No comments in JSON\n`;
  enhancedPrompt += `6. Ensure all nested objects and arrays are properly structured\n`;
  
  // Add examples if requested
  if (includeExamples) {
    enhancedPrompt += `\n\n💡 FORMATTING EXAMPLE:\n`;
    enhancedPrompt += `Your response should look like this structure (with your actual data):\n`;
    enhancedPrompt += `\`\`\`json\n{\n  "field1": "value1",\n  "field2": {\n    "nested": "value"\n  },\n  "field3": ["item1", "item2"]\n}\n\`\`\`\n`;
  }
  
  enhancedPrompt += `\n\nJSON Response:`;
  
  return enhancedPrompt;
}

/**
 * Utility function to create a schema-aware LLM call with predefined options
 * for common use cases in the Fullstack Starter Kit Generator
 */
export async function performModuleSelectionCall<T>(
  prompt: string,
  systemPrompt: string,
  config: OpenRouterConfig,
  zodSchema: z.ZodSchema<T>
): Promise<SchemaAwareLlmResult<T>> {
  return performSchemaAwareLlmCall(
    prompt,
    systemPrompt,
    config,
    'fullstack_starter_kit_module_selection',
    zodSchema,
    {
      maxRetries: 3,
      temperature: 0.1,
      includeSchemaInPrompt: true,
      includeExamples: true
    }
  );
}

/**
 * Utility function for template generation with schema validation
 */
export async function performTemplateGenerationCall<T>(
  prompt: string,
  systemPrompt: string,
  config: OpenRouterConfig,
  zodSchema: z.ZodSchema<T>
): Promise<SchemaAwareLlmResult<T>> {
  return performSchemaAwareLlmCall(
    prompt,
    systemPrompt,
    config,
    'fullstack_starter_kit_dynamic_yaml_module_generation',
    zodSchema,
    {
      maxRetries: 2, // Fewer retries for template generation
      temperature: 0.2, // Slightly higher temperature for creativity
      includeSchemaInPrompt: true,
      includeExamples: false // Templates are more complex, examples might confuse
    }
  );
}

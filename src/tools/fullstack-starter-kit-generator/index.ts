import { z } from 'zod';
import { CallToolResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { performFormatAwareLlmCall } from '../../utils/llmHelper.js';
import { performModuleSelectionCall } from '../../utils/schemaAwareLlmHelper.js';
import {
  moduleSelectionResponseSchema,
  enhancedModuleSelectionResponseSchema,
  type ModuleSelectionResponse,
  validateModuleSelectionWithErrors,
  validateEnhancedModuleSelectionWithErrors
} from './schemas/moduleSelection.js';
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { starterKitDefinitionSchema, StarterKitDefinition, fileStructureItemSchema, FileStructureItem } from './schema.js';
import { generateSetupScripts, ScriptOutput } from './scripts.js';
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { jobManager, JobStatus } from '../../services/job-manager/index.js';
import { sseNotifier } from '../../services/sse-notifier/index.js';
import { AppError, ValidationError, ParsingError, ToolExecutionError, ConfigurationError } from '../../utils/errors.js';
import { formatBackgroundJobInitiationResponse } from '../../services/job-response-formatter/index.js';
import { YAMLComposer } from './yaml-composer.js';

// Helper function to get the base output directory
function getBaseOutputDir(): string {
  return process.env.VIBE_CODER_OUTPUT_DIR
    ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
    : path.join(process.cwd(), 'VibeCoderOutput');
}

const STARTER_KIT_DIR = path.join(getBaseOutputDir(), 'fullstack-starter-kit-generator');

export interface FullstackStarterKitInput {
  use_case: string;
  tech_stack_preferences?: {
    frontend?: string;
    backend?: string;
    database?: string;
    orm?: string;
    authentication?: string;
    deployment?: string;
    [key: string]: string | undefined;
  };
  request_recommendation?: boolean; // When true: PAID (uses research API), When false: FREE (basic generation)
  include_optional_features?: string[];
}

export async function initDirectories() {
  const baseOutputDir = getBaseOutputDir();
  try {
    await fs.ensureDir(baseOutputDir);
    const toolDir = path.join(baseOutputDir, 'fullstack-starter-kit-generator');
    await fs.ensureDir(toolDir);
    logger.debug(`Ensured starter kit directory exists: ${toolDir}`);
  } catch (error) {
    logger.error({ err: error, path: baseOutputDir }, `Failed to ensure base output directory exists for fullstack-starter-kit-generator.`);
  }
}

const starterKitInputSchemaShape = {
  use_case: z.string().min(5, { message: "Use case must be at least 5 characters." }).describe("The specific use case for the starter kit (e.g., 'E-commerce site', 'Blog platform')"),
  tech_stack_preferences: z.record(z.string().optional()).optional().describe("Optional tech stack preferences (e.g., { frontend: 'Vue', backend: 'Python' })"),
  request_recommendation: z.boolean().optional().describe("Whether to request recommendations for tech stack components based on research. TRUE=PAID (uses research API), FALSE=FREE (basic generation). Default: false"),
  include_optional_features: z.array(z.string()).optional().describe("Optional features to include (e.g., ['Docker', 'CI/CD'])")
};

/**
 * Determines if a project is complex enough to warrant the enhanced module selection schema
 * Based on use case keywords, research context, and tech stack preferences
 */
function determineProjectComplexity(
  useCase: string,
  researchContext: string,
  techStackPreferences?: Record<string, string | undefined>
): boolean {
  const complexityIndicators = [
    // Use case complexity keywords
    'enterprise', 'platform', 'marketplace', 'e-commerce', 'ecommerce', 'saas', 'multi-tenant',
    'microservices', 'distributed', 'scalable', 'real-time', 'ai', 'machine learning', 'ml',
    'analytics', 'dashboard', 'admin', 'cms', 'crm', 'erp', 'social', 'collaboration',
    'payment', 'financial', 'fintech', 'healthcare', 'education', 'gaming', 'streaming',

    // Architecture complexity keywords
    'api gateway', 'load balancer', 'caching', 'queue', 'worker', 'background job',
    'notification', 'email', 'sms', 'push notification', 'websocket', 'graphql',
    'authentication', 'authorization', 'oauth', 'sso', 'rbac', 'security',
    'monitoring', 'logging', 'metrics', 'observability', 'deployment', 'ci/cd',
    'docker', 'kubernetes', 'cloud', 'aws', 'azure', 'gcp'
  ];

  const useCaseLower = useCase.toLowerCase();
  const researchLower = researchContext.toLowerCase();

  // Check use case complexity
  const useCaseComplexity = complexityIndicators.some(indicator =>
    useCaseLower.includes(indicator)
  );

  // Check research context complexity
  const researchComplexity = complexityIndicators.some(indicator =>
    researchLower.includes(indicator)
  );

  // Check tech stack complexity (multiple technologies or advanced frameworks)
  const techStackComplexity = techStackPreferences &&
    Object.keys(techStackPreferences).length > 3;

  // Check for specific complex technology combinations
  const advancedTechStack = techStackPreferences && (
    Object.values(techStackPreferences).some(tech =>
      tech && (
        tech.toLowerCase().includes('microservice') ||
        tech.toLowerCase().includes('kubernetes') ||
        tech.toLowerCase().includes('graphql') ||
        tech.toLowerCase().includes('redis') ||
        tech.toLowerCase().includes('elasticsearch') ||
        tech.toLowerCase().includes('kafka')
      )
    )
  );

  const isComplex = useCaseComplexity || researchComplexity || !!techStackComplexity || !!advancedTechStack;

  logger.debug({
    useCase: useCaseLower.substring(0, 100),
    useCaseComplexity,
    researchComplexity,
    techStackComplexity,
    advancedTechStack,
    isComplex
  }, 'Project complexity analysis');

  return isComplex;
}

export const generateFullstackStarterKit: ToolExecutor = async (
  params: Record<string, unknown>,
  config: OpenRouterConfig,
  context?: ToolExecutionContext
): Promise<CallToolResult> => {
  const sessionId = context?.sessionId || 'unknown-session';
  if (sessionId === 'unknown-session') {
      logger.warn({ tool: 'generateFullstackStarterKit' }, 'Executing tool without a valid sessionId. SSE progress updates will not be sent.');
  }

  logger.debug({
    configReceived: true,
    hasLlmMapping: Boolean(config.llm_mapping),
    mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
  }, 'generateFullstackStarterKit executor received config');

  if (!params.use_case || typeof params.use_case !== 'string') {
    return {
      content: [{ type: 'text', text: 'Error: Missing or invalid required parameter "use_case"' }],
      isError: true
    };
  }

  const input = params as unknown as FullstackStarterKitInput;
  
  // Apply default for request_recommendation from environment variable or default to false (FREE mode)
  if (input.request_recommendation === undefined) {
    const envDefault = process.env.VIBE_FULLSTACK_PAID_RESEARCH?.toLowerCase() === 'true';
    input.request_recommendation = envDefault;
    logger.debug({ envDefault, finalValue: input.request_recommendation }, 'Applied default for request_recommendation from environment');
  }

  const jobId = jobManager.createJob('generate-fullstack-starter-kit', params);
  logger.info({ jobId, tool: 'generateFullstackStarterKit', sessionId }, 'Starting background job.');

  const initialResponse = formatBackgroundJobInitiationResponse(
    jobId,
    'generate-fullstack-starter-kit',
    'Fullstack Starter Kit Generator'
  );

  setImmediate(async () => {
    const logs: string[] = [];
    let validatedDefinition: StarterKitDefinition | undefined;
    const yamlComposer = new YAMLComposer(config);

    try {
      const mode = input.request_recommendation ? 'PAID (with research)' : 'FREE (basic)';
      logger.info({ jobId }, `Starting Fullstack Starter Kit Generator background job for use case: ${input.use_case} [Mode: ${mode}]`);
      logs.push(`[${new Date().toISOString()}] Starting Fullstack Starter Kit Generator for ${input.use_case} [Mode: ${mode}]`);
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Initializing starter kit generation [Mode: ${mode}]...`);
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Initializing [Mode: ${mode}]...`);

      let researchContext = '';
      if (input.request_recommendation) {
        logger.info({ jobId }, "Performing comprehensive pre-generation research (PAID mode)...");
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Performing comprehensive research (PAID mode)...');
        jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Performing comprehensive research (PAID mode)...');

        // Enhanced research with 3 comprehensive queries (aligns with research manager's maxConcurrentRequests: 3)
        const researchQueries = [
          `Current technology stack recommendations, best practices, and architecture patterns for ${input.use_case}. Include latest versions, performance considerations, scalability factors, and industry adoption trends.`,
          `Essential features, user experience patterns, security requirements, and integration capabilities needed for ${input.use_case}. Focus on must-have vs nice-to-have features, accessibility standards, and compliance requirements.`,
          `Development workflow, deployment strategies, testing approaches, and DevOps practices for ${input.use_case}. Include CI/CD recommendations, monitoring solutions, and production readiness considerations.`
        ];

        logger.debug({ jobId, queryCount: researchQueries.length }, "Executing enhanced research queries in parallel");

        const researchResults = await Promise.all(
          researchQueries.map((query, index) =>
            performResearchQuery(query, config).then(result => ({
              index,
              query: query.substring(0, 100) + '...',
              result: result.trim()
            }))
          )
        );

        researchContext = "## Comprehensive Pre-Generation Research Context:\n\n" +
          researchResults.map((r, i) =>
            `### Research Area ${i + 1}: ${['Technology & Architecture', 'Features & Requirements', 'Development & Deployment'][i]}\n${r.result}`
          ).join("\n\n");

        logger.info({ jobId, researchResultsCount: researchResults.length, totalLength: researchContext.length }, "Enhanced research completed successfully");
        logs.push(`[${new Date().toISOString()}] Enhanced research completed with ${researchResults.length} comprehensive queries.`);
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Comprehensive research complete.');
      }

      await initDirectories();

      const moduleSelectionPrompt = `
You are an expert Full-Stack Software Architect AI. Based on the user's request and comprehensive research context, select the appropriate YAML module templates and provide necessary parameters to compose a full-stack starter kit.

User Request:
- Use Case: ${input.use_case}
- Tech Stack Preferences: ${JSON.stringify(input.tech_stack_preferences || {}, null, 2)}
- Optional Features: ${JSON.stringify(input.include_optional_features || [], null, 2)}

${researchContext}

## Research-Driven Module Selection Guidelines:

Based on the research context above, ensure your module selections incorporate:
1. **Technology Choices**: Use the latest recommended versions and best practices identified in the research
2. **Architecture Patterns**: Apply the architectural patterns and scalability considerations mentioned in the research
3. **Feature Requirements**: Include essential features and integrations identified as must-haves in the research
4. **Development Workflow**: Select modules that support the recommended development, testing, and deployment practices
5. **Production Readiness**: Ensure selected modules align with the monitoring, security, and compliance requirements from research

When selecting modules, prioritize those that:
- Align with current industry trends and adoption patterns from the research
- Support the performance and scalability requirements identified
- Include the security and compliance features mentioned in the research
- Enable the recommended CI/CD and DevOps practices

Available YAML Module Categories (and example templates):
- Frontend: 'frontend/react-vite', 'frontend/vue-nuxt', 'frontend/angular-cli', 'frontend/nextjs', 'frontend/svelte-kit'
- Backend: 'backend/nodejs-express', 'backend/python-django', 'backend/java-spring', 'backend/python-fastapi', 'backend/nodejs-nestjs'
- Database: 'database/postgres', 'database/mongodb', 'database/mysql', 'database/supabase', 'database/firebase'
- Authentication: 'auth/jwt', 'auth/oauth2-scaffold', 'auth/firebase-auth', 'auth/supabase-auth', 'auth/auth0'
- Deployment: 'deployment/docker-compose', 'deployment/kubernetes-scaffold', 'deployment/vercel', 'deployment/netlify'
- Utility: 'utility/logging-winston', 'utility/payment-stripe-sdk', 'utility/email-sendgrid', 'utility/voice-recognition-web-api', 'utility/calendar-integration-google', 'utility/push-notifications-web'

CRITICAL: You must respond with EXACTLY this JSON structure. No markdown, no code blocks, no explanations:

{
  "globalParams": {
    "projectName": "string (kebab-case, derived from use case)",
    "projectDescription": "string (detailed description of the project)",
    "frontendPath": "string (default: 'client')",
    "backendPath": "string (default: 'server')",
    "backendPort": 3001,
    "frontendPort": 3000
  },
  "moduleSelections": [
    {
      "modulePath": "string (exact module path from categories above)",
      "moduleKey": "string (use 'frontendPath', 'backendPath', or 'root')",
      "params": {}
    }
  ]
}

REQUIREMENTS:
1. projectName must be kebab-case (e.g., "productivity-project-app")
2. Include at least: frontend, backend, database modules
3. Add authentication if the use case requires user management
4. Add utility modules based on specific features mentioned
5. Use "root" for moduleKey when module applies to project root
6. Use "frontendPath" for frontend modules, "backendPath" for backend modules

Select a comprehensive set of modules for: ${input.use_case}

RESPOND WITH ONLY THE JSON OBJECT - NO OTHER TEXT OR FORMATTING.`;

      logger.info({ jobId }, 'Prompting LLM for YAML module selections and parameters...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Determining project components...');
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Determining project components...');

      // Determine schema complexity based on use case and research context
      const isComplexProject = determineProjectComplexity(input.use_case, researchContext, input.tech_stack_preferences);
      const selectedSchema = isComplexProject ? enhancedModuleSelectionResponseSchema : moduleSelectionResponseSchema;
      const schemaType = isComplexProject ? 'enhanced' : 'standard';

      logger.info({ jobId, isComplexProject, schemaType }, 'Selected module selection schema based on project complexity');

      // Try new schema-aware approach first, fallback to existing method
      let llmModuleSelections: ModuleSelectionResponse;
      let usedSchemaAware = false;

      try {
        logger.debug({ jobId, schemaType }, 'Attempting schema-aware module selection...');

        const schemaAwareResult = await performModuleSelectionCall(
          moduleSelectionPrompt,
          '', // System prompt is part of main prompt for this call
          config,
          selectedSchema
        );

        llmModuleSelections = schemaAwareResult.data;
        usedSchemaAware = true;

        logger.info({
          jobId,
          attempts: schemaAwareResult.attempts,
          hadRetries: schemaAwareResult.hadRetries,
          processingTimeMs: schemaAwareResult.processingTimeMs,
          responseLength: schemaAwareResult.rawResponse.length
        }, 'Schema-aware module selection successful');

        logs.push(`[${new Date().toISOString()}] Schema-aware LLM response received (${schemaAwareResult.attempts} attempts, ${schemaAwareResult.processingTimeMs}ms).`);

      } catch (schemaError) {
        logger.warn({
          jobId,
          error: schemaError instanceof Error ? schemaError.message : String(schemaError)
        }, 'Schema-aware approach failed, falling back to existing method');

        // Fallback to existing approach
        const llmModuleResponseRaw = await performFormatAwareLlmCall(
          moduleSelectionPrompt,
          '', // System prompt is part of main prompt for this call
          config,
          'fullstack_starter_kit_module_selection',
          'json', // Explicitly specify JSON format
          undefined, // Schema will be inferred from task name
          0.1
        );
        logs.push(`[${new Date().toISOString()}] Fallback LLM response for module selection received.`);
        logger.debug({ jobId, rawLlmResponse: llmModuleResponseRaw }, "Raw LLM response for module selection (fallback)");

        try {
          // Use intelligent parsing with validation-first approach for module selection
          const { intelligentJsonParse } = await import('../../utils/llmHelper.js');
          const parsed = intelligentJsonParse(llmModuleResponseRaw, `module-selection-${jobId}`);

          // Validate the parsed result using the appropriate schema
          const validation = isComplexProject
            ? validateEnhancedModuleSelectionWithErrors(parsed)
            : validateModuleSelectionWithErrors(parsed);

          if (!validation.success) {
            throw new ValidationError(
              `Module selection validation failed (${schemaType} schema): ${validation.errors?.join('; ')}`,
              undefined, // No Zod issues available from our custom validation
              { rawResponse: llmModuleResponseRaw, validationErrors: validation.errors, schemaType }
            );
          }

          llmModuleSelections = validation.data!;
          logger.debug({ jobId, responseLength: llmModuleResponseRaw.length, parsedSize: JSON.stringify(llmModuleSelections).length }, "Fallback parsing and validation successful");

        } catch (e) {
          throw new ParsingError("Failed to parse LLM response for module selections as JSON.", { rawResponse: llmModuleResponseRaw }, e instanceof Error ? e : undefined);
        }
      }

      logger.info({ jobId, selections: llmModuleSelections }, 'LLM module selections parsed.');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Project components identified. Assembling kit...');
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Assembling kit from components...');

      const composedDefinition = await yamlComposer.compose(
        llmModuleSelections.moduleSelections,
        llmModuleSelections.globalParams,
        researchContext
      );
      logs.push(`[${new Date().toISOString()}] YAML modules composed into a single definition.`);
      logger.info({ jobId }, 'Successfully composed starter kit definition from YAML modules.');

      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Validating final kit definition...');
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Validating final kit definition...');
      const validationResultFinal = starterKitDefinitionSchema.safeParse(composedDefinition);
      if (!validationResultFinal.success) {
        logger.error({ jobId, errors: validationResultFinal.error.issues, composedDefinition }, "Final composed definition failed schema validation");
        throw new ValidationError('Final composed definition (from YAML) failed schema validation.', validationResultFinal.error.issues, { composedDefinition });
      }
      validatedDefinition = validationResultFinal.data;
      logs.push(`[${new Date().toISOString()}] Final definition validated successfully.`);
      logger.info({ jobId }, 'Final starter kit definition validated successfully.');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedName = (validatedDefinition.projectName || input.use_case.substring(0, 30)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const definitionFilename = `${timestamp}-${sanitizedName}-definition.json`;
      const definitionFilePath = path.join(STARTER_KIT_DIR, definitionFilename);

      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Saving kit definition file...');
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Saving kit definition file...');
      await fs.writeJson(definitionFilePath, validatedDefinition, { spaces: 2 });
      logs.push(`[${new Date().toISOString()}] Saved validated definition to ${definitionFilename}`);
      logger.info({ jobId }, `Saved validated definition to ${definitionFilename}`);

      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating setup scripts...');
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating setup scripts...');
      const scripts: ScriptOutput = generateSetupScripts(validatedDefinition, definitionFilename);
      const scriptShFilename = `${timestamp}-${sanitizedName}-setup.sh`;
      const scriptBatFilename = `${timestamp}-${sanitizedName}-setup.bat`;
      const scriptShFilePath = path.join(STARTER_KIT_DIR, scriptShFilename);
      const scriptBatFilePath = path.join(STARTER_KIT_DIR, scriptBatFilename);
      await fs.writeFile(scriptShFilePath, scripts.sh, { mode: 0o755 });
      await fs.writeFile(scriptBatFilePath, scripts.bat);
      logs.push(`[${new Date().toISOString()}] Saved setup scripts: ${scriptShFilename}, ${scriptBatFilename}`);
      logger.info({ jobId }, `Saved setup scripts to ${STARTER_KIT_DIR}`);

      const responseText = `
# Fullstack Starter Kit Generator (YAML Composed)

## Project: ${validatedDefinition.projectName}
${validatedDefinition.description}

## Tech Stack Overview
${Object.entries(validatedDefinition.techStack).map(([key, tech]) =>
  `- **${key}**: ${tech.name}${tech.version ? ` (${tech.version})` : ''} - ${tech.rationale}`
).join('\n')}

## Project Structure Generation
Setup scripts and the full definition JSON have been generated:
* **Definition JSON:** \`VibeCoderOutput/fullstack-starter-kit-generator/${definitionFilename}\`
* **Linux/macOS Script:** \`VibeCoderOutput/fullstack-starter-kit-generator/${scriptShFilename}\`
* **Windows Script:** \`VibeCoderOutput/fullstack-starter-kit-generator/${scriptBatFilename}\`

To use these scripts:
1. Navigate to an empty directory outside this project.
2. Copy the chosen script (\`.sh\` or \`.bat\`) and the definition JSON (\`${definitionFilename}\`) into that directory.
3. The scripts will expect \`${definitionFilename}\` to be in the same directory they are run from.
4. For Linux/macOS: \`chmod +x ${scriptShFilename} && ./${scriptShFilename}\`
5. For Windows: Double-click \`${scriptBatFilename}\` or run it from the command prompt.

The scripts will unpack the JSON definition to:
- Create the project directory structure.
- Generate all necessary files with content or generation prompts from the YAML modules.
- Install dependencies as specified.
- Run setup commands.

## Next Steps
${validatedDefinition.nextSteps.map(step => `- ${step}`).join('\n')}

Generated by Fullstack Starter Kit Generator using YAML module composition.
If any modules were dynamically generated because their templates were missing, they have been saved to the templates directory for future use.
`;

      jobManager.setJobResult(jobId, { content: [{ type: "text", text: responseText }], isError: false });
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.COMPLETED, 'Starter kit generated successfully.');

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, jobId, tool: 'generateFullstackStarterKit' }, 'Error during background job execution.');
      logs.push(`[${new Date().toISOString()}] Error: ${errorMsg}`);

      let appError: AppError;
      if (error instanceof AppError) {
        appError = error;
      } else if (error instanceof Error) {
        appError = new ToolExecutionError(`Background job ${jobId} failed: ${errorMsg}`, undefined, error);
      } else {
        appError = new ToolExecutionError(`Background job ${jobId} failed with unknown error: ${errorMsg}`);
      }

      const mcpError = new McpError(ErrorCode.InternalError, appError.message, appError.context);
      jobManager.setJobResult(jobId, {
        content: [{ type: 'text', text: `Error in job ${jobId}: ${mcpError.message}\n\nFull Error: ${appError.stack}\n\nLogs:\n${logs.join('\n')}` }],
        isError: true,
        errorDetails: mcpError
      });
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Job failed: ${mcpError.message}`);
    }
  });

  return initialResponse;
};

const starterKitToolDefinition: ToolDefinition = {
  name: "generate-fullstack-starter-kit",
  description: "Generates full-stack project starter kits by composing YAML modules based on user requirements, tech stacks, research-informed recommendations, and then provides setup scripts. FREE MODE (request_recommendation=false): Basic generation using free LLM models. PAID MODE (request_recommendation=true): Advanced recommendations with comprehensive research using paid research API. Dynamically generates missing YAML modules using LLM.",
  inputSchema: starterKitInputSchemaShape,
  executor: generateFullstackStarterKit
};

registerTool(starterKitToolDefinition);
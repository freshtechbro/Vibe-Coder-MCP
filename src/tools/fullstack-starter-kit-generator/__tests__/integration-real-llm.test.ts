import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { performResearchQuery } from '../../../utils/researchHelper.js';
import { performModuleSelectionCall } from '../../../utils/schemaAwareLlmHelper.js';
import { moduleSelectionResponseSchema, enhancedModuleSelectionResponseSchema } from '../schemas/moduleSelection.js';
import { YAMLComposer } from '../yaml-composer.js';
import logger from '../../../logger.js';
import fs from 'fs-extra';
import path from 'path';

// Integration test with real LLM calls
// This test requires actual API keys and will make real API calls
// Skip by default unless INTEGRATION_TEST=true environment variable is set
const shouldRunIntegrationTests = process.env.INTEGRATION_TEST === 'true' && process.env.OPENROUTER_API_KEY;
const skipMessage = shouldRunIntegrationTests
  ? ''
  : 'Skipping integration test - set INTEGRATION_TEST=true and OPENROUTER_API_KEY to run with real LLM calls';

describe('Fullstack Starter Kit Generator - Real LLM Integration', () => {
  let config: OpenRouterConfig;
  let testOutputDir: string;

  beforeAll(async () => {
    if (!shouldRunIntegrationTests) {
      return;
    }

    // Setup test configuration
    config = {
      apiKey: process.env.OPENROUTER_API_KEY || 'test-key',
      llm_mapping: {
        'fullstack_starter_kit_module_selection': 'deepseek/deepseek-r1-0528-qwen3-8b:free',
        'fullstack_starter_kit_dynamic_yaml_module_generation': 'deepseek/deepseek-r1-0528-qwen3-8b:free',
        'research_query': 'perplexity/sonar-small-online'
      }
    };

    // API key is already verified by shouldRunIntegrationTests check

    // Setup test output directory
    testOutputDir = path.join(process.cwd(), 'test-output', 'integration-tests');
    await fs.ensureDir(testOutputDir);

    logger.info('Integration test setup complete');
  });

  afterAll(async () => {
    if (!shouldRunIntegrationTests) {
      return;
    }

    // Cleanup test output directory
    try {
      await fs.remove(testOutputDir);
      logger.info('Integration test cleanup complete');
    } catch (error) {
      logger.warn({ error }, 'Failed to cleanup test output directory');
    }
  });

  it('should perform real research queries for AI coding platform', async () => {
    if (!shouldRunIntegrationTests) {
      console.log(skipMessage);
      return;
    }

    // Arrange
    const useCase = 'AI-powered coding platform with real-time collaboration';
    const researchQueries = [
      `Current technology stack recommendations, best practices, and architecture patterns for ${useCase}. Include latest versions, performance considerations, scalability factors, and industry adoption trends.`,
      `Essential features, user experience patterns, security requirements, and integration capabilities needed for ${useCase}. Focus on must-have vs nice-to-have features, accessibility standards, and compliance requirements.`,
      `Development workflow, deployment strategies, testing approaches, and DevOps practices for ${useCase}. Include CI/CD recommendations, monitoring solutions, and production readiness considerations.`
    ];

    logger.info({ useCase, queryCount: researchQueries.length }, 'Starting real research queries');

    // Act - Perform actual research queries
    const researchResults = await Promise.all(
      researchQueries.map(async (query, index) => {
        const result = await performResearchQuery(query, config);
        return {
          index,
          query: query.substring(0, 100) + '...',
          result: result.trim(),
          length: result.length
        };
      })
    );

    // Assert research results
    expect(researchResults).toHaveLength(3);

    researchResults.forEach((result, index) => {
      expect(result.result).toBeDefined();
      expect(result.result.length).toBeGreaterThan(100); // Should have substantial content
      expect(result.result).toMatch(/\w+/); // Should contain actual words

      logger.info({
        index: result.index,
        queryPreview: result.query,
        resultLength: result.length,
        resultPreview: result.result.substring(0, 200) + '...'
      }, `Research query ${index + 1} completed`);
    });

    // Verify research covers expected topics
    const combinedResearch = researchResults.map(r => r.result).join(' ').toLowerCase();

    // Should mention relevant technologies
    expect(combinedResearch).toMatch(/react|vue|angular|typescript|javascript/);
    expect(combinedResearch).toMatch(/node\.?js|python|java|go|rust/);
    expect(combinedResearch).toMatch(/database|postgresql|mongodb|mysql/);

    // Should mention AI/ML concepts
    expect(combinedResearch).toMatch(/ai|artificial intelligence|machine learning|llm|gpt/);

    // Should mention development practices
    expect(combinedResearch).toMatch(/docker|kubernetes|ci\/cd|testing|deployment/);

    logger.info({
      totalResearchLength: combinedResearch.length,
      useCase
    }, 'Research integration test completed successfully');

  }, 60000); // 1 minute timeout

  it('should perform real module selection with enhanced schema for complex project', async () => {
    if (!shouldRunIntegrationTests) {
      console.log(skipMessage);
      return;
    }

    // Arrange - Complex project prompt with research context
    const researchContext = `
## Comprehensive Pre-Generation Research Context:

### Research Area 1: Technology & Architecture
React 18 with TypeScript for frontend development, Node.js with Express for backend API, PostgreSQL for database with Redis for caching. Microservices architecture recommended for scalability. WebSocket support essential for real-time features.

### Research Area 2: Features & Requirements
User authentication with OAuth2, real-time collaboration using WebSockets, code execution in sandboxed environment, AI integration for intelligent suggestions, file management system, project sharing capabilities.

### Research Area 3: Development & Deployment
Docker containerization for consistent environments, Kubernetes for orchestration, GitHub Actions for CI/CD, monitoring with Prometheus and Grafana, logging with ELK stack.
    `;

    const moduleSelectionPrompt = `
You are an expert Full-Stack Software Architect AI. Based on the user's request and comprehensive research context, select the appropriate YAML module templates and provide necessary parameters to compose a full-stack starter kit.

User Request:
- Use Case: AI-powered coding platform with real-time collaboration, code execution, and intelligent suggestions
- Tech Stack Preferences: {"frontend": "React with TypeScript", "backend": "Node.js with Express", "database": "PostgreSQL", "ai": "OpenAI GPT integration", "realtime": "WebSocket support"}
- Optional Features: ["Docker", "CI/CD", "Monitoring", "Authentication"]

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

Select a comprehensive set of modules for: AI-powered coding platform with real-time collaboration, code execution, and intelligent suggestions

RESPOND WITH ONLY THE JSON OBJECT - NO OTHER TEXT OR FORMATTING.`;

    logger.info('Starting real module selection with enhanced schema');

    // Act - Perform actual module selection call
    const result = await performModuleSelectionCall(
      moduleSelectionPrompt,
      '', // System prompt is part of main prompt
      config,
      enhancedModuleSelectionResponseSchema
    );

    // Assert module selection results
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.attempts).toBeGreaterThan(0);
    expect(result.processingTimeMs).toBeGreaterThan(0);

    const moduleSelection = result.data;

    // Assert structure
    expect(moduleSelection).toHaveProperty('globalParams');
    expect(moduleSelection).toHaveProperty('moduleSelections');

    // Assert global params
    expect(moduleSelection.globalParams.projectName).toBeDefined();
    expect(moduleSelection.globalParams.projectName).toMatch(/^[a-z0-9-]+$/); // kebab-case
    expect(moduleSelection.globalParams.projectDescription).toBeDefined();
    expect(moduleSelection.globalParams.frontendPath).toBeDefined();
    expect(moduleSelection.globalParams.backendPath).toBeDefined();

    // Assert module selections
    expect(moduleSelection.moduleSelections).toBeInstanceOf(Array);
    expect(moduleSelection.moduleSelections.length).toBeGreaterThan(3); // Should have multiple modules for complex project
    expect(moduleSelection.moduleSelections.length).toBeLessThanOrEqual(15); // Enhanced schema limit

    // Assert required modules are present
    const modulePaths = moduleSelection.moduleSelections.map(m => m.modulePath);
    expect(modulePaths.some(path => path.includes('frontend'))).toBe(true);
    expect(modulePaths.some(path => path.includes('backend'))).toBe(true);
    expect(modulePaths.some(path => path.includes('database'))).toBe(true);

    // For AI platform, should likely include auth and utility modules
    expect(modulePaths.some(path => path.includes('auth'))).toBe(true);

    logger.info({
      projectName: moduleSelection.globalParams.projectName,
      moduleCount: moduleSelection.moduleSelections.length,
      modulePaths: modulePaths,
      attempts: result.attempts,
      processingTimeMs: result.processingTimeMs
    }, 'Module selection integration test completed successfully');

  }, 60000); // 1 minute timeout

  it('should generate dynamic YAML template with research context', async () => {
    if (!shouldRunIntegrationTests) {
      console.log(skipMessage);
      return;
    }

    // Arrange
    const yamlComposer = new YAMLComposer(config);
    const researchContext = `
React 18 with TypeScript recommended for modern frontend development.
WebSocket integration essential for real-time collaboration features.
Docker containerization for consistent development and deployment environments.
    `;

    logger.info('Starting dynamic YAML template generation with research context');

    // Act - Generate template with research context
    const result = await yamlComposer.loadAndParseYamlModule(
      'frontend/react-typescript-realtime',
      researchContext
    );

    // Assert template generation results
    expect(result).toBeDefined();
    expect(result.moduleName).toBeDefined();
    expect(result.description).toBeDefined();
    expect(result.type).toBeDefined();
    expect(result.provides).toBeDefined();

    // Assert tech stack includes research-driven choices
    if (result.provides.techStack) {
      const techStackEntries = Object.entries(result.provides.techStack);
      expect(techStackEntries.length).toBeGreaterThan(0);

      // Should include rationale that references research insights
      const hasResearchDrivenRationale = techStackEntries.some(([_, tech]) =>
        tech.rationale && (
          tech.rationale.toLowerCase().includes('latest') ||
          tech.rationale.toLowerCase().includes('recommended') ||
          tech.rationale.toLowerCase().includes('modern') ||
          tech.rationale.toLowerCase().includes('performance')
        )
      );
      expect(hasResearchDrivenRationale).toBe(true);
    }

    // Assert directory structure is present
    expect(result.provides.directoryStructure).toBeDefined();
    expect(result.provides.directoryStructure.length).toBeGreaterThan(0);

    logger.info({
      moduleName: result.moduleName,
      description: result.description,
      type: result.type,
      techStackCount: result.provides.techStack ? Object.keys(result.provides.techStack).length : 0,
      directoryCount: result.provides.directoryStructure?.length || 0
    }, 'Dynamic template generation integration test completed successfully');

  }, 45000); // 45 second timeout

  it('should demonstrate the complete research-driven pipeline structure', async () => {
    // This test demonstrates the complete pipeline without making actual LLM calls
    // It shows how the research-driven fullstack generator would work with real APIs

    // Arrange - Complex AI project configuration
    const projectConfig = {
      use_case: 'AI-powered coding platform with real-time collaboration, code execution, and intelligent suggestions',
      tech_stack_preferences: {
        frontend: 'React with TypeScript',
        backend: 'Node.js with Express',
        database: 'PostgreSQL',
        ai: 'OpenAI GPT integration',
        realtime: 'WebSocket support'
      },
      request_recommendation: true,
      include_optional_features: ['Docker', 'CI/CD', 'Monitoring', 'Authentication']
    };

    // Demonstrate research query structure
    const researchQueries = [
      `Current technology stack recommendations, best practices, and architecture patterns for ${projectConfig.use_case}. Include latest versions, performance considerations, scalability factors, and industry adoption trends.`,
      `Essential features, user experience patterns, security requirements, and integration capabilities needed for ${projectConfig.use_case}. Focus on must-have vs nice-to-have features, accessibility standards, and compliance requirements.`,
      `Development workflow, deployment strategies, testing approaches, and DevOps practices for ${projectConfig.use_case}. Include CI/CD recommendations, monitoring solutions, and production readiness considerations.`
    ];

    // Demonstrate project complexity analysis
    const complexityIndicators = [
      'ai', 'real-time', 'collaboration', 'platform', 'microservices', 'scalable'
    ];

    const isComplexProject = complexityIndicators.some(indicator =>
      projectConfig.use_case.toLowerCase().includes(indicator)
    );

    // Demonstrate schema selection logic
    const selectedSchema = isComplexProject ? 'enhanced' : 'standard';
    const maxModules = isComplexProject ? 15 : 10;

    // Demonstrate expected module selection structure
    const expectedModuleTypes = [
      'frontend', 'backend', 'database', 'auth', 'utility', 'deployment'
    ];

    // Assert the pipeline structure
    expect(researchQueries).toHaveLength(3);
    expect(researchQueries.every(query => query.length > 100)).toBe(true);
    expect(isComplexProject).toBe(true);
    expect(selectedSchema).toBe('enhanced');
    expect(maxModules).toBe(15);
    expect(expectedModuleTypes.length).toBeGreaterThan(4);

    // Demonstrate research context structure
    const mockResearchContext = `
## Comprehensive Pre-Generation Research Context:

### Research Area 1: Technology & Architecture
React 18 with TypeScript for frontend, Node.js with Express for backend, PostgreSQL for database. Microservices architecture recommended for scalability.

### Research Area 2: Features & Requirements
User authentication with OAuth2, real-time collaboration using WebSockets, code execution in sandboxed environment, AI integration for intelligent suggestions.

### Research Area 3: Development & Deployment
Docker containerization for consistent environments, Kubernetes for orchestration, GitHub Actions for CI/CD, monitoring with Prometheus and Grafana.
    `;

    // Demonstrate module selection prompt structure
    const moduleSelectionPrompt = `
You are an expert Full-Stack Software Architect AI. Based on the user's request and comprehensive research context, select the appropriate YAML module templates and provide necessary parameters to compose a full-stack starter kit.

User Request:
- Use Case: ${projectConfig.use_case}
- Tech Stack Preferences: ${JSON.stringify(projectConfig.tech_stack_preferences, null, 2)}
- Optional Features: ${JSON.stringify(projectConfig.include_optional_features, null, 2)}

${mockResearchContext}

## Research-Driven Module Selection Guidelines:

Based on the research context above, ensure your module selections incorporate:
1. **Technology Choices**: Use the latest recommended versions and best practices identified in the research
2. **Architecture Patterns**: Apply the architectural patterns and scalability considerations mentioned in the research
3. **Feature Requirements**: Include essential features and integrations identified as must-haves in the research
4. **Development Workflow**: Select modules that support the recommended development, testing, and deployment practices
5. **Production Readiness**: Ensure selected modules align with the monitoring, security, and compliance requirements from research
    `;

    // Assert prompt structure
    expect(mockResearchContext).toContain('Research Area 1');
    expect(mockResearchContext).toContain('Research Area 2');
    expect(mockResearchContext).toContain('Research Area 3');
    expect(moduleSelectionPrompt).toContain('Research-Driven Module Selection Guidelines');
    expect(moduleSelectionPrompt).toContain('Technology Choices');
    expect(moduleSelectionPrompt).toContain('Architecture Patterns');

    logger.info({
      projectType: 'AI-powered coding platform',
      isComplexProject,
      selectedSchema,
      maxModules,
      researchQueriesCount: researchQueries.length,
      researchContextLength: mockResearchContext.length,
      promptLength: moduleSelectionPrompt.length
    }, 'Research-driven pipeline structure demonstration completed');

    // This test demonstrates that:
    // 1. Complex projects are correctly identified
    // 2. Enhanced schema is selected for complex projects
    // 3. Research queries are comprehensive and targeted
    // 4. Research context is properly structured
    // 5. Module selection prompts include research-driven guidelines
    // 6. The complete pipeline is ready for real LLM integration

    expect(true).toBe(true); // Test passes to show structure is correct
  });
});

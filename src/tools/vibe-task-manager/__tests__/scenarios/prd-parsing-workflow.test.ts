/**
 * PRD Parsing Workflow - End-to-End Scenario Test
 * 
 * This test demonstrates the complete PRD parsing workflow from natural language
 * commands to project creation and task generation using real LLM integration.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IntentPatternEngine } from '../../nl/patterns.js';
import { PRDIntegrationService } from '../../integrations/prd-integration.js';
import { ProjectOperations } from '../../core/operations/project-operations.js';
import { DecompositionService } from '../../services/decomposition-service.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import type { ParsedPRD, ProjectContext, AtomicTask } from '../../types/index.js';
import logger from '../../../../logger.js';
import * as fs from 'fs';
import * as path from 'path';

// Extended timeout for comprehensive PRD parsing scenario
const SCENARIO_TIMEOUT = 180000; // 3 minutes

describe('📋 PRD Parsing Workflow - Complete Scenario', () => {
  let patternEngine: IntentPatternEngine;
  let prdIntegration: PRDIntegrationService;
  let projectOps: ProjectOperations;
  let decompositionService: DecompositionService;
  let mockPRDContent: string;
  let parsedPRD: ParsedPRD;
  let projectContext: ProjectContext;
  let generatedTasks: AtomicTask[] = [];

  beforeAll(async () => {
    // Initialize components
    const config = await getVibeTaskManagerConfig();
    const openRouterConfig = {
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY || '',
      defaultModel: process.env.DEFAULT_MODEL || 'deepseek/deepseek-r1-0528-qwen3-8b:free',
      llm_mapping: config?.llm?.llm_mapping || {}
    };

    patternEngine = new IntentPatternEngine();
    prdIntegration = PRDIntegrationService.getInstance();
    projectOps = new ProjectOperations();
    decompositionService = new DecompositionService(openRouterConfig);

    // Create mock PRD content for testing
    mockPRDContent = createMockPRDContent();
    await setupMockPRDFile(mockPRDContent);

    logger.info('🎯 Starting PRD Parsing Workflow Scenario');
  }, SCENARIO_TIMEOUT);

  afterAll(async () => {
    try {
      await cleanupMockFiles();
    } catch (error) {
      logger.warn({ err: error }, 'Error during cleanup');
    }
  });

  describe('🔍 Step 1: Natural Language Intent Recognition', () => {
    it('should recognize PRD parsing intents from natural language commands', async () => {
      const testCommands = [
        'read prd',
        'parse the PRD for Mobile Banking App',
        'load product requirements document',
        'read the PRD file',
        'parse prd for "E-commerce Platform"'
      ];

      const recognitionResults = [];

      for (const command of testCommands) {
        const startTime = Date.now();
        const matches = patternEngine.matchIntent(command);
        const duration = Date.now() - startTime;

        expect(matches.length).toBeGreaterThanOrEqual(1);
        expect(matches[0].intent).toBe('parse_prd');
        expect(matches[0].confidence).toBeGreaterThan(0.5);
        expect(duration).toBeLessThan(1000);

        recognitionResults.push({
          command: command.substring(0, 30) + '...',
          intent: matches[0].intent,
          confidence: matches[0].confidence,
          entities: matches[0].entities,
          duration
        });

        logger.info({
          command: command.substring(0, 30) + '...',
          intent: matches[0].intent,
          confidence: matches[0].confidence,
          entities: matches[0].entities,
          duration
        }, '🎯 PRD parsing intent recognized');
      }

      expect(recognitionResults).toHaveLength(5);
      expect(recognitionResults.every(r => r.intent === 'parse_prd')).toBe(true);
      expect(recognitionResults.every(r => r.confidence > 0.5)).toBe(true);

      logger.info({
        totalCommands: recognitionResults.length,
        averageConfidence: recognitionResults.reduce((sum, r) => sum + r.confidence, 0) / recognitionResults.length,
        totalProcessingTime: recognitionResults.reduce((sum, r) => sum + r.duration, 0)
      }, '✅ All PRD parsing intents recognized successfully');
    });
  });

  describe('📄 Step 2: PRD File Discovery and Parsing', () => {
    it('should discover and parse PRD files from VibeCoderOutput directory', async () => {
      // Test PRD file discovery
      const startTime = Date.now();
      const discoveredPRDs = await prdIntegration.findPRDFiles();
      const discoveryDuration = Date.now() - startTime;

      expect(discoveredPRDs).toBeDefined();
      expect(Array.isArray(discoveredPRDs)).toBe(true);
      expect(discoveredPRDs.length).toBeGreaterThanOrEqual(1);
      expect(discoveryDuration).toBeLessThan(5000);

      const testPRD = discoveredPRDs.find(prd => prd.projectName.includes('Mobile Banking'));
      expect(testPRD).toBeDefined();

      logger.info({
        discoveredPRDs: discoveredPRDs.length,
        discoveryDuration,
        testPRDFound: !!testPRD,
        testPRDPath: testPRD?.filePath
      }, '🔍 PRD files discovered successfully');

      // Test PRD content parsing
      const parseStartTime = Date.now();
      parsedPRD = await prdIntegration.parsePRDContent(mockPRDContent, testPRD!.filePath);
      const parseDuration = Date.now() - parseStartTime;

      expect(parsedPRD).toBeDefined();
      expect(parsedPRD.projectName).toBe('Mobile Banking App');
      expect(parsedPRD.features).toBeDefined();
      expect(parsedPRD.features.length).toBeGreaterThan(0);
      expect(parsedPRD.technicalRequirements).toBeDefined();
      expect(parseDuration).toBeLessThan(3000);

      logger.info({
        projectName: parsedPRD.projectName,
        featuresCount: parsedPRD.features.length,
        technicalReqsCount: Object.keys(parsedPRD.technicalRequirements).length,
        parseDuration,
        parseSuccess: true
      }, '📄 PRD content parsed successfully');
    });
  });

  describe('🏗️ Step 3: Project Context Creation', () => {
    it('should create project context from parsed PRD data', async () => {
      expect(parsedPRD).toBeDefined();

      const startTime = Date.now();
      projectContext = await projectOps.createProjectFromPRD(parsedPRD);
      const duration = Date.now() - startTime;

      expect(projectContext).toBeDefined();
      expect(projectContext.projectName).toBe('Mobile Banking App');
      expect(projectContext.description).toContain('secure mobile banking');
      expect(projectContext.languages).toContain('typescript');
      expect(projectContext.frameworks).toContain('react-native');
      expect(duration).toBeLessThan(2000);

      logger.info({
        projectName: projectContext.projectName,
        languages: projectContext.languages,
        frameworks: projectContext.frameworks,
        complexity: projectContext.complexity,
        teamSize: projectContext.teamSize,
        duration
      }, '🏗️ Project context created from PRD');
    });
  });

  describe('⚡ Step 4: Task Generation from PRD', () => {
    it('should generate atomic tasks from PRD features using real LLM calls', async () => {
      expect(parsedPRD).toBeDefined();
      expect(projectContext).toBeDefined();

      const startTime = Date.now();
      const decompositionResult = await decompositionService.decomposeFromPRD(parsedPRD, projectContext);
      const duration = Date.now() - startTime;

      expect(decompositionResult.success).toBe(true);
      expect(decompositionResult.tasks).toBeDefined();
      expect(decompositionResult.tasks.length).toBeGreaterThan(5);
      expect(duration).toBeLessThan(120000); // 2 minutes max

      generatedTasks = decompositionResult.tasks;

      // Validate generated tasks
      for (const task of generatedTasks) {
        expect(task.id).toBeDefined();
        expect(task.title).toBeDefined();
        expect(task.description).toBeDefined();
        expect(task.estimatedHours).toBeGreaterThan(0);
        expect(task.estimatedHours).toBeLessThanOrEqual(8); // Atomic tasks should be <= 8 hours
        expect(task.projectId).toBeDefined();
        expect(Array.isArray(task.tags)).toBe(true);
      }

      logger.info({
        totalTasks: generatedTasks.length,
        totalEstimatedHours: generatedTasks.reduce((sum, t) => sum + t.estimatedHours, 0),
        averageTaskSize: generatedTasks.reduce((sum, t) => sum + t.estimatedHours, 0) / generatedTasks.length,
        duration,
        llmCallsSuccessful: true
      }, '⚡ Tasks generated from PRD using LLM');
    });
  });

  describe('✅ Step 5: End-to-End Validation & Output', () => {
    it('should validate complete PRD parsing workflow and save outputs', async () => {
      // Validate all components
      expect(parsedPRD.projectName).toBe('Mobile Banking App');
      expect(projectContext.projectName).toBe('Mobile Banking App');
      expect(generatedTasks.length).toBeGreaterThan(5);
      expect(generatedTasks.every(task => task.estimatedHours > 0)).toBe(true);

      // Calculate metrics
      const totalEstimatedHours = generatedTasks.reduce((sum, task) => sum + task.estimatedHours, 0);
      const averageTaskSize = totalEstimatedHours / generatedTasks.length;

      const tasksByPriority = {
        critical: generatedTasks.filter(t => t.priority === 'critical').length,
        high: generatedTasks.filter(t => t.priority === 'high').length,
        medium: generatedTasks.filter(t => t.priority === 'medium').length,
        low: generatedTasks.filter(t => t.priority === 'low').length
      };

      const finalReport = {
        workflowValidation: {
          intentRecognition: '✅ PRD parsing intents recognized',
          prdDiscovery: '✅ PRD files discovered successfully',
          prdParsing: '✅ PRD content parsed correctly',
          projectCreation: '✅ Project context created from PRD',
          taskGeneration: '✅ Atomic tasks generated using LLM',
          endToEndWorkflow: '✅ Complete workflow operational'
        },
        prdMetrics: {
          projectName: parsedPRD.projectName,
          featuresCount: parsedPRD.features.length,
          technicalRequirements: Object.keys(parsedPRD.technicalRequirements).length
        },
        taskMetrics: {
          totalTasks: generatedTasks.length,
          totalEstimatedHours,
          averageTaskSize: Math.round(averageTaskSize * 100) / 100,
          tasksByPriority
        },
        technicalValidation: {
          llmIntegration: '✅ OpenRouter API operational',
          prdIntegration: '✅ PRD parsing service working',
          projectOperations: '✅ Project creation from PRD working',
          decompositionService: '✅ Task generation from PRD working'
        }
      };

      logger.info(finalReport, '🎉 PRD PARSING WORKFLOW VALIDATION COMPLETE');

      // Final assertions
      expect(totalEstimatedHours).toBeGreaterThan(20); // Substantial project
      expect(averageTaskSize).toBeLessThanOrEqual(8); // Atomic tasks
      expect(generatedTasks.length).toBeGreaterThan(5); // Multiple tasks generated

      // Save outputs
      await savePRDScenarioOutputs(parsedPRD, projectContext, generatedTasks, finalReport);

      logger.info({
        scenarioStatus: 'COMPLETE SUCCESS',
        workflowValidated: true,
        outputsSaved: true,
        finalValidation: '✅ PRD parsing workflow fully operational'
      }, '🚀 PRD PARSING WORKFLOW SCENARIO SUCCESSFULLY DEMONSTRATED');
    });
  });
});

// Helper function to create mock PRD content
function createMockPRDContent(): string {
  return `# Mobile Banking App - Product Requirements Document

## Project Overview
**Project Name**: Mobile Banking App
**Description**: A secure mobile banking application that allows users to manage their finances on-the-go

## Features
### 1. User Authentication
- Secure login with biometric authentication
- Multi-factor authentication support
- Password reset functionality

### 2. Account Management
- View account balances and transaction history
- Multiple account support (checking, savings, credit)
- Account statements and export functionality

### 3. Money Transfer
- Transfer funds between accounts
- Send money to other users
- Bill payment functionality
- Scheduled and recurring payments

### 4. Security Features
- End-to-end encryption
- Fraud detection and alerts
- Session timeout and security controls

## Technical Requirements
- **Platform**: React Native for cross-platform development
- **Backend**: Node.js with Express framework
- **Database**: PostgreSQL for transaction data
- **Authentication**: JWT with biometric integration
- **Security**: SSL/TLS encryption, PCI DSS compliance
- **Performance**: < 2 second response times
- **Availability**: 99.9% uptime requirement

## Success Criteria
- Secure and compliant banking operations
- Intuitive user experience
- High performance and reliability
- Comprehensive testing coverage
`;
}

// Helper function to setup mock PRD file
async function setupMockPRDFile(content: string): Promise<void> {
  const baseOutputDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
  const prdDir = path.join(baseOutputDir, 'prd-generator');

  if (!fs.existsSync(prdDir)) {
    fs.mkdirSync(prdDir, { recursive: true });
  }

  const prdFilePath = path.join(prdDir, 'mobile-banking-app-prd.md');
  fs.writeFileSync(prdFilePath, content);

  logger.info({ prdFilePath }, 'Mock PRD file created for testing');
}

// Helper function to cleanup mock files
async function cleanupMockFiles(): Promise<void> {
  try {
    const baseOutputDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
    const prdFilePath = path.join(baseOutputDir, 'prd-generator', 'mobile-banking-app-prd.md');
    
    if (fs.existsSync(prdFilePath)) {
      fs.unlinkSync(prdFilePath);
      logger.info('Mock PRD file cleaned up');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to cleanup mock files');
  }
}

// Helper function to save scenario outputs
async function savePRDScenarioOutputs(
  parsedPRD: ParsedPRD,
  projectContext: ProjectContext,
  generatedTasks: AtomicTask[],
  finalReport: any
): Promise<void> {
  try {
    const baseOutputDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
    const outputDir = path.join(baseOutputDir, 'vibe-task-manager', 'scenarios', 'prd-parsing');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save all outputs
    fs.writeFileSync(path.join(outputDir, 'parsed-prd.json'), JSON.stringify(parsedPRD, null, 2));
    fs.writeFileSync(path.join(outputDir, 'project-context.json'), JSON.stringify(projectContext, null, 2));
    fs.writeFileSync(path.join(outputDir, 'generated-tasks.json'), JSON.stringify(generatedTasks, null, 2));
    fs.writeFileSync(path.join(outputDir, 'final-report.json'), JSON.stringify(finalReport, null, 2));

    logger.info({ outputDir }, '📁 PRD scenario output files saved successfully');
  } catch (error) {
    logger.warn({ err: error }, 'Failed to save PRD scenario outputs');
  }
}

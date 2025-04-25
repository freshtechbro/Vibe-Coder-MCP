import { describe, it, expect, vi, beforeEach } from 'vitest';

import { FileGenerator } from '../../../tools/fullstack-starter-kit-generator/services/file-generator.js';
import * as requirementsAnalyzer from '../../../tools/fullstack-starter-kit-generator/templates/smart-stack/analyzer/requirements-analyzer.js';
import { FullstackStarterKitHandler } from '../fullstack-starter-kit-handler.js';

// Mock the requirements analyzer
vi.mock(
  '../../../tools/fullstack-starter-kit-generator/templates/smart-stack/analyzer/requirements-analyzer.js',
  () => ({
    analyzeRequirements: vi.fn(),
    projectRequirementsSchema: {
      parse: vi.fn().mockImplementation((data) => data),
    },
  })
);

// Mock the file generator
vi.mock(
  '../../../tools/fullstack-starter-kit-generator/services/file-generator.js',
  () => ({
    FileGenerator: vi.fn().mockImplementation(() => ({
      generateFiles: vi.fn().mockResolvedValue(undefined),
    })),
  })
);

describe('FullstackStarterKitHandler', () => {
  let handler: FullstackStarterKitHandler;
  const mockConfig = {
    openRouterApiKey: 'test-key',
    openRouterBaseUrl: 'https://api.openrouter.ai',
  };

  beforeEach(() => {
    handler = new FullstackStarterKitHandler();
    vi.clearAllMocks();
  });

  it('should successfully generate a starter kit', async () => {
    const mockAnalysis = {
      recommendedStack: {
        frontend: {
          framework: 'next',
          language: 'typescript',
        },
        backend: {
          framework: 'express',
          language: 'typescript',
        },
        database: {
          type: 'mongodb',
        },
      },
      reasoning: {
        frontend: 'Test reasoning',
        backend: 'Test reasoning',
      },
    };

    // Properly type the mock implementation
    (
      requirementsAnalyzer.analyzeRequirements as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockAnalysis);

    const result = await handler.handle(
      {
        name: 'test-project',
        description: 'Test project description',
        requirements: 'A web app with user authentication',
        outputDirectory: '/tmp/test-project',
      },
      mockConfig,
      { sessionId: 'test-session' }
    );

    expect(result.content[0].text).toContain('Successfully');
    // Use optional chaining to safely access properties
    expect(result.metadata?.stack).toEqual(mockAnalysis.recommendedStack);
    expect(FileGenerator).toHaveBeenCalled();
  });

  it('should handle invalid input parameters', async () => {
    const result = await handler.handle(
      {
        name: 'test-project',
        // Missing required fields
      },
      mockConfig,
      { sessionId: 'test-session' }
    );

    expect(result.content[0].type).toBe('error');
    // Type assertion to safely access the message property
    expect(
      (result.errorDetails as any)?.message || result.content[0].text
    ).toContain('validation');
  });
});

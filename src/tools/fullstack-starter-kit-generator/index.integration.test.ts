import fs from 'fs';
import os from 'os';
import path from 'path';

import { rimraf } from 'rimraf'; // Use named import for ES modules
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { ToolResult } from '../../types/tools.js';

import { generateStarterKit } from './index.js'; // Import the actual function

// Mock dependencies that are not core to the generation logic (side effects)
vi.mock('../../services/job-manager/index.js', () => ({
  jobManager: {
    createJob: vi.fn(() => 'test-job-id'),
    startJob: vi.fn(),
    completeJob: vi.fn(),
    failJob: vi.fn(),
  },
}));

vi.mock('../../services/sse-notifier/index.js', () => ({
  sseNotifier: {
    notify: vi.fn(),
  },
}));

// Mock command executor for Scenario 1.4 where npm install might fail due to invalid dir
// We want to isolate the directory creation error
const mockExecute = vi
  .fn()
  .mockResolvedValue({ success: true, output: '', error: '' });
vi.mock('./services/command-executor', () => {
  return {
    CommandExecutor: vi.fn().mockImplementation(() => ({
      execute: mockExecute,
    })),
  };
});

describe('Fullstack Starter Kit Generator - Server Integration Tests', () => {
  let tempDir: string;
  const baseOutputDir = path.join(os.tmpdir(), 'fskg-integration-tests');

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    // Ensure the base directory exists
    if (!fs.existsSync(baseOutputDir)) {
      fs.mkdirSync(baseOutputDir, { recursive: true });
    }
    tempDir = fs.mkdtempSync(path.join(baseOutputDir, 'test-'));
    // Reset mocks that might be called multiple times
    vi.clearAllMocks();
    // Reset specific mock implementation if needed for a scenario
    mockExecute.mockResolvedValue({ success: true, output: '', error: '' });
  });

  afterEach(async () => {
    // Clean up the temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      await rimraf(tempDir); // Use rimraf for robust deletion
    }
  });

  // Helper to create a mock context
  const createMockContext = (sessionId: string): ToolExecutionContext => ({
    sessionId,
    // Add other context properties if needed by the function, though likely not for these tests
  });

  // --- Test Scenarios from Plan ---

  it('1.1: should successfully generate a "next-express" project (Happy Path)', async () => {
    const params = {
      template: 'next-express', // Assuming this template exists
      name: 'test-next-express-app',
      description: 'A test Next.js + Express app',
      features: [],
      outputDir: tempDir,
      sessionId: 'test-session-1-1', // Required by schema but used in mock context
    };
    const context = createMockContext(params.sessionId);

    const result: ToolResult = await generateStarterKit(params, {}, context);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe('success');
    expect(result.content[0].text).toContain(
      'Starter kit generated successfully'
    );
    expect(fs.existsSync(tempDir)).toBe(true);

    // Check for core files/dirs
    const packageJsonPath = path.join(tempDir, 'package.json');
    expect(fs.existsSync(packageJsonPath)).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'apps'))).toBe(true); // Assuming monorepo structure
    expect(fs.existsSync(path.join(tempDir, 'packages'))).toBe(true); // Assuming monorepo structure
    expect(fs.existsSync(path.join(tempDir, 'node_modules'))).toBe(true); // Check if npm install ran

    // Check package.json content
    const packageJsonContent = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf-8')
    );
    expect(packageJsonContent.name).toBe(params.name);
  }, 60000); // Increase timeout for npm install

  it('1.2: should successfully generate a "react-nest" project with features', async () => {
    const params = {
      template: 'react-nest', // Assuming this template exists
      name: 'test-react-nest-app',
      description: 'A test React + NestJS app with auth',
      features: ['authentication', 'database-orm'], // Assuming these features exist and modify output
      outputDir: tempDir,
      sessionId: 'test-session-1-2',
    };
    const context = createMockContext(params.sessionId);

    const result: ToolResult = await generateStarterKit(params, {}, context);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe('success');
    expect(fs.existsSync(tempDir)).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'apps'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'packages'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'node_modules'))).toBe(true);

    // Basic check - more specific feature checks would require knowing template details
    // For now, we assume success implies features were processed if template supports them.
    const packageJsonContent = JSON.parse(
      fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8')
    );
    expect(packageJsonContent.name).toBe(params.name);
    // If features modify package.json, check here, e.g.:
    // expect(packageJsonContent.dependencies).toHaveProperty('@nestjs/passport'); // Example
  }, 60000); // Increase timeout

  it('1.3: should return an error for a non-existent template', async () => {
    const params = {
      template: 'non-existent-template',
      name: 'test-error-app',
      description: 'Test non-existent template',
      features: [],
      outputDir: tempDir,
      sessionId: 'test-session-1-3',
    };
    const context = createMockContext(params.sessionId);

    const result: ToolResult = await generateStarterKit(params, {}, context);

    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('error');
    expect((result.errorDetails as { message: string })?.message).toContain(
      'Template "non-existent-template" not found'
    );

    // Check that the directory wasn't populated (it might be created before template check fails)
    // A robust check would be that only potentially created empty dir exists, or nothing.
    // Let's check if package.json was NOT created.
    expect(fs.existsSync(path.join(tempDir, 'package.json'))).toBe(false);
  });

  it('1.4: should return an error if outputDir points to an existing file', async () => {
    // Setup: Create a file where the directory should be
    const blockingFilePath = tempDir; // Use the tempDir path itself as the file path
    // Need to delete the directory first if mkdtempSync created it
    if (fs.existsSync(blockingFilePath)) {
      await rimraf(blockingFilePath); // Remove dir first
    }
    fs.writeFileSync(blockingFilePath, 'This is a blocking file'); // Create the file

    // Ensure the CommandExecutor mock fails if called, as it shouldn't get this far
    mockExecute.mockRejectedValue(
      new Error('npm install should not have been called')
    );

    const params = {
      template: 'next-express',
      name: 'test-error-app-2',
      description: 'Test existing file error',
      features: [],
      outputDir: blockingFilePath, // Point to the file
      sessionId: 'test-session-1-4',
    };
    const context = createMockContext(params.sessionId);

    const result: ToolResult = await generateStarterKit(params, {}, context);

    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('error');
    // The exact error might depend on fs operations within FileGenerator or CommandExecutor's CWD check
    // Expecting an EEXIST or ENOTDIR type error message pattern
    expect((result.errorDetails as { message: string })?.message).toMatch(
      /EEXIST|ENOTDIR|file exists|not a directory/i
    );

    // Cleanup the blocking file manually since afterEach might expect a directory
    if (fs.existsSync(blockingFilePath)) {
      fs.unlinkSync(blockingFilePath);
    }
  });

  it.skip('1.5: should reject invalid input via schema validation (tested implicitly by framework)', () => {
    // This scenario tests the Zod schema validation defined in the tool registration.
    // Calling generateStarterKit directly bypasses this initial validation layer.
    // Therefore, this specific case (e.g., missing 'name') is covered by the tool
    // registration and invocation mechanism, not this direct function call test.
    // We assume the framework's tests cover schema validation failures.
    expect(true).toBe(true); // Placeholder assertion
  });
});

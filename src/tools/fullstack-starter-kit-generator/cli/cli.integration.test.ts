import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import os from 'os';
import path from 'path';

import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Path to the CLI entry point script
const cliEntryPoint = path.resolve(
  __dirname,
  '../../../../src/tools/fullstack-starter-kit-generator/cli/main.ts'
);
const cliCommandBase = `npx tsx ${cliEntryPoint}`;

// Helper function to run CLI commands
const runCliCommand = (
  args: string,
  cwd: string
): { stdout: string; stderr: string; status: number | null } => {
  const command = `${cliCommandBase} ${args}`;
  const options: ExecSyncOptionsWithStringEncoding = {
    encoding: 'utf-8',
    cwd: cwd,
    stdio: 'pipe', // Capture stdout/stderr, don't inherit
    env: { ...process.env, NODE_ENV: 'test' }, // Ensure test environment
  };
  try {
    const stdout = execSync(command, options);
    return { stdout, stderr: '', status: 0 };
  } catch (error: any) {
    // error.status contains the exit code
    // error.stdout and error.stderr contain the output
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      status: error.status === null ? 1 : error.status, // Ensure non-zero status on error
    };
  }
};

describe('Fullstack Starter Kit Generator - CLI Integration Tests', () => {
  let tempTestDir: string;

  beforeEach(() => {
    // Create a unique temporary directory for each test
    tempTestDir = path.join(os.tmpdir(), `fskg-cli-test-${uuidv4()}`);
    fs.ensureDirSync(tempTestDir);
    // console.log(`Created temp dir: ${tempTestDir}`); // For debugging
  });

  afterEach(() => {
    // Clean up the temporary directory after each test
    if (fs.existsSync(tempTestDir)) {
      fs.removeSync(tempTestDir);
      // console.log(`Removed temp dir: ${tempTestDir}`); // For debugging
    }
  });

  // --- Scenario 2.1: Happy Path - init with Defaults ---
  it('Scenario 2.1: should initialize a default workspace via "init"', () => {
    const result = runCliCommand('init', tempTestDir);

    // console.log('Scenario 2.1 Result:', result); // For debugging

    // Expected Outcome: Exit code 0
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    // Expected Outcome: Success logs (basic check)
    expect(result.stdout).toContain('Workspace initialized successfully');

    // Expected Outcome: dir contains expected files/folders
    expect(fs.existsSync(path.join(tempTestDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempTestDir, 'apps'))).toBe(true);
    expect(fs.existsSync(path.join(tempTestDir, 'packages'))).toBe(true);
    expect(fs.existsSync(path.join(tempTestDir, 'tsconfig.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempTestDir, 'turbo.json'))).toBe(true);
    // Check for node_modules might be flaky/slow, but let's include it as per plan
    expect(fs.existsSync(path.join(tempTestDir, 'node_modules'))).toBe(true);
  });

  // --- Scenario 2.5: Error Path - init with Invalid Template ---
  it('Scenario 2.5: should fail "init" with an invalid template name', () => {
    const invalidTemplate = 'non-existent-template-12345';
    const result = runCliCommand(
      `init --template ${invalidTemplate}`,
      tempTestDir
    );

    // console.log('Scenario 2.5 Result:', result); // For debugging

    // Expected Outcome: Non-zero exit code
    expect(result.status).not.toBe(0);
    // Expected Outcome: Error log about template not found
    expect(result.stderr).toContain(`Template "${invalidTemplate}" not found`);
    expect(result.stderr).toContain('Initialization failed');

    // Expected Outcome: dir remains empty (or largely empty)
    // Check that core generated files are NOT present
    expect(fs.existsSync(path.join(tempTestDir, 'package.json'))).toBe(false);
    expect(fs.existsSync(path.join(tempTestDir, 'apps'))).toBe(false);
    expect(fs.existsSync(path.join(tempTestDir, 'packages'))).toBe(false);
    expect(fs.existsSync(path.join(tempTestDir, 'turbo.json'))).toBe(false);
  });

  // --- Scenario 2.6: Error Path - addPackage without init ---
  it('Scenario 2.6: should fail "addPackage" if workspace is not initialized', () => {
    const result = runCliCommand(
      'addPackage --name web-ui --type frontend --path apps/web-ui',
      tempTestDir
    );

    // console.log('Scenario 2.6 Result:', result); // For debugging

    // Expected Outcome: Non-zero exit code
    expect(result.status).not.toBe(0);
    // Expected Outcome: Error log about invalid workspace
    expect(result.stderr).toContain('Invalid workspace'); // Adjust based on actual error message
    expect(result.stderr).toContain('Failed to add package');

    // Expected Outcome: No package added
    expect(fs.existsSync(path.join(tempTestDir, 'apps', 'web-ui'))).toBe(false);
    expect(fs.existsSync(path.join(tempTestDir, 'packages', 'web-ui'))).toBe(
      false
    ); // Check both just in case
  });

  // --- Tests requiring an initialized workspace ---
  describe('Commands requiring initialized workspace', () => {
    // Setup: Initialize a default workspace before tests in this block
    beforeEach(() => {
      const initResult = runCliCommand('init', tempTestDir);
      if (initResult.status !== 0) {
        console.error(
          'Workspace initialization failed in beforeEach:',
          initResult.stderr
        );
        throw new Error(
          'Setup failed: Could not initialize workspace for subsequent tests.'
        );
      }
      // console.log(`Initialized workspace in ${tempTestDir} for nested describe block`); // For debugging
    });

    // --- Scenario 2.2: Happy Path - init with Specific Template and Options ---
    // Note: This scenario logically fits better outside this nested describe,
    // as it tests init itself, but the plan groups it here. Let's run it in its own temp dir.
    // We'll create a separate test for this outside the nested describe.

    // --- Scenario 2.3: Happy Path - addPackage (Frontend) ---
    it('Scenario 2.3: should add a frontend package via "addPackage"', () => {
      const result = runCliCommand(
        'addPackage --name web-ui --type frontend --path apps/web-ui',
        tempTestDir
      );

      // console.log('Scenario 2.3 Result:', result); // For debugging

      // Expected Outcome: Exit code 0
      expect(result.status, `stderr: ${result.stderr}`).toBe(0);
      // Expected Outcome: Success logs
      expect(result.stdout).toContain('Package "web-ui" added successfully');

      // Expected Outcome: Package exists with files
      const pkgDir = path.join(tempTestDir, 'apps', 'web-ui');
      expect(fs.existsSync(pkgDir)).toBe(true);
      expect(fs.existsSync(path.join(pkgDir, 'package.json'))).toBe(true);
      // Add checks for specific template files if known (e.g., index.html, main.ts)
      expect(fs.existsSync(path.join(pkgDir, 'src', 'index.ts'))).toBe(true); // Example check

      // Expected Outcome: Root package.json potentially updated (check workspaces)
      const rootPkgJsonPath = path.join(tempTestDir, 'package.json');
      const rootPkgJson = fs.readJsonSync(rootPkgJsonPath);
      expect(rootPkgJson.workspaces).toContain('apps/web-ui');

      // Expected Outcome: node_modules updated (difficult to assert precisely, check existence)
      expect(fs.existsSync(path.join(tempTestDir, 'node_modules'))).toBe(true);
    });

    // --- Scenario 2.4: Happy Path - addPackage (Library) ---
    it('Scenario 2.4: should add a library package via "addPackage"', () => {
      const result = runCliCommand(
        'addPackage --name shared-utils --type library --path packages/shared-utils',
        tempTestDir
      );

      // console.log('Scenario 2.4 Result:', result); // For debugging

      // Expected Outcome: Exit code 0
      expect(result.status, `stderr: ${result.stderr}`).toBe(0);
      // Expected Outcome: Success logs
      expect(result.stdout).toContain(
        'Package "shared-utils" added successfully'
      );

      // Expected Outcome: Package exists with files
      const pkgDir = path.join(tempTestDir, 'packages', 'shared-utils');
      expect(fs.existsSync(pkgDir)).toBe(true);
      expect(fs.existsSync(path.join(pkgDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(pkgDir, 'src', 'index.ts'))).toBe(true); // Example check

      // Expected Outcome: Root package.json potentially updated (check workspaces)
      const rootPkgJsonPath = path.join(tempTestDir, 'package.json');
      const rootPkgJson = fs.readJsonSync(rootPkgJsonPath);
      expect(rootPkgJson.workspaces).toContain('packages/shared-utils');

      // Expected Outcome: node_modules updated
      expect(fs.existsSync(path.join(tempTestDir, 'node_modules'))).toBe(true);
    });

    // --- Scenario 2.7: Error Path - addPackage Missing Required Argument (--name) ---
    it('Scenario 2.7: should fail "addPackage" when missing required --name argument', () => {
      // Commander (used by the CLI) should handle this argument validation
      const result = runCliCommand(
        'addPackage --type frontend --path apps/web-ui',
        tempTestDir
      );

      // console.log('Scenario 2.7 Result:', result); // For debugging

      // Expected Outcome: Non-zero exit code
      expect(result.status).not.toBe(0);
      // Expected Outcome: Error log about missing argument (adjust based on commander's output)
      expect(result.stderr).toMatch(
        /error: required option .*--name <name>.*/i
      );
      // Check that the package was not created
      expect(fs.existsSync(path.join(tempTestDir, 'apps', 'web-ui'))).toBe(
        false
      );
    });
  });

  // --- Scenario 2.2: Happy Path - init with Specific Template and Options ---
  // Run this outside the nested describe as it needs its own clean temp dir
  it('Scenario 2.2: should initialize a specific template workspace via "init" with options', () => {
    const template = 'next-express'; // Assuming this template exists
    const name = 'my-cli-app';
    const description = 'Generated via CLI test';
    const result = runCliCommand(
      `init --template ${template} --name "${name}" --description "${description}"`,
      tempTestDir
    );

    // console.log('Scenario 2.2 Result:', result); // For debugging

    // Expected Outcome: Exit code 0
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    // Expected Outcome: Success logs
    expect(result.stdout).toContain('Workspace initialized successfully');

    // Expected Outcome: dir contains template files
    expect(fs.existsSync(path.join(tempTestDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempTestDir, 'apps', 'next-app'))).toBe(
      true
    ); // Check specific sub-dirs for this template
    expect(
      fs.existsSync(path.join(tempTestDir, 'packages', 'express-server'))
    ).toBe(true);
    expect(fs.existsSync(path.join(tempTestDir, 'node_modules'))).toBe(true);

    // Expected Outcome: package.json has correct name/desc
    const rootPkgJsonPath = path.join(tempTestDir, 'package.json');
    const rootPkgJson = fs.readJsonSync(rootPkgJsonPath);
    expect(rootPkgJson.name).toBe(name);
    // Description might not be directly in the root package.json for monorepos,
    // but let's check if it's mentioned in stdout or a specific file if applicable.
    // For now, we'll assume the name check is sufficient based on typical generator behavior.
    // If description is expected in root package.json, uncomment:
    // expect(rootPkgJson.description).toBe(description);
  });
});

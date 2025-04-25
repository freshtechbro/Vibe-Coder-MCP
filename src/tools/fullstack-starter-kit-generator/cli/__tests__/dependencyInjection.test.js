import fs from 'fs/promises';
import path from 'path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { injectDependenciesIntoPackages } from '../utils/dependencyInjector.js';

// Import the module to be spied upon
import * as fileWriter from '../utils/fileWriter.js';

describe('injectDependenciesIntoPackages', () => {
  const baseOutputDir = 'mock-test-output-inject-v2'; // Use a unique dir
  const mockOptionsBase = {
    outputDir: baseOutputDir,
    dependencies: {
      npm: {
        frontend: {
          dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
          devDependencies: { '@testing-library/react': '^13.0.0' },
        },
        backend: {
          dependencies: { express: '^4.18.0', cors: '^2.8.5' },
          devDependencies: { nodemon: '^2.0.15' },
        },
        utils: {
          dependencies: { lodash: '^4.17.21' },
          devDependencies: {},
        },
      },
    },
    force: false, // Default force to false
    dryRun: false, // Default dryRun to false
  };

  // Helper to create mock package structure
  const createMockPackage = async (pkgKey, initialContent = {}) => {
    const workspaceDir = ['frontend', 'backend'].includes(pkgKey)
      ? 'apps'
      : 'packages';
    const pkgDir = path.join(baseOutputDir, workspaceDir, pkgKey);
    await fs.mkdir(pkgDir, { recursive: true });
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    // Use real fs.writeFile for setup
    await fs.writeFile(
      pkgJsonPath,
      JSON.stringify(
        { name: pkgKey, version: '0.0.1', ...initialContent },
        null,
        2
      )
    );
    return pkgJsonPath;
  };

  // Setup spies before each test
  let consoleLogSpy, consoleWarnSpy, consoleErrorSpy, writeFileSafeSpy;
  beforeEach(async () => {
    // Reset spies
    vi.resetAllMocks();
    // Setup spies
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    writeFileSafeSpy = vi
      .spyOn(fileWriter, 'writeFileSafe')
      .mockResolvedValue('written'); // Default mock behavior

    // Ensure clean file state
    await fs.rm(baseOutputDir, { recursive: true, force: true });
    await createMockPackage('frontend', {
      dependencies: { 'existing-dep': '1.0.0' },
    });
    await createMockPackage('backend');
    await createMockPackage('utils', {
      devDependencies: { 'existing-dev-dep': '1.0.0' },
    });
  });

  // Restore all mocks after each test to avoid interference
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Tests requiring REAL file writes ---
  it('should merge new and existing dependencies correctly for frontend (REAL WRITE)', async () => {
    writeFileSafeSpy.mockRestore(); // Use REAL writeFileSafe for this test
    const options = { ...mockOptionsBase, force: true }; // Use force: true to bypass inquirer prompt
    await injectDependenciesIntoPackages(options);

    const packageJsonPath = path.join(
      baseOutputDir,
      'apps',
      'frontend',
      'package.json'
    );
    const packageJsonData = JSON.parse(
      await fs.readFile(packageJsonPath, 'utf-8')
    );

    expect(packageJsonData.dependencies).toEqual({
      'existing-dep': '1.0.0',
      react: '^18.0.0',
      'react-dom': '^18.0.0',
    });
    expect(packageJsonData.devDependencies).toEqual({
      '@testing-library/react': '^13.0.0',
    });
  });

  it('should add dependencies to backend package with no prior dependencies (REAL WRITE)', async () => {
    writeFileSafeSpy.mockRestore(); // Use REAL writeFileSafe
    const options = { ...mockOptionsBase, force: true };
    await injectDependenciesIntoPackages(options);

    const packageJsonPath = path.join(
      baseOutputDir,
      'apps',
      'backend',
      'package.json'
    );
    const packageJsonData = JSON.parse(
      await fs.readFile(packageJsonPath, 'utf-8')
    );

    expect(packageJsonData.dependencies).toEqual({
      express: '^4.18.0',
      cors: '^2.8.5',
    });
    expect(packageJsonData.devDependencies).toEqual({
      nodemon: '^2.0.15',
    });
  });

  it('should merge dependencies correctly for utils package in packages dir (REAL WRITE)', async () => {
    writeFileSafeSpy.mockRestore(); // Use REAL writeFileSafe
    const options = { ...mockOptionsBase, force: true };
    await injectDependenciesIntoPackages(options);

    const packageJsonPath = path.join(
      baseOutputDir,
      'packages',
      'utils',
      'package.json'
    );
    const packageJsonData = JSON.parse(
      await fs.readFile(packageJsonPath, 'utf-8')
    );

    expect(packageJsonData.dependencies).toEqual({
      lodash: '^4.17.21',
    });
    expect(packageJsonData.devDependencies).toEqual({
      'existing-dev-dep': '1.0.0',
    });
  });

  // --- Tests requiring MOCKED file writes ---
  it('should skip injection and log warning if dependencies.npm is missing', async () => {
    // Default spy/mock is active
    const options = { ...mockOptionsBase, dependencies: {} };
    await injectDependenciesIntoPackages(options);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No NPM dependencies found')
    );
    expect(writeFileSafeSpy).not.toHaveBeenCalled(); // Check the spy
  });

  it('should log error and continue if a package.json is missing', async () => {
    // Default spy/mock is active
    const options = { ...mockOptionsBase };
    const missingPkgPath = path.join(
      baseOutputDir,
      'apps',
      'backend',
      'package.json'
    );
    await fs.rm(missingPkgPath); // Remove backend package.json

    await injectDependenciesIntoPackages(options);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`package.json not found for 'backend'`)
    );
    // Ensure it still tried to process frontend and utils by calling the mock
    expect(writeFileSafeSpy).toHaveBeenCalledWith(
      path.join(baseOutputDir, 'apps', 'frontend', 'package.json'),
      expect.any(String),
      { force: false, dryRun: false }
    );
    expect(writeFileSafeSpy).toHaveBeenCalledWith(
      path.join(baseOutputDir, 'packages', 'utils', 'package.json'),
      expect.any(String),
      { force: false, dryRun: false }
    );
    // Ensure it didn't try to write the missing backend file
    expect(writeFileSafeSpy).not.toHaveBeenCalledWith(
      missingPkgPath,
      expect.any(String),
      expect.any(Object)
    );
  });

  it('should respect dryRun flag and call writeFileSafe mock with dryRun true', async () => {
    // Default spy/mock is active
    const options = { ...mockOptionsBase, dryRun: true };
    await injectDependenciesIntoPackages(options);

    // writeFileSafe mock SHOULD have been called, but with dryRun: true
    expect(writeFileSafeSpy).toHaveBeenCalledWith(
      path.join(baseOutputDir, 'apps', 'frontend', 'package.json'),
      expect.any(String),
      { force: false, dryRun: true } // Check flag passed correctly
    );
    expect(writeFileSafeSpy).toHaveBeenCalledWith(
      path.join(baseOutputDir, 'apps', 'backend', 'package.json'),
      expect.any(String),
      { force: false, dryRun: true }
    );
    expect(writeFileSafeSpy).toHaveBeenCalledWith(
      path.join(baseOutputDir, 'packages', 'utils', 'package.json'),
      expect.any(String),
      { force: false, dryRun: true }
    );

    // Check console logs specific to dry run in the injector function
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('DRY RUN: Would read package.json for frontend')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('DRY RUN: Would read package.json for backend')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('DRY RUN: Would read package.json for utils')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'DRY RUN: Dependency injection simulation complete.'
      )
    );

    // Verify files were NOT actually modified (read after the function call)
    const frontendPath = path.join(
      baseOutputDir,
      'apps',
      'frontend',
      'package.json'
    );
    const frontendData = JSON.parse(await fs.readFile(frontendPath, 'utf-8'));
    expect(frontendData.dependencies.react).toBeUndefined(); // Should not have been added

    const backendPath = path.join(
      baseOutputDir,
      'apps',
      'backend',
      'package.json'
    );
    const backendData = JSON.parse(await fs.readFile(backendPath, 'utf-8'));
    expect(backendData.dependencies).toBeUndefined();
  });
});

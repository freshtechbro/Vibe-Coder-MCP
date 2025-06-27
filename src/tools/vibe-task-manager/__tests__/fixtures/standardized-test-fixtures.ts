/**
 * Standardized Test Fixtures
 * Provides consistent test data across all test suites
 */

import { vi } from 'vitest';
import path from 'path';

/**
 * Standard project paths for testing
 */
export const TEST_PATHS = {
  project: '/test/project',
  output: '/test/output',
  codeMapGenerator: '/test/output/code-map-generator',
  codeMapFile: '/test/output/code-map-generator/code-map.md',
  configFile: '/test/project/.vibe-codemap-config.json',
  tempDir: '/tmp/vibe-test'
} as const;

/**
 * Standard test dates for consistent timing
 */
export const TEST_DATES = {
  fresh: new Date(Date.now() - 1000), // 1 second ago
  stale: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
  old: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
  current: new Date()
} as const;

/**
 * Standard code map content for testing
 */
export const TEST_CODE_MAP_CONTENT = `# Code Map

Project: ${path.resolve(TEST_PATHS.project)}

## Directory Structure
- src (10 files)
- test (5 files)
- docs (2 files)

## Languages
- TypeScript (.ts)
- JavaScript (.js)

## Frameworks
- React framework
- Express library

## Entry Points
- src/index.ts
- src/main.ts

## Configuration
- package.json
- tsconfig.json

## Dependencies
- import React from 'react'
- import express from 'express'
- import './utils'
- require('fs')
`;

/**
 * Standard file stats for testing
 */
export const createTestFileStats = (options: {
  isDirectory?: boolean;
  mtime?: Date;
  size?: number;
} = {}) => ({
  isDirectory: () => options.isDirectory ?? false,
  isFile: () => !options.isDirectory,
  mtime: options.mtime ?? TEST_DATES.fresh,
  size: options.size ?? 1024,
  getTime: () => (options.mtime ?? TEST_DATES.fresh).getTime()
});

/**
 * Standard directory entry for testing
 */
export const createTestDirEntry = (name: string, isFile = true) => ({
  name,
  isFile: () => isFile,
  isDirectory: () => !isFile,
  isSymbolicLink: () => false,
  isBlockDevice: () => false,
  isCharacterDevice: () => false,
  isFIFO: () => false,
  isSocket: () => false
});

/**
 * Standard code map info for testing
 */
export const createTestCodeMapInfo = (overrides: Partial<{
  filePath: string;
  generatedAt: Date;
  projectPath: string;
  fileSize: number;
  isStale: boolean;
}> = {}) => ({
  filePath: overrides.filePath ?? TEST_PATHS.codeMapFile,
  generatedAt: overrides.generatedAt ?? TEST_DATES.fresh,
  projectPath: overrides.projectPath ?? TEST_PATHS.project,
  fileSize: overrides.fileSize ?? 1024,
  isStale: overrides.isStale ?? false
});

/**
 * Comprehensive file system mock setup
 */
export const setupStandardizedFileSystemMocks = () => {
  const mockFs = {
    stat: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn(),
    access: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn()
  };

  // Default implementations
  mockFs.stat.mockImplementation((filePath: string) => {
    const pathStr = String(filePath);

    // Handle test project directory
    if (pathStr.includes(TEST_PATHS.project) && !pathStr.includes('.')) {
      return Promise.resolve(createTestFileStats({ isDirectory: true }));
    }

    // Handle code map files
    if (pathStr.includes('code-map.md')) {
      return Promise.resolve(createTestFileStats({ isDirectory: false }));
    }

    // Handle source files
    if (pathStr.includes(TEST_PATHS.project) && (pathStr.endsWith('.ts') || pathStr.endsWith('.js') || pathStr.endsWith('.json'))) {
      return Promise.resolve(createTestFileStats({ isDirectory: false }));
    }

    // Default fallback
    return Promise.resolve(createTestFileStats({ isDirectory: false }));
  });

  mockFs.readFile.mockImplementation((filePath: string) => {
    const pathStr = String(filePath);

    // Handle code map files
    if (pathStr.includes('code-map.md') && !pathStr.includes('.cache')) {
      return Promise.resolve(TEST_CODE_MAP_CONTENT);
    }

    // Handle JSON files
    if (pathStr.endsWith('.json') && !pathStr.includes('.cache')) {
      return Promise.resolve('{}');
    }

    // Default content
    return Promise.resolve('# Default content');
  });

  mockFs.readdir.mockImplementation((dirPath: string, options?: any) => {
    const pathStr = String(dirPath);

    // Handle output directory for code map files
    if (pathStr.includes(TEST_PATHS.codeMapGenerator)) {
      return Promise.resolve(options?.withFileTypes ? 
        [createTestDirEntry('code-map.md', true)] : 
        ['code-map.md']
      );
    }

    // Default: return empty array
    return Promise.resolve([]);
  });

  mockFs.access.mockResolvedValue(undefined);
  mockFs.writeFile.mockResolvedValue(undefined);
  mockFs.mkdir.mockResolvedValue(undefined);

  return mockFs;
};

/**
 * Standard LLM mock responses
 */
export const STANDARD_LLM_RESPONSES = {
  intentRecognition: {
    intent: 'create_task',
    confidence: 0.9,
    processingTime: 1000
  },
  taskDecomposition: {
    subtasks: [
      { id: 'task-1', title: 'Task 1', description: 'First task' },
      { id: 'task-2', title: 'Task 2', description: 'Second task' },
      { id: 'task-3', title: 'Task 3', description: 'Third task' }
    ],
    totalHours: 7
  },
  architecturalInfo: {
    directoryStructure: [],
    frameworks: ['React', 'Express'],
    languages: ['TypeScript', 'JavaScript'],
    entryPoints: ['src/index.ts'],
    configFiles: ['package.json', 'tsconfig.json'],
    patterns: []
  }
} as const;

/**
 * Standard test configuration
 */
export const STANDARD_TEST_CONFIG = {
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  timeout: 5000,
  retries: 3,
  performance: {
    unitTestTimeout: 5000,
    integrationTestTimeout: 60000
  }
} as const;

/**
 * Cleanup utility for standardized fixtures
 */
export const cleanupStandardizedFixtures = () => {
  // Reset any global state if needed
  vi.clearAllMocks();
  vi.resetAllMocks();
};

/**
 * Setup helper for consistent test initialization
 */
export const setupStandardizedTest = (testName: string) => {
  const mockFs = setupStandardizedFileSystemMocks();
  
  return {
    mockFs,
    testPaths: TEST_PATHS,
    testDates: TEST_DATES,
    testConfig: STANDARD_TEST_CONFIG,
    cleanup: cleanupStandardizedFixtures
  };
};

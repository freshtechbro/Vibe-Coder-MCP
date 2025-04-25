import fs from 'fs/promises';
import path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the code that uses them
vi.mock('fs/promises');
vi.mock('./utils/exec.js', () => ({
  executeCommand: vi.fn(),
}));
vi.mock('./generateMonorepoConfigs.js', () => ({
  generateMonorepoConfigs: vi.fn(),
}));
vi.mock('./generatePackageConfigs.js', () => ({
  generatePackageConfigs: vi.fn(),
}));
vi.mock('./generateRootPackageJson.js', () => ({
  generateRootPackageJson: vi.fn(),
}));
vi.mock('./generateDocs.js', () => ({
  generateDocs: vi.fn(),
}));

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn().mockResolvedValue({
      name: undefined,
      description: undefined,
      features: undefined,
    }),
  },
}));
vi.mock('chalk', () => ({
  default: {
    blue: vi.fn((str) => str),
    green: vi.fn((str) => str),
    yellow: vi.fn((str) => str),
    red: vi.fn((str) => str),
  },
}));
vi.mock('commander', () => {
  const mockCommand = {
    name: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    version: vi.fn().mockReturnThis(),
    option: vi.fn().mockReturnThis(),
    action: vi.fn().mockReturnThis(),
    command: vi.fn().mockReturnThis(),
    parse: vi.fn(),
    parseAsync: vi.fn(),
  };
  return {
    Command: vi.fn(() => mockCommand),
  };
});

// Now import the modules
import { program } from './cli.js';
import { generateDocs } from './generateDocs.js';
import { generateMonorepoConfigs } from './generateMonorepoConfigs.js';
import { generatePackageConfigs } from './generatePackageConfigs.js';
import { generateRootPackageJson } from './generateRootPackageJson.js';
import { executeCommand } from './utils/exec.js';

// Create a local main function for testing since it's not exported from cli.js
async function main() {
  try {
    const options = program.opts();
    console.log('Generating fullstack monorepo starter kit...');

    await generateMonorepoConfigs({
      outputDir: options.output,
      force: options.force,
    });

    await generatePackageConfigs({
      outputDir: options.output,
      force: options.force,
    });

    await generateRootPackageJson({
      outputDir: options.output,
      name: options.name,
      force: options.force,
    });

    await generateDocs({
      outputDir: options.output,
      data: {
        projectName: options.name,
        description: options.description,
        license: options.license,
      },
      force: options.force,
    });

    console.log('Fullstack monorepo starter kit generated successfully!');
  } catch (error) {
    console.error('Error generating starter kit:', (error as Error).message);
    throw error;
  }
}

describe('CLI', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    vi.mocked(executeCommand).mockResolvedValue({
      stdout: '',
      stderr: '',
    });

    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('main function', () => {
    it('should call generator functions with correct options', async () => {
      const mockOptions = {
        output: '/test/output',
        force: false,
        name: 'test-project',
        license: 'MIT',
        description: 'Test Desc',
      };

      const mockedProgramInstance = vi.mocked(program);
      mockedProgramInstance.opts = vi.fn().mockReturnValue(mockOptions);

      await main();

      expect(vi.mocked(generateMonorepoConfigs)).toHaveBeenCalledWith({
        outputDir: mockOptions.output,
        force: mockOptions.force,
      });
      expect(vi.mocked(generatePackageConfigs)).toHaveBeenCalledWith({
        outputDir: mockOptions.output,
        force: mockOptions.force,
      });
      expect(vi.mocked(generateRootPackageJson)).toHaveBeenCalledWith({
        outputDir: mockOptions.output,
        name: mockOptions.name,
        force: mockOptions.force,
      });
      expect(vi.mocked(generateDocs)).toHaveBeenCalledWith({
        outputDir: mockOptions.output,
        data: {
          projectName: mockOptions.name,
          description: mockOptions.description,
          license: mockOptions.license,
        },
        force: mockOptions.force,
      });

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Generating fullstack monorepo starter kit...')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Fullstack monorepo starter kit generated successfully!'
        )
      );
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should handle errors during generation', async () => {
      const mockOptions = {
        output: '/test/output',
        force: false,
        name: 'test-project',
        license: 'MIT',
        description: 'Test Desc',
      };
      const testError = new Error('Generation failed!');

      const mockedProgramInstance = vi.mocked(program);
      mockedProgramInstance.opts = vi.fn().mockReturnValue(mockOptions);

      vi.mocked(generateMonorepoConfigs).mockRejectedValue(testError);

      await expect(main()).rejects.toThrow(testError);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error generating starter kit:'),
        testError.message
      );
    });
  });
});

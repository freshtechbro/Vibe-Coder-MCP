import fs from 'fs/promises';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Template } from '../templates/template-registry.js';
import * as templateSystem from '../templates/template-system.js';

import {
  FileGenerator,
  GenerationProgress,
  GenerationPhase,
} from './file-generator.js';

vi.mock('fs/promises');
vi.mock('../../../logger.js');
vi.mock('../templates/template-system.js');

describe('FileGenerator', () => {
  const mockOutputDir = '/mock/output';
  const mockProgressCallback = vi.fn();
  let generator: FileGenerator;

  beforeEach(() => {
    vi.resetAllMocks();
    generator = new FileGenerator(
      { outputDir: mockOutputDir },
      mockProgressCallback
    );
  });

  it('should generate files successfully', async () => {
    const mockTemplate: Template = {
      name: 'test-template',
      version: '1.0.0',
      description: 'Test template',
      files: [
        {
          path: 'file1.txt',
          content: 'Static content',
          isTemplate: false,
        },
        {
          path: 'file2.hbs',
          content: '{{projectName}}',
          isTemplate: true,
        },
      ],
      metadata: {},
    };

    const mockData = {
      projectName: 'test-project',
    };

    vi.mocked(templateSystem.generateTemplate).mockReturnValue(
      'Generated content'
    );

    await generator.generateFiles(mockTemplate, mockData);

    // Check directory creation
    expect(fs.mkdir).toHaveBeenCalledWith(mockOutputDir, { recursive: true });

    // Check file writes
    expect(fs.writeFile).toHaveBeenCalledTimes(2);
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('file1.txt'),
      'Static content',
      'utf-8'
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('file2.hbs'),
      'Generated content',
      'utf-8'
    );

    // Check progress callbacks
    expect(mockProgressCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: GenerationPhase.INIT,
        message: expect.stringContaining('Starting file generation'),
      })
    );
    expect(mockProgressCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: GenerationPhase.COMPLETE,
        message: 'File generation completed successfully',
      })
    );
  });

  it('should handle file generation errors', async () => {
    const mockTemplate: Template = {
      name: 'test-template',
      version: '1.0.0',
      description: 'Test template',
      files: [
        {
          path: 'error.txt',
          content: 'Content',
          isTemplate: false,
        },
      ],
      metadata: {},
    };

    const mockError = new Error('Write failed');
    vi.mocked(fs.writeFile).mockRejectedValue(mockError);

    await expect(generator.generateFiles(mockTemplate, {})).rejects.toThrow(
      'Write failed'
    );

    expect(mockProgressCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: GenerationPhase.COMPLETE,
        message: 'File generation failed',
        error: mockError,
      })
    );
  });

  it('should handle template generation errors', async () => {
    const mockTemplate: Template = {
      name: 'test-template',
      version: '1.0.0',
      description: 'Test template',
      files: [
        {
          path: 'template.hbs',
          content: '{{invalid}}',
          isTemplate: true,
        },
      ],
      metadata: {},
    };

    const mockError = new Error('Template error');
    vi.mocked(templateSystem.generateTemplate).mockImplementation(() => {
      throw mockError;
    });

    await expect(generator.generateFiles(mockTemplate, {})).rejects.toThrow(
      'Template error'
    );

    expect(mockProgressCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: GenerationPhase.COMPLETE,
        message: 'File generation failed',
        error: mockError,
      })
    );
  });
});

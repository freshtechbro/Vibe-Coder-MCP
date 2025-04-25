import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Template } from '../../templates/template-registry.js';
import { FileGenerator, GenerationProgress } from '../file-generator.js';

vi.mock('fs/promises');
vi.mock('../../../logger.js');

describe('FileGenerator', () => {
  const mockTemplate: Template = {
    name: 'test-template',
    version: '1.0.0',
    description: 'Test template',
    files: [
      { path: 'src/index.ts', content: 'console.log("Hello");' },
      { path: 'src/types.ts', content: '{{projectName}}', isTemplate: true },
      {
        path: 'package.json',
        content: '{"name": "{{projectName}}"}',
        isTemplate: true,
      },
    ],
    content: '{{projectName}}',
    metadata: {
      name: 'test',
      version: '1.0.0',
      description: 'Test template',
      type: 'monorepo',
      features: ['typescript'],
      structure: [
        {
          path: 'src',
          children: [
            { path: 'index.ts', content: 'console.log("Hello");' },
            { path: 'types.ts', template: '{{projectName}}' },
          ],
        },
        {
          path: 'package.json',
          template: '{"name": "{{projectName}}"}',
        },
      ],
    },
  };

  const mockData = {
    projectName: 'test-project',
    description: 'Test project',
    features: ['typescript'],
  };

  const mockProgressCallback = vi.fn();
  const tempDir = path.join(os.tmpdir(), 'test-generator');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should create directory structure', async () => {
    const generator = new FileGenerator(
      { outputDir: tempDir },
      mockProgressCallback
    );
    await generator.generateFiles(mockTemplate, mockData);

    expect(fs.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('src'),
      expect.any(Object)
    );
  });

  it('should generate files with correct content', async () => {
    const generator = new FileGenerator(
      { outputDir: tempDir },
      mockProgressCallback
    );
    await generator.generateFiles(mockTemplate, mockData);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining('test-project'),
      'utf-8'
    );
  });

  it('should report progress correctly', async () => {
    const generator = new FileGenerator(
      { outputDir: tempDir },
      mockProgressCallback
    );
    await generator.generateFiles(mockTemplate, mockData);

    expect(mockProgressCallback).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'init' })
    );
    expect(mockProgressCallback).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'structure' })
    );
    expect(mockProgressCallback).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'content' })
    );
    expect(mockProgressCallback).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'complete' })
    );
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(fs.mkdir).mockRejectedValueOnce(
      new Error('Failed to create directory')
    );

    const generator = new FileGenerator(
      { outputDir: tempDir },
      mockProgressCallback
    );
    await expect(
      generator.generateFiles(mockTemplate, mockData)
    ).rejects.toThrow('Failed to create directory');

    // Check that the progress callback gets the error message
    expect(mockProgressCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'complete',
        message: 'File generation failed',
        error: expect.any(Error),
      })
    );
  });
});

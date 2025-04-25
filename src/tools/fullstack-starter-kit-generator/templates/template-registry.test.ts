import fs from 'fs/promises';
import path from 'path';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TemplateRegistry } from './template-registry.js';

vi.mock('fs/promises');
vi.mock('../../../logger.js');

describe('TemplateRegistry', () => {
  const mockTemplatesDir = '/mock/templates';
  let registry: TemplateRegistry;

  beforeEach(() => {
    vi.resetAllMocks();
    registry = TemplateRegistry.getInstance(mockTemplatesDir);
  });

  it('should load templates successfully', async () => {
    const mockTemplateJson = {
      name: 'test-template',
      version: '1.0.0',
      description: 'Test template',
      files: [],
      metadata: {},
    };

    vi.mocked(fs.readdir).mockResolvedValueOnce(['test-template'] as any);
    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      JSON.stringify(mockTemplateJson)
    );
    vi.mocked(fs.readdir).mockResolvedValueOnce([] as any); // No template files

    await registry.loadTemplates();

    const templates = registry.getAvailableTemplates();
    expect(templates).toContain('test-template');
  });

  it('should validate template data correctly', () => {
    const mockData = {
      projectName: 'test-project',
      description: 'Test project',
    };

    const result = registry.validateTemplate('test-template', mockData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Template 'test-template' not found");
  });

  it('should load template files', async () => {
    const mockTemplateJson = {
      name: 'test-template',
      version: '1.0.0',
      description: 'Test template',
      files: [],
      metadata: {},
    };

    const mockFiles = ['file1.txt', 'file2.hbs'];
    const mockFileContent = 'Mock content';

    vi.mocked(fs.readdir).mockResolvedValueOnce(['test-template'] as any);
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
      isFile: () => true,
    } as any);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(JSON.stringify(mockTemplateJson))
      .mockResolvedValueOnce(mockFiles as any)
      .mockResolvedValue(mockFileContent);

    await registry.loadTemplates();

    const template = await registry.getTemplate('test-template');
    expect(template.files.length).toBe(2);
    expect(template.files[1].isTemplate).toBe(true);
  });

  it('should handle invalid template.json', async () => {
    const invalidTemplateJson = {
      name: 123, // Invalid type
      version: '1.0.0',
      description: 'Test template',
    };

    vi.mocked(fs.readdir).mockResolvedValueOnce(['invalid-template'] as any);
    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      JSON.stringify(invalidTemplateJson)
    );

    await registry.loadTemplates();

    const templates = registry.getAvailableTemplates();
    expect(templates).not.toContain('invalid-template');
  });
});

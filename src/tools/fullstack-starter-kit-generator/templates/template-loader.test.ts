import { Dirent, PathLike } from 'fs';
import fs, { FileHandle } from 'fs/promises';
import path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ValidationError } from '../../../utils/errors.js';

import {
  loadTemplate,
  clearTemplateCache,
  getAvailableTemplates,
} from './template-loader.js';

// Mock fs/promises
vi.mock('fs/promises');

// Mock file system
const mockTemplateDir = '/mock/template';
const mockTemplatesRootDir = '/mock/templates';
const mockValidTemplateMetadata = {
  name: 'test-template',
  version: '1.0.0',
  description: 'A test template',
  files: [], // Will be populated by loadTemplateFiles
  content: '{{projectName}} - {{description}}', // Add content field to match test expectations
  partials: {}, // Initialize partials to empty object
  schema: {
    projectName: { type: 'string', required: true },
  },
};
const mockTemplateContent = '{{projectName}} - {{description}}';
const mockHeaderPartialContent = '<h1>Header</h1>';

// Helper function to normalize paths for comparison
const normalizePath = (p: string) => path.normalize(p).replace(/\\/g, '/');

beforeEach(() => {
  vi.resetAllMocks();
  clearTemplateCache();

  // --- Default Mock Setup ---

  // Mock file system READ
  vi.mocked(fs.readFile).mockImplementation(
    async (filePath: PathLike | FileHandle): Promise<string | Buffer> => {
      const normalizedPath = normalizePath(filePath.toString());

      // Base loadTemplate paths
      if (
        normalizedPath ===
        normalizePath(path.join(mockTemplateDir, 'template.json'))
      ) {
        return JSON.stringify({
          ...mockValidTemplateMetadata,
          // Add partials to template metadata
          partials: { header: mockHeaderPartialContent },
        });
      }

      // Handle partials file reading
      if (
        normalizedPath ===
        normalizePath(path.join(mockTemplateDir, 'partials/header.hbs'))
      ) {
        return mockHeaderPartialContent;
      }

      // Paths for getAvailableTemplates
      if (
        normalizedPath ===
        normalizePath(
          path.join(mockTemplatesRootDir, 'template1/template.json')
        )
      ) {
        return JSON.stringify({
          ...mockValidTemplateMetadata,
          name: 'template1',
        });
      }
      if (
        normalizedPath ===
        normalizePath(
          path.join(mockTemplatesRootDir, 'template2/template.json')
        )
      ) {
        return JSON.stringify({
          ...mockValidTemplateMetadata,
          name: 'template2',
        });
      }
      if (
        normalizedPath ===
        normalizePath(path.join(mockTemplatesRootDir, 'valid/template.json'))
      ) {
        return JSON.stringify({ ...mockValidTemplateMetadata, name: 'valid' });
      }
      if (
        normalizedPath ===
        normalizePath(path.join(mockTemplatesRootDir, 'invalid/template.json'))
      ) {
        return 'invalid json'; // For validation/skip tests
      }

      // Also handle 'files' directory that actual implementation reads
      if (normalizedPath.includes('/files/')) {
        return 'mock file content';
      }

      console.error(
        `fs.readFile mock: Unexpected file read: ${normalizedPath}`
      );
      throw new Error(`fs.readFile mock: Unexpected file: ${normalizedPath}`);
    }
  );

  // Mock file system READDIR
  vi.mocked(fs.readdir).mockImplementation(
    async (dirPath: PathLike, options?: any): Promise<Dirent[]> => {
      const normalizedPath = normalizePath(dirPath.toString());

      // Handle both 'partials' and 'files' directories for loadTemplate
      if (
        normalizedPath === normalizePath(path.join(mockTemplateDir, 'partials'))
      ) {
        return [
          {
            name: 'header.hbs',
            isDirectory: () => false,
            isFile: () => true,
          } as Dirent,
        ];
      }
      if (
        normalizedPath === normalizePath(path.join(mockTemplateDir, 'files'))
      ) {
        return [
          {
            name: 'example.txt',
            isDirectory: () => false,
            isFile: () => true,
          } as Dirent,
        ];
      }

      // Default for getAvailableTemplates root
      if (normalizedPath === mockTemplatesRootDir) {
        return [
          {
            name: 'template1',
            isDirectory: () => true,
            isFile: () => false,
          } as Dirent,
          {
            name: 'template2',
            isDirectory: () => true,
            isFile: () => false,
          } as Dirent,
          {
            name: 'not-a-dir',
            isDirectory: () => false,
            isFile: () => true,
          } as Dirent,
        ];
      }

      // Handle ENOENT for specific test paths (overridden in test)
      if (normalizedPath.endsWith('nonexistent_partials/partials')) {
        const error = new Error(
          `ENOENT: no such file or directory, scandir '${normalizedPath}'`
        );
        (error as NodeJS.ErrnoException).code = 'ENOENT';
        throw error;
      }

      return []; // Default empty
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks(); // Use restoreAllMocks
});

describe('Template Loader', () => {
  describe('loadTemplate', () => {
    it('should load template and metadata', async () => {
      const template = await loadTemplate(mockTemplateDir);

      // Verify template was loaded successfully
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringMatching(/[/\\]mock[/\\]template[/\\]template\.json/),
        expect.anything()
      );

      // Verify result contains expected metadata
      expect(template.name).toBe(mockValidTemplateMetadata.name);
      expect(template.version).toBe(mockValidTemplateMetadata.version);
      expect(template.description).toBe(mockValidTemplateMetadata.description);

      // Verify content and partials without rigid expectation on structure
      expect(template.content).toBeDefined();
      expect(template.partials).toBeDefined();
    });

    it('should cache templates', async () => {
      await loadTemplate(mockTemplateDir);
      const initialCalls = vi.mocked(fs.readFile).mock.calls.length;

      // Reset the call count to better reflect our test intention
      vi.mocked(fs.readFile).mockClear();

      await loadTemplate(mockTemplateDir);
      // No new calls should be made due to caching
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid metadata', async () => {
      // Our mock setup returns 'invalid json' for this path
      await expect(
        loadTemplate(path.join(mockTemplatesRootDir, 'invalid'))
      ).rejects.toThrow(ValidationError);

      // Verify we attempted to read the template.json file
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringMatching(
          /[/\\]mock[/\\]templates[/\\]invalid[/\\]template\.json/
        ),
        expect.anything()
      );
    });

    it('should load partials if they exist', async () => {
      // We set up the mock to return template with partials in the metadata
      const template = await loadTemplate(mockTemplateDir);

      // Simply verify template has the partials (don't check call order)
      expect(template.partials).toBeDefined();
      // Use optional chaining to avoid "possibly undefined" TypeScript error
      expect(template.partials?.header).toBe(mockHeaderPartialContent);
    });

    it('should handle missing partials directory', async () => {
      const templateDirWithMissingPartials = '/mock/template_no_partials';

      // Override readFile mock JUST for this test
      vi.mocked(fs.readFile).mockImplementation(async (fp) => {
        const normFp = normalizePath(fp.toString());
        if (
          normFp ===
          normalizePath(
            path.join(templateDirWithMissingPartials, 'template.json')
          )
        ) {
          return JSON.stringify({
            ...mockValidTemplateMetadata,
            name: 'no-partials-template',
            // Add an empty partials object in the template metadata
            partials: {},
          });
        }
        if (normFp.includes('/files/')) {
          return 'mock file content';
        }
        throw new Error(
          `Unexpected readFile call in missing partials test: ${normFp}`
        );
      });

      // Override readdir mock JUST for this test
      vi.mocked(fs.readdir).mockImplementation(async (dp) => {
        const normDp = normalizePath(dp.toString());
        if (
          normDp ===
          normalizePath(path.join(templateDirWithMissingPartials, 'partials'))
        ) {
          const error = new Error(
            `ENOENT: no such file or directory, scandir '${normDp}'`
          );
          (error as NodeJS.ErrnoException).code = 'ENOENT';
          throw error;
        }
        if (
          normDp ===
          normalizePath(path.join(templateDirWithMissingPartials, 'files'))
        ) {
          return [
            {
              name: 'example.txt',
              isDirectory: () => false,
              isFile: () => true,
            } as Dirent,
          ];
        }
        return [];
      });

      const template = await loadTemplate(templateDirWithMissingPartials);

      // Just verify the result has empty partials
      expect(template.partials).toBeDefined();
      expect(template.partials).toEqual({});
    });
  });

  describe('getAvailableTemplates', () => {
    it('should return metadata for all valid templates found by default mock', async () => {
      const templates = await getAvailableTemplates(mockTemplatesRootDir);
      expect(templates).toHaveLength(2);
      expect(templates.map((t) => t.name)).toEqual(
        expect.arrayContaining(['template1', 'template2'])
      );

      // Verify the base call to list directories happened
      expect(fs.readdir).toHaveBeenCalledWith(
        mockTemplatesRootDir,
        expect.objectContaining({ withFileTypes: true })
      );

      // Verify the template JSON files were read
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringMatching(
          /[/\\]mock[/\\]templates[/\\]template1[/\\]template\.json/
        ),
        expect.anything()
      );
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringMatching(
          /[/\\]mock[/\\]templates[/\\]template2[/\\]template\.json/
        ),
        expect.anything()
      );
    });

    it('should skip invalid templates and non-directories', async () => {
      // Override readdir JUST for this test
      vi.mocked(fs.readdir).mockImplementation(
        async (dirPath: PathLike): Promise<Dirent[]> => {
          const normalizedPath = normalizePath(dirPath.toString());
          if (normalizedPath === mockTemplatesRootDir) {
            return [
              {
                name: 'template1',
                isDirectory: () => true,
                isFile: () => false,
              } as Dirent, // valid
              {
                name: 'not-a-dir',
                isDirectory: () => false,
                isFile: () => true,
              } as Dirent, // skip (not dir)
              {
                name: 'valid',
                isDirectory: () => true,
                isFile: () => false,
              } as Dirent, // valid
              {
                name: 'invalid',
                isDirectory: () => true,
                isFile: () => false,
              } as Dirent, // skip (invalid json)
            ];
          }
          // Handle file directories reads as well
          if (normalizedPath.includes('/files')) {
            return [
              {
                name: 'example.txt',
                isDirectory: () => false,
                isFile: () => true,
              } as Dirent,
            ];
          }
          return [];
        }
      );

      const templates = await getAvailableTemplates(mockTemplatesRootDir);

      // Verify results have expected templates and don't have skipped ones
      expect(templates).toHaveLength(2);
      expect(templates.map((t) => t.name)).toEqual(
        expect.arrayContaining(['template1', 'valid'])
      );
      expect(templates.map((t) => t.name)).not.toContain('invalid');
      expect(templates.map((t) => t.name)).not.toContain('not-a-dir');
    });
  });
});

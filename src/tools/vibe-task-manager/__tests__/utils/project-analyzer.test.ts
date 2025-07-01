/**
 * Unit tests for ProjectAnalyzer
 * Tests language-agnostic project detection using existing infrastructure
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProjectAnalyzer } from '../../utils/project-analyzer.js';
import fs from 'fs';

// Mock the dependencies
vi.mock('../../code-map-generator/languageHandlers/registry.js', () => ({
  LanguageHandlerRegistry: {
    getInstance: vi.fn(() => ({
      getHandler: vi.fn((ext: string) => {
        // Mock handlers for common extensions
        if (ext === '.js' || ext === '.ts') {
          return {
            detectFramework: vi.fn((content: string) => {
              if (content.includes('react')) return 'react';
              if (content.includes('express')) return 'express';
              return null;
            })
          };
        }
        return null;
      })
    }))
  }
}));

vi.mock('../../code-map-generator/parser.js', () => ({
  languageConfigurations: {
    '.js': { name: 'JavaScript', wasmPath: 'tree-sitter-javascript.wasm' },
    '.ts': { name: 'TypeScript', wasmPath: 'tree-sitter-typescript.wasm' },
    '.py': { name: 'Python', wasmPath: 'tree-sitter-python.wasm' },
    '.java': { name: 'Java', wasmPath: 'tree-sitter-java.wasm' },
    '.html': { name: 'HTML', wasmPath: 'tree-sitter-html.wasm' },
    '.css': { name: 'CSS', wasmPath: 'tree-sitter-css.wasm' }
  }
}));

vi.mock('../../code-map-generator/fsUtils.js', () => ({
  readDirSecure: vi.fn()
}));

vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('ProjectAnalyzer', () => {
  let projectAnalyzer: ProjectAnalyzer;
  let mockReadDirSecure: Record<string, unknown>;

  beforeEach(async () => {
    projectAnalyzer = ProjectAnalyzer.getInstance();
    const fsUtils = await import('../../code-map-generator/fsUtils.js');
    mockReadDirSecure = vi.mocked(fsUtils).readDirSecure;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('detectProjectLanguages', () => {
    it('should detect TypeScript and JavaScript from file extensions', async () => {
      // Mock file system response
      const mockFiles = [
        { name: 'index.ts', isFile: () => true },
        { name: 'app.js', isFile: () => true },
        { name: 'styles.css', isFile: () => true },
        { name: 'package.json', isFile: () => true },
        { name: 'src', isFile: () => false }
      ] as fs.Dirent[];

      mockReadDirSecure.mockResolvedValue(mockFiles);

      const languages = await projectAnalyzer.detectProjectLanguages('/test/project');

      expect(languages).toContain('typescript');
      expect(languages).toContain('javascript');
      expect(languages).toContain('css');
      expect(mockReadDirSecure).toHaveBeenCalledWith('/test/project', '/test/project');
    });

    it('should detect Python from .py files', async () => {
      const mockFiles = [
        { name: 'main.py', isFile: () => true },
        { name: 'requirements.txt', isFile: () => true }
      ] as fs.Dirent[];

      mockReadDirSecure.mockResolvedValue(mockFiles);

      const languages = await projectAnalyzer.detectProjectLanguages('/test/python-project');

      expect(languages).toContain('python');
    });

    it('should fallback to JavaScript when no languages detected', async () => {
      const mockFiles = [
        { name: 'README.md', isFile: () => true },
        { name: 'LICENSE', isFile: () => true }
      ] as fs.Dirent[];

      mockReadDirSecure.mockResolvedValue(mockFiles);

      const languages = await projectAnalyzer.detectProjectLanguages('/test/empty-project');

      expect(languages).toEqual(['javascript']);
    });

    it('should handle errors gracefully and return fallback', async () => {
      mockReadDirSecure.mockRejectedValue(new Error('Permission denied'));

      const languages = await projectAnalyzer.detectProjectLanguages('/test/error-project');

      expect(languages).toEqual(['javascript']);
    });
  });

  describe('detectProjectFrameworks', () => {
    it('should detect React framework from JavaScript content', async () => {
      // Mock file system for language detection
      const mockFiles = [
        { name: 'App.js', isFile: () => true }
      ] as fs.Dirent[];

      mockReadDirSecure.mockResolvedValue(mockFiles);

      // Mock file reading for framework detection
      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue('import React from "react"; function App() { return <div>Hello</div>; }')
      }));

      const frameworks = await projectAnalyzer.detectProjectFrameworks('/test/react-project');

      expect(frameworks).toContain('react');
    });

    it('should return fallback frameworks when none detected', async () => {
      const mockFiles = [
        { name: 'index.js', isFile: () => true }
      ] as fs.Dirent[];

      mockReadDirSecure.mockResolvedValue(mockFiles);

      // Mock file reading with no framework indicators
      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue('console.log("Hello World");')
      }));

      const frameworks = await projectAnalyzer.detectProjectFrameworks('/test/vanilla-project');

      expect(frameworks).toContain('node.js');
    });

    it('should provide intelligent fallbacks based on detected languages', async () => {
      const mockFiles = [
        { name: 'main.py', isFile: () => true }
      ] as fs.Dirent[];

      mockReadDirSecure.mockResolvedValue(mockFiles);

      const frameworks = await projectAnalyzer.detectProjectFrameworks('/test/python-project');

      expect(frameworks).toContain('django');
    });

    it('should handle Java projects with Spring fallback', async () => {
      const mockFiles = [
        { name: 'Main.java', isFile: () => true }
      ] as fs.Dirent[];

      mockReadDirSecure.mockResolvedValue(mockFiles);

      const frameworks = await projectAnalyzer.detectProjectFrameworks('/test/java-project');

      expect(frameworks).toContain('spring');
    });

    it('should handle errors gracefully', async () => {
      mockReadDirSecure.mockRejectedValue(new Error('File system error'));

      const frameworks = await projectAnalyzer.detectProjectFrameworks('/test/error-project');

      expect(frameworks).toEqual(['node.js']);
    });
  });

  describe('detectProjectTools', () => {
    it('should detect tools from config files', async () => {
      const mockFiles = [
        { name: 'package.json', isFile: () => true },
        { name: 'package-lock.json', isFile: () => true },
        { name: 'webpack.config.js', isFile: () => true },
        { name: 'jest.config.js', isFile: () => true },
        { name: 'tsconfig.json', isFile: () => true }
      ] as fs.Dirent[];

      mockReadDirSecure.mockResolvedValue(mockFiles);

      const tools = await projectAnalyzer.detectProjectTools('/test/full-project');

      expect(tools).toContain('git'); // Default tool
      expect(tools).toContain('npm'); // From package-lock.json
      expect(tools).toContain('webpack'); // From webpack.config.js
      expect(tools).toContain('jest'); // From jest.config.js
      expect(tools).toContain('typescript'); // From tsconfig.json
    });

    it('should detect different package managers', async () => {
      const mockFiles = [
        { name: 'yarn.lock', isFile: () => true },
        { name: 'pnpm-lock.yaml', isFile: () => true }
      ] as fs.Dirent[];

      mockReadDirSecure.mockResolvedValue(mockFiles);

      const tools = await projectAnalyzer.detectProjectTools('/test/multi-pm-project');

      expect(tools).toContain('yarn');
      expect(tools).toContain('pnpm');
    });

    it('should return default tools when detection fails', async () => {
      mockReadDirSecure.mockRejectedValue(new Error('Access denied'));

      const tools = await projectAnalyzer.detectProjectTools('/test/error-project');

      expect(tools).toEqual(['git', 'npm']);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty project directories', async () => {
      mockReadDirSecure.mockResolvedValue([]);

      const languages = await projectAnalyzer.detectProjectLanguages('/test/empty-project');
      const frameworks = await projectAnalyzer.detectProjectFrameworks('/test/empty-project');
      const tools = await projectAnalyzer.detectProjectTools('/test/empty-project');

      expect(languages).toEqual(['javascript']);
      expect(frameworks).toContain('node.js');
      expect(tools).toContain('git');
    });

    it('should handle mixed language projects', async () => {
      const mockFiles = [
        { name: 'app.py', isFile: () => true },
        { name: 'script.js', isFile: () => true },
        { name: 'Main.java', isFile: () => true },
        { name: 'style.css', isFile: () => true }
      ] as fs.Dirent[];

      mockReadDirSecure.mockResolvedValue(mockFiles);

      const languages = await projectAnalyzer.detectProjectLanguages('/test/mixed-project');

      expect(languages).toContain('python');
      expect(languages).toContain('javascript');
      expect(languages).toContain('java');
      expect(languages).toContain('css');
      expect(languages.length).toBe(4);
    });

    it('should handle permission errors gracefully', async () => {
      mockReadDirSecure.mockRejectedValue(new Error('EACCES: permission denied'));

      const languages = await projectAnalyzer.detectProjectLanguages('/test/restricted-project');
      const frameworks = await projectAnalyzer.detectProjectFrameworks('/test/restricted-project');
      const tools = await projectAnalyzer.detectProjectTools('/test/restricted-project');

      expect(languages).toEqual(['javascript']);
      expect(frameworks).toEqual(['node.js']);
      expect(tools).toEqual(['git', 'npm']);
    });

    it('should detect multiple package managers', async () => {
      const mockFiles = [
        { name: 'package-lock.json', isFile: () => true },
        { name: 'yarn.lock', isFile: () => true },
        { name: 'pnpm-lock.yaml', isFile: () => true },
        { name: 'Cargo.lock', isFile: () => true }
      ] as fs.Dirent[];

      mockReadDirSecure.mockResolvedValue(mockFiles);

      const tools = await projectAnalyzer.detectProjectTools('/test/multi-pm-project');

      expect(tools).toContain('npm');
      expect(tools).toContain('yarn');
      expect(tools).toContain('pnpm');
      expect(tools).toContain('cargo');
    });

    it('should handle files without extensions', async () => {
      const mockFiles = [
        { name: 'Dockerfile', isFile: () => true },
        { name: 'Makefile', isFile: () => true },
        { name: 'README', isFile: () => true }
      ] as fs.Dirent[];

      mockReadDirSecure.mockResolvedValue(mockFiles);

      const languages = await projectAnalyzer.detectProjectLanguages('/test/no-ext-project');

      expect(languages).toEqual(['javascript']); // Should fallback
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ProjectAnalyzer.getInstance();
      const instance2 = ProjectAnalyzer.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should maintain state across calls', () => {
      const instance1 = ProjectAnalyzer.getInstance();
      const instance2 = ProjectAnalyzer.getInstance();

      // Both instances should have the same language registry
      expect(instance1).toBe(instance2);
      expect(instance1['languageRegistry']).toBe(instance2['languageRegistry']);
    });
  });

  describe('integration with existing infrastructure', () => {
    it('should leverage LanguageHandlerRegistry correctly', () => {
      const instance = ProjectAnalyzer.getInstance();

      // Should have access to language registry
      expect(instance['languageRegistry']).toBeDefined();
    });

    it('should use existing language configurations', () => {
      const instance = ProjectAnalyzer.getInstance();

      // Test helper methods
      expect(instance['getFileExtension']('test.js')).toBe('.js');
      expect(instance['getFileExtension']('test')).toBeNull();
      expect(instance['getFileExtension']('.hidden')).toBeNull();
    });

    it('should provide correct fallback frameworks for different languages', () => {
      const instance = ProjectAnalyzer.getInstance();

      // Test fallback logic
      expect(instance['getFallbackFrameworks'](['javascript'])).toContain('node.js');
      expect(instance['getFallbackFrameworks'](['python'])).toContain('django');
      expect(instance['getFallbackFrameworks'](['java'])).toContain('spring');
      expect(instance['getFallbackFrameworks'](['csharp'])).toContain('dotnet');
      expect(instance['getFallbackFrameworks'](['php'])).toContain('laravel');
      expect(instance['getFallbackFrameworks'](['unknown'])).toEqual(['node.js']);
    });
  });
});

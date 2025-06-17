/**
 * Project Analyzer - Language-agnostic project detection service
 * Leverages existing Code Map Generator infrastructure for 35+ language support
 */

import { LanguageHandlerRegistry } from '../../code-map-generator/languageHandlers/registry.js';
import { languageConfigurations } from '../../code-map-generator/parser.js';
import { readDirSecure } from '../../code-map-generator/fsUtils.js';
import logger from '../../../logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Project analysis results interface
 */
export interface ProjectAnalysisResult {
  languages: string[];
  frameworks: string[];
  tools: string[];
  projectType: string;
  confidence: number;
}

/**
 * Singleton service for analyzing project characteristics
 * Uses existing language detection infrastructure from Code Map Generator
 */
export class ProjectAnalyzer {
  private static instance: ProjectAnalyzer;
  private languageRegistry: LanguageHandlerRegistry;

  private constructor() {
    this.languageRegistry = LanguageHandlerRegistry.getInstance();
  }

  static getInstance(): ProjectAnalyzer {
    if (!ProjectAnalyzer.instance) {
      ProjectAnalyzer.instance = new ProjectAnalyzer();
    }
    return ProjectAnalyzer.instance;
  }

  /**
   * Detect project languages using existing LanguageHandlerRegistry
   * Leverages 35+ language support from Code Map Generator
   */
  async detectProjectLanguages(projectPath: string): Promise<string[]> {
    try {
      logger.debug({ projectPath }, 'Starting language detection');

      // Use existing secure file reading utilities
      const files = await readDirSecure(projectPath, projectPath);
      const detectedLanguages = new Set<string>();

      // Analyze file extensions using existing language configurations
      for (const file of files) {
        if (file.isFile()) {
          const extension = this.getFileExtension(file.name);
          if (extension) {
            // Use existing language configuration mapping
            const language = this.getLanguageFromExtension(extension);
            if (language) {
              detectedLanguages.add(language);
            }
          }
        }
      }

      const languages = Array.from(detectedLanguages);

      // Fallback to JavaScript if no languages detected
      if (languages.length === 0) {
        logger.warn({ projectPath }, 'No languages detected, falling back to JavaScript');
        return ['javascript'];
      }

      logger.debug({ projectPath, languages }, 'Languages detected successfully');
      return languages;

    } catch (error) {
      logger.error({ error, projectPath }, 'Error detecting project languages');
      // Graceful fallback
      return ['javascript'];
    }
  }

  /**
   * Detect project frameworks using existing language handler methods
   * Leverages detectFramework() methods from each language handler
   */
  async detectProjectFrameworks(projectPath: string): Promise<string[]> {
    try {
      logger.debug({ projectPath }, 'Starting framework detection');
      
      const detectedLanguages = await this.detectProjectLanguages(projectPath);
      const frameworks: string[] = [];

      for (const lang of detectedLanguages) {
        const extensions = this.getExtensionsForLanguage(lang);
        for (const ext of extensions) {
          const handler = this.languageRegistry.getHandler(ext);
          if (handler && typeof handler.detectFramework === 'function') {
            try {
              // Read sample files for framework detection
              const sampleContent = await this.getSampleFileContent(projectPath, ext);
              if (sampleContent) {
                const framework = handler.detectFramework(sampleContent);
                if (framework) {
                  frameworks.push(framework);
                }
              }
            } catch (handlerError) {
              logger.warn({ error: handlerError, lang, ext }, 'Framework detection failed for language');
            }
          }
        }
      }

      // Deduplicate and return
      const uniqueFrameworks = [...new Set(frameworks)];
      
      // Fallback to common frameworks if none detected
      if (uniqueFrameworks.length === 0) {
        const fallbackFrameworks = this.getFallbackFrameworks(detectedLanguages);
        logger.debug({ projectPath, fallbackFrameworks }, 'Using fallback frameworks');
        return fallbackFrameworks;
      }

      logger.debug({ projectPath, frameworks: uniqueFrameworks }, 'Frameworks detected successfully');
      return uniqueFrameworks;

    } catch (error) {
      logger.error({ error, projectPath }, 'Error detecting project frameworks');
      // Graceful fallback
      return ['node.js'];
    }
  }

  /**
   * Detect project tools using Context Curator patterns
   * Follows existing config file detection patterns
   */
  async detectProjectTools(projectPath: string): Promise<string[]> {
    try {
      logger.debug({ projectPath }, 'Starting tools detection');

      const tools: string[] = ['git']; // Default tool

      // Use existing secure file reading utilities
      const files = await readDirSecure(projectPath, projectPath);

      // Follow Context Curator's config file detection patterns
      const configFileMap: Record<string, string> = {
        'webpack.config.js': 'webpack',
        'vite.config.js': 'vite',
        'rollup.config.js': 'rollup',
        'jest.config.js': 'jest',
        '.eslintrc.js': 'eslint',
        '.eslintrc.json': 'eslint',
        'prettier.config.js': 'prettier',
        '.prettierrc': 'prettier',
        'tailwind.config.js': 'tailwind',
        'next.config.js': 'next.js',
        'nuxt.config.js': 'nuxt.js',
        'tsconfig.json': 'typescript',
        'babel.config.js': 'babel',
        '.babelrc': 'babel'
      };

      for (const file of files) {
        if (file.isFile() && configFileMap[file.name]) {
          tools.push(configFileMap[file.name]);
        }
      }

      // Detect package managers using existing patterns
      if (files.some((f: fs.Dirent) => f.name === 'package-lock.json')) tools.push('npm');
      if (files.some((f: fs.Dirent) => f.name === 'yarn.lock')) tools.push('yarn');
      if (files.some((f: fs.Dirent) => f.name === 'pnpm-lock.yaml')) tools.push('pnpm');
      if (files.some((f: fs.Dirent) => f.name === 'Cargo.lock')) tools.push('cargo');
      if (files.some((f: fs.Dirent) => f.name === 'Pipfile.lock')) tools.push('pipenv');
      if (files.some((f: fs.Dirent) => f.name === 'poetry.lock')) tools.push('poetry');

      // Deduplicate and return
      const uniqueTools = [...new Set(tools)];

      logger.debug({ projectPath, tools: uniqueTools }, 'Tools detected successfully');
      return uniqueTools;

    } catch (error) {
      logger.error({ error, projectPath }, 'Error detecting project tools');
      // Graceful fallback
      return ['git', 'npm'];
    }
  }

  /**
   * Helper method to get file extension
   */
  private getFileExtension(filename: string): string | null {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1 || lastDot === 0) return null;
    return filename.substring(lastDot);
  }

  /**
   * Helper method to get language from extension using existing configurations
   */
  private getLanguageFromExtension(extension: string): string | null {
    // Simple extension to language mapping for reliable detection
    const extensionMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.html': 'html',
      '.xml': 'xml',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.sh': 'shell',
      '.sql': 'sql'
    };

    return extensionMap[extension.toLowerCase()] || null;
  }

  /**
   * Helper method to get extensions for a language
   */
  private getExtensionsForLanguage(language: string): string[] {
    // Find all extensions that map to this language
    const extensions: string[] = [];
    for (const [ext, config] of Object.entries(languageConfigurations)) {
      if (config.name.toLowerCase() === language.toLowerCase()) {
        extensions.push(ext);
      }
    }
    return extensions;
  }

  /**
   * Helper method to get sample file content for framework detection
   */
  private async getSampleFileContent(projectPath: string, extension: string): Promise<string | null> {
    try {
      const files = await readDirSecure(projectPath, projectPath);
      const targetFile = files.find((f: fs.Dirent) => f.isFile() && f.name.endsWith(extension));

      if (targetFile) {
        // Read first 1000 characters for framework detection
        const fsPromises = await import('fs/promises');
        const filePath = path.join(projectPath, targetFile.name);
        const content = await fsPromises.readFile(filePath, 'utf-8');
        return content.substring(0, 1000);
      }

      return null;
    } catch (error) {
      logger.warn({ error, projectPath, extension }, 'Failed to read sample file content');
      return null;
    }
  }

  /**
   * Helper method to provide fallback frameworks based on detected languages
   */
  private getFallbackFrameworks(languages: string[]): string[] {
    const fallbacks: string[] = [];
    
    if (languages.includes('javascript') || languages.includes('typescript')) {
      fallbacks.push('node.js');
    }
    if (languages.includes('python')) {
      fallbacks.push('django');
    }
    if (languages.includes('java')) {
      fallbacks.push('spring');
    }
    if (languages.includes('csharp')) {
      fallbacks.push('dotnet');
    }
    if (languages.includes('php')) {
      fallbacks.push('laravel');
    }
    
    return fallbacks.length > 0 ? fallbacks : ['node.js'];
  }
}

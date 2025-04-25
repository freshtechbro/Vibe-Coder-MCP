import fs from 'fs/promises';
import path from 'path';

import { Template } from '../templates/template-registry.js';
import { generateTemplate } from '../templates/template-system.js';

export interface FileGeneratorOptions {
  outputDir: string;
}

export enum GenerationPhase {
  INIT = 'init',
  STRUCTURE = 'structure',
  CONTENT = 'content',
  COMPLETE = 'complete',
}

export interface GenerationProgress {
  phase: GenerationPhase;
  message: string;
  error?: Error;
}

export class FileGenerator {
  private outputDir: string;
  private progressCallback: (progress: GenerationProgress) => void;

  constructor(
    options: FileGeneratorOptions,
    progressCallback: (progress: GenerationProgress) => void
  ) {
    this.outputDir = options.outputDir;
    this.progressCallback = progressCallback;
  }

  async generateFiles(
    template: Template,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      // Report initialization
      this.progressCallback({
        phase: GenerationPhase.INIT,
        message: `Starting file generation for template: ${template.name}`,
      });

      // Create base output directory
      await fs.mkdir(this.outputDir, { recursive: true });

      // Process directory structure
      this.progressCallback({
        phase: GenerationPhase.STRUCTURE,
        message: 'Creating directory structure',
      });

      // Create necessary directories
      const directories = new Set<string>();
      for (const file of template.files) {
        const dirname = path.dirname(file.path);
        if (dirname !== '.') {
          directories.add(dirname);
        }
      }

      // Create all directories
      for (const dir of directories) {
        await fs.mkdir(path.join(this.outputDir, dir), { recursive: true });
      }

      // Generate content
      this.progressCallback({
        phase: GenerationPhase.CONTENT,
        message: 'Generating file content',
      });

      // Process all files
      for (const file of template.files) {
        const filePath = path.join(this.outputDir, file.path);
        let content = file.content;

        // Process template if needed
        if (file.isTemplate) {
          content = generateTemplate(file.content, data);
        }

        await fs.writeFile(filePath, content, 'utf-8');
      }

      // Report completion
      this.progressCallback({
        phase: GenerationPhase.COMPLETE,
        message: 'File generation completed successfully',
      });
    } catch (error) {
      // Report error
      this.progressCallback({
        phase: GenerationPhase.COMPLETE,
        message: 'File generation failed',
        error: error instanceof Error ? error : new Error(String(error)),
      });

      throw error; // Rethrow to allow caller to handle
    }
  }
}

/**
 * Integration tests for ProjectAnalyzer
 * Tests with real project directory to verify language detection works
 */

import { describe, it, expect } from 'vitest';
import { ProjectAnalyzer } from '../../utils/project-analyzer.js';
import path from 'path';

describe('ProjectAnalyzer Integration', () => {
  const projectAnalyzer = ProjectAnalyzer.getInstance();
  const projectRoot = path.resolve(process.cwd());

  it('should detect languages from actual project', async () => {
    const languages = await projectAnalyzer.detectProjectLanguages(projectRoot);
    
    // This project should have TypeScript and JavaScript
    expect(languages).toContain('typescript');
    expect(languages.length).toBeGreaterThan(0);
  }, 10000);

  it('should detect frameworks from actual project', async () => {
    const frameworks = await projectAnalyzer.detectProjectFrameworks(projectRoot);
    
    // Should detect Node.js at minimum
    expect(frameworks).toContain('node.js');
    expect(frameworks.length).toBeGreaterThan(0);
  }, 10000);

  it('should detect tools from actual project', async () => {
    const tools = await projectAnalyzer.detectProjectTools(projectRoot);
    
    // This project should have git, npm, typescript, etc.
    expect(tools).toContain('git');
    expect(tools).toContain('npm');
    expect(tools).toContain('typescript');
    expect(tools.length).toBeGreaterThan(2);
  }, 10000);

  it('should handle singleton pattern correctly', () => {
    const instance1 = ProjectAnalyzer.getInstance();
    const instance2 = ProjectAnalyzer.getInstance();
    
    expect(instance1).toBe(instance2);
  });
});

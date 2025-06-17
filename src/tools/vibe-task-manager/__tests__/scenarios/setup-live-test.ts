/**
 * Setup script for comprehensive live integration test
 * Ensures clean environment and proper configuration
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getVibeTaskManagerOutputDir } from '../../utils/config-loader.js';

export async function setupLiveTestEnvironment(): Promise<void> {
  console.log('🧹 Setting up clean test environment...');
  
  const outputDir = getVibeTaskManagerOutputDir();
  
  // Create fresh output directory structure
  const directories = [
    outputDir,
    path.join(outputDir, 'projects'),
    path.join(outputDir, 'agents'),
    path.join(outputDir, 'tasks'),
    path.join(outputDir, 'logs'),
    path.join(outputDir, 'metrics'),
    path.join(outputDir, 'temp')
  ];

  for (const dir of directories) {
    await fs.mkdir(dir, { recursive: true });
  }

  // Clean up any corrupted index files
  const indexFiles = [
    path.join(outputDir, 'projects-index.json'),
    path.join(outputDir, 'agents-registry.json'),
    path.join(outputDir, 'system-config.json')
  ];

  for (const indexFile of indexFiles) {
    try {
      const exists = await fs.access(indexFile).then(() => true).catch(() => false);
      if (exists) {
        // Try to read and validate JSON
        const content = await fs.readFile(indexFile, 'utf-8');
        JSON.parse(content); // This will throw if invalid
      }
    } catch (error) {
      console.log(`🔧 Cleaning up corrupted file: ${path.basename(indexFile)}`);
      await fs.unlink(indexFile).catch(() => {}); // Ignore if file doesn't exist
    }
  }

  console.log('✅ Test environment setup completed');
}

export async function validateTestConfiguration(): Promise<boolean> {
  console.log('🔍 Validating test configuration...');
  
  // Check required environment variables
  const requiredEnvVars = [
    'OPENROUTER_API_KEY',
    'GEMINI_MODEL',
    'OPENROUTER_BASE_URL'
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`❌ Missing required environment variable: ${envVar}`);
      return false;
    }
  }

  console.log('✅ Configuration validation passed');
  return true;
}

export async function createTestProjectStructure(projectId: string): Promise<void> {
  const outputDir = getVibeTaskManagerOutputDir();
  const projectDir = path.join(outputDir, 'projects', projectId);
  
  await fs.mkdir(projectDir, { recursive: true });
  
  // Create subdirectories
  const subdirs = ['tasks', 'agents', 'outputs', 'logs', 'metrics'];
  for (const subdir of subdirs) {
    await fs.mkdir(path.join(projectDir, subdir), { recursive: true });
  }
}

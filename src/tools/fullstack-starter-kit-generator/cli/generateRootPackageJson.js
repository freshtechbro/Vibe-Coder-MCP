/**
 * import { writeFileSafe } from './utils/fileWriter.js';
 */
import path from 'path';

/**
 * Generate the root package.json file for the monorepo
 * @param {Object} options Configuration options
 * @returns {Promise<void>}
 */
export async function generateRootPackageJson(options) {
  /*
  const { outputDir, force = false, dryRun = false } = options;

  const rootPackageJson = {
    name: options.name || 'fullstack-monorepo',
    version: '0.1.0',
    private: true,
    workspaces: [
      'apps/*',
      'packages/*'
    ],
    scripts: {
      dev: 'turbo run dev',
      build: 'turbo run build',
      start: 'turbo run start',
      lint: 'turbo run lint',
      test: 'turbo run test'
    }
  };

  const rootPackagePath = path.join(outputDir, 'package.json');
  await writeFileSafe(rootPackagePath, JSON.stringify(rootPackageJson, null, 2), { force, dryRun });
  */
  console.warn('Root package.json generation logic removed from CLI.');
}

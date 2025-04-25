/**
 * import { writeFileSafe } from './utils/fileWriter.js';
 */
import path from 'path';

/**
 * Generate package.json configurations for each workspace package
 * @param {Object} options Configuration options
 * @returns {Promise<Object>} Map of file paths to their contents
 */
export async function generatePackageConfigs(options) {
  /*
  const { outputDir, force = false, dryRun = false } = options;

  // Base package.json for frontend
  const frontendPackageJson = {
    name: '@project/frontend',
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint'
    }
  };

  // Base package.json for backend
  const backendPackageJson = {
    name: '@project/backend',
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'nodemon src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js',
      lint: 'eslint .'
    }
  };

  // Write the package.json files
  const frontendPath = path.join(outputDir, 'apps/frontend/package.json');
  const backendPath = path.join(outputDir, 'apps/backend/package.json');

  await writeFileSafe(frontendPath, JSON.stringify(frontendPackageJson, null, 2), { force, dryRun });
  await writeFileSafe(backendPath, JSON.stringify(backendPackageJson, null, 2), { force, dryRun });

  return {
    [frontendPath]: JSON.stringify(frontendPackageJson, null, 2),
    [backendPath]: JSON.stringify(backendPackageJson, null, 2)
  };
  */
  console.warn('Package config generation logic removed from CLI.');
  return {}; // Return empty object as file writing is removed
}

// directoryStructure.js
// Centralized definition of the default output directory structure
// for the Fullstack Starter Kit Generator CLI.
// This structure follows typical monorepo conventions with root-level files,
// an 'apps' folder for applications, and a 'packages' folder for shared libraries.

import path from 'path';

/**
 * The immutable default monorepo structure definition.
 * This is a template, not used directly for generation.
 */
export const DEFAULT_MONOREPO_STRUCTURE = Object.freeze({
  root: {
    files: [
      'package.json',
      'pnpm-workspace.yaml',
      'turbo.json',
      '.npmrc',
      'README.md',
      '.gitignore',
      // Add other root files as needed
    ],
    folders: {
      apps: {
        path: 'apps',
        description: 'Application projects (e.g., frontend, backend)',
        children: {
          // Placeholder for app-specific folders/files if needed
        },
      },
      packages: {
        path: 'packages',
        description: 'Reusable packages (UI components, utils, etc.)',
        children: {
          // Placeholder for package-specific folders/files if needed
        },
      },
    },
  },
});

/**
 * Deep clone a directory structure object, prefixing all folder paths with outputDir.
 * @param {string} outputDir - Absolute path to the output directory root.
 * @returns {object} - Cloned directory structure with updated paths.
 */
export function getMonorepoStructure(outputDir) {
  const clone = JSON.parse(JSON.stringify(DEFAULT_MONOREPO_STRUCTURE));

  // Prefix root-level folder paths with outputDir
  for (const folderKey of Object.keys(clone.root.folders)) {
    const folder = clone.root.folders[folderKey];
    folder.path = path.join(outputDir, folder.path);
  }

  // Optionally, prefix root files if needed (usually just filenames, so leave as-is)
  // If root files should be absolute, uncomment below:
  // clone.root.files = clone.root.files.map(f => path.join(outputDir, f));

  return clone;
}

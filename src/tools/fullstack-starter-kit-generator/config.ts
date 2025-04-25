import path from 'path';
import { fileURLToPath } from 'url';

// Calculate the directory name of the current module (config.ts)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * The absolute path to the templates directory.
 * Resolved relative to this config file to ensure it works correctly
 * regardless of where the tool is invoked from.
 */
export const TEMPLATES_DIR = path.resolve(__dirname, 'templates');

/**
 * Available base templates for the `init` command.
 */
export const AVAILABLE_TEMPLATES: ReadonlyArray<string> = [
  'next-express',
  'react-nest',
  'vue-fastapi',
  'monorepo-base', // Added the implicit default here
];

/**
 * Default template to use for the `init` command if none is specified.
 */
export const DEFAULT_INIT_TEMPLATE = 'monorepo-base';

/**
 * Available features that can be selected during initialization.
 */
export const AVAILABLE_FEATURES: ReadonlyArray<string> = [
  'auth',
  'api',
  'database',
  'testing',
];

/**
 * Available package types for the `add-package` command.
 */
export const AVAILABLE_PACKAGE_TYPES: ReadonlyArray<string> = [
  'frontend',
  'backend',
  'library',
];

/**
 * Default directories to create for packages if none are specified during init.
 * Note: This might need adjustment based on how templates actually use package info.
 * Keeping it simple for now as per the original logic found.
 */
export const DEFAULT_PACKAGES_DIRECTORIES: ReadonlyArray<string> = [
  'apps',
  'packages',
];

// Add other configuration constants as needed...

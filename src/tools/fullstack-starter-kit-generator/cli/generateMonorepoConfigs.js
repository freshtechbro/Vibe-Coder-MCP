/**
 * import { writeFileSafe } from './utils/fileWriter.js';
 */
import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { fillTemplate } from './templateFiller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate and write monorepo config files:
 * - .npmrc (enforces pnpm version)
 * - pnpm-workspace.yaml (workspace globs)
 * - turbo.json (TurboRepo pipeline)
 *
 * @param {Object} options
 * @param {string} options.outputDir - Root output directory.
 * @param {boolean} options.force - Overwrite existing files if true.
 * @returns {Promise<void>}
 */
export async function generateMonorepoConfigs({ outputDir, force = false }) {
  /*
  if (!outputDir || typeof outputDir !== 'string') {
    throw new TypeError('outputDir is required and must be a string');
  }

  // Load template contents synchronously (small files, local)
  const templatesDir = path.join(__dirname, 'templates');

  const npmrcTemplate = await fs.readFile(path.join(templatesDir, '.npmrc'), 'utf8');
  const pnpmWorkspaceTemplate = await fs.readFile(path.join(templatesDir, 'pnpm-workspace.yaml'), 'utf8');
  const turboJsonTemplate = await fs.readFile(path.join(templatesDir, 'turbo.json'), 'utf8');

  // Prepare minimal data for filling
  const data = {
    pnpmVersion: 'latest' // Use latest stable pnpm version as per user instruction
  };

  // Fill templates
  const filledNpmrc = fillTemplate(npmrcTemplate, data);
  const filledPnpmWorkspace = fillTemplate(pnpmWorkspaceTemplate, data); // no placeholders, but safe
  const filledTurboJson = fillTemplate(turboJsonTemplate, data); // no placeholders, but safe

  // Write files individually using writeFileSafe
  await writeFileSafe(path.join(outputDir, '.npmrc'), filledNpmrc, { force });
  await writeFileSafe(path.join(outputDir, 'pnpm-workspace.yaml'), filledPnpmWorkspace, { force });
  await writeFileSafe(path.join(outputDir, 'turbo.json'), filledTurboJson, { force });
  */
  console.warn('Monorepo config generation logic removed from CLI.');
}

// Removed duplicated functions generatePnpmWorkspaceConfig and generateTurboConfig

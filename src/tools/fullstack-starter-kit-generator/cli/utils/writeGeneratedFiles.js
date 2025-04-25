import fs from 'fs/promises';
import path from 'path';

import { writeGeneratedFile } from './writeGeneratedFile.js';

/**
 * Write multiple files to disk, creating directories as needed.
 * @param {Object.<string, string>} files - Map of relative paths to file contents
 * @param {string} outputDir - Base directory to write files to
 * @param {boolean} [force=false] - Whether to overwrite existing files
 * @param {boolean} [dryRun=false] - Whether to simulate writing
 * @returns {Promise<void>}
 */
export async function writeGeneratedFiles(
  files,
  outputDir,
  force = false,
  dryRun = false
) {
  // Ensure output directory exists
  if (!dryRun) {
    await fs.mkdir(outputDir, { recursive: true });
  }

  // Write each file
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(outputDir, relativePath);
    const dirPath = path.dirname(fullPath);

    // Create directory if it doesn't exist
    if (!dryRun) {
      await fs.mkdir(dirPath, { recursive: true });
    }

    // Write the file
    await writeGeneratedFile(fullPath, content, { force, dryRun });
  }
}

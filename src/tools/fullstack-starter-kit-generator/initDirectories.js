import fs from 'fs';
import path from 'path';

/**
 * Initialize directory structure for the project
 * @param {string} rootDir - Root directory path
 * @param {object} structure - Directory structure object
 * @returns {Promise<void>}
 */
export async function initDirectories(rootDir, structure) {
  try {
    await createDirectoryStructure(rootDir, structure);
  } catch (error) {
    throw new Error(`Failed to initialize directories: ${error.message}`);
  }
}

/**
 * Recursively create directory structure
 * @param {string} currentPath - Current directory path
 * @param {object} structure - Directory structure object
 * @returns {Promise<void>}
 */
async function createDirectoryStructure(currentPath, structure) {
  if (!fs.existsSync(currentPath)) {
    await fs.promises.mkdir(currentPath, { recursive: true });
  }

  for (const [name, content] of Object.entries(structure)) {
    const itemPath = path.join(currentPath, name);
    if (typeof content === 'object' && content !== null) {
      await createDirectoryStructure(itemPath, content);
    }
  }
}

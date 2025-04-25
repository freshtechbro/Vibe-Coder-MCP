const fs = require('fs-extra');
const path = require('path');
// Correct path to the compiled logger JS file
const logger = require('../../build/logger.js');

// Helper function to get the base output directory
function getBaseOutputDir() {
  // Use the directory where the script is located as the base for relative paths
  const scriptDir = __dirname;
  const defaultOutputDir = path.resolve(
    scriptDir,
    '../../../workflow-agent-files'
  ); // Go up three levels from tools/generator to vibe-coder-mcp root

  return process.env.VIBE_CODER_OUTPUT_DIR
    ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
    : defaultOutputDir;
}

// Initialize directories if they don't exist
async function initDirectories() {
  const baseOutputDir = getBaseOutputDir();
  const toolDir = path.join(baseOutputDir, 'fullstack-starter-kit-generator');
  try {
    await fs.ensureDir(baseOutputDir); // Ensure base directory exists
    await fs.ensureDir(toolDir); // Ensure tool-specific directory exists
    // Use a simple console log if logger fails, to avoid crashing the script entirely
    if (logger && typeof logger.debug === 'function') {
      // Corrected: Use &&
      logger.debug(`Ensured starter kit directory exists: ${toolDir}`);
    } else {
      console.log(`[DEBUG] Ensured starter kit directory exists: ${toolDir}`);
    }
  } catch (error) {
    if (logger && typeof logger.error === 'function') {
      // Corrected: Use &&
      logger.error(
        { err: error, path: baseOutputDir },
        `Failed to ensure base output directory exists for fullstack-starter-kit-generator.`
      );
    } else {
      console.error(
        `[ERROR] Failed to ensure base output directory exists for fullstack-starter-kit-generator. Path: ${baseOutputDir}`,
        error
      );
    }
  }
}

// Execute the initialization
initDirectories().catch((err) => {
  // Fallback console error if logger itself failed or initDirectories threw before logger could be used
  console.error('Error during directory initialization:', err);
  process.exit(1); // Exit with error code if initialization fails
});

import fs from 'fs/promises';
import path from 'path';

/**
 * Validate a package.json file
 * @param {string} filePath - Path to the package.json file
 * @returns {Promise<boolean>} - True if valid, throws error if invalid
 */
export async function validatePackageJson(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  let packageJson;

  try {
    packageJson = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${path.basename(filePath)}: ${error.message}`
    );
  }

  // Required fields
  const requiredFields = ['name', 'version'];
  for (const field of requiredFields) {
    if (!packageJson[field]) {
      throw new Error(
        `Missing required field '${field}' in ${path.basename(filePath)}`
      );
    }
  }

  // Name validation
  if (typeof packageJson.name !== 'string') {
    throw new Error(`'name' must be a string in ${path.basename(filePath)}`);
  }
  if (
    !packageJson.name.match(
      /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
    )
  ) {
    throw new Error(
      `Invalid package name '${packageJson.name}' in ${path.basename(filePath)}`
    );
  }

  // Version validation
  if (typeof packageJson.version !== 'string') {
    throw new Error(`'version' must be a string in ${path.basename(filePath)}`);
  }
  if (
    !packageJson.version.match(
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+)?$/
    )
  ) {
    throw new Error(
      `Invalid version '${packageJson.version}' in ${path.basename(filePath)}`
    );
  }

  return true;
}

import fs from 'fs/promises';
import path from 'path';

import chalk from 'chalk';
/**
 * import { writeFileSafe } from './fileWriter.js';
 */

/**
 * Reads package.json files for specified packages, merges dependencies,
 * and writes the updated files back.
 *
 * @param {object} options - CLI options object.
 * @param {string} options.outputDir - The root output directory.
 * @param {object} options.dependencies - Object containing dependency definitions.
 * @param {object} options.dependencies.npm - NPM dependency definitions keyed by package name.
 * @param {boolean} [options.force=false] - Whether to force overwrite existing files.
 * @param {boolean} [options.dryRun=false] - Whether to perform a dry run.
 * @returns {Promise<void>}
 */
export async function injectDependenciesIntoPackages(options) {
  const {
    outputDir: resolvedOutputDir,
    dependencies,
    force = false,
    dryRun = false,
  } = options;

  if (!dependencies || !dependencies.npm) {
    console.warn(
      chalk.yellow(
        '⚠️ No NPM dependencies found in options. Skipping dependency injection.'
      )
    );
    return;
  }

  console.log(
    chalk.blue.bold(
      '\n🔗 Starting: Injecting dependencies into package.json files...'
    )
  );

  // Determine package location (simple heuristic for now, might need refinement)
  const getPackagePath = (pkgKey) => {
    // Basic check: if 'ui' or 'web' in name, assume 'apps', else 'packages'
    // This needs to be aligned with the actual directory structure logic
    const workspaceDir = [
      'ui',
      'web',
      'frontend',
      'backend',
      'server',
      'client',
    ].some((prefix) => pkgKey.startsWith(prefix))
      ? 'apps'
      : 'packages';
    return path.join(resolvedOutputDir, workspaceDir, pkgKey, 'package.json');
  };

  let successCount = 0;
  let errorCount = 0;

  for (const packageKey of Object.keys(dependencies.npm)) {
    if (packageKey === 'root') continue; // Skip the root key

    const packageJsonPath = getPackagePath(packageKey);
    let packageJsonData;

    try {
      // Read existing package.json
      if (!dryRun) {
        // Avoid reading if dryRun, as file might not exist yet in reality
        try {
          const fileContent = await fs.readFile(packageJsonPath, 'utf-8');
          packageJsonData = JSON.parse(fileContent);
        } catch (readError) {
          if (readError.code === 'ENOENT') {
            console.error(
              chalk.red(
                `❌ Error: package.json not found for '${packageKey}' at ${packageJsonPath}. Cannot inject dependencies.`
              )
            );
            errorCount++;
            continue; // Skip this package
          }
          throw readError; // Re-throw other read errors
        }
      } else {
        // For dry run, create a minimal placeholder object
        packageJsonData = { name: packageKey, version: '0.0.0' };
        console.log(
          chalk.yellow(`DRY RUN: Would read package.json for ${packageKey}`)
        );
      }

      // Merge dependencies
      const newDeps = dependencies.npm[packageKey];
      packageJsonData.dependencies = {
        ...(packageJsonData.dependencies || {}), // Ensure exists
        ...(newDeps.dependencies || {}),
      };
      packageJsonData.devDependencies = {
        ...(packageJsonData.devDependencies || {}), // Ensure exists
        ...(newDeps.devDependencies || {}),
      };

      // Stringify updated JSON
      const updatedJsonString = JSON.stringify(packageJsonData, null, 2);

      // Write updated content back using writeFileSafe
      // writeFileSafe handles its own dryRun logic and logging
      await writeFileSafe(packageJsonPath, updatedJsonString, {
        force,
        dryRun,
      });
      if (!dryRun) {
        // Only count success if not a dry run (writeFileSafe logs success/skip)
        successCount++;
      }
    } catch (error) {
      console.error(
        chalk.red(`❌ Error processing dependencies for '${packageKey}':`),
        error
      );
      errorCount++;
      // Decide if we should halt execution on error
      // For now, continue processing other packages
    }
  }

  if (errorCount > 0) {
    console.log(
      chalk.red(
        `\n❌ Completed dependency injection with ${errorCount} error(s).`
      )
    );
    // Optionally throw an error here to halt the entire CLI process
    // throw new Error('Dependency injection failed for one or more packages.');
  } else if (!dryRun) {
    console.log(
      chalk.green(
        `\n✅ Completed: Successfully injected dependencies for ${successCount} package(s).`
      )
    );
  } else {
    console.log(
      chalk.yellow.bold(`\nDRY RUN: Dependency injection simulation complete.`)
    );
  }
}

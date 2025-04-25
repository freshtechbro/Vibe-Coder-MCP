#!/usr/bin/env node

import chalk from 'chalk';
import { Command } from 'commander';

import { generateDocs } from './generateDocs.js';
import { generateMonorepoConfigs } from './generateMonorepoConfigs.js';
import { generatePackageConfigs } from './generatePackageConfigs.js';
import { generateRootPackageJson } from './generateRootPackageJson.js';

const program = new Command();

program
  .name('fullstack-starter-kit-generator')
  .description('Generate a fullstack monorepo starter kit')
  .version('0.1.0')
  .option('-o, --output <dir>', 'Output directory', process.cwd())
  .option('-f, --force', 'Overwrite existing files', false)
  .option(
    '-d, --dry-run',
    'Show what would be generated without writing files',
    false
  )
  .option('-n, --name <name>', 'Project name', 'fullstack-monorepo')
  .option('-l, --license <license>', 'License type', 'MIT')
  .option(
    '-desc, --description <desc>',
    'Project description',
    'A fullstack monorepo project'
  );

async function main() {
  const options = program.opts();

  try {
    console.log('Generating fullstack monorepo starter kit...');

    // Generate monorepo configs
    await generateMonorepoConfigs({
      outputDir: options.output,
      force: options.force,
      dryRun: options.dryRun,
    });

    // Generate package configs
    await generatePackageConfigs({
      outputDir: options.output,
      force: options.force,
      dryRun: options.dryRun,
    });

    // Generate root package.json
    await generateRootPackageJson({
      outputDir: options.output,
      name: options.name,
      force: options.force,
      dryRun: options.dryRun,
    });

    // Generate documentation
    await generateDocs({
      outputDir: options.output,
      data: {
        projectName: options.name,
        description: options.description,
        license: options.license,
      },
      force: options.force,
      dryRun: options.dryRun,
    });

    console.log('Fullstack monorepo starter kit generated successfully!');
  } catch (error) {
    console.error('Error generating starter kit:', error.message);
    // Rethrow the error for the test environment to catch if needed
    throw error;
  }
}

// Export program and main for testing or direct execution
export { program, main };

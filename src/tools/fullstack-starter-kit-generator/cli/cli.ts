#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';

import logger from '../../../logger.js';
import {
  AVAILABLE_TEMPLATES,
  AVAILABLE_FEATURES,
  AVAILABLE_PACKAGE_TYPES,
} from '../config.js'; // Import from config
import { loadTemplate } from '../templates/template-loader.js';
import { generateTemplate } from '../templates/template-system.js';

import {
  initHandler,
  addPackageHandler,
  setupFrontendHandler,
  setupBackendHandler,
} from './main.js';
import { InitOptions, PackageOptions } from './types.js';

const program = new Command();

program
  .name('fullstack-starter-kit')
  .description('CLI for generating fullstack starter kits')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a new fullstack project')
  .action(async () => {
    try {
      const answers = await inquirer.prompt<InitOptions>({
        name: 'name',
        type: 'input',
        message: 'Project name:',
        validate: (input: string) => input.length > 0,
      });

      const moreAnswers = await inquirer.prompt<Partial<InitOptions>>([
        {
          name: 'description',
          type: 'input',
          message: 'Project description:',
        },
        {
          name: 'template',
          type: 'list',
          message: 'Select a template:',
          choices: AVAILABLE_TEMPLATES, // Use centralized list
        },
        {
          name: 'features',
          type: 'checkbox',
          message: 'Select features:',
          choices: AVAILABLE_FEATURES, // Use centralized list
        },
        {
          name: 'packages',
          type: 'input',
          message: 'Additional packages (comma-separated):',
          filter: (input: string) => input.split(',').map((f) => f.trim()),
        },
      ]);

      await initHandler({ ...answers, ...moreAnswers } as InitOptions);
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize project');
      process.exit(1);
    }
  });

program
  .command('add-package')
  .description('Add a new package to the workspace')
  .action(async () => {
    try {
      const answers = await inquirer.prompt<PackageOptions>({
        name: 'name',
        type: 'input',
        message: 'Package name:',
        validate: (input: string) => input.length > 0,
      });

      const moreAnswers = await inquirer.prompt<Partial<PackageOptions>>([
        {
          name: 'type',
          type: 'list',
          message: 'Package type:',
          choices: AVAILABLE_PACKAGE_TYPES, // Use centralized list
        },
        {
          name: 'path',
          type: 'input',
          message: 'Package path:',
          default: `packages/${answers.name}`,
        },
      ]);

      await addPackageHandler({ ...answers, ...moreAnswers } as PackageOptions);
    } catch (error) {
      logger.error({ err: error }, 'Failed to add package');
      process.exit(1);
    }
  });

program.parse(process.argv);

// Export the program for testing
export { program };

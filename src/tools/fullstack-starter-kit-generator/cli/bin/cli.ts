#!/usr/bin/env node
import { Command } from 'commander';

import logger from '../../../../logger.js';
import {
  initHandler,
  addPackageHandler,
  setupFrontendHandler,
  setupBackendHandler,
} from '../main.js';

const program = new Command();

program
  .name('fullstack-starter-kit')
  .description('CLI to create and manage fullstack monorepo projects')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a new fullstack project')
  .requiredOption('--name <name>', 'Project name')
  .option(
    '--template <template>',
    'Project template (basic, next-express, next-nest)'
  )
  .option('--description <description>', 'Project description')
  .option('--author <author>', 'Project author')
  .option('--pnpm-version <version>', 'PNPM version', '8.0.0')
  .option('--no-turbo', 'Disable TurboRepo')
  .action(async (options) => {
    try {
      await initHandler(options);
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize project');
      process.exit(1);
    }
  });

program
  .command('add-package')
  .description('Add a new package to the workspace')
  .requiredOption('--name <name>', 'Package name')
  .requiredOption('--type <type>', 'Package type (frontend, backend, library)')
  .option('--path <path>', 'Package path (relative to workspace root)')
  .action(async (options) => {
    try {
      await addPackageHandler(options);
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Failed to add package');
      process.exit(1);
    }
  });

program
  .command('setup-frontend')
  .description('Setup a frontend package')
  .requiredOption('--name <name>', 'Package name')
  .requiredOption(
    '--framework <framework>',
    'Frontend framework (next, vite, remix)'
  )
  .requiredOption('--framework-version <version>', 'Framework version')
  .option(
    '--styling <framework>',
    'Styling framework (tailwind, styled-components, emotion)'
  )
  .option('--styling-version <version>', 'Styling framework version')
  .action(async (options) => {
    try {
      // Transform CLI options to match handler schema
      const params = {
        name: options.name,
        framework: {
          name: options.framework,
          version: options.frameworkVersion,
        },
        ...(options.styling && {
          styling: {
            framework: options.styling,
            version: options.stylingVersion,
          },
        }),
      };
      await setupFrontendHandler(params);
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Failed to setup frontend');
      process.exit(1);
    }
  });

program
  .command('setup-backend')
  .description('Setup a backend package')
  .requiredOption('--name <name>', 'Package name')
  .requiredOption(
    '--framework <framework>',
    'Backend framework (express, nest, fastify)'
  )
  .requiredOption('--framework-version <version>', 'Framework version')
  .option('--database <type>', 'Database type (postgresql, mysql, mongodb)')
  .option('--database-version <version>', 'Database version')
  .option('--orm <name>', 'ORM (prisma, typeorm, sequelize)')
  .option('--orm-version <version>', 'ORM version')
  .action(async (options) => {
    try {
      // Transform CLI options to match handler schema
      const params = {
        name: options.name,
        framework: {
          name: options.framework,
          version: options.frameworkVersion,
        },
        ...(options.database && {
          database: {
            type: options.database,
            version: options.databaseVersion,
          },
        }),
        ...(options.orm && {
          orm: {
            name: options.orm,
            version: options.ormVersion,
          },
        }),
      };
      await setupBackendHandler(params);
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Failed to setup backend');
      process.exit(1);
    }
  });

// Add global error handling
process.on('unhandledRejection', (error) => {
  logger.error({ err: error }, 'Unhandled rejection');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught exception');
  process.exit(1);
});

program.parse();

import path from 'path';

import logger from '../../../logger.js';
import {
  TEMPLATES_DIR,
  DEFAULT_INIT_TEMPLATE,
  DEFAULT_PACKAGES_DIRECTORIES,
} from '../config.js'; // Import from config
import { CommandExecutor } from '../services/command-executor.js'; // Corrected relative path
import {
  FileGenerator,
  GenerationProgress,
} from '../services/file-generator.js'; // Corrected type name
import { TemplateRegistry } from '../templates/template-registry.js'; // Kept .js as it's a JS file

import type {
  InitOptions,
  PackageOptions,
  FrontendOptions,
  BackendOptions,
} from './types.js';
import { validateWorkspaceConfig } from './validation/validator.js';
import { WorkspaceManager } from './workspace/workspaceManager.js';

type ContextOptions = { sessionId: string };

export async function initHandler(
  options: InitOptions,
  context?: ContextOptions
): Promise<void> {
  try {
    // Convert options to record
    const configRecord: Record<string, unknown> = {
      ...options,
      [Symbol.iterator]: function* () {
        yield* Object.entries(this);
      },
    };

    // Validate workspace configuration
    try {
      await validateWorkspaceConfig(process.cwd(), options.packages || []);
    } catch (error) {
      throw new Error(
        `Invalid configuration: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Initialize workspace using services
    const outputDir = process.cwd(); // Assuming init operates in the current directory
    const sessionId = context?.sessionId;

    logger.info({ sessionId }, `Initializing workspace in: ${outputDir}`);

    // Instantiate services
    const fileGenerator = new FileGenerator(
      { outputDir },
      (progress: GenerationProgress) =>
        logger.info({ sessionId }, `File generation: ${progress.message}`) // Corrected type name
    );
    const commandExecutor = new CommandExecutor({ cwd: outputDir });

    // Load template registry and template (assuming a base template for init)
    // Use centralized template directory path
    const templateRegistry = TemplateRegistry.getInstance(TEMPLATES_DIR);
    // Use default from config if not provided
    const initTemplateName = options.template || DEFAULT_INIT_TEMPLATE;
    const templateObject = await templateRegistry.getTemplate(initTemplateName);

    if (!templateObject) {
      throw new Error(
        `Initialization template "${initTemplateName}" not found at ${TEMPLATES_DIR}.`
      );
    }

    // Prepare template data (adapt based on actual InitOptions)
    // Assuming options has 'name', 'description', 'packages' based on previous context/common usage
    const templateData = {
      name: options.name || 'my-monorepo', // Keep simple fallback
      description:
        options.description ||
        `Generated monorepo: ${options.name || 'my-monorepo'}`, // Keep simple fallback
      packages: options.packages || DEFAULT_PACKAGES_DIRECTORIES, // Use default from config
      // Add other necessary data from options if they exist
      ...(options.features && { features: options.features }),
    };

    // Generate initial files
    logger.info(
      { sessionId },
      `Generating initial workspace files using template: ${initTemplateName}`
    );
    await fileGenerator.generateFiles(templateObject, templateData);
    logger.info({ sessionId }, 'Initial workspace files generated.');

    // Run post-generation commands (e.g., npm install)
    logger.info({ sessionId }, 'Running initial npm install...');
    await commandExecutor.execute('npm install');
    logger.info({ sessionId }, 'Initial npm install completed.');

    logger.info(
      { sessionId },
      'Workspace initialization completed successfully.'
    );
  } catch (error) {
    logger.error(
      { err: error, sessionId: context?.sessionId },
      'Failed to initialize workspace'
    );
    throw error;
  }
}

export async function addPackageHandler(
  options: PackageOptions,
  context?: ContextOptions
): Promise<void> {
  try {
    // Add package using services
    const workspaceRoot = process.cwd();
    const sessionId = context?.sessionId;
    // Use the 'path' property from PackageOptions directly
    const packagePath = path.resolve(workspaceRoot, options.path); // Resolve path relative to workspace root

    logger.info(
      { sessionId },
      `Adding package '${options.name}' to path: ${packagePath}`
    );

    // Instantiate services
    const fileGenerator = new FileGenerator(
      { outputDir: packagePath },
      (progress: GenerationProgress) =>
        logger.info(
          { sessionId },
          `File generation for ${options.name}: ${progress.message}`
        ) // Corrected type name
    );
    // Run npm install from the workspace root
    const commandExecutor = new CommandExecutor({ cwd: workspaceRoot });

    // Load template registry and template
    const templateRegistry = TemplateRegistry.getInstance(TEMPLATES_DIR);
    // Infer template name from package type
    const templateName = `${options.type}-base`; // e.g., 'frontend-base', 'backend-base', 'library-base'
    logger.info(
      { sessionId },
      `Using inferred template: ${templateName} based on type: ${options.type}`
    );

    const templateObject = await templateRegistry.getTemplate(templateName);

    if (!templateObject) {
      throw new Error(
        `Package template "${templateName}" not found at ${TEMPLATES_DIR}.`
      );
    }

    // Prepare template data using actual PackageOptions properties
    const templateData = {
      name: options.name,
      version: options.version,
      type: options.type,
      dependencies: options.dependencies || {},
      devDependencies: options.devDependencies || {},
      // Add any other relevant data expected by the specific package template
    };

    // Generate package files
    logger.info(
      { sessionId },
      `Generating package files for '${options.name}' using template: ${templateName}`
    );
    await fileGenerator.generateFiles(templateObject, templateData);
    logger.info(
      { sessionId },
      `Package files for '${options.name}' generated.`
    );

    // Run npm install to link the new package
    logger.info({ sessionId }, 'Running npm install to update workspace...');
    await commandExecutor.execute('npm install');
    logger.info({ sessionId }, 'Workspace updated.');

    logger.info({ sessionId }, `Package '${options.name}' added successfully.`);
  } catch (error) {
    logger.error(
      { err: error, sessionId: context?.sessionId },
      `Failed to add package '${options.name}'`
    );
    throw error;
  }
}

export async function setupFrontendHandler(
  options: FrontendOptions,
  context?: ContextOptions
): Promise<void> {
  try {
    logger.info(
      { sessionId: context?.sessionId },
      'Frontend setup not implemented yet'
    );
  } catch (error) {
    logger.error(
      { err: error, sessionId: context?.sessionId },
      'Failed to setup frontend'
    );
    throw error;
  }
}

export async function setupBackendHandler(
  options: BackendOptions,
  context?: ContextOptions
): Promise<void> {
  try {
    logger.info(
      { sessionId: context?.sessionId },
      'Backend setup not implemented yet'
    );
    logger.info(
      { sessionId: context?.sessionId },
      'Backend setup not implemented yet'
    );
  } catch (error) {
    logger.error(
      { err: error, sessionId: context?.sessionId },
      'Failed to setup backend'
    );
    throw error;
  }
}

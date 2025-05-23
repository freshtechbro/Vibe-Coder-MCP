import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import logger from '../../logger.js';
import { StarterKitDefinition, FileStructureItem, fileStructureItemSchema } from './schema.js';
import { AppError, ParsingError, ConfigurationError, ToolExecutionError } from '../../utils/errors.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { performDirectLlmCall, normalizeJsonResponse } from '../../utils/llmHelper.js';
import { z } from 'zod';

// Get the directory name equivalent to __dirname in CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define structure for a loaded and parsed YAML module
export interface ParsedYamlModule {
  moduleName: string;
  description?: string;
  type?: string; // e.g., frontend, backend, database, auth
  placeholders?: string[];
  provides: {
    techStack?: Record<string, { name: string; version?: string; rationale: string }>;
    directoryStructure?: FileStructureItem[];
    dependencies?: StarterKitDefinition['dependencies'];
    setupCommands?: { context?: string; command: string }[];
  };
  _sourcePath?: string; // Internal, not generated by LLM but added after loading/generation
}

// Zod schema for ParsedYamlModule (for validating LLM output)
// Note: FileStructureItem is recursive, so we use its exported schema.
const parsedYamlModuleSchema = z.object({
  moduleName: z.string().min(1),
  description: z.string().optional(),
  type: z.string().optional(),
  placeholders: z.array(z.string()).optional(),
  provides: z.object({
    techStack: z.record(z.object({
      name: z.string(),
      version: z.string().optional(),
      rationale: z.string(),
    })).optional(),
    directoryStructure: z.array(fileStructureItemSchema).optional(),
    dependencies: z.object({
      npm: z.object({
        root: z.object({
          dependencies: z.record(z.string()).optional(),
          devDependencies: z.record(z.string()).optional(),
        }).optional(),
      }).catchall(z.object({
        dependencies: z.record(z.string()).optional(),
        devDependencies: z.record(z.string()).optional(),
      })).optional(),
    }).optional(),
    setupCommands: z.array(z.object({
      context: z.string().optional(),
      command: z.string(),
    })).optional(),
  }),
});

// Parameters to customize selected modules
interface ModuleParameters {
  [placeholderKey: string]: string | number | boolean;
}

export class YAMLComposer {
  private baseTemplatePath: string;
  private config: OpenRouterConfig;
  private generatedTemplateCache: Map<string, ParsedYamlModule> = new Map();

  constructor(config: OpenRouterConfig, baseTemplatePath: string = path.join(__dirname, 'templates')) {
    this.baseTemplatePath = baseTemplatePath;
    this.config = config;
  }

  private async generateTemplateWithLLM(category: string, technology: string, modulePathSegment: string): Promise<string> {
    const systemPrompt = `You are an expert YAML template generator for a full-stack starter kit.
Your task is to generate a JSON object that represents the structure of a YAML module file.
This JSON object must conform to the ParsedYamlModule TypeScript interface structure provided below.
The generated module is for: Category '${category}', Technology '${technology}'.
The module path segment is '${modulePathSegment}'.

JSON Structure to follow:
{
  "moduleName": "string (e.g., ${technology}-${category})",
  "description": "string (e.g., ${technology} ${category} module for {projectName})",
  "type": "string (e.g., ${category})",
  "placeholders": ["string"], // Optional: e.g., ["projectName", "portNumber"]
  "provides": {
    "techStack": { // Optional
      "uniqueKeyPerStackItem": { "name": "string", "version": "string (optional)", "rationale": "string" }
    },
    "directoryStructure": [ // Optional: Array of FileStructureItem-like objects. Paths are relative to module root.
      // Example: { "path": "src/index.js", "type": "file", "content": "console.log('Hello {projectName}');" },
      // Example: { "path": "src/components/", "type": "directory", "children": [] }
    ],
    "dependencies": { // Optional
      "npm": {
        // e.g., "{frontendPath}": { "dependencies": {"react": "^18.0.0"} }
      }
    },
    "setupCommands": [ // Optional
      // { "context": "{${category}Path}", "command": "npm install" }
    ]
  }
}

IMPORTANT:
- Generate ONLY the raw JSON object. Do NOT use Markdown, code blocks, or any surrounding text.
- Ensure all paths in 'directoryStructure' are relative to the module's own root.
- For 'directoryStructure', a 'file' type should not have a 'children' array. A 'directory' type should have 'content: null'.
- If 'content' for a file is provided, 'generationPrompt' should be null/undefined, and vice-versa.
- Use common placeholders like {projectName}, {backendPort}, {frontendPort}, {frontendPath}, {backendPath} where appropriate.
- Be comprehensive but sensible for a starter module of type '${category}' using '${technology}'.
- Example: "dependencies": { "npm": { "{frontendPath}": { "dependencies": {"react": "^18.0.0"} } } }
- If the module is self-contained, dependencies might be under "root":
  "dependencies": { "npm": { "root": { "devDependencies": {"husky": "^8.0.0"} } } }

Generate the JSON for '${modulePathSegment}':`;

    const userPrompt = `Generate the JSON representation for a YAML module.
Category: ${category}
Technology: ${technology}
Module Path Segment: ${modulePathSegment}

Consider typical files, dependencies, and configurations for this type of module.
For example, if it's a 'nodejs-express' backend, include basic Express setup, a sample route, package.json, tsconfig.json.
If it's a 'react-vite' frontend, include basic React/Vite setup, sample components, package.json, vite.config.ts.
Provide a sensible set of placeholders if needed (e.g. "{projectName}", "{backendPort}").
Ensure the output is a single, raw JSON object without any other text or formatting.`;

    try {
      logger.info(`Requesting LLM to generate template for: ${modulePathSegment}`);
      const rawResponse = await performDirectLlmCall(
        userPrompt,
        systemPrompt,
        this.config,
        'fullstack_starter_kit_dynamic_yaml_module_generation',
        0.2
      );
      logger.debug({ modulePathSegment, rawResponseFromLLM: rawResponse }, "Raw LLM response for dynamic template");
      return rawResponse;
    } catch (error) {
      logger.error({ err: error, modulePathSegment }, `LLM call failed during dynamic template generation for ${modulePathSegment}`);
      throw new ToolExecutionError(`LLM failed to generate template for ${modulePathSegment}: ${(error as Error).message}`, undefined, error instanceof Error ? error : undefined);
    }
  }

  private async generateDynamicTemplate(modulePathSegment: string): Promise<ParsedYamlModule> {
    logger.info(`Attempting to dynamically generate YAML module: ${modulePathSegment}`);
    const parts = modulePathSegment.split('/');
    const technology = parts.pop() || modulePathSegment;
    const category = parts.join('/') || 'general';

    const llmResponse = await this.generateTemplateWithLLM(category, technology, modulePathSegment);
    const normalizedJson = normalizeJsonResponse(llmResponse, `dynamic-gen-${modulePathSegment}`);

    let parsedJson: Record<string, unknown>;
    try {
      parsedJson = JSON.parse(normalizedJson) as Record<string, unknown>;
    } catch (error) {
      logger.error({ err: error, modulePathSegment, normalizedJson }, `Failed to parse LLM JSON response for ${modulePathSegment}`);
      throw new ParsingError(`Failed to parse dynamically generated template for ${modulePathSegment} as JSON. Normalized response: ${normalizedJson}`, { originalResponse: llmResponse }, error instanceof Error ? error : undefined);
    }

    const validationResult = parsedYamlModuleSchema.safeParse(parsedJson);
    if (!validationResult.success) {
      logger.error({ err: validationResult.error.issues, modulePathSegment, parsedJson }, `Dynamically generated template for ${modulePathSegment} failed Zod validation.`);
      throw new ParsingError(`Dynamically generated template for ${modulePathSegment} failed validation: ${validationResult.error.message}`, { issues: validationResult.error.issues, parsedJson });
    }

    const validatedModule = validationResult.data as ParsedYamlModule;
    validatedModule._sourcePath = path.resolve(this.baseTemplatePath, `${modulePathSegment}.yaml`);

    // Save the generated template to disk as YAML
    try {
      const yamlContent = yaml.dump(validatedModule);
      await fs.ensureDir(path.dirname(validatedModule._sourcePath));
      await fs.writeFile(validatedModule._sourcePath, yamlContent, 'utf-8');
      logger.info(`Successfully saved dynamically generated YAML template to: ${validatedModule._sourcePath}`);
    } catch (error) {
      logger.warn({ err: error, modulePathSegment, filePath: validatedModule._sourcePath }, `Failed to save dynamically generated template for ${modulePathSegment}. Proceeding with in-memory version.`);
    }

    this.generatedTemplateCache.set(modulePathSegment, validatedModule);
    logger.info(`Dynamically generated and cached YAML module: ${modulePathSegment}`);
    return validatedModule;
  }

  public async loadAndParseYamlModule(modulePathSegment: string): Promise<ParsedYamlModule> {
    if (this.generatedTemplateCache.has(modulePathSegment)) {
      logger.debug(`Returning cached YAML module for: ${modulePathSegment}`);
      return this.generatedTemplateCache.get(modulePathSegment)!;
    }

    const fullPath = path.resolve(this.baseTemplatePath, `${modulePathSegment}.yaml`);
    logger.debug(`Attempting to load YAML module from: ${fullPath}`);

    if (await fs.pathExists(fullPath)) {
      logger.info(`Found existing YAML module: ${fullPath}`);
      try {
        const fileContent = await fs.readFile(fullPath, 'utf-8');
        const parsed = yaml.load(fileContent) as Record<string, unknown>;
        const validationResult = parsedYamlModuleSchema.safeParse(parsed);
        if (!validationResult.success) {
          logger.error({ errors: validationResult.error.issues, filePath: fullPath, parsedContent: parsed }, "Loaded YAML module failed schema validation");
          throw new ParsingError(`Invalid YAML module structure in ${fullPath}. Validation failed: ${validationResult.error.message}`, { filePath: fullPath, issues: validationResult.error.issues });
        }
        const validatedModule = validationResult.data as ParsedYamlModule;
        validatedModule._sourcePath = fullPath;
        this.generatedTemplateCache.set(modulePathSegment, validatedModule);
        logger.debug(`Loaded and cached YAML module from disk: ${modulePathSegment}`);
        return validatedModule;
      } catch (error) {
        if (error instanceof AppError) throw error;
        const cause = error instanceof Error ? error : undefined;
        logger.error({ err: error, filePath: fullPath }, `Failed to load or parse existing YAML module ${modulePathSegment}`);
        throw new ParsingError(`Failed to load or parse YAML module ${modulePathSegment} from ${fullPath}: ${(cause as Error)?.message}`, { filePath: fullPath }, cause);
      }
    } else {
      logger.warn(`YAML module template not found on disk: ${fullPath}. Attempting dynamic generation.`);
      try {
        return await this.generateDynamicTemplate(modulePathSegment);
      } catch (generationError) {
        logger.error({ err: generationError, modulePathSegment, filePath: fullPath }, `Dynamic generation failed for YAML module ${modulePathSegment}.`);
        throw new ConfigurationError(
          `YAML module template not found at '${fullPath}' and dynamic generation failed: ${(generationError as Error).message}`,
          { modulePathSegment, originalError: generationError }
        );
      }
    }
  }

  private substitutePlaceholders<T extends object | string | null | undefined>(data: T, params: ModuleParameters): T {
    if (typeof data === 'string') {
      let result: string = data;
      for (const key in params) {
        const placeholder = `{${key}}`;
        result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(params[key]));
      }
      return result as unknown as T;
    }
    if (Array.isArray(data)) {
      return data.map(item => this.substitutePlaceholders(item, params)) as T;
    }
    if (typeof data === 'object' && data !== null) {
      const newData = { ...data } as Record<string, unknown>;
      for (const key in newData) {
        newData[key] = this.substitutePlaceholders(newData[key] as string | object | null | undefined, params);
      }
      return newData as T;
    }
    return data;
  }

  private mergeTechStacks(target: StarterKitDefinition['techStack'], source: ParsedYamlModule['provides']['techStack']): void {
    if (source) {
      for (const key in source) {
        if (target[key] && target[key].name !== source[key].name) {
          logger.warn(`TechStack conflict for component '${key}'. Original: '${target[key].name}', New: '${source[key].name}'. Overwriting with new value from module: ${source[key].name}.`);
        }
        target[key] = { ...source[key] };
      }
    }
  }

  private mergeDirectoryStructures(
    target: FileStructureItem[],
    sourceItems: FileStructureItem[] | undefined,
    moduleKey: string,
    moduleParams: ModuleParameters
  ): void {
    if (!sourceItems) return;

    const moduleRootPath = (moduleParams[moduleKey] as string) || '.';

    const findOrCreateTargetDirectory = (pathSegments: string[], currentLevel: FileStructureItem[]): FileStructureItem[] => {
      if (pathSegments.length === 0) return currentLevel;
      const segment = pathSegments.shift()!;
      let dir = currentLevel.find(i => i.path === segment && i.type === 'directory');
      if (!dir) {
        dir = { path: segment, type: 'directory', content: null, children: [] };
        currentLevel.push(dir);
      }
      if (!dir.children) dir.children = [];
      return dir.children;
    };

    let baseTargetChildren = target;
    if (moduleRootPath && moduleRootPath !== '.') {
      const segments = moduleRootPath.split(path.posix.sep).filter(s => s);
      if (segments.length > 0) {
        baseTargetChildren = findOrCreateTargetDirectory(segments, target);
      }
    }

    sourceItems.forEach(sourceItem => {
      const processedSourceItem = this.substitutePlaceholders(sourceItem, moduleParams);
      const existingIndex = baseTargetChildren.findIndex(t => t.path === processedSourceItem.path);

      if (existingIndex !== -1) {
        const existingItem = baseTargetChildren[existingIndex];
        if (existingItem.type === 'directory' && processedSourceItem.type === 'directory' && processedSourceItem.children) {
          logger.debug(`Merging children for directory: ${processedSourceItem.path} under ${moduleRootPath}`);
          if (!existingItem.children) existingItem.children = [];
          this.mergeDirectoryStructures(existingItem.children, processedSourceItem.children, '.', moduleParams);
        } else {
          logger.warn(`Directory structure conflict for path '${processedSourceItem.path}' under '${moduleRootPath}'. Overwriting with item from module.`);
          baseTargetChildren[existingIndex] = processedSourceItem;
        }
      } else {
        baseTargetChildren.push(processedSourceItem);
      }
    });
  }

  private mergeDependencies(target: StarterKitDefinition['dependencies'], source: ParsedYamlModule['provides']['dependencies']): void {
    if (!source) return;
    if (!target.npm) target.npm = {};

    if (source.npm) {
      for (const packageJsonKeyPlaceholder in source.npm) {
        const resolvedPackageJsonKey = this.substitutePlaceholders(packageJsonKeyPlaceholder, {});
        const sourcePkgConfig = source.npm[packageJsonKeyPlaceholder];
        if (!target.npm[resolvedPackageJsonKey]) {
          target.npm[resolvedPackageJsonKey] = {};
        }
        const targetPkgConfig = target.npm[resolvedPackageJsonKey];
        if (sourcePkgConfig.dependencies) {
          if (!targetPkgConfig.dependencies) targetPkgConfig.dependencies = {};
          Object.assign(targetPkgConfig.dependencies, sourcePkgConfig.dependencies);
        }
        if (sourcePkgConfig.devDependencies) {
          if (!targetPkgConfig.devDependencies) targetPkgConfig.devDependencies = {};
          Object.assign(targetPkgConfig.devDependencies, sourcePkgConfig.devDependencies);
        }
      }
    }
  }

  private mergeSetupCommands(target: StarterKitDefinition['setupCommands'], source: ParsedYamlModule['provides']['setupCommands'], moduleParams: ModuleParameters): void {
    if (source) {
      source.forEach(cmdObj => {
        let command = cmdObj.command;
        const resolvedContext = cmdObj.context ? this.substitutePlaceholders(cmdObj.context, moduleParams) : undefined;
        if (resolvedContext && resolvedContext !== '.') {
          command = `(cd ${resolvedContext} && ${command})`;
        }
        target.push(this.substitutePlaceholders(command, moduleParams));
      });
    }
  }

  public async compose(
    moduleSelections: Array<{ modulePath: string; params: ModuleParameters; moduleKey?: string }>,
    globalParams: ModuleParameters
  ): Promise<StarterKitDefinition> {
    const composedDefinition: StarterKitDefinition = {
      projectName: this.substitutePlaceholders(globalParams.projectName as string || 'my-new-project', globalParams),
      description: this.substitutePlaceholders(globalParams.projectDescription as string || 'A new project.', globalParams),
      techStack: {},
      directoryStructure: [],
      dependencies: { npm: { root: { dependencies: {}, devDependencies: {} } } },
      setupCommands: [],
      nextSteps: [],
    };

    for (const selection of moduleSelections) {
      logger.info(`Processing YAML module: ${selection.modulePath} with params: ${JSON.stringify(selection.params)} and moduleKey: ${selection.moduleKey}`);
      const effectiveParams = { ...globalParams, ...selection.params };
      const module = await this.loadAndParseYamlModule(selection.modulePath);
      const processedModuleProvides = this.substitutePlaceholders(module.provides, effectiveParams);
      this.mergeTechStacks(composedDefinition.techStack, processedModuleProvides.techStack);
      this.mergeDirectoryStructures(
        composedDefinition.directoryStructure,
        processedModuleProvides.directoryStructure,
        selection.moduleKey || 'root',
        effectiveParams
      );
      this.mergeDependencies(composedDefinition.dependencies, this.substitutePlaceholders(processedModuleProvides.dependencies, effectiveParams));
      this.mergeSetupCommands(composedDefinition.setupCommands, processedModuleProvides.setupCommands, effectiveParams);

      if (module.type === 'auth' && module.moduleName.includes('jwt')) {
        composedDefinition.nextSteps.push('Configure JWT secrets and token expiration settings.');
      }
    }

    if (composedDefinition.nextSteps.length === 0) {
      composedDefinition.nextSteps.push("Review the generated project structure and files.");
      composedDefinition.nextSteps.push("Run package manager install commands (e.g., `npm install`) in relevant directories if not fully handled by setup commands.");
      composedDefinition.nextSteps.push("Configure environment variables (e.g., in .env files if created).");
      composedDefinition.nextSteps.push("Consult individual module documentation or READMEs if available.");
    }

    logger.debug('Final composed definition (before final validation):', JSON.stringify(composedDefinition, null, 2));
    return composedDefinition;
  }
}
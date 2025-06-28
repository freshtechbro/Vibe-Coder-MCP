import { FileInfo, ClassInfo, FunctionInfo } from './codeMapModel.js';
import path from 'path';
import fs from 'fs/promises';
import logger from '../../logger.js';
import { CodeMapGeneratorConfig } from './types.js';
import { writeFileSecure, readFileSecure } from './fsUtils.js';
import { getOutputDirectory, getBaseOutputDir } from './directoryUtils.js';

export interface GraphNode {
  id: string; // Unique identifier for the node (e.g., file path, class name)
  label: string; // Display label for the node (can include semantic comment)
  type: 'file' | 'class' | 'function' | 'method';
  comment?: string; // Semantic comment associated with the node
  filePath?: string; // For class/function nodes, which file they belong to
}

export interface GraphEdge {
  from: string; // ID of the source node
  to: string;   // ID of the target node
  label?: string; // e.g., "imports", "inherits", "calls"
  comment?: string; // Semantic comment for the edge itself (less common)
}

/**
 * Builds a file dependency graph based on import statements.
 * Nodes are file paths (relative to projectRoot), edges represent imports.
 *
 * @param allFilesInfo Array of file information objects
 * @param config Optional configuration for intermediate storage
 * @param jobId Optional job ID for intermediate storage
 * @returns Object containing nodes and edges of the graph
 */
export async function buildFileDependencyGraph(
  allFilesInfo: FileInfo[],
  config?: CodeMapGeneratorConfig,
  jobId?: string
): Promise<{ nodes: GraphNode[], edges: GraphEdge[] }> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const filePaths = new Set<string>(allFilesInfo.map(f => f.relativePath));

  // Check if we should use intermediate storage
  const useIntermediateStorage = config && jobId && config.processing?.batchSize && allFilesInfo.length > config.processing.batchSize;
  let tempDir: string | undefined;

  if (useIntermediateStorage) {
    tempDir = path.join(
      config.output?.outputDir || getOutputDirectory(config),
      '.cache',
      'temp',
      jobId
    );

    try {
      // Create the temp directory if it doesn't exist
      await fs.mkdir(tempDir, { recursive: true });
      logger.debug(`Created temporary directory for file dependency graph: ${tempDir}`);
    } catch (error) {
      logger.warn(`Failed to create temporary directory for file dependency graph: ${error instanceof Error ? error.message : String(error)}`);
      // Continue without intermediate storage
      tempDir = undefined;
    }
  }

  // Process files in batches if using intermediate storage
  if (useIntermediateStorage && tempDir && config.processing?.batchSize) {
    const batchSize = config.processing.batchSize;
    const batches: FileInfo[][] = [];

    // Split files into batches
    for (let i = 0; i < allFilesInfo.length; i += batchSize) {
      batches.push(allFilesInfo.slice(i, i + batchSize));
    }

    logger.info(`Processing ${allFilesInfo.length} files in ${batches.length} batches for file dependency graph`);

    // Process each batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNodes: GraphNode[] = [];
      const batchEdges: GraphEdge[] = [];

      // Process files in the batch
      batch.forEach(fileInfo => {
        batchNodes.push({
          id: fileInfo.relativePath,
          label: `${fileInfo.relativePath} — ${fileInfo.comment || generateHeuristicComment(path.basename(fileInfo.relativePath), 'file')}`.substring(0, 80),
          type: 'file',
          comment: fileInfo.comment || generateHeuristicComment(path.basename(fileInfo.relativePath), 'file'),
        });

        fileInfo.imports.forEach(imp => {
          // Try to resolve the import path relative to the current file and project root
          let resolvedPath: string | null = null;
          if (imp.path.startsWith('.')) { // Relative import
            resolvedPath = path.normalize(path.join(path.dirname(fileInfo.relativePath), imp.path));
          } else {
            // Could be a project-local module (e.g. 'src/utils/helpers') or external lib
            // For now, only link if it directly matches another file's relative path (simplified)
            if (filePaths.has(imp.path) || filePaths.has(`${imp.path}.js`) || filePaths.has(`${imp.path}.ts`)) {
              resolvedPath = filePaths.has(imp.path) ? imp.path : (filePaths.has(`${imp.path}.js`) ? `${imp.path}.js` : `${imp.path}.ts`);
            }
          }

          if (resolvedPath && filePaths.has(resolvedPath)) {
            batchEdges.push({
              from: fileInfo.relativePath,
              to: resolvedPath,
              label: 'imports',
            });
          } else if (resolvedPath) {
            logger.debug(`Import from ${fileInfo.relativePath} to ${imp.path} (resolved: ${resolvedPath}) could not be matched to a project file.`);
          }
        });
      });

      // Save batch results to intermediate files
      const batchNodesFile = path.join(tempDir, `file-dep-nodes-batch-${i}.json`);
      const batchEdgesFile = path.join(tempDir, `file-dep-edges-batch-${i}.json`);

      try {
        const baseOutputDir = getBaseOutputDir();
        await writeFileSecure(batchNodesFile, JSON.stringify(batchNodes), config.allowedMappingDirectory, 'utf-8', baseOutputDir);
        await writeFileSecure(batchEdgesFile, JSON.stringify(batchEdges), config.allowedMappingDirectory, 'utf-8', baseOutputDir);
        logger.debug(`Saved batch ${i + 1}/${batches.length} results for file dependency graph`);
      } catch (error) {
        logger.error(`Failed to save batch results for file dependency graph: ${error instanceof Error ? error.message : String(error)}`);
        // Add batch results to main arrays
        nodes.push(...batchNodes);
        edges.push(...batchEdges);
      }
    }

    // Combine all batch results
    try {
      const batchFiles = await fs.readdir(tempDir);
      const nodeFiles = batchFiles.filter(file => file.startsWith('file-dep-nodes-batch-'));
      const edgeFiles = batchFiles.filter(file => file.startsWith('file-dep-edges-batch-'));

      // Read and combine node files
      for (const file of nodeFiles) {
        const filePath = path.join(tempDir, file);
        const baseOutputDir = getBaseOutputDir();
        const content = await readFileSecure(filePath, config.allowedMappingDirectory, 'utf-8', baseOutputDir);
        const batchNodes = JSON.parse(content) as GraphNode[];
        nodes.push(...batchNodes);
      }

      // Read and combine edge files
      for (const file of edgeFiles) {
        const filePath = path.join(tempDir, file);
        const baseOutputDir = getBaseOutputDir();
        const content = await readFileSecure(filePath, config.allowedMappingDirectory, 'utf-8', baseOutputDir);
        const batchEdges = JSON.parse(content) as GraphEdge[];
        edges.push(...batchEdges);
      }

      logger.info(`Combined ${nodeFiles.length} batches for file dependency graph`);
    } catch (error) {
      logger.error(`Failed to combine batch results for file dependency graph: ${error instanceof Error ? error.message : String(error)}`);
      // If we failed to combine, process all files directly
      if (nodes.length === 0 || edges.length === 0) {
        return processFileDependencyGraphDirectly(allFilesInfo);
      }
    }
  } else {
    // Process all files directly if not using intermediate storage
    return processFileDependencyGraphDirectly(allFilesInfo);
  }

  return { nodes, edges };
}

/**
 * Processes file dependency graph directly without intermediate storage.
 * @param allFilesInfo Array of file information objects
 * @returns Object containing nodes and edges of the graph
 */
function processFileDependencyGraphDirectly(allFilesInfo: FileInfo[]): { nodes: GraphNode[], edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const filePaths = new Set<string>(allFilesInfo.map(f => f.relativePath));

  allFilesInfo.forEach(fileInfo => {
    nodes.push({
      id: fileInfo.relativePath,
      label: `${fileInfo.relativePath} — ${fileInfo.comment || generateHeuristicComment(path.basename(fileInfo.relativePath), 'file')}`.substring(0, 80),
      type: 'file',
      comment: fileInfo.comment || generateHeuristicComment(path.basename(fileInfo.relativePath), 'file'),
    });

    fileInfo.imports.forEach(imp => {
      // Try to resolve the import path relative to the current file and project root
      let resolvedPath: string | null = null;
      if (imp.path.startsWith('.')) { // Relative import
        resolvedPath = path.normalize(path.join(path.dirname(fileInfo.relativePath), imp.path));
      } else {
        // Could be a project-local module (e.g. 'src/utils/helpers') or external lib
        // For now, only link if it directly matches another file's relative path (simplified)
        if (filePaths.has(imp.path) || filePaths.has(`${imp.path}.js`) || filePaths.has(`${imp.path}.ts`)) {
          resolvedPath = filePaths.has(imp.path) ? imp.path : (filePaths.has(`${imp.path}.js`) ? `${imp.path}.js` : `${imp.path}.ts`);
        }
      }

      if (resolvedPath && filePaths.has(resolvedPath)) {
        edges.push({
          from: fileInfo.relativePath,
          to: resolvedPath,
          label: 'imports',
        });
      } else if (resolvedPath) {
        logger.debug(`Import from ${fileInfo.relativePath} to ${imp.path} (resolved: ${resolvedPath}) could not be matched to a project file.`);
      }
    });
  });

  return { nodes, edges };
}

/**
 * Builds a class inheritance graph.
 * Nodes are class names, edges represent "inherits from".
 *
 * @param allFilesInfo Array of file information objects
 * @param config Optional configuration for intermediate storage
 * @param jobId Optional job ID for intermediate storage
 * @returns Object containing nodes and edges of the graph
 */
export async function buildClassInheritanceGraph(
  allFilesInfo: FileInfo[],
  config?: CodeMapGeneratorConfig,
  jobId?: string
): Promise<{ nodes: GraphNode[], edges: GraphEdge[] }> {
  // Check if we should use intermediate storage
  const useIntermediateStorage = config && jobId && config.processing?.batchSize && allFilesInfo.length > config.processing.batchSize;
  let tempDir: string | undefined;

  if (useIntermediateStorage) {
    tempDir = path.join(
      config.output?.outputDir || getOutputDirectory(config),
      '.cache',
      'temp',
      jobId
    );

    try {
      // Create the temp directory if it doesn't exist
      await fs.mkdir(tempDir, { recursive: true });
      logger.debug(`Created temporary directory for class inheritance graph: ${tempDir}`);
    } catch (error) {
      logger.warn(`Failed to create temporary directory for class inheritance graph: ${error instanceof Error ? error.message : String(error)}`);
      // Continue without intermediate storage
      tempDir = undefined;
    }
  }

  // Process in batches if using intermediate storage
  if (useIntermediateStorage && tempDir && config.processing?.batchSize) {
    return await processClassInheritanceGraphWithStorage(allFilesInfo, config, tempDir);
  } else {
    // Process directly if not using intermediate storage
    return processClassInheritanceGraphDirectly(allFilesInfo);
  }
}

/**
 * Processes class inheritance graph with intermediate storage.
 * @param allFilesInfo Array of file information objects
 * @param config Configuration for intermediate storage
 * @param tempDir Temporary directory for intermediate storage
 * @returns Object containing nodes and edges of the graph
 */
async function processClassInheritanceGraphWithStorage(
  allFilesInfo: FileInfo[],
  config: CodeMapGeneratorConfig,
  tempDir: string
): Promise<{ nodes: GraphNode[], edges: GraphEdge[] }> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const classMap = new Map<string, { classInfo: ClassInfo, filePath: string }>();

  // First pass: collect all classes and create nodes
  const classMapFile = path.join(tempDir, 'class-map.json');
  const nodesFile = path.join(tempDir, 'class-nodes.json');

  // Process files in batches
  const batchSize = config.processing?.batchSize || 100;
  const batches: FileInfo[][] = [];

  // Split files into batches
  for (let i = 0; i < allFilesInfo.length; i += batchSize) {
    batches.push(allFilesInfo.slice(i, i + batchSize));
  }

  logger.info(`Processing ${allFilesInfo.length} files in ${batches.length} batches for class inheritance graph`);

  // First pass: collect all classes
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchNodes: GraphNode[] = [];
    const batchClassMap: Record<string, { classInfo: any, filePath: string }> = {};

    batch.forEach(fileInfo => {
      fileInfo.classes.forEach(classInfo => {
        const classId = `${fileInfo.relativePath}::${classInfo.name}`; // Qualify class name with file path
        batchNodes.push({
          id: classId,
          label: `${classInfo.name} — ${classInfo.comment || generateHeuristicComment(classInfo.name, 'class')}`.substring(0, 80),
          type: 'class',
          comment: classInfo.comment || generateHeuristicComment(classInfo.name, 'class'),
          filePath: fileInfo.relativePath,
        });

        // Store in both batch map and global map
        batchClassMap[classInfo.name] = { classInfo, filePath: fileInfo.relativePath }; // For simpler lookup by raw name
        batchClassMap[classId] = { classInfo, filePath: fileInfo.relativePath }; // For qualified lookup

        classMap.set(classInfo.name, { classInfo, filePath: fileInfo.relativePath });
        classMap.set(classId, { classInfo, filePath: fileInfo.relativePath });
      });
    });

    // Save batch nodes to intermediate file
    const batchNodesFile = path.join(tempDir, `class-nodes-batch-${i}.json`);

    try {
      const baseOutputDir = getBaseOutputDir();
      await writeFileSecure(batchNodesFile, JSON.stringify(batchNodes), config.allowedMappingDirectory, 'utf-8', baseOutputDir);
      logger.debug(`Saved batch ${i + 1}/${batches.length} nodes for class inheritance graph`);
    } catch (error) {
      logger.error(`Failed to save batch nodes for class inheritance graph: ${error instanceof Error ? error.message : String(error)}`);
      // Add batch nodes to main array
      nodes.push(...batchNodes);
    }
  }

  // Save the class map to an intermediate file
  try {
    // Convert Map to object for serialization
    const classMapObj: Record<string, { classInfo: any, filePath: string }> = {};
    classMap.forEach((value, key) => {
      classMapObj[key] = {
        classInfo: {
          name: value.classInfo.name,
          parentClass: value.classInfo.parentClass
        },
        filePath: value.filePath
      };
    });

    const baseOutputDir = getBaseOutputDir();
    await writeFileSecure(classMapFile, JSON.stringify(classMapObj), config.allowedMappingDirectory, 'utf-8', baseOutputDir);
    logger.debug(`Saved class map for class inheritance graph`);
  } catch (error) {
    logger.error(`Failed to save class map for class inheritance graph: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Second pass: build edges using the class map
  try {
    // Read the class map from the intermediate file
    const baseOutputDir = getBaseOutputDir();
    const classMapContent = await readFileSecure(classMapFile, config.allowedMappingDirectory, 'utf-8', baseOutputDir);
    const classMapObj = JSON.parse(classMapContent) as Record<string, { classInfo: ClassInfo, filePath: string }>;

    // Process in batches
    const classEntries = Object.entries(classMapObj);
    const classBatchSize = batchSize;
    const classBatches: Array<[string, { classInfo: ClassInfo, filePath: string }][]> = [];

    // Split class entries into batches
    for (let i = 0; i < classEntries.length; i += classBatchSize) {
      classBatches.push(classEntries.slice(i, i + classBatchSize));
    }

    logger.info(`Processing ${classEntries.length} class entries in ${classBatches.length} batches for inheritance edges`);

    // Process each batch
    for (let i = 0; i < classBatches.length; i++) {
      const batch = classBatches[i];
      const batchEdges: GraphEdge[] = [];

      batch.forEach(([classId, { classInfo, filePath }]) => {
        if (classInfo.parentClass) {
          // Try to find the parent class, first by raw name then by attempting to qualify it if not found
          const parentEntry = classMapObj[classInfo.parentClass];
          let parentClassId = classInfo.parentClass;

          if (parentEntry) {
            parentClassId = `${parentEntry.filePath}::${parentEntry.classInfo.name}`;
          } else {
            // Attempt to find if parentClass is in the same file
            const sameFileParentId = `${filePath}::${classInfo.parentClass}`;
            if (classMapObj[sameFileParentId]) {
              parentClassId = sameFileParentId;
            } else {
              // If not found directly or in the same file, it might be an external class or not mapped
              // For now, we'll create a node for it if it doesn't exist, to show the link
              if (!Object.keys(classMapObj).some(k => k.endsWith(`::${classInfo.parentClass}`))) {
                nodes.push({
                  id: classInfo.parentClass,
                  label: `${classInfo.parentClass} — (External or Unresolved)`,
                  type: 'class',
                  comment: '(External or Unresolved)'
                });
              }
              parentClassId = classInfo.parentClass; // Use the raw name as ID
            }
          }

          batchEdges.push({
            from: parentClassId, // Parent
            to: classId,       // Child
            label: 'inherits',
          });
        }
      });

      // Save batch edges to intermediate file
      const batchEdgesFile = path.join(tempDir, `class-edges-batch-${i}.json`);

      try {
        const baseOutputDir = getBaseOutputDir();
        await writeFileSecure(batchEdgesFile, JSON.stringify(batchEdges), config.allowedMappingDirectory, 'utf-8', baseOutputDir);
        logger.debug(`Saved batch ${i + 1}/${classBatches.length} edges for class inheritance graph`);
      } catch (error) {
        logger.error(`Failed to save batch edges for class inheritance graph: ${error instanceof Error ? error.message : String(error)}`);
        // Add batch edges to main array
        edges.push(...batchEdges);
      }
    }

    // Combine all batch results
    const batchFiles = await fs.readdir(tempDir);
    const nodeFiles = batchFiles.filter(file => file.startsWith('class-nodes-batch-'));
    const edgeFiles = batchFiles.filter(file => file.startsWith('class-edges-batch-'));

    // Read and combine node files
    for (const file of nodeFiles) {
      const filePath = path.join(tempDir, file);
      const baseOutputDir = getBaseOutputDir();
      const content = await readFileSecure(filePath, config.allowedMappingDirectory, 'utf-8', baseOutputDir);
      const batchNodes = JSON.parse(content) as GraphNode[];
      nodes.push(...batchNodes);
    }

    // Read and combine edge files
    for (const file of edgeFiles) {
      const filePath = path.join(tempDir, file);
      const baseOutputDir = getBaseOutputDir();
      const content = await readFileSecure(filePath, config.allowedMappingDirectory, 'utf-8', baseOutputDir);
      const batchEdges = JSON.parse(content) as GraphEdge[];
      edges.push(...batchEdges);
    }

    logger.info(`Combined ${nodeFiles.length} node batches and ${edgeFiles.length} edge batches for class inheritance graph`);
  } catch (error) {
    logger.error(`Failed to process class inheritance graph with intermediate storage: ${error instanceof Error ? error.message : String(error)}`);
    // If we failed, process directly
    if (nodes.length === 0 || edges.length === 0) {
      return processClassInheritanceGraphDirectly(allFilesInfo);
    }
  }

  return { nodes, edges };
}

/**
 * Processes class inheritance graph directly without intermediate storage.
 * @param allFilesInfo Array of file information objects
 * @returns Object containing nodes and edges of the graph
 */
function processClassInheritanceGraphDirectly(allFilesInfo: FileInfo[]): { nodes: GraphNode[], edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const classMap = new Map<string, { classInfo: ClassInfo, filePath: string }>();

  allFilesInfo.forEach(fileInfo => {
    fileInfo.classes.forEach(classInfo => {
      const classId = `${fileInfo.relativePath}::${classInfo.name}`; // Qualify class name with file path
      nodes.push({
        id: classId,
        label: `${classInfo.name} — ${classInfo.comment || generateHeuristicComment(classInfo.name, 'class')}`.substring(0, 80),
        type: 'class',
        comment: classInfo.comment || generateHeuristicComment(classInfo.name, 'class'),
        filePath: fileInfo.relativePath,
      });
      classMap.set(classInfo.name, { classInfo, filePath: fileInfo.relativePath }); // For simpler lookup by raw name
      classMap.set(classId, { classInfo, filePath: fileInfo.relativePath }); // For qualified lookup
    });
  });

  classMap.forEach(({ classInfo, filePath }, classId) => {
    if (classInfo.parentClass) {
      // Try to find the parent class, first by raw name then by attempting to qualify it if not found
      const parentEntry = classMap.get(classInfo.parentClass);
      let parentClassId = classInfo.parentClass;

      if (parentEntry) {
        parentClassId = `${parentEntry.filePath}::${parentEntry.classInfo.name}`;
      } else {
        // Attempt to find if parentClass is in the same file
        const sameFileParentId = `${filePath}::${classInfo.parentClass}`;
        if (classMap.has(sameFileParentId)) {
          parentClassId = sameFileParentId;
        } else {
          // If not found directly or in the same file, it might be an external class or not mapped
          // For now, we'll create a node for it if it doesn't exist, to show the link
          if (!Array.from(classMap.keys()).some(k => k.endsWith(`::${classInfo.parentClass}`))) {
            nodes.push({ id: classInfo.parentClass, label: `${classInfo.parentClass} — (External or Unresolved)`, type: 'class', comment: '(External or Unresolved)' });
          }
          parentClassId = classInfo.parentClass; // Use the raw name as ID
        }
      }

      edges.push({
        from: parentClassId, // Parent
        to: classId,       // Child
        label: 'inherits',
      });
    }
  });

  return { nodes, edges };
}


/**
 * Builds a (very) high-level function/method call graph.
 * This is heuristic and based on simple name matching in source code.
 * Nodes are function/method names (qualified with class/file), edges represent potential calls.
 *
 * @param allFilesInfo Array of file information objects
 * @param sourceCodeCache Map of file paths to source code
 * @param config Optional configuration for intermediate storage
 * @param jobId Optional job ID for intermediate storage
 * @returns Object containing nodes and edges of the graph
 */
export async function buildFunctionCallGraph(
  allFilesInfo: FileInfo[],
  sourceCodeCache: Map<string, string>,
  config?: CodeMapGeneratorConfig,
  jobId?: string
): Promise<{ nodes: GraphNode[], edges: GraphEdge[] }> {
  // Check if we should use intermediate storage
  const useIntermediateStorage = config && jobId && config.processing?.batchSize && allFilesInfo.length > config.processing.batchSize;
  let tempDir: string | undefined;

  if (useIntermediateStorage) {
    tempDir = path.join(
      config.output?.outputDir || getOutputDirectory(config),
      '.cache',
      'temp',
      jobId
    );

    try {
      // Create the temp directory if it doesn't exist
      await fs.mkdir(tempDir, { recursive: true });
      logger.debug(`Created temporary directory for function call graph: ${tempDir}`);
    } catch (error) {
      logger.warn(`Failed to create temporary directory for function call graph: ${error instanceof Error ? error.message : String(error)}`);
      // Continue without intermediate storage
      tempDir = undefined;
    }
  }

  // Process in batches if using intermediate storage
  if (useIntermediateStorage && tempDir && config.processing?.batchSize) {
    return await processFunctionCallGraphWithStorage(allFilesInfo, sourceCodeCache, config, tempDir);
  } else {
    // Process directly if not using intermediate storage
    return processFunctionCallGraphDirectly(allFilesInfo, sourceCodeCache);
  }
}

/**
 * Processes function call graph with intermediate storage.
 * @param allFilesInfo Array of file information objects
 * @param sourceCodeCache Map of file paths to source code
 * @param config Configuration for intermediate storage
 * @param tempDir Temporary directory for intermediate storage
 * @returns Object containing nodes and edges of the graph
 */
async function processFunctionCallGraphWithStorage(
  allFilesInfo: FileInfo[],
  sourceCodeCache: Map<string, string>,
  config: CodeMapGeneratorConfig,
  tempDir: string
): Promise<{ nodes: GraphNode[], edges: GraphEdge[] }> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // First pass: collect all functions and create nodes
  const functionsMapFile = path.join(tempDir, 'functions-map.json');

  // Process files in batches
  const batchSize = config.processing?.batchSize || 100;
  const batches: FileInfo[][] = [];

  // Split files into batches
  for (let i = 0; i < allFilesInfo.length; i += batchSize) {
    batches.push(allFilesInfo.slice(i, i + batchSize));
  }

  logger.info(`Processing ${allFilesInfo.length} files in ${batches.length} batches for function call graph`);

  // First pass: collect all functions and create nodes
  const allKnownFunctionsObj: Record<string, {
    funcInfo: { name: string, startLine: number, endLine: number },
    filePath: string,
    className?: string
  }> = {};

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchNodes: GraphNode[] = [];

    batch.forEach(fileInfo => {
      fileInfo.functions.forEach(funcInfo => {
        const funcId = `${fileInfo.relativePath}::${funcInfo.name}`;
        batchNodes.push({
          id: funcId,
          label: `${funcInfo.name} — ${funcInfo.comment || generateHeuristicComment(funcInfo.name, 'function')}`.substring(0, 80),
          type: 'function',
          comment: funcInfo.comment,
          filePath: fileInfo.relativePath,
        });

        // Store function info
        allKnownFunctionsObj[funcInfo.name] = {
          funcInfo: {
            name: funcInfo.name,
            startLine: funcInfo.startLine,
            endLine: funcInfo.endLine
          },
          filePath: fileInfo.relativePath
        };
        allKnownFunctionsObj[funcId] = {
          funcInfo: {
            name: funcInfo.name,
            startLine: funcInfo.startLine,
            endLine: funcInfo.endLine
          },
          filePath: fileInfo.relativePath
        };
      });

      fileInfo.classes.forEach(classInfo => {
        classInfo.methods.forEach(methodInfo => {
          const methodId = `${fileInfo.relativePath}::${classInfo.name}.${methodInfo.name}`;
          batchNodes.push({
            id: methodId,
            label: `${classInfo.name}.${methodInfo.name} — ${methodInfo.comment || generateHeuristicComment(methodInfo.name, 'method', undefined, classInfo.name)}`.substring(0, 80),
            type: 'method',
            comment: methodInfo.comment,
            filePath: fileInfo.relativePath,
          });

          // Store method info
          allKnownFunctionsObj[`${classInfo.name}.${methodInfo.name}`] = {
            funcInfo: {
              name: methodInfo.name,
              startLine: methodInfo.startLine,
              endLine: methodInfo.endLine
            },
            filePath: fileInfo.relativePath,
            className: classInfo.name
          };
          allKnownFunctionsObj[methodId] = {
            funcInfo: {
              name: methodInfo.name,
              startLine: methodInfo.startLine,
              endLine: methodInfo.endLine
            },
            filePath: fileInfo.relativePath,
            className: classInfo.name
          };
        });
      });
    });

    // Save batch nodes to intermediate file
    const batchNodesFile = path.join(tempDir, `func-nodes-batch-${i}.json`);

    try {
      const baseOutputDir = getBaseOutputDir();
      await writeFileSecure(batchNodesFile, JSON.stringify(batchNodes), config.allowedMappingDirectory, 'utf-8', baseOutputDir);
      logger.debug(`Saved batch ${i + 1}/${batches.length} nodes for function call graph`);
    } catch (error) {
      logger.error(`Failed to save batch nodes for function call graph: ${error instanceof Error ? error.message : String(error)}`);
      // Add batch nodes to main array
      nodes.push(...batchNodes);
    }
  }

  // Save the functions map to an intermediate file
  try {
    const baseOutputDir = getBaseOutputDir();
    await writeFileSecure(functionsMapFile, JSON.stringify(allKnownFunctionsObj), config.allowedMappingDirectory, 'utf-8', baseOutputDir);
    logger.debug(`Saved functions map for function call graph`);
  } catch (error) {
    logger.error(`Failed to save functions map for function call graph: ${error instanceof Error ? error.message : String(error)}`);
    // If we failed to save the functions map, process directly
    return processFunctionCallGraphDirectly(allFilesInfo, sourceCodeCache);
  }

  // Second pass: build edges using the functions map
  try {
    // Read the functions map from the intermediate file
    const baseOutputDir = getBaseOutputDir();
    const functionsMapContent = await readFileSecure(functionsMapFile, config.allowedMappingDirectory, 'utf-8', baseOutputDir);
    const functionsMap = JSON.parse(functionsMapContent) as Record<string, {
      funcInfo: { name: string, startLine: number, endLine: number },
      filePath: string,
      className?: string
    }>;

    // Process files in batches
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchEdges: GraphEdge[] = [];

      batch.forEach(fileInfo => {
        const sourceCode = sourceCodeCache.get(fileInfo.filePath);
        if (!sourceCode) return;

        const processSymbolList = (symbols: FunctionInfo[], currentSymbolType: 'function' | 'method', currentClassName?: string) => {
          symbols.forEach(callerInfo => {
            const callerId = currentClassName
              ? `${fileInfo.relativePath}::${currentClassName}.${callerInfo.name}`
              : `${fileInfo.relativePath}::${callerInfo.name}`;

            const functionBody = sourceCode.substring(
              sourceCode.indexOf('{', callerInfo.startLine > 0 ? sourceCode.indexOf('\n', callerInfo.startLine - 1) : 0), // Approx start
              sourceCode.lastIndexOf('}', callerInfo.endLine > 0 ? sourceCode.indexOf('\n', callerInfo.endLine) : sourceCode.length) //Approx end
            );

            if (!functionBody) return;

            // Process in smaller batches to avoid memory issues
            const functionEntries = Object.entries(functionsMap);
            
            // CRITICAL FIX: Pre-compile function patterns for efficient matching instead of nested loops
            const functionPatterns: Array<{ name: string, regex: RegExp, calleeId: string }> = [];
            
            // Only process qualified function IDs (contain ::) to avoid duplicates
            functionEntries.forEach(([key, { funcInfo: calleeInfo, filePath: calleeFilePath, className: calleeClassName }]) => {
            if (!key.includes('::')) return; // Skip non-qualified entries
            
              const calleeName = calleeInfo.name;
            const calleeId = calleeClassName
            ? `${calleeFilePath}::${calleeClassName}.${calleeName}`
            : `${calleeFilePath}::${calleeName}`;
            
              try {
            const regex = new RegExp(`\\b${escapeRegExp(calleeName)}\\b\\s*(?:\\(|\\.)`);  
                functionPatterns.push({ name: calleeName, regex, calleeId });
            } catch (error) {
            // Skip functions with names that can't be regex-escaped
            logger.debug(`Skipping function with problematic name: ${calleeName}`);
            }
            });
            
            logger.debug(`Created ${functionPatterns.length} function patterns for batch processing`);

            // CRITICAL FIX: Single-pass pattern matching instead of O(n²) nested loops
            for (const { name: calleeName, regex: callRegex, calleeId } of functionPatterns) {
            if (callerId === calleeId) continue; // Don't link to self

              if (callRegex.test(functionBody)) {
                batchEdges.push({
                  from: callerId,
                  to: calleeId,
                  label: 'calls?', // Indicate heuristic nature
                });
              }
            }
          });
        };

        processSymbolList(fileInfo.functions, 'function');
        fileInfo.classes.forEach(classInfo => {
          processSymbolList(classInfo.methods, 'method', classInfo.name);
        });
      });

      // Save batch edges to intermediate file
      const batchEdgesFile = path.join(tempDir, `func-edges-batch-${i}.json`);

      try {
        const baseOutputDir = getBaseOutputDir();
        await writeFileSecure(batchEdgesFile, JSON.stringify(batchEdges), config.allowedMappingDirectory, 'utf-8', baseOutputDir);
        logger.debug(`Saved batch ${i + 1}/${batches.length} edges for function call graph`);
      } catch (error) {
        logger.error(`Failed to save batch edges for function call graph: ${error instanceof Error ? error.message : String(error)}`);
        // Add batch edges to main array
        edges.push(...batchEdges);
      }
    }

    // Combine all batch results
    const batchFiles = await fs.readdir(tempDir);
    const nodeFiles = batchFiles.filter(file => file.startsWith('func-nodes-batch-'));
    const edgeFiles = batchFiles.filter(file => file.startsWith('func-edges-batch-'));

    // Read and combine node files
    for (const file of nodeFiles) {
      const filePath = path.join(tempDir, file);
      const baseOutputDir = getBaseOutputDir();
      const content = await readFileSecure(filePath, config.allowedMappingDirectory, 'utf-8', baseOutputDir);
      const batchNodes = JSON.parse(content) as GraphNode[];
      nodes.push(...batchNodes);
    }

    // Read and combine edge files
    for (const file of edgeFiles) {
      const filePath = path.join(tempDir, file);
      const baseOutputDir = getBaseOutputDir();
      const content = await readFileSecure(filePath, config.allowedMappingDirectory, 'utf-8', baseOutputDir);
      const batchEdges = JSON.parse(content) as GraphEdge[];
      edges.push(...batchEdges);
    }

    logger.info(`Combined ${nodeFiles.length} node batches and ${edgeFiles.length} edge batches for function call graph`);
  } catch (error) {
    logger.error(`Failed to process function call graph with intermediate storage: ${error instanceof Error ? error.message : String(error)}`);
    // If we failed, process directly
    if (nodes.length === 0 || edges.length === 0) {
      return processFunctionCallGraphDirectly(allFilesInfo, sourceCodeCache);
    }
  }

  // Remove duplicate nodes
  const uniqueNodeIds = new Set(nodes.map(n => n.id));
  const uniqueNodes = Array.from(uniqueNodeIds).map(id => nodes.find(n => n.id === id)!);

  return { nodes: uniqueNodes, edges };
}

/**
* Processes function call graph directly without intermediate storage.
* @param allFilesInfo Array of file information objects
* @param sourceCodeCache Map of file paths to source code
* @returns Object containing nodes and edges of the graph
*/
function processFunctionCallGraphDirectly(
allFilesInfo: FileInfo[],
sourceCodeCache: Map<string, string>
): { nodes: GraphNode[], edges: GraphEdge[] } {
const nodes: GraphNode[] = [];
const edges: GraphEdge[] = [];
const allKnownFunctions = new Map<string, { funcInfo: FunctionInfo, filePath: string, className?: string }>();

// Populate allKnownFunctions and nodes
allFilesInfo.forEach(fileInfo => {
fileInfo.functions.forEach(funcInfo => {
const funcId = `${fileInfo.relativePath}::${funcInfo.name}`;
nodes.push({
id: funcId,
label: `${funcInfo.name} — ${funcInfo.comment || generateHeuristicComment(funcInfo.name, 'function')}`.substring(0, 80),
type: 'function',
comment: funcInfo.comment,
filePath: fileInfo.relativePath,
});
allKnownFunctions.set(funcInfo.name, { funcInfo, filePath: fileInfo.relativePath }); // Simple name for now
allKnownFunctions.set(funcId, { funcInfo, filePath: fileInfo.relativePath });
});
fileInfo.classes.forEach(classInfo => {
classInfo.methods.forEach(methodInfo => {
const methodId = `${fileInfo.relativePath}::${classInfo.name}.${methodInfo.name}`;
nodes.push({
id: methodId,
label: `${classInfo.name}.${methodInfo.name} — ${methodInfo.comment || generateHeuristicComment(methodInfo.name, 'method', undefined, classInfo.name)}`.substring(0, 80),
type: 'method',
comment: methodInfo.comment,
filePath: fileInfo.relativePath,
});
allKnownFunctions.set(`${classInfo.name}.${methodInfo.name}`, { funcInfo: methodInfo, filePath: fileInfo.relativePath, className: classInfo.name }); // Qualified name
allKnownFunctions.set(methodId, { funcInfo: methodInfo, filePath: fileInfo.relativePath, className: classInfo.name });
});
});
});

// CRITICAL FIX: Replace O(n²) nested loop with efficient search
const maxFunctionsToProcess = 1000; // Limit total functions to process
const maxEdgesToGenerate = 5000; // Limit total edges to prevent memory issues
const processingStartTime = Date.now();
const maxProcessingTime = 30000; // 30 seconds max processing time

let functionsProcessed = 0;
let edgesGenerated = 0;

logger.info(`Starting function call graph generation with limits: ${maxFunctionsToProcess} functions, ${maxEdgesToGenerate} edges, ${maxProcessingTime}ms timeout`);

// Create a pre-compiled list of function patterns for efficient matching
const functionPatterns: Array<{ name: string, regex: RegExp, calleeId: string }> = [];

// Only process qualified function IDs (contain ::) to avoid duplicates
for (const [key, { funcInfo: calleeInfo, filePath: calleeFilePath, className: calleeClassName }] of allKnownFunctions) {
if (!key.includes('::')) continue; // Skip non-qualified entries

    const calleeName = calleeInfo.name;
const calleeId = calleeClassName
? `${calleeFilePath}::${calleeClassName}.${calleeName}`
: `${calleeFilePath}::${calleeName}`;

try {
  const regex = new RegExp(`\\b${escapeRegExp(calleeName)}\\b\\s*(?:\\(|\\.)`);  
  functionPatterns.push({ name: calleeName, regex, calleeId });
    } catch (error) {
  // Skip functions with names that can't be regex-escaped
logger.debug(`Skipping function with problematic name: ${calleeName}`);
}
}

logger.info(`Created ${functionPatterns.length} function patterns for matching`);

// Heuristic call detection with efficient single-pass matching
for (const fileInfo of allFilesInfo) {
// Check timeout
if (Date.now() - processingStartTime > maxProcessingTime) {
logger.warn(`Function call graph processing timed out after ${maxProcessingTime}ms`);
break;
}

if (functionsProcessed >= maxFunctionsToProcess) {
      logger.warn(`Reached maximum function processing limit: ${maxFunctionsToProcess}`);
break;
}

const sourceCode = sourceCodeCache.get(fileInfo.filePath);
    if (!sourceCode) continue;

    const processSymbolList = (symbols: FunctionInfo[], currentSymbolType: 'function' | 'method', currentClassName?: string) => {
for (const callerInfo of symbols) {
// Check limits
if (functionsProcessed >= maxFunctionsToProcess || edgesGenerated >= maxEdgesToGenerate) {
  break;
}

if (Date.now() - processingStartTime > maxProcessingTime) {
break;
}

functionsProcessed++;
  
const callerId = currentClassName
? `${fileInfo.relativePath}::${currentClassName}.${callerInfo.name}`
: `${fileInfo.relativePath}::${callerInfo.name}`;

const functionBody = sourceCode.substring(
          sourceCode.indexOf('{', callerInfo.startLine > 0 ? sourceCode.indexOf('\n', callerInfo.startLine - 1) : 0), // Approx start
sourceCode.lastIndexOf('}', callerInfo.endLine > 0 ? sourceCode.indexOf('\n', callerInfo.endLine) : sourceCode.length) //Approx end
);

if (!functionBody) continue;

// CRITICAL FIX: Single-pass pattern matching instead of nested loops
for (const { name: calleeName, regex: callRegex, calleeId } of functionPatterns) {
if (edgesGenerated >= maxEdgesToGenerate) {
break;
}

  if (callerId === calleeId) continue; // Don't link to self

      if (callRegex.test(functionBody)) {
            edges.push({
          from: callerId,
          to: calleeId,
        label: 'calls?', // Indicate heuristic nature
    });
      edgesGenerated++;
      }
      }
      }
  };

  processSymbolList(fileInfo.functions, 'function');
  fileInfo.classes.forEach(classInfo => {
    if (functionsProcessed < maxFunctionsToProcess && edgesGenerated < maxEdgesToGenerate) {
        processSymbolList(classInfo.methods, 'method', classInfo.name);
    }
    });
  }

  logger.info(`Function call graph generation completed: ${functionsProcessed} functions processed, ${edgesGenerated} edges generated`);

  // Remove duplicate nodes
  const uniqueNodeIds = new Set(nodes.map(n => n.id));
  const uniqueNodes = Array.from(uniqueNodeIds).map(id => nodes.find(n => n.id === id)!);

  return { nodes: uniqueNodes, edges };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

/**
 * Builds a method call sequence graph based on function/method calls.
 * This is more focused on the sequence of calls rather than just the existence of calls.
 *
 * @param allFilesInfo Array of file information objects
 * @param sourceCodeCache Map of file paths to source code
 * @param config Optional configuration for intermediate storage
 * @param jobId Optional job ID for intermediate storage
 * @returns Object containing nodes and edges of the graph with sequence information
 */
export async function buildMethodCallSequenceGraph(
  allFilesInfo: FileInfo[],
  sourceCodeCache: Map<string, string>,
  config?: CodeMapGeneratorConfig,
  jobId?: string
): Promise<{ nodes: GraphNode[], edges: GraphEdge[] }> {
  // Check if we should use intermediate storage
  const useIntermediateStorage = config && jobId && config.processing?.batchSize && allFilesInfo.length > config.processing.batchSize;
  let tempDir: string | undefined;

  if (useIntermediateStorage) {
    tempDir = path.join(
      config.output?.outputDir || getOutputDirectory(config),
      '.cache',
      'temp',
      jobId
    );

    try {
      // Create the temp directory if it doesn't exist
      await fs.mkdir(tempDir, { recursive: true });
      logger.debug(`Created temporary directory for method call sequence graph: ${tempDir}`);
    } catch (error) {
      logger.warn(`Failed to create temporary directory for method call sequence graph: ${error instanceof Error ? error.message : String(error)}`);
      // Continue without intermediate storage
      tempDir = undefined;
    }
  }

  // Process in batches if using intermediate storage
  if (useIntermediateStorage && tempDir && config.processing?.batchSize) {
    return await processMethodCallSequenceGraphWithStorage(allFilesInfo, sourceCodeCache, config, tempDir);
  } else {
    // Process directly if not using intermediate storage
    return processMethodCallSequenceGraphDirectly(allFilesInfo, sourceCodeCache);
  }
}

/**
 * Processes method call sequence graph with intermediate storage.
 * @param allFilesInfo Array of file information objects
 * @param sourceCodeCache Map of file paths to source code
 * @param config Configuration for intermediate storage
 * @param tempDir Temporary directory for intermediate storage
 * @returns Object containing nodes and edges of the graph
 */
async function processMethodCallSequenceGraphWithStorage(
  allFilesInfo: FileInfo[],
  sourceCodeCache: Map<string, string>,
  config: CodeMapGeneratorConfig,
  tempDir: string
): Promise<{ nodes: GraphNode[], edges: GraphEdge[] }> {
  // Reuse the function call graph building logic with storage
  // This leverages the existing memory management and storage mechanisms
  const { nodes, edges } = await processFunctionCallGraphWithStorage(
    allFilesInfo,
    sourceCodeCache,
    config,
    tempDir
  );

  // Enhance edges with sequence information
  const sequenceEdges = edges.map((edge, index) => {
    // Add sequence-specific properties
    return {
      ...edge,
      sequenceOrder: index, // Add sequence order based on the edge index
      // Add any other sequence-specific properties here
    };
  });

  return { nodes, edges: sequenceEdges };
}

/**
 * Processes method call sequence graph directly without intermediate storage.
 * @param allFilesInfo Array of file information objects
 * @param sourceCodeCache Map of file paths to source code
 * @returns Object containing nodes and edges of the graph
 */
function processMethodCallSequenceGraphDirectly(
  allFilesInfo: FileInfo[],
  sourceCodeCache: Map<string, string>
): Promise<{ nodes: GraphNode[], edges: GraphEdge[] }> {
  // Reuse the function call graph building logic
  return buildFunctionCallGraph(allFilesInfo, sourceCodeCache);
}

// Helper function from astAnalyzer.ts, duplicated for now or move to a shared util
function generateHeuristicComment(
  name: string,
  type: 'function' | 'class' | 'method' | 'property' | 'import' | 'file',
  signature?: string,
  parentClass?: string
): string {
  const A_AN = ['a', 'e', 'i', 'o', 'u'].includes(name.charAt(0).toLowerCase()) ? 'An' : 'A';
  const nameParts = name.replace(/([A-Z])/g, ' $1').toLowerCase().split(/[\s_]+/).filter(Boolean);
  const readableName = nameParts.join(' ');

  switch (type) {
    case 'function':
      return `Performs an action related to ${readableName}.`;
    case 'method':
      return `Method ${readableName} of class ${parentClass || 'N/A'}.`;
    case 'class':
      return `${A_AN} ${readableName} class definition.`;
    case 'property':
      return `Property ${readableName} of class ${parentClass || 'N/A'}.`;
    case 'import':
      return `Imports module or items from '${readableName}'.`;
    case 'file':
      return `File containing code related to ${readableName}.`; // For file-level comments
    default:
      return `Symbol ${readableName}.`;
  }
}
/**
 * Output generator for the Code-Map Generator tool.
 * This file contains functions for generating output in different formats.
 */

import fs from 'fs/promises';
import path from 'path';
import logger from '../../logger.js';
import { FileInfo, CodeMap } from './codeMapModel.js';
import { GraphNode, GraphEdge } from './graphBuilder.js';
import { generateMermaidSequenceDiagram } from './diagramGenerator.js';
import { CodeMapGeneratorConfig } from './types.js';
import { writeFileSecure } from './fsUtils.js';
import { generateTimestampFileName, getOutputDirectory } from './directoryUtils.js';
import { CommentProcessor } from './utils/commentProcessor.js';

/**
 * Sanitizes an absolute path for output to avoid exposing sensitive system information.
 * @param absolutePath The absolute path to sanitize
 * @param projectRoot The project root path
 * @returns The sanitized path
 */
export function sanitizeAbsolutePath(absolutePath: string, projectRoot?: string): string {
  if (!absolutePath) return '';

  // If project root is provided, make the path relative to it
  if (projectRoot && absolutePath.startsWith(projectRoot)) {
    return path.join(projectRoot, path.relative(projectRoot, absolutePath));
  }

  // If the path is outside the allowed directory, return a placeholder
  if (projectRoot && !absolutePath.startsWith(projectRoot)) {
    return '[Path outside allowed directory]';
  }

  // Normalize path separators
  return absolutePath.replace(/\\/g, '/');
}

/**
 * Generates a Markdown output for the code map.
 * @param allFilesInfo Array of file information objects
 * @param fileDependencyGraph File dependency graph
 * @param classInheritanceGraph Class inheritance graph
 * @param functionCallGraph Function call graph
 * @param config Code-Map Generator configuration
 * @param jobId Job ID for output file naming
 * @returns A promise that resolves to the output file path
 */
export async function generateMarkdownOutput(
  allFilesInfo: FileInfo[],
  fileDependencyGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  classInheritanceGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  functionCallGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  config: CodeMapGeneratorConfig,
  jobId: string
): Promise<string> {
  // Determine output directory and file name
  const outputDir = config.output?.outputDir || getOutputDirectory(config);
  const filePrefix = config.output?.filePrefix || 'code-map';
  const fileName = generateTimestampFileName(filePrefix, 'md');
  const outputPath = path.join(outputDir, fileName);

  // Check if we should split the output (default is now false)
  const splitOutput = config.output?.splitOutput === true;

  if (splitOutput) {
    // Generate split output files
    logger.info('Generating split markdown output files');
    return await generateSplitMarkdownOutput(
      allFilesInfo,
      fileDependencyGraph,
      classInheritanceGraph,
      functionCallGraph,
      config,
      jobId
    );
  } else {
    // Generate a single output file (default)
    logger.info('Generating single markdown output file');
    return await generateSingleMarkdownOutput(
      allFilesInfo,
      fileDependencyGraph,
      classInheritanceGraph,
      functionCallGraph,
      config,
      outputPath
    );
  }
}

/**
 * Generates a single Markdown output file.
 * @param allFilesInfo Array of file information objects
 * @param fileDependencyGraph File dependency graph
 * @param classInheritanceGraph Class inheritance graph
 * @param functionCallGraph Function call graph
 * @param config Code-Map Generator configuration
 * @param outputPath Output file path
 * @returns A promise that resolves to the output file path
 */
async function generateSingleMarkdownOutput(
  allFilesInfo: FileInfo[],
  fileDependencyGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  classInheritanceGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  functionCallGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  config: CodeMapGeneratorConfig,
  outputPath: string
): Promise<string> {
  // Get the output directory for validation
  const outputDir = config.output?.outputDir || getOutputDirectory(config);
  // Generate the Markdown content
  let markdown = '# Code Map\n\n';

  // Add summary section
  markdown += '## Summary\n\n';
  markdown += `- Total Files: ${allFilesInfo.length}\n`;
  markdown += `- Total Classes: ${allFilesInfo.reduce((sum, file) => sum + file.classes.length, 0)}\n`;
  markdown += `- Total Functions: ${allFilesInfo.reduce((sum, file) => sum + file.functions.length, 0)}\n`;
  markdown += `- Total Methods: ${allFilesInfo.reduce((sum, file) => sum + file.classes.reduce((sum, cls) => sum + cls.methods.length, 0), 0)}\n\n`;

  // Add file structure section
  markdown += '## File Structure\n\n';
  markdown += '```\n';

  // Group files by directory
  const filesByDir = new Map<string, string[]>();
  allFilesInfo.forEach(fileInfo => {
    const dir = path.dirname(fileInfo.relativePath);
    if (!filesByDir.has(dir)) {
      filesByDir.set(dir, []);
    }
    filesByDir.get(dir)!.push(path.basename(fileInfo.relativePath));
  });

  // Sort directories and files
  const sortedDirs = Array.from(filesByDir.keys()).sort();
  sortedDirs.forEach(dir => {
    const files = filesByDir.get(dir)!.sort();
    markdown += `${dir}/\n`;
    files.forEach(file => {
      markdown += `  ├── ${file}\n`;
    });
  });

  markdown += '```\n\n';

  // Add file dependency graph section - use optimized diagrams
  markdown += '## File Dependencies\n\n';

  // Import optimization components
  const { UniversalDiagramOptimizer } = await import('./optimization/universalDiagramOptimizer.js');
  const { EnhancementConfigManager } = await import('./config/enhancementConfig.js');

  const diagramOptimizer = new UniversalDiagramOptimizer();
  const enhancementConfig = EnhancementConfigManager.getInstance().getConfig();

  // Initialize comment processor for centralized comment handling
  const commentProcessor = new CommentProcessor(enhancementConfig);

  // Use optimized diagram generation
  const optimizedDiagram = diagramOptimizer.optimizeDependencyDiagram(
    fileDependencyGraph.nodes,
    fileDependencyGraph.edges,
    enhancementConfig.universalOptimization
  );

  if (enhancementConfig.universalOptimization.eliminateVerboseDiagrams) {
    // Use text summary (maximum optimization)
    markdown += optimizedDiagram + '\n\n';
  } else {
    // Fallback to mermaid (for backward compatibility)
    markdown += '```mermaid\ngraph TD;\n';
    fileDependencyGraph.nodes.forEach(node => {
      markdown += `  ${node.id.replace(/[^a-zA-Z0-9]/g, '_')}["${node.label}"];\n`;
    });
    fileDependencyGraph.edges.forEach(edge => {
      markdown += `  ${edge.from.replace(/[^a-zA-Z0-9]/g, '_')} --> ${edge.to.replace(/[^a-zA-Z0-9]/g, '_')};\n`;
    });
    markdown += '```\n\n';
  }

  // Add class inheritance graph section - use optimized diagrams
  markdown += '## Class Inheritance\n\n';

  // Use optimized diagram generation for class inheritance
  const optimizedClassDiagram = diagramOptimizer.optimizeDependencyDiagram(
    classInheritanceGraph.nodes,
    classInheritanceGraph.edges,
    enhancementConfig.universalOptimization
  );

  if (enhancementConfig.universalOptimization.eliminateVerboseDiagrams) {
    // Use text summary (maximum optimization)
    markdown += optimizedClassDiagram + '\n\n';
  } else {
    // Fallback to mermaid (for backward compatibility)
    markdown += '```mermaid\nclassDiagram;\n';
    classInheritanceGraph.nodes.forEach(node => {
      markdown += `  class ${node.id.replace(/[^a-zA-Z0-9]/g, '_')} "${node.label}";\n`;
    });
    classInheritanceGraph.edges.forEach(edge => {
      markdown += `  ${edge.from.replace(/[^a-zA-Z0-9]/g, '_')} <|-- ${edge.to.replace(/[^a-zA-Z0-9]/g, '_')};\n`;
    });
    markdown += '```\n\n';
  }

  // Add function call graph section - use optimized diagrams
  markdown += '## Function Calls\n\n';

  // Use optimized diagram generation for function calls
  const optimizedFunctionDiagram = diagramOptimizer.optimizeDependencyDiagram(
    functionCallGraph.nodes,
    functionCallGraph.edges,
    enhancementConfig.universalOptimization
  );

  if (enhancementConfig.universalOptimization.eliminateVerboseDiagrams) {
    // Use text summary (maximum optimization)
    markdown += optimizedFunctionDiagram + '\n\n';
  } else {
    // Fallback to mermaid (for backward compatibility)
    markdown += '```mermaid\ngraph TD;\n';
    functionCallGraph.nodes.forEach(node => {
      markdown += `  ${node.id.replace(/[^a-zA-Z0-9]/g, '_')}["${node.label}"];\n`;
    });
    functionCallGraph.edges.forEach(edge => {
      markdown += `  ${edge.from.replace(/[^a-zA-Z0-9]/g, '_')} --> ${edge.to.replace(/[^a-zA-Z0-9]/g, '_')};\n`;
    });
    markdown += '```\n\n';
  }

  // Skip sequence diagram generation entirely for optimization
  // markdown += '## Method Call Sequence\n\n';
  // markdown += 'Sequence diagrams disabled for optimization.\n\n';

  // Add file details section
  markdown += '## File Details\n\n';

  // Apply import optimization to all files
  const optimizedFilesInfo = diagramOptimizer.optimizeFileInfos(allFilesInfo);

  // Apply importance-based filtering for Phase 6 optimization
  const { UniversalClassOptimizer } = await import('./optimization/universalClassOptimizer.js');
  const classOptimizer = new UniversalClassOptimizer(enhancementConfig);

  const importantFiles = optimizedFilesInfo.filter(fileInfo => {
    const importance = classOptimizer.calculateFileImportance(fileInfo);
    return importance >= 6.0; // Only show files with importance >= 6
  });

  // Process only important files for detailed breakdown
  importantFiles.forEach(fileInfo => {
    markdown += `### ${fileInfo.relativePath}\n\n`;

    // Process file comment with semantic preservation
    const processedFileComment = commentProcessor.processComment(fileInfo.comment, {
      type: 'file',
      name: fileInfo.relativePath
    });
    if (processedFileComment) {
      markdown += `${processedFileComment}\n\n`;
    }

    if (fileInfo.imports.length > 0) {
      markdown += '#### Imports\n\n';
      fileInfo.imports.forEach(imp => {
        // Show the actual import path even if it's "unknown"
        let displayPath = imp.path;

        // Handle unknown imports with detailed information if enabled
        if (imp.path === 'unknown' || imp.path.startsWith('module import')) {
          if (config.debug?.showDetailedImports) {
            // Show detailed information for unknown imports
            displayPath = imp.path;
          } else {
            // Use generic placeholder or imported items if available
            displayPath = (imp.importedItems && imp.importedItems.length > 0) ?
              `${imp.importedItems[0]} (imported)` : 'module import';
          }
        }

        // Handle different import types
        let importType = '';
        if (imp.type) {
          switch (imp.type) {
            case 'dynamic':
              importType = ' (dynamic import)';
              break;
            case 'commonjs':
              importType = ' (CommonJS)';
              break;
            case 'extracted':
              importType = ' (extracted)';
              break;
          }
        }

        markdown += `- \`${displayPath}\`${importType}`;

        // Add imported items if available
        if (imp.importedItems && imp.importedItems.length > 0 && imp.path !== 'unknown') {
          if (Array.isArray(imp.importedItems) && typeof imp.importedItems[0] === 'string') {
            // Handle legacy string array format
            markdown += ` (${imp.importedItems.join(', ')})`;
          } else {
            // Handle new ImportedItem format
            markdown += '\n  - Imported items:';
            (imp.importedItems as unknown[]).forEach(item => {
              if (typeof item === 'string') {
                markdown += `\n    - ${item}`;
              } else {
                // Handle ImportedItem object
                const importedItem = item as { isDefault?: boolean; isNamespace?: boolean; name: string; alias?: string };
                if (importedItem.isDefault) {
                  markdown += `\n    - Default import: \`${importedItem.name}\``;
                } else if (importedItem.isNamespace) {
                  markdown += `\n    - Namespace import: \`* as ${importedItem.name}\``;
                } else {
                  markdown += `\n    - Named import: \`${importedItem.name}\``;
                  if (importedItem.alias) {
                    markdown += ` as \`${importedItem.alias}\``;
                  }
                }
              }
            });
          }
        }

        // Prioritize absolute path, fall back to relative path
        if (imp.absolutePath) {
          const sanitizedPath = sanitizeAbsolutePath(imp.absolutePath, config.allowedMappingDirectory);
          markdown += `\n  - Absolute path: \`${sanitizedPath}\``;
        } else if (imp.resolvedPath && imp.resolvedPath !== imp.path) {
          markdown += `\n  - Resolved to: \`${imp.resolvedPath}\``;
        }

        // Process import comment with semantic preservation
        const processedImportComment = commentProcessor.processComment(imp.comment, {
          type: 'import',
          name: imp.path
        });
        if (processedImportComment) {
          markdown += ` - ${processedImportComment}`;
        }

        markdown += '\n';
      });
      markdown += '\n';
    }

    if (fileInfo.classes.length > 0) {
      markdown += '#### Classes\n\n';
      fileInfo.classes.forEach(classInfo => {
        markdown += `##### ${classInfo.name}\n\n`;

        // Process class comment with semantic preservation
        const processedClassComment = commentProcessor.processComment(classInfo.comment, {
          type: 'class',
          name: classInfo.name
        });
        if (processedClassComment) {
          markdown += `${processedClassComment}\n\n`;
        }

        if (classInfo.parentClass) {
          markdown += `Extends: \`${classInfo.parentClass}\`\n\n`;
        }

        if (classInfo.properties.length > 0) {
          markdown += '**Properties:**\n\n';
          classInfo.properties.forEach(prop => {
            // Format property with type, access modifier, and static indicator
            let propStr = `- \`${prop.name}\``;

            // Add type if available
            if (prop.type) {
              propStr += `: \`${prop.type}\``;
            }

            // Add access modifier if available
            if (prop.accessModifier) {
              propStr += ` (${prop.accessModifier})`;
            }

            // Add static indicator if applicable
            if (prop.isStatic) {
              propStr += ' (static)';
            }

            // Process property comment with semantic preservation
            const processedPropComment = commentProcessor.processComment(prop.comment, {
              type: 'property',
              name: prop.name,
              parentClass: classInfo.name
            });
            if (processedPropComment) {
              propStr += ` - ${processedPropComment}`;
            }

            markdown += `${propStr}\n`;
          });
          markdown += '\n';
        }

        if (classInfo.methods.length > 0) {
          markdown += '**Methods:**\n\n';
          classInfo.methods.forEach(method => {
            // Process method comment with semantic preservation
            const processedMethodComment = commentProcessor.processComment(method.comment, {
              type: 'method',
              name: method.name,
              parentClass: classInfo.name
            });
            markdown += `- \`${method.name}()\`${processedMethodComment ? ` - ${processedMethodComment}` : ''}\n`;
          });
          markdown += '\n';
        }
      });
    }

    if (fileInfo.functions.length > 0) {
      markdown += '#### Functions\n\n';
      fileInfo.functions.forEach(funcInfo => {
        // Process function comment with semantic preservation
        const processedFuncComment = commentProcessor.processComment(funcInfo.comment, {
          type: 'function',
          name: funcInfo.name
        });
        markdown += `- \`${funcInfo.name}()\`${processedFuncComment ? ` - ${processedFuncComment}` : ''}\n`;
      });
      markdown += '\n';
    }

    markdown += '---\n\n';
  });

  // Add summary for filtered files
  const filteredCount = optimizedFilesInfo.length - importantFiles.length;
  if (filteredCount > 0) {
    markdown += `\n*${filteredCount} additional files with lower importance scores were excluded from detailed breakdown.*\n\n`;
  }

  // Write the Markdown content to the output file
  await writeFileSecure(outputPath, markdown, config.allowedMappingDirectory, 'utf-8', outputDir);

  logger.info(`Generated Markdown output: ${outputPath}`);
  return outputPath;
}

/**
 * Generates split Markdown output files.
 * @param allFilesInfo Array of file information objects
 * @param fileDependencyGraph File dependency graph
 * @param classInheritanceGraph Class inheritance graph
 * @param functionCallGraph Function call graph
 * @param config Code-Map Generator configuration
 * @param jobId Job ID for output file naming
 * @returns A promise that resolves to the main output file path
 */
async function generateSplitMarkdownOutput(
  allFilesInfo: FileInfo[],
  fileDependencyGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  classInheritanceGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  functionCallGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  config: CodeMapGeneratorConfig,
  _jobId: string
): Promise<string> {
  // Determine output directory and file prefix
  const outputDir = config.output?.outputDir || getOutputDirectory(config);
  const filePrefix = config.output?.filePrefix || 'code-map';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDirWithTimestamp = path.join(outputDir, `${filePrefix}-${timestamp}`);

  // Create the output directory
  await fs.mkdir(outputDirWithTimestamp, { recursive: true });

  // Generate the main index file
  const mainFilePath = path.join(outputDirWithTimestamp, 'index.md');
  let mainMarkdown = '# Code Map\n\n';

  // Add summary section
  mainMarkdown += '## Summary\n\n';
  mainMarkdown += `- Total Files: ${allFilesInfo.length}\n`;
  mainMarkdown += `- Total Classes: ${allFilesInfo.reduce((sum, file) => sum + file.classes.length, 0)}\n`;
  mainMarkdown += `- Total Functions: ${allFilesInfo.reduce((sum, file) => sum + file.functions.length, 0)}\n`;
  mainMarkdown += `- Total Methods: ${allFilesInfo.reduce((sum, file) => sum + file.classes.reduce((sum, cls) => sum + cls.methods.length, 0), 0)}\n\n`;

  // Add links to other sections
  mainMarkdown += '## Sections\n\n';
  mainMarkdown += '- [File Structure](file-structure.md)\n';
  mainMarkdown += '- [File Dependencies](file-dependencies.md)\n';
  mainMarkdown += '- [Class Inheritance](class-inheritance.md)\n';
  mainMarkdown += '- [Function Calls](function-calls.md)\n';
  mainMarkdown += '- [Method Call Sequence](method-call-sequence.md)\n';
  mainMarkdown += '- [File Details](file-details.md)\n\n';

  // Write the main index file
  await writeFileSecure(mainFilePath, mainMarkdown, config.allowedMappingDirectory, 'utf-8', outputDir);

  // Generate file structure file
  const fileStructurePath = path.join(outputDirWithTimestamp, 'file-structure.md');
  let fileStructureMarkdown = '# File Structure\n\n';
  fileStructureMarkdown += '[Back to Index](index.md)\n\n';
  fileStructureMarkdown += '```\n';

  // Group files by directory
  const filesByDir = new Map<string, string[]>();
  allFilesInfo.forEach(fileInfo => {
    const dir = path.dirname(fileInfo.relativePath);
    if (!filesByDir.has(dir)) {
      filesByDir.set(dir, []);
    }
    filesByDir.get(dir)!.push(path.basename(fileInfo.relativePath));
  });

  // Sort directories and files
  const sortedDirs = Array.from(filesByDir.keys()).sort();
  sortedDirs.forEach(dir => {
    const files = filesByDir.get(dir)!.sort();
    fileStructureMarkdown += `${dir}/\n`;
    files.forEach(file => {
      fileStructureMarkdown += `  ├── ${file}\n`;
    });
  });

  fileStructureMarkdown += '```\n';

  // Write the file structure file
  await writeFileSecure(fileStructurePath, fileStructureMarkdown, config.allowedMappingDirectory, 'utf-8', outputDir);

  // Generate file dependencies file - use optimized diagrams
  const fileDependenciesPath = path.join(outputDirWithTimestamp, 'file-dependencies.md');
  let fileDependenciesMarkdown = '# File Dependencies\n\n';
  fileDependenciesMarkdown += '[Back to Index](index.md)\n\n';

  // Import optimization components for split output
  const { UniversalDiagramOptimizer: SplitDiagramOptimizer } = await import('./optimization/universalDiagramOptimizer.js');
  const { EnhancementConfigManager: SplitConfigManager } = await import('./config/enhancementConfig.js');

  const splitDiagramOptimizer = new SplitDiagramOptimizer();
  const splitEnhancementConfig = SplitConfigManager.getInstance().getConfig();

  // Initialize comment processor for split output
  const splitCommentProcessor = new CommentProcessor(splitEnhancementConfig);

  // Use optimized diagram generation for split output
  const splitOptimizedDiagram = splitDiagramOptimizer.optimizeDependencyDiagram(
    fileDependencyGraph.nodes,
    fileDependencyGraph.edges,
    splitEnhancementConfig.universalOptimization
  );

  if (splitEnhancementConfig.universalOptimization.eliminateVerboseDiagrams) {
    // Use text summary (maximum optimization)
    fileDependenciesMarkdown += splitOptimizedDiagram + '\n';
  } else {
    // Fallback to mermaid (for backward compatibility)
    fileDependenciesMarkdown += '```mermaid\ngraph TD;\n';
    fileDependencyGraph.nodes.forEach(node => {
      fileDependenciesMarkdown += `  ${node.id.replace(/[^a-zA-Z0-9]/g, '_')}["${node.label}"];\n`;
    });
    fileDependencyGraph.edges.forEach(edge => {
      fileDependenciesMarkdown += `  ${edge.from.replace(/[^a-zA-Z0-9]/g, '_')} --> ${edge.to.replace(/[^a-zA-Z0-9]/g, '_')};\n`;
    });
    fileDependenciesMarkdown += '```\n';
  }

  // Write the file dependencies file
  await writeFileSecure(fileDependenciesPath, fileDependenciesMarkdown, config.allowedMappingDirectory, 'utf-8', outputDir);

  // Generate class inheritance file - use optimized diagrams
  const classInheritancePath = path.join(outputDirWithTimestamp, 'class-inheritance.md');
  let classInheritanceMarkdown = '# Class Inheritance\n\n';
  classInheritanceMarkdown += '[Back to Index](index.md)\n\n';

  // Use optimized diagram generation for split class inheritance
  const splitOptimizedClassDiagram = splitDiagramOptimizer.optimizeDependencyDiagram(
    classInheritanceGraph.nodes,
    classInheritanceGraph.edges,
    splitEnhancementConfig.universalOptimization
  );

  if (splitEnhancementConfig.universalOptimization.eliminateVerboseDiagrams) {
    // Use text summary (maximum optimization)
    classInheritanceMarkdown += splitOptimizedClassDiagram + '\n';
  } else {
    // Fallback to mermaid (for backward compatibility)
    classInheritanceMarkdown += '```mermaid\nclassDiagram;\n';
    classInheritanceGraph.nodes.forEach(node => {
      classInheritanceMarkdown += `  class ${node.id.replace(/[^a-zA-Z0-9]/g, '_')} "${node.label}";\n`;
    });
    classInheritanceGraph.edges.forEach(edge => {
      classInheritanceMarkdown += `  ${edge.from.replace(/[^a-zA-Z0-9]/g, '_')} <|-- ${edge.to.replace(/[^a-zA-Z0-9]/g, '_')};\n`;
    });
    classInheritanceMarkdown += '```\n';
  }

  // Write the class inheritance file
  await writeFileSecure(classInheritancePath, classInheritanceMarkdown, config.allowedMappingDirectory, 'utf-8', outputDir);

  // Generate function calls file - use optimized diagrams
  const functionCallsPath = path.join(outputDirWithTimestamp, 'function-calls.md');
  let functionCallsMarkdown = '# Function Calls\n\n';
  functionCallsMarkdown += '[Back to Index](index.md)\n\n';

  // Use optimized diagram generation for split function calls
  const splitOptimizedFunctionDiagram = splitDiagramOptimizer.optimizeDependencyDiagram(
    functionCallGraph.nodes,
    functionCallGraph.edges,
    splitEnhancementConfig.universalOptimization
  );

  if (splitEnhancementConfig.universalOptimization.eliminateVerboseDiagrams) {
    // Use text summary (maximum optimization)
    functionCallsMarkdown += splitOptimizedFunctionDiagram + '\n';
  } else {
    // Fallback to mermaid (for backward compatibility)
    functionCallsMarkdown += '```mermaid\ngraph TD;\n';
    functionCallGraph.nodes.forEach(node => {
      functionCallsMarkdown += `  ${node.id.replace(/[^a-zA-Z0-9]/g, '_')}["${node.label}"];\n`;
    });
    functionCallGraph.edges.forEach(edge => {
      functionCallsMarkdown += `  ${edge.from.replace(/[^a-zA-Z0-9]/g, '_')} --> ${edge.to.replace(/[^a-zA-Z0-9]/g, '_')};\n`;
    });
    functionCallsMarkdown += '```\n';
  }

  // Write the function calls file
  await writeFileSecure(functionCallsPath, functionCallsMarkdown, config.allowedMappingDirectory, 'utf-8', outputDir);

  // Generate method call sequence file
  const methodCallSequencePath = path.join(outputDirWithTimestamp, 'method-call-sequence.md');
  let methodCallSequenceMarkdown = '# Method Call Sequence\n\n';
  methodCallSequenceMarkdown += '[Back to Index](index.md)\n\n';

  // Generate the sequence diagram
  const sequenceDiagram = generateMermaidSequenceDiagram(
    functionCallGraph.nodes,
    functionCallGraph.edges
  );

  methodCallSequenceMarkdown += '```mermaid\n' + sequenceDiagram + '\n```\n';

  // Write the method call sequence file
  await writeFileSecure(methodCallSequencePath, methodCallSequenceMarkdown, config.allowedMappingDirectory, 'utf-8', outputDir);

  // Generate file details file
  const fileDetailsPath = path.join(outputDirWithTimestamp, 'file-details.md');
  // Initialize file with header
  await writeFileSecure(fileDetailsPath, '# File Details\n\n[Back to Index](index.md)\n\n', config.allowedMappingDirectory, 'utf-8', outputDir);

  // Apply import optimization to all files for split output
  const splitOptimizedFilesInfo = splitDiagramOptimizer.optimizeFileInfos(allFilesInfo);

  // Process files in batches to avoid memory issues
  const batchSize = 10;
  for (let i = 0; i < splitOptimizedFilesInfo.length; i += batchSize) {
    const batch = splitOptimizedFilesInfo.slice(i, i + batchSize);
    let batchMarkdown = '';

    batch.forEach(fileInfo => {
      batchMarkdown += `## ${fileInfo.relativePath}\n\n`;

      // Process file comment with semantic preservation for split output
      const processedSplitFileComment = splitCommentProcessor.processComment(fileInfo.comment, {
        type: 'file',
        name: fileInfo.relativePath
      });
      if (processedSplitFileComment) {
        batchMarkdown += `${processedSplitFileComment}\n\n`;
      }

      if (fileInfo.imports.length > 0) {
        batchMarkdown += '### Imports\n\n';
        fileInfo.imports.forEach(imp => {
          // Show the actual import path even if it's "unknown"
          let displayPath = imp.path;

          // Handle unknown imports with detailed information if enabled
          if (imp.path === 'unknown' || imp.path.startsWith('module import')) {
            if (config.debug?.showDetailedImports) {
              // Show detailed information for unknown imports
              displayPath = imp.path;
            } else {
              // Use generic placeholder or imported items if available
              displayPath = (imp.importedItems && imp.importedItems.length > 0) ?
                `${imp.importedItems[0]} (imported)` : 'module import';
            }
          }

          // Handle different import types
          let importType = '';
          if (imp.type) {
            switch (imp.type) {
              case 'dynamic':
                importType = ' (dynamic import)';
                break;
              case 'commonjs':
                importType = ' (CommonJS)';
                break;
              case 'extracted':
                importType = ' (extracted)';
                break;
            }
          }

          batchMarkdown += `- \`${displayPath}\`${importType}`;

          // Add imported items if available
          if (imp.importedItems && imp.importedItems.length > 0 && imp.path !== 'unknown') {
            if (Array.isArray(imp.importedItems) && typeof imp.importedItems[0] === 'string') {
              // Handle legacy string array format
              batchMarkdown += ` (${imp.importedItems.join(', ')})`;
            } else {
              // Handle new ImportedItem format
              batchMarkdown += '\n  - Imported items:';
              (imp.importedItems as unknown[]).forEach(item => {
                if (typeof item === 'string') {
                  batchMarkdown += `\n    - ${item}`;
                } else {
                  // Handle ImportedItem object
                  const importedItem = item as { isDefault?: boolean; isNamespace?: boolean; name: string; alias?: string };
                  if (importedItem.isDefault) {
                    batchMarkdown += `\n    - Default import: \`${importedItem.name}\``;
                  } else if (importedItem.isNamespace) {
                    batchMarkdown += `\n    - Namespace import: \`* as ${importedItem.name}\``;
                  } else {
                    batchMarkdown += `\n    - Named import: \`${importedItem.name}\``;
                    if (importedItem.alias) {
                      batchMarkdown += ` as \`${importedItem.alias}\``;
                    }
                  }
                }
              });
            }
          }

          // Prioritize absolute path, fall back to relative path
          if (imp.absolutePath) {
            const sanitizedPath = sanitizeAbsolutePath(imp.absolutePath, config.allowedMappingDirectory);
            batchMarkdown += `\n  - Absolute path: \`${sanitizedPath}\``;
          } else if (imp.resolvedPath && imp.resolvedPath !== imp.path) {
            batchMarkdown += `\n  - Resolved to: \`${imp.resolvedPath}\``;
          }

          // Process import comment with semantic preservation for split output
          const processedSplitImportComment = splitCommentProcessor.processComment(imp.comment, {
            type: 'import',
            name: imp.path
          });
          if (processedSplitImportComment) {
            batchMarkdown += ` - ${processedSplitImportComment}`;
          }

          batchMarkdown += '\n';
        });
        batchMarkdown += '\n';
      }

      if (fileInfo.classes.length > 0) {
        batchMarkdown += '### Classes\n\n';
        fileInfo.classes.forEach(classInfo => {
          batchMarkdown += `#### ${classInfo.name}\n\n`;

          // Process class comment with semantic preservation for split output
          const processedSplitClassComment = splitCommentProcessor.processComment(classInfo.comment, {
            type: 'class',
            name: classInfo.name
          });
          if (processedSplitClassComment) {
            batchMarkdown += `${processedSplitClassComment}\n\n`;
          }

          if (classInfo.parentClass) {
            batchMarkdown += `Extends: \`${classInfo.parentClass}\`\n\n`;
          }

          if (classInfo.properties.length > 0) {
            batchMarkdown += '**Properties:**\n\n';
            classInfo.properties.forEach(prop => {
              // Format property with type, access modifier, and static indicator
              let propStr = `- \`${prop.name}\``;

              // Add type if available
              if (prop.type) {
                propStr += `: \`${prop.type}\``;
              }

              // Add access modifier if available
              if (prop.accessModifier) {
                propStr += ` (${prop.accessModifier})`;
              }

              // Add static indicator if applicable
              if (prop.isStatic) {
                propStr += ' (static)';
              }

              // Process property comment with semantic preservation for split output
              const processedSplitPropComment = splitCommentProcessor.processComment(prop.comment, {
                type: 'property',
                name: prop.name,
                parentClass: classInfo.name
              });
              if (processedSplitPropComment) {
                propStr += ` - ${processedSplitPropComment}`;
              }

              batchMarkdown += `${propStr}\n`;
            });
            batchMarkdown += '\n';
          }

          if (classInfo.methods.length > 0) {
            batchMarkdown += '**Methods:**\n\n';
            classInfo.methods.forEach(method => {
              // Process method comment with semantic preservation for split output
              const processedSplitMethodComment = splitCommentProcessor.processComment(method.comment, {
                type: 'method',
                name: method.name,
                parentClass: classInfo.name
              });
              batchMarkdown += `- \`${method.name}()\`${processedSplitMethodComment ? ` - ${processedSplitMethodComment}` : ''}\n`;
            });
            batchMarkdown += '\n';
          }
        });
      }

      if (fileInfo.functions.length > 0) {
        batchMarkdown += '### Functions\n\n';
        fileInfo.functions.forEach(funcInfo => {
          // Process function comment with semantic preservation for split output
          const processedSplitFuncComment = splitCommentProcessor.processComment(funcInfo.comment, {
            type: 'function',
            name: funcInfo.name
          });
          batchMarkdown += `- \`${funcInfo.name}()\`${processedSplitFuncComment ? ` - ${processedSplitFuncComment}` : ''}\n`;
        });
        batchMarkdown += '\n';
      }

      batchMarkdown += '---\n\n';
    });

    // Append the batch markdown to the file details file
    await fs.appendFile(fileDetailsPath, batchMarkdown);
  }

  logger.info(`Generated split Markdown output in directory: ${outputDirWithTimestamp}`);
  return mainFilePath;
}

/**
 * Generates a JSON output for the code map.
 * @param allFilesInfo Array of file information objects
 * @param config Code-Map Generator configuration
 * @param jobId Job ID for output file naming
 * @returns A promise that resolves to the output file path
 */
export async function generateJsonOutput(
  allFilesInfo: FileInfo[],
  config: CodeMapGeneratorConfig,
  _jobId: string
): Promise<string> {
  // Determine output directory and file name
  const outputDir = config.output?.outputDir || getOutputDirectory(config);
  const filePrefix = config.output?.filePrefix || 'code-map';
  const fileName = generateTimestampFileName(filePrefix, 'json');
  const outputPath = path.join(outputDir, fileName);

  // Apply import optimization to JSON output as well
  const { UniversalDiagramOptimizer: JsonDiagramOptimizer } = await import('./optimization/universalDiagramOptimizer.js');
  const jsonDiagramOptimizer = new JsonDiagramOptimizer();
  const jsonOptimizedFilesInfo = jsonDiagramOptimizer.optimizeFileInfos(allFilesInfo);

  // Create a sanitized version of the code map for JSON output
  const codeMap: CodeMap = {
    projectPath: config.allowedMappingDirectory || '',
    files: jsonOptimizedFilesInfo
  };

  const sanitizedCodeMap = {
    projectPath: codeMap.projectPath,
    files: codeMap.files.map(file => ({
      path: file.filePath,
      relativePath: file.relativePath,
      language: path.extname(file.filePath),
      imports: file.imports.map(importInfo => ({
        path: importInfo.path,
        type: importInfo.type,
        resolvedPath: importInfo.resolvedPath,
        absolutePath: importInfo.absolutePath ?
          sanitizeAbsolutePath(importInfo.absolutePath, config.allowedMappingDirectory) :
          undefined,
        importedItems: importInfo.importedItems,
        isExternalPackage: importInfo.isExternalPackage,
        startLine: importInfo.startLine,
        endLine: importInfo.endLine
      })),
      classes: file.classes.map(classInfo => ({
        name: classInfo.name,
        isAbstract: classInfo.isAbstract,
        extends: classInfo.extends,
        implements: classInfo.implements,
        comment: classInfo.comment,
        startLine: classInfo.startLine,
        endLine: classInfo.endLine,
        methods: classInfo.methods.map(method => ({
          name: method.name,
          parameters: method.parameters,
          returnType: method.returnType,
          accessModifier: method.accessModifier,
          isStatic: method.isStatic,
          comment: method.comment,
          startLine: method.startLine,
          endLine: method.endLine
        })),
        properties: classInfo.properties.map(prop => ({
          name: prop.name,
          type: prop.type,
          accessModifier: prop.accessModifier,
          isStatic: prop.isStatic,
          comment: prop.comment,
          startLine: prop.startLine,
          endLine: prop.endLine
        }))
      })),
      functions: file.functions.map(func => ({
        name: func.name,
        parameters: func.parameters,
        returnType: func.returnType,
        comment: func.comment,
        startLine: func.startLine,
        endLine: func.endLine
      }))
    }))
  };

  // Convert to JSON string with pretty formatting
  const jsonContent = JSON.stringify(sanitizedCodeMap, null, 2);

  // Write the JSON content to the output file
  await writeFileSecure(outputPath, jsonContent, config.allowedMappingDirectory, 'utf-8', outputDir);

  logger.info(`Generated JSON output: ${outputPath}`);
  return outputPath;
}

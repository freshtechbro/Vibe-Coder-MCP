#!/usr/bin/env node

/**
 * Interactive CLI for the Code-Map Generator tool.
 * This script provides a command-line interface for using the code-map-generator tool.
 *
 * Usage:
 *   npm run build
 *   node build/tools/code-map-generator/code-map-cli.js [options]
 *
 * Options:
 *   --path <directory>                 Directory to scan (required if not using interactive mode)
 *   --ignore <patterns>                Comma-separated glob patterns to ignore
 *   --output-format <format>           Output format (markdown or json)
 *   --output-dir <directory>           Directory to save output files
 *   --interactive                      Run in interactive mode
 *   --help                             Show help
 *
 * Environment Variables:
 *   CODE_MAP_ALLOWED_DIR               Directory allowed for scanning (security boundary)
 *   VIBE_CODER_OUTPUT_DIR              Directory for saving output files (security boundary)
 *
 * Examples:
 *   - Scan the src directory: --path ./src
 *   - Ignore test files and node_modules: --ignore "*.test.*,node_modules"
 *   - Run in interactive mode: --interactive
 *   - Set allowed directory: CODE_MAP_ALLOWED_DIR=/path/to/project
 */

import path from 'path';
import readline from 'readline';
import { program } from 'commander';
import { executeCodeMapGeneration } from './index.js';
import { extractCodeMapConfig } from './configValidator.js';
import { CodeMapGeneratorConfig } from './types.js';
import { EnhancementConfigManager } from './config/enhancementConfig.js';

// Configure the CLI
program
  .name('code-map-cli')
  .description('CLI tool for the Code-Map Generator')
  .version('1.0.0')
  .option('-p, --path <directory>', 'Directory to scan')
  .option('-i, --ignore <patterns>', 'Comma-separated glob patterns to ignore')
  .option('-f, --output-format <format>', 'Output format (markdown or json)', 'markdown')
  .option('-o, --output-dir <directory>', 'Directory to save output files')
  .option('-s, --split-output', 'Split output into multiple files (default: false)')
  .option('--incremental', 'Use incremental processing (default: true)')
  .option('--no-incremental', 'Disable incremental processing')
  .option('--optimization-level <level>', 'Optimization level: conservative, balanced, aggressive, maximum (default: maximum)')
  .option('--focus-public-interfaces', 'Focus on public interfaces only (maximum token reduction)')
  .option('--eliminate-diagrams', 'Replace verbose mermaid diagrams with text summaries')
  .option('--adaptive', 'Enable adaptive optimization based on codebase characteristics')
  .option('--quality-threshold <number>', 'Minimum quality threshold (90-98)', '90')
  .option('--disable-optimizations', 'Disable all optimizations (backward compatibility)')
  .option('--interactive', 'Run in interactive mode')
  .option('--help', 'Show help');

/**
 * Process a natural language query into parameters for the code-map-generator
 * @param {string} query - Natural language query
 * @returns {object} - Parameters for the code-map-generator
 */
function processNaturalLanguageQuery(query: string): Record<string, unknown> {
  // This is a simple implementation that looks for key phrases
  // In a real implementation, this would use more sophisticated NLP techniques

  const params: Record<string, unknown> = {
    output_format: 'markdown'
  };

  // Extract path information
  const pathMatch = query.match(/in\s+(?:the\s+)?(?:directory|folder|path)?\s*['""]?([^'""]+)['""]?/i) ||
                    query.match(/(?:directory|folder|path)\s*['""]?([^'""]+)['""]?/i) ||
                    query.match(/(?:map|analyze|scan)\s+['""]?([^'""]+)['""]?/i);

  if (pathMatch) {
    params.path = pathMatch[1].trim();
  }

  // Extract ignore patterns
  const ignoreMatch = query.match(/ignore\s+([^.]+)/i);
  if (ignoreMatch) {
    const ignoreText = ignoreMatch[1];
    // Extract patterns in quotes or words separated by commas or "and"
    const patterns: string[] = [];

    // Look for quoted patterns
    const quotedPatterns = ignoreText.match(/['""](.*?)['""]|`(.*?)`/g);
    if (quotedPatterns) {
      quotedPatterns.forEach(pattern => {
        patterns.push(pattern.replace(/['""`]/g, ''));
      });
    }

    // If no quoted patterns, try to extract from text
    if (patterns.length === 0) {
      const textPatterns = ignoreText.split(/,|\s+and\s+/).map(p => p.trim());
      patterns.push(...textPatterns.filter(p => p.length > 0));
    }

    if (patterns.length > 0) {
      // Convert common terms to glob patterns
      params.ignored_files_patterns = patterns.map(p => {
        if (p === 'tests' || p === 'test files') return '**/__tests__/**';
        if (p === 'node_modules') return '**/node_modules/**';
        if (p === 'test files') return '**/*.test.*';
        return p;
      });
    }
  }

  return params;
}

/**
 * Run the code-map-generator with the given parameters
 * @param {object} params - Parameters for the code-map-generator
 * @param {CodeMapGeneratorConfig} config - Configuration for the code-map-generator
 */
async function runCodeMap(params: Record<string, unknown>, config: CodeMapGeneratorConfig): Promise<void> {
  console.log('Running code-map-generator with parameters:', JSON.stringify(params, null, 2));
  console.log('Using configuration:', JSON.stringify({
    allowedMappingDirectory: config.allowedMappingDirectory,
    outputDir: config.output?.outputDir || 'default output directory'
  }, null, 2));

  try {
    // Generate a job ID for tracking
    const jobId = `cli-job-${Date.now()}`;

    // Execute the code map generation
    const result = await executeCodeMapGeneration(
      params,
      {
        baseUrl: '',
        apiKey: '',
        geminiModel: '',
        perplexityModel: '',
        llm_mapping: {}
      }, // Minimal OpenRouterConfig
      { sessionId: 'cli-session', transportType: 'stdio' }, // Mock context
      jobId
    );

    if (result.isError) {
      console.log('\nERROR:', result.content[0].text);
    } else {
      console.log('\nSuccess! Code map generated.');

      // Display a preview
      console.log('\nPreview:');
      if (result.content && result.content.length > 0) {
        const firstContent = result.content[0];
        if (typeof firstContent.text === 'string') {
          // Show just the first few lines for preview
          const previewLines = firstContent.text.split('\n').slice(0, 10);
          console.log(previewLines.join('\n') + '\n...[truncated]');
        }
      }

      // Show output location
      if (result.content && result.content.length > 1 && typeof result.content[1].text === 'string') {
        const outputMatch = result.content[1].text.match(/saved to: (.+)/);
        if (outputMatch) {
          console.log(`\nFull output saved to: ${outputMatch[1]}`);
        }
      }
    }
  } catch (error) {
    console.error('Error executing code-map-generator:', error);
  }
}

/**
 * Start the interactive CLI
 */
function startInteractiveCLI(config: CodeMapGeneratorConfig): void {
  console.log('=== Code-Map Generator Interactive CLI ===');
  console.log('Enter a natural language query to generate a code map, or "exit" to quit.');
  console.log('Example: "Map the src/services directory and ignore tests"');
  console.log('');

  // Create readline interface for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function promptUser(): void {
    rl.question('> ', async (query) => {
      if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
        console.log('Goodbye!');
        rl.close();
        return;
      }

      // Process the query
      const params = processNaturalLanguageQuery(query);
      await runCodeMap(params, config);

      // Prompt again
      promptUser();
    });
  }

  promptUser();
}

/**
 * Main function to run the CLI
 */
async function main(): Promise<void> {
  program.parse(process.argv);
  const options = program.opts();

  // Show help if requested
  if (options.help) {
    program.outputHelp();
    return;
  }

  // Load configuration
  const config: CodeMapGeneratorConfig = {
    allowedMappingDirectory: process.env.CODE_MAP_ALLOWED_DIR || process.cwd(),
    output: {
      outputDir: process.env.VIBE_CODER_OUTPUT_DIR ?
        path.join(process.env.VIBE_CODER_OUTPUT_DIR, 'code-map-generator') :
        path.join(process.cwd(), 'vibecoderoutput', 'code-map-generator'),
      format: 'markdown',
      splitOutput: false // Default to single file output
    },
    cache: {
      enabled: true,
      useFileBasedAccess: true,
      useFileHashes: true,
      maxCachedFiles: 0 // Disable in-memory caching of file content
    },
    processing: {
      incremental: true, // Enable incremental processing by default
      incrementalConfig: {
        useFileHashes: true,
        useFileMetadata: true,
        saveProcessedFilesList: true
      }
    },
    importResolver: {
      enabled: true,
      expandSecurityBoundary: true,
      enhanceImports: true
    },
    featureFlags: {
      enhancedFunctionDetection: true,
      contextAnalysis: true,
      frameworkDetection: true,
      roleIdentification: true,
      heuristicNaming: true,
      memoryOptimization: true
    }
  };

  // MAXIMUM AGGRESSIVE: Apply CLI optimization options
  const enhancementManager = EnhancementConfigManager.getInstance();

  // Apply optimization level (default: maximum)
  const optimizationLevel = options.optimizationLevel || 'maximum';
  enhancementManager.setOptimizationLevel(optimizationLevel as 'conservative' | 'balanced' | 'maximum');

  // Apply specific optimization flags
  if (options.disableOptimizations) {
    enhancementManager.disableOptimizations();
    console.log('Optimizations disabled for backward compatibility');
  } else {
    // Enable maximum aggressive by default
    enhancementManager.enableAggressiveOptimizations();

    // Apply specific flags
    const enhancementConfig = enhancementManager.getConfig();
    if (options.focusPublicInterfaces) {
      enhancementConfig.universalOptimization.focusOnPublicInterfaces = true;
      enhancementConfig.universalOptimization.reduceClassDetails = true;
    }
    if (options.eliminateDiagrams) {
      enhancementConfig.universalOptimization.eliminateVerboseDiagrams = true;
    }
    if (options.adaptive) {
      enhancementConfig.universalOptimization.adaptiveOptimization = true;
    }
    if (options.qualityThreshold) {
      const threshold = parseInt(options.qualityThreshold);
      if (threshold >= 90 && threshold <= 98) {
        enhancementConfig.qualityThresholds.minSemanticCompleteness = threshold;
      }
    }

    enhancementManager.updateConfig(enhancementConfig);
    console.log(`Enhanced Code Map Generator configured with ${optimizationLevel} optimization level`);
  }

  // Validate the configuration
  try {
    // Create a mock OpenRouterConfig with our code-map config
    const mockConfig = {
      baseUrl: '',
      apiKey: '',
      geminiModel: '',
      perplexityModel: '',
      llm_mapping: {},
      config: {
        'map-codebase': config
      }
    };
    await extractCodeMapConfig(mockConfig);
  } catch (error) {
    console.error('Configuration error:', error);
    return;
  }

  // Run in interactive mode if requested
  if (options.interactive) {
    startInteractiveCLI(config);
    return;
  }

  // Check if path is provided
  if (!options.path) {
    console.error('Error: --path is required when not in interactive mode');
    program.outputHelp();
    return;
  }

  // Build parameters from command line options
  const params: Record<string, unknown> = {
    path: options.path,
    output_format: options.outputFormat || 'markdown'
  };

  // Add ignore patterns if provided
  if (options.ignore) {
    params.ignored_files_patterns = options.ignore.split(',').map((p: string) => p.trim());
  }

  // Add output directory if provided
  if (options.outputDir) {
    config.output = {
      ...config.output,
      outputDir: options.outputDir
    };
  }

  // Set split output if specified
  if (options.splitOutput) {
    config.output = {
      ...config.output,
      splitOutput: true
    };
  }

  // Set incremental processing option if specified
  if (options.incremental !== undefined) {
    config.processing = {
      ...config.processing,
      incremental: options.incremental
    };
  }

  // Run the code map generator
  await runCodeMap(params, config);
}

// Run the CLI
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

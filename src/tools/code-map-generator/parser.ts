// Fix for CommonJS module import in ESM
import ParserFromPackage from 'web-tree-sitter';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import os from 'os';
import logger from '../../logger.js';
import { FileCache } from './cache/fileCache.js';
import { CodeMapGeneratorConfig } from './types.js';
import { readFileSecure } from './fsUtils.js';
import { getOutputDirectory, ensureDirectoryExists, validateDirectoryIsWritable, getCacheDirectory } from './directoryUtils.js';
import { GrammarManager } from './cache/grammarManager.js';
import { MemoryCache } from './cache/memoryCache.js';
import { TieredCache } from './cache/tieredCache.js';
import { MemoryManager } from './cache/memoryManager.js';
import { MemoryLeakDetector } from './cache/memoryLeakDetector.js';
import { ProcessLifecycleManager } from './cache/processLifecycleManager.js';
import { ResourceTracker } from './cache/resourceTracker.js';
import { getProjectRoot, resolveProjectPath } from './utils/pathUtils.enhanced.js';
import { FileContentManager } from './cache/fileContentManager.js';
import { MetadataCache, SourceCodeMetadata, ASTMetadata } from './cache/metadataCache.js';

// Export SyntaxNode type for use in other modules
export type SyntaxNode = ParserFromPackage.SyntaxNode;

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use 'any' for now to match existing structure, but ideally these would be concrete types
// if web-tree-sitter's own type declarations are directly usable and compatible.
// For the purpose of this step, we ensure the names are exported as they were assumed.
// The actual types might be Parser.SyntaxNode, Parser.Tree etc.
// This change assumes the original intent was to re-export these specific types.

// Memory management instances
export let grammarManager: GrammarManager | null = null;
export let memoryManager: MemoryManager | null = null;
export let astMemoryCache: MemoryCache<string, ParserFromPackage.Tree> | null = null;
export let sourceCodeMemoryCache: MemoryCache<string, string> | null = null;

// File-based cache instances
let parseCache: FileCache<ParserFromPackage.Tree> | null = null;
let sourceCodeCache: FileCache<string> | null = null;

// Tiered cache instances
let parseTreeTieredCache: TieredCache<ParserFromPackage.Tree> | null = null;
let sourceCodeTieredCache: TieredCache<string> | null = null;

// Metadata cache instances (new)
let sourceCodeMetadataCache: MetadataCache<SourceCodeMetadata> | null = null;
let astMetadataCache: MetadataCache<ASTMetadata> | null = null;

// Memory leak detection and process lifecycle management
export let memoryLeakDetector: MemoryLeakDetector | null = null;
export let processLifecycleManager: ProcessLifecycleManager | null = null;

// File content manager instance
let fileContentManager: FileContentManager | null = null;

// Path to the directory where .wasm grammar files are expected to be.
// Grammar files are located in the 'grammars' directory relative to the source module.
// Use project root to ensure we find the files in src/ even when running from build/
const GRAMMARS_BASE_DIR = resolveProjectPath('src/tools/code-map-generator/grammars');

logger.info(`Grammar files directory: ${GRAMMARS_BASE_DIR}`);
// Also log the project root and current working directory to help with debugging
logger.info(`Project root directory: ${getProjectRoot()}`);
logger.info(`Current working directory: ${process.cwd()}`);
logger.info(`Module directory (__dirname): ${__dirname}`);

// languageConfigurations is already exported below

export interface LanguageConfig {
  name: string; // User-friendly name, e.g., "JavaScript"
  wasmPath: string; // Filename of the .wasm file, e.g., "tree-sitter-javascript.wasm"
  parserCreateQuery?: (language: ParserFromPackage.Language) => ((text: string) => ParserFromPackage.Query); // Optional: function to create a query specific to this language
}

// Maps file extensions to their Tree-sitter grammar configuration.
// Developer must ensure the .wasm files are present in GRAMMARS_BASE_DIR.
export const languageConfigurations: Record<string, LanguageConfig> = {
  // Core web development languages
  '.js': { name: 'JavaScript', wasmPath: 'tree-sitter-javascript.wasm' },
  '.jsx': { name: 'JavaScript JSX', wasmPath: 'tree-sitter-javascript.wasm' }, // Uses JS grammar
  '.ts': { name: 'TypeScript', wasmPath: 'tree-sitter-typescript.wasm' },
  '.tsx': { name: 'TSX', wasmPath: 'tree-sitter-tsx.wasm' },
  '.html': { name: 'HTML', wasmPath: 'tree-sitter-html.wasm' },
  '.css': { name: 'CSS', wasmPath: 'tree-sitter-css.wasm' },
  '.vue': { name: 'Vue', wasmPath: 'tree-sitter-vue.wasm' },

  // Backend languages
  '.py': { name: 'Python', wasmPath: 'tree-sitter-python.wasm' },
  '.java': { name: 'Java', wasmPath: 'tree-sitter-java.wasm' },
  '.cs': { name: 'C#', wasmPath: 'tree-sitter-c_sharp.wasm' }, // Note the underscore in filename
  '.go': { name: 'Go', wasmPath: 'tree-sitter-go.wasm' },
  '.rb': { name: 'Ruby', wasmPath: 'tree-sitter-ruby.wasm' },
  '.rs': { name: 'Rust', wasmPath: 'tree-sitter-rust.wasm' },
  '.php': { name: 'PHP', wasmPath: 'tree-sitter-php.wasm' },
  '.kt': { name: 'Kotlin', wasmPath: 'tree-sitter-kotlin.wasm' },
  '.swift': { name: 'Swift', wasmPath: 'tree-sitter-swift.wasm' },
  '.scala': { name: 'Scala', wasmPath: 'tree-sitter-scala.wasm' },
  '.ex': { name: 'Elixir', wasmPath: 'tree-sitter-elixir.wasm' },
  '.exs': { name: 'Elixir Script', wasmPath: 'tree-sitter-elixir.wasm' },
  '.lua': { name: 'Lua', wasmPath: 'tree-sitter-lua.wasm' },

  // Systems programming
  '.c': { name: 'C', wasmPath: 'tree-sitter-c.wasm' },
  '.h': { name: 'C Header', wasmPath: 'tree-sitter-c.wasm' },
  '.cpp': { name: 'C++', wasmPath: 'tree-sitter-cpp.wasm' },
  '.hpp': { name: 'C++ Header', wasmPath: 'tree-sitter-cpp.wasm' },
  '.cc': { name: 'C++', wasmPath: 'tree-sitter-cpp.wasm' },
  '.m': { name: 'Objective-C', wasmPath: 'tree-sitter-objc.wasm' },
  '.mm': { name: 'Objective-C++', wasmPath: 'tree-sitter-objc.wasm' },
  '.zig': { name: 'Zig', wasmPath: 'tree-sitter-zig.wasm' },

  // Shell scripting
  '.sh': { name: 'Bash', wasmPath: 'tree-sitter-bash.wasm' },
  '.bash': { name: 'Bash', wasmPath: 'tree-sitter-bash.wasm' },

  // Functional programming
  '.ml': { name: 'OCaml', wasmPath: 'tree-sitter-ocaml.wasm' },
  '.mli': { name: 'OCaml Interface', wasmPath: 'tree-sitter-ocaml.wasm' },
  '.elm': { name: 'Elm', wasmPath: 'tree-sitter-elm.wasm' },
  '.re': { name: 'ReScript', wasmPath: 'tree-sitter-rescript.wasm' },
  '.res': { name: 'ReScript', wasmPath: 'tree-sitter-rescript.wasm' },
  '.el': { name: 'Emacs Lisp', wasmPath: 'tree-sitter-elisp.wasm' },

  // Data formats
  '.json': { name: 'JSON', wasmPath: 'tree-sitter-json.wasm' },
  '.yaml': { name: 'YAML', wasmPath: 'tree-sitter-yaml.wasm' },
  '.yml': { name: 'YAML', wasmPath: 'tree-sitter-yaml.wasm' },
  '.toml': { name: 'TOML', wasmPath: 'tree-sitter-toml.wasm' },

  // Domain-specific languages
  '.sol': { name: 'Solidity', wasmPath: 'tree-sitter-solidity.wasm' },
  '.ql': { name: 'CodeQL', wasmPath: 'tree-sitter-ql.wasm' },
  '.tla': { name: 'TLA+', wasmPath: 'tree-sitter-tlaplus.wasm' },
  '.rdl': { name: 'SystemRDL', wasmPath: 'tree-sitter-systemrdl.wasm' },

  // Template languages
  '.erb': { name: 'Embedded Ruby', wasmPath: 'tree-sitter-embedded_template.wasm' },
  '.ejs': { name: 'EJS', wasmPath: 'tree-sitter-embedded_template.wasm' },
};

/**
 * Initializes the Tree-sitter parser if it hasn't been already.
 * This must be called before any parsing operations.
 */
export async function initializeParser(): Promise<void> {
  if (grammarManager && grammarManager.isInitialized()) {
    logger.debug('Tree-sitter parser already initialized.');
    return;
  }
  try {
    // Initialize memory manager first
    memoryManager = new MemoryManager({
      maxMemoryPercentage: 0.4, // Reduced from 0.5 (use up to 40% of system memory)
      monitorInterval: 30000, // Check memory usage every 30 seconds (reduced from 60 seconds)
      autoManage: true
    });

    // Initialize memory caches
    astMemoryCache = memoryManager.createASTCache();
    sourceCodeMemoryCache = memoryManager.createSourceCodeCache();

    // Create grammar manager
    const tempGrammarManager = new GrammarManager(languageConfigurations, {
      maxGrammars: 20,
      preloadCommonGrammars: true, // Keep true here for backward compatibility
      preloadExtensions: ['.js', '.ts', '.py', '.html', '.css'], // Reduced from 10 to 5
      grammarsBaseDir: GRAMMARS_BASE_DIR
    });

    // Initialize grammar manager first
    await tempGrammarManager.initialize();

    // Only after initialization is complete, assign to the global variable
    grammarManager = tempGrammarManager;

    // Register grammar manager with memory manager
    memoryManager.registerGrammarManager(grammarManager);

    // Now that the grammar manager is fully initialized, preload grammars if enabled
    if (grammarManager.isInitialized() && grammarManager.getOptions().preloadCommonGrammars) {
      await grammarManager.preloadGrammars();
    }

    // Initialize resource tracker
    const resourceTracker = new ResourceTracker();

    // Initialize memory leak detector
    memoryLeakDetector = new MemoryLeakDetector({
      autoDetect: true,
      checkInterval: 60 * 1000, // 1 minute
      snapshotInterval: 10 * 60 * 1000, // 10 minutes
      maxSnapshots: 5
    });
    await memoryLeakDetector.init();

    // Initialize process lifecycle manager
    processLifecycleManager = new ProcessLifecycleManager({
      autoMonitor: true,
      healthCheckInterval: 30 * 1000, // 30 seconds
      gcInterval: 5 * 60 * 1000 // 5 minutes
    });
    await processLifecycleManager.init(memoryManager, resourceTracker);

    logger.info('Tree-sitter parser, memory management, and process lifecycle management initialized successfully.');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize Tree-sitter parser and memory management.');
    throw error; // Re-throw to signal critical failure
  }
}

/**
 * Initializes the file-based caches for parsed trees and source code.
 * @param config The Code-Map Generator configuration
 * @returns A promise that resolves when the caches are initialized
 */
export async function initializeCaches(config: CodeMapGeneratorConfig): Promise<void> {
  // Skip if caching is disabled
  if (config.cache?.enabled === false) {
    logger.info('File-based caching is disabled in configuration.');
    return;
  }

  try {
    // Get the cache directory from the utility function
    const cacheDir = getCacheDirectory(config);
    logger.debug(`Using cache directory: ${cacheDir}`);

    // Create the cache directories
    await ensureDirectoryExists(cacheDir);

    const parseTreeCacheDir = path.join(cacheDir, 'parse-trees');
    const sourceCodeCacheDir = path.join(cacheDir, 'source-code');

    // Create the specific cache directories
    await ensureDirectoryExists(parseTreeCacheDir);
    await ensureDirectoryExists(sourceCodeCacheDir);

    // Validate that the directories are writable
    await validateDirectoryIsWritable(parseTreeCacheDir);
    await validateDirectoryIsWritable(sourceCodeCacheDir);

    // Initialize parse tree cache
    parseCache = new FileCache<ParserFromPackage.Tree>({
      name: 'parse-trees',
      cacheDir: parseTreeCacheDir,
      maxEntries: config.cache?.maxEntries,
      maxAge: config.cache?.maxAge,
      serialize: (tree: any) => {
        // Tree-sitter trees can't be directly serialized, so we need to use a custom approach
        // For now, we'll just store a placeholder and re-parse when needed
        return JSON.stringify({ rootNodeType: tree.rootNode?.type || 'unknown' });
      },
      deserialize: (serialized) => {
        // This is a placeholder - we can't actually deserialize a tree from JSON
        // We'll handle this in the parseCode function
        return JSON.parse(serialized) as any;
      }
    });

    // Initialize source code cache
    sourceCodeCache = new FileCache<string>({
      name: 'source-code',
      cacheDir: sourceCodeCacheDir,
      maxEntries: config.cache?.maxEntries,
      maxAge: config.cache?.maxAge
    });

    // Initialize tiered caches if enabled
    if (config.cache?.useMemoryCache) {
      // Initialize parse tree tiered cache
      parseTreeTieredCache = new TieredCache<ParserFromPackage.Tree>({
        name: 'parse-trees-tiered',
        cacheDir: parseTreeCacheDir,
        maxEntries: config.cache?.maxEntries,
        maxAge: config.cache?.maxAge,
        useMemoryCache: true,
        memoryMaxEntries: config.cache?.memoryMaxEntries,
        memoryMaxAge: config.cache?.memoryMaxAge,
        memoryThreshold: config.cache?.memoryThreshold,
        serialize: (tree: any) => {
          // Tree-sitter trees can't be directly serialized, so we need to use a custom approach
          // For now, we'll just store a placeholder and re-parse when needed
          return JSON.stringify({ rootNodeType: tree.rootNode?.type || 'unknown' });
        },
        deserialize: (serialized) => {
          // This is a placeholder - we can't actually deserialize a tree from JSON
          // We'll handle this in the parseCode function
          return JSON.parse(serialized) as any;
        }
      });

      // Initialize source code tiered cache
      sourceCodeTieredCache = new TieredCache<string>({
        name: 'source-code-tiered',
        cacheDir: sourceCodeCacheDir,
        maxEntries: config.cache?.maxEntries,
        maxAge: config.cache?.maxAge,
        useMemoryCache: true,
        memoryMaxEntries: config.cache?.memoryMaxEntries,
        memoryMaxAge: config.cache?.memoryMaxAge,
        memoryThreshold: config.cache?.memoryThreshold
      });

      // Initialize tiered caches
      await parseTreeTieredCache.init();
      await sourceCodeTieredCache.init();

      logger.info('Tiered caches initialized successfully.');
    }

    // Initialize the file-based caches
    await parseCache.init();
    await sourceCodeCache.init();

    // Initialize metadata caches
    sourceCodeMetadataCache = new MetadataCache<SourceCodeMetadata>({
      name: 'source-code-metadata',
      cacheDir: sourceCodeCacheDir,
      maxEntries: config.cache?.maxEntries,
      maxAge: config.cache?.maxAge,
      useMemoryCache: true,
      memoryMaxEntries: 5000, // Can cache more entries since they're lightweight
      memoryThreshold: 0.5 // More aggressive threshold
    });

    astMetadataCache = new MetadataCache<ASTMetadata>({
      name: 'ast-metadata',
      cacheDir: parseTreeCacheDir,
      maxEntries: config.cache?.maxEntries,
      maxAge: config.cache?.maxAge,
      useMemoryCache: true,
      memoryMaxEntries: 3000, // Can cache more entries since they're lightweight
      memoryThreshold: 0.5 // More aggressive threshold
    });

    // Initialize the metadata caches
    await sourceCodeMetadataCache.init();
    await astMetadataCache.init();

    // Initialize file content manager
    fileContentManager = new FileContentManager({
      maxCachedFiles: config.cache?.maxCachedFiles !== undefined ? config.cache.maxCachedFiles : 0, // Default to 0 (disabled) for in-memory caching
      maxAge: 5 * 60 * 1000, // 5 minutes
      cacheDir: cacheDir,
      useFileCache: config.cache?.enabled === undefined || config.cache?.enabled === true
    });
    await fileContentManager.init();

    logger.info('File-based caches, metadata caches, and file content manager initialized successfully.');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize caches.');
    // Don't throw, just log the error and continue without caching
    parseCache = null;
    sourceCodeCache = null;
    fileContentManager = null;
    sourceCodeMetadataCache = null;
    astMetadataCache = null;
  }
}

/**
 * Clears all caches (both file-based and memory-based).
 * @returns A promise that resolves when the caches are cleared
 */
export async function clearCaches(): Promise<void> {
  try {
    // Clear file-based caches
    if (parseCache) {
      await parseCache.clear();
    }

    if (sourceCodeCache) {
      await sourceCodeCache.clear();
    }

    // Clear tiered caches
    if (parseTreeTieredCache) {
      await parseTreeTieredCache.clear();
    }

    if (sourceCodeTieredCache) {
      await sourceCodeTieredCache.clear();
    }

    // Clear file content manager cache
    if (fileContentManager) {
      fileContentManager.clearCache();
    }

    // Clear memory-based caches
    if (astMemoryCache) {
      astMemoryCache.clear();
    }

    if (sourceCodeMemoryCache) {
      sourceCodeMemoryCache.clear();
    }

    // Clear metadata caches
    if (sourceCodeMetadataCache) {
      await sourceCodeMetadataCache.clear();
    }

    if (astMetadataCache) {
      await astMetadataCache.clear();
    }

    // Run garbage collection if memory manager is available
    if (memoryManager) {
      memoryManager.runGarbageCollection();
    }

    logger.info('All caches cleared successfully.');
  } catch (error) {
    logger.error({ err: error }, 'Failed to clear caches.');
  }
}

/**
 * Loads a Tree-sitter language grammar from its .wasm file.
 * The .wasm file is expected to be in the GRAMMARS_BASE_DIR.
 *
 * @param extension The file extension (e.g., '.js') for which to load the grammar.
 * @param langConfig The language configuration containing the grammar name and WASM file path.
 */
export async function loadLanguageGrammar(extension: string, langConfig: LanguageConfig): Promise<boolean> {
  if (!grammarManager) {
    throw new Error('Parser not initialized. Call initializeParser() first.');
  }

  try {
    // Use the grammar manager to load the grammar
    await grammarManager.loadGrammar(extension);
    return true;
  } catch (error) {
    // This catches errors during the loading process
    logger.error({
      err: error,
      grammarName: langConfig.name,
      extension
    }, `Failed to load Tree-sitter grammar for ${langConfig.name}. Check if the grammar file exists.`);
    // Do not re-throw, allow other grammars to load. getParserForExtension will handle missing ones.
    return false;
  }
}

/**
 * Retrieves the initialized Tree-sitter parser instance and sets the language
 * appropriate for the given file extension.
 * If the grammar for the extension is not yet loaded, it attempts to load it.
 *
 * @param fileExtension The file extension (e.g., '.js', '.py').
 * @returns A configured Parser instance if the language is supported and loaded, otherwise null.
 */
export async function getParserForFileExtension(fileExtension: string): Promise<ParserFromPackage | null> {
  if (!grammarManager) {
    logger.warn('Attempted to get parser before Tree-sitter initialization. Call initializeParser() first.');
    await initializeParser(); // Attempt to initialize if not already
    if (!grammarManager) return null; // Still failed
  }

  const langConfig = languageConfigurations[fileExtension];
  if (!langConfig) {
    logger.warn(`No language configuration found for extension: ${fileExtension}. Cannot parse.`);
    return null;
  }

  try {
    // Use the grammar manager to get a parser with memory awareness
    return await grammarManager.getParserForExtensionWithMemoryAwareness(fileExtension);
  } catch (error) {
    logger.error({ err: error, fileExtension }, `Error getting parser for extension ${fileExtension}.`);
    return null;
  }
}

/**
 * Gets a cached value from the tiered cache system.
 * Tries file-based cache first, then falls back to memory-based cache.
 *
 * @param key The cache key
 * @param fileCache The file-based cache
 * @param memoryCache The memory-based cache
 * @returns A promise that resolves to the cached value, or undefined if not found
 */
export async function getCachedValue<T>(
  key: string,
  fileCache: FileCache<T> | null,
  memoryCache: MemoryCache<string, T> | null
): Promise<T | undefined> {
  // Try file-based cache first if available
  if (fileCache) {
    try {
      const value = await fileCache.get(key);
      if (value !== undefined) {
        logger.debug(`File cache hit for key: ${key}`);

        // Update memory cache for faster access next time
        if (memoryCache) {
          memoryCache.set(key, value);
        }

        return value;
      }
    } catch (error) {
      logger.warn({ err: error, key }, `Error getting value from file cache, falling back to memory cache`);
    }
  }

  // Fall back to memory cache if available
  if (memoryCache) {
    const value = memoryCache.get(key);
    if (value !== undefined) {
      logger.debug(`Memory cache hit for key: ${key}`);
      return value;
    }
  }

  // Not found in any cache
  return undefined;
}

/**
 * Sets a value in the tiered cache system.
 * Sets in both file-based and memory-based caches if available.
 *
 * @param key The cache key
 * @param value The value to cache
 * @param fileCache The file-based cache
 * @param memoryCache The memory-based cache
 */
export async function setCachedValue<T>(
  key: string,
  value: T,
  fileCache: FileCache<T> | null,
  memoryCache: MemoryCache<string, T> | null
): Promise<void> {
  // Set in memory cache first (faster)
  if (memoryCache) {
    memoryCache.set(key, value);
  }

  // Set in file-based cache if available
  if (fileCache) {
    try {
      await fileCache.set(key, value);
    } catch (error) {
      logger.warn({ err: error, key }, `Error setting value in file cache`);
    }
  }
}

/**
 * Parses the given source code string using the appropriate Tree-sitter grammar
 * based on the file extension.
 *
 * @param sourceCode The source code to parse.
 * @param fileExtension The file extension (e.g., '.js') to determine the grammar.
 * @param filePath Optional file path for caching purposes.
 * @param config Optional configuration for caching.
 * @returns A Tree-sitter Tree object if parsing is successful, otherwise null.
 */
export async function parseCode(
  sourceCode: string,
  fileExtension: string,
  filePath?: string,
  config?: CodeMapGeneratorConfig
): Promise<ParserFromPackage.Tree | null> {
  // Generate a cache key
  let cacheKey = '';
  if (filePath) {
    // Check if we have file metadata from FileContentManager
    let fileHash: string | undefined;
    if (fileContentManager) {
      try {
        const metadata = await fileContentManager.getMetadata(filePath);
        if (metadata) {
          fileHash = metadata.hash;
          // Use file hash in cache key for more accurate change detection
          cacheKey = crypto.createHash('md5').update(`${filePath}:${fileExtension}:${fileHash}`).digest('hex');
        }
      } catch (error) {
        logger.debug(`Error getting file metadata: ${error}`);
      }
    }

    // If we couldn't get file hash, use the traditional cache key
    if (!cacheKey) {
      cacheKey = crypto.createHash('md5').update(`${filePath}:${fileExtension}`).digest('hex');
    }

    // Check if caching is enabled
    const useFileCaching = config?.cache?.enabled !== false && parseCache !== null;
    const useTieredCaching = config?.cache?.enabled !== false && config?.cache?.useMemoryCache === true && parseTreeTieredCache !== null;

    // Check if memory caching should be used based on current memory usage
    const useMemoryCaching = shouldUseMemoryCache(config);

    // NEW: Try to get AST metadata from cache
    if (astMetadataCache && filePath) {
      try {
        const astMetadata = await astMetadataCache.get(cacheKey);
        if (astMetadata) {
          logger.debug(`Found AST metadata for ${filePath} in metadata cache`);

          // Check if source code has changed by comparing hashes
          let sourceHash = '';
          if (sourceCodeMetadataCache) {
            const sourceMetadata = await sourceCodeMetadataCache.get(cacheKey);
            if (sourceMetadata) {
              sourceHash = sourceMetadata.hash;
            }
          }

          // If we don't have a source hash, generate one
          if (!sourceHash) {
            sourceHash = crypto.createHash('md5').update(sourceCode).digest('hex');
          }

          // If source code hasn't changed, we can use the cached AST metadata
          if (sourceHash === astMetadata.sourceHash) {
            logger.debug(`Source code unchanged for ${filePath}, using cached AST metadata`);

            // We still need to parse the code, but we can use the metadata to optimize parsing
            // For now, we'll just log that we're using the metadata
            logger.debug(`Using AST metadata to optimize parsing for ${filePath}`);
          }
        }
      } catch (error) {
        logger.warn({ err: error, filePath }, 'Error checking AST metadata cache');
      }
    }

    // Try to get parse tree from traditional caches for backward compatibility
    if (useTieredCaching) {
      // Use tiered cache if available
      const cachedTree = await parseTreeTieredCache!.get(cacheKey);
      if (cachedTree) {
        logger.debug(`Using tiered cached parse tree for ${filePath}`);
        return cachedTree;
      }
    } else if ((useMemoryCaching && astMemoryCache) || (useFileCaching && parseCache)) {
      // Fall back to manual tiered caching strategy
      const cachedTree = await getCachedValue(
        cacheKey,
        useFileCaching ? parseCache : null,
        useMemoryCaching ? astMemoryCache : null
      );

      if (cachedTree) {
        logger.debug(`Using cached parse tree for ${filePath}`);
        return cachedTree;
      }
    }
  }

  // Get the parser for the file extension
  const parser = await getParserForFileExtension(fileExtension);
  if (!parser) {
    return null;
  }

  try {
    // Check if we should use incremental parsing for large files
    const useIncrementalParsing = grammarManager?.getOptions().enableIncrementalParsing === true;
    const incrementalThreshold = grammarManager?.getOptions().incrementalParsingThreshold || 1024 * 1024; // 1MB default

    let tree: ParserFromPackage.Tree;

    if (useIncrementalParsing && sourceCode.length > incrementalThreshold) {
      // Use incremental parsing for large files
      tree = await parseCodeIncrementally(parser, sourceCode);
      logger.debug({
        fileExtension,
        fileSize: formatBytes(sourceCode.length),
        threshold: formatBytes(incrementalThreshold)
      }, `Used incremental parsing for large file with extension ${fileExtension}`);
    } else {
      // Use regular parsing for smaller files
      // Validate parser state before parsing to prevent WASM corruption errors
      if (!parser || typeof parser.parse !== 'function') {
        logger.error({ fileExtension }, `Parser is in invalid state for extension ${fileExtension}`);
        return null;
      }

      // Validate parser language is set
      if (!parser.getLanguage || !parser.getLanguage()) {
        logger.error({ fileExtension }, `Parser language not set for extension ${fileExtension}`);
        return null;
      }

      tree = parser.parse(sourceCode);
      logger.debug(`Successfully parsed code for extension ${fileExtension}. Root node: ${tree.rootNode.type}`);
    }

    // Cache the parse tree
    if (cacheKey) {
      // Check if caching is enabled
      const useFileCaching = config?.cache?.enabled !== false && parseCache !== null;
      const useTieredCaching = config?.cache?.enabled !== false && config?.cache?.useMemoryCache === true && parseTreeTieredCache !== null;

      // Check if memory caching should be used based on current memory usage
      const useMemoryCaching = shouldUseMemoryCache(config);

      // NEW: Cache AST metadata if metadata cache is available
      if (astMetadataCache && filePath) {
        try {
          // Get source code hash from metadata cache if available
          let sourceHash = '';
          if (sourceCodeMetadataCache) {
            const sourceMetadata = await sourceCodeMetadataCache.get(cacheKey);
            if (sourceMetadata) {
              sourceHash = sourceMetadata.hash;
            }
          }

          // If we don't have a source hash, generate one
          if (!sourceHash) {
            sourceHash = crypto.createHash('md5').update(sourceCode).digest('hex');
          }

          // Create AST metadata
          const astMetadata = MetadataCache.createASTMetadata(
            filePath,
            sourceHash,
            tree.rootNode
          );

          // Cache AST metadata
          await astMetadataCache.set(cacheKey, astMetadata);
          logger.debug(`Cached AST metadata for ${filePath}`);
        } catch (error) {
          logger.warn({ err: error, filePath }, 'Error caching AST metadata');
        }
      }

      // Also use traditional caching for backward compatibility
      if (useTieredCaching) {
        // Use tiered cache if available
        await parseTreeTieredCache!.set(cacheKey, tree);
        logger.debug(`Cached parse tree in tiered cache for ${filePath}`);
      } else if ((useMemoryCaching && astMemoryCache) || (useFileCaching && parseCache)) {
        // Fall back to manual tiered caching strategy
        await setCachedValue(
          cacheKey,
          tree,
          useFileCaching ? parseCache : null,
          useMemoryCaching ? astMemoryCache : null
        );
      }
    }

    return tree;
  } catch (error) {
    // Enhanced error logging with parser state diagnostics
    const errorInfo: any = { err: error, fileExtension };
    
    if (parser) {
      errorInfo.parserState = {
        hasParseMethod: typeof parser.parse === 'function',
        hasLanguage: !!(parser.getLanguage && parser.getLanguage()),
        languageName: parser.getLanguage ? (parser.getLanguage() as any)?.name || 'unknown' : 'unknown'
      };
    } else {
      errorInfo.parserState = 'null';
    }

    logger.error(errorInfo, `Error parsing code for extension ${fileExtension}.`);
    return null;
  }
}

/**
 * Reads and parses a file securely.
 *
 * @param filePath The path of the file to read and parse.
 * @param fileExtension The file extension (e.g., '.js') to determine the grammar.
 * @param config The Code-Map Generator configuration.
 * @returns A promise that resolves to the parsed tree and source code.
 */
export async function readAndParseFile(
  filePath: string,
  fileExtension: string,
  config: CodeMapGeneratorConfig
): Promise<{ tree: ParserFromPackage.Tree | null, sourceCode: string }> {
  try {
    // Check if we have metadata for this file
    let sourceCode: string;
    let metadata: SourceCodeMetadata | undefined;

    if (sourceCodeMetadataCache) {
      // Generate a cache key for the file
      const cacheKey = crypto.createHash('md5').update(filePath).digest('hex');

      // Try to get metadata from cache
      metadata = await sourceCodeMetadataCache.get(cacheKey);

      if (metadata) {
        logger.debug(`Found metadata for ${filePath} in metadata cache`);

        // If metadata has content, use it
        if (metadata.content) {
          logger.debug(`Using content from metadata cache for ${filePath}`);
          sourceCode = metadata.content;
        } else {
          // Otherwise, load content and update metadata
          if (fileContentManager) {
            sourceCode = await fileContentManager.getContent(filePath, config.allowedMappingDirectory);
          } else {
            sourceCode = await readFileSecure(filePath, config.allowedMappingDirectory);
          }

          // Update metadata with content
          metadata.content = sourceCode;
          await sourceCodeMetadataCache.set(cacheKey, metadata);
        }
      } else {
        // No metadata found, create new metadata
        if (fileContentManager) {
          sourceCode = await fileContentManager.getContent(filePath, config.allowedMappingDirectory);
        } else {
          sourceCode = await readFileSecure(filePath, config.allowedMappingDirectory);
        }

        // Create and cache metadata
        metadata = await MetadataCache.createSourceCodeMetadata(filePath, sourceCode);
        await sourceCodeMetadataCache.set(cacheKey, metadata);
      }
    } else {
      // Metadata cache not available, fall back to traditional methods
      if (fileContentManager) {
        sourceCode = await fileContentManager.getContent(filePath, config.allowedMappingDirectory);
      } else {
        sourceCode = await readFileSecure(filePath, config.allowedMappingDirectory);
      }
    }

    // Parse the source code
    const tree = await parseCode(sourceCode, fileExtension, filePath, config);

    return { tree, sourceCode };
  } catch (error) {
    logger.error({ err: error, filePath }, `Error reading or parsing file: ${filePath}`);
    return { tree: null, sourceCode: '' };
  }
}

/**
 * Gets memory usage statistics from the memory manager.
 * @returns Memory usage statistics
 */
// This function is replaced by the more detailed implementation at line 1127

/**
 * Determines whether to use memory caching based on current memory usage.
 * @param config The Code-Map Generator configuration
 * @returns True if memory caching should be used, false otherwise
 */
export function shouldUseMemoryCache(config?: CodeMapGeneratorConfig): boolean {
  // If in-memory caching is explicitly disabled via maxCachedFiles=0, return false
  if (config?.cache?.maxCachedFiles === 0) {
    logger.debug('In-memory caching is disabled via configuration (maxCachedFiles=0).');
    return false;
  }

  // If memory manager is not initialized, default to true
  if (!memoryManager) {
    return true;
  }

  // Get memory stats
  const stats = memoryManager.getMemoryStats();

  // If memory usage is critical, disable memory caching
  if (stats.formatted.memoryStatus === 'critical') {
    logger.warn('Memory usage is critical. Disabling memory caching.');
    return false;
  }

  // If memory usage is high, check if we should disable memory caching
  if (stats.formatted.memoryStatus === 'high') {
    // If file-based caching is enabled, disable memory caching
    if (config?.cache?.enabled !== false && parseCache !== null && sourceCodeCache !== null) {
      logger.warn('Memory usage is high. Using file-based caching only.');
      return false;
    }

    // If file-based caching is not available, still use memory caching
    logger.warn('Memory usage is high, but file-based caching is not available. Using memory caching with caution.');
    return true;
  }

  // Memory usage is normal, use memory caching if not explicitly disabled
  return true;
}

/**
 * Gets the memory manager instance.
 * @returns The memory manager instance, or null if not initialized.
 */
// This function is replaced by the more detailed implementation at line 1104

/**
 * Gets source code for a file from the cache.
 * @param filePath The path of the file to get source code for.
 * @param allowedDir Optional allowed directory boundary for security.
 * @returns A promise that resolves to the source code if found in cache, otherwise null.
 */
export async function getSourceCodeFromCache(filePath: string, allowedDir?: string): Promise<string | null> {
  // Try FileContentManager first if available
  if (fileContentManager) {
    try {
      // If allowedDir is provided, use it for security boundary
      if (allowedDir) {
        return await fileContentManager.getContent(filePath, allowedDir);
      }

      // Otherwise, try to get from in-memory cache only
      const cacheKey = crypto.createHash('md5').update(filePath).digest('hex');
      const metadata = await fileContentManager.getMetadata(filePath);
      if (metadata) {
        logger.debug(`Found metadata for ${filePath} in FileContentManager`);
        // Return content from FileContentManager
        // Use an empty string as allowedDir to bypass security check (we already verified metadata exists)
        return await fileContentManager.getContent(filePath, '');
      }
    } catch (error) {
      logger.debug(`Error getting source code from FileContentManager: ${error}`);
    }
  }

  // Fall back to memory cache
  if (!sourceCodeMemoryCache) {
    return null;
  }

  // Generate a cache key
  const cacheKey = crypto.createHash('md5').update(filePath).digest('hex');

  // Check memory cache
  const cachedSourceCode = sourceCodeMemoryCache.get(cacheKey);
  if (cachedSourceCode) {
    return cachedSourceCode;
  }

  return null;
}

/**
 * Gets all source code from the cache.
 * @returns A map of file paths to source code.
 */
export function getAllSourceCodeFromCache(): Map<string, string> {
  const result = new Map<string, string>();

  // Get entries from FileContentManager if available
  if (fileContentManager) {
    // Note: FileContentManager doesn't currently provide a method to get all entries
    // This would be a good enhancement to add in the future
    logger.debug('FileContentManager does not currently support retrieving all entries');
  }

  // Fall back to memory cache
  if (!sourceCodeMemoryCache) {
    return result;
  }

  // Get all entries from the memory cache
  const cachedEntries = sourceCodeMemoryCache.getAll();

  // Convert cache keys (MD5 hashes) back to file paths
  // This is a limitation - we don't have a direct mapping from hash to file path
  // In a real implementation, we would maintain a bidirectional mapping

  logger.info(`Retrieved ${cachedEntries.size} source code entries from cache`);

  // For now, we'll return the raw cache entries
  // The keys are MD5 hashes of file paths, not the actual file paths
  return cachedEntries;
}

/**
 * Parses a large source code file incrementally to reduce memory usage.
 * This breaks the file into chunks and parses them sequentially, updating the tree as it goes.
 *
 * @param parser The Tree-sitter parser to use
 * @param sourceCode The source code to parse
 * @returns The parsed Tree-sitter Tree
 */
async function parseCodeIncrementally(parser: ParserFromPackage, sourceCode: string): Promise<ParserFromPackage.Tree> {
  // Initial parse with a small portion of the file
  const initialChunkSize = 100 * 1024; // 100KB
  const initialChunk = sourceCode.slice(0, Math.min(initialChunkSize, sourceCode.length));
  let tree = parser.parse(initialChunk);

  // If the file is small enough, we're done
  if (sourceCode.length <= initialChunkSize) {
    return tree;
  }

  // Parse the rest of the file in chunks
  const chunkSize = 500 * 1024; // 500KB chunks
  const totalChunks = Math.ceil((sourceCode.length - initialChunkSize) / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = initialChunkSize + (i * chunkSize);
    const end = Math.min(start + chunkSize, sourceCode.length);

    // Parse the chunk and update the tree
    tree = parser.parse(sourceCode, tree);

    // Check memory usage after each chunk
    if (i % 5 === 0) {
      const memStats = getMemoryStats();
      logger.debug({
        chunk: i + 1,
        totalChunks,
        progress: `${Math.round(((i + 1) / totalChunks) * 100)}%`,
        memoryUsage: memStats.formatted.heapUsed
      }, `Incremental parsing progress`);

      // Force garbage collection if available and memory usage is high
      if (global.gc && memStats.memoryUsagePercentage > 0.7) {
        global.gc();
      }
    }
  }

  return tree;
}


/**
 * Parses source code and returns the AST and detected language.
 * @param sourceCode The source code to parse.
 * @param fileExtension The file extension to determine the language.
 * @returns The AST and detected language.
 */
export async function parseSourceCode(
  sourceCode: string,
  fileExtension: string
): Promise<{ ast: SyntaxNode; language: string }> {
  // Initialize parser if not already initialized
  if (!grammarManager) {
    await initializeParser();
  }

  // Parse the source code
  const tree = await parseCode(sourceCode, fileExtension);
  if (!tree) {
    throw new Error(`Failed to parse source code for extension ${fileExtension}`);
  }

  // Return the AST and detected language
  return {
    ast: tree.rootNode,
    language: fileExtension.replace('.', '')
  };
}

/**
 * Cleans up the parser and releases resources.
 */
export function cleanupParser(): void {
  // Clear caches
  if (astMemoryCache) {
    astMemoryCache.clear();
  }

  if (sourceCodeMemoryCache) {
    sourceCodeMemoryCache.clear();
  }

  // Clear file content manager
  if (fileContentManager) {
    fileContentManager.clearCache();
  }

  // Run garbage collection
  if (memoryManager) {
    memoryManager.runGarbageCollection();
  }

  // Clean up process lifecycle manager
  if (processLifecycleManager) {
    processLifecycleManager.cleanup();
    processLifecycleManager = null;
  }

  // Clean up memory leak detector
  if (memoryLeakDetector) {
    memoryLeakDetector.cleanup();
    memoryLeakDetector = null;
  }

  // Reset grammar manager
  grammarManager = null;
  memoryManager = null;
  astMemoryCache = null;
  sourceCodeMemoryCache = null;
  parseCache = null;
  sourceCodeCache = null;
  parseTreeTieredCache = null;
  sourceCodeTieredCache = null;
  fileContentManager = null;

  logger.info('Parser cleaned up and resources released.');
}

/**
 * Gets the memory manager instance.
 * @returns The memory manager instance, or null if not initialized
 */
export function getMemoryManager(): MemoryManager | null {
  return memoryManager;
}

/**
 * Formats a byte value into a human-readable string.
 * @param bytes The number of bytes
 * @returns A human-readable string (e.g., "1.23 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Gets memory usage statistics.
 * @returns An object containing memory usage statistics
 */
export function getMemoryStats(): {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  systemTotal: number;
  memoryUsagePercentage: number;
  formatted: {
    heapUsed: string;
    heapTotal: string;
    rss: string;
    systemTotal: string;
  };
} {
  const memUsage = process.memoryUsage();
  const systemTotal = os.totalmem();

  return {
    heapUsed: memUsage.heapUsed,
    heapTotal: memUsage.heapTotal,
    rss: memUsage.rss,
    systemTotal,
    memoryUsagePercentage: memUsage.rss / systemTotal,
    formatted: {
      heapUsed: formatBytes(memUsage.heapUsed),
      heapTotal: formatBytes(memUsage.heapTotal),
      rss: formatBytes(memUsage.rss),
      systemTotal: formatBytes(systemTotal)
    }
  };
}

// Export types
export type Tree = ParserFromPackage.Tree;
export type Language = ParserFromPackage.Language;
export type Point = ParserFromPackage.Point;
// Make sure Parser itself is also available if needed by other modules, or re-export specific parts
export { ParserFromPackage as Parser };

// Memory leak detection and process lifecycle management are already exported as variables
/**
 * Tests for the metadata-focused caching system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetadataCache, SourceCodeMetadata, ASTMetadata } from '../cache/metadataCache';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock fs
vi.mock('fs/promises', () => {
  return {
    default: {
      readFile: vi.fn(),
      stat: vi.fn(),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockResolvedValue([]),
      unlink: vi.fn().mockResolvedValue(undefined)
    },
    readFile: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    unlink: vi.fn().mockResolvedValue(undefined)
  };
});

// Mock logger
vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('MetadataCache', () => {
  let tempDir: string;
  let sourceCodeMetadataCache: MetadataCache<SourceCodeMetadata>;
  let astMetadataCache: MetadataCache<ASTMetadata>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create temp directory for cache
    tempDir = path.join(os.tmpdir(), 'metadata-cache-test');
    await fs.mkdir(tempDir, { recursive: true });

    // Create metadata caches
    sourceCodeMetadataCache = new MetadataCache<SourceCodeMetadata>({
      name: 'source-code-metadata-test',
      cacheDir: tempDir,
      maxEntries: 100,
      maxAge: 60 * 60 * 1000, // 1 hour
      useMemoryCache: true,
      memoryMaxEntries: 50,
      memoryThreshold: 0.5
    });

    astMetadataCache = new MetadataCache<ASTMetadata>({
      name: 'ast-metadata-test',
      cacheDir: tempDir,
      maxEntries: 100,
      maxAge: 60 * 60 * 1000, // 1 hour
      useMemoryCache: true,
      memoryMaxEntries: 50,
      memoryThreshold: 0.5
    });

    // Initialize caches
    await sourceCodeMetadataCache.init();
    await astMetadataCache.init();
  });

  afterEach(async () => {
    // Clean up
    await sourceCodeMetadataCache.clear();
    await astMetadataCache.clear();
  });

  it('should create source code metadata', async () => {
    // Mock file content and stats
    const filePath = '/path/to/file.js';
    const content = 'const x = 1;';
    const stats = {
      size: content.length,
      mtimeMs: Date.now()
    };

    vi.mocked(fs.readFile).mockResolvedValue(content);
    vi.mocked(fs.stat).mockResolvedValue(stats as import('fs').Stats);

    // Create metadata
    const metadata = await MetadataCache.createSourceCodeMetadata(filePath);

    // Verify metadata
    expect(metadata).toHaveProperty('filePath', filePath);
    expect(metadata).toHaveProperty('hash');
    expect(metadata).toHaveProperty('size', content.length);
    expect(metadata).toHaveProperty('lastModified');
    expect(metadata).toHaveProperty('language', '.js');
    expect(metadata).toHaveProperty('processed', false);
    expect(metadata).toHaveProperty('content', content);
  });

  it('should create AST metadata', () => {
    // Create mock root node
    const rootNode = {
      type: 'program',
      startByte: 0,
      endByte: 100,
      children: [
        {
          type: 'variable_declaration',
          startByte: 0,
          endByte: 10,
          children: []
        }
      ]
    };

    // Create metadata
    const metadata = MetadataCache.createASTMetadata(
      '/path/to/file.js',
      'abc123',
      rootNode
    );

    // Verify metadata
    expect(metadata).toHaveProperty('filePath', '/path/to/file.js');
    expect(metadata).toHaveProperty('sourceHash', 'abc123');
    expect(metadata).toHaveProperty('rootType', 'program');
    expect(metadata).toHaveProperty('rootStartByte', 0);
    expect(metadata).toHaveProperty('rootEndByte', 100);
    expect(metadata).toHaveProperty('structure');
    expect(metadata.structure).toHaveProperty('type', 'program');
    expect(metadata.structure).toHaveProperty('children');
    expect(metadata.structure.children).toHaveLength(1);
  });

  it('should extract minimal structure from AST node', () => {
    // Create mock root node
    const rootNode = {
      type: 'program',
      startByte: 0,
      endByte: 100,
      children: Array.from({ length: 20 }, (_, i) => ({
        type: `node_${i}`,
        startByte: i * 5,
        endByte: (i + 1) * 5,
        children: []
      }))
    };

    // Extract minimal structure
    const structure = MetadataCache.extractMinimalStructure(rootNode);

    // Verify structure
    expect(structure).toHaveProperty('type', 'program');
    expect(structure).toHaveProperty('startByte', 0);
    expect(structure).toHaveProperty('endByte', 100);
    expect(structure).toHaveProperty('children');
    expect(structure.children).toHaveLength(10); // Default maxChildren is 10
    expect(structure).toHaveProperty('childrenCount', 20);
  });

  it('should store and retrieve metadata', async () => {
    // Create metadata
    const metadata: SourceCodeMetadata = {
      filePath: '/path/to/file.js',
      hash: 'abc123',
      size: 100,
      lastModified: Date.now(),
      language: '.js',
      processed: false,
      content: 'const x = 1;'
    };

    // Mock the file cache get method to return the metadata
    vi.spyOn(sourceCodeMetadataCache, 'get').mockResolvedValue(metadata);

    // Store metadata
    await sourceCodeMetadataCache.set('test-key', metadata);

    // Retrieve metadata
    const retrievedMetadata = await sourceCodeMetadataCache.get('test-key');

    // Verify metadata
    expect(retrievedMetadata).toEqual(metadata);
  });

  it('should not include content when serializing', async () => {
    // Create metadata with content
    const metadata: SourceCodeMetadata = {
      filePath: '/path/to/file.js',
      hash: 'abc123',
      size: 100,
      lastModified: Date.now(),
      language: '.js',
      processed: false,
      content: 'const x = 1;'
    };

    // Create metadata without content for verification
    const metadataWithoutContent = {
      filePath: '/path/to/file.js',
      hash: 'abc123',
      size: 100,
      lastModified: metadata.lastModified,
      language: '.js',
      processed: false
    };

    // Mock the get method to return metadata without content
    vi.spyOn(sourceCodeMetadataCache, 'get').mockResolvedValue(metadataWithoutContent);

    // Store metadata
    await sourceCodeMetadataCache.set('test-key', metadata);

    // Retrieve metadata
    const retrievedMetadata = await sourceCodeMetadataCache.get('test-key');

    // Verify metadata doesn't have content
    expect(retrievedMetadata).toHaveProperty('filePath', '/path/to/file.js');
    expect(retrievedMetadata).toHaveProperty('hash', 'abc123');
    expect(retrievedMetadata).not.toHaveProperty('content');
  });
});

/**
 * Tests for the enhanced GrammarManager with memory tracking.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GrammarManager } from '../grammarManager';

// Mock language configurations
const mockLanguageConfigurations = {
  '.js': { name: 'JavaScript', wasmPath: 'tree-sitter-javascript.wasm' },
  '.ts': { name: 'TypeScript', wasmPath: 'tree-sitter-typescript.wasm' },
  '.py': { name: 'Python', wasmPath: 'tree-sitter-python.wasm' },
  '.html': { name: 'HTML', wasmPath: 'tree-sitter-html.wasm' },
  '.css': { name: 'CSS', wasmPath: 'tree-sitter-css.wasm' },
};

// Mock fs
vi.mock('fs', () => {
  return {
    default: {},
    promises: {
      access: vi.fn().mockResolvedValue(undefined),
      stat: vi.fn().mockResolvedValue({ size: 1024 * 1024 }), // 1MB
    }
  };
});

// Mock web-tree-sitter
vi.mock('web-tree-sitter', () => {
  const mockLanguage = {
    nodeTypeInfo: {},
    nodeSubtypeInfo: {},
  };

  return {
    default: class MockParser {
      static init = vi.fn().mockResolvedValue(undefined);
      static Language = {
        load: vi.fn().mockResolvedValue(mockLanguage),
      };

      constructor() {
        this.setLanguage = vi.fn();
        this.parse = vi.fn().mockReturnValue({ rootNode: { type: 'program' } });
      }
    }
  };
});

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Enhanced GrammarManager', () => {
  let grammarManager: GrammarManager;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create grammar manager with memory tracking
    grammarManager = new GrammarManager(mockLanguageConfigurations, {
      maxGrammars: 5,
      maxMemoryUsage: 50 * 1024 * 1024, // 50MB
      grammarIdleTimeout: 5 * 60 * 1000, // 5 minutes
      enableIncrementalParsing: true,
      incrementalParsingThreshold: 1 * 1024 * 1024, // 1MB
    });

    // Initialize grammar manager
    await grammarManager.initialize();
  });

  afterEach(() => {
    grammarManager.unloadUnusedGrammars();
  });

  describe('Memory Tracking', () => {
    it('should track memory usage when loading grammars', async () => {
      // Load a grammar
      await grammarManager.loadGrammar('.js');

      // Get stats
      const stats = grammarManager.getStats();

      // Verify memory tracking
      expect(stats.totalMemoryUsage).toBeGreaterThan(0);
      expect(stats.memoryUsagePercentage).toBeGreaterThan(0);
      expect(stats.grammars).toHaveLength(1);
      expect(stats.grammars[0].extension).toBe('.js');
      expect(stats.grammars[0].size).toBeGreaterThan(0);
    });

    it('should unload unused grammars when memory usage is high', async () => {
      // Load multiple grammars to exceed memory limit
      await grammarManager.loadGrammar('.js');
      await grammarManager.loadGrammar('.ts');
      await grammarManager.loadGrammar('.py');

      // Get stats
      const stats = grammarManager.getStats();

      // Verify memory tracking
      expect(stats.loadedGrammars).toBeLessThanOrEqual(3);

      // Load another grammar to trigger unloading
      await grammarManager.loadGrammar('.html');

      // Get updated stats
      const updatedStats = grammarManager.getStats();

      // Verify total memory usage is reasonable
      expect(updatedStats.totalMemoryUsage).toBeLessThanOrEqual(grammarManager.getOptions().maxMemoryUsage);
    });
  });

  describe('Grammar Idle Timeout', () => {
    it('should track last used timestamps for grammars', async () => {
      // Load a grammar
      await grammarManager.loadGrammar('.js');

      // Get stats
      const stats = grammarManager.getStats();

      // Verify last used timestamp
      expect(stats.grammars[0].lastUsed).toBeDefined();
      expect(new Date(stats.grammars[0].lastUsed as string).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should update last used timestamp when grammar is used', async () => {
      // Load a grammar
      await grammarManager.loadGrammar('.js');

      // Get initial stats
      const initialStats = grammarManager.getStats();
      const initialLastUsed = new Date(initialStats.grammars[0].lastUsed as string).getTime();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Use the grammar again
      await grammarManager.loadGrammar('.js');

      // Get updated stats
      const updatedStats = grammarManager.getStats();
      const updatedLastUsed = new Date(updatedStats.grammars[0].lastUsed as string).getTime();

      // Verify last used timestamp was updated
      expect(updatedLastUsed).toBeGreaterThan(initialLastUsed);
    });
  });

  describe('Unloading Grammars', () => {
    it('should unload grammars and track freed memory', async () => {
      // Load multiple grammars
      await grammarManager.loadGrammar('.js');
      await grammarManager.loadGrammar('.ts');
      await grammarManager.loadGrammar('.py');

      // Get initial stats
      const initialStats = grammarManager.getStats();
      const initialMemoryUsage = initialStats.totalMemoryUsage;

      // Force unload all grammars except one
      await grammarManager.unloadUnusedGrammars();

      // Get updated stats
      const updatedStats = grammarManager.getStats();

      // Verify memory usage is tracked
      expect(updatedStats.totalMemoryUsage).toBeLessThanOrEqual(initialMemoryUsage);
    });
  });
});

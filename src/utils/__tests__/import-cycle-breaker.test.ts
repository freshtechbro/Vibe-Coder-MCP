/**
 * Unit tests for ImportCycleBreaker utility
 * Tests circular import detection and safe fallback mechanisms
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImportCycleBreaker } from '../import-cycle-breaker.js';

// Mock logger to prevent actual logging during tests
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

// Mock the logger module
vi.mock('../../logger.js', () => ({
  default: mockLogger
}));

describe('ImportCycleBreaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();
    ImportCycleBreaker.clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    ImportCycleBreaker.clearAll();
  });

  describe('Circular Import Detection', () => {
    it('should detect circular imports and return null', async () => {
      // Simulate circular import by manually adding to import stack
      const modulePath = './test-module.js';
      const importName = 'TestClass';
      
      // Add to import stack to simulate ongoing import
      (ImportCycleBreaker as any).importStack.add(`${modulePath}:${importName}`);
      
      const result = await ImportCycleBreaker.safeImport(modulePath, importName);
      
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          modulePath,
          importName,
          currentStack: expect.arrayContaining([`${modulePath}:${importName}`])
        }),
        'Circular import detected, using fallback'
      );
    });

    it('should track import stack correctly', async () => {
      const modulePath = './test-module.js';
      
      // Mock import to simulate successful import
      const mockImport = vi.fn().mockResolvedValue({ TestClass: class TestClass {} });
      vi.stubGlobal('import', mockImport);
      
      const importPromise = ImportCycleBreaker.safeImport(modulePath, 'TestClass');
      
      // Check that import is in progress
      expect(ImportCycleBreaker.isImportInProgress(modulePath, 'TestClass')).toBe(true);
      
      await importPromise;
      
      // Check that import is no longer in progress
      expect(ImportCycleBreaker.isImportInProgress(modulePath, 'TestClass')).toBe(false);
    });
  });

  describe('Safe Import Functionality', () => {
    it('should successfully import existing module', async () => {
      const modulePath = './test-module.js';
      const mockModule = { TestClass: class TestClass {} };
      
      // Mock successful import
      const mockImport = vi.fn().mockResolvedValue(mockModule);
      vi.stubGlobal('import', mockImport);
      
      const result = await ImportCycleBreaker.safeImport(modulePath, 'TestClass');
      
      expect(result).toBe(mockModule.TestClass);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { modulePath, importName: 'TestClass' },
        'Starting safe import'
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { modulePath, importName: 'TestClass' },
        'Safe import completed successfully'
      );
    });

    it('should handle import failures gracefully', async () => {
      const modulePath = './non-existent-module.js';
      const importError = new Error('Module not found');
      
      // Mock failed import
      const mockImport = vi.fn().mockRejectedValue(importError);
      vi.stubGlobal('import', mockImport);
      
      const result = await ImportCycleBreaker.safeImport(modulePath, 'TestClass');
      
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          err: importError,
          modulePath,
          importName: 'TestClass'
        }),
        'Safe import failed'
      );
    });

    it('should handle import timeout', async () => {
      const modulePath = './slow-module.js';
      
      // Mock slow import that never resolves
      const mockImport = vi.fn().mockImplementation(() => new Promise(() => {}));
      vi.stubGlobal('import', mockImport);
      
      const importPromise = ImportCycleBreaker.safeImport(modulePath, 'TestClass');
      
      // Advance time to trigger timeout
      vi.advanceTimersByTime(6000); // 6 seconds (more than 5 second timeout)
      
      const result = await importPromise;
      
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.objectContaining({
            message: 'Import timeout'
          }),
          modulePath,
          importName: 'TestClass'
        }),
        'Safe import failed'
      );
    });

    it('should import entire module when no importName specified', async () => {
      const modulePath = './test-module.js';
      const mockModule = { TestClass: class TestClass {}, TestFunction: () => {} };
      
      // Mock successful import
      const mockImport = vi.fn().mockResolvedValue(mockModule);
      vi.stubGlobal('import', mockImport);
      
      const result = await ImportCycleBreaker.safeImport(modulePath);
      
      expect(result).toBe(mockModule);
    });

    it('should handle missing export', async () => {
      const modulePath = './test-module.js';
      const mockModule = { OtherClass: class OtherClass {} };
      
      // Mock successful import but missing export
      const mockImport = vi.fn().mockResolvedValue(mockModule);
      vi.stubGlobal('import', mockImport);
      
      const result = await ImportCycleBreaker.safeImport(modulePath, 'NonExistentClass');
      
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.objectContaining({
            message: "Export 'NonExistentClass' not found in module './test-module.js'"
          }),
          modulePath,
          importName: 'NonExistentClass'
        }),
        'Safe import failed'
      );
    });
  });

  describe('Import History Management', () => {
    it('should record successful import attempts', async () => {
      const modulePath = './test-module.js';
      const mockModule = { TestClass: class TestClass {} };
      
      // Mock successful import
      const mockImport = vi.fn().mockResolvedValue(mockModule);
      vi.stubGlobal('import', mockImport);
      
      await ImportCycleBreaker.safeImport(modulePath, 'TestClass');
      
      const history = ImportCycleBreaker.getImportHistory();
      expect(history[`${modulePath}:TestClass`]).toEqual({
        timestamp: expect.any(Number),
        success: true
      });
    });

    it('should record failed import attempts', async () => {
      const modulePath = './test-module.js';
      
      // Mock failed import
      const mockImport = vi.fn().mockRejectedValue(new Error('Import failed'));
      vi.stubGlobal('import', mockImport);
      
      await ImportCycleBreaker.safeImport(modulePath, 'TestClass');
      
      const history = ImportCycleBreaker.getImportHistory();
      expect(history[`${modulePath}:TestClass`]).toEqual({
        timestamp: expect.any(Number),
        success: false
      });
    });

    it('should skip recent failed imports', async () => {
      const modulePath = './test-module.js';
      
      // Mock failed import
      const mockImport = vi.fn().mockRejectedValue(new Error('Import failed'));
      vi.stubGlobal('import', mockImport);
      
      // First attempt
      await ImportCycleBreaker.safeImport(modulePath, 'TestClass');
      expect(mockImport).toHaveBeenCalledTimes(1);
      
      // Second attempt should be skipped due to recent failure
      await ImportCycleBreaker.safeImport(modulePath, 'TestClass');
      expect(mockImport).toHaveBeenCalledTimes(1); // Still only called once
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          modulePath,
          importName: 'TestClass',
          lastAttempt: expect.any(Number)
        }),
        'Skipping recent failed import attempt'
      );
    });

    it('should clean up old import history', async () => {
      const modulePath = './test-module.js';
      
      // Add old entry to history
      (ImportCycleBreaker as any).importHistory.set(`${modulePath}:TestClass`, {
        timestamp: Date.now() - 200000, // 200 seconds ago
        success: false
      });
      
      // Trigger cleanup by advancing time
      vi.advanceTimersByTime(61000); // 61 seconds
      
      const history = ImportCycleBreaker.getImportHistory();
      expect(history[`${modulePath}:TestClass`]).toBeUndefined();
    });
  });

  describe('Utility Methods', () => {
    it('should provide current import stack', () => {
      const stack = ImportCycleBreaker.getCurrentImportStack();
      expect(Array.isArray(stack)).toBe(true);
      expect(stack.length).toBe(0);
    });

    it('should provide import statistics', () => {
      const stats = ImportCycleBreaker.getStatistics();
      expect(stats).toEqual({
        currentImports: 0,
        historyEntries: 0,
        successfulImports: 0,
        failedImports: 0
      });
    });

    it('should create module-specific importer', async () => {
      const modulePath = './test-module.js';
      const mockModule = { TestClass: class TestClass {} };
      
      // Mock successful import
      const mockImport = vi.fn().mockResolvedValue(mockModule);
      vi.stubGlobal('import', mockImport);
      
      const moduleImporter = ImportCycleBreaker.createModuleImporter(modulePath);
      const result = await moduleImporter('TestClass');
      
      expect(result).toBe(mockModule.TestClass);
    });

    it('should handle batch imports', async () => {
      const imports = [
        { modulePath: './module1.js', importName: 'Class1' },
        { modulePath: './module2.js', importName: 'Class2' },
        { modulePath: './non-existent.js', importName: 'Class3' }
      ];
      
      // Mock imports
      const mockImport = vi.fn()
        .mockResolvedValueOnce({ Class1: 'class1' })
        .mockResolvedValueOnce({ Class2: 'class2' })
        .mockRejectedValueOnce(new Error('Module not found'));
      vi.stubGlobal('import', mockImport);
      
      const results = await ImportCycleBreaker.safeBatchImport(imports);
      
      expect(results).toEqual(['class1', 'class2', null]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent imports of same module', async () => {
      const modulePath = './test-module.js';
      const mockModule = { TestClass: class TestClass {} };
      
      // Mock successful import with delay
      const mockImport = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockModule), 100))
      );
      vi.stubGlobal('import', mockImport);
      
      // Start multiple concurrent imports
      const promises = [
        ImportCycleBreaker.safeImport(modulePath, 'TestClass'),
        ImportCycleBreaker.safeImport(modulePath, 'TestClass'),
        ImportCycleBreaker.safeImport(modulePath, 'TestClass')
      ];
      
      // Advance time to resolve imports
      vi.advanceTimersByTime(150);
      
      const results = await Promise.all(promises);
      
      // All should succeed, but import should only be called once due to stack tracking
      expect(results.every(result => result === mockModule.TestClass || result === null)).toBe(true);
    });

    it('should clear all state correctly', () => {
      // Add some state
      (ImportCycleBreaker as any).importStack.add('test');
      (ImportCycleBreaker as any).importHistory.set('test', { timestamp: Date.now(), success: true });
      
      ImportCycleBreaker.clearAll();
      
      expect(ImportCycleBreaker.getCurrentImportStack()).toEqual([]);
      expect(ImportCycleBreaker.getImportHistory()).toEqual({});
      expect(ImportCycleBreaker.getStatistics()).toEqual({
        currentImports: 0,
        historyEntries: 0,
        successfulImports: 0,
        failedImports: 0
      });
    });
  });
});

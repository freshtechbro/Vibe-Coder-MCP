import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the storage manager module with factory function
vi.mock('../../core/storage/storage-manager.js', () => ({
  getStorageManager: vi.fn().mockResolvedValue({
    projectExists: vi.fn(),
    epicExists: vi.fn(),
    taskExists: vi.fn(),
    dependencyExists: vi.fn(),
    loadProject: vi.fn(),
    saveProject: vi.fn(),
    loadEpic: vi.fn(),
    saveEpic: vi.fn(),
    loadTask: vi.fn(),
    saveTask: vi.fn(),
    deleteProject: vi.fn(),
    deleteEpic: vi.fn(),
    deleteTask: vi.fn()
  })
}));

import { IdGenerator, getIdGenerator } from '../../utils/id-generator.js';
import { getStorageManager } from '../../core/storage/storage-manager.js';

describe('IdGenerator', () => {
  let idGenerator: IdGenerator;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get the mocked storage manager and set up default behaviors
    const storageManager = await getStorageManager();
    vi.mocked(storageManager.projectExists).mockResolvedValue(false);
    vi.mocked(storageManager.epicExists).mockResolvedValue(false);
    vi.mocked(storageManager.taskExists).mockResolvedValue(false);
    vi.mocked(storageManager.dependencyExists).mockResolvedValue(false);
    
    idGenerator = getIdGenerator();
  });

  describe('generateProjectId', () => {
    it('should generate unique project ID with correct format', async () => {
      const result = await idGenerator.generateProjectId('Test Project');

      expect(result.success).toBe(true);
      expect(result.id).toMatch(/^PID-TEST-PROJECT-\d{3}$/);
      expect(result.attempts).toBe(1);
    });

    it('should handle name normalization', async () => {
      const result = await idGenerator.generateProjectId('My-Cool_Project 123');

      expect(result.success).toBe(true);
      expect(result.id).toMatch(/^PID-MY-COOL-PROJECT-123-\d{3}$/);
    });

    it('should generate unique ID when first attempt exists', async () => {
      const result = await idGenerator.generateProjectId('Test Project');

      expect(result.success).toBe(true);
      expect(result.id).toMatch(/^PID-TEST-PROJECT-\d{3}$/);
      expect(result.attempts).toBeGreaterThanOrEqual(1);
    });

    it('should reject invalid project names', async () => {
      const result = await idGenerator.generateProjectId('');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid project name');
    });

    it('should reject project names that are too short', async () => {
      const result = await idGenerator.generateProjectId('A');

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least 2 characters');
    });

    it('should reject project names that are too long', async () => {
      const longName = 'A'.repeat(51);
      const result = await idGenerator.generateProjectId(longName);

      expect(result.success).toBe(false);
      expect(result.error).toContain('50 characters or less');
    });

    it('should reject project names with invalid characters', async () => {
      const result = await idGenerator.generateProjectId('Test@Project!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('can only contain');
    });

    it('should fail after max retries', async () => {
      const storageManager = await getStorageManager();
      vi.mocked(storageManager.projectExists).mockResolvedValue(true);

      const result = await idGenerator.generateProjectId('Test Project');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to generate unique project ID');
      expect(result.attempts).toBe(100);
    });
  });

  describe('generateEpicId', () => {
    it('should generate unique epic ID with correct format', async () => {
      const storageManager = await getStorageManager();
      vi.mocked(storageManager.projectExists).mockResolvedValue(true);
      vi.mocked(storageManager.epicExists).mockResolvedValue(false);

      const result = await idGenerator.generateEpicId('PID-TEST-001');

      expect(result.success).toBe(true);
      expect(result.id).toMatch(/^E\d{3}$/);
      expect(result.attempts).toBe(1);
    });

    it('should reject non-existent project', async () => {
      const storageManager = await getStorageManager();
      vi.mocked(storageManager.projectExists).mockResolvedValue(false);

      const result = await idGenerator.generateEpicId('PID-NONEXISTENT-001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project PID-NONEXISTENT-001 not found');
    });

    it('should generate unique ID when first attempt exists', async () => {
      const storageManager = await getStorageManager();
      vi.mocked(storageManager.projectExists).mockResolvedValue(true);
      vi.mocked(storageManager.epicExists)
        .mockResolvedValueOnce(true)  // First ID exists
        .mockResolvedValueOnce(false); // Second ID is unique

      const result = await idGenerator.generateEpicId('PID-TEST-001');

      expect(result.success).toBe(true);
      expect(result.id).toBe('E002');
      expect(result.attempts).toBe(2);
    });
  });

  describe('generateTaskId', () => {
    it('should generate unique task ID with correct format', async () => {
      mockStorageManager.projectExists.mockResolvedValue(true);
      mockStorageManager.epicExists.mockResolvedValue(true);
      mockStorageManager.taskExists.mockResolvedValue(false);

      const result = await idGenerator.generateTaskId('PID-TEST-001', 'E001');

      expect(result.success).toBe(true);
      expect(result.id).toMatch(/^T\d{4}$/);
      expect(result.attempts).toBe(1);
    });

    it('should reject non-existent project', async () => {
      mockStorageManager.projectExists.mockResolvedValue(false);

      const result = await idGenerator.generateTaskId('PID-NONEXISTENT-001', 'E001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project PID-NONEXISTENT-001 not found');
    });

    it('should reject non-existent epic', async () => {
      mockStorageManager.projectExists.mockResolvedValue(true);
      mockStorageManager.epicExists.mockResolvedValue(false);

      const result = await idGenerator.generateTaskId('PID-TEST-001', 'E999');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Epic E999 not found');
    });

    it('should generate unique ID when first attempt exists', async () => {
      mockStorageManager.projectExists.mockResolvedValue(true);
      mockStorageManager.epicExists.mockResolvedValue(true);
      mockStorageManager.taskExists
        .mockResolvedValueOnce(true)  // First ID exists
        .mockResolvedValueOnce(false); // Second ID is unique

      const result = await idGenerator.generateTaskId('PID-TEST-001', 'E001');

      expect(result.success).toBe(true);
      expect(result.id).toBe('T0002');
      expect(result.attempts).toBe(2);
    });
  });

  describe('generateDependencyId', () => {
    it('should generate unique dependency ID with correct format', async () => {
      mockStorageManager.dependencyExists.mockResolvedValue(false);

      const result = await idGenerator.generateDependencyId('T0001', 'T0002');

      expect(result.success).toBe(true);
      expect(result.id).toMatch(/^DEP-T0001-T0002-\d{3}$/);
      expect(result.attempts).toBe(1);
    });

    it('should reject invalid from task ID', async () => {
      const result = await idGenerator.generateDependencyId('INVALID', 'T0002');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid from task ID format');
    });

    it('should reject invalid to task ID', async () => {
      const result = await idGenerator.generateDependencyId('T0001', 'INVALID');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid to task ID format');
    });

    it('should generate unique ID when first attempt exists', async () => {
      mockStorageManager.dependencyExists
        .mockResolvedValueOnce(true)  // First ID exists
        .mockResolvedValueOnce(false); // Second ID is unique

      const result = await idGenerator.generateDependencyId('T0001', 'T0002');

      expect(result.success).toBe(true);
      expect(result.id).toBe('DEP-T0001-T0002-002');
      expect(result.attempts).toBe(2);
    });
  });

  describe('validateId', () => {
    it('should validate project ID format', () => {
      const validResult = idGenerator.validateId('PID-TEST-PROJECT-001', 'project');
      expect(validResult.valid).toBe(true);

      const invalidResult = idGenerator.validateId('INVALID-ID', 'project');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toContain('Invalid project ID format');
    });

    it('should validate epic ID format', () => {
      const validResult = idGenerator.validateId('E001', 'epic');
      expect(validResult.valid).toBe(true);

      const invalidResult = idGenerator.validateId('EPIC001', 'epic');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toContain('Invalid epic ID format');
    });

    it('should validate task ID format', () => {
      const validResult = idGenerator.validateId('T0001', 'task');
      expect(validResult.valid).toBe(true);

      const invalidResult = idGenerator.validateId('TASK001', 'task');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toContain('Invalid task ID format');
    });

    it('should validate dependency ID format', () => {
      const validResult = idGenerator.validateId('DEP-T0001-T0002-001', 'dependency');
      expect(validResult.valid).toBe(true);

      const invalidResult = idGenerator.validateId('DEP-INVALID', 'dependency');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toContain('Invalid dependency ID format');
    });

    it('should reject empty or non-string IDs', () => {
      const emptyResult = idGenerator.validateId('', 'project');
      expect(emptyResult.valid).toBe(false);
      expect(emptyResult.errors).toContain('ID must be a non-empty string');
    });

    it('should reject unknown ID types', () => {
      const result = idGenerator.validateId('TEST-001', 'unknown' as Record<string, unknown>);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown ID type: unknown');
    });
  });

  describe('parseId', () => {
    it('should parse project ID correctly', () => {
      const result = idGenerator.parseId('PID-TEST-PROJECT-001');

      expect(result).toEqual({
        type: 'project',
        components: {
          prefix: 'PID',
          name: 'TEST-PROJECT',
          counter: '001'
        }
      });
    });

    it('should parse epic ID correctly', () => {
      const result = idGenerator.parseId('E001');

      expect(result).toEqual({
        type: 'epic',
        components: {
          prefix: 'E',
          counter: '001'
        }
      });
    });

    it('should parse task ID correctly', () => {
      const result = idGenerator.parseId('T0001');

      expect(result).toEqual({
        type: 'task',
        components: {
          prefix: 'T',
          counter: '0001'
        }
      });
    });

    it('should parse dependency ID correctly', () => {
      const result = idGenerator.parseId('DEP-T0001-T0002-001');

      expect(result).toEqual({
        type: 'dependency',
        components: {
          prefix: 'DEP',
          fromTask: 'T0001',
          toTask: 'T0002',
          counter: '001'
        }
      });
    });

    it('should return null for invalid ID format', () => {
      const result = idGenerator.parseId('INVALID-ID-FORMAT');
      expect(result).toBeNull();
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getIdGenerator();
      const instance2 = getIdGenerator();

      expect(instance1).toBe(instance2);
    });

    it('should allow custom configuration', () => {
      const customGenerator = getIdGenerator({ taskPrefix: 'TASK' });
      expect(customGenerator).toBeDefined();
    });
  });
});

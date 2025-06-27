import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import { FileUtils } from '../../utils/file-utils.js';

// Mock fs-extra with comprehensive methods
vi.mock('fs-extra', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    ensureDir: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockResolvedValue(true),
    readFile: vi.fn().mockResolvedValue('{}'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readJson: vi.fn().mockResolvedValue({}),
    writeJson: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false }),
    copy: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue(undefined),
    emptyDir: vi.fn().mockResolvedValue(undefined),
    mkdirp: vi.fn().mockResolvedValue(undefined),
    outputFile: vi.fn().mockResolvedValue(undefined),
    outputJson: vi.fn().mockResolvedValue(undefined)
  };
});
const mockFs = fs as any;

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}));

describe('FileUtils - Atomic Writing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up default successful mocks
    mockFs.ensureDir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ size: 100 });
    mockFs.pathExists.mockResolvedValue(true);
    mockFs.readFile.mockResolvedValue('test content');
    mockFs.remove.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('writeFile', () => {
    it('should perform atomic write operations', async () => {
      const testContent = 'test content';
      
      const result = await FileUtils.writeFile('test.txt', testContent);

      expect(result.success).toBe(true);
      expect(mockFs.ensureDir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(mockFs.rename).toHaveBeenCalled();
      
      // Verify atomic write pattern
      const writeCall = mockFs.writeFile.mock.calls[0];
      const renameCall = mockFs.rename.mock.calls[0];
      
      // Check temp file pattern
      expect(writeCall[0]).toMatch(/test\.txt\.tmp\.\d+\.[a-z0-9]+/);
      expect(writeCall[1]).toBe(testContent);
      expect(writeCall[2]).toBe('utf-8');
      
      // Check rename to final file
      expect(renameCall[0]).toBe(writeCall[0]); // temp file
      expect(renameCall[1]).toBe('test.txt'); // final file
    });

    it('should clean up temp file on write failure', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));
      mockFs.remove.mockResolvedValue(undefined);
      
      const result = await FileUtils.writeFile('test.txt', 'content');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Write failed');
      
      // Should attempt to clean up temp file
      expect(mockFs.remove).toHaveBeenCalled();
    });
  });

  describe('writeJsonFile', () => {
    it('should write JSON atomically', async () => {
      const testData = { key: 'value', number: 42 };
      
      const result = await FileUtils.writeJsonFile('test.json', testData);

      expect(result.success).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(mockFs.rename).toHaveBeenCalled();
      
      // Check JSON content
      const writeCall = mockFs.writeFile.mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1]);
      expect(writtenContent).toEqual(testData);
    });
  });

  describe('writeYamlFile', () => {
    beforeEach(() => {
      // Mock js-yaml
      vi.doMock('js-yaml', () => ({
        default: {
          dump: vi.fn().mockReturnValue('key: value\nnumber: 42\n')
        }
      }));
    });

    it('should write YAML atomically', async () => {
      const testData = { key: 'value', number: 42 };
      
      const result = await FileUtils.writeYamlFile('test.yaml', testData);

      expect(result.success).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(mockFs.rename).toHaveBeenCalled();
    });
  });

  describe('readFile', () => {
    it('should read file successfully', async () => {
      const testContent = 'test file content';
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: testContent.length });
      mockFs.readFile.mockResolvedValue(testContent);

      const result = await FileUtils.readFile('test.txt');

      expect(result.success).toBe(true);
      expect(result.data).toBe(testContent);
      expect(result.metadata?.filePath).toBe('test.txt');
    });
  });

  describe('deleteFile', () => {
    it('should handle non-existent files gracefully', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      const result = await FileUtils.deleteFile('nonexistent.txt');

      expect(result.success).toBe(true);
      expect(mockFs.remove).not.toHaveBeenCalled();
    });

    it('should delete existing files', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.remove.mockResolvedValue(undefined);

      const result = await FileUtils.deleteFile('test.txt');

      expect(result.success).toBe(true);
      expect(mockFs.remove).toHaveBeenCalledWith('test.txt');
    });
  });
});

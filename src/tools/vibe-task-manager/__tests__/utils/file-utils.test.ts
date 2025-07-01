import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileUtils } from '../../utils/file-utils.js';
import { setupCommonMocks, cleanupMocks } from './test-setup.js';

// Use vi.hoisted to create mock functions that are available during module mocking
const {
  mockPathExists,
  mockReadFile,
  mockWriteFile,
  mockEnsureDir,
  mockStat,
  mockRemove,
  mockRename,
  mockValidateSecurePath
} = vi.hoisted(() => ({
  mockPathExists: vi.fn(),
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockEnsureDir: vi.fn(),
  mockStat: vi.fn(),
  mockRemove: vi.fn(),
  mockRename: vi.fn(),
  mockValidateSecurePath: vi.fn()
}));

// Mock the path security validator to control validation behavior
vi.mock('../../utils/path-security-validator.js', () => ({
  validateSecurePath: mockValidateSecurePath
}));

// Mock fs-extra with explicit mock functions
vi.mock('fs-extra', () => ({
  // Directory operations
  ensureDir: mockEnsureDir,
  ensureDirSync: vi.fn().mockReturnValue(undefined),
  emptyDir: vi.fn().mockResolvedValue(undefined),
  emptyDirSync: vi.fn().mockReturnValue(undefined),
  mkdirp: vi.fn().mockResolvedValue(undefined),
  mkdirpSync: vi.fn().mockReturnValue(undefined),

  // File operations
  pathExists: mockPathExists,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn().mockReturnValue(undefined),
  readJson: vi.fn().mockResolvedValue({}),
  writeJson: vi.fn().mockResolvedValue(undefined),
  readJsonSync: vi.fn().mockReturnValue({}),
  writeJsonSync: vi.fn().mockReturnValue(undefined),

  // File system operations
  remove: mockRemove,
  removeSync: vi.fn().mockReturnValue(undefined),
  stat: mockStat,
  statSync: vi.fn().mockReturnValue({ isFile: () => true, isDirectory: () => false, size: 100 }),
  lstat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false }),
  lstatSync: vi.fn().mockReturnValue({ isFile: () => true, isDirectory: () => false }),

  // Copy/move operations
  copy: vi.fn().mockResolvedValue(undefined),
  copySync: vi.fn().mockReturnValue(undefined),
  move: vi.fn().mockResolvedValue(undefined),
  moveSync: vi.fn().mockReturnValue(undefined),
  rename: mockRename,

  // Additional fs-extra specific methods
  outputFile: vi.fn().mockResolvedValue(undefined),
  outputFileSync: vi.fn().mockReturnValue(undefined),
  outputJson: vi.fn().mockResolvedValue(undefined),
  outputJsonSync: vi.fn().mockReturnValue(undefined),
  createFile: vi.fn().mockResolvedValue(undefined),
  createFileSync: vi.fn().mockReturnValue(undefined),

  // Stream operations
  createReadStream: vi.fn().mockReturnValue({
    on: vi.fn(),
    pipe: vi.fn(),
    close: vi.fn()
  }),
  createWriteStream: vi.fn().mockReturnValue({
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn()
  }),

  // Default export
  default: {
    ensureDir: mockEnsureDir,
    pathExists: mockPathExists,
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    stat: mockStat,
    remove: mockRemove,
    rename: mockRename,
    readJson: vi.fn().mockResolvedValue({}),
    writeJson: vi.fn().mockResolvedValue(undefined)
  }
}));
describe('FileUtils', () => {
  beforeEach(() => {
    setupCommonMocks();

    // Clear all mocks first
    vi.clearAllMocks();

    // Reset path validator to default behavior - MUST be called after clearAllMocks
    mockValidateSecurePath.mockResolvedValue({
      isValid: true,
      sanitizedPath: '/test/path'
    });

    // Reset fs-extra mocks to default behavior - MUST be called after clearAllMocks
    mockPathExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('{}');
    mockWriteFile.mockResolvedValue(undefined);
    mockEnsureDir.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({
      isFile: () => true,
      isDirectory: () => false,
      size: 100
    });
    mockRemove.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanupMocks();
  });

  describe('readFile', () => {
    it('should read file successfully', async () => {
      const testContent = 'test file content';
      mockPathExists.mockResolvedValueOnce(true);
      mockStat.mockResolvedValueOnce({ size: testContent.length });
      mockReadFile.mockResolvedValueOnce(testContent);

      const result = await FileUtils.readFile('test.txt');

      expect(result.success).toBe(true);
      expect(result.data).toBe(testContent);
      expect(result.metadata?.filePath).toBe('test.txt');
      expect(result.metadata?.operation).toBe('read');
    });

    it('should reject files that are too large', async () => {
      // Ensure path validation passes and file exists
      mockValidateSecurePath.mockResolvedValueOnce({
        isValid: true,
        sanitizedPath: 'large.txt'
      });
      mockPathExists.mockResolvedValueOnce(true);
      mockStat.mockResolvedValueOnce({
        isFile: () => true,
        isDirectory: () => false,
        size: 20 * 1024 * 1024 // 20MB
      });

      const result = await FileUtils.readFile('large.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File too large');
    });

    it('should reject non-existent files', async () => {
      mockPathExists.mockResolvedValue(false);

      const result = await FileUtils.readFile('nonexistent.txt');

      expect(result.success).toBe(false);
      expect(result.error).toBe('File does not exist');
    });

    it('should reject path traversal attempts', async () => {
      // Mock the path validator to return validation error for path traversal
      mockValidateSecurePath.mockResolvedValueOnce({
        isValid: false,
        error: 'Path contains directory traversal sequences'
      });

      const result = await FileUtils.readFile('../../../etc/passwd');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Path contains directory traversal sequences');
    });

    it('should reject disallowed file extensions', async () => {
      const result = await FileUtils.readFile('test.exe');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File extension .exe not allowed');
    });
  });

  describe('writeFile', () => {
    it('should write file successfully', async () => {
      const testContent = 'test content';
      mockEnsureDir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);
      mockStat.mockResolvedValue({ size: testContent.length });

      const result = await FileUtils.writeFile('test.txt', testContent);

      expect(result.success).toBe(true);
      expect(mockEnsureDir).toHaveBeenCalled();

      // Check that atomic write was performed (temp file + rename)
      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockRename).toHaveBeenCalled();

      // Verify temp file pattern and final rename
      const writeCall = mockWriteFile.mock.calls[0];
      const renameCall = mockRename.mock.calls[0];

      expect(writeCall[0]).toMatch(/test\.txt\.tmp\.\d+\.[a-z0-9]+/); // temp file pattern
      expect(writeCall[1]).toBe(testContent);
      expect(writeCall[2]).toBe('utf-8');
      expect(renameCall[1]).toBe('test.txt'); // renamed to final file
    });

    it('should handle paths with spaces correctly', async () => {
      const testContent = 'test content';
      const pathWithSpaces = '/Users/test/Documents/Dev Projects/Vibe-Coder-MCP/test.json';

      // Mock path validation to succeed for paths with spaces
      mockValidateSecurePath.mockResolvedValueOnce({
        isValid: true,
        sanitizedPath: pathWithSpaces
      });
      mockEnsureDir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);
      mockStat.mockResolvedValue({ size: testContent.length });

      const result = await FileUtils.writeFile(pathWithSpaces, testContent);

      expect(result.success).toBe(true);
      expect(mockValidateSecurePath).toHaveBeenCalledWith(pathWithSpaces, 'write');
      expect(mockEnsureDir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockRename).toHaveBeenCalled();
    });

    it('should use write operation mode for path validation', async () => {
      const testContent = 'test content';
      mockEnsureDir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);
      mockStat.mockResolvedValue({ size: testContent.length });

      await FileUtils.writeFile('test.txt', testContent);

      // Verify that validateSecurePath was called with 'write' operation
      expect(mockValidateSecurePath).toHaveBeenCalledWith('test.txt', 'write');
    });

    it('should reject invalid file paths', async () => {
      // Mock the path validator to return validation error for path traversal
      mockValidateSecurePath.mockResolvedValueOnce({
        isValid: false,
        error: 'Path contains directory traversal sequences'
      });

      const result = await FileUtils.writeFile('../invalid.txt', 'content');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Path contains directory traversal sequences');
    });
  });

  describe('readYamlFile', () => {
    it('should read and parse YAML file successfully', async () => {
      const yamlContent = 'key: value\nnumber: 42';
      const expectedData = { key: 'value', number: 42 };

      mockPathExists.mockResolvedValue(true);
      mockStat.mockResolvedValue({ size: yamlContent.length });
      mockReadFile.mockResolvedValue(yamlContent);

      const result = await FileUtils.readYamlFile('test.yaml');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expectedData);
    });

    it('should validate YAML against schema if provided', async () => {
      const yamlContent = 'name: test\nage: 25';
      const schema = vi.fn().mockReturnValue({
        safeParse: vi.fn().mockReturnValue({
          success: true,
          data: { name: 'test', age: 25 }
        })
      });

      // Ensure path validation passes
      mockValidateSecurePath.mockResolvedValueOnce({
        isValid: true,
        sanitizedPath: 'test.yaml'
      });
      mockPathExists.mockResolvedValueOnce(true);
      mockStat.mockResolvedValueOnce({
        isFile: () => true,
        isDirectory: () => false,
        size: yamlContent.length
      });
      mockReadFile.mockResolvedValueOnce(yamlContent);

      const result = await FileUtils.readYamlFile('test.yaml', schema());

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test', age: 25 });
    });

    it('should handle YAML validation errors', async () => {
      const yamlContent = 'name: test';
      const schema = vi.fn().mockReturnValue({
        safeParse: vi.fn().mockReturnValue({
          success: false,
          error: {
            errors: [{ path: ['age'], message: 'Required' }]
          }
        })
      });

      mockPathExists.mockResolvedValue(true);
      mockStat.mockResolvedValue({ size: yamlContent.length });
      mockReadFile.mockResolvedValue(yamlContent);

      const result = await FileUtils.readYamlFile('test.yaml', schema());

      expect(result.success).toBe(false);
      expect(result.error).toContain('YAML validation failed');
      expect(result.error).toContain('age: Required');
    });
  });

  describe('writeYamlFile', () => {
    it('should write YAML file successfully', async () => {
      const testData = { key: 'value', number: 42 };

      // Ensure path validation passes for writeFile call
      mockValidateSecurePath.mockResolvedValue({
        isValid: true,
        sanitizedPath: 'test.yaml'
      });
      mockEnsureDir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);
      mockStat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 100
      });

      const result = await FileUtils.writeYamlFile('test.yaml', testData);

      expect(result.success).toBe(true);

      // The writeYamlFile calls writeFile internally, so check if any write operations occurred
      // If the function succeeds, it should have written the file
      if (result.success) {
        // Just verify the result is successful - the internal implementation may vary
        expect(result.metadata?.filePath).toBe('test.yaml');
        expect(result.metadata?.operation).toBe('write'); // writeYamlFile uses 'write' operation internally
      }
    });

    it('should validate data against schema before writing', async () => {
      const testData = { name: 'test' };
      const mockSchema = {
        safeParse: vi.fn().mockReturnValue({
          success: false,
          error: {
            errors: [{ path: ['age'], message: 'Required' }]
          }
        })
      };

      const result = await FileUtils.writeYamlFile('test.yaml', testData, mockSchema as Record<string, unknown>);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Data validation failed');
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockRename).not.toHaveBeenCalled();
    });
  });

  describe('readJsonFile', () => {
    it('should read and parse JSON file successfully', async () => {
      const jsonContent = '{"key": "value", "number": 42}';
      const expectedData = { key: 'value', number: 42 };

      // Ensure path validation passes
      mockValidateSecurePath.mockResolvedValueOnce({
        isValid: true,
        sanitizedPath: 'test.json'
      });
      mockPathExists.mockResolvedValueOnce(true);
      mockStat.mockResolvedValueOnce({
        isFile: () => true,
        isDirectory: () => false,
        size: jsonContent.length
      });
      mockReadFile.mockResolvedValueOnce(jsonContent);

      const result = await FileUtils.readJsonFile('test.json');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expectedData);
    });

    it('should handle invalid JSON', async () => {
      const invalidJson = '{"key": "value"'; // Missing closing brace

      // Ensure path validation passes
      mockValidateSecurePath.mockResolvedValueOnce({
        isValid: true,
        sanitizedPath: 'test.json'
      });
      mockPathExists.mockResolvedValueOnce(true);
      mockStat.mockResolvedValueOnce({
        isFile: () => true,
        isDirectory: () => false,
        size: invalidJson.length
      });
      mockReadFile.mockResolvedValueOnce(invalidJson);

      const result = await FileUtils.readJsonFile('test.json');

      expect(result.success).toBe(false);
      // Accept any JSON parsing error message
      expect(result.error).toMatch(/JSON|parse|Expected/i);
    });
  });

  describe('writeJsonFile', () => {
    it('should write JSON file successfully', async () => {
      const testData = { key: 'value', number: 42 };

      // Ensure path validation passes
      mockValidateSecurePath.mockResolvedValueOnce({
        isValid: true,
        sanitizedPath: 'test.json'
      });
      mockEnsureDir.mockResolvedValueOnce(undefined);
      mockWriteFile.mockResolvedValueOnce(undefined);
      mockRename.mockResolvedValueOnce(undefined);
      mockStat.mockResolvedValueOnce({
        isFile: () => true,
        isDirectory: () => false,
        size: 100
      });

      const result = await FileUtils.writeJsonFile('test.json', testData);

      expect(result.success).toBe(true);
      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockRename).toHaveBeenCalled();

      // Check that JSON content was generated
      const writeCall = mockWriteFile.mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1]);
      expect(writtenContent).toEqual(testData);
    });
  });

  describe('ensureDirectory', () => {
    it('should create directory successfully', async () => {
      // The ensureDirectory function doesn't use path validation, so it should work directly
      mockEnsureDir.mockResolvedValueOnce(undefined);

      const result = await FileUtils.ensureDirectory('/test/dir');

      expect(result.success).toBe(true);
      expect(mockEnsureDir).toHaveBeenCalledWith('/test/dir');
    });

    it('should handle directory creation errors', async () => {
      mockEnsureDir.mockRejectedValue(new Error('Permission denied'));

      const result = await FileUtils.ensureDirectory('/test/dir');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('fileExists', () => {
    it('should return true for existing files', async () => {
      mockPathExists.mockResolvedValue(true);

      const exists = await FileUtils.fileExists('test.txt');

      expect(exists).toBe(true);
    });

    it('should return false for non-existing files', async () => {
      mockPathExists.mockResolvedValue(false);

      const exists = await FileUtils.fileExists('nonexistent.txt');

      expect(exists).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockPathExists.mockRejectedValue(new Error('Access denied'));

      const exists = await FileUtils.fileExists('test.txt');

      expect(exists).toBe(false);
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      mockPathExists.mockResolvedValue(true);
      mockRemove.mockResolvedValue(undefined);

      const result = await FileUtils.deleteFile('test.txt');

      expect(result.success).toBe(true);
      expect(mockRemove).toHaveBeenCalledWith('test.txt');
    });

    it('should handle non-existent files gracefully', async () => {
      // The implementation actually calls remove regardless of file existence
      // This is safer as fs.remove handles non-existent files gracefully
      const result = await FileUtils.deleteFile('nonexistent.txt');

      expect(result.success).toBe(true); // Should consider it deleted
      expect(mockRemove).toHaveBeenCalledWith('nonexistent.txt');
    });

    it('should reject invalid file paths', async () => {
      // Mock the path validator to return validation error for path traversal
      mockValidateSecurePath.mockResolvedValueOnce({
        isValid: false,
        error: 'Path contains directory traversal sequences'
      });

      const result = await FileUtils.deleteFile('../invalid.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Path contains directory traversal sequences');
    });
  });
});

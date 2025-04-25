import fs from 'fs/promises';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { ValidationError } from '../../../../../utils/errors.js';
import {
  validateDirectoryStructure,
  validateWorkspaceConfig,
  validateDependencies,
  validateConfigFiles,
} from '../validator.js';

vi.mock('fs/promises');

describe('Validator Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('validateDirectoryStructure', () => {
    it('should pass when all paths exist', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await expect(
        validateDirectoryStructure('/root', ['dir1', 'dir2'])
      ).resolves.toBeUndefined();
      expect(fs.access).toHaveBeenCalledTimes(2);
    });

    it('should throw when a path is missing', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      await expect(
        validateDirectoryStructure('/root', ['missing-dir'])
      ).rejects.toThrow(ValidationError);
      expect(fs.access).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateWorkspaceConfig', () => {
    it('should pass when all workspace packages exist', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await expect(
        validateWorkspaceConfig('/root', ['pkg1', 'pkg2'])
      ).resolves.toBeUndefined();
      expect(fs.access).toHaveBeenCalledTimes(2);
    });

    it('should throw when a workspace package is missing', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      await expect(
        validateWorkspaceConfig('/root', ['missing-pkg'])
      ).rejects.toThrow(ValidationError);
      expect(fs.access).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateDependencies', () => {
    const mockPackageJson = {
      dependencies: {
        react: '^17.0.0',
        express: '^4.17.1',
      },
      devDependencies: {
        typescript: '^4.3.5',
      },
    };

    it('should pass when all required dependencies exist', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockPackageJson));

      await expect(
        validateDependencies('/root', {
          react: '^17.0.0',
          typescript: '^4.3.5',
        })
      ).resolves.toBeUndefined();
    });

    it('should throw when required dependencies are missing', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockPackageJson));

      await expect(
        validateDependencies('/root', {
          'missing-dep': '^1.0.0',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw when package.json cannot be read', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      await expect(validateDependencies('/root', {})).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('validateConfigFiles', () => {
    it('should pass when all config files exist', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await expect(
        validateConfigFiles('/root', ['tsconfig.json', '.eslintrc'])
      ).resolves.toBeUndefined();
      expect(fs.access).toHaveBeenCalledTimes(2);
    });

    it('should throw when a config file is missing', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      await expect(
        validateConfigFiles('/root', ['missing-config'])
      ).rejects.toThrow(ValidationError);
      expect(fs.access).toHaveBeenCalledTimes(1);
    });
  });
});

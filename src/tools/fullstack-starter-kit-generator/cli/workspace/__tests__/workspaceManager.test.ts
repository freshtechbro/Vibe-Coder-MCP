import fs from 'fs/promises';
import path from 'path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { WorkspaceManager } from '../workspaceManager.js';

vi.mock('fs/promises');

describe('WorkspaceManager', () => {
  const mockRoot = '/test/root';
  let manager: WorkspaceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new WorkspaceManager(mockRoot);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initializeWorkspace', () => {
    it('should create workspace directories', async () => {
      const packages = ['apps/frontend', 'apps/backend', 'packages/ui'];

      await manager.initializeWorkspace(mockRoot, { packages });

      expect(fs.mkdir).toHaveBeenCalledTimes(packages.length);
      for (const pkg of packages) {
        expect(fs.mkdir).toHaveBeenCalledWith(path.join(mockRoot, pkg), {
          recursive: true,
        });
      }
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(fs.mkdir).mockRejectedValue(
        new Error('Failed to create directory')
      );

      await expect(
        manager.initializeWorkspace(mockRoot, { packages: ['apps/frontend'] })
      ).rejects.toThrow();
    });
  });

  describe('validateWorkspace', () => {
    it('should validate workspace directories exist', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const packages = ['apps/frontend', 'apps/backend'];
      await expect(
        manager.validateWorkspace(packages)
      ).resolves.toBeUndefined();

      expect(fs.access).toHaveBeenCalledTimes(packages.length);
      for (const pkg of packages) {
        expect(fs.access).toHaveBeenCalledWith(
          path.join(mockRoot, pkg),
          fs.constants.F_OK | fs.constants.R_OK
        );
      }
    });

    it('should throw when workspace directory is missing', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Directory not found'));

      await expect(
        manager.validateWorkspace(['apps/frontend'])
      ).rejects.toThrow();
    });
  });
});

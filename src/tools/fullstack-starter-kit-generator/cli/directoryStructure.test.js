import fs from 'fs/promises';

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  createDirectoryStructure,
  DEFAULT_MONOREPO_STRUCTURE,
} from './directoryStructure.js';

vi.mock('fs/promises');

describe('createDirectoryStructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  });

  it('should create directories based on structure', async () => {
    const structure = {
      apps: {
        frontend: {},
        backend: {},
      },
      packages: {
        utils: {},
      },
    };

    await createDirectoryStructure('test-output', structure);

    expect(fs.mkdir).toHaveBeenCalledWith('test-output/apps/frontend', {
      recursive: true,
    });
    expect(fs.mkdir).toHaveBeenCalledWith('test-output/apps/backend', {
      recursive: true,
    });
    expect(fs.mkdir).toHaveBeenCalledWith('test-output/packages/utils', {
      recursive: true,
    });
  });

  it('should use default structure if none provided', async () => {
    await createDirectoryStructure('test-output');

    for (const [key, value] of Object.entries(DEFAULT_MONOREPO_STRUCTURE)) {
      for (const subDir of Object.keys(value)) {
        expect(fs.mkdir).toHaveBeenCalledWith(`test-output/${key}/${subDir}`, {
          recursive: true,
        });
      }
    }
  });

  it('should handle empty structure', async () => {
    await createDirectoryStructure('test-output', {});
    expect(fs.mkdir).not.toHaveBeenCalled();
  });
});

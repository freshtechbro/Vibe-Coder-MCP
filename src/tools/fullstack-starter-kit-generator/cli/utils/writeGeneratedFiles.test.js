import fs from 'fs/promises';

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { writeGeneratedFiles } from './writeGeneratedFiles.js';

vi.mock('fs/promises');
vi.mock('./writeGeneratedFile.js', () => ({
  writeGeneratedFile: vi.fn(),
}));

describe('writeGeneratedFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create directories and write files', async () => {
    const files = {
      'file1.txt': 'content1',
      'dir/file2.txt': 'content2',
      'dir/subdir/file3.txt': 'content3',
    };

    await writeGeneratedFiles(files, '/output', false, false);

    expect(fs.mkdir).toHaveBeenCalledWith('/output', { recursive: true });
    expect(fs.mkdir).toHaveBeenCalledWith('/output/dir', { recursive: true });
    expect(fs.mkdir).toHaveBeenCalledWith('/output/dir/subdir', {
      recursive: true,
    });
  });

  it('should not create directories in dry run mode', async () => {
    const files = {
      'file1.txt': 'content1',
      'dir/file2.txt': 'content2',
    };

    await writeGeneratedFiles(files, '/output', false, true);

    expect(fs.mkdir).not.toHaveBeenCalled();
  });
});

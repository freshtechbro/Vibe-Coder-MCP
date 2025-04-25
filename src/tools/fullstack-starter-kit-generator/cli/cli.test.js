import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('CLI --dry-run flag', () => {
  const cliPath = path.resolve(__dirname, 'cli.js');
  const testFile = path.resolve(__dirname, 'dry-run-test.txt');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not write files when --dry-run is passed', () => {
    // Simulate CLI invocation with --dry-run
    const result = exec('node', [cliPath, '--dry-run', '--output', testFile], {
      encoding: 'utf8',
    });
    expect(result.stderr).toBe('');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(result.stdout).toMatch(/DRY RUN: Would write file:/);
  });

  it('should write files when --dry-run is not passed', () => {
    // Simulate CLI invocation without --dry-run
    const result = exec('node', [cliPath, '--output', testFile], {
      encoding: 'utf8',
    });
    // In real test, would check file system, but here we check the mock
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(result.stdout).not.toMatch(/DRY RUN: Would write file:/);
  });
});

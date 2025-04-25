import fs from 'fs/promises';
import path from 'path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { validatePackageJson } from './validatePackageJson.js';

vi.mock('fs/promises');

describe('validatePackageJson', () => {
  const testFilePath = path.join(__dirname, 'test-package.json');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should validate a correct package.json', async () => {
    const validPackageJson = {
      name: 'test-package',
      version: '1.0.0',
    };

    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validPackageJson));

    await expect(validatePackageJson(testFilePath)).resolves.toBe(true);
  });

  it('should validate a scoped package name', async () => {
    const validPackageJson = {
      name: '@scope/test-package',
      version: '1.0.0',
    };

    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validPackageJson));

    await expect(validatePackageJson(testFilePath)).resolves.toBe(true);
  });

  it('should reject invalid JSON', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('invalid json');

    await expect(validatePackageJson(testFilePath)).rejects.toThrow(
      'Invalid JSON'
    );
  });

  it('should reject missing required fields', async () => {
    const invalidPackageJson = {
      name: 'test-package',
      // missing version
    };

    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify(invalidPackageJson)
    );

    await expect(validatePackageJson(testFilePath)).rejects.toThrow(
      "Missing required field 'version'"
    );
  });

  it('should reject invalid package name', async () => {
    const invalidPackageJson = {
      name: 'Invalid Name!',
      version: '1.0.0',
    };

    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify(invalidPackageJson)
    );

    await expect(validatePackageJson(testFilePath)).rejects.toThrow(
      'Invalid package name'
    );
  });

  it('should reject invalid version', async () => {
    const invalidPackageJson = {
      name: 'test-package',
      version: 'not.a.version',
    };

    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify(invalidPackageJson)
    );

    await expect(validatePackageJson(testFilePath)).rejects.toThrow(
      'Invalid version'
    );
  });
});

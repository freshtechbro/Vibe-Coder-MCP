import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const execAsync = promisify(exec);

// Mock handlers
vi.mock('../../main.js', () => ({
  initHandler: vi.fn(),
  addPackageHandler: vi.fn(),
  setupFrontendHandler: vi.fn(),
  setupBackendHandler: vi.fn(),
}));

describe('CLI', () => {
  const CLI_PATH = path.resolve(__dirname, '../cli.ts');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('init command', () => {
    it('should execute init command with required options', async () => {
      const { stdout } = await execAsync(
        `ts-node ${CLI_PATH} init --name test-project`
      );
      expect(stdout).toContain('Project initialized successfully');
    });

    it('should fail without required name option', async () => {
      await expect(execAsync(`ts-node ${CLI_PATH} init`)).rejects.toThrow();
    });
  });

  describe('add-package command', () => {
    it('should execute add-package command with required options', async () => {
      const { stdout } = await execAsync(
        `ts-node ${CLI_PATH} add-package --name web --type frontend`
      );
      expect(stdout).toContain('Package added successfully');
    });

    it('should fail without required options', async () => {
      await expect(
        execAsync(`ts-node ${CLI_PATH} add-package`)
      ).rejects.toThrow();
    });
  });

  describe('setup-frontend command', () => {
    it('should execute setup-frontend command with required options', async () => {
      const { stdout } = await execAsync(
        `ts-node ${CLI_PATH} setup-frontend --name web --framework next --framework-version 13.0.0`
      );
      expect(stdout).toContain('Frontend setup successfully');
    });

    it('should accept optional styling options', async () => {
      const { stdout } = await execAsync(
        `ts-node ${CLI_PATH} setup-frontend --name web --framework next --framework-version 13.0.0 --styling tailwind --styling-version 3.0.0`
      );
      expect(stdout).toContain('Frontend setup successfully');
    });
  });

  describe('setup-backend command', () => {
    it('should execute setup-backend command with required options', async () => {
      const { stdout } = await execAsync(
        `ts-node ${CLI_PATH} setup-backend --name api --framework nest --framework-version 10.0.0`
      );
      expect(stdout).toContain('Backend setup successfully');
    });

    it('should accept optional database and ORM options', async () => {
      const { stdout } = await execAsync(
        `ts-node ${CLI_PATH} setup-backend --name api --framework nest --framework-version 10.0.0 --database postgresql --database-version 15 --orm prisma --orm-version 5.0.0`
      );
      expect(stdout).toContain('Backend setup successfully');
    });
  });
});

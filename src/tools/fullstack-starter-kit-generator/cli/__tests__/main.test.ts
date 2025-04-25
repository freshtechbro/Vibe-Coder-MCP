import { describe, it, expect, beforeEach, vi } from 'vitest';

import { sseNotifier } from '../../../../services/sse-notifier/index.js';
import { ValidationError } from '../../../../utils/errors.js';
import {
  initHandler,
  addPackageHandler,
  setupFrontendHandler,
  setupBackendHandler,
} from '../main.js';
import { TemplateContextBuilder } from '../templateContextBuilder.js';
import { FrontendOptions, BackendOptions, PackageOptions } from '../types.js';
import { WorkspaceManager } from '../workspace/workspaceManager.js';

// Mock dependencies
vi.mock('../workspace/workspaceManager.js');
vi.mock('../templateContextBuilder.js', () => ({
  TemplateContextBuilder: {
    getInstance: vi.fn(() => ({
      buildRootContext: vi.fn(),
      buildFrontendContext: vi.fn(),
      buildBackendContext: vi.fn(),
      buildPackageContext: vi.fn(),
    })),
  },
}));
vi.mock('../../../../services/sse-notifier/index.js');

describe('Fullstack Starter Kit Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock process.cwd()
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  describe('initHandler', () => {
    const validParams = {
      name: 'test-project',
      template: 'next-express',
      pnpmVersion: '8.0.0',
      turboRepo: true,
    };

    it('should initialize project successfully', async () => {
      await initHandler(validParams, { sessionId: 'test-session' });

      expect(
        WorkspaceManager.getInstance().initializeWorkspace
      ).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          name: 'test-project',
          pnpmVersion: '8.0.0',
        })
      );
      expect(sseNotifier.sendProgress).toHaveBeenCalledWith(
        'test-session',
        'init',
        'COMPLETED',
        expect.any(String)
      );
    });

    it('should throw ValidationError for invalid params', async () => {
      const invalidParams = {
        name: 'test-project',
        template: 'invalid-template',
      };

      await expect(
        initHandler(invalidParams, { sessionId: 'test-session' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('addPackageHandler', () => {
    const validParams: PackageOptions = {
      name: 'test-package',
      version: '1.0.0',
      type: 'frontend',
      path: 'packages/test-package',
      dependencies: {
        react: '^18.0.0',
      },
    };

    it('should add package successfully', async () => {
      await addPackageHandler(validParams, { sessionId: 'test-session' });

      expect(WorkspaceManager.getInstance().addPackage).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          name: 'test-package',
          type: 'frontend',
        })
      );
      expect(sseNotifier.sendProgress).toHaveBeenCalledWith(
        'test-session',
        'add-package',
        'COMPLETED',
        expect.any(String)
      );
    });

    it('should use default package path if not provided', async () => {
      await addPackageHandler(validParams, { sessionId: 'test-session' });

      expect(WorkspaceManager.getInstance().addPackage).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          path: 'packages/test-package',
        })
      );
    });
  });

  describe('setupFrontendHandler', () => {
    const validParams: FrontendOptions = {
      name: 'web',
      version: '1.0.0',
      language: 'typescript',
      framework: {
        name: 'next',
        version: '13.0.0',
      },
      styling: {
        framework: 'tailwind',
        version: '3.0.0',
      },
    };

    it('should setup frontend successfully', async () => {
      const mockContext = {
        /* mock frontend context */
      };
      const contextBuilder = TemplateContextBuilder.getInstance();
      // Use type assertion to avoid TypeScript errors
      (contextBuilder.buildFrontendContext as any).mockResolvedValueOnce(
        mockContext
      );

      await setupFrontendHandler(validParams, { sessionId: 'test-session' });

      expect(contextBuilder.buildFrontendContext).toHaveBeenCalledWith(
        validParams
      );
      expect(sseNotifier.sendProgress).toHaveBeenCalledWith(
        'test-session',
        'setup-frontend',
        'COMPLETED',
        expect.any(String)
      );
    });
  });

  describe('setupBackendHandler', () => {
    const validParams: BackendOptions = {
      name: 'api',
      version: '1.0.0',
      language: 'typescript',
      framework: {
        name: 'nest',
        version: '10.0.0',
      },
      database: {
        type: 'postgresql',
        version: '15',
      },
      orm: {
        name: 'prisma',
        version: '5.0.0',
      },
    };

    it('should setup backend successfully', async () => {
      const mockContext = {
        /* mock backend context */
      };
      const contextBuilder = TemplateContextBuilder.getInstance();
      // Use type assertion to avoid TypeScript errors
      (contextBuilder.buildBackendContext as any).mockResolvedValueOnce(
        mockContext
      );

      await setupBackendHandler(validParams, { sessionId: 'test-session' });

      expect(contextBuilder.buildBackendContext).toHaveBeenCalledWith(
        validParams
      );
      expect(sseNotifier.sendProgress).toHaveBeenCalledWith(
        'test-session',
        'setup-backend',
        'COMPLETED',
        expect.any(String)
      );
    });
  });
});

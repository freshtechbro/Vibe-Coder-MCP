import chalk from 'chalk';
import { describe, it, expect, vi } from 'vitest';

import { defineDependencies } from '../utils/dependencyDefiner.js';

describe('defineDependencies', () => {
  const mockTechStack = {
    frontend: 'react',
    backend: 'express',
    database: 'mongodb',
    testing: 'vitest',
  };

  const mockFeatures = {
    auth: true,
    analytics: false,
    i18n: true,
  };

  it('should return correct dependencies for React frontend', () => {
    const result = defineDependencies({
      techStack: { ...mockTechStack, frontend: 'react' },
      features: mockFeatures,
    });

    expect(result.npm.frontend.dependencies).toMatchObject({
      react: expect.stringMatching(/^\^18\./),
      'react-dom': expect.stringMatching(/^\^18\./),
    });
    expect(result.npm.frontend.devDependencies).toMatchObject({
      '@testing-library/react': expect.any(String),
      '@types/react': expect.any(String),
    });
  });

  it('should include auth dependencies when auth feature is enabled', () => {
    const result = defineDependencies({
      techStack: mockTechStack,
      features: { ...mockFeatures, auth: true },
    });

    expect(result.npm.backend.dependencies).toMatchObject({
      passport: expect.any(String),
      jsonwebtoken: expect.any(String),
    });
  });

  it('should include i18n dependencies when i18n feature is enabled', () => {
    const result = defineDependencies({
      techStack: mockTechStack,
      features: { ...mockFeatures, i18n: true },
    });

    expect(result.npm.frontend.dependencies).toMatchObject({
      i18next: expect.any(String),
      'react-i18next': expect.any(String),
    });
  });

  it('should return empty dependencies for unknown tech stack', () => {
    const result = defineDependencies({
      techStack: { ...mockTechStack, frontend: 'unknown' },
      features: mockFeatures,
    });

    expect(result.npm.frontend.dependencies).toEqual({});
    expect(result.npm.frontend.devDependencies).toEqual({});
  });

  it('should log warning for unknown tech stack', () => {
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    defineDependencies({
      techStack: { ...mockTechStack, frontend: 'unknown' },
      features: mockFeatures,
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      chalk.yellow('⚠️ Unknown frontend technology: unknown')
    );
    consoleWarnSpy.mockRestore();
  });

  it('should include TypeScript dependencies when TypeScript is enabled', () => {
    const result = defineDependencies({
      techStack: { ...mockTechStack, language: 'typescript' },
      features: mockFeatures,
    });

    expect(result.npm.root.devDependencies).toMatchObject({
      typescript: expect.any(String),
      '@types/node': expect.any(String),
    });
  });

  it('should include testing dependencies for vitest', () => {
    const result = defineDependencies({
      techStack: { ...mockTechStack, testing: 'vitest' },
      features: mockFeatures,
    });

    expect(result.npm.root.devDependencies).toMatchObject({
      vitest: expect.any(String),
      '@vitest/ui': expect.any(String),
    });
  });
});

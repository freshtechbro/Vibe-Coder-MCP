import chalk from 'chalk';

// Version definitions for different packages
const PACKAGE_VERSIONS = {
  // Frontend frameworks
  react: {
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
    },
    devDependencies: {
      '@testing-library/react': '^14.0.0',
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
    },
  },
  vue: {
    dependencies: {
      vue: '^3.3.0',
    },
    devDependencies: {
      '@vitejs/plugin-vue': '^4.0.0',
      '@vue/test-utils': '^2.3.0',
    },
  },
  // Backend frameworks
  express: {
    dependencies: {
      express: '^4.18.2',
      cors: '^2.8.5',
    },
    devDependencies: {
      '@types/express': '^4.17.17',
      nodemon: '^2.0.22',
    },
  },
  fastify: {
    dependencies: {
      fastify: '^4.15.0',
    },
    devDependencies: {
      'fastify-swagger': '^8.0.0',
    },
  },
  // Databases
  mongodb: {
    dependencies: {
      mongodb: '^5.7.0',
      mongoose: '^7.4.0',
    },
  },
  postgres: {
    dependencies: {
      pg: '^8.11.0',
      typeorm: '^0.3.15',
    },
  },
  // Testing
  vitest: {
    devDependencies: {
      vitest: '^0.34.0',
      '@vitest/ui': '^0.34.0',
    },
  },
  jest: {
    devDependencies: {
      jest: '^29.6.0',
      '@types/jest': '^29.5.0',
    },
  },
  // Features
  auth: {
    dependencies: {
      passport: '^0.7.0',
      jsonwebtoken: '^9.0.0',
      bcryptjs: '^2.4.3',
    },
  },
  i18n: {
    dependencies: {
      i18next: '^23.0.0',
      'react-i18next': '^13.0.0',
    },
  },
  // Language support
  typescript: {
    devDependencies: {
      typescript: '^5.1.0',
      '@types/node': '^20.0.0',
    },
  },
};

/**
 * Defines dependencies based on selected tech stack and features
 * @param {object} options - Configuration options
 * @param {object} options.techStack - Selected technologies
 * @param {object} options.features - Enabled features
 * @returns {object} - Dependency definitions for all packages
 */
export function defineDependencies({ techStack, features }) {
  const result = {
    npm: {
      root: { dependencies: {}, devDependencies: {} },
      frontend: { dependencies: {}, devDependencies: {} },
      backend: { dependencies: {}, devDependencies: {} },
      shared: { dependencies: {}, devDependencies: {} },
    },
  };

  // Handle frontend dependencies
  if (techStack.frontend && PACKAGE_VERSIONS[techStack.frontend]) {
    const frontendConfig = PACKAGE_VERSIONS[techStack.frontend];
    result.npm.frontend.dependencies = { ...frontendConfig.dependencies };
    result.npm.frontend.devDependencies = { ...frontendConfig.devDependencies };
  } else if (techStack.frontend) {
    console.warn(
      chalk.yellow(`⚠️ Unknown frontend technology: ${techStack.frontend}`)
    );
  }

  // Handle backend dependencies
  if (techStack.backend && PACKAGE_VERSIONS[techStack.backend]) {
    const backendConfig = PACKAGE_VERSIONS[techStack.backend];
    result.npm.backend.dependencies = { ...backendConfig.dependencies };
    result.npm.backend.devDependencies = { ...backendConfig.devDependencies };
  } else if (techStack.backend) {
    console.warn(
      chalk.yellow(`⚠️ Unknown backend technology: ${techStack.backend}`)
    );
  }

  // Handle database dependencies
  if (techStack.database && PACKAGE_VERSIONS[techStack.database]) {
    const dbConfig = PACKAGE_VERSIONS[techStack.database];
    result.npm.backend.dependencies = {
      ...result.npm.backend.dependencies,
      ...dbConfig.dependencies,
    };
  } else if (techStack.database) {
    console.warn(
      chalk.yellow(`⚠️ Unknown database technology: ${techStack.database}`)
    );
  }

  // Handle testing framework
  if (techStack.testing && PACKAGE_VERSIONS[techStack.testing]) {
    const testConfig = PACKAGE_VERSIONS[techStack.testing];
    result.npm.root.devDependencies = {
      ...result.npm.root.devDependencies,
      ...testConfig.devDependencies,
    };
  }

  // Handle features
  if (features.auth) {
    result.npm.backend.dependencies = {
      ...result.npm.backend.dependencies,
      ...PACKAGE_VERSIONS.auth.dependencies,
    };
  }

  if (
    features.i18n &&
    techStack.frontend &&
    PACKAGE_VERSIONS[techStack.frontend]
  ) {
    result.npm.frontend.dependencies = {
      ...result.npm.frontend.dependencies,
      ...PACKAGE_VERSIONS.i18n.dependencies,
    };
  }

  // Handle language support
  if (techStack.language === 'typescript') {
    result.npm.root.devDependencies = {
      ...result.npm.root.devDependencies,
      ...PACKAGE_VERSIONS.typescript.devDependencies,
    };
  }

  return result;
}

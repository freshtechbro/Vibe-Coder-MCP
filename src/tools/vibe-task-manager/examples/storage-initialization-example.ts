/**
 * Example of how to use the standardized storage initialization utility
 * 
 * This demonstrates the consistent patterns for storage initialization
 * across all storage classes in the Vibe Task Manager.
 */

import { StorageInitializer, initializeStorage } from '../utils/storage-initialization.js';

/**
 * Example 1: Using the helper function for standard storage types
 */
async function exampleStandardInitialization() {
  console.log('=== Standard Storage Initialization Example ===');

  try {
    // Initialize project storage
    const projectResult = await initializeStorage('project', '/tmp/vibe-test');
    console.log('Project storage:', projectResult.success ? 'SUCCESS' : 'FAILED');
    if (!projectResult.success) {
      console.error('Error:', projectResult.error);
    }

    // Initialize task storage (includes epics)
    const taskResult = await initializeStorage('task', '/tmp/vibe-test');
    console.log('Task storage:', taskResult.success ? 'SUCCESS' : 'FAILED');
    if (!taskResult.success) {
      console.error('Error:', taskResult.error);
    }

    // Initialize dependency storage
    const depResult = await initializeStorage('dependency', '/tmp/vibe-test');
    console.log('Dependency storage:', depResult.success ? 'SUCCESS' : 'FAILED');
    if (!depResult.success) {
      console.error('Error:', depResult.error);
    }

  } catch (error) {
    console.error('Standard initialization failed:', error);
  }
}

/**
 * Example 2: Using custom configuration for specialized storage
 */
async function exampleCustomInitialization() {
  console.log('\n=== Custom Storage Initialization Example ===');

  try {
    const customConfig = {
      dataDirectory: '/tmp/vibe-custom',
      storageType: 'CustomStorage',
      directories: [
        'custom-data',
        'custom-cache',
        'custom-logs'
      ],
      indexFiles: [
        {
          path: 'custom-index.json',
          defaultData: StorageInitializer.createIndexData('customItems', '2.0.0')
        },
        {
          path: 'custom-metadata.json',
          defaultData: {
            metadata: {
              created: new Date().toISOString(),
              version: '2.0.0',
              schema: 'custom-v2'
            },
            settings: {
              cacheEnabled: true,
              logLevel: 'info'
            }
          }
        }
      ],
      validatePaths: true
    };

    const result = await StorageInitializer.initialize(customConfig);
    console.log('Custom storage:', result.success ? 'SUCCESS' : 'FAILED');
    
    if (result.success) {
      console.log('Directories created:', result.metadata.directoriesCreated.length);
      console.log('Index files created:', result.metadata.indexFilesCreated.length);
    } else {
      console.error('Error:', result.error);
    }

  } catch (error) {
    console.error('Custom initialization failed:', error);
  }
}

/**
 * Example 3: Using initialization with error recovery
 */
async function exampleInitializationWithRecovery() {
  console.log('\n=== Storage Initialization with Recovery Example ===');

  try {
    const config = {
      dataDirectory: '/tmp/vibe-recovery',
      storageType: 'RecoveryTestStorage',
      directories: ['recovery-test'],
      indexFiles: [
        {
          path: 'recovery-index.json',
          defaultData: StorageInitializer.createIndexData('recoveryItems')
        }
      ]
    };

    // This will retry up to 3 times with exponential backoff
    const result = await StorageInitializer.initializeWithRecovery(config, 3);
    console.log('Recovery storage:', result.success ? 'SUCCESS' : 'FAILED');
    
    if (!result.success) {
      console.error('Final error after retries:', result.error);
    }

  } catch (error) {
    console.error('Recovery initialization failed:', error);
  }
}

/**
 * Example 4: Integration with existing storage classes
 */
class ExampleStorage {
  private dataDirectory: string;
  private initialized = false;

  constructor(dataDirectory: string) {
    this.dataDirectory = dataDirectory;
  }

  /**
   * Initialize storage using the standardized utility
   */
  async initialize() {
    if (this.initialized) {
      return { success: true };
    }

    try {
      // Use the standardized initialization
      const result = await initializeStorage('project', this.dataDirectory);
      
      if (result.success) {
        this.initialized = true;
        console.log('ExampleStorage initialized successfully');
      } else {
        console.error('ExampleStorage initialization failed:', result.error);
      }

      return result;

    } catch (error) {
      console.error('ExampleStorage initialization error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Example method that requires initialization
   */
  async doSomething() {
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error('Storage not initialized');
      }
    }

    console.log('Doing something with initialized storage...');
  }
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log('Storage Initialization Examples\n');

  await exampleStandardInitialization();
  await exampleCustomInitialization();
  await exampleInitializationWithRecovery();

  console.log('\n=== Storage Class Integration Example ===');
  const storage = new ExampleStorage('/tmp/vibe-integration');
  await storage.doSomething();

  console.log('\nAll examples completed!');
}

// Export for use in other modules
export {
  exampleStandardInitialization,
  exampleCustomInitialization,
  exampleInitializationWithRecovery,
  ExampleStorage,
  runExamples
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}

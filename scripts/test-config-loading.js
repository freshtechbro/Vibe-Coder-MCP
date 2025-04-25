// test-config-loading.js - Test script to verify LLM model config loading and mapping
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name using ES module approach
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the LLM config file directly
function loadLlmConfig() {
  try {
    // Adjust path to point to the root directory relative to the script's new location
    const configPath = path.join(__dirname, '../llm_config.json');
    console.log(`Loading LLM config from: ${configPath}`);

    if (!fs.existsSync(configPath)) {
      console.error(`ERROR: Config file not found at ${configPath}`);
      return null;
    }

    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);

    if (!config || typeof config !== 'object') {
      console.error('ERROR: Invalid config format - not an object');
      return null;
    }

    if (!config.llm_mapping || typeof config.llm_mapping !== 'object') {
      console.error('ERROR: Missing or invalid llm_mapping in config');
      return null;
    }

    return config;
  } catch (error) {
    console.error(`ERROR loading config: ${error.message}`);
    return null;
  }
}

// Main test function
function testConfig() {
  console.log('=== CONFIG LOADING TEST ===');

  // Test step 1: Load the config
  const config = loadLlmConfig();
  if (!config) {
    console.error('FAILED: Could not load config file');
    process.exit(1);
  }

  // Test step 2: Verify mapping keys are present
  const mappingKeys = Object.keys(config.llm_mapping);
  console.log(`\nLoaded ${mappingKeys.length} model mappings:`);

  if (mappingKeys.length === 0) {
    console.error('FAILED: No mapping keys found');
    process.exit(1);
  }

  // Test step 3: Display all mappings
  console.log('\nModel mappings:');
  console.log('----------------------------------------');
  for (const [key, value] of Object.entries(config.llm_mapping)) {
    console.log(`${key.padEnd(30)} -> ${value}`);
  }
  console.log('----------------------------------------');

  // Test step 4: Test deep copying
  console.log('\nTesting deep copy integrity:');
  const configCopy1 = { ...config };
  const configCopy2 = JSON.parse(JSON.stringify(config));

  console.log(
    '- Shallow copy: llm_mapping reference comparison:',
    configCopy1.llm_mapping === config.llm_mapping
      ? 'SAME REFERENCE (potential issue)'
      : 'Different references'
  );

  console.log(
    '- Deep copy: llm_mapping reference comparison:',
    configCopy2.llm_mapping === config.llm_mapping
      ? 'SAME REFERENCE (unexpected)'
      : 'Different references (good)'
  );

  // Test step 5: Verify specific task mappings
  const criticalTasks = [
    'task_list_initial_generation',
    'task_list_decomposition',
    'research_query',
    'default_generation',
  ];

  console.log('\nChecking critical task mappings:');
  for (const task of criticalTasks) {
    if (config.llm_mapping[task]) {
      console.log(`- ${task}: ✓ Mapped to ${config.llm_mapping[task]}`);
    } else {
      console.log(`- ${task}: ✗ NOT MAPPED (potential issue)`);
    }
  }

  console.log('\n=== CONFIG LOADING TEST COMPLETED SUCCESSFULLY ===');
}

// Run the test
testConfig();

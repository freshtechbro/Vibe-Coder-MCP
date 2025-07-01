/**
 * Test script for verifying grammar file path resolution.
 *
 * This script tests the parser's ability to load grammar files from
 * the grammars directory (src/tools/code-map-generator/grammars/).
 *
 * It can be run with: npx ts-node src/tools/code-map-generator/test-grammar-paths.ts
 */

import {
  initializeParser,
  loadLanguageGrammar
} from './parser.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the grammar directory
const GRAMMARS_DIR = path.join(__dirname, 'grammars');

/**
 * Tests loading a grammar
 */
async function testGrammarLoading(extension: string, wasmFile: string): Promise<boolean> {
  console.log(`\n=== Testing grammar loading for ${extension} (${wasmFile}) ===`);

  const fullPath = path.join(GRAMMARS_DIR, wasmFile);

  try {
    // Check if the file exists
    await fs.access(fullPath, fs.constants.F_OK);
    console.log(`✅ Grammar file exists: ${fullPath}`);

    // Try to load the grammar
    const loaded = await loadLanguageGrammar(extension, { name: extension, wasmPath: wasmFile });

    if (loaded) {
      console.log(`✅ Successfully loaded grammar`);
      return true;
    } else {
      console.error(`❌ Failed to load grammar`);
      return false;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error accessing grammar file: ${errorMessage}`);
    return false;
  }
}

/**
 * Main test function
 */
async function runTests() {
  try {
    console.log("Initializing Tree-sitter parser...");
    await initializeParser();
    console.log("✅ Parser initialized successfully");

    console.log(`\nGrammar directory: ${GRAMMARS_DIR}`);

    // Test a few common languages
    const testCases = [
      { extension: '.js', wasmFile: 'tree-sitter-javascript.wasm' },
      { extension: '.ts', wasmFile: 'tree-sitter-typescript.wasm' },
      { extension: '.py', wasmFile: 'tree-sitter-python.wasm' },
      { extension: '.html', wasmFile: 'tree-sitter-html.wasm' },
      { extension: '.css', wasmFile: 'tree-sitter-css.wasm' },
      { extension: '.json', wasmFile: 'tree-sitter-json.wasm' }
    ];

    let successCount = 0;

    for (const testCase of testCases) {
      const success = await testGrammarLoading(testCase.extension, testCase.wasmFile);
      if (success) successCount++;
    }

    console.log(`\n=== Test Summary ===`);
    console.log(`Tested ${testCases.length} languages`);
    console.log(`${successCount}/${testCases.length} succeeded`);

  } catch (error) {
    console.error("❌ Test failed with error:", error);
  }
}

// Run the tests
runTests().catch(console.error);

/**
 * Test setup file for Vibe Task Manager integration tests
 * Loads environment variables and sets up test environment
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve(process.cwd(), '.env') });

// Ensure required environment variables are available for tests
if (!process.env.OPENROUTER_API_KEY) {
  console.warn('Warning: OPENROUTER_API_KEY not found in environment variables');
}

if (!process.env.GEMINI_MODEL) {
  // Set default if not provided
  process.env.GEMINI_MODEL = 'google/gemini-2.5-flash-preview-05-20';
}

if (!process.env.OPENROUTER_BASE_URL) {
  // Set default if not provided
  process.env.OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
}

// Set test-specific environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'info';

console.log('Test environment setup complete');
console.log('Environment variables loaded:', {
  OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
  GEMINI_MODEL: !!process.env.GEMINI_MODEL,
  OPENROUTER_BASE_URL: !!process.env.OPENROUTER_BASE_URL,
  NODE_ENV: process.env.NODE_ENV
});

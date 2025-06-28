#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('Building VibeCoder with Qwen3 thinking mode support...');

try {
  await execAsync('npm run build');
  console.log('✅ Build completed successfully!');
  console.log('');
  console.log('FIXED: Added support for Qwen3 thinking mode responses');
  console.log('- Qwen3 models return responses with <think>...</think> blocks');
  console.log('- Added processQwenThinkingResponse() to extract actual content');
  console.log('- For markdown generation tasks, thinking blocks are removed');
  console.log('- For other tasks, thinking blocks are preserved');
  console.log('');
  console.log('Please restart Claude Desktop for changes to take effect.');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}

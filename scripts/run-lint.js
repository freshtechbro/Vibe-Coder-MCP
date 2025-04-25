import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Get a list of all TypeScript files in src directory
function getTypeScriptFiles(dir) {
  console.log(`Reading directory: ${dir}`);
  const allFiles = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      allFiles.push(...getTypeScriptFiles(filePath));
    } else if (file.endsWith('.ts')) {
      allFiles.push(filePath);
    }
  }

  return allFiles;
}

try {
  console.log('Getting all TypeScript files...');
  const srcDir = path.resolve('./src');
  const tsFiles = getTypeScriptFiles(srcDir);
  console.log(`Found ${tsFiles.length} TypeScript files`);

  let allOutput = '';
  let errorCount = 0;
  let fileCount = 0;

  console.log('Running ESLint on each file...');
  for (const file of tsFiles) {
    try {
      console.log(`Linting file: ${file}`);
      const output = execSync(`npx eslint "${file}"`, { encoding: 'utf8' });
      if (output.trim()) {
        allOutput += `${file}:\n${output}\n\n`;
      } else {
        console.log(`✅ No issues in ${file}`);
      }
      fileCount++;
    } catch (fileError) {
      console.error(`Error linting ${file}:`, fileError.message);
      if (fileError.stdout) {
        allOutput += `${file}:\n${fileError.stdout}\n\n`;
      }
      if (fileError.stderr) {
        allOutput += `${file} (stderr):\n${fileError.stderr}\n\n`;
      }
      errorCount++;
      fileCount++;
    }
  }

  console.log(
    `ESLint completed. Processed ${fileCount} files, ${errorCount} had errors.`
  );

  if (allOutput) {
    fs.writeFileSync('lint-results.txt', allOutput, 'utf8');
    console.log('Results saved to lint-results.txt');
  } else {
    fs.writeFileSync(
      'lint-results.txt',
      'No issues found in any files.',
      'utf8'
    );
    console.log('No linting issues found! ✅');
  }
} catch (error) {
  console.error('Script error:', error.message);
  fs.writeFileSync(
    'lint-error.txt',
    `Script Error: ${error.message}\n\n${error.stack || '(no stack trace)'}`,
    'utf8'
  );
  console.log('Error details saved to lint-error.txt');
}

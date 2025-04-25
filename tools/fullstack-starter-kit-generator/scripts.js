import path from 'path';
/**
 * Generates setup scripts (bash and batch) based on a validated starter kit definition
 * @param definition The validated starter kit definition
 * @returns Object containing the content of both sh and bat scripts
 */
export function generateSetupScripts(definition) {
  const shLines = [
    '#!/bin/bash',
    '# Auto-generated setup script by Vibe Coder MCP',
    'set -e # Exit immediately if a command exits with a non-zero status.',
    '',
  ];
  const batLines = [
    '@echo off',
    'REM Auto-generated setup script by Vibe Coder MCP',
    'setlocal EnableDelayedExpansion',
    '',
  ];
  const projectName = definition.projectName; // Should exist due to Zod validation
  // Create root project directory and CD into it
  shLines.push(`echo "--> Creating project directory: ${projectName}"`);
  shLines.push(`mkdir -p "${projectName}"`);
  shLines.push(`cd "${projectName}"`);
  batLines.push(`echo --^> Creating project directory: ${projectName}`);
  batLines.push(`if not exist "${projectName}" mkdir "${projectName}"`);
  batLines.push(`cd "${projectName}"`);
  batLines.push('');
  // Function to recursively process structure
  function processStructure(items, currentPathSh, currentPathBat) {
    items.forEach((item) => {
      // Use POSIX paths for sh, OS-specific (via path.join) for bat
      const itemPathSh = path.posix.join(currentPathSh, item.path);
      const itemPathBat = path.join(currentPathBat, item.path);
      const parentDirSh = path.posix.dirname(itemPathSh);
      const parentDirBat = path.dirname(itemPathBat);
      // Ensure parent directory exists
      if (parentDirSh !== '.') {
        shLines.push(`mkdir -p "${parentDirSh}"`);
      }
      // `mkdir` in batch often handles intermediate dirs, but `if not exist` is safer
      if (parentDirBat !== '.') {
        batLines.push(`if not exist "${parentDirBat}" mkdir "${parentDirBat}"`);
      }
      if (item.type === 'directory') {
        shLines.push(`mkdir -p "${itemPathSh}"`);
        batLines.push(`if not exist "${itemPathBat}" mkdir "${itemPathBat}"`);
        if (item.children && item.children.length > 0) {
          processStructure(item.children, currentPathSh, currentPathBat);
        }
      } else if (item.type === 'file') {
        let fileContent = item.content;
        if (fileContent === null && item.generationPrompt) {
          fileContent = `# TODO: Generate content for ${item.path}\n# Prompt: ${item.generationPrompt.replace(/\n/g, '\n# ')}\n`;
        } else if (fileContent === null) {
          fileContent = ''; // Create empty file
        }
        // SH Script: Use cat + EOF for reliable multiline content
        // Escape backticks, dollar signs, and backslashes within the content for the here-document
        const escapedContentSh = fileContent
          .replace(/\\/g, '\\\\')
          .replace(/`/g, '\\`')
          .replace(/\$/g, '\\$');
        shLines.push(`echo "    Creating ${itemPathSh}..."`);
        shLines.push(`cat <<'EOF' > "${itemPathSh}"`); // Use 'EOF' to prevent shell variable expansion inside
        shLines.push(escapedContentSh);
        shLines.push(`EOF`);
        // BAT Script: Use echo line-by-line. This is fragile for complex content.
        // Escape special batch characters: %, !, ^, &, <, >, |
        batLines.push(`echo     Creating ${itemPathBat}...`);
        const contentLines = fileContent.split(/\r?\n/);
        // Create or overwrite file with the first line
        if (contentLines.length > 0) {
          const firstLineEscaped = contentLines[0]
            .replace(/%/g, '%%')
            .replace(/\^/g, '^^')
            .replace(/&/g, '^&')
            .replace(/</g, '^<')
            .replace(/>/g, '^>')
            .replace(/\|/g, '^|')
            .replace(/!/g, '^^!');
          // Use conditional echo for empty first line
          if (firstLineEscaped.trim() === '') {
            batLines.push(`(echo.) > "${itemPathBat}"`);
          } else {
            batLines.push(`(echo ${firstLineEscaped}) > "${itemPathBat}"`);
          }
        } else {
          // Create empty file if content is empty string
          batLines.push(`type nul > "${itemPathBat}"`);
        }
        // Append subsequent lines
        for (let i = 1; i < contentLines.length; i++) {
          const lineEscaped = contentLines[i]
            .replace(/%/g, '%%')
            .replace(/\^/g, '^^')
            .replace(/&/g, '^&')
            .replace(/</g, '^<')
            .replace(/>/g, '^>')
            .replace(/\|/g, '^|')
            .replace(/!/g, '^^!');
          if (lineEscaped.trim() === '') {
            batLines.push(`(echo.) >> "${itemPathBat}"`);
          } else {
            batLines.push(`(echo ${lineEscaped}) >> "${itemPathBat}"`);
          }
        }
      }
    });
  }
  shLines.push(`echo "--> Generating project structure..."`);
  batLines.push(`echo --^> Generating project structure...`);
  processStructure(definition.directoryStructure, '.', '.'); // Start processing from current dir (which is projectName)
  shLines.push('');
  batLines.push('');
  // Handle dependencies installation
  if (definition.dependencies && definition.dependencies.npm) {
    shLines.push(`echo "--> Installing NPM dependencies..."`);
    batLines.push(`echo --^> Installing NPM dependencies...`);
    // Process root dependencies
    if (definition.dependencies.npm.root) {
      const rootDeps = definition.dependencies.npm.root;
      // Only process if there are dependencies to install
      if (
        (rootDeps.dependencies &&
          Object.keys(rootDeps.dependencies).length > 0) ||
        (rootDeps.devDependencies &&
          Object.keys(rootDeps.devDependencies).length > 0)
      ) {
        const deps = rootDeps.dependencies
          ? Object.entries(rootDeps.dependencies)
              .map(([pkg, ver]) => `${pkg}@${ver}`)
              .join(' ')
          : '';
        const devDeps = rootDeps.devDependencies
          ? Object.entries(rootDeps.devDependencies)
              .map(([pkg, ver]) => `${pkg}@${ver}`)
              .join(' ')
          : '';
        if (deps) {
          shLines.push(
            `echo "    Installing production dependencies in root directory..."`
          );
          shLines.push(`npm install ${deps}`);
          batLines.push(
            `echo     Installing production dependencies in root directory...`
          );
          batLines.push(`npm.cmd install ${deps}`);
        }
        if (devDeps) {
          shLines.push(
            `echo "    Installing development dependencies in root directory..."`
          );
          shLines.push(`npm install --save-dev ${devDeps}`);
          batLines.push(
            `echo     Installing development dependencies in root directory...`
          );
          batLines.push(`npm.cmd install --save-dev ${devDeps}`);
        }
      }
    }
    // Process subdirectory dependencies
    Object.entries(definition.dependencies.npm)
      .filter(([key]) => key !== 'root')
      .forEach(([subdir, pkgs]) => {
        // Skip if there are no dependencies
        if (
          (!pkgs.dependencies || Object.keys(pkgs.dependencies).length === 0) &&
          (!pkgs.devDependencies ||
            Object.keys(pkgs.devDependencies).length === 0)
        ) {
          return;
        }
        // Create subdirectory if it doesn't exist
        shLines.push(`mkdir -p "${subdir}"`);
        batLines.push(`if not exist "${subdir}" mkdir "${subdir}"`);
        // Change to subdirectory
        shLines.push(`cd "${subdir}"`);
        batLines.push(`cd "${subdir}"`);
        // Install dependencies
        const deps = pkgs.dependencies
          ? Object.entries(pkgs.dependencies)
              .map(([pkg, ver]) => `${pkg}@${ver}`)
              .join(' ')
          : '';
        const devDeps = pkgs.devDependencies
          ? Object.entries(pkgs.devDependencies)
              .map(([pkg, ver]) => `${pkg}@${ver}`)
              .join(' ')
          : '';
        if (deps) {
          shLines.push(
            `echo "    Installing production dependencies in ${subdir}..."`
          );
          shLines.push(`npm install ${deps}`);
          batLines.push(
            `echo     Installing production dependencies in ${subdir}...`
          );
          batLines.push(`npm.cmd install ${deps}`);
        }
        if (devDeps) {
          shLines.push(
            `echo "    Installing development dependencies in ${subdir}..."`
          );
          shLines.push(`npm install --save-dev ${devDeps}`);
          batLines.push(
            `echo     Installing development dependencies in ${subdir}...`
          );
          batLines.push(`npm.cmd install --save-dev ${devDeps}`);
        }
        // Return to parent directory
        shLines.push(`cd ..`);
        batLines.push(`cd ..`);
      });
  }
  // Add Setup Commands
  shLines.push(`echo "--> Running setup commands..."`);
  batLines.push(`echo --^> Running setup commands...`);
  if (Array.isArray(definition.setupCommands)) {
    definition.setupCommands.forEach((cmd) => {
      shLines.push(`echo "    Executing: ${cmd}"`);
      shLines.push(cmd);
      // Basic conversion for bat, might need adjustment
      const batCmd = cmd
        .replace(/\//g, '\\')
        .replace(/^npx /, 'npx.cmd ')
        .replace(/^npm /, 'npm.cmd ');
      batLines.push(`echo     Executing: ${batCmd}`);
      batLines.push(batCmd);
    });
  }
  shLines.push('');
  batLines.push('');
  shLines.push(`echo "--> Setup complete for project: ${projectName}"`);
  shLines.push('echo "--> Please check the output above for any errors."');
  batLines.push(`echo --^> Setup complete for project: ${projectName}`);
  batLines.push('echo --^> Please check the output above for any errors.');
  batLines.push('pause'); // Keep window open on Windows
  return { sh: shLines.join('\n'), bat: batLines.join('\r\n') };
}

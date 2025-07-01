import { StarterKitDefinition } from './schema.js';

/**
 * Output interface for generated scripts
 */
export interface ScriptOutput {
  sh: string;
  bat: string;
}

/**
 * Generates setup scripts (bash and batch) based on a starter kit definition JSON file.
 * The scripts will expect a [timestamp]-[sanitized-name]-definition.json file in the same directory.
 * @param definition The validated starter kit definition (used to get projectName for the definition file name)
 * @param definitionFilename The actual name of the definition JSON file the scripts should load
 * @returns Object containing the content of both sh and bat scripts
 */
export function generateSetupScripts(definition: StarterKitDefinition, definitionFilename: string): ScriptOutput {
  const shLines: string[] = [
    '#!/bin/bash',
    '# Auto-generated setup script by Vibe Coder MCP',
    '# This script expects the definition JSON file to be in the same directory.',
    'set -e # Exit immediately if a command exits with a non-zero status.',
    '',
    `DEFINITION_FILE="\${0%/*}/${definitionFilename}"`,
    '',
    'if [ ! -f "$DEFINITION_FILE" ]; then',
    '  echo "ERROR: Definition file not found: $DEFINITION_FILE"',
    '  exit 1',
    'fi',
    '',
    '# Function to extract values from JSON using basic tools (grep, sed, awk - might need jq for robustness)',
    '# This is a simplified parser. For production, consider embedding jq or a more robust parser.',
    'get_json_value() {',
    '  local json_file="$1"',
    '  local key_path="$2"',
    '  # Simplified: extracts first string value for a given key. Not robust for complex structures.',
    '  grep -oP \'"${key_path%/*.*}":\\s*".*?"\' "$json_file" | head -1 | sed -e \'s/.*": "//\' -e \'s/"//\'',
    '}',
    '',
    'PROJECT_NAME=$(jq -r .projectName "$DEFINITION_FILE")',
    'echo "--> Reading project name from JSON: $PROJECT_NAME"',
    ''
  ];

  const batLines: string[] = [
    '@echo off',
    'REM Auto-generated setup script by Vibe Coder MCP',
    'REM This script expects the definition JSON file to be in the same directory.',
    'setlocal EnableDelayedExpansion',
    '',
    `set "DEFINITION_FILE=%~dp0${definitionFilename}"`,
    '',
    'if not exist "!DEFINITION_FILE!" (',
    '  echo ERROR: Definition file not found: !DEFINITION_FILE!',
    '  exit /b 1',
    ')',
    '',
    'REM For Windows, parsing JSON without external tools is complex.',
    'REM This script will rely on the user having jq available or will use PowerShell for parsing.',
    'echo Attempting to parse PROJECT_NAME from !DEFINITION_FILE! using PowerShell...',
    'for /f "delims=" %%a in (\'powershell -Command "(Get-Content \'!DEFINITION_FILE!\' -Raw | ConvertFrom-Json).projectName"\') do set PROJECT_NAME=%%a',
    'if "!PROJECT_NAME!"=="" (',
    '  echo WARNING: Could not parse projectName using PowerShell. You might need to set it manually or ensure PowerShell is available and execution policies allow scripts.',
    '  set PROJECT_NAME=default-project-name',
    ')',
    'echo --^> Reading project name from JSON: !PROJECT_NAME!',
    ''
  ];

  const projectNameVariableSh = "$PROJECT_NAME";
  const projectNameVariableBat = "!PROJECT_NAME!";

  // Create root project directory and CD into it
  shLines.push(`echo "--> Creating project directory: ${projectNameVariableSh}"`);
  shLines.push(`mkdir -p "${projectNameVariableSh}"`);
  shLines.push(`cd "${projectNameVariableSh}"`);

  batLines.push(`echo --^> Creating project directory: ${projectNameVariableBat}`);
  batLines.push(`if not exist "${projectNameVariableBat}" mkdir "${projectNameVariableBat}"`);
  batLines.push(`cd "${projectNameVariableBat}"`);
  batLines.push('');

  // Add commands to unpack structure from JSON
  shLines.push('echo "--> Generating project structure from JSON definition..."');
  shLines.push('# This requires jq to be installed for robust JSON parsing in bash.');
  shLines.push('if ! command -v jq &> /dev/null; then echo "jq could not be found, please install jq to process the JSON definition."; exit 1; fi');
  shLines.push('');
  shLines.push('process_structure_item() {');
  shLines.push('  local item_path="$1"');
  shLines.push('  local item_type="$2"');
  shLines.push('  local item_content_b64="$3" # Expect base64 encoded content to handle special chars');
  shLines.push('  local children_count="$4"');
  shLines.push('  local current_prefix="$5"');
  shLines.push('');
  shLines.push('  local full_item_path="${current_prefix}${item_path}"');
  shLines.push('  echo "    Processing: $full_item_path ($item_type)"');
  shLines.push('');
  shLines.push('  if [ "$item_type" == "directory" ]; then');
  shLines.push('    mkdir -p "$full_item_path"');
  shLines.push('    for i in $(seq 0 $(($children_count - 1))); do');
  shLines.push('      local child_item_path=$(jq -r ".directoryStructure[] | select(.path==\\"$item_path\\") | .children[$i].path" "$DEFINITION_FILE")');
  shLines.push('      # This simplified jq query needs to be heavily adapted for proper recursive parsing');
  shLines.push('      # This is a placeholder for a much more complex recursive parsing logic for directoryStructure');
  shLines.push('      echo "      (Placeholder for child processing: $child_item_path)"');
  shLines.push('    done');
  shLines.push('  elif [ "$item_type" == "file" ]; then');
  shLines.push('    local parent_dir=$(dirname "$full_item_path")');
  shLines.push('    mkdir -p "$parent_dir"');
  shLines.push('    if [ "$item_content_b64" != "null" ] && [ ! -z "$item_content_b64" ]; then');
  shLines.push('      echo "$item_content_b64" | base64 --decode > "$full_item_path"');
  shLines.push('    else');
  shLines.push('      touch "$full_item_path" # Create empty file');
  shLines.push('    fi');
  shLines.push('  fi');
  shLines.push('}');
  shLines.push('');
  shLines.push('# Loop through directoryStructure (root items) - THIS IS HIGHLY SIMPLIFIED AND NEEDS ROBUST PARSING');
  shLines.push('root_items_count=$(jq ".directoryStructure | length" "$DEFINITION_FILE")');
  shLines.push('for i in $(seq 0 $(($root_items_count - 1))); do');
  shLines.push('  item_path_jq=".directoryStructure[$i].path"');
  shLines.push('  item_type_jq=".directoryStructure[$i].type"');
  shLines.push('  item_content_jq=".directoryStructure[$i].content" # Will need base64 encoding in JSON');
  shLines.push('  children_count_jq=".directoryStructure[$i].children | length"');
  shLines.push('');
  shLines.push('  item_path_val=$(jq -r "$item_path_jq" "$DEFINITION_FILE")');
  shLines.push('  item_type_val=$(jq -r "$item_type_jq" "$DEFINITION_FILE")');
  shLines.push('  item_content_val_b64=$(jq -r "$item_content_jq" "$DEFINITION_FILE") # Assume content is base64 encoded in JSON');
  shLines.push('  children_val_count=$(jq -r "$children_count_jq" "$DEFINITION_FILE")');
  shLines.push('  if [ "$children_val_count" == "null" ]; then children_val_count=0; fi');
  shLines.push('');
  shLines.push('  # process_structure_item "$item_path_val" "$item_type_val" "$item_content_val_b64" "$children_val_count" ""');
  shLines.push('done');
  shLines.push('echo "WARNING: Bash script directory structure creation is simplified and may require manual review or `jq` for full functionality."');
  shLines.push('echo "The full definition is in ${DEFINITION_FILE}. You may need to process it with a more robust script."');

  batLines.push('echo --^> Generating project structure from JSON definition !DEFINITION_FILE!...');
  batLines.push('REM PowerShell is recommended for parsing JSON on Windows.');
  batLines.push('REM This is a placeholder for PowerShell logic to parse DEFINITION_FILE and create structure.');
  batLines.push('powershell -Command "& {');
  batLines.push('  param($jsonPath)');
  batLines.push('  Write-Host \\"Processing JSON structure from $jsonPath (PowerShell)...\\"');
  batLines.push('  $ErrorActionPreference = \'Stop\'');
  batLines.push('  try { $config = Get-Content $jsonPath -Raw | ConvertFrom-Json } catch { Write-Error \\"Failed to parse JSON definition: $_\\"; exit 1 }');
  batLines.push('');
  batLines.push('  function Process-DirectoryItem {');
  batLines.push('    param($item, $currentPath)');
  batLines.push('    $itemFullPath = Join-Path -Path $currentPath -ChildPath $item.path');
  batLines.push('    Write-Host \\"  Processing item: $($itemFullPath)\\"');
  batLines.push('    if ($item.type -eq \'directory\') {');
  batLines.push('      if (-not (Test-Path $itemFullPath)) { New-Item -ItemType Directory -Path $itemFullPath -Force | Out-Null }');
  batLines.push('      if ($item.children) {');
  batLines.push('        foreach ($child in $item.children) { Process-DirectoryItem -item $child -currentPath $itemFullPath }');
  batLines.push('      }');
  batLines.push('    } elseif ($item.type -eq \'file\') {');
  batLines.push('      $parentDir = Split-Path $itemFullPath;');
  batLines.push('      if (-not (Test-Path $parentDir)) { New-Item -ItemType Directory -Path $parentDir -Force | Out-Null }');
  batLines.push('      if ($item.content) {');
  batLines.push('        # Assuming content is plain text. If Base64, decode here.');
  batLines.push('        Set-Content -Path $itemFullPath -Value $item.content -Encoding UTF8');
  batLines.push('      } else { New-Item -ItemType File -Path $itemFullPath -Force | Out-Null }');
  batLines.push('    }');
  batLines.push('  }');
  batLines.push('');
  batLines.push('  if ($config.directoryStructure) {');
  batLines.push('    foreach ($rootItem in $config.directoryStructure) { Process-DirectoryItem -item $rootItem -currentPath (Get-Location) }');
  batLines.push('  } else { Write-Warning \\"No directoryStructure found in JSON.\\" }');
  batLines.push('} -jsonPath \'!DEFINITION_FILE!\'');
  batLines.push('echo --^> Structure generation attempt with PowerShell finished.');

  shLines.push('');
  batLines.push('');

  // Handle dependencies installation (needs to parse from JSON)
  shLines.push('echo "--> Installing NPM dependencies (from JSON)..."');
  shLines.push('jq -c \'.dependencies.npm | to_entries[] | select(.value)\' "$DEFINITION_FILE" | while IFS= read -r entry; do');
  shLines.push('  dir_key=$(echo "$entry" | jq -r \'.key\')');
  shLines.push('  deps=$(echo "$entry" | jq -r \'.value.dependencies | to_entries | map("\\(.key)@\\(.value)") | join(" ")\')');
  shLines.push('  dev_deps=$(echo "$entry" | jq -r \'.value.devDependencies | to_entries | map("\\(.key)@\\(.value)") | join(" ")\')');
  shLines.push('');
  shLines.push('  target_dir="$dir_key"');
  shLines.push('  if [ "$dir_key" == "root" ]; then target_dir="."; fi');
  shLines.push('');
  shLines.push('  echo "    Processing dependencies for $target_dir"');
  shLines.push('  if [ ! -d "$target_dir" ] && [ "$target_dir" != "." ]; then mkdir -p "$target_dir"; fi');
  shLines.push('  (cd "$target_dir" || exit 1');
  shLines.push('    if [ ! -z "$deps" ]; then echo "      Installing: $deps"; npm install $deps; fi');
  shLines.push('    if [ ! -z "$dev_deps" ]; then echo "      Installing dev: $dev_deps"; npm install --save-dev $dev_deps; fi');
  shLines.push('  )');
  shLines.push('done');

  batLines.push('echo --^> Installing NPM dependencies (from JSON - PowerShell)...');
  batLines.push('powershell -Command "& {');
  batLines.push('  param($jsonPath)');
  batLines.push('  $config = Get-Content $jsonPath -Raw | ConvertFrom-Json');
  batLines.push('  if ($config.dependencies -and $config.dependencies.npm) {');
  batLines.push('    foreach ($pkgKey in $config.dependencies.npm.PSObject.Properties.Name) {');
  batLines.push('      $pkgSet = $config.dependencies.npm.$pkgKey;');
  batLines.push('      $targetDir = if ($pkgKey -eq \'root\') { \'.\' } else { $pkgKey };');
  batLines.push('      Write-Host \\"  Processing dependencies for $targetDir\\"');
  batLines.push('      if ($targetDir -ne \'.\') { if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null } }');
  batLines.push('      Push-Location $targetDir;');
  batLines.push('      if ($pkgSet.dependencies) { $depStr = ($pkgSet.dependencies.PSObject.Properties | ForEach-Object { \\"$($_.Name)@$($_.Value)\\" }) -join \' \'; if ($depStr) { Write-Host \\"    Installing: $depStr\\"; npm install $depStr } }');
  batLines.push('      if ($pkgSet.devDependencies) { $devDepStr = ($pkgSet.devDependencies.PSObject.Properties | ForEach-Object { \\"$($_.Name)@$($_.Value)\\" }) -join \' \'; if ($devDepStr) { Write-Host \\"    Installing dev: $devDepStr\\"; npm install --save-dev $devDepStr } }');
  batLines.push('      Pop-Location;');
  batLines.push('    }');
  batLines.push('  }');
  batLines.push('} -jsonPath \'!DEFINITION_FILE!\'');

  // Add Setup Commands (needs to parse from JSON)
  shLines.push('echo "--> Running setup commands (from JSON)..."');
  shLines.push('jq -r \'.setupCommands[]\' "$DEFINITION_FILE" | while IFS= read -r cmd; do');
  shLines.push('  echo "    Executing: $cmd"');
  shLines.push('  eval "$cmd" # Use eval to handle complex commands, be careful with input');
  shLines.push('done');

  batLines.push('echo --^> Running setup commands (from JSON - PowerShell)...');
  batLines.push('powershell -Command "& {');
  batLines.push('  param($jsonPath)');
  batLines.push('  $config = Get-Content $jsonPath -Raw | ConvertFrom-Json');
  batLines.push('  if ($config.setupCommands) {');
  batLines.push('    foreach ($cmd in $config.setupCommands) {');
  batLines.push('      Write-Host \\"  Executing: $cmd\\"');
  batLines.push('      Invoke-Expression $cmd');
  batLines.push('    }');
  batLines.push('  }');
  batLines.push('} -jsonPath \'!DEFINITION_FILE!\'');

  shLines.push('');
  batLines.push('');
  shLines.push(`echo "--> Setup complete for project: ${projectNameVariableSh}"`);
  shLines.push('echo "--> Please check the output above for any errors."');

  batLines.push(`echo --^> Setup complete for project: ${projectNameVariableBat}`);
  batLines.push('echo --^> Please check the output above for any errors.');
  batLines.push('pause'); // Keep window open on Windows

  return { sh: shLines.join("\n"), bat: batLines.join("\r\n") };
}
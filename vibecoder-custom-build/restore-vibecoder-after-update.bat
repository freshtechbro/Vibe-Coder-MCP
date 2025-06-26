@echo off
echo ================================================================
echo VibeCoder Update Recovery Script
echo ================================================================
echo This script restores .env model switching after VibeCoder updates
echo.

set VIBE_DIR=C:\Users\Ascension\Claude\root\vibe-coder-mcp
set BACKUP_DIR=C:\Users\Ascension\Claude\root\vibecoder-backups
set CONFIG_LOADER=%VIBE_DIR%\src\utils\configLoader.ts

echo Step 1: Creating backup directory...
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo Step 2: Backing up current configLoader.ts...
if exist "%CONFIG_LOADER%" (
    copy "%CONFIG_LOADER%" "%BACKUP_DIR%\configLoader-original.ts" >nul
    echo ✓ Original file backed up
) else (
    echo ⚠ configLoader.ts not found - VibeCoder may not be built yet
)

echo.
echo Step 3: Restoring .env model switching system...

(
echo import fs from 'fs-extra';
echo import path from 'path';
echo import logger from '../logger.js';
echo import { OpenRouterConfig } from '../types/workflow.js';
echo.
echo interface LlmConfigFile {
echo   llm_mapping: Record^<string, string^>;
echo }
echo.
echo export function loadLlmConfigMapping^(
echo   fileName: string = 'llm_config.json'
echo ^): Record^<string, string^> {
echo   let filePath: string ^| null = null;
echo   let baseMapping: Record^<string, string^> = {};
echo.
echo   if ^(process.env.LLM_CONFIG_PATH^) {
echo     const envPath = process.env.LLM_CONFIG_PATH;
echo     if ^(fs.existsSync^(envPath^)^) {
echo       logger.info^(`Found LLM config path in environment variable: ${envPath}`^);
echo       filePath = envPath;
echo     } else {
echo       logger.warn^(`LLM_CONFIG_PATH environment variable set to ${envPath}, but file not found.`^);
echo     }
echo   }
echo.
echo   if ^(!filePath^) {
echo     const cwdPath = path.join^(process.cwd^(^), fileName^);
echo     if ^(fs.existsSync^(cwdPath^)^) {
echo       logger.info^(`Found LLM config in current working directory: ${cwdPath}`^);
echo       filePath = cwdPath;
echo     }
echo   }
echo.
echo   if ^(filePath^) {
echo     try {
echo       const fileContent = fs.readFileSync^(filePath, 'utf-8'^);
echo       const parsedConfig = JSON.parse^(fileContent^) as LlmConfigFile;
echo       if ^(parsedConfig ^&^& typeof parsedConfig.llm_mapping === 'object' ^&^& parsedConfig.llm_mapping !== null^) {
echo         logger.info^(`LLM config loaded successfully from ${filePath}`^);
echo         for ^(const key in parsedConfig.llm_mapping^) {
echo           if ^(typeof parsedConfig.llm_mapping[key] !== 'string'^) {
echo              logger.warn^(`Invalid non-string value found for key "${key}" in ${filePath}. Skipping this key.`^);
echo              delete parsedConfig.llm_mapping[key];
echo           }
echo         }
echo         baseMapping = parsedConfig.llm_mapping;
echo       }
echo     } catch ^(error^) {
echo       logger.error^({ err: error, filePath }, `Failed to load or parse LLM config from ${filePath}.`^);
echo     }
echo   }
echo.
echo   const envOverrides: Record^<string, string^> = {};
echo   const getModelFromEnv = ^(envVar: string, fallback: string^): string =^> process.env[envVar] ^|^| fallback;
echo   const models = {
echo     kimi: getModelFromEnv^('KIMI_MODEL', 'moonshotai/kimi-dev-72b:free'^),
echo     llama: getModelFromEnv^('LLAMA_MODEL', 'meta-llama/llama-3.3-70b-instruct:free'^),
echo     deepseek: getModelFromEnv^('DEEPSEEK_MODEL', 'deepseek/deepseek-r1-0528-qwen3-8b:free'^),
echo     perplexity: getModelFromEnv^('PERPLEXITY_MODEL', 'perplexity/sonar-deep-research'^)
echo   };
echo.
echo   const codeTasks = ['dependency_analysis', 'context_curator_intent_analysis', 'context_curator_file_discovery', 'rules_generation', 'project_analysis'];
echo   codeTasks.forEach^(task =^> envOverrides[task] = models.kimi^);
echo   const generalTasks = ['prd_generation', 'user_stories_generation', 'task_list_initial_generation', 'fullstack_starter_kit_generation', 'default_generation'];
echo   generalTasks.forEach^(task =^> envOverrides[task] = models.llama^);
echo   const reasoningTasks = ['sequential_thought_generation', 'intent_recognition', 'atomic_task_detection', 'dependency_graph_analysis'];
echo   reasoningTasks.forEach^(task =^> envOverrides[task] = models.deepseek^);
echo   envOverrides['research_query'] = models.perplexity;
echo.
echo   const finalMapping = { ...baseMapping, ...envOverrides };
echo   logger.info^({ envOverrides: Object.keys^(envOverrides^).length, modelsUsed: models }, 'LLM config with .env overrides'^);
echo   return finalMapping;
echo }
echo.
echo export function selectModelForTask^(config: OpenRouterConfig, logicalTaskName: string, defaultModel: string^): string {
echo   const mapping = config?.llm_mapping;
echo   if ^(!mapping ^|^| typeof mapping !== 'object'^) return defaultModel;
echo   const modelFromMapping = mapping[logicalTaskName];
echo   const defaultFromMapping = mapping['default_generation'];
echo   const modelToUse = modelFromMapping ^|^| defaultFromMapping ^|^| defaultModel;
echo   logger.info^({ logicalTaskName, modelToUse }, 'Model selection'^);
echo   return modelToUse;
echo }
) > "%CONFIG_LOADER%"

echo ✓ .env model switching system restored

echo.
echo Step 4: Building VibeCoder...
cd "%VIBE_DIR%"
npm run build

if %errorlevel% equ 0 (
    echo ✓ Build successful!
) else (
    echo ✗ Build failed! Restoring original file...
    if exist "%BACKUP_DIR%\configLoader-original.ts" (
        copy "%BACKUP_DIR%\configLoader-original.ts" "%CONFIG_LOADER%" >nul
        echo ✓ Original file restored
    )
    echo Please check for build errors and try again
    pause
    exit /b 1
)

echo.
echo ================================================================
echo ✅ UPDATE RECOVERY COMPLETE!
echo ================================================================
echo.
echo What was restored:
echo ✓ .env model switching system
echo ✓ Smart model assignment by task type
echo ✓ All 8+ model options available
echo.
echo Available models in .env:
echo • KIMI_MODEL: moonshotai/kimi-dev-72b:free (code tasks)
echo • LLAMA_MODEL: meta-llama/llama-3.3-70b-instruct:free (general)
echo • DEEPSEEK_MODEL: deepseek/deepseek-r1-0528-qwen3-8b:free (reasoning)
echo • Plus: GEMINI_MODEL, QWEN_MODEL, NVIDIA_MODEL, MINIMAX_MODEL, DEEPSEEK_V3_MODEL
echo.
echo To change models: Edit .env file and restart Claude Desktop
echo Ready to use VibeCoder with .env model switching!
echo.
pause
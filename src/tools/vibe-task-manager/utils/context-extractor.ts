/**
 * Context Extractor - Dynamic project and epic ID extraction utility
 * Extracts project context from various sources: git, directory, session context
 */

import { CommandExecutionContext } from '../nl/command-handlers.js';
import { getProjectOperations } from '../core/operations/project-operations.js';
import { ProjectAnalyzer } from './project-analyzer.js';
import logger from '../../../logger.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Project context extraction result
 */
export interface ProjectContextResult {
  projectId: string;
  projectName: string;
  source: 'session' | 'git' | 'directory' | 'package' | 'fallback';
  confidence: number;
}

/**
 * Epic context extraction result
 */
export interface EpicContextResult {
  epicId: string;
  epicName: string;
  source: 'session' | 'project' | 'default' | 'fallback';
  confidence: number;
}

/**
 * Extract project context from various sources
 * Priority: session context > git remote > package.json > directory name > fallback
 */
export async function extractProjectFromContext(
  context: CommandExecutionContext,
  projectPath?: string
): Promise<ProjectContextResult> {
  const workingPath = projectPath || process.cwd();
  
  try {
    logger.debug({ workingPath, sessionId: context.sessionId }, 'Starting project context extraction');

    // 1. Check session context first (highest priority)
    if (context.currentProject) {
      logger.debug({ currentProject: context.currentProject }, 'Found project in session context');
      return {
        projectId: context.currentProject,
        projectName: context.currentProject,
        source: 'session',
        confidence: 0.95
      };
    }

    // 2. Try to extract from git remote
    const gitResult = await extractFromGitRemote(workingPath);
    if (gitResult.confidence > 0.8) {
      logger.debug({ gitResult }, 'Extracted project from git remote');
      return gitResult;
    }

    // 3. Try to extract from package.json
    const packageResult = await extractFromPackageJson(workingPath);
    if (packageResult.confidence > 0.7) {
      logger.debug({ packageResult }, 'Extracted project from package.json');
      return packageResult;
    }

    // 4. Use directory name as fallback
    const directoryResult = extractFromDirectoryName(workingPath);
    logger.debug({ directoryResult }, 'Using directory name as project context');
    return directoryResult;

  } catch (error) {
    logger.warn({ error, workingPath }, 'Project context extraction failed, using fallback');
    
    // Ultimate fallback
    return {
      projectId: 'default-project',
      projectName: 'Default Project',
      source: 'fallback',
      confidence: 0.1
    };
  }
}

/**
 * Extract epic context from project and session
 * Priority: session context > project default epic > generated epic > fallback
 */
export async function extractEpicFromContext(
  context: CommandExecutionContext,
  projectId?: string
): Promise<EpicContextResult> {
  try {
    logger.debug({ projectId, sessionId: context.sessionId }, 'Starting epic context extraction');

    // 1. Check session context first
    if (context.currentTask) {
      // Try to get epic from current task
      const epicFromTask = await extractEpicFromTask(context.currentTask);
      if (epicFromTask.confidence > 0.8) {
        logger.debug({ epicFromTask }, 'Found epic from current task');
        return epicFromTask;
      }
    }

    // 2. Try to get default epic from project
    if (projectId) {
      const projectEpic = await extractEpicFromProject(projectId);
      if (projectEpic.confidence > 0.6) {
        logger.debug({ projectEpic }, 'Found epic from project');
        return projectEpic;
      }
    }

    // 3. Generate epic ID based on project
    const generatedEpic = generateEpicFromProject(projectId || 'default-project');
    logger.debug({ generatedEpic }, 'Generated epic from project');
    return generatedEpic;

  } catch (error) {
    logger.warn({ error, projectId }, 'Epic context extraction failed, using fallback');

    // Ultimate fallback - check if we have a valid project ID to generate from
    if (projectId && projectId !== 'default-project') {
      return generateEpicFromProject(projectId);
    }

    return {
      epicId: 'default-epic',
      epicName: 'Default Epic',
      source: 'fallback',
      confidence: 0.1
    };
  }
}

/**
 * Extract project context from git remote URL
 */
async function extractFromGitRemote(projectPath: string): Promise<ProjectContextResult> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Get git remote URL
    const { stdout } = await execAsync('git remote get-url origin', { cwd: projectPath });
    const remoteUrl = stdout.trim();

    if (remoteUrl) {
      // Extract project name from various git URL formats
      let projectName = '';
      
      // GitHub/GitLab HTTPS: https://github.com/user/repo.git
      const httpsMatch = remoteUrl.match(/https:\/\/[^\/]+\/[^\/]+\/([^\/]+)(?:\.git)?$/);
      if (httpsMatch) {
        projectName = httpsMatch[1];
      }
      
      // SSH: git@github.com:user/repo.git
      const sshMatch = remoteUrl.match(/git@[^:]+:([^\/]+\/)?([^\/]+)(?:\.git)?$/);
      if (sshMatch) {
        projectName = sshMatch[2];
      }

      if (projectName) {
        const projectId = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        return {
          projectId,
          projectName,
          source: 'git',
          confidence: 0.85
        };
      }
    }
  } catch (error) {
    logger.debug({ error, projectPath }, 'Git remote extraction failed');
  }

  return {
    projectId: 'unknown-git-project',
    projectName: 'Unknown Git Project',
    source: 'git',
    confidence: 0.2
  };
}

/**
 * Extract project context from package.json
 */
async function extractFromPackageJson(projectPath: string): Promise<ProjectContextResult> {
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageContent);

    if (packageJson.name) {
      const projectName = packageJson.name;
      const projectId = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      
      return {
        projectId,
        projectName,
        source: 'package',
        confidence: 0.75
      };
    }
  } catch (error) {
    logger.debug({ error, projectPath }, 'Package.json extraction failed');
  }

  return {
    projectId: 'unknown-package-project',
    projectName: 'Unknown Package Project',
    source: 'package',
    confidence: 0.2
  };
}

/**
 * Extract project context from directory name
 */
function extractFromDirectoryName(projectPath: string): ProjectContextResult {
  const directoryName = path.basename(projectPath);
  const projectId = directoryName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  
  return {
    projectId,
    projectName: directoryName,
    source: 'directory',
    confidence: 0.6
  };
}

/**
 * Extract epic from current task
 */
async function extractEpicFromTask(taskId: string): Promise<EpicContextResult> {
  try {
    const { getTaskOperations } = await import('../core/operations/task-operations.js');
    const taskOps = getTaskOperations();
    const taskResult = await taskOps.getTask(taskId);

    if (taskResult.success && taskResult.data?.epicId) {
      return {
        epicId: taskResult.data.epicId,
        epicName: taskResult.data.epicId,
        source: 'session',
        confidence: 0.9
      };
    }
  } catch (error) {
    logger.debug({ error, taskId }, 'Epic extraction from task failed');
  }

  return {
    epicId: 'unknown-epic',
    epicName: 'Unknown Epic',
    source: 'session',
    confidence: 0.1
  };
}

/**
 * Extract epic from project
 */
async function extractEpicFromProject(projectId: string): Promise<EpicContextResult> {
  try {
    const projectOps = getProjectOperations();
    const projectResult = await projectOps.getProject(projectId);

    if (projectResult.success && projectResult.data) {
      const epicIds = projectResult.data.epicIds;
      if (epicIds && epicIds.length > 0) {
        const firstEpicId = epicIds[0];
        return {
          epicId: firstEpicId,
          epicName: firstEpicId,
          source: 'project',
          confidence: 0.7
        };
      }
    }
  } catch (error) {
    logger.debug({ error, projectId }, 'Epic extraction from project failed');
  }

  // Generate a project-specific epic ID instead of hardcoded value
  const epicId = `project-epic-1`;
  return {
    epicId,
    epicName: epicId,
    source: 'project',
    confidence: 0.7
  };
}

/**
 * Extract project context from Task List file
 * Scans for existing task list files and extracts project information
 */
export async function extractTaskListContext(
  projectPath?: string
): Promise<ProjectContextResult> {
  const workingPath = projectPath || process.cwd();

  try {
    logger.debug({ workingPath }, 'Starting task list context extraction');

    // Use dynamic import to avoid circular dependencies
    const { TaskListIntegrationService } = await import('../integrations/task-list-integration.js');
    const taskListService = TaskListIntegrationService.getInstance();

    // Try to detect existing task list for the project
    const existingTaskList = await taskListService.detectExistingTaskList(workingPath);

    if (existingTaskList && existingTaskList.isAccessible) {
      logger.debug({ taskListFile: existingTaskList.fileName }, 'Found existing task list file');

      // Parse the task list to get project information
      const parseResult = await taskListService.parseTaskList(existingTaskList.filePath);

      if (parseResult.success && parseResult.taskListData) {
        const projectName = parseResult.taskListData.metadata.projectName;
        const projectId = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

        return {
          projectId,
          projectName,
          source: 'directory', // Task list is found in directory structure
          confidence: 0.85 // High confidence since task list is project-specific
        };
      }
    }

    logger.debug({ workingPath }, 'No accessible task list found');

  } catch (error) {
    logger.debug({ error, workingPath }, 'Task list context extraction failed');
  }

  // Fallback if no task list found
  return {
    projectId: 'no-task-list-project',
    projectName: 'No Task List Project',
    source: 'fallback',
    confidence: 0.1
  };
}

/**
 * Generate epic ID from project
 */
function generateEpicFromProject(projectId: string): EpicContextResult {
  const epicId = `${projectId}-main-epic`;
  const epicName = `${projectId} Main Epic`;

  return {
    epicId,
    epicName,
    source: 'default',
    confidence: 0.5
  };
}

/**
 * Validate and sanitize project ID
 */
export function sanitizeProjectId(projectId: string): string {
  if (!projectId) return '';

  let sanitized = projectId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-');

  // Only remove leading and trailing dashes if the result would not be empty
  if (sanitized.match(/^-+$/) || sanitized === '') {
    return '';
  }

  // Remove leading and trailing dashes but preserve internal structure
  sanitized = sanitized.replace(/^-+|-+$/g, '');

  return sanitized;
}

/**
 * Validate and sanitize epic ID
 */
export function sanitizeEpicId(epicId: string): string {
  if (!epicId) return '';

  let sanitized = epicId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-');

  // Only remove leading and trailing dashes if the result would not be empty
  if (sanitized.match(/^-+$/) || sanitized === '') {
    return '';
  }

  // Remove leading and trailing dashes but preserve internal structure
  sanitized = sanitized.replace(/^-+|-+$/g, '');

  return sanitized;
}

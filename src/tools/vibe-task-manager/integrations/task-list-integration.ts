/**
 * Task List Integration Service
 *
 * Integrates with the existing task-list-generator tool to provide project context
 * for task decomposition. Handles task list discovery, parsing, and context integration
 * with error handling and caching.
 */

import fs from 'fs/promises';
import path from 'path';
import logger from '../../../logger.js';
import type { TaskListInfo, ParsedTaskList, TaskListItem, TaskListMetadata } from '../types/artifact-types.js';
import type { AtomicTask } from '../types/task.js';
import { validateSecurePath } from '../utils/path-security-validator.js';

/**
 * Sub-task structure used during parsing
 */
interface TaskListSubTask {
  id: string;
  goal?: string;
  task?: string;
  rationale?: string;
  expectedOutcome?: string;
  implementationPrompt?: string;
  objectives?: string[];
  exampleCode?: string;
}

/**
 * Task List parsing result
 */
export interface TaskListResult {
  /** Success status */
  success: boolean;
  /** Parsed task list data */
  taskListData?: ParsedTaskList;
  /** Error message if parsing failed */
  error?: string;
  /** Parsing time in milliseconds */
  parsingTime?: number;
}

/**
 * Task List integration configuration
 */
interface TaskListIntegrationConfig {
  /** Maximum age of task list before considering it stale (in milliseconds) */
  maxAge: number;
  /** Whether to cache task list results */
  enableCaching: boolean;
  /** Maximum number of cached task lists */
  maxCacheSize: number;
  /** Performance monitoring enabled */
  enablePerformanceMonitoring: boolean;
}

/**
 * Task List validation result
 */
export interface TaskListValidationResult {
  /** Whether the task list is valid */
  isValid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Completeness score (0-1) */
  completenessScore: number;
  /** Validation timestamp */
  validatedAt: Date;
}

/**
 * Task List data types for API requests
 */
export type TaskListDataType =
  | 'overview'
  | 'phases'
  | 'tasks'
  | 'statistics'
  | 'metadata'
  | 'full_content';

/**
 * Task List Integration Service implementation
 */
export class TaskListIntegrationService {
  private static instance: TaskListIntegrationService;
  private config: TaskListIntegrationConfig;
  private taskListCache = new Map<string, TaskListInfo>();
  private performanceMetrics = new Map<string, TaskListMetadata['performanceMetrics']>();

  private constructor() {
    this.config = {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      enableCaching: true,
      maxCacheSize: 50,
      enablePerformanceMonitoring: true
    };

    logger.debug('Task List integration service initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TaskListIntegrationService {
    if (!TaskListIntegrationService.instance) {
      TaskListIntegrationService.instance = new TaskListIntegrationService();
    }
    return TaskListIntegrationService.instance;
  }

  /**
   * Parse task list for a project
   */
  async parseTaskList(taskListFilePath: string): Promise<TaskListResult> {
    const startTime = Date.now();

    try {
      logger.info({ taskListFilePath }, 'Starting task list parsing');

      // Validate task list file path
      await this.validateTaskListPath(taskListFilePath);

      // Read task list content
      const taskListContent = await fs.readFile(taskListFilePath, 'utf-8');

      // Parse task list content
      const taskListData = await this.parseTaskListContent(taskListContent, taskListFilePath);

      const parsingTime = Date.now() - startTime;

      // Update cache
      if (this.config.enableCaching) {
        await this.updateTaskListCache(taskListFilePath);
      }

      logger.info({
        taskListFilePath,
        parsingTime,
        taskCount: taskListData.statistics.totalEstimatedHours
      }, 'Task list parsing completed successfully');

      return {
        success: true,
        taskListData,
        parsingTime
      };

    } catch (error) {
      const parsingTime = Date.now() - startTime;
      logger.error({ err: error, taskListFilePath }, 'Task list parsing failed with exception');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        parsingTime
      };
    }
  }

  /**
   * Detect existing task list for a project
   */
  async detectExistingTaskList(projectPath?: string): Promise<TaskListInfo | null> {
    try {
      // Check cache first
      if (this.config.enableCaching && projectPath && this.taskListCache.has(projectPath)) {
        const cached = this.taskListCache.get(projectPath)!;

        // Verify file still exists
        try {
          await fs.access(cached.filePath);
          return cached;
        } catch {
          // File no longer exists, remove from cache
          this.taskListCache.delete(projectPath);
        }
      }

      // Look for task list files in the output directory
      const taskListFiles = await this.findTaskListFiles(projectPath);

      if (taskListFiles.length === 0) {
        return null;
      }

      // Get the most recent task list
      const mostRecent = taskListFiles.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      // Update cache
      if (this.config.enableCaching && projectPath) {
        this.taskListCache.set(projectPath, mostRecent);
      }

      return mostRecent;

    } catch (error) {
      logger.warn({ err: error, projectPath }, 'Failed to detect existing task list');
      return null;
    }
  }

  /**
   * Validate task list file path with security checks
   */
  private async validateTaskListPath(taskListFilePath: string): Promise<void> {
    try {
      // Use secure path validation
      const validationResult = await validateSecurePath(taskListFilePath);

      if (!validationResult.isValid) {
        throw new Error(`Security validation failed: ${validationResult.error}`);
      }

      // Log any security warnings
      if (validationResult.warnings && validationResult.warnings.length > 0) {
        logger.warn({
          taskListFilePath,
          warnings: validationResult.warnings
        }, 'Task list path validation warnings');
      }

      // Additional task list specific validation
      if (!taskListFilePath.endsWith('.md')) {
        throw new Error('Task list file must be a Markdown file (.md)');
      }

    } catch (error) {
      logger.error({ err: error, taskListFilePath }, 'Task list path validation failed');
      throw new Error(`Invalid task list file path: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update task list cache
   */
  private async updateTaskListCache(taskListFilePath: string): Promise<void> {
    try {
      const stats = await fs.stat(taskListFilePath);
      const fileName = path.basename(taskListFilePath);
      
      // Extract project name and creation date from filename
      const { projectName, createdAt, listType } = this.extractTaskListMetadataFromFilename(fileName);

      const taskListInfo: TaskListInfo = {
        filePath: taskListFilePath,
        fileName,
        createdAt,
        projectName,
        fileSize: stats.size,
        isAccessible: true,
        lastModified: stats.mtime,
        listType
      };

      // Use project name as cache key
      this.taskListCache.set(projectName, taskListInfo);

      // Maintain cache size limit
      if (this.taskListCache.size > this.config.maxCacheSize) {
        const oldestKey = this.taskListCache.keys().next().value;
        if (oldestKey) {
          this.taskListCache.delete(oldestKey);
        }
      }

    } catch (error) {
      logger.warn({ err: error, taskListFilePath }, 'Failed to update task list cache');
    }
  }

  /**
   * Extract metadata from task list filename
   */
  private extractTaskListMetadataFromFilename(fileName: string): { projectName: string; createdAt: Date; listType: string } {
    // Expected format: YYYY-MM-DDTHH-mm-ss-sssZ-project-name-task-list-type.md
    const match = fileName.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-(.+)-task-list-(.+)\.md$/);

    if (match) {
      const [, timestamp, projectSlug, listType] = match;
      const createdAt = new Date(timestamp.replace(/-/g, ':').replace(/T(\d{2}):(\d{2}):(\d{2}):(\d{3})Z/, 'T$1:$2:$3.$4Z'));
      const projectName = projectSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      return { projectName, createdAt, listType };
    }

    // Fallback for non-standard filenames
    return {
      projectName: fileName.replace(/-task-list.*\.md$/, '').replace(/-/g, ' '),
      createdAt: new Date(),
      listType: 'detailed'
    };
  }

  /**
   * Find existing task list files for a project
   */
  private async findTaskListFiles(projectPath?: string): Promise<TaskListInfo[]> {
    try {
      // Get the output directory from environment or default
      const outputBaseDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
      const taskListOutputDir = path.join(outputBaseDir, 'generated_task_lists');

      // Check if output directory exists
      try {
        await fs.access(taskListOutputDir);
      } catch {
        return []; // No output directory means no task lists
      }

      // Find all .md files in the output directory
      const files = await fs.readdir(taskListOutputDir, { withFileTypes: true });
      const taskListFiles: TaskListInfo[] = [];

      for (const file of files) {
        if (file.isFile() && file.name.endsWith('-task-list-detailed.md')) {
          const filePath = path.join(taskListOutputDir, file.name);

          try {
            const stats = await fs.stat(filePath);
            const { projectName, createdAt, listType } = this.extractTaskListMetadataFromFilename(file.name);

            // If projectPath is specified, filter by project name
            if (projectPath) {
              const expectedProjectName = path.basename(projectPath).toLowerCase();
              if (!projectName.toLowerCase().includes(expectedProjectName)) {
                continue;
              }
            }

            taskListFiles.push({
              filePath,
              fileName: file.name,
              createdAt,
              projectName,
              fileSize: stats.size,
              isAccessible: true,
              lastModified: stats.mtime,
              listType
            });

          } catch (error) {
            logger.warn({ err: error, fileName: file.name }, 'Failed to process task list file');

            // Add as inaccessible file
            const { projectName, createdAt, listType } = this.extractTaskListMetadataFromFilename(file.name);
            taskListFiles.push({
              filePath: path.join(taskListOutputDir, file.name),
              fileName: file.name,
              createdAt,
              projectName,
              fileSize: 0,
              isAccessible: false,
              lastModified: new Date(),
              listType
            });
          }
        }
      }

      return taskListFiles;

    } catch (error) {
      logger.error({ err: error, projectPath }, 'Failed to find task list files');
      return [];
    }
  }

  /**
   * Parse task list content from markdown
   */
  private async parseTaskListContent(content: string, filePath: string): Promise<ParsedTaskList> {
    const startTime = Date.now();

    try {
      // Validate file path before accessing file system
      const validationResult = await validateSecurePath(filePath);
      if (!validationResult.isValid) {
        throw new Error(`Security validation failed: ${validationResult.error}`);
      }

      const lines = content.split('\n');
      const fileName = path.basename(filePath);
      const { projectName, createdAt, listType } = this.extractTaskListMetadataFromFilename(fileName);
      const stats = await fs.stat(validationResult.sanitizedPath!);

      // Initialize parsed task list structure
      const parsedTaskList: ParsedTaskList = {
        metadata: {
          filePath,
          projectName,
          createdAt,
          fileSize: stats.size,
          totalTasks: 0,
          phaseCount: 0,
          listType
        },
        overview: {
          description: '',
          goals: [],
          techStack: []
        },
        phases: [],
        statistics: {
          totalEstimatedHours: 0,
          tasksByPriority: {},
          tasksByPhase: {}
        }
      };

      // Parse content sections
      let currentPhase: string = '';
      let currentPhaseDescription: string = '';
      let currentTask: Partial<TaskListItem> | null = null;
      let currentSubTask: TaskListSubTask | null = null;
      let inTaskBlock = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect phase headers - only actual phases, not sub-sections
        if (line.startsWith('## Phase:') || (line.startsWith('## ') && this.isActualPhase(line))) {
          // Finalize previous task
          if (currentTask && currentTask.id && currentTask.title) {
            const phase = parsedTaskList.phases[parsedTaskList.phases.length - 1];
            if (phase) {
              phase.tasks.push(currentTask as TaskListItem);
            }
            currentTask = null;
            inTaskBlock = false;
          }

          // Finalize previous phase
          if (currentPhase && parsedTaskList.phases.length > 0) {
            const lastPhase = parsedTaskList.phases[parsedTaskList.phases.length - 1];
            lastPhase.description = currentPhaseDescription.trim();
          }

          // Start new phase
          currentPhase = line.startsWith('## Phase:')
            ? line.substring(9).trim()
            : line.substring(3).trim();
          currentPhaseDescription = '';

          parsedTaskList.phases.push({
            name: currentPhase,
            description: '',
            tasks: [],
            estimatedDuration: '0 hours'
          });
          continue;
        }

        // Parse main task items
        if (line.startsWith('- **ID:**')) {
          // Finalize previous task
          if (currentTask && currentTask.id && currentTask.title) {
            const phase = parsedTaskList.phases[parsedTaskList.phases.length - 1];
            if (phase) {
              phase.tasks.push(currentTask as TaskListItem);
            }
          }

          // Start new task
          const idMatch = line.match(/- \*\*ID:\*\*\s*(T-\d+)/);
          if (idMatch) {
            currentTask = {
              id: idMatch[1],
              title: '',
              description: '',
              userStory: '',
              priority: 'medium',
              dependencies: [],
              estimatedEffort: '',
              phase: currentPhase,
              markdownContent: line,
              subTasks: []
            };
            inTaskBlock = true;
            currentSubTask = null;
          }
          continue;
        }

        // Parse sub-task items
        if (line.startsWith('  - **Sub-Task ID:**') && currentTask) {
          const subTaskIdMatch = line.match(/\s*- \*\*Sub-Task ID:\*\*\s*(T-[\d.]+)/);
          if (subTaskIdMatch) {
            // Finalize previous sub-task
            if (currentSubTask) {
              currentTask.subTasks = currentTask.subTasks || [];
              // Convert TaskListSubTask to TaskListItem
              const taskListItem: TaskListItem = {
                id: currentSubTask.id,
                title: currentSubTask.task || currentSubTask.goal || 'Untitled Sub-task',
                description: currentSubTask.rationale || currentSubTask.expectedOutcome || '',
                userStory: currentSubTask.objectives?.join('; ') || '',
                priority: 'medium' as const,
                dependencies: [],
                estimatedEffort: '1-2 hours',
                phase: currentPhase,
                markdownContent: `Sub-task: ${currentSubTask.task || currentSubTask.goal || ''}`
              };
              currentTask.subTasks.push(taskListItem);
            }

            // Start new sub-task
            currentSubTask = {
              id: subTaskIdMatch[1],
              goal: '',
              task: '',
              rationale: '',
              expectedOutcome: '',
              objectives: [],
              implementationPrompt: '',
              exampleCode: ''
            };
          }
          continue;
        }

        // Parse task fields that are on the same line as ID (legacy format)
        if (line.includes('**ID:**') && line.includes('**Title:**') && !inTaskBlock) {
          // Handle single-line task format
          const idMatch = line.match(/\*\*ID:\*\*\s*(T-\d+)/);
          const titleMatch = line.match(/\*\*Title:\*\*\s*([^*]+?)(?:\s*\*|$)/);

          if (idMatch) {
            // Finalize previous task
            if (currentTask && currentTask.id && currentTask.title) {
              const phase = parsedTaskList.phases[parsedTaskList.phases.length - 1];
              if (phase) {
                phase.tasks.push(currentTask as TaskListItem);
              }
            }

            currentTask = {
              id: idMatch[1],
              title: titleMatch ? titleMatch[1].trim() : '',
              description: '',
              userStory: '',
              priority: 'medium',
              dependencies: [],
              estimatedEffort: '',
              phase: currentPhase,
              markdownContent: line,
              subTasks: []
            };
            inTaskBlock = true;
          }
          continue;
        }

        // Parse task fields - handle multi-line format
        if (currentTask && inTaskBlock && !currentSubTask) {
          if (line.includes('**Title:**')) {
            const titleMatch = line.match(/\*\*Title:\*\*\s*(.*)/);
            if (titleMatch) {
              currentTask.title = titleMatch[1].trim();
            }
          } else if (line.includes('*(Description):*')) {
            const descMatch = line.match(/\*\(Description\):\*\s*(.*)/);
            if (descMatch) {
              currentTask.description = descMatch[1].trim();
            }
          } else if (line.includes('*(User Story):*')) {
            const storyMatch = line.match(/\*\(User Story\):\*\s*(.*)/);
            if (storyMatch) {
              currentTask.userStory = storyMatch[1].trim();
            }
          } else if (line.includes('*(Priority):*')) {
            const priorityMatch = line.match(/\*\(Priority\):\*\s*(.*)/);
            if (priorityMatch) {
              const priority = priorityMatch[1].trim().toLowerCase();
              currentTask.priority = ['low', 'medium', 'high', 'critical'].includes(priority)
                ? priority as 'low' | 'medium' | 'high' | 'critical'
                : 'medium';
            }
          } else if (line.includes('*(Dependencies):*')) {
            const depMatch = line.match(/\*\(Dependencies\):\*\s*(.*)/);
            if (depMatch) {
              const deps = depMatch[1].trim();
              currentTask.dependencies = deps === 'None' ? [] : deps.split(',').map(d => d.trim());
            }
          } else if (line.includes('*(Est. Effort):*')) {
            const effortMatch = line.match(/\*\(Est\. Effort\):\*\s*(.*)/);
            if (effortMatch) {
              currentTask.estimatedEffort = effortMatch[1].trim();
            }
          }
        }

        // Parse sub-task fields
        if (currentSubTask && inTaskBlock) {
          if (line.includes('**Goal:**')) {
            const goalMatch = line.match(/\*\*Goal:\*\*\s*(.*)/);
            if (goalMatch) {
              currentSubTask.goal = goalMatch[1].trim();
            }
          } else if (line.includes('**Task:**')) {
            const taskMatch = line.match(/\*\*Task:\*\*\s*(.*)/);
            if (taskMatch) {
              currentSubTask.task = taskMatch[1].trim();
            }
          } else if (line.includes('**Rationale:**')) {
            const rationaleMatch = line.match(/\*\*Rationale:\*\*\s*(.*)/);
            if (rationaleMatch) {
              currentSubTask.rationale = rationaleMatch[1].trim();
            }
          } else if (line.includes('**Expected Outcome:**')) {
            const outcomeMatch = line.match(/\*\*Expected Outcome:\*\*\s*(.*)/);
            if (outcomeMatch) {
              currentSubTask.expectedOutcome = outcomeMatch[1].trim();
            }
          } else if (line.includes('**Implementation Prompt:**')) {
            const promptMatch = line.match(/\*\*Implementation Prompt:\*\*\s*(.*)/);
            if (promptMatch) {
              currentSubTask.implementationPrompt = promptMatch[1].trim();
            }
          } else if (line.includes('**Objectives:**')) {
            // Start collecting objectives (multi-line)
            currentSubTask.objectives = [];
          } else if (line.trim().startsWith('* ') && currentSubTask.objectives !== undefined) {
            // Collect objective items
            const objective = line.trim().substring(2).trim();
            if (objective) {
              currentSubTask.objectives.push(objective);
            }
          }
        }

        // Collect phase description
        if (currentPhase && !line.startsWith('- **') && !line.startsWith('#') && line.length > 0 && !inTaskBlock) {
          currentPhaseDescription += line + ' ';
        }
      }

      // Finalize last sub-task
      if (currentSubTask && currentTask) {
        currentTask.subTasks = currentTask.subTasks || [];
        // Convert TaskListSubTask to TaskListItem
        const taskListItem: TaskListItem = {
          id: currentSubTask.id,
          title: currentSubTask.task || currentSubTask.goal || 'Untitled Sub-task',
          description: currentSubTask.rationale || currentSubTask.expectedOutcome || '',
          userStory: currentSubTask.objectives?.join('; ') || '',
          priority: 'medium' as const,
          dependencies: [],
          estimatedEffort: '1-2 hours',
          phase: currentPhase,
          markdownContent: `Sub-task: ${currentSubTask.task || currentSubTask.goal || ''}`
        };
        currentTask.subTasks.push(taskListItem);
      }

      // Finalize last task
      if (currentTask && currentTask.id && currentTask.title) {
        const phase = parsedTaskList.phases[parsedTaskList.phases.length - 1];
        if (phase) {
          phase.tasks.push(currentTask as TaskListItem);
        }
      }

      // Calculate statistics
      this.calculateTaskListStatistics(parsedTaskList);

      // Record performance metrics
      if (this.config.enablePerformanceMonitoring) {
        const parsingTime = Date.now() - startTime;
        this.performanceMetrics.set(filePath, {
          parsingTime,
          fileSize: stats.size,
          taskCount: parsedTaskList.metadata.totalTasks,
          phaseCount: parsedTaskList.metadata.phaseCount
        });
      }

      return parsedTaskList;

    } catch (error) {
      logger.error({ err: error, filePath }, 'Failed to parse task list content');
      throw error;
    }
  }

  /**
   * Calculate task list statistics
   */
  private calculateTaskListStatistics(parsedTaskList: ParsedTaskList): void {
    let totalTasks = 0;
    let totalEstimatedHours = 0;
    const tasksByPriority: Record<string, number> = {};
    const tasksByPhase: Record<string, number> = {};

    for (const phase of parsedTaskList.phases) {
      tasksByPhase[phase.name] = phase.tasks.length;
      totalTasks += phase.tasks.length;

      for (const task of phase.tasks) {
        // Count by priority
        tasksByPriority[task.priority] = (tasksByPriority[task.priority] || 0) + 1;

        // Extract hours from estimated effort
        const hours = this.extractHoursFromEffort(task.estimatedEffort);
        totalEstimatedHours += hours;
      }
    }

    // Update metadata and statistics
    parsedTaskList.metadata.totalTasks = totalTasks;
    parsedTaskList.metadata.phaseCount = parsedTaskList.phases.length;
    parsedTaskList.statistics.totalEstimatedHours = totalEstimatedHours;
    parsedTaskList.statistics.tasksByPriority = tasksByPriority;
    parsedTaskList.statistics.tasksByPhase = tasksByPhase;
  }

  /**
   * Extract hours from effort string
   */
  private extractHoursFromEffort(effort: string): number {
    const match = effort.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)/i);
    return match ? parseFloat(match[1]) : 0;
  }

  /**
   * Check if a header line represents an actual phase (not a sub-section)
   */
  private isActualPhase(line: string): boolean {
    const phaseKeywords = [
      'phase:',
      'setup',
      'planning',
      'development',
      'backend',
      'frontend',
      'testing',
      'deployment',
      'operations',
      'maintenance'
    ];

    const lineContent = line.toLowerCase();
    return phaseKeywords.some(keyword => lineContent.includes(keyword));
  }

  /**
   * Convert parsed task list items to AtomicTask objects
   */
  async convertToAtomicTasks(
    parsedTaskList: ParsedTaskList,
    projectId: string,
    epicId: string,
    createdBy: string
  ): Promise<AtomicTask[]> {
    try {
      const atomicTasks: AtomicTask[] = [];

      for (const phase of parsedTaskList.phases) {
        for (const taskItem of phase.tasks) {
          const atomicTask: AtomicTask = {
            id: taskItem.id,
            title: taskItem.title,
            description: taskItem.description,
            status: 'pending',
            priority: taskItem.priority,
            type: this.inferTaskType(taskItem.title, taskItem.description),
            estimatedHours: this.extractHoursFromEffort(taskItem.estimatedEffort),
            epicId,
            projectId,
            dependencies: taskItem.dependencies,
            dependents: [],
            filePaths: this.inferFilePaths(taskItem.description),
            acceptanceCriteria: this.extractAcceptanceCriteria(taskItem.userStory),
            testingRequirements: {
              unitTests: [],
              integrationTests: [],
              performanceTests: [],
              coverageTarget: 80
            },
            performanceCriteria: {
              responseTime: '<200ms',
              memoryUsage: '<100MB',
              throughput: '>1000 req/s'
            },
            qualityCriteria: {
              codeQuality: ['ESLint compliant', 'TypeScript strict mode'],
              documentation: ['JSDoc comments', 'README updates'],
              typeScript: true,
              eslint: true
            },
            integrationCriteria: {
              compatibility: ['Existing API', 'Database schema'],
              patterns: ['Singleton pattern', 'Error handling']
            },
            validationMethods: {
              automated: ['Unit tests', 'Integration tests'],
              manual: ['Code review', 'Manual testing']
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy,
            tags: [phase.name.toLowerCase(), taskItem.priority],
            metadata: {
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy,
              tags: [phase.name.toLowerCase(), taskItem.priority, 'imported-from-task-list']
            }
          };

          atomicTasks.push(atomicTask);
        }
      }

      logger.info({
        taskListPath: parsedTaskList.metadata.filePath,
        atomicTaskCount: atomicTasks.length,
        projectId,
        epicId
      }, 'Successfully converted task list to atomic tasks');

      return atomicTasks;

    } catch (error) {
      logger.error({ err: error, parsedTaskList: parsedTaskList.metadata }, 'Failed to convert task list to atomic tasks');
      throw error;
    }
  }

  /**
   * Infer task type from title and description
   */
  private inferTaskType(title: string, description: string): AtomicTask['type'] {
    const content = (title + ' ' + description).toLowerCase();

    if (content.includes('test') || content.includes('spec')) {
      return 'testing';
    } else if (content.includes('doc') || content.includes('readme')) {
      return 'documentation';
    } else if (content.includes('deploy') || content.includes('release')) {
      return 'deployment';
    } else if (content.includes('research') || content.includes('investigate')) {
      return 'research';
    } else if (content.includes('review') || content.includes('audit')) {
      return 'review';
    } else {
      return 'development';
    }
  }

  /**
   * Infer file paths from task description
   */
  private inferFilePaths(description: string): string[] {
    const filePaths: string[] = [];

    // Look for file path patterns
    const pathMatches = description.match(/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.[a-zA-Z]{2,4}/g);
    if (pathMatches) {
      filePaths.push(...pathMatches);
    }

    // Look for component/file mentions
    const componentMatches = description.match(/`([a-zA-Z0-9_.-]+\.[a-zA-Z]{2,4})`/g);
    if (componentMatches) {
      filePaths.push(...componentMatches.map(m => m.replace(/`/g, '')));
    }

    return filePaths;
  }

  /**
   * Extract acceptance criteria from user story
   */
  private extractAcceptanceCriteria(userStory: string): string[] {
    const criteria: string[] = [];

    // Split by common delimiters
    const parts = userStory.split(/(?:so that|when|then|and|given)/i);

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 10 && !trimmed.toLowerCase().startsWith('as a')) {
        criteria.push(trimmed);
      }
    }

    return criteria.length > 0 ? criteria : [userStory];
  }

  /**
   * Clear task list cache
   */
  clearCache(): void {
    this.taskListCache.clear();
    this.performanceMetrics.clear();
    logger.info('Task list integration cache cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<TaskListIntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.debug({ config: this.config }, 'Task list integration configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): TaskListIntegrationConfig {
    return { ...this.config };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): Map<string, TaskListMetadata['performanceMetrics']> {
    return new Map(this.performanceMetrics);
  }

  /**
   * Get task list metadata
   */
  async getTaskListMetadata(taskListFilePath: string): Promise<TaskListMetadata> {
    try {
      const stats = await fs.stat(taskListFilePath);
      const fileName = path.basename(taskListFilePath);
      const { projectName, createdAt, listType } = this.extractTaskListMetadataFromFilename(fileName);

      // Get performance metrics if available
      const performanceMetrics = this.performanceMetrics.get(taskListFilePath) || {
        parsingTime: 0,
        fileSize: stats.size,
        taskCount: 0,
        phaseCount: 0
      };

      return {
        filePath: taskListFilePath,
        projectName,
        createdAt,
        fileSize: stats.size,
        totalTasks: performanceMetrics.taskCount,
        phaseCount: performanceMetrics.phaseCount,
        listType
      };

    } catch (error) {
      logger.error({ err: error, taskListFilePath }, 'Failed to get task list metadata');
      throw error;
    }
  }

  /**
   * Validate task list content
   */
  async validateTaskList(taskListFilePath: string): Promise<TaskListValidationResult> {
    try {
      const content = await fs.readFile(taskListFilePath, 'utf-8');
      const errors: string[] = [];
      const warnings: string[] = [];

      // Basic validation checks
      if (content.length < 100) {
        errors.push('Task list content is too short');
      }

      if (!content.includes('## ')) {
        errors.push('No phase headers found');
      }

      if (!content.includes('- **ID:**')) {
        errors.push('No task items found');
      }

      // Count sections
      const phaseCount = (content.match(/## /g) || []).length;
      const taskCount = (content.match(/- \*\*ID:\*\*/g) || []).length;

      if (phaseCount === 0) {
        errors.push('No phases defined');
      }

      if (taskCount === 0) {
        errors.push('No tasks defined');
      }

      if (taskCount < phaseCount) {
        warnings.push('Some phases may not have tasks');
      }

      // Calculate completeness score
      let completenessScore = 1.0;
      if (errors.length > 0) {
        completenessScore -= errors.length * 0.2;
      }
      if (warnings.length > 0) {
        completenessScore -= warnings.length * 0.1;
      }
      completenessScore = Math.max(0, completenessScore);

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        completenessScore,
        validatedAt: new Date()
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [`Failed to validate task list: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
        completenessScore: 0,
        validatedAt: new Date()
      };
    }
  }
}

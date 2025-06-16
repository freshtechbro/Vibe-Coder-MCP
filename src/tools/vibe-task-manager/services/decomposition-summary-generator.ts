/**
 * Decomposition Summary Generator
 *
 * Generates comprehensive session-specific summary files for decomposition sessions
 * including detailed analysis, task breakdown, and visual representations.
 */

import { DecompositionSession } from './decomposition-service.js';
import { AtomicTask } from '../types/task.js';
import { getVibeTaskManagerOutputDir } from '../utils/config-loader.js';
import { FileUtils } from '../utils/file-utils.js';
import logger from '../../../logger.js';
import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * Summary generation configuration
 */
export interface SummaryConfig {
  /** Include detailed task breakdown */
  includeTaskBreakdown: boolean;
  /** Include dependency analysis */
  includeDependencyAnalysis: boolean;
  /** Include performance metrics */
  includePerformanceMetrics: boolean;
  /** Include visual diagrams */
  includeVisualDiagrams: boolean;
  /** Include JSON exports */
  includeJsonExports: boolean;
  /** Custom output directory */
  customOutputDir?: string;
}

/**
 * Summary generation result
 */
export interface SummaryGenerationResult {
  success: boolean;
  outputDirectory: string;
  generatedFiles: string[];
  error?: string;
  metadata: {
    sessionId: string;
    projectId: string;
    totalTasks: number;
    totalHours: number;
    generationTime: number;
    timestamp: Date;
  };
}

/**
 * Task analysis summary
 */
export interface TaskAnalysisSummary {
  totalTasks: number;
  totalHours: number;
  averageHours: number;
  tasksByType: Record<string, number>;
  tasksByPriority: Record<string, number>;
  complexityDistribution: {
    simple: number;
    medium: number;
    complex: number;
  };
  estimatedDuration: {
    minimum: number;
    maximum: number;
    average: number;
  };
}

/**
 * Default summary configuration
 */
const DEFAULT_SUMMARY_CONFIG: SummaryConfig = {
  includeTaskBreakdown: true,
  includeDependencyAnalysis: true,
  includePerformanceMetrics: true,
  includeVisualDiagrams: true,
  includeJsonExports: true
};

/**
 * Decomposition Summary Generator Service
 */
export class DecompositionSummaryGenerator {
  private config: SummaryConfig;

  constructor(config: Partial<SummaryConfig> = {}) {
    this.config = { ...DEFAULT_SUMMARY_CONFIG, ...config };
  }

  /**
   * Generate comprehensive summary for a decomposition session
   */
  async generateSessionSummary(session: DecompositionSession): Promise<SummaryGenerationResult> {
    const startTime = Date.now();

    try {
      logger.info({
        sessionId: session.id,
        projectId: session.projectId,
        status: session.status
      }, 'Starting decomposition summary generation');

      // Create session-specific output directory
      const outputDirectory = await this.createSessionDirectory(session);
      const generatedFiles: string[] = [];

      // Generate task analysis
      const taskAnalysis = this.analyzeSessionTasks(session);

      // Generate main summary markdown
      if (this.config.includeTaskBreakdown) {
        const summaryFile = await this.generateMainSummary(session, taskAnalysis, outputDirectory);
        generatedFiles.push(summaryFile);
      }

      // Generate detailed task breakdown
      const taskBreakdownFile = await this.generateTaskBreakdown(session, outputDirectory);
      generatedFiles.push(taskBreakdownFile);

      // Generate performance metrics
      if (this.config.includePerformanceMetrics) {
        const metricsFile = await this.generatePerformanceMetrics(session, outputDirectory);
        generatedFiles.push(metricsFile);
      }

      // Generate dependency analysis
      if (this.config.includeDependencyAnalysis && session.persistedTasks) {
        const dependencyFile = await this.generateDependencyAnalysis(session, outputDirectory);
        generatedFiles.push(dependencyFile);
      }

      // Generate visual diagrams
      if (this.config.includeVisualDiagrams) {
        const diagramFiles = await this.generateVisualDiagrams(session, outputDirectory);
        generatedFiles.push(...diagramFiles);
      }

      // Generate JSON exports
      if (this.config.includeJsonExports) {
        const jsonFiles = await this.generateJsonExports(session, taskAnalysis, outputDirectory);
        generatedFiles.push(...jsonFiles);
      }

      const generationTime = Date.now() - startTime;

      logger.info({
        sessionId: session.id,
        projectId: session.projectId,
        outputDirectory,
        filesGenerated: generatedFiles.length,
        generationTime
      }, 'Decomposition summary generation completed successfully');

      return {
        success: true,
        outputDirectory,
        generatedFiles,
        metadata: {
          sessionId: session.id,
          projectId: session.projectId,
          totalTasks: session.persistedTasks?.length || 0,
          totalHours: taskAnalysis.totalHours,
          generationTime,
          timestamp: new Date()
        }
      };

    } catch (error) {
      const generationTime = Date.now() - startTime;

      logger.error({
        err: error,
        sessionId: session.id,
        projectId: session.projectId,
        generationTime
      }, 'Failed to generate decomposition summary');

      return {
        success: false,
        outputDirectory: '',
        generatedFiles: [],
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          sessionId: session.id,
          projectId: session.projectId,
          totalTasks: 0,
          totalHours: 0,
          generationTime,
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Create session-specific output directory
   */
  private async createSessionDirectory(session: DecompositionSession): Promise<string> {
    const baseOutputDir = this.config.customOutputDir || getVibeTaskManagerOutputDir();
    const sessionDir = path.join(
      baseOutputDir,
      'decomposition-sessions',
      `${session.projectId}-${session.id}`
    );

    await fs.ensureDir(sessionDir);
    return sessionDir;
  }

  /**
   * Analyze session tasks for summary statistics
   */
  private analyzeSessionTasks(session: DecompositionSession): TaskAnalysisSummary {
    const tasks = session.persistedTasks || [];

    if (tasks.length === 0) {
      return {
        totalTasks: 0,
        totalHours: 0,
        averageHours: 0,
        tasksByType: {},
        tasksByPriority: {},
        complexityDistribution: { simple: 0, medium: 0, complex: 0 },
        estimatedDuration: { minimum: 0, maximum: 0, average: 0 }
      };
    }

    const totalHours = tasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0);
    const averageHours = totalHours / tasks.length;

    // Group by type
    const tasksByType: Record<string, number> = {};
    tasks.forEach(task => {
      tasksByType[task.type] = (tasksByType[task.type] || 0) + 1;
    });

    // Group by priority
    const tasksByPriority: Record<string, number> = {};
    tasks.forEach(task => {
      tasksByPriority[task.priority] = (tasksByPriority[task.priority] || 0) + 1;
    });

    // Complexity distribution based on estimated hours
    const complexityDistribution = {
      simple: tasks.filter(t => (t.estimatedHours || 0) <= 2).length,
      medium: tasks.filter(t => (t.estimatedHours || 0) > 2 && (t.estimatedHours || 0) <= 8).length,
      complex: tasks.filter(t => (t.estimatedHours || 0) > 8).length
    };

    // Duration statistics
    const hours = tasks.map(t => t.estimatedHours || 0);
    const estimatedDuration = {
      minimum: Math.min(...hours),
      maximum: Math.max(...hours),
      average: averageHours
    };

    return {
      totalTasks: tasks.length,
      totalHours,
      averageHours,
      tasksByType,
      tasksByPriority,
      complexityDistribution,
      estimatedDuration
    };
  }

  /**
   * Generate main summary markdown file
   */
  private async generateMainSummary(
    session: DecompositionSession,
    analysis: TaskAnalysisSummary,
    outputDir: string
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    const duration = session.endTime
      ? session.endTime.getTime() - session.startTime.getTime()
      : Date.now() - session.startTime.getTime();

    let content = `# Decomposition Session Summary\n\n`;
    content += `**Session ID:** ${session.id}\n`;
    content += `**Project ID:** ${session.projectId}\n`;
    content += `**Status:** ${session.status}\n`;
    content += `**Generated:** ${timestamp}\n\n`;

    content += `## Session Overview\n\n`;
    content += `- **Start Time:** ${session.startTime.toISOString()}\n`;
    content += `- **End Time:** ${session.endTime?.toISOString() || 'In Progress'}\n`;
    content += `- **Duration:** ${Math.round(duration / 1000)}s\n`;
    content += `- **Progress:** ${session.progress}%\n`;
    content += `- **Max Depth:** ${session.maxDepth}\n`;
    content += `- **Current Depth:** ${session.currentDepth}\n\n`;

    content += `## Task Analysis\n\n`;
    content += `- **Total Tasks Generated:** ${analysis.totalTasks}\n`;
    content += `- **Total Estimated Hours:** ${analysis.totalHours.toFixed(1)}h\n`;
    content += `- **Average Hours per Task:** ${analysis.averageHours.toFixed(1)}h\n\n`;

    content += `### Task Distribution by Type\n\n`;
    Object.entries(analysis.tasksByType).forEach(([type, count]) => {
      content += `- **${type}:** ${count} tasks\n`;
    });

    content += `\n### Task Distribution by Priority\n\n`;
    Object.entries(analysis.tasksByPriority).forEach(([priority, count]) => {
      content += `- **${priority}:** ${count} tasks\n`;
    });

    content += `\n### Complexity Distribution\n\n`;
    content += `- **Simple (≤2h):** ${analysis.complexityDistribution.simple} tasks\n`;
    content += `- **Medium (2-8h):** ${analysis.complexityDistribution.medium} tasks\n`;
    content += `- **Complex (>8h):** ${analysis.complexityDistribution.complex} tasks\n\n`;

    if (session.error) {
      content += `## Error Information\n\n`;
      content += `**Error:** ${session.error}\n\n`;
    }

    content += `---\n`;
    content += `*Generated by Vibe Task Manager Decomposition Summary Generator*\n`;

    const filePath = path.join(outputDir, 'session-summary.md');
    await fs.writeFile(filePath, content);

    return filePath;
  }

  /**
   * Generate detailed task breakdown file
   */
  private async generateTaskBreakdown(session: DecompositionSession, outputDir: string): Promise<string> {
    const tasks = session.persistedTasks || [];

    let content = `# Detailed Task Breakdown\n\n`;
    content += `**Session:** ${session.id}\n`;
    content += `**Project:** ${session.projectId}\n`;
    content += `**Total Tasks:** ${tasks.length}\n\n`;

    if (tasks.length === 0) {
      content += `No tasks were generated in this session.\n`;
    } else {
      tasks.forEach((task, index) => {
        content += `## Task ${index + 1}: ${task.title}\n\n`;
        content += `- **ID:** ${task.id}\n`;
        content += `- **Type:** ${task.type}\n`;
        content += `- **Priority:** ${task.priority}\n`;
        content += `- **Status:** ${task.status}\n`;
        content += `- **Estimated Hours:** ${task.estimatedHours || 0}h\n`;
        content += `- **Epic ID:** ${task.epicId || 'N/A'}\n\n`;

        content += `**Description:**\n${task.description}\n\n`;

        if (task.acceptanceCriteria.length > 0) {
          content += `**Acceptance Criteria:**\n`;
          task.acceptanceCriteria.forEach((criteria, i) => {
            content += `${i + 1}. ${criteria}\n`;
          });
          content += `\n`;
        }

        if (task.filePaths.length > 0) {
          content += `**File Paths:**\n`;
          task.filePaths.forEach(filePath => {
            content += `- ${filePath}\n`;
          });
          content += `\n`;
        }

        if (task.dependencies.length > 0) {
          content += `**Dependencies:**\n`;
          task.dependencies.forEach(dep => {
            content += `- ${dep}\n`;
          });
          content += `\n`;
        }

        if (task.tags.length > 0) {
          content += `**Tags:** ${task.tags.join(', ')}\n\n`;
        }

        content += `---\n\n`;
      });
    }

    const filePath = path.join(outputDir, 'task-breakdown.md');
    await fs.writeFile(filePath, content);

    return filePath;
  }

  /**
   * Generate performance metrics file
   */
  private async generatePerformanceMetrics(session: DecompositionSession, outputDir: string): Promise<string> {
    const duration = session.endTime
      ? session.endTime.getTime() - session.startTime.getTime()
      : Date.now() - session.startTime.getTime();

    const tasks = session.persistedTasks || [];
    const totalHours = tasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0);

    let content = `# Performance Metrics\n\n`;
    content += `**Session:** ${session.id}\n`;
    content += `**Project:** ${session.projectId}\n\n`;

    content += `## Timing Metrics\n\n`;
    content += `- **Total Duration:** ${Math.round(duration / 1000)}s (${(duration / 60000).toFixed(2)} minutes)\n`;
    content += `- **Start Time:** ${session.startTime.toISOString()}\n`;
    content += `- **End Time:** ${session.endTime?.toISOString() || 'In Progress'}\n`;
    content += `- **Progress:** ${session.progress}%\n\n`;

    content += `## Decomposition Metrics\n\n`;
    content += `- **Max Depth:** ${session.maxDepth}\n`;
    content += `- **Current Depth:** ${session.currentDepth}\n`;
    content += `- **Total Tasks Processed:** ${session.processedTasks}\n`;
    content += `- **Tasks Generated:** ${tasks.length}\n`;
    content += `- **Total Estimated Work:** ${totalHours.toFixed(1)} hours\n\n`;

    content += `## Efficiency Metrics\n\n`;
    if (duration > 0) {
      const tasksPerSecond = tasks.length / (duration / 1000);
      const hoursPerSecond = totalHours / (duration / 1000);

      content += `- **Tasks Generated per Second:** ${tasksPerSecond.toFixed(3)}\n`;
      content += `- **Work Hours Planned per Second:** ${hoursPerSecond.toFixed(3)}\n`;
      content += `- **Average Task Generation Time:** ${(duration / tasks.length / 1000).toFixed(2)}s per task\n\n`;
    }

    if (session.results.length > 0) {
      content += `## Decomposition Results\n\n`;
      session.results.forEach((result, index) => {
        content += `### Result ${index + 1}\n`;
        content += `- **Success:** ${result.success}\n`;
        content += `- **Is Atomic:** ${result.isAtomic}\n`;
        content += `- **Depth:** ${result.depth}\n`;
        content += `- **Sub-tasks:** ${result.subTasks.length}\n`;
        if (result.error) {
          content += `- **Error:** ${result.error}\n`;
        }
        content += `\n`;
      });
    }

    const filePath = path.join(outputDir, 'performance-metrics.md');
    await fs.writeFile(filePath, content);

    return filePath;
  }

  /**
   * Generate dependency analysis file
   */
  private async generateDependencyAnalysis(session: DecompositionSession, outputDir: string): Promise<string> {
    const tasks = session.persistedTasks || [];

    let content = `# Dependency Analysis\n\n`;
    content += `**Session:** ${session.id}\n`;
    content += `**Project:** ${session.projectId}\n\n`;

    // Analyze dependencies
    const dependencyMap = new Map<string, string[]>();
    const dependentMap = new Map<string, string[]>();

    tasks.forEach(task => {
      dependencyMap.set(task.id, task.dependencies);
      task.dependencies.forEach(depId => {
        if (!dependentMap.has(depId)) {
          dependentMap.set(depId, []);
        }
        dependentMap.get(depId)!.push(task.id);
      });
    });

    const totalDependencies = Array.from(dependencyMap.values()).flat().length;
    const tasksWithDependencies = Array.from(dependencyMap.values()).filter(deps => deps.length > 0).length;
    const orphanedTasks = tasks.filter(task =>
      task.dependencies.length === 0 && (!dependentMap.has(task.id) || dependentMap.get(task.id)!.length === 0)
    );

    content += `## Overview\n\n`;
    content += `- **Total Tasks:** ${tasks.length}\n`;
    content += `- **Total Dependencies:** ${totalDependencies}\n`;
    content += `- **Tasks with Dependencies:** ${tasksWithDependencies}\n`;
    content += `- **Orphaned Tasks:** ${orphanedTasks.length}\n\n`;

    if (orphanedTasks.length > 0) {
      content += `## Orphaned Tasks (No Dependencies)\n\n`;
      orphanedTasks.forEach(task => {
        content += `- **${task.title}** (${task.id})\n`;
      });
      content += `\n`;
    }

    content += `## Task Dependencies\n\n`;
    tasks.forEach(task => {
      if (task.dependencies.length > 0) {
        content += `### ${task.title} (${task.id})\n`;
        content += `**Depends on:**\n`;
        task.dependencies.forEach(depId => {
          const depTask = tasks.find(t => t.id === depId);
          content += `- ${depTask?.title || depId} (${depId})\n`;
        });
        content += `\n`;
      }
    });

    const filePath = path.join(outputDir, 'dependency-analysis.md');
    await fs.writeFile(filePath, content);

    return filePath;
  }
  /**
   * Generate visual diagrams (Mermaid)
   */
  private async generateVisualDiagrams(session: DecompositionSession, outputDir: string): Promise<string[]> {
    const tasks = session.persistedTasks || [];
    const files: string[] = [];

    // Generate task flow diagram
    const taskFlowDiagram = this.generateTaskFlowDiagram(tasks, session);
    const taskFlowFile = path.join(outputDir, 'task-flow-diagram.md');
    await fs.writeFile(taskFlowFile, taskFlowDiagram);
    files.push(taskFlowFile);

    // Generate dependency diagram
    if (tasks.some(task => task.dependencies.length > 0)) {
      const dependencyDiagram = this.generateDependencyDiagram(tasks, session);
      const dependencyFile = path.join(outputDir, 'dependency-diagram.md');
      await fs.writeFile(dependencyFile, dependencyDiagram);
      files.push(dependencyFile);
    }

    return files;
  }

  /**
   * Generate JSON exports
   */
  private async generateJsonExports(
    session: DecompositionSession,
    analysis: TaskAnalysisSummary,
    outputDir: string
  ): Promise<string[]> {
    const files: string[] = [];

    // Export session data
    const sessionData = {
      session: {
        id: session.id,
        projectId: session.projectId,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        progress: session.progress,
        maxDepth: session.maxDepth,
        currentDepth: session.currentDepth,
        totalTasks: session.totalTasks,
        processedTasks: session.processedTasks,
        error: session.error
      },
      analysis,
      tasks: session.persistedTasks || [],
      results: session.results,
      richResults: session.richResults
    };

    const sessionFile = path.join(outputDir, 'session-data.json');
    await fs.writeFile(sessionFile, JSON.stringify(sessionData, null, 2));
    files.push(sessionFile);

    // Export tasks only
    if (session.persistedTasks && session.persistedTasks.length > 0) {
      const tasksFile = path.join(outputDir, 'tasks.json');
      await fs.writeFile(tasksFile, JSON.stringify(session.persistedTasks, null, 2));
      files.push(tasksFile);
    }

    // Export analysis summary
    const analysisFile = path.join(outputDir, 'analysis-summary.json');
    await fs.writeFile(analysisFile, JSON.stringify(analysis, null, 2));
    files.push(analysisFile);

    return files;
  }

  /**
   * Generate task flow Mermaid diagram
   */
  private generateTaskFlowDiagram(tasks: AtomicTask[], session: DecompositionSession): string {
    let content = `# Task Flow Diagram\n\n`;
    content += `**Session:** ${session.id}\n`;
    content += `**Project:** ${session.projectId}\n\n`;

    content += `\`\`\`mermaid\n`;
    content += `graph TD\n`;
    content += `    Start([Decomposition Started])\n`;

    if (tasks.length === 0) {
      content += `    Start --> NoTasks[No Tasks Generated]\n`;
    } else {
      // Group tasks by type for better visualization
      const tasksByType = tasks.reduce((acc, task) => {
        if (!acc[task.type]) acc[task.type] = [];
        acc[task.type].push(task);
        return acc;
      }, {} as Record<string, AtomicTask[]>);

      content += `    Start --> Decomp[Task Decomposition]\n`;

      Object.entries(tasksByType).forEach(([type, typeTasks]) => {
        const typeNode = `Type_${type.replace(/[^a-zA-Z0-9]/g, '_')}`;
        content += `    Decomp --> ${typeNode}[${type} Tasks: ${typeTasks.length}]\n`;

        typeTasks.slice(0, 5).forEach((task, index) => { // Limit to 5 tasks per type for readability
          const taskNode = `Task_${task.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const taskTitle = task.title.length > 30 ? task.title.substring(0, 30) + '...' : task.title;
          content += `    ${typeNode} --> ${taskNode}["${taskTitle}<br/>${task.estimatedHours}h"]\n`;
        });

        if (typeTasks.length > 5) {
          content += `    ${typeNode} --> More_${typeNode}[... ${typeTasks.length - 5} more tasks]\n`;
        }
      });

      content += `    Decomp --> Complete([Decomposition Complete])\n`;
    }

    content += `\`\`\`\n\n`;
    content += `## Legend\n\n`;
    content += `- **Rectangles**: Task groups by type\n`;
    content += `- **Rounded rectangles**: Individual tasks with estimated hours\n`;
    content += `- **Circles**: Process start/end points\n`;

    return content;
  }

  /**
   * Generate dependency Mermaid diagram
   */
  private generateDependencyDiagram(tasks: AtomicTask[], session: DecompositionSession): string {
    let content = `# Dependency Diagram\n\n`;
    content += `**Session:** ${session.id}\n`;
    content += `**Project:** ${session.projectId}\n\n`;

    content += `\`\`\`mermaid\n`;
    content += `graph LR\n`;

    // Create nodes for all tasks
    tasks.forEach(task => {
      const nodeId = `T_${task.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const taskTitle = task.title.length > 20 ? task.title.substring(0, 20) + '...' : task.title;
      const priorityColor = task.priority === 'high' ? 'fill:#ffcccc' :
                           task.priority === 'medium' ? 'fill:#ffffcc' : 'fill:#ccffcc';
      content += `    ${nodeId}["${taskTitle}<br/>${task.estimatedHours}h"]:::${task.priority}\n`;
    });

    // Add dependency relationships
    tasks.forEach(task => {
      if (task.dependencies.length > 0) {
        const taskNodeId = `T_${task.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
        task.dependencies.forEach(depId => {
          const depNodeId = `T_${depId.replace(/[^a-zA-Z0-9]/g, '_')}`;
          content += `    ${depNodeId} --> ${taskNodeId}\n`;
        });
      }
    });

    // Add styling
    content += `    classDef high fill:#ffcccc,stroke:#ff0000,stroke-width:2px\n`;
    content += `    classDef medium fill:#ffffcc,stroke:#ffaa00,stroke-width:2px\n`;
    content += `    classDef low fill:#ccffcc,stroke:#00aa00,stroke-width:2px\n`;

    content += `\`\`\`\n\n`;
    content += `## Legend\n\n`;
    content += `- **Red**: High priority tasks\n`;
    content += `- **Yellow**: Medium priority tasks\n`;
    content += `- **Green**: Low priority tasks\n`;
    content += `- **Arrows**: Dependency relationships (from dependency to dependent)\n`;

    return content;
  }
}
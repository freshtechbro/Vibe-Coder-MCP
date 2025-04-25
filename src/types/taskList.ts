// src/types/taskList.ts

/**
 * Defines the hierarchical levels for tasks.
 */
export enum TaskLevel {
  GENERAL = 'General Task',
  SUB = 'Sub-task',
  SUB_SUB = 'Sub-sub-task',
}

/**
 * Base interface for all task items.
 */
export interface TaskItem {
  id: string; // Unique identifier (e.g., generated UUID or sequential number)
  title: string;
  description: string;
  level: TaskLevel;
  parentTaskId: string | null; // ID of the parent task, null for General Tasks
  children?: TaskItem[]; // Optional array for nested tasks (alternative to parentTaskId linking)
}

/**
 * Interface for General Tasks.
 * Currently inherits all properties from TaskItem.
 */
export interface GeneralTask extends TaskItem {
  level: TaskLevel.GENERAL;
}

/**
 * Interface for Sub-tasks, requiring detailed fields.
 */
export interface SubTask extends TaskItem {
  level: TaskLevel.SUB;
  goal: string;
  objectives: string[]; // List of objectives
  impact: string;
  acceptanceCriteria: string[]; // List of acceptance criteria
}

/**
 * Interface for Sub-sub-tasks, also requiring detailed fields.
 * Structure is similar to SubTask for now.
 */
export interface SubSubTask extends TaskItem {
  level: TaskLevel.SUB_SUB;
  goal: string;
  objectives: string[]; // List of objectives
  impact: string;
  acceptanceCriteria: string[]; // List of acceptance criteria
}

/**
 * Type representing the fully structured task list, likely an array of General Tasks,
 * where SubTasks and SubSubTasks are nested within their parents or linked via parentTaskId.
 * Using a flat list with parentTaskId might be easier to parse initially.
 */
export type StructuredTaskList = (GeneralTask | SubTask | SubSubTask)[];

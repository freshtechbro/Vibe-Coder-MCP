// src/tools/task-list-generator/templates/index.ts

/**
 * Template for generating hyper-decomposed task lists.
 * Uses Markdown headings for structure and specific markers for detailed fields.
 */
export const hyperDecompositionTemplate = `
# Task List for: [Product/Feature Name - LLM should fill this]

## Overall Goal:
[LLM should provide a concise overall goal based on the PRD]

---

## General Task: [Title of General Task 1]
*Description:* [Detailed description of General Task 1]

### Sub-task: [Title of Sub-task 1.1]
*Description:* [Detailed description of Sub-task 1.1]
*Goal:* [Specific goal for this sub-task]
*Objectives:*
- [Objective 1]
- [Objective 2]
*Impact:* [Potential impact of completing this sub-task]
*Acceptance Criteria:*
- [Criterion 1]
- [Criterion 2]

#### Sub-sub-task: [Title of Sub-sub-task 1.1.1]
*Description:* [Detailed description of Sub-sub-task 1.1.1]
*Goal:* [Specific goal for this sub-sub-task]
*Objectives:*
- [Objective 1]
- [Objective 2]
*Impact:* [Potential impact of completing this sub-sub-task]
*Acceptance Criteria:*
- [Criterion 1]
- [Criterion 2]

#### Sub-sub-task: [Title of Sub-sub-task 1.1.2]
*Description:* [Detailed description of Sub-sub-task 1.1.2]
*Goal:* [Specific goal for this sub-sub-task]
*Objectives:*
- [Objective 1]
*Impact:* [Potential impact of completing this sub-sub-task]
*Acceptance Criteria:*
- [Criterion 1]

### Sub-task: [Title of Sub-task 1.2]
*Description:* [Detailed description of Sub-task 1.2]
*Goal:* [Specific goal for this sub-task]
*Objectives:*
- [Objective 1]
*Impact:* [Potential impact of completing this sub-task]
*Acceptance Criteria:*
- [Criterion 1]

---

## General Task: [Title of General Task 2]
*Description:* [Detailed description of General Task 2]

### Sub-task: [Title of Sub-task 2.1]
*Description:* [Detailed description of Sub-task 2.1]
*Goal:* [Specific goal for this sub-task]
*Objectives:*
- [Objective 1]
*Impact:* [Potential impact of completing this sub-task]
*Acceptance Criteria:*
- [Criterion 1]

---
[Add more General Tasks, Sub-tasks, and Sub-sub-tasks as needed following the same structure]
`;

// Optional: Export other templates or helper functions if needed in the future
// export const anotherTemplate = ...;

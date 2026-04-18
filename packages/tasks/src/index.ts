/**
 * Public entrypoint for @sparkflow/tasks (WP-C4 scaffold).
 */

export type {
  TaskState,
  TaskRecord,
  TaskStepKind,
  TaskStepState,
  TaskStep,
  TaskPlan,
  TaskPlanStep,
  TaskEvent,
} from "./types";
export { TaskPausedError, TaskCancelledError } from "./types";

export { planTask } from "./planner";
export { TaskExecutor } from "./executor";
export {
  enqueueTask,
  runTaskOnce,
  cancelTask,
  listTasks,
  getTask,
  type EnqueueTaskInput,
  type ListTasksFilter,
} from "./engine";

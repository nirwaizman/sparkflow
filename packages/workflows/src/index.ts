/**
 * Public entrypoint for @sparkflow/workflows (WP-C5 scaffold).
 */

export type {
  NodeKind,
  TriggerKind,
  WorkflowNode,
  WorkflowGraph,
  WorkflowTrigger,
  WorkflowDefinition,
  TaskEvent,
} from "./types";

export { runWorkflow, type WorkflowRunContext } from "./runtime";
export {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  activateWorkflow,
  deactivateWorkflow,
  type CreateWorkflowInput,
  type UpdateWorkflowPatch,
} from "./registry";
export { nextRunAt } from "./schedule";

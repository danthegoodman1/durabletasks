import { WorkflowRow, WorkflowTaskRow } from "../workflows"

export interface StorageProvider {
  getPendingWorkflows(): Promise<WorkflowRow[]>

  getNextWorkflowTask(workflowID: string): Promise<WorkflowTaskRow | null>

  updateWorkflowStatus(
    workflowID: string,
    status: "pending" | "completed" | "failed"
  ): Promise<void>

  updateWorkflowTaskStatus(
    workflowID: string,
    seq: number,
    status: "pending" | "completed" | "failed",
    result: {
      data?: any
      errorMessage?: string
    }
  ): Promise<void>

  deleteOldWorkflowsAndTasks(olderThanMS: number): Promise<void>

  /**
   * You must generate a new ID for the workflow and tasks. The workflow and tasks should all be inserted atomically.
   *
   * You must insert a full {@link WorkflowRow} and one or more {@link WorkflowTaskRow}
   */
  insertWorkflowAndTasks(
    workflow: Omit<WorkflowRow, "id" | "created_ms" | "updated_ms">,
    tasks: Omit<
      WorkflowTaskRow,
      "id" | "created_ms" | "updated_ms" | "error" | "return" | "workflow_id"
    >[]
  ): Promise<WorkflowRow>
}

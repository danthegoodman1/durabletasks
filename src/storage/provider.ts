import { WorkflowRow, WorkflowTaskRow } from "../workflows"

export interface StorageProvider {
  /**
   * Run any setup code for the storage provider, such as creating tables.
   */
  init(): Promise<void>

  getPendingWorkflows(): Promise<WorkflowRow[]>

  getNextWorkflowTask(
    workflowID: string
  ): Promise<WorkflowTaskRow | null | undefined>

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
    },
    /**
     * If provided, the workflow status will be updated to this as well. This must be done atomically.
     */
    workflowStatus?: "pending" | "completed" | "failed"
  ): Promise<void>

  deleteOldWorkflowsAndTasks(olderThanMS: number): Promise<void>

  /**
   * You must generate a new ID for the workflow and tasks. The workflow and tasks should all be inserted atomically.
   *
   * You must insert a full {@link WorkflowRow} and one or more {@link WorkflowTaskRow}
   *
   * Should be an idempotent operation, such that if a workflow with the same ID is inserted, it will return the existing workflow.
   */
  insertWorkflowAndTasks(
    workflow: Omit<WorkflowRow, "created_ms" | "updated_ms">,
    tasks: Omit<
      WorkflowTaskRow,
      "id" | "created_ms" | "updated_ms" | "error" | "return" | "workflow_id"
    >[]
  ): Promise<WorkflowRow>
}

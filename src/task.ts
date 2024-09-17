export interface TaskExecutionContext<Tin = any> {
  workflowID: string
  /**
   * If something returned from the prepare, provide it here
   */
  preparedData?: any
  /**
   * The task number in the list, starting at 0
   */
  seq: number
  /**
   * Input to the specific task
   */
  data: Tin | null
  /**
   * Number of retries on this task
   */
  attempt: number
}

/**
 * TaskRunners are shared instances (not per task)
 */
export interface TaskRunner<Tin = any, Tout = any> {
  Name: string
  Execute(ctx: TaskExecutionContext<Tin>): Promise<Tout>
  /**
   * If there is something that needs to be run before workflow execution starts, like getting a token that is shared among tasks. Does not store the value.
   */
  Prepare?(ctx: TaskExecutionContext<Tin>): Promise<any | undefined>
}

export class ExpectedError extends Error {
  constructor(msg: string, public abort: "task" | "workflow" = "task") {
    super(msg)
    this.name = "ExpectedError"
  }
}

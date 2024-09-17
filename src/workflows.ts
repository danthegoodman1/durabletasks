type TaskFunction = (...args: any[]) => Promise<any> | any

type ParamsOf<T extends TaskFunction> = Parameters<T>

interface WorkflowTask<T extends TaskFunction> {
  task: T
  /**
   * An array that is the parameters passed into function `task`
   */
  data: ParamsOf<T>
}

interface AddWorkflowParams<T extends TaskFunction[]> {
  name: string
  tasks: { [K in keyof T]: WorkflowTask<T[K]> }
  metadata?: Record<string, any>
}

interface WorkflowRow {
  id: string
  name: string
  metadata: string | null
  status: "pending" | "completed" | "failed"
  created_ms: number
  updated_ms: number
}

interface WorkflowTaskRow {
  workflow: string
  task_name: string
  seq: number
  status: "pending" | "completed" | "failed"
  data: string | null
  return: string | null
  error: string | null
  created_ms: number
  updated_ms: number
}

export class WorkflowRunner {
  taskRunners: { [name: string]: TaskRunner }
  retryDelayMS: number

  constructor(opts: { taskRunners: TaskRunner[]; retryDelayMS: number }) {
    // Turn it into a map where key is the name
    this.taskRunners = Object.fromEntries(
      opts.taskRunners.map((tr) => [tr.Name, tr])
    )
    this.retryDelayMS = opts.retryDelayMS
  }
  
  async function addWorkflow<T extends TaskFunction[]>(
    params: AddWorkflowParams<T>
  ): Promise<void>
}

import { Logger } from "./logger"
import { StorageProvider } from "./storage/provider"
import { ExpectedError, TaskRunner } from "./task"
import { extractError } from "./utils"

type TaskFunction = (...args: any[]) => Promise<any> | any

type ParamsOf<T extends TaskFunction> = Parameters<T>

interface WorkflowTask<T extends TaskFunction> {
  task: T | string
  /**
   * An array that is the parameters passed into function `task`
   */
  data: ParamsOf<T>
}

export interface WorkflowRow {
  id: string
  status: "pending" | "completed" | "failed"
  created_ms: number
  updated_ms: number
}

export interface WorkflowTaskRow {
  workflow_id: string
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
  storage: StorageProvider
  logger?: Logger
  expiryMS?: number
  checkExpiryIntervalMS?: number

  constructor(opts: {
    taskRunners: TaskRunner[]
    retryDelayMS: number
    storageProvider: StorageProvider
    logger?: Logger
    expiryMS?: number
    checkExpiryIntervalMS?: number
  }) {
    // Turn it into a map where key is the name
    this.taskRunners = Object.fromEntries(
      opts.taskRunners.map((tr) => [tr.Name, tr])
    )
    this.retryDelayMS = opts.retryDelayMS
    this.storage = opts.storageProvider
    this.logger = this.logger
    this.expiryMS = opts.expiryMS
    this.checkExpiryIntervalMS = opts.checkExpiryIntervalMS
    if (!!this.expiryMS && !!this.checkExpiryIntervalMS) {
      setInterval(
        () =>
          this.storage.deleteOldWorkflowsAndTasks(
            new Date().getTime() - this.expiryMS!
          ),
        this.checkExpiryIntervalMS
      )
    }
  }

  /**
   * Recover workflows from the DB on reboot (always call this)
   */
  async recover() {
    this.logger?.debug("recovering workflows")
    // load all pending workflows from the db
    const workflows: WorkflowRow[] = await this.storage.getPendingWorkflows()
    this.logger?.info(`recovering ${workflows.length} pending workflows`)
    for (const workflow of workflows) {
      this.logger?.debug(
        {
          worfklowID: workflow.id,
        },
        "recovered workflow"
      )
      this.executeWorkflow(workflow)
    }
  }

  async addWorkflow<T extends TaskFunction[]>(
    /**
     * A unique ID for this workflow. Used for deduplication.
     */
    workflowID: string,
    tasks: {
      [K in keyof T]: WorkflowTask<T[K]>
    }
  ): Promise<void> {
    this.logger?.info("adding workflow")

    const workflow = await this.storage.insertWorkflowAndTasks(
      {
        id: workflowID,
        status: "pending",
      },
      Object.entries(tasks).map(([name, task], ind) => ({
        task_name: name,
        seq: ind,
        status: "pending",
        data: JSON.stringify(task.data),
      }))
    )

    // Start execution async
    this.executeWorkflow(workflow!)
  }

  async executeWorkflow(workflow: WorkflowRow) {
    const prepared: { [k: string]: any } = {}

    try {
      this.logger?.info(`WKFL=${workflow.id} executing workflow`)

      let attempts = 0
      while (true) {
        attempts = 0
        // Process the tasks
        while (true) {
          this.logger?.debug(`WKFL=${workflow.id} getting latest workflow task`)
          const task = await this.storage.getNextWorkflowTask(workflow.id)
          if (!task) {
            this.logger?.info(`WKFL=${workflow.id} workflow completed`)
            return await this.storage.updateWorkflowStatus(
              workflow.id,
              "completed"
            )
          }
          if (!this.taskRunners[task.task_name]) {
            this.logger?.error(
              {
                taskName: task.task_name,
              },
              `WKFL=${workflow.id} TASK=${task.seq} task name not found, aborting workflow (add task and reboot to recover workflow, or update task in db for next attempt)`
            )
            return
          }

          // Check for prepare
          if (
            !prepared[task.task_name] &&
            this.taskRunners[task.task_name].Prepare
          ) {
            try {
              prepared[task.task_name] = await this.taskRunners[task.task_name]
                .Prepare!({
                attempt: attempts,
                data: task.data,
                seq: task.seq,
                workflowID: workflow.id,
              })
            } catch (error) {
              this.logger?.error(
                {
                  taskName: task.task_name,
                },
                `WKFL=${workflow.id} TASK=${task.seq} task failed to prepare, fix and reboot to recover workflow`
              )
            }
          }

          this.logger?.debug(
            `WKFL=${workflow.id} TASK=${task.seq} executing task`
          )
          const result = await this.taskRunners[task.task_name].Execute({
            attempt: attempts,
            data: task.data ? JSON.parse(task.data) : null,
            seq: task.seq,
            workflowID: workflow.id,
            preparedData: prepared[task.task_name],
          })
          if (result.error) {
            if (result.error instanceof ExpectedError) {
              this.logger?.info(
                {
                  err: extractError(result.error),
                },
                `WKFL=${workflow.id} TASK=${task.seq} expected task execution error`
              )
            } else {
              this.logger?.error(
                {
                  err: extractError(result.error),
                  abort: result.abort,
                },
                `WKFL=${workflow.id} TASK=${task.seq} task execution error`
              )
            }
            if (result.abort === "workflow") {
              this.logger?.warn(`WKFL=${workflow.id} failing workflow`)
              await this.storage.updateWorkflowStatus(workflow.id, "failed")
              this.logger?.info(
                `WKFL=${workflow.id} TASK=${task.seq} failing task`
              )
              await this.storage.updateWorkflowTaskStatus(
                workflow.id,
                task.seq,
                "failed",
                {
                  errorMessage: result.error.message,
                  data: result.data,
                }
              )
              return // we are done processing, exit
            }
            if (
              result.abort === "task" ||
              result.error instanceof ExpectedError
            ) {
              this.logger?.info(
                `WKFL=${workflow.id} TASK=${task.seq} failing task`
              )
              await this.storage.updateWorkflowTaskStatus(
                workflow.id,
                task.seq,
                "failed",
                {
                  errorMessage: result.error.message,
                  data: result.data,
                }
              )
              break
            }

            // sleep and retry
            await new Promise((r) => setTimeout(r, this.retryDelayMS))
            attempts += 1
            this.logger?.debug(
              `WKFL=${workflow.id} TASK=${task.seq} retrying task`
            )
            continue
          }

          // Completed
          this.logger?.info(
            `WKFL=${workflow.id} TASK=${task.seq} task completed`
          )
          await this.storage.updateWorkflowTaskStatus(
            workflow.id,
            task.seq,
            "completed",
            {
              data: result.data,
            }
          )
          break
        }
      }
    } catch (error) {
      this.logger?.error(
        {
          err: extractError(error),
        },
        `WKFL=${workflow.id} error executing workflow`
      )
      throw error
    }
  }
}

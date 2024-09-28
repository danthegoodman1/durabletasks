import { Database } from "sqlite"
import { StorageProvider } from "./provider"
import { WorkflowRow, WorkflowTaskRow } from "../workflows"
import { Mutex } from "async-mutex"

/**
 * SQLite storage provider. This uses a single shared connection to the database, rather than opening and closing connections for each operation, which is more efficient as operations are generally back-to-back, and don't need to run with as high concurrency as synchronous operations.
 */
export class SQLiteStorageProvider implements StorageProvider {
  private db: Database
  private workflowsTable: string
  private workflowTasksTable: string
  private mutex: Mutex

  constructor(
    db: Database,
    options: {
      /**
       * Is not SQL injection resistant.
       */
      workflowsTable: string
      /**
       * Is not SQL injection resistant.
       */
      workflowTasksTable: string
    }
  ) {
    this.db = db
    this.workflowsTable = options.workflowsTable
    this.workflowTasksTable = options.workflowTasksTable
    this.mutex = new Mutex()
  }

  async init(): Promise<void> {
    await this.db.open()
    await this.createTables()
    await this.createIndexes()
  }

  private async createTables(): Promise<void> {
    await this.db.exec(`
      create table if not exists ${this.workflowsTable} (
        id text primary key,
        status text not null,
        created_ms integer not null,
        updated_ms integer not null
      );

      create table if not exists ${this.workflowTasksTable} (
        id integer primary key autoincrement,
        workflow_id text not null,
        task_name text not null,
        seq integer not null,
        status text not null,
        data text,
        return text,
        error text,
        created_ms integer not null,
        updated_ms integer not null,
        foreign key (workflow_id) references ${this.workflowsTable}(id)
      );
    `)
  }

  private async createIndexes(): Promise<void> {
    await this.db.exec(`
      create index if not exists idx_${this.workflowsTable}_status on ${this.workflowsTable}(status);
      create index if not exists idx_${this.workflowTasksTable}_workflow_id on ${this.workflowTasksTable}(workflow_id);
      create index if not exists idx_${this.workflowTasksTable}_status on ${this.workflowTasksTable}(status);
    `)
  }

  async getPendingWorkflows(): Promise<WorkflowRow[]> {
    return this.db.all<WorkflowRow[]>(
      `select * from ${this.workflowsTable} where status = ?`,
      ["pending"]
    )
  }

  async getNextWorkflowTask(
    workflowID: string
  ): Promise<WorkflowTaskRow | undefined | null> {
    return await this.db.get<WorkflowTaskRow>(
      `
      select * from ${this.workflowTasksTable}
      where workflow_id = ? and status = 'pending'
      order by seq asc
      limit 1
    `,
      [workflowID]
    )
  }

  async updateWorkflowStatus(
    workflowID: string,
    status: "pending" | "completed" | "failed"
  ): Promise<void> {
    await this.db.run(
      `update ${this.workflowsTable} set status = ?, updated_ms = ? where id = ?`,
      [status, Date.now(), workflowID]
    )
  }

  async updateWorkflowTaskStatus(
    workflowID: string,
    seq: number,
    status: "pending" | "completed" | "failed",
    result: {
      data?: any
      errorMessage?: string
    },
    workflowStatus?: "pending" | "completed" | "failed"
  ): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.db.run("begin transaction")
      try {
        await this.db.run(
          `
          update ${this.workflowTasksTable}
          set status = ?, return = ?, error = ?, updated_ms = ?
          where workflow_id = ? and seq = ?
        `,
          [
            status,
            result.data ? JSON.stringify(result.data) : null,
            result.errorMessage,
            Date.now(),
            workflowID,
            seq,
          ]
        )

        if (workflowStatus) {
          await this.db.run(
            `update ${this.workflowsTable} set status = ?, updated_ms = ? where id = ?`,
            [workflowStatus, Date.now(), workflowID]
          )
        }

        await this.db.run("commit")
      } catch (error) {
        await this.db.run("rollback")
        throw error
      }
    })
  }

  async deleteOldWorkflowsAndTasks(olderThanMS: number): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const cutoffTime = Date.now() - olderThanMS
      await this.db.run("begin transaction")
      try {
        await this.db.run(
          `delete from ${this.workflowTasksTable} where workflow_id in (select id from ${this.workflowsTable} where created_ms < ?)`,
          [cutoffTime]
        )
        await this.db.run(
          `delete from ${this.workflowsTable} where created_ms < ?`,
          [cutoffTime]
        )
        await this.db.run("commit")
      } catch (error) {
        await this.db.run("rollback")
        throw error
      }
    })
  }

  async insertWorkflowAndTasks(
    workflow: Omit<WorkflowRow, "created_ms" | "updated_ms">,
    tasks: Omit<
      WorkflowTaskRow,
      "id" | "created_ms" | "updated_ms" | "error" | "return" | "workflow_id"
    >[]
  ): Promise<WorkflowRow> {
    return await this.mutex.runExclusive(async () => {
      // Check if the workflow already exists
      const existingWorkflow = await this.db.get<WorkflowRow>(
        `select * from ${this.workflowsTable} where id = ?`,
        [workflow.id]
      )

      if (existingWorkflow) {
        return existingWorkflow
      }

      const now = Date.now()

      await this.db.run("begin transaction")
      try {
        await this.db.run(
          `insert into ${this.workflowsTable} (id, status, created_ms, updated_ms) values (?, ?, ?, ?)`,
          [workflow.id, workflow.status, now, now]
        )

        for (const task of tasks) {
          await this.db.run(
            `
            insert into ${this.workflowTasksTable} (workflow_id, task_name, seq, status, data, created_ms, updated_ms)
            values (?, ?, ?, ?, ?, ?, ?)
          `,
            [
              workflow.id,
              task.task_name,
              task.seq,
              task.status,
              task.data,
              now,
              now,
            ]
          )
        }

        await this.db.run("commit")
      } catch (error) {
        await this.db.run("rollback")
        throw error
      }

      return {
        id: workflow.id,
        status: workflow.status,
        created_ms: now,
        updated_ms: now,
      }
    })
  }
}

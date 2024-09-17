import { Database } from "sqlite"
import { StorageProvider } from "./provider"
import { WorkflowRow, WorkflowTaskRow } from "../workflows"

export class SQLiteStorageProvider implements StorageProvider {
  private db: Database

  constructor(db: Database) {
    this.db = db
  }

  async init(): Promise<void> {
    await this.db.open()
    await this.createTables()
    await this.createIndexes()
  }

  private async createTables(): Promise<void> {
    await this.db.exec(`
      create table if not exists workflows (
        id text primary key,
        status text not null,
        created_ms integer not null,
        updated_ms integer not null
      );

      create table if not exists workflow_tasks (
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
        foreign key (workflow_id) references workflows(id)
      );
    `)
  }

  private async createIndexes(): Promise<void> {
    await this.db.exec(`
      create index if not exists idx_workflows_status on workflows(status);
      create index if not exists idx_workflow_tasks_workflow_id on workflow_tasks(workflow_id);
      create index if not exists idx_workflow_tasks_status on workflow_tasks(status);
    `)
  }

  async getPendingWorkflows(): Promise<WorkflowRow[]> {
    return this.db.all<WorkflowRow[]>(
      "select * from workflows where status = ?",
      ["pending"]
    )
  }

  async getNextWorkflowTask(
    workflowID: string
  ): Promise<WorkflowTaskRow | undefined | null> {
    return await this.db.get<WorkflowTaskRow>(
      `
      select * from workflow_tasks
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
      "update workflows set status = ?, updated_ms = ? where id = ?",
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
    }
  ): Promise<void> {
    await this.db.run(
      `
      update workflow_tasks
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
  }

  async deleteOldWorkflowsAndTasks(olderThanMS: number): Promise<void> {
    const cutoffTime = Date.now() - olderThanMS
    await this.db.run("begin transaction")
    try {
      await this.db.run(
        "delete from workflow_tasks where workflow_id in (select id from workflows where created_ms < ?)",
        [cutoffTime]
      )
      await this.db.run("delete from workflows where created_ms < ?", [
        cutoffTime,
      ])
      await this.db.run("commit")
    } catch (error) {
      await this.db.run("rollback")
      throw error
    }
  }

  async insertWorkflowAndTasks(
    workflow: Omit<WorkflowRow, "created_ms" | "updated_ms">,
    tasks: Omit<
      WorkflowTaskRow,
      "id" | "created_ms" | "updated_ms" | "error" | "return" | "workflow_id"
    >[]
  ): Promise<WorkflowRow> {
    // Check if the workflow already exists
    const existingWorkflow = await this.db.get<WorkflowRow>(
      "select * from workflows where id = ?",
      [workflow.id]
    )

    if (existingWorkflow) {
      return existingWorkflow
    }

    const now = Date.now()

    await this.db.run("begin transaction")
    try {
      await this.db.run(
        "insert into workflows (id, status, created_ms, updated_ms) values (?, ?, ?, ?)",
        [workflow.id, workflow.status, now, now]
      )

      for (const task of tasks) {
        await this.db.run(
          `
          insert into workflow_tasks (workflow_id, task_name, seq, status, data, created_ms, updated_ms)
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
  }
}

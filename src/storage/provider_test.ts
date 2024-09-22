/**
 * This test suite is AI generated.
 *
 * It is not comprehensive, but it does test the basic functionality of the StorageProvider internals (not actually running).
 *
 * This package has been used in production extensively, so it's been "tested in prod"
 */

import { describe, it, expect, beforeEach } from "vitest"
import { StorageProvider } from "./provider"
import { WorkflowRow, WorkflowTaskRow } from "../workflows"
import { v4 as uuidv4 } from "uuid"

export default function BuildProviderTest(
  createProvider: () => Promise<StorageProvider>
) {
  let provider: StorageProvider

  describe(`StorageProvider Tests`, () => {
    beforeEach(async () => {
      provider = await createProvider()
      await provider.init()

      // Insert a test workflow before each test
      const workflowId = uuidv4()
      const workflow: Omit<WorkflowRow, "created_ms" | "updated_ms"> = {
        id: workflowId,
        status: "pending",
      }
      const tasks: Omit<
        WorkflowTaskRow,
        "id" | "created_ms" | "updated_ms" | "error" | "return" | "workflow_id"
      >[] = [
        {
          task_name: "TestTask",
          seq: 0,
          status: "pending",
          data: JSON.stringify({ test: "data" }),
        },
      ]
      await provider.insertWorkflowAndTasks(workflow, tasks)
    })

    it("should insert a workflow and tasks", async () => {
      const workflowId = uuidv4()
      const workflow: Omit<WorkflowRow, "created_ms" | "updated_ms"> = {
        id: workflowId,
        status: "pending",
      }
      const tasks: Omit<
        WorkflowTaskRow,
        "id" | "created_ms" | "updated_ms" | "error" | "return" | "workflow_id"
      >[] = [
        {
          task_name: "Task1",
          seq: 0,
          status: "pending",
          data: JSON.stringify({ foo: "bar" }),
        },
        {
          task_name: "Task2",
          seq: 1,
          status: "pending",
          data: JSON.stringify({ baz: "qux" }),
        },
      ]

      const result = await provider.insertWorkflowAndTasks(workflow, tasks)
      expect(result).toBeDefined()
      expect(result.id).toBe(workflowId)
      expect(result.status).toBe("pending")
      expect(result.created_ms).toBeDefined()
      expect(result.updated_ms).toBeDefined()
    })

    it("should get pending workflows", async () => {
      const pendingWorkflows = await provider.getPendingWorkflows()
      expect(pendingWorkflows).toBeDefined()
      expect(Array.isArray(pendingWorkflows)).toBe(true)
      expect(pendingWorkflows.length).toBeGreaterThan(0)
      expect(pendingWorkflows[0].status).toBe("pending")
    })

    it("should get the next workflow task", async () => {
      const pendingWorkflows = await provider.getPendingWorkflows()
      const workflowId = pendingWorkflows[0].id

      const nextTask = await provider.getNextWorkflowTask(workflowId)
      expect(nextTask).toBeDefined()
      expect(nextTask?.workflow_id).toBe(workflowId)
      expect(nextTask?.seq).toBe(0)
      expect(nextTask?.status).toBe("pending")
    })

    it("should update workflow status", async () => {
      const pendingWorkflows = await provider.getPendingWorkflows()
      const workflowId = pendingWorkflows[0].id

      await provider.updateWorkflowStatus(workflowId, "completed")
      const updatedWorkflows = await provider.getPendingWorkflows()
      expect(updatedWorkflows.find((w) => w.id === workflowId)).toBeUndefined()
    })

    it("should update workflow task status", async () => {
      const workflowId = uuidv4()
      const workflow: Omit<WorkflowRow, "created_ms" | "updated_ms"> = {
        id: workflowId,
        status: "pending",
      }
      const tasks: Omit<
        WorkflowTaskRow,
        "id" | "created_ms" | "updated_ms" | "error" | "return" | "workflow_id"
      >[] = [
        {
          task_name: "Task1",
          seq: 0,
          status: "pending",
          data: JSON.stringify({ foo: "bar" }),
        },
      ]

      await provider.insertWorkflowAndTasks(workflow, tasks)

      await provider.updateWorkflowTaskStatus(workflowId, 0, "completed", {
        data: { result: "success" },
      })
      const nextTask = await provider.getNextWorkflowTask(workflowId)
      expect(nextTask).toBeFalsy()
    })

    it("should delete old workflows and tasks", async () => {
      const oldWorkflowId = uuidv4()
      const oldWorkflow: Omit<WorkflowRow, "created_ms" | "updated_ms"> = {
        id: oldWorkflowId,
        status: "completed",
      }
      const oldTasks: Omit<
        WorkflowTaskRow,
        "id" | "created_ms" | "updated_ms" | "error" | "return" | "workflow_id"
      >[] = [
        {
          task_name: "OldTask",
          seq: 0,
          status: "completed",
          data: JSON.stringify({ old: "data" }),
        },
      ]

      await provider.insertWorkflowAndTasks(oldWorkflow, oldTasks)

      // Simulate passage of time
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
      await provider.deleteOldWorkflowsAndTasks(twoHoursAgo)

      const pendingWorkflows = await provider.getPendingWorkflows()
      expect(
        pendingWorkflows.find((w) => w.id === oldWorkflowId)
      ).toBeUndefined()
    })

    it("should handle concurrent workflow insertions", async () => {
      const workflowId = uuidv4()
      const workflow: Omit<WorkflowRow, "created_ms" | "updated_ms"> = {
        id: workflowId,
        status: "pending",
      }
      const tasks: Omit<
        WorkflowTaskRow,
        "id" | "created_ms" | "updated_ms" | "error" | "return" | "workflow_id"
      >[] = [
        {
          task_name: "ConcurrentTask",
          seq: 0,
          status: "pending",
          data: JSON.stringify({ concurrent: "data" }),
        },
      ]

      const insertPromises = [
        provider.insertWorkflowAndTasks(workflow, tasks),
        provider.insertWorkflowAndTasks(workflow, tasks),
      ]

      const results = await Promise.all(insertPromises)
      expect(results[0].id).toBe(workflowId)
      expect(results[1].id).toBe(workflowId)
      expect(results[0].created_ms).toBe(results[1].created_ms)
    })

    it("should resume workflow after runner restart", async () => {
      const workflowId = uuidv4()
      const workflow: Omit<WorkflowRow, "created_ms" | "updated_ms"> = {
        id: workflowId,
        status: "pending",
      }
      const tasks: Omit<
        WorkflowTaskRow,
        "id" | "created_ms" | "updated_ms" | "error" | "return" | "workflow_id"
      >[] = [
        {
          task_name: "Task1",
          seq: 0,
          status: "pending",
          data: JSON.stringify({ foo: "bar" }),
        },
        {
          task_name: "Task2",
          seq: 1,
          status: "pending",
          data: JSON.stringify({ baz: "qux" }),
        },
      ]

      // Insert workflow and tasks
      await provider.insertWorkflowAndTasks(workflow, tasks)

      // Simulate completing the first task
      await provider.updateWorkflowTaskStatus(workflowId, 0, "completed", {
        data: { result: "Task1 completed" },
      })

      // Simulate runner restart by creating a new provider instance
      const newProvider = await createProvider()
      await newProvider.init()

      // Get pending workflows after restart
      const pendingWorkflows = await newProvider.getPendingWorkflows()
      const resumedWorkflow = pendingWorkflows.find((w) => w.id === workflowId)
      expect(resumedWorkflow).toBeDefined()
      expect(resumedWorkflow?.status).toBe("pending")

      // Check if the next task is the second one
      const nextTask = await newProvider.getNextWorkflowTask(workflowId)
      expect(nextTask).toBeDefined()
      expect(nextTask?.seq).toBe(1)
      expect(nextTask?.status).toBe("pending")
      expect(nextTask?.task_name).toBe("Task2")
    })
  })
}

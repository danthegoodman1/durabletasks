# DurableTasks

A lightweight durable execution framework for JS/TS that allows you to bring you own storage (or use one of the premade providers).

This is designed to be run on a single node. Distributed processing of tasks can be managed outside of this (e.g. using a shared pool for WorkflowRunners).

## Usage

`Workflow`s run one or more `Task`s. They do so via registered `TaskRunner`s.

You must first create a `WorkflowRunner` with registered `TaskRunner`s like:

```ts
// Create a WorkflowRunner instance
const workflowRunner = new WorkflowRunner({
  taskRunners: [
    {
      Name: "ExampleTask",
      Execute: async (ctx) => {
        // Your task logic here
        // This will be at least once executed
        console.log(`Executing task with data:`, ctx.data)
        return { data: "Task completed successfully" }
      },
    },
  ],
  retryDelayMS: 5000,
  storageProvider: new SQLiteStorageProvider("path/to/database.sqlite"),
})

// Recover any pending workflows that were abandoned
await workflowRunner.recover()
```

Then, we can queue workflows, that contain one or more tasks:

```ts
// Add a new workflow
await workflowRunner.addWorkflow({
  tasks: {
    task1: {
      task: "ExampleTask",
      data: ["Hello, World!"],
    },
    task2: {
      task: "ExampleTask",
      data: ["Task 2 data"],
    },
  },
})
```

The workflow will start executing these immediately on the local machine after it has durably stored the information.

## Recovery

When a workflow recovers, it starts off from the first incomplete task. This means that tasks can be executed more than once (if a task died moments between execution and storage).

You should design your tasks to be tolerant to this (idempotent).

## Storage Providers

You can create your own storage provider by implementing the `StorageProvider` interface at `durabletasks/storage/provider`.

## SQLite provider

`durabletasks/storage/sqlite`

Use a SQLite table for storage.

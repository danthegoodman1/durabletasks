# DurableTasks

A lightweight durable execution framework for JS/TS that allows you to bring you own storage (or use one of the premade providers).

This is designed to be run on a single node. Distributed processing of tasks can be managed outside of this (e.g. using a shared pool for WorkflowRunners).

It's simple. It works. Used in production at scale at [Tangia](https://www.tangia.co).

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
        return { data: "Task completed successfully" } as TaskExecutionResult
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

### Accessing task results

A given task can access the returned data from previous tasks by reading the workflow task status back from the DB using the known workflow ID and task seq number.

### Errors

Errors should be thrown from the task like any other JS function.

If the error is of type `ExpectedError`, then the task will be aborted and the workflow will continue. You can optionally set the `abort` parameter to `workflow` to abort the entire workflow (default `task` to abort just the task). No retries will even be performed if an `ExpectedError` is thrown. Any other abort value will be treated as an unexpected error, and entry the retry loop detailed below.

If the error is not an `ExpectedError`, then the task will be retried indefinitely with a linear `WorkflowRunner.retryDelayMS`, while error logging (and warn logging for retries).

### Aborting tasks and workflows

Any task can chose to abort itself (just the task), or the entire workflow.

This can be done by using the `TaskExecutionResult.abort` property.

## Strategies and Tricks

### Preparing auth

The `Prepare` method of the `TaskRunner` runs every time it is first run for a given workflow. This means you can use this to refresh short-lived auth tokens and other temporary activities without having to do it redundantly across instances of the same task (a workflow will dedupe this for the runner automatically, and rerun on recovery).

### ID generation

This package is not opinionated about how you generate IDs, requiring that you provide unique workflow IDs.

It is generally best to make these completely random, and not sorted in the time dimension, to work well with all databases for natural key-range distribution.

### Spawn new workflows from tasks

Because workflow generation is idempotent, you can safely spawn a workflow from a task, if the workflow ID is determinsitic (e.g. if the same task ran many times, it'd try to spawn a workflow with the same ID every time). For example you could use `${currentWorfklowID}-some_suffix`. The workflow ID is available in the `TaskExecutionContext`.

### Use a logger with at least `error` level

The `Logger` interface is an optional logger that can be passed in to the `WorkflowRunner`. At least have something that logs for the `error` log level, so that you know when things are erroring (unexpected errors). `ExpectedError`s will not error log.

## Recovery

When a workflow recovers, it starts off from the first incomplete task. This means that tasks can be executed more than once (if a task died moments between execution and storage).

You should design your tasks to be tolerant to this (idempotent).

## Storage Providers

You can create your own storage provider by implementing the `StorageProvider` interface at `durabletasks/storage/provider`. To enable the guarantees that the `WorkflowRunner` expects, your storage must support atomic commits and consistency.

Atomic commits are needed in the `insertWorkflowAndTasks` and `updateWorkflowTaskStatus` methods (with `updateWorkflowTaskStatus` being optionally atomic if a `workflowID` is provided).

## SQLite provider

`durabletasks/storage/sqlite`

Use a SQLite table for storage.

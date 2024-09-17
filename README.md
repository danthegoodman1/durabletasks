# DurableTasks

A lightweight durable execution framework for JS/TS that allows you to bring you own storage (or use one of the premade providers).

This is designed to be run on a single node. Distributed processing of tasks can be managed outside of this (e.g. using a shared pool for WorkflowRunners).

## Storage Providers

You can create your own storage provider by implementing the `StorageProvider` interface at `durabletasks/storage/provider`.

## SQLite provider

`durabletasks/storage/sqlite`

Use a SQLite table for storage.

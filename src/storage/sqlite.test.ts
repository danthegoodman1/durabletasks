import { afterAll, beforeAll, describe } from "vitest"
import { SQLiteStorageProvider } from "./sqlite"
import BuildProviderTest from "./provider_test"
import sqlite3 from "sqlite3"
import { open } from "sqlite"
import { StorageProvider } from "./provider"
import fs from "fs"
import path from "path"

const TEST_DB_PATH = path.join(__dirname, "test_workflow.db")

describe("SQLiteStorageProvider", () => {
  const createSQLiteProvider = async (): Promise<StorageProvider> => {
    const db = await open({
      filename: TEST_DB_PATH,
      driver: sqlite3.Database,
    })
    return new SQLiteStorageProvider(db, {
      workflowsTable: "workflows",
      workflowTasksTable: "workflow_tasks",
    })
  }

  // Clean up the test database before and after all tests
  beforeAll(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH)
    }
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH)
    }
  })

  BuildProviderTest(createSQLiteProvider)
})

import { describe, expect, it } from "vitest";

import { COLLEGE_DATABASE_ID } from "@/lib/database/college-sample";
import type { DatabaseWorkerApi } from "@/lib/database/database-worker-client";
import { DatabaseManager } from "@/lib/database/database-manager";
import { IndexedDbDatabaseStore } from "@/lib/database/indexed-db-store";
import type {
  QueryResult,
  DatasetColumn,
  SerializedDatabase,
  SqlParameters,
  TableRecords,
  TableSchema,
  TableSummary,
  TableDataEdit,
  TableDefinition,
  EditableTableRecords,
} from "@/lib/database/types";

class FakeDatabaseWorker implements DatabaseWorkerApi {
  readonly databases = new Map<string, Uint8Array>();
  initializedWith: string[] = [];

  async initialize(databases: SerializedDatabase[]) {
    this.databases.clear();
    for (const database of databases) this.databases.set(database.id, database.bytes.slice());
    this.initializedWith = databases.map((database) => database.id);
    return { loadedDatabaseIds: this.initializedWith };
  }

  async createDatabase(databaseId: string) {
    this.databases.set(databaseId, new Uint8Array([0]));
  }

  async loadDatabase(databaseId: string, bytes: Uint8Array) {
    this.databases.set(databaseId, bytes.slice());
  }

  async dropDatabase(databaseId: string) {
    this.databases.delete(databaseId);
  }

  async importTable(databaseId: string, _tableName: string, _columns: DatasetColumn[], rows: import("@/lib/database/types").SqlValue[][]) {
    const current = this.databases.get(databaseId) ?? new Uint8Array();
    const next = new Uint8Array(current.byteLength + rows.length);
    next.set(current);
    this.databases.set(databaseId, next);
    return { rowCount: rows.length };
  }

  async createTable(databaseId: string, definition: TableDefinition) {
    const current = this.databases.get(databaseId) ?? new Uint8Array();
    const next = new Uint8Array(current.byteLength + 1);
    next.set(current);
    this.databases.set(databaseId, next);
    return { tableName: definition.name };
  }

  async getEditableTableRecords(): Promise<EditableTableRecords> {
    throw new Error("Not needed in database manager tests.");
  }

  async applyTableEdits(databaseId: string, _tableName: string, edits: TableDataEdit[]) {
    const current = this.databases.get(databaseId) ?? new Uint8Array();
    const next = new Uint8Array(current.byteLength + edits.length);
    next.set(current);
    this.databases.set(databaseId, next);
    return { changedRows: edits.length };
  }

  async listTables(): Promise<TableSummary[]> {
    return [];
  }

  async getTableSchema(): Promise<TableSchema> {
    throw new Error("Not needed in database manager tests.");
  }

  async getTableRecords(): Promise<TableRecords> {
    throw new Error("Not needed in database manager tests.");
  }

  async executeSql(
    databaseId: string,
    _sql: string,
    options?: { parameters?: SqlParameters; readOnly?: boolean },
  ): Promise<QueryResult> {
    if (!options?.readOnly) {
      const current = this.databases.get(databaseId) ?? new Uint8Array();
      const next = new Uint8Array(current.byteLength + 1);
      next.set(current);
      next[next.length - 1] = next.length;
      this.databases.set(databaseId, next);
    }
    return { columns: [], values: [], rowCount: 0, rowsAffected: 0, elapsedMs: 1 };
  }

  async exportDatabase(databaseId: string) {
    const bytes = this.databases.get(databaseId);
    if (!bytes) throw new Error("Unknown fake database.");
    return bytes.slice();
  }

  async close() {}
}

function createHarness(testName: string, ids: string[] = []) {
  const worker = new FakeDatabaseWorker();
  const persistence = new IndexedDbDatabaseStore(`queryquest-test-${testName}-${Date.now()}`);
  const manager = new DatabaseManager(worker, persistence, {
    now: () => new Date("2026-11-04T08:00:00.000Z"),
    createId: () => ids.shift() ?? "generated-database",
  });
  return { manager, persistence, worker };
}

describe("DatabaseManager", () => {
  it("initializes a persisted College sample when storage is empty", async () => {
    const { manager, persistence, worker } = createHarness("initialize");

    const snapshot = await manager.initialize();

    expect(snapshot.activeDatabaseId).toBe(COLLEGE_DATABASE_ID);
    expect(snapshot.databases).toEqual([
      expect.objectContaining({ id: COLLEGE_DATABASE_ID, name: "College", source: "sample" }),
    ]);
    expect(worker.databases.has(COLLEGE_DATABASE_ID)).toBe(true);
    expect(await persistence.getDatabase(COLLEGE_DATABASE_ID)).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({ name: "College" }),
        bytes: expect.any(Uint8Array),
      }),
    );
  });

  it("creates independent logical databases and switches the active database", async () => {
    const { manager, persistence } = createHarness("switching", ["research", "analytics"]);
    await manager.initialize();

    await manager.createDatabase("Research Lab");
    const afterSecondCreate = await manager.createDatabase("Analytics Sandbox");
    expect(afterSecondCreate.activeDatabaseId).toBe("analytics");
    expect(afterSecondCreate.databases.map((database) => database.id)).toEqual([
      COLLEGE_DATABASE_ID,
      "research",
      "analytics",
    ]);

    const switched = await manager.switchDatabase("research");
    expect(switched.activeDatabaseId).toBe("research");
    expect(await persistence.getActiveDatabaseId()).toBe("research");
  });

  it("restores databases and the active selection from IndexedDB", async () => {
    const databaseName = `queryquest-test-restore-${Date.now()}`;
    const persistence = new IndexedDbDatabaseStore(databaseName);
    const firstWorker = new FakeDatabaseWorker();
    const firstManager = new DatabaseManager(firstWorker, persistence, {
      createId: () => "restored-lab",
    });
    await firstManager.initialize();
    await firstManager.createDatabase("Restored Lab");

    const secondWorker = new FakeDatabaseWorker();
    const restoredManager = new DatabaseManager(
      secondWorker,
      new IndexedDbDatabaseStore(databaseName),
    );
    const restored = await restoredManager.initialize();

    expect(restored.activeDatabaseId).toBe("restored-lab");
    expect(restored.databases.map((database) => database.name)).toContain("Restored Lab");
    expect(secondWorker.initializedWith).toHaveLength(2);
    expect(secondWorker.initializedWith).toEqual(
      expect.arrayContaining([COLLEGE_DATABASE_ID, "restored-lab"]),
    );
  });

  it("persists a dataset import only after its table is created", async () => {
    const { manager, persistence } = createHarness("dataset-import", ["csv-database"]);
    await manager.initialize();
    const snapshot = await manager.createDatabaseFromDataset({
      databaseName: "Student scores",
      tableName: "scores",
      columns: [{ name: "student", type: "TEXT" }, { name: "score", type: "INTEGER" }],
      rows: [["Anika", 95], ["Mateo", 88]],
    });
    expect(snapshot.activeDatabaseId).toBe("csv-database");
    expect(snapshot.databases.at(-1)).toEqual(expect.objectContaining({ name: "Student scores", source: "import" }));
    expect(await persistence.getDatabase("csv-database")).toEqual(expect.objectContaining({ bytes: expect.any(Uint8Array) }));
  });
});

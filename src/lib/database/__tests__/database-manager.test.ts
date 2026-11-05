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
  TableMigrationInspection,
  TableSchemaMigrationInput,
} from "@/lib/database/types";
import type { ConvertedMySqlDump } from "@/lib/import/mysql-dump";

class FakeDatabaseWorker implements DatabaseWorkerApi {
  readonly databases = new Map<string, Uint8Array>();
  initializedWith: string[] = [];
  failOnSql: string | null = null;

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

  async inspectTableMigration(): Promise<TableMigrationInspection> {
    throw new Error("Not needed in database manager tests.");
  }

  async migrateTableSchema(databaseId: string, input: TableSchemaMigrationInput) {
    const current = this.databases.get(databaseId) ?? new Uint8Array();
    const next = new Uint8Array(current.byteLength + 1);
    next.set(current);
    this.databases.set(databaseId, next);
    return { tableName: input.definition.name, rowCount: 0, recreatedIndexes: 0, recreatedTriggers: 0 };
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
    sql: string,
    options?: { parameters?: SqlParameters; readOnly?: boolean },
  ): Promise<QueryResult> {
    if (this.failOnSql && sql.includes(this.failOnSql)) throw new Error("Simulated MySQL conversion failure");
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

class FailingDeletePersistence extends IndexedDbDatabaseStore {
  override async deleteDatabaseData() {
    throw new Error("Simulated storage failure");
  }
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

  it("renames database metadata and its persisted query history", async () => {
    const databaseName = `queryquest-test-rename-${Date.now()}`;
    const persistence = new IndexedDbDatabaseStore(databaseName);
    const manager = new DatabaseManager(new FakeDatabaseWorker(), persistence);
    await manager.initialize();
    await manager.executeUserQuery("SELECT 1");

    const renamed = await manager.renameDatabase(COLLEGE_DATABASE_ID, "University Lab");
    expect(renamed.databases[0].name).toBe("University Lab");
    expect((await manager.listQueryHistory())[0].databaseName).toBe("University Lab");

    const restored = new DatabaseManager(new FakeDatabaseWorker(), new IndexedDbDatabaseStore(databaseName));
    expect((await restored.initialize()).databases[0].name).toBe("University Lab");
  });

  it("deletes only the requested database and all associated persisted state", async () => {
    const databaseName = `queryquest-test-delete-${Date.now()}`;
    const persistence = new IndexedDbDatabaseStore(databaseName);
    const worker = new FakeDatabaseWorker();
    const manager = new DatabaseManager(worker, persistence, { createId: () => "research" });
    await manager.initialize();
    await manager.createDatabase("Research");
    await manager.saveDiagramPositions({ Notes: { x: 120, y: 240 } });
    await manager.executeUserQuery("INSERT INTO Notes VALUES (1)");
    await manager.executeUserQuery("SELECT 1");
    expect(await persistence.getCheckpointState("research")).not.toBeNull();

    const afterDelete = await manager.deleteDatabase("research");
    expect(afterDelete.activeDatabaseId).toBe(COLLEGE_DATABASE_ID);
    expect(afterDelete.databases.map((database) => database.id)).toEqual([COLLEGE_DATABASE_ID]);
    expect(worker.databases.has("research")).toBe(false);
    expect(await persistence.getDatabase("research")).toBeNull();
    expect(await persistence.getCheckpointState("research")).toBeNull();
    expect(await persistence.getDiagramPositions("research")).toEqual({});
    expect((await persistence.getQueryHistory()).some((entry) => entry.databaseId === "research")).toBe(false);

    const restoredWorker = new FakeDatabaseWorker();
    const restored = new DatabaseManager(restoredWorker, new IndexedDbDatabaseStore(databaseName));
    const restoredSnapshot = await restored.initialize();
    expect(restoredSnapshot.databases.map((database) => database.id)).toEqual([COLLEGE_DATABASE_ID]);

    await restored.deleteDatabase(COLLEGE_DATABASE_ID);
    const emptyWorker = new FakeDatabaseWorker();
    const emptyReload = new DatabaseManager(emptyWorker, new IndexedDbDatabaseStore(databaseName));
    const emptySnapshot = await emptyReload.initialize();
    expect(emptySnapshot).toEqual(expect.objectContaining({ databases: [], activeDatabaseId: null, activeWorkspaceId: "workspace-default" }));
    expect(emptyWorker.initializedWith).toEqual([]);
  });

  it("restores the worker database when persistent deletion fails", async () => {
    const worker = new FakeDatabaseWorker();
    const persistence = new FailingDeletePersistence(`queryquest-test-delete-failure-${Date.now()}`);
    const manager = new DatabaseManager(worker, persistence);
    await manager.initialize();

    await expect(manager.deleteDatabase(COLLEGE_DATABASE_ID)).rejects.toThrow("Simulated storage failure");
    expect(worker.databases.has(COLLEGE_DATABASE_ID)).toBe(true);
    expect(manager.getSnapshot().databases.map((database) => database.id)).toEqual([COLLEGE_DATABASE_ID]);
    expect(await persistence.getDatabase(COLLEGE_DATABASE_ID)).not.toBeNull();
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

  it("persists checkpoints across refresh and restores real database bytes", async () => {
    const databaseName = `queryquest-test-checkpoints-${Date.now()}`;
    const persistence = new IndexedDbDatabaseStore(databaseName);
    const firstWorker = new FakeDatabaseWorker();
    const firstManager = new DatabaseManager(firstWorker, persistence);
    await firstManager.initialize();
    const initialLength = firstWorker.databases.get(COLLEGE_DATABASE_ID)!.byteLength;
    await firstManager.executeUserQuery("INSERT INTO Students VALUES (1)");
    expect(firstWorker.databases.get(COLLEGE_DATABASE_ID)!.byteLength).toBe(initialLength + 1);
    expect(await firstManager.getCheckpointStatus()).toEqual({ canUndo: true, canRedo: false });

    const refreshedWorker = new FakeDatabaseWorker();
    const refreshed = new DatabaseManager(refreshedWorker, new IndexedDbDatabaseStore(databaseName));
    await refreshed.initialize();
    await refreshed.undo();
    expect(refreshedWorker.databases.get(COLLEGE_DATABASE_ID)!.byteLength).toBe(initialLength);
    expect(await refreshed.getCheckpointStatus()).toEqual({ canUndo: false, canRedo: true });
  });

  it("previews a visualized mutation in an isolated database before checkpointed execution", async () => {
    const { manager, worker } = createHarness("visualization-preview", ["preview-copy"]);
    await manager.initialize();
    const beforeLength = worker.databases.get(COLLEGE_DATABASE_ID)!.byteLength;

    const preview = await manager.previewMutation({
      sql: "UPDATE Students SET year_level = 4 WHERE id = 1001",
      beforeQueries: ["SELECT * FROM Students"],
      afterQueries: ["SELECT * FROM Students"],
    });

    expect(preview.before).toHaveLength(1);
    expect(preview.after).toHaveLength(1);
    expect(worker.databases.get(COLLEGE_DATABASE_ID)!.byteLength).toBe(beforeLength);
    expect(worker.databases.has("visualization-preview-preview-copy")).toBe(false);

    await manager.executeUserQuery("UPDATE Students SET year_level = 4 WHERE id = 1001");
    expect(worker.databases.get(COLLEGE_DATABASE_ID)!.byteLength).toBe(beforeLength + 1);
    expect(await manager.getCheckpointStatus()).toEqual({ canUndo: true, canRedo: false });
  });

  it("invalidates redo after a new modification and resets to the initial checkpoint", async () => {
    const { manager, worker } = createHarness("branching-history");
    await manager.initialize();
    const initialLength = worker.databases.get(COLLEGE_DATABASE_ID)!.byteLength;
    await manager.executeUserQuery("INSERT INTO Students VALUES (1)");
    await manager.undo();
    await manager.executeUserQuery("CREATE TABLE Notes (id INTEGER)");
    expect(await manager.getCheckpointStatus()).toEqual({ canUndo: true, canRedo: false });
    await manager.resetDatabase();
    expect(worker.databases.get(COLLEGE_DATABASE_ID)!.byteLength).toBe(initialLength);
  });

  it("checkpoints and persists a visual schema migration", async () => {
    const { manager, worker } = createHarness("schema-migration");
    await manager.initialize();
    const before = worker.databases.get(COLLEGE_DATABASE_ID)!.byteLength;
    await manager.saveDiagramPositions({ Students: { x: 420, y: 180 } });
    await manager.migrateTableSchema({
      sourceTableName: "Students",
      definition: {
        name: "Learners",
        columns: [{ name: "id", type: "INTEGER", primaryKey: true, notNull: false, unique: false, hasDefault: false, defaultValue: null }],
      },
      columnMappings: [{ sourceColumn: "id", targetColumn: "id" }],
    });
    expect(worker.databases.get(COLLEGE_DATABASE_ID)!.byteLength).toBe(before + 1);
    expect(await manager.getCheckpointStatus()).toEqual({ canUndo: true, canRedo: false });
    expect(await manager.getDiagramPositions()).toEqual({ Learners: { x: 420, y: 180 } });
    await manager.undo();
    expect(worker.databases.get(COLLEGE_DATABASE_ID)!.byteLength).toBe(before);
  });

  it("persists diagram positions per database across manager reloads", async () => {
    const databaseName = `queryquest-test-diagram-layout-${Date.now()}`;
    const first = new DatabaseManager(new FakeDatabaseWorker(), new IndexedDbDatabaseStore(databaseName));
    await first.initialize();
    await first.saveDiagramPositions({ Students: { x: 128, y: 384 }, Courses: { x: 640, y: 96 } });

    const restored = new DatabaseManager(new FakeDatabaseWorker(), new IndexedDbDatabaseStore(databaseName));
    await restored.initialize();
    expect(await restored.getDiagramPositions()).toEqual({ Students: { x: 128, y: 384 }, Courses: { x: 640, y: 96 } });
  });

  it("persists query history entries across manager reloads", async () => {
    const databaseName = `queryquest-test-history-${Date.now()}`;
    const persistence = new IndexedDbDatabaseStore(databaseName);
    const manager = new DatabaseManager(new FakeDatabaseWorker(), persistence);
    await manager.initialize();
    await manager.executeUserQuery("SELECT 1");
    await expect(manager.executeUserQuery("UNSUPPORTED THING")).rejects.toThrow();

    const refreshed = new DatabaseManager(new FakeDatabaseWorker(), new IndexedDbDatabaseStore(databaseName));
    await refreshed.initialize();
    const history = await refreshed.listQueryHistory();
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({ sql: "SELECT 1", status: "success", databaseName: "College" }),
      expect.objectContaining({ sql: "UNSUPPORTED THING", status: "error" }),
    ]));
  });

  it("isolates databases by workspace and restores the last opened workspace", async () => {
    const databaseName = `queryquest-test-workspaces-${Date.now()}`;
    const first = new DatabaseManager(new FakeDatabaseWorker(), new IndexedDbDatabaseStore(databaseName), {
      createId: (() => { const ids = ["research", "lab-db"]; return () => ids.shift() ?? "fallback"; })(),
    });
    await first.initialize();
    const created = await first.createWorkspace("Research Lab");
    expect(created.activeWorkspaceId).toBe("workspace-research");
    expect(created.databases).toEqual([]);
    await first.createDatabase("Lab Notes");

    const restoredWorker = new FakeDatabaseWorker();
    const restored = new DatabaseManager(restoredWorker, new IndexedDbDatabaseStore(databaseName));
    const snapshot = await restored.initialize();
    expect(snapshot.activeWorkspaceId).toBe("workspace-research");
    expect(snapshot.databases.map((database) => database.name)).toEqual(["Lab Notes"]);
    expect(restoredWorker.initializedWith).toEqual(["lab-db"]);

    const defaultWorkspace = snapshot.workspaces.find((workspace) => workspace.id === "workspace-default")!;
    const switched = await restored.switchWorkspace(defaultWorkspace.id);
    expect(switched.databases.map((database) => database.name)).toEqual(["College"]);
    expect(restoredWorker.initializedWith).toEqual([COLLEGE_DATABASE_ID]);
  });

  it("exports complete workspace bytes and atomically restores saved workspace data", async () => {
    const databaseName = `queryquest-test-workspace-export-${Date.now()}`;
    const ids = ["course-space", "course-db", "saved-query", "import-preview"];
    const manager = new DatabaseManager(new FakeDatabaseWorker(), new IndexedDbDatabaseStore(databaseName), {
      createId: () => ids.shift() ?? "fallback",
    });
    await manager.initialize();
    await manager.createWorkspace("Course Demo");
    await manager.createDatabase("Lesson Data");
    await manager.executeUserQuery("CREATE TABLE Demo (id INTEGER)");
    await manager.saveQuery("Demo rows", "SELECT * FROM Demo;");
    await manager.saveWorkspaceSettings({ editorSql: "SELECT * FROM Demo;", activePanel: "history", explorerCollapsed: true });
    const before = await manager.exportDatabaseFile("course-db");
    const portable = await manager.exportWorkspace();

    expect(portable.format).toBe("queryquest-workspace");
    expect(portable.databases).toHaveLength(1);
    expect(portable.savedQueries[0]).toEqual(expect.objectContaining({ name: "Demo rows" }));
    expect(portable.queryHistory[0]).toEqual(expect.objectContaining({ sql: "CREATE TABLE Demo (id INTEGER)" }));

    await manager.deleteWorkspace(portable.workspace.id);
    expect(manager.getSnapshot().activeWorkspaceId).toBe("workspace-default");
    const restored = await manager.importWorkspace(portable);
    expect(restored.activeWorkspaceId).toBe(portable.workspace.id);
    expect(restored.workspaceSettings).toEqual({ editorSql: "SELECT * FROM Demo;", activePanel: "history", explorerCollapsed: true });
    expect((await manager.exportDatabaseFile("course-db")).bytes).toEqual(before.bytes);
    expect(await manager.listSavedQueries()).toEqual([expect.objectContaining({ name: "Demo rows", sql: "SELECT * FROM Demo;" })]);
    expect(await manager.listQueryHistory()).toEqual([expect.objectContaining({ sql: "CREATE TABLE Demo (id INTEGER)" })]);
  });

  it("persists converted MySQL dumps only after every generated statement succeeds", async () => {
    const { manager, persistence } = createHarness("mysql-import", ["mysql-college"]);
    await manager.initialize();
    const dump: ConvertedMySqlDump = {
      dialect: "mysql",
      statementCount: 2,
      tables: [{
        name: "Students",
        createSql: 'CREATE TABLE "Students" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL)',
        columns: [
          { name: "id", mysqlType: "INT", sqliteType: "INTEGER", notNull: true, primaryKey: true, autoIncrement: true },
          { name: "name", mysqlType: "VARCHAR(100)", sqliteType: "TEXT", notNull: true, primaryKey: false, autoIncrement: false },
        ],
        rowCount: 1,
        previewRows: [[1, "Ada"]],
        indexes: [],
      }],
      insertBatches: [{ tableName: "Students", columns: ["id", "name"], rows: [[1, "Ada"]] }],
      indexSql: [],
      issues: [],
    };

    const imported = await manager.importMySqlDump("MySQL College", dump);
    expect(imported.activeDatabaseId).toBe("mysql-college");
    expect(imported.databases).toContainEqual(expect.objectContaining({ id: "mysql-college", name: "MySQL College", source: "import" }));
    expect(await persistence.getDatabase("mysql-college")).not.toBeNull();

    const failedWorker = new FakeDatabaseWorker();
    const failedPersistence = new IndexedDbDatabaseStore(`queryquest-test-mysql-failure-${Date.now()}`);
    const failedManager = new DatabaseManager(failedWorker, failedPersistence, { createId: () => "failed-mysql" });
    await failedManager.initialize();
    failedWorker.failOnSql = "CREATE TABLE";
    await expect(failedManager.importMySqlDump("Broken dump", dump)).rejects.toThrow(/failed atomically/i);
    expect(failedWorker.databases.has("failed-mysql")).toBe(false);
    expect(await failedPersistence.getDatabase("failed-mysql")).toBeNull();
  });
});

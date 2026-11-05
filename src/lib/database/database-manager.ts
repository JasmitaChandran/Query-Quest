import { COLLEGE_DATABASE_ID, COLLEGE_SAMPLE_SQL } from "@/lib/database/college-sample";
import {
  BrowserDatabaseWorkerClient,
  type DatabaseWorkerApi,
} from "@/lib/database/database-worker-client";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  IndexedDbDatabaseStore,
  type DatabasePersistence,
} from "@/lib/database/indexed-db-store";
import type {
  DatabaseManagerSnapshot,
  DatabaseImportPreview,
  DatabaseCheckpointState,
  DatabaseSnapshot,
  DatabaseMetadata,
  DatabaseSource,
  DatasetColumn,
  DiagramPositions,
  SqlParameters,
  SqlValue,
  TableDataEdit,
  TableDefinition,
  TableSchemaMigrationInput,
  QueryHistoryEntry,
  PortableWorkspaceFile,
  SavedQuery,
  UserQueryExecution,
  WorkspaceMetadata,
  WorkspaceSettings,
} from "@/lib/database/types";
import {
  base64ToBytes,
  bytesToBase64,
  DEFAULT_WORKSPACE_ID,
  WORKSPACE_FORMAT,
  WORKSPACE_FORMAT_VERSION,
} from "@/lib/database/workspace-format";
import { classifyUserSql } from "@/lib/database/sql-safety";
import { assertReadOnlyQuery } from "@/lib/database/read-only-sql";
import { quoteIdentifier, validateIdentifier } from "@/lib/database/visual-sql";
import { canImportMySqlDump, type ConvertedMySqlDump } from "@/lib/import/mysql-dump";

const MAX_SNAPSHOTS = 20;
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;

function quotePortableIdentifier(value: string) {
  if (!value || value.includes("\0")) throw new Error("An imported identifier is invalid.");
  return `"${value.replaceAll('"', '""')}"`;
}

type DatabaseManagerOptions = {
  now?: () => Date;
  createId?: () => string;
};

export class DatabaseManager {
  private workspaces: WorkspaceMetadata[] = [];
  private activeWorkspaceId = DEFAULT_WORKSPACE_ID;
  private workspaceSettings: WorkspaceSettings = DEFAULT_WORKSPACE_SETTINGS;
  private databases: DatabaseMetadata[] = [];
  private activeDatabaseId: string | null = null;
  private initializePromise: Promise<DatabaseManagerSnapshot> | null = null;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly worker: DatabaseWorkerApi,
    private readonly persistence: DatabasePersistence,
    options: DatabaseManagerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId =
      options.createId ??
      (() =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `database-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }

  initialize() {
    if (!this.initializePromise) this.initializePromise = this.initializeInternal();
    return this.initializePromise;
  }

  private async initializeInternal() {
    this.workspaces = await this.persistence.getWorkspaces();
    if (this.workspaces.length === 0) {
      const timestamp = this.now().toISOString();
      const workspace = { id: DEFAULT_WORKSPACE_ID, name: "My Workspace", createdAt: timestamp, updatedAt: timestamp };
      await this.persistence.putWorkspace(workspace);
      this.workspaces = [workspace];
    }
    const savedWorkspaceId = await this.persistence.getActiveWorkspaceId();
    this.activeWorkspaceId = this.workspaces.some((workspace) => workspace.id === savedWorkspaceId)
      ? savedWorkspaceId!
      : this.workspaces[0].id;
    this.workspaceSettings = await this.persistence.getWorkspaceSettings(this.activeWorkspaceId);
    const persistedDatabases = await this.persistence.getAllDatabases(this.activeWorkspaceId);
    const previouslyInitialized = await this.persistence.getInitialized();
    await this.worker.initialize(
      persistedDatabases.map((database) => ({
        id: database.metadata.id,
        bytes: database.bytes,
      })),
    );
    this.databases = persistedDatabases.map((database) => database.metadata);
    await Promise.all(persistedDatabases.map((database) => this.ensureCheckpointState(database.metadata.id, database.bytes)));

    if (this.activeWorkspaceId === DEFAULT_WORKSPACE_ID && this.databases.length === 0 && !previouslyInitialized) await this.createCollegeSample();

    const savedActiveId = await this.persistence.getActiveDatabaseId(this.activeWorkspaceId);
    this.activeDatabaseId = this.databases.some((database) => database.id === savedActiveId)
      ? savedActiveId
      : this.databases[0]?.id ?? null;
    await this.persistence.setActiveDatabaseId(this.activeDatabaseId, this.activeWorkspaceId);
    await this.persistence.setActiveWorkspaceId(this.activeWorkspaceId);
    await this.persistence.markInitialized();

    return this.getSnapshot();
  }

  getSnapshot(): DatabaseManagerSnapshot {
    return {
      workspaces: [...this.workspaces],
      activeWorkspaceId: this.activeWorkspaceId,
      workspaceSettings: { ...this.workspaceSettings },
      databases: [...this.databases],
      activeDatabaseId: this.activeDatabaseId,
    };
  }

  async switchDatabase(databaseId: string) {
    await this.initialize();
    if (!this.databases.some((database) => database.id === databaseId)) {
      throw new Error("The selected database is not available.");
    }
    this.activeDatabaseId = databaseId;
    await this.persistence.setActiveDatabaseId(databaseId, this.activeWorkspaceId);
    return this.getSnapshot();
  }

  async createWorkspace(name: string) {
    await this.initialize();
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Enter a name for the workspace.");
    const timestamp = this.now().toISOString();
    const workspace: WorkspaceMetadata = {
      id: `workspace-${this.createId()}`,
      name: cleanName,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.persistence.putWorkspace(workspace);
    this.workspaces = [...this.workspaces, workspace];
    return this.switchWorkspace(workspace.id);
  }

  async switchWorkspace(workspaceId: string) {
    await this.initialize();
    if (!this.workspaces.some((workspace) => workspace.id === workspaceId)) throw new Error("The selected workspace is not available.");
    const persisted = await this.persistence.getAllDatabases(workspaceId);
    await this.worker.initialize(persisted.map((database) => ({ id: database.metadata.id, bytes: database.bytes })));
    this.activeWorkspaceId = workspaceId;
    this.databases = persisted.map((database) => database.metadata);
    this.workspaceSettings = await this.persistence.getWorkspaceSettings(workspaceId);
    const savedActiveId = await this.persistence.getActiveDatabaseId(workspaceId);
    this.activeDatabaseId = this.databases.some((database) => database.id === savedActiveId) ? savedActiveId : this.databases[0]?.id ?? null;
    await Promise.all([
      ...persisted.map((database) => this.ensureCheckpointState(database.metadata.id, database.bytes)),
      this.persistence.setActiveWorkspaceId(workspaceId),
      this.persistence.setActiveDatabaseId(this.activeDatabaseId, workspaceId),
    ]);
    return this.getSnapshot();
  }

  async renameWorkspace(workspaceId: string, name: string) {
    await this.initialize();
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Enter a name for the workspace.");
    const current = this.workspaces.find((workspace) => workspace.id === workspaceId);
    if (!current) throw new Error("The workspace to rename is no longer available.");
    const workspace = { ...current, name: cleanName, updatedAt: this.now().toISOString() };
    await this.persistence.putWorkspace(workspace);
    this.workspaces = this.workspaces.map((item) => item.id === workspaceId ? workspace : item);
    return this.getSnapshot();
  }

  async deleteWorkspace(workspaceId: string) {
    await this.initialize();
    const target = this.workspaces.find((workspace) => workspace.id === workspaceId);
    if (!target) throw new Error("The workspace to delete is no longer available.");
    let remaining = this.workspaces.filter((workspace) => workspace.id !== workspaceId);
    if (remaining.length === 0) {
      const timestamp = this.now().toISOString();
      const replacement: WorkspaceMetadata = { id: `workspace-${this.createId()}`, name: "My Workspace", createdAt: timestamp, updatedAt: timestamp };
      await this.persistence.putWorkspace(replacement);
      remaining = [replacement];
    }
    const nextWorkspaceId = this.activeWorkspaceId === workspaceId ? remaining[0].id : this.activeWorkspaceId;
    await this.persistence.deleteWorkspaceData(workspaceId, nextWorkspaceId);
    this.workspaces = remaining;
    if (this.activeWorkspaceId === workspaceId) return this.switchWorkspace(nextWorkspaceId);
    return this.getSnapshot();
  }

  async saveWorkspaceSettings(settings: WorkspaceSettings) {
    await this.initialize();
    this.workspaceSettings = { ...settings };
    await this.persistence.putWorkspaceSettings(this.activeWorkspaceId, settings);
    const timestamp = this.now().toISOString();
    this.workspaces = this.workspaces.map((workspace) => workspace.id === this.activeWorkspaceId ? { ...workspace, updatedAt: timestamp } : workspace);
    return this.getSnapshot();
  }

  async listSavedQueries() {
    await this.initialize();
    return this.persistence.getSavedQueries(this.activeWorkspaceId);
  }

  async saveQuery(name: string, sql: string, queryId?: string) {
    await this.initialize();
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Enter a name for the saved query.");
    if (!sql.trim()) throw new Error("There is no SQL to save.");
    const existing = queryId ? (await this.persistence.getSavedQueries(this.activeWorkspaceId)).find((query) => query.id === queryId) : undefined;
    const timestamp = this.now().toISOString();
    const query: SavedQuery = {
      id: existing?.id ?? `query-${this.activeWorkspaceId}-${this.createId()}`,
      workspaceId: this.activeWorkspaceId,
      name: cleanName,
      sql,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await this.persistence.putSavedQuery(query);
    return query;
  }

  async deleteSavedQuery(queryId: string) {
    await this.initialize();
    const query = (await this.persistence.getSavedQueries(this.activeWorkspaceId)).find((item) => item.id === queryId);
    if (!query) throw new Error("The saved query is no longer available.");
    await this.persistence.deleteSavedQuery(queryId);
  }

  async exportDatabaseFile(databaseId: string) {
    await this.initialize();
    const metadata = this.databases.find((database) => database.id === databaseId);
    if (!metadata) throw new Error("The database is not available in this workspace.");
    return { metadata, bytes: await this.worker.exportDatabase(databaseId) };
  }

  async getWorkspaceStorageUsage() {
    await this.initialize();
    return this.persistence.getWorkspaceStorageUsage(this.activeWorkspaceId);
  }

  async exportWorkspace(): Promise<PortableWorkspaceFile> {
    await this.initialize();
    const workspace = this.workspaces.find((item) => item.id === this.activeWorkspaceId);
    if (!workspace) throw new Error("The active workspace is unavailable.");
    const databases = await Promise.all(this.databases.map(async (metadata) => ({
      metadata,
      sqliteBase64: bytesToBase64(await this.worker.exportDatabase(metadata.id)),
      diagramPositions: await this.persistence.getDiagramPositions(metadata.id),
    })));
    return {
      format: WORKSPACE_FORMAT,
      version: WORKSPACE_FORMAT_VERSION,
      exportedAt: this.now().toISOString(),
      workspace,
      settings: this.workspaceSettings,
      activeDatabaseId: this.activeDatabaseId,
      databases,
      savedQueries: await this.persistence.getSavedQueries(this.activeWorkspaceId),
      queryHistory: await this.persistence.getQueryHistory(this.activeWorkspaceId),
    };
  }

  async importWorkspace(portable: PortableWorkspaceFile, overwrite = false) {
    await this.initialize();
    const existingWorkspace = this.workspaces.find((workspace) => workspace.id === portable.workspace.id);
    if (existingWorkspace && !overwrite) throw new Error(`A workspace named “${existingWorkspace.name}” already exists. Confirm replacement to continue.`);
    const workspaceId = portable.workspace.id;
    const idMap = new Map<string, string>();
    for (const item of portable.databases) {
      const existingDatabase = await this.persistence.getDatabase(item.metadata.id);
      const id = existingDatabase && existingDatabase.metadata.workspaceId !== workspaceId ? `${item.metadata.id}-${this.createId()}` : item.metadata.id;
      idMap.set(item.metadata.id, id);
    }
    const databases = [];
    for (const item of portable.databases) {
      const bytes = base64ToBytes(item.sqliteBase64);
      const id = idMap.get(item.metadata.id)!;
      const previewId = `workspace-import-${this.createId()}`;
      await this.worker.loadDatabase(previewId, bytes);
      try { await this.worker.listTables(previewId); }
      finally { await this.worker.dropDatabase(previewId).catch(() => undefined); }
      const metadata = { ...item.metadata, id, workspaceId, sizeBytes: bytes.byteLength };
      databases.push({
        database: { metadata, bytes },
        checkpoint: this.newCheckpointState(id, bytes, "Imported workspace database"),
        diagramPositions: item.diagramPositions ?? {},
      });
    }
    const activeDatabaseId = portable.activeDatabaseId ? idMap.get(portable.activeDatabaseId) ?? null : null;
    const bundle = {
      workspace: { ...portable.workspace, updatedAt: this.now().toISOString() },
      settings: { ...DEFAULT_WORKSPACE_SETTINGS, ...portable.settings },
      activeDatabaseId,
      databases,
      savedQueries: portable.savedQueries.map((query) => ({ ...query, id: `query-${workspaceId}-${query.id}`, workspaceId })),
      queryHistory: portable.queryHistory.map((entry) => ({ ...entry, id: `history-${workspaceId}-${entry.id}`, workspaceId, databaseId: idMap.get(entry.databaseId) ?? entry.databaseId })),
    };
    await this.persistence.putWorkspaceBundle(bundle, overwrite);
    this.workspaces = existingWorkspace
      ? this.workspaces.map((workspace) => workspace.id === workspaceId ? bundle.workspace : workspace)
      : [...this.workspaces, bundle.workspace];
    return this.switchWorkspace(workspaceId);
  }

  async createDatabase(name: string) {
    await this.initialize();
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Enter a name for the database.");

    const databaseId = this.createId();
    await this.worker.createDatabase(databaseId);
    return this.persistNewDatabase(databaseId, cleanName, "created");
  }

  async renameDatabase(databaseId: string, name: string) {
    await this.initialize();
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Enter a name for the database.");
    const current = this.databases.find((database) => database.id === databaseId);
    if (!current) throw new Error("The database to rename is no longer available.");
    if (current.name === cleanName) return this.getSnapshot();
    const bytes = await this.worker.exportDatabase(databaseId);
    const metadata = { ...current, name: cleanName, updatedAt: this.now().toISOString() };
    await this.persistence.renameDatabaseData({ metadata, bytes });
    this.databases = this.databases.map((database) => database.id === databaseId ? metadata : database);
    return this.getSnapshot();
  }

  async deleteDatabase(databaseId: string) {
    await this.initialize();
    const target = this.databases.find((database) => database.id === databaseId);
    if (!target) throw new Error("The database to delete is no longer available.");
    const remaining = this.databases.filter((database) => database.id !== databaseId);
    const nextActiveDatabaseId = this.activeDatabaseId === databaseId
      ? remaining[0]?.id ?? null
      : this.activeDatabaseId;
    const backup = await this.worker.exportDatabase(databaseId);
    await this.worker.dropDatabase(databaseId);
    try {
      await this.persistence.deleteDatabaseData(databaseId, nextActiveDatabaseId, this.activeWorkspaceId);
    } catch (error) {
      await this.worker.loadDatabase(databaseId, backup).catch(() => undefined);
      throw error;
    }
    this.databases = remaining;
    this.activeDatabaseId = nextActiveDatabaseId;
    return this.getSnapshot();
  }

  async loadDatabase(input: { name: string; bytes: Uint8Array }) {
    await this.initialize();
    const databaseId = this.createId();
    const name = input.name.trim() || "Imported database";

    try {
      await this.worker.loadDatabase(databaseId, input.bytes);
      await this.worker.listTables(databaseId);
      return await this.persistNewDatabase(databaseId, name, "import");
    } catch (error) {
      await this.worker.dropDatabase(databaseId).catch(() => undefined);
      throw new Error(
        error instanceof Error
          ? `Could not import this database: ${error.message}`
          : "Could not import this database.",
      );
    }
  }

  async importMySqlDump(name: string, dump: ConvertedMySqlDump) {
    await this.initialize();
    const databaseName = name.trim();
    if (!databaseName) throw new Error("Enter a database name.");
    if (!canImportMySqlDump(dump)) throw new Error("Resolve the reported MySQL conversion errors before importing.");
    const databaseId = this.createId();
    await this.worker.createDatabase(databaseId);
    try {
      await this.worker.executeSql(databaseId, "PRAGMA foreign_keys = OFF", { readOnly: false });
      await this.worker.executeSql(databaseId, "BEGIN IMMEDIATE", { readOnly: false });
      for (const table of dump.tables) await this.worker.executeSql(databaseId, table.createSql, { readOnly: false });
      for (const batch of dump.insertBatches) {
        const chunkSize = Math.max(1, Math.floor(500 / Math.max(1, batch.columns.length)));
        for (let offset = 0; offset < batch.rows.length; offset += chunkSize) {
          const rows = batch.rows.slice(offset, offset + chunkSize);
          const placeholders = rows.map(() => `(${batch.columns.map(() => "?").join(", ")})`).join(", ");
          const columns = batch.columns.map(quotePortableIdentifier).join(", ");
          const sql = `INSERT INTO ${quotePortableIdentifier(batch.tableName)} (${columns}) VALUES ${placeholders}`;
          await this.worker.executeSql(databaseId, sql, { parameters: rows.flat(), readOnly: false });
        }
      }
      for (const sql of dump.indexSql) await this.worker.executeSql(databaseId, sql, { readOnly: false });
      const foreignKeyCheck = await this.worker.executeSql(databaseId, "PRAGMA foreign_key_check", { readOnly: false });
      if (foreignKeyCheck.rowCount > 0) {
        const first = foreignKeyCheck.values[0];
        throw new Error(`Foreign key validation failed for table “${String(first?.[0] ?? "unknown")}” at row ${String(first?.[1] ?? "unknown")}.`);
      }
      await this.worker.executeSql(databaseId, "COMMIT", { readOnly: false });
      await this.worker.executeSql(databaseId, "PRAGMA foreign_keys = ON", { readOnly: false });
      return await this.persistNewDatabase(databaseId, databaseName, "import");
    } catch (error) {
      await this.worker.executeSql(databaseId, "ROLLBACK", { readOnly: false }).catch(() => undefined);
      await this.worker.dropDatabase(databaseId).catch(() => undefined);
      throw new Error(error instanceof Error ? `MySQL import failed atomically: ${error.message}` : "MySQL import failed atomically.");
    }
  }

  async inspectSqliteDatabase(bytes: Uint8Array): Promise<DatabaseImportPreview> {
    await this.initialize();
    const previewId = `preview-${this.createId()}`;
    await this.worker.loadDatabase(previewId, bytes);
    try {
      const tables = await this.worker.listTables(previewId);
      const previewTables = await Promise.all(
        tables.map(async (summary) => {
          const [schema, records] = await Promise.all([
            this.worker.getTableSchema(previewId, summary.name),
            this.worker.getTableRecords(previewId, summary.name, 5, 0),
          ]);
          return { summary, schema, records };
        }),
      );
      return { tables: previewTables };
    } finally {
      await this.worker.dropDatabase(previewId);
    }
  }

  async createDatabaseFromDataset(input: {
    databaseName: string;
    tableName: string;
    columns: DatasetColumn[];
    rows: SqlValue[][];
  }) {
    await this.initialize();
    const databaseName = input.databaseName.trim();
    const tableName = input.tableName.trim();
    if (!databaseName) throw new Error("Enter a database name.");
    if (!tableName) throw new Error("Enter a table name.");

    const databaseId = this.createId();
    await this.worker.createDatabase(databaseId);
    try {
      await this.worker.importTable(databaseId, tableName, input.columns, input.rows);
      return await this.persistNewDatabase(databaseId, databaseName, "import");
    } catch (error) {
      await this.worker.dropDatabase(databaseId).catch(() => undefined);
      throw new Error(
        error instanceof Error
          ? `Could not import this dataset: ${error.message}`
          : "Could not import this dataset.",
      );
    }
  }

  async listTables(databaseId?: string) {
    await this.initialize();
    return this.worker.listTables(databaseId ?? this.requireActiveDatabaseId());
  }

  async readTableSchema(tableName: string, databaseId?: string) {
    await this.initialize();
    return this.worker.getTableSchema(databaseId ?? this.requireActiveDatabaseId(), tableName);
  }

  async readTableRecords(
    tableName: string,
    options: { databaseId?: string; limit?: number; offset?: number } = {},
  ) {
    await this.initialize();
    return this.worker.getTableRecords(
      options.databaseId ?? this.requireActiveDatabaseId(),
      tableName,
      options.limit,
      options.offset,
    );
  }

  async readEditableTableRecords(tableName: string, databaseId?: string) {
    await this.initialize();
    return this.worker.getEditableTableRecords(databaseId ?? this.requireActiveDatabaseId(), tableName);
  }

  async createTable(definition: TableDefinition, databaseId?: string) {
    await this.initialize();
    const id = databaseId ?? this.requireActiveDatabaseId();
    return this.commitMutation(id, `CREATE TABLE ${definition.name}`, () => this.worker.createTable(id, definition));
  }

  async inspectTableMigration(tableName: string, databaseId?: string) {
    await this.initialize();
    const id = databaseId ?? this.requireActiveDatabaseId();
    return this.worker.inspectTableMigration(id, tableName);
  }

  async migrateTableSchema(input: TableSchemaMigrationInput, databaseId?: string) {
    await this.initialize();
    const id = databaseId ?? this.requireActiveDatabaseId();
    const result = await this.commitMutation(id, `Edit schema for ${input.sourceTableName}`, () => this.worker.migrateTableSchema(id, input));
    if (input.sourceTableName !== input.definition.name) {
      const positions: DiagramPositions = await this.persistence.getDiagramPositions(id).catch(() => ({}));
      const position = positions[input.sourceTableName];
      if (position) {
        const next = { ...positions, [input.definition.name]: position };
        delete next[input.sourceTableName];
        await this.persistence.putDiagramPositions(id, next).catch(() => undefined);
      }
    }
    return result;
  }

  async getDiagramPositions(databaseId?: string) {
    await this.initialize();
    return this.persistence.getDiagramPositions(databaseId ?? this.requireActiveDatabaseId());
  }

  async saveDiagramPositions(positions: DiagramPositions, databaseId?: string) {
    await this.initialize();
    return this.persistence.putDiagramPositions(databaseId ?? this.requireActiveDatabaseId(), positions);
  }

  async applyTableEdits(tableName: string, edits: TableDataEdit[], databaseId?: string) {
    await this.initialize();
    const id = databaseId ?? this.requireActiveDatabaseId();
    return this.commitMutation(id, `Visual edits to ${tableName}`, () => this.worker.applyTableEdits(id, tableName, edits));
  }

  async executeUserQuery(sql: string): Promise<UserQueryExecution> {
    await this.initialize();
    const databaseId = this.requireActiveDatabaseId();
    const databaseName = this.databases.find((database) => database.id === databaseId)?.name ?? "Database";
    let operation: "read" | "write" = /^\s*(SELECT|WITH|EXPLAIN)\b/i.test(sql) ? "read" : "write";
    const startedAt = performance.now();
    try {
      operation = classifyUserSql(sql);
      const result = operation === "read"
        ? await this.worker.executeSql(databaseId, sql, { readOnly: true })
        : await this.commitMutation(databaseId, sql.trim().slice(0, 120), () => this.worker.executeSql(databaseId, sql, { readOnly: false }));
      const history = this.createHistoryEntry({ databaseId, databaseName, sql, operation, status: "success", durationMs: Math.max(result.elapsedMs, performance.now() - startedAt) });
      await this.persistence.putQueryHistoryEntry(history);
      return { result, modified: operation === "write", history };
    } catch (error) {
      const history = this.createHistoryEntry({ databaseId, databaseName, sql, operation, status: "error", durationMs: performance.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
      await this.persistence.putQueryHistoryEntry(history).catch(() => undefined);
      throw error;
    }
  }

  async saveResultAsTable(tableName: string, selectSql: string) {
    await this.initialize();
    validateIdentifier(tableName, "Table name");
    assertReadOnlyQuery(selectSql);
    const databaseId = this.requireActiveDatabaseId();
    const sql = `CREATE TABLE ${quoteIdentifier(tableName)} AS ${selectSql.replace(/;\s*$/, "")}`;
    const result = await this.commitMutation(databaseId, `Save result as ${tableName}`, () => this.worker.executeSql(databaseId, sql, { readOnly: false }));
    const databaseName = this.databases.find((database) => database.id === databaseId)?.name ?? "Database";
    const history = this.createHistoryEntry({ databaseId, databaseName, sql, operation: "write", status: "success", durationMs: result.elapsedMs });
    await this.persistence.putQueryHistoryEntry(history);
    return { result, history };
  }

  async getCheckpointStatus(databaseId?: string) {
    await this.initialize();
    const id = databaseId ?? this.requireActiveDatabaseId();
    const state = await this.ensureCheckpointState(id);
    return { canUndo: state.undo.length > 0, canRedo: state.redo.length > 0 };
  }

  async undo(databaseId?: string) { return this.restoreCheckpoint("undo", databaseId); }
  async redo(databaseId?: string) { return this.restoreCheckpoint("redo", databaseId); }

  async resetDatabase(databaseId?: string) {
    await this.initialize();
    const id = databaseId ?? this.requireActiveDatabaseId();
    const current = await this.worker.exportDatabase(id);
    const state = await this.ensureCheckpointState(id, current);
    const next: DatabaseCheckpointState = { ...state, undo: this.trimSnapshots([...state.undo, this.makeSnapshot(current, "Before reset")]), redo: [] };
    await this.restoreAndPersist(id, state.initial.bytes, current, next);
    return this.getCheckpointStatus(id);
  }

  async listQueryHistory() { await this.initialize(); return this.persistence.getQueryHistory(this.activeWorkspaceId); }

  async executeReadOnlyQuery(
    sql: string,
    parameters?: SqlParameters,
    databaseId?: string,
  ) {
    await this.initialize();
    return this.worker.executeSql(databaseId ?? this.requireActiveDatabaseId(), sql, {
      parameters,
      readOnly: true,
    });
  }

  async previewMutation(input: {
    sql: string;
    beforeQueries: string[];
    afterQueries: string[];
  }) {
    await this.initialize();
    if (classifyUserSql(input.sql) !== "write") {
      throw new Error("Mutation previews require an INSERT, UPDATE, DELETE, or DDL statement.");
    }
    const sourceId = this.requireActiveDatabaseId();
    const previewId = `visualization-preview-${this.createId()}`;
    const bytes = await this.worker.exportDatabase(sourceId);
    await this.worker.loadDatabase(previewId, bytes);
    try {
      const before = [];
      for (const sql of input.beforeQueries) {
        before.push(await this.worker.executeSql(previewId, sql, { readOnly: true }));
      }
      const mutation = await this.worker.executeSql(previewId, input.sql, { readOnly: false });
      const after = [];
      for (const sql of input.afterQueries) {
        after.push(await this.worker.executeSql(previewId, sql, { readOnly: true }));
      }
      return { before, mutation, after };
    } finally {
      await this.worker.dropDatabase(previewId).catch(() => undefined);
    }
  }

  async executeInternal(
    databaseId: string,
    sql: string,
    parameters?: SqlParameters,
  ) {
    await this.initialize();
    const result = await this.worker.executeSql(databaseId, sql, {
      parameters,
      readOnly: false,
    });
    await this.persistExistingDatabase(databaseId);
    return result;
  }

  private requireActiveDatabaseId() {
    if (!this.activeDatabaseId) throw new Error("No database is active.");
    return this.activeDatabaseId;
  }

  private async createCollegeSample() {
    const createdAt = this.now().toISOString();
    await this.worker.createDatabase(COLLEGE_DATABASE_ID);
    await this.worker.executeSql(COLLEGE_DATABASE_ID, COLLEGE_SAMPLE_SQL, { readOnly: false });
    const bytes = await this.worker.exportDatabase(COLLEGE_DATABASE_ID);
    const metadata: DatabaseMetadata = {
      id: COLLEGE_DATABASE_ID,
      workspaceId: this.activeWorkspaceId,
      name: "College",
      source: "sample",
      createdAt,
      updatedAt: createdAt,
      sizeBytes: bytes.byteLength,
    };
    await this.persistence.putDatabaseAndCheckpoint({ metadata, bytes }, this.newCheckpointState(COLLEGE_DATABASE_ID, bytes, "Initial College database"));
    this.databases = [metadata];
    this.activeDatabaseId = COLLEGE_DATABASE_ID;
  }

  private async persistNewDatabase(
    databaseId: string,
    name: string,
    source: DatabaseSource,
  ) {
    const bytes = await this.worker.exportDatabase(databaseId);
    const timestamp = this.now().toISOString();
    const metadata: DatabaseMetadata = {
      id: databaseId,
      workspaceId: this.activeWorkspaceId,
      name,
      source,
      createdAt: timestamp,
      updatedAt: timestamp,
      sizeBytes: bytes.byteLength,
    };
    await this.persistence.putDatabaseAndCheckpoint({ metadata, bytes }, this.newCheckpointState(databaseId, bytes, "Initial database"));
    this.databases = [...this.databases, metadata];
    this.activeDatabaseId = databaseId;
    await this.persistence.setActiveDatabaseId(databaseId, this.activeWorkspaceId);
    return this.getSnapshot();
  }

  private async persistExistingDatabase(databaseId: string) {
    const current = this.databases.find((database) => database.id === databaseId);
    if (!current) throw new Error("Cannot persist an unknown database.");
    const bytes = await this.worker.exportDatabase(databaseId);
    const metadata = {
      ...current,
      updatedAt: this.now().toISOString(),
      sizeBytes: bytes.byteLength,
    };
    await this.persistence.putDatabase({ metadata, bytes });
    this.databases = this.databases.map((database) =>
      database.id === databaseId ? metadata : database,
    );
  }

  private async commitMutation<T>(databaseId: string, label: string, mutate: () => Promise<T>) {
    const before = await this.worker.exportDatabase(databaseId);
    const state = await this.ensureCheckpointState(databaseId, before);
    try {
      const result = await mutate();
      const after = await this.worker.exportDatabase(databaseId);
      const next: DatabaseCheckpointState = { ...state, undo: this.trimSnapshots([...state.undo, this.makeSnapshot(before, label)]), redo: [] };
      await this.persistBytesWithCheckpoint(databaseId, after, next);
      return result;
    } catch (error) {
      await this.worker.loadDatabase(databaseId, before).catch(() => undefined);
      throw error;
    }
  }

  private makeSnapshot(bytes: Uint8Array, label: string): DatabaseSnapshot {
    return { id: `snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: this.now().toISOString(), label, bytes: bytes.slice() };
  }

  private newCheckpointState(databaseId: string, bytes: Uint8Array, label: string): DatabaseCheckpointState {
    return { databaseId, initial: this.makeSnapshot(bytes, label), undo: [], redo: [] };
  }

  private async ensureCheckpointState(databaseId: string, bytes?: Uint8Array) {
    const existing = await this.persistence.getCheckpointState(databaseId);
    if (existing) return existing;
    const current = bytes ?? await this.worker.exportDatabase(databaseId);
    const state = this.newCheckpointState(databaseId, current, "Initial database");
    await this.persistence.putCheckpointState(state);
    return state;
  }

  private trimSnapshots(snapshots: DatabaseSnapshot[]) {
    const kept: DatabaseSnapshot[] = [];
    let total = 0;
    for (const snapshot of [...snapshots].reverse()) {
      if (kept.length >= MAX_SNAPSHOTS || (total + snapshot.bytes.byteLength > MAX_SNAPSHOT_BYTES && kept.length > 0)) break;
      kept.unshift(snapshot); total += snapshot.bytes.byteLength;
    }
    return kept;
  }

  private async restoreCheckpoint(direction: "undo" | "redo", databaseId?: string) {
    await this.initialize();
    const id = databaseId ?? this.requireActiveDatabaseId();
    const current = await this.worker.exportDatabase(id);
    const state = await this.ensureCheckpointState(id, current);
    const source = direction === "undo" ? state.undo : state.redo;
    const target = source.at(-1);
    if (!target) throw new Error(`Nothing to ${direction}.`);
    const currentSnapshot = this.makeSnapshot(current, direction === "undo" ? "Redo state" : "Undo state");
    const next: DatabaseCheckpointState = direction === "undo"
      ? { ...state, undo: state.undo.slice(0, -1), redo: this.trimSnapshots([...state.redo, currentSnapshot]) }
      : { ...state, redo: state.redo.slice(0, -1), undo: this.trimSnapshots([...state.undo, currentSnapshot]) };
    await this.restoreAndPersist(id, target.bytes, current, next);
    return this.getCheckpointStatus(id);
  }

  private async restoreAndPersist(databaseId: string, target: Uint8Array, fallback: Uint8Array, state: DatabaseCheckpointState) {
    try { await this.worker.loadDatabase(databaseId, target); await this.persistBytesWithCheckpoint(databaseId, target, state); }
    catch (error) { await this.worker.loadDatabase(databaseId, fallback).catch(() => undefined); throw error; }
  }

  private async persistBytesWithCheckpoint(databaseId: string, bytes: Uint8Array, state: DatabaseCheckpointState) {
    const current = this.databases.find((database) => database.id === databaseId);
    if (!current) throw new Error("Cannot persist an unknown database.");
    const metadata = { ...current, updatedAt: this.now().toISOString(), sizeBytes: bytes.byteLength };
    await this.persistence.putDatabaseAndCheckpoint({ metadata, bytes }, state);
    this.databases = this.databases.map((database) => database.id === databaseId ? metadata : database);
  }

  private createHistoryEntry(input: Omit<QueryHistoryEntry, "id" | "timestamp" | "workspaceId">): QueryHistoryEntry {
    return { ...input, workspaceId: this.activeWorkspaceId, id: `history-${this.activeWorkspaceId}-${Date.now()}-${Math.random().toString(16).slice(2)}`, timestamp: this.now().toISOString() };
  }
}

let browserManager: DatabaseManager | null = null;

export function getDatabaseManager() {
  if (typeof window === "undefined") {
    throw new Error("The QueryQuest database manager is only available in the browser.");
  }
  if (!browserManager) {
    browserManager = new DatabaseManager(
      new BrowserDatabaseWorkerClient(),
      new IndexedDbDatabaseStore(),
    );
  }
  return browserManager;
}

import type {
  DatabaseWorkerRequestMap,
  DatabaseWorkerRequestType,
  DatabaseWorkerResponse,
  DatabaseWorkerResponseMap,
} from "@/lib/database/worker-protocol";
import type {
  QueryResult,
  DatasetColumn,
  EditableTableRecords,
  SerializedDatabase,
  SqlParameters,
  TableRecords,
  TableSchema,
  TableSummary,
  TableDataEdit,
  TableDefinition,
  TableMigrationInspection,
  TableSchemaMigrationInput,
  TableSchemaMigrationResult,
} from "@/lib/database/types";

export interface DatabaseWorkerApi {
  initialize(databases: SerializedDatabase[]): Promise<{ loadedDatabaseIds: string[] }>;
  createDatabase(databaseId: string): Promise<void>;
  loadDatabase(databaseId: string, bytes: Uint8Array): Promise<void>;
  dropDatabase(databaseId: string): Promise<void>;
  importTable(
    databaseId: string,
    tableName: string,
    columns: DatasetColumn[],
    rows: import("@/lib/database/types").SqlValue[][],
  ): Promise<{ rowCount: number }>;
  createTable(databaseId: string, definition: TableDefinition): Promise<{ tableName: string }>;
  inspectTableMigration(databaseId: string, tableName: string): Promise<TableMigrationInspection>;
  migrateTableSchema(databaseId: string, input: TableSchemaMigrationInput): Promise<TableSchemaMigrationResult>;
  getEditableTableRecords(databaseId: string, tableName: string, limit?: number, offset?: number): Promise<EditableTableRecords>;
  applyTableEdits(databaseId: string, tableName: string, edits: TableDataEdit[]): Promise<{ changedRows: number }>;
  listTables(databaseId: string): Promise<TableSummary[]>;
  getTableSchema(databaseId: string, tableName: string): Promise<TableSchema>;
  getTableRecords(
    databaseId: string,
    tableName: string,
    limit?: number,
    offset?: number,
  ): Promise<TableRecords>;
  executeSql(
    databaseId: string,
    sql: string,
    options?: { parameters?: SqlParameters; readOnly?: boolean },
  ): Promise<QueryResult>;
  exportDatabase(databaseId: string): Promise<Uint8Array>;
  close(): Promise<void>;
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export class BrowserDatabaseWorkerClient implements DatabaseWorkerApi {
  private readonly worker: Worker;
  private readonly pending = new Map<string, PendingRequest>();
  private requestCounter = 0;

  constructor() {
    this.worker = new Worker(new URL("./database.worker.ts", import.meta.url), {
      type: "module",
      name: "queryquest-sqlite",
    });

    this.worker.addEventListener("message", (event: MessageEvent<DatabaseWorkerResponse>) => {
      const response = event.data;
      const pendingRequest = this.pending.get(response.requestId);
      if (!pendingRequest) return;

      this.pending.delete(response.requestId);
      if (response.ok) {
        pendingRequest.resolve(response.data);
      } else {
        const error = new Error(response.error.message);
        error.name = response.error.name;
        if (response.error.stack) error.stack = response.error.stack;
        pendingRequest.reject(error);
      }
    });

    this.worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "The database worker stopped unexpectedly.");
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    });
  }

  private send<K extends DatabaseWorkerRequestType>(
    type: K,
    payload: DatabaseWorkerRequestMap[K],
  ): Promise<DatabaseWorkerResponseMap[K]> {
    const requestId = `db-${Date.now()}-${this.requestCounter++}`;

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.worker.postMessage({ requestId, type, payload });
    });
  }

  initialize(databases: SerializedDatabase[]) {
    return this.send("initialize", { databases });
  }

  async createDatabase(databaseId: string) {
    await this.send("createDatabase", { databaseId });
  }

  async loadDatabase(databaseId: string, bytes: Uint8Array) {
    await this.send("loadDatabase", { databaseId, bytes });
  }

  async dropDatabase(databaseId: string) {
    await this.send("dropDatabase", { databaseId });
  }

  importTable(
    databaseId: string,
    tableName: string,
    columns: DatasetColumn[],
    rows: import("@/lib/database/types").SqlValue[][],
  ) {
    return this.send("importTable", { databaseId, tableName, columns, rows });
  }

  createTable(databaseId: string, definition: TableDefinition) {
    return this.send("createTable", { databaseId, definition });
  }

  inspectTableMigration(databaseId: string, tableName: string) {
    return this.send("inspectTableMigration", { databaseId, tableName });
  }

  migrateTableSchema(databaseId: string, input: TableSchemaMigrationInput) {
    return this.send("migrateTableSchema", { databaseId, input });
  }

  getEditableTableRecords(databaseId: string, tableName: string, limit = 100, offset = 0) {
    return this.send("getEditableTableRecords", { databaseId, tableName, limit, offset });
  }

  applyTableEdits(databaseId: string, tableName: string, edits: TableDataEdit[]) {
    return this.send("applyTableEdits", { databaseId, tableName, edits });
  }

  listTables(databaseId: string) {
    return this.send("listTables", { databaseId });
  }

  getTableSchema(databaseId: string, tableName: string) {
    return this.send("getTableSchema", { databaseId, tableName });
  }

  getTableRecords(databaseId: string, tableName: string, limit = 100, offset = 0) {
    return this.send("getTableRecords", { databaseId, tableName, limit, offset });
  }

  executeSql(
    databaseId: string,
    sql: string,
    options: { parameters?: SqlParameters; readOnly?: boolean } = {},
  ) {
    return this.send("executeSql", {
      databaseId,
      sql,
      parameters: options.parameters,
      readOnly: options.readOnly ?? true,
    });
  }

  exportDatabase(databaseId: string) {
    return this.send("exportDatabase", { databaseId });
  }

  async close() {
    try {
      await this.send("closeAll", {});
    } finally {
      this.worker.terminate();
    }
  }
}

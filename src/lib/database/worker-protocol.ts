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

export interface DatabaseWorkerRequestMap {
  initialize: { databases: SerializedDatabase[] };
  createDatabase: { databaseId: string };
  loadDatabase: { databaseId: string; bytes: Uint8Array };
  dropDatabase: { databaseId: string };
  importTable: {
    databaseId: string;
    tableName: string;
    columns: DatasetColumn[];
    rows: import("@/lib/database/types").SqlValue[][];
  };
  createTable: { databaseId: string; definition: TableDefinition };
  inspectTableMigration: { databaseId: string; tableName: string };
  migrateTableSchema: { databaseId: string; input: TableSchemaMigrationInput };
  getEditableTableRecords: { databaseId: string; tableName: string; limit: number; offset: number };
  applyTableEdits: { databaseId: string; tableName: string; edits: TableDataEdit[] };
  listTables: { databaseId: string };
  getTableSchema: { databaseId: string; tableName: string };
  getTableRecords: { databaseId: string; tableName: string; limit: number; offset: number };
  executeSql: {
    databaseId: string;
    sql: string;
    parameters?: SqlParameters;
    readOnly: boolean;
  };
  exportDatabase: { databaseId: string };
  closeAll: Record<string, never>;
}

export interface DatabaseWorkerResponseMap {
  initialize: { loadedDatabaseIds: string[] };
  createDatabase: { databaseId: string };
  loadDatabase: { databaseId: string };
  dropDatabase: { databaseId: string };
  importTable: { rowCount: number };
  createTable: { tableName: string };
  inspectTableMigration: TableMigrationInspection;
  migrateTableSchema: TableSchemaMigrationResult;
  getEditableTableRecords: EditableTableRecords;
  applyTableEdits: { changedRows: number };
  listTables: TableSummary[];
  getTableSchema: TableSchema;
  getTableRecords: TableRecords;
  executeSql: QueryResult;
  exportDatabase: Uint8Array;
  closeAll: { closed: true };
}

export type DatabaseWorkerRequestType = keyof DatabaseWorkerRequestMap;

export type DatabaseWorkerRequest = {
  [K in DatabaseWorkerRequestType]: {
    requestId: string;
    type: K;
    payload: DatabaseWorkerRequestMap[K];
  };
}[DatabaseWorkerRequestType];

export type DatabaseWorkerSuccessResponse = {
  requestId: string;
  ok: true;
  data: DatabaseWorkerResponseMap[DatabaseWorkerRequestType];
};

export type DatabaseWorkerErrorResponse = {
  requestId: string;
  ok: false;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
};

export type DatabaseWorkerResponse =
  | DatabaseWorkerSuccessResponse
  | DatabaseWorkerErrorResponse;

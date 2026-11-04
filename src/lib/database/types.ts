export type DatabaseSource = "sample" | "import" | "created";

export type SqlValue = string | number | null | Uint8Array;
export type SqlParameters = SqlValue[] | Record<string, SqlValue>;

export interface DatabaseMetadata {
  id: string;
  name: string;
  source: DatabaseSource;
  createdAt: string;
  updatedAt: string;
  sizeBytes: number;
}

export interface PersistedDatabase {
  metadata: DatabaseMetadata;
  bytes: Uint8Array;
}

export interface SerializedDatabase {
  id: string;
  bytes: Uint8Array;
}

export interface TableSummary {
  name: string;
  type: "table" | "view";
  rowCount: number;
}

export interface ColumnSchema {
  cid: number;
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: SqlValue;
  primaryKey: boolean;
}

export interface ForeignKeySchema {
  id: number;
  sequence: number;
  referencedTable: string;
  fromColumn: string;
  toColumn: string;
  onUpdate: string;
  onDelete: string;
  match: string;
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  foreignKeys: ForeignKeySchema[];
  createSql: string | null;
}

export interface QueryResult {
  columns: string[];
  values: SqlValue[][];
  rowCount: number;
  rowsAffected: number;
  elapsedMs: number;
}

export interface TableRecords extends QueryResult {
  tableName: string;
  totalRows: number;
  limit: number;
  offset: number;
}

export type SQLiteColumnType = "INTEGER" | "REAL" | "TEXT" | "BLOB" | "NUMERIC";

export interface DatasetColumn {
  name: string;
  type: SQLiteColumnType;
}

export interface ImportPreviewTable {
  summary: TableSummary;
  schema: TableSchema;
  records: TableRecords;
}

export interface DatabaseImportPreview {
  tables: ImportPreviewTable[];
}

export interface TableColumnDefinition {
  name: string;
  type: SQLiteColumnType;
  primaryKey: boolean;
  notNull: boolean;
  unique: boolean;
  hasDefault: boolean;
  defaultValue: SqlValue;
}

export interface TableDefinition {
  name: string;
  columns: TableColumnDefinition[];
}

export type TableDataEdit =
  | { type: "insert"; values: SqlValue[] }
  | { type: "update"; rowId: number; values: SqlValue[] }
  | { type: "delete"; rowId: number };

export interface EditableTableRecords extends TableRecords {
  rowIds: number[];
}

export interface DatabaseManagerSnapshot {
  databases: DatabaseMetadata[];
  activeDatabaseId: string | null;
}

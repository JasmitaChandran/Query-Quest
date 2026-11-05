export type DatabaseSource = "sample" | "import" | "created";

export type SqlValue = string | number | null | Uint8Array;
export type SqlParameters = SqlValue[] | Record<string, SqlValue>;

export interface DatabaseMetadata {
  id: string;
  workspaceId: string;
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
  primaryKeyPosition?: number;
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

export interface TableIndexSchema {
  name: string;
  unique: boolean;
  origin: string;
  partial: boolean;
  columns: string[];
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  foreignKeys: ForeignKeySchema[];
  indexes: TableIndexSchema[];
  createSql: string | null;
}

export type DiagramPosition = { x: number; y: number };
export type DiagramPositions = Record<string, DiagramPosition>;

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

export type SQLiteDeclaredType =
  | "INTEGER"
  | "INT"
  | "BIGINT"
  | "SMALLINT"
  | "TINYINT"
  | "REAL"
  | "FLOAT"
  | "DOUBLE"
  | "DECIMAL"
  | "NUMERIC"
  | "TEXT"
  | "VARCHAR"
  | "CHAR"
  | "BOOLEAN"
  | "DATE"
  | "DATETIME"
  | "TIMESTAMP"
  | "BLOB";

export type SQLiteForeignKeyAction = "NO ACTION" | "RESTRICT" | "SET NULL" | "SET DEFAULT" | "CASCADE";

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
  type: SQLiteDeclaredType;
  length?: number | null;
  precision?: number | null;
  scale?: number | null;
  primaryKey: boolean;
  autoincrement?: boolean;
  notNull: boolean;
  unique: boolean;
  hasDefault: boolean;
  defaultValue: SqlValue;
  defaultKind?: "literal" | "expression";
  defaultExpression?: string;
  checkExpression?: string;
  foreignKey?: {
    table: string;
    column: string;
    onDelete: SQLiteForeignKeyAction;
    onUpdate: SQLiteForeignKeyAction;
  } | null;
}

export interface TableDefinition {
  name: string;
  columns: TableColumnDefinition[];
  uniqueConstraints?: string[][];
  checks?: string[];
}

export interface TableSchemaObject {
  name: string;
  sql: string;
  columns: string[];
  hasExpressions?: boolean;
}

export interface ReferencingForeignKey {
  table: string;
  fromColumn: string;
  toColumn: string;
}

export interface TableMigrationInspection {
  tableName: string;
  definition: TableDefinition;
  rowCount: number;
  indexes: TableSchemaObject[];
  triggers: TableSchemaObject[];
  dependentViews: TableSchemaObject[];
  referencingForeignKeys: ReferencingForeignKey[];
  warnings: string[];
}

export interface TableColumnMapping {
  sourceColumn: string | null;
  targetColumn: string;
}

export interface TableSchemaMigrationInput {
  sourceTableName: string;
  definition: TableDefinition;
  columnMappings: TableColumnMapping[];
}

export interface TableSchemaMigrationResult {
  tableName: string;
  rowCount: number;
  recreatedIndexes: number;
  recreatedTriggers: number;
}

export type TableDataEdit =
  | { type: "insert"; values: SqlValue[] }
  | { type: "update"; rowId: number; values: SqlValue[] }
  | { type: "delete"; rowId: number };

export interface EditableTableRecords extends TableRecords {
  rowIds: number[];
}

export interface DatabaseSnapshot {
  id: string;
  createdAt: string;
  label: string;
  bytes: Uint8Array;
}

export interface DatabaseCheckpointState {
  databaseId: string;
  initial: DatabaseSnapshot;
  undo: DatabaseSnapshot[];
  redo: DatabaseSnapshot[];
}

export interface QueryHistoryEntry {
  id: string;
  workspaceId: string;
  databaseId: string;
  databaseName: string;
  sql: string;
  timestamp: string;
  status: "success" | "error";
  durationMs: number;
  operation: "read" | "write";
  error?: string;
}

export interface UserQueryExecution {
  result: QueryResult;
  modified: boolean;
  history: QueryHistoryEntry;
}

export interface DatabaseManagerSnapshot {
  workspaces: WorkspaceMetadata[];
  activeWorkspaceId: string;
  workspaceSettings: WorkspaceSettings;
  databases: DatabaseMetadata[];
  activeDatabaseId: string | null;
}

export interface WorkspaceMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSettings {
  editorSql: string;
  activePanel: "editor" | "visualizer" | "data" | "schema" | "history";
  explorerCollapsed: boolean;
}

export interface SavedQuery {
  id: string;
  workspaceId: string;
  name: string;
  sql: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceStorageUsage {
  databaseBytes: number;
  checkpointBytes: number;
  metadataBytes: number;
  totalBytes: number;
}

export interface PortableWorkspaceDatabase {
  metadata: DatabaseMetadata;
  sqliteBase64: string;
  diagramPositions: DiagramPositions;
}

export interface PortableWorkspaceFile {
  format: "queryquest-workspace";
  version: 1;
  exportedAt: string;
  workspace: WorkspaceMetadata;
  settings: WorkspaceSettings;
  activeDatabaseId: string | null;
  databases: PortableWorkspaceDatabase[];
  savedQueries: SavedQuery[];
  queryHistory: QueryHistoryEntry[];
}

export interface WorkspacePersistenceBundle {
  workspace: WorkspaceMetadata;
  settings: WorkspaceSettings;
  activeDatabaseId: string | null;
  databases: Array<{ database: PersistedDatabase; checkpoint: DatabaseCheckpointState; diagramPositions: DiagramPositions }>;
  savedQueries: SavedQuery[];
  queryHistory: QueryHistoryEntry[];
}

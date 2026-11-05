/// <reference lib="webworker" />

import initSqlJs, {
  type BindParams,
  type Database,
  type QueryExecResult,
  type SqlJsStatic,
} from "sql.js";

import type {
  DatabaseWorkerRequest,
  DatabaseWorkerResponse,
} from "@/lib/database/worker-protocol";
import type {
  ColumnSchema,
  DatasetColumn,
  EditableTableRecords,
  ForeignKeySchema,
  QueryResult,
  SqlValue,
  TableRecords,
  TableSchema,
  TableSummary,
  TableIndexSchema,
  TableDataEdit,
  TableDefinition,
} from "@/lib/database/types";
import { assertReadOnlyQuery } from "@/lib/database/read-only-sql";
import { buildCreateTableSql, buildTableEditStatements } from "@/lib/database/visual-sql";
import { inspectTableForMigration, migrateTableSchema } from "@/lib/database/schema-migration";

const databases = new Map<string, Database>();
let sqlJsPromise: Promise<SqlJsStatic> | null = null;

function initializeSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: (file) => (file.endsWith(".wasm") ? "/sql-wasm.wasm" : file),
    });
  }
  return sqlJsPromise;
}

function getDatabase(databaseId: string) {
  const database = databases.get(databaseId);
  if (!database) throw new Error(`Database “${databaseId}” is not loaded.`);
  return database;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function importTable(
  database: Database,
  tableName: string,
  columns: DatasetColumn[],
  rows: SqlValue[][],
) {
  if (!tableName.trim()) throw new Error("A table name is required.");
  if (columns.length === 0) throw new Error("The dataset does not contain any columns.");
  if (columns.some((column) => !column.name.trim())) throw new Error("Column names cannot be empty.");
  if (new Set(columns.map((column) => column.name.toLowerCase())).size !== columns.length) {
    throw new Error("Column names must be unique.");
  }
  if (rows.some((row) => row.length !== columns.length)) {
    throw new Error("Every imported row must match the detected column count.");
  }

  const allowedTypes = new Set(["INTEGER", "REAL", "TEXT", "BLOB"]);
  const columnSql = columns
    .map((column) => {
      if (!allowedTypes.has(column.type)) throw new Error(`Unsupported column type: ${column.type}`);
      return `${quoteIdentifier(column.name)} ${column.type}`;
    })
    .join(", ");
  const placeholders = columns.map(() => "?").join(", ");

  database.run("BEGIN IMMEDIATE");
  let statement: ReturnType<Database["prepare"]> | null = null;
  try {
    database.run(`CREATE TABLE ${quoteIdentifier(tableName)} (${columnSql})`);
    statement = database.prepare(
      `INSERT INTO ${quoteIdentifier(tableName)} VALUES (${placeholders})`,
    );
    for (const row of rows) statement.run(row as BindParams);
    database.run("COMMIT");
    return { rowCount: rows.length };
  } catch (error) {
    try {
      database.run("ROLLBACK");
    } catch {
      // The transaction may already have been rolled back by SQLite.
    }
    throw error;
  } finally {
    statement?.free();
  }
}

function firstResult(results: QueryExecResult[]): QueryExecResult | undefined {
  return results.at(-1);
}

function toQueryResult(
  result: QueryExecResult | undefined,
  rowsAffected: number,
  startedAt: number,
): QueryResult {
  return {
    columns: result?.columns ?? [],
    values: (result?.values ?? []) as SqlValue[][],
    rowCount: result?.values.length ?? 0,
    rowsAffected,
    elapsedMs: Math.max(0, performance.now() - startedAt),
  };
}

function assertTableExists(database: Database, tableName: string) {
  const statement = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE name = ? AND type IN ('table', 'view') LIMIT 1",
  );
  try {
    statement.bind([tableName]);
    if (!statement.step()) throw new Error(`Table “${tableName}” does not exist.`);
  } finally {
    statement.free();
  }
}

function scalarNumber(database: Database, sql: string) {
  const result = firstResult(database.exec(sql));
  return Number(result?.values[0]?.[0] ?? 0);
}

function listTables(database: Database): TableSummary[] {
  const result = firstResult(
    database.exec(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name COLLATE NOCASE",
    ),
  );

  return (result?.values ?? []).map(([name, type]) => {
    const tableName = String(name);
    return {
      name: tableName,
      type: type === "view" ? "view" : "table",
      rowCount: scalarNumber(database, `SELECT COUNT(*) FROM ${quoteIdentifier(tableName)}`),
    };
  });
}

function getTableSchema(database: Database, tableName: string): TableSchema {
  assertTableExists(database, tableName);

  const columnResult = firstResult(
    database.exec(`PRAGMA table_info(${quoteIdentifier(tableName)})`),
  );
  const columns: ColumnSchema[] = (columnResult?.values ?? []).map(
    ([cid, name, type, notNull, defaultValue, primaryKey]) => ({
      cid: Number(cid),
      name: String(name),
      type: String(type || "ANY"),
      notNull: Boolean(notNull),
      defaultValue: defaultValue as SqlValue,
      primaryKey: Boolean(primaryKey),
      primaryKeyPosition: Number(primaryKey),
    }),
  );

  const foreignKeyResult = firstResult(
    database.exec(`PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`),
  );
  const foreignKeys: ForeignKeySchema[] = (foreignKeyResult?.values ?? []).map(
    ([id, sequence, referencedTable, fromColumn, toColumn, onUpdate, onDelete, match]) => ({
      id: Number(id),
      sequence: Number(sequence),
      referencedTable: String(referencedTable),
      fromColumn: String(fromColumn),
      toColumn: String(toColumn),
      onUpdate: String(onUpdate),
      onDelete: String(onDelete),
      match: String(match),
    }),
  );

  const indexResult = firstResult(
    database.exec(`PRAGMA index_list(${quoteIdentifier(tableName)})`),
  );
  const indexes: TableIndexSchema[] = (indexResult?.values ?? []).map(
    ([, name, unique, origin, partial]) => {
      const indexName = String(name);
      const indexColumns = firstResult(
        database.exec(`PRAGMA index_info(${quoteIdentifier(indexName)})`),
      );
      return {
        name: indexName,
        unique: Boolean(unique),
        origin: String(origin),
        partial: Boolean(partial),
        columns: (indexColumns?.values ?? []).map((row) => String(row[2])),
      };
    },
  );

  const createStatement = database.prepare(
    "SELECT sql FROM sqlite_master WHERE name = ? AND type IN ('table', 'view') LIMIT 1",
  );
  let createSql: string | null = null;
  try {
    createStatement.bind([tableName]);
    if (createStatement.step()) {
      createSql = String(createStatement.get()[0] ?? "") || null;
    }
  } finally {
    createStatement.free();
  }

  return { name: tableName, columns, foreignKeys, indexes, createSql };
}

function getTableRecords(
  database: Database,
  tableName: string,
  limit: number,
  offset: number,
): TableRecords {
  assertTableExists(database, tableName);
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
  const safeOffset = Math.max(Math.trunc(offset), 0);
  const startedAt = performance.now();
  const result = firstResult(
    database.exec(
      `SELECT * FROM ${quoteIdentifier(tableName)} LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    ),
  );

  return {
    ...toQueryResult(result, 0, startedAt),
    tableName,
    totalRows: scalarNumber(database, `SELECT COUNT(*) FROM ${quoteIdentifier(tableName)}`),
    limit: safeLimit,
    offset: safeOffset,
  };
}

function getEditableTableRecords(
  database: Database,
  tableName: string,
  limit: number,
  offset: number,
): EditableTableRecords {
  assertTableExists(database, tableName);
  const tableType = firstResult(database.exec(`SELECT type FROM sqlite_master WHERE name = '${tableName.replaceAll("'", "''")}'`))?.values[0]?.[0];
  if (tableType !== "table") throw new Error("Views are read-only in the visual data editor.");
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
  const safeOffset = Math.max(Math.trunc(offset), 0);
  const startedAt = performance.now();
  let result: QueryExecResult | undefined;
  try {
    result = firstResult(database.exec(`SELECT rowid AS __queryquest_rowid__, * FROM ${quoteIdentifier(tableName)} LIMIT ${safeLimit} OFFSET ${safeOffset}`));
  } catch {
    throw new Error("This table does not expose row identifiers and cannot be edited visually.");
  }
  const rowIds = (result?.values ?? []).map((row) => Number(row[0]));
  const dataResult = result ? { columns: result.columns.slice(1), values: result.values.map((row) => row.slice(1)) } : undefined;
  return {
    ...toQueryResult(dataResult, 0, startedAt),
    rowIds,
    tableName,
    totalRows: scalarNumber(database, `SELECT COUNT(*) FROM ${quoteIdentifier(tableName)}`),
    limit: safeLimit,
    offset: safeOffset,
  };
}

function createVisualTable(database: Database, definition: TableDefinition) {
  database.run(buildCreateTableSql(definition));
  return { tableName: definition.name };
}

function applyTableEdits(database: Database, tableName: string, edits: TableDataEdit[]) {
  assertTableExists(database, tableName);
  const schema = getTableSchema(database, tableName);
  const statements = buildTableEditStatements(tableName, schema.columns.map((column) => column.name), edits);
  database.run("BEGIN IMMEDIATE");
  let changedRows = 0;
  try {
    for (let index = 0; index < statements.length; index += 1) {
      database.run(statements[index].sql, statements[index].parameters as BindParams);
      const changed = database.getRowsModified();
      if (edits[index].type !== "insert" && changed !== 1) {
        throw new Error("A row changed after editing began. Refresh the table and try again.");
      }
      changedRows += changed;
    }
    database.run("COMMIT");
    return { changedRows };
  } catch (error) {
    try { database.run("ROLLBACK"); } catch { /* SQLite already rolled back. */ }
    throw error;
  }
}

function executeSql(
  database: Database,
  sql: string,
  parameters: BindParams | undefined,
  readOnly: boolean,
) {
  const startedAt = performance.now();
  if (readOnly) assertReadOnlyQuery(sql);

  if (readOnly) database.run("PRAGMA query_only = ON");
  try {
    const result = firstResult(database.exec(sql, parameters));
    return toQueryResult(result, readOnly ? 0 : database.getRowsModified(), startedAt);
  } finally {
    if (readOnly) database.run("PRAGMA query_only = OFF");
  }
}

async function handleRequest(request: DatabaseWorkerRequest): Promise<unknown> {
  const SQL = await initializeSqlJs();

  switch (request.type) {
    case "initialize": {
      for (const database of databases.values()) database.close();
      databases.clear();
      for (const item of request.payload.databases) {
        const database = new SQL.Database(item.bytes);
        database.run("PRAGMA foreign_keys = ON");
        databases.set(item.id, database);
      }
      return { loadedDatabaseIds: [...databases.keys()] };
    }
    case "createDatabase": {
      databases.get(request.payload.databaseId)?.close();
      const database = new SQL.Database();
      database.run("PRAGMA foreign_keys = ON");
      databases.set(request.payload.databaseId, database);
      return { databaseId: request.payload.databaseId };
    }
    case "loadDatabase": {
      databases.get(request.payload.databaseId)?.close();
      const database = new SQL.Database(request.payload.bytes);
      database.run("PRAGMA foreign_keys = ON");
      databases.set(request.payload.databaseId, database);
      return { databaseId: request.payload.databaseId };
    }
    case "dropDatabase": {
      databases.get(request.payload.databaseId)?.close();
      databases.delete(request.payload.databaseId);
      return { databaseId: request.payload.databaseId };
    }
    case "importTable":
      return importTable(
        getDatabase(request.payload.databaseId),
        request.payload.tableName,
        request.payload.columns,
        request.payload.rows,
      );
    case "createTable":
      return createVisualTable(getDatabase(request.payload.databaseId), request.payload.definition);
    case "inspectTableMigration":
      return inspectTableForMigration(getDatabase(request.payload.databaseId), request.payload.tableName);
    case "migrateTableSchema":
      return migrateTableSchema(getDatabase(request.payload.databaseId), request.payload.input);
    case "getEditableTableRecords":
      return getEditableTableRecords(getDatabase(request.payload.databaseId), request.payload.tableName, request.payload.limit, request.payload.offset);
    case "applyTableEdits":
      return applyTableEdits(getDatabase(request.payload.databaseId), request.payload.tableName, request.payload.edits);
    case "listTables":
      return listTables(getDatabase(request.payload.databaseId));
    case "getTableSchema":
      return getTableSchema(
        getDatabase(request.payload.databaseId),
        request.payload.tableName,
      );
    case "getTableRecords":
      return getTableRecords(
        getDatabase(request.payload.databaseId),
        request.payload.tableName,
        request.payload.limit,
        request.payload.offset,
      );
    case "executeSql":
      return executeSql(
        getDatabase(request.payload.databaseId),
        request.payload.sql,
        request.payload.parameters as BindParams | undefined,
        request.payload.readOnly,
      );
    case "exportDatabase":
      return getDatabase(request.payload.databaseId).export();
    case "closeAll":
      for (const database of databases.values()) database.close();
      databases.clear();
      return { closed: true };
  }
}

self.addEventListener("message", async (event: MessageEvent<DatabaseWorkerRequest>) => {
  const request = event.data;
  let response: DatabaseWorkerResponse;

  try {
    const data = await handleRequest(request);
    response = { requestId: request.requestId, ok: true, data } as DatabaseWorkerResponse;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    response = {
      requestId: request.requestId,
      ok: false,
      error: { name: error.name, message: error.message, stack: error.stack },
    };
  }

  self.postMessage(response);
});

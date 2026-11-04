import { resolve } from "node:path";
import initSqlJs, { type BindParams, type Database } from "sql.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { TableDefinition } from "@/lib/database/types";
import { buildCreateTableSql, buildTableEditStatements } from "@/lib/database/visual-sql";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let database: Database;

const definition: TableDefinition = {
  name: "Projects",
  columns: [
    { name: "id", type: "INTEGER", primaryKey: true, notNull: false, unique: false, hasDefault: false, defaultValue: null },
    { name: "name", type: "TEXT", primaryKey: false, notNull: true, unique: true, hasDefault: false, defaultValue: null },
    { name: "status", type: "TEXT", primaryKey: false, notNull: true, unique: false, hasDefault: true, defaultValue: "planned" },
  ],
};

beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm") }); });
beforeEach(() => { database = new SQL.Database(); });
afterEach(() => database.close());

function runTransaction(statements: ReturnType<typeof buildTableEditStatements>) {
  database.run("BEGIN IMMEDIATE");
  try {
    statements.forEach((statement) => database.run(statement.sql, statement.parameters as BindParams));
    database.run("COMMIT");
  } catch (error) {
    database.run("ROLLBACK");
    throw error;
  }
}

describe("visual table creation and editing", () => {
  it("creates a table with SQLite-compatible constraints and defaults", () => {
    const sql = buildCreateTableSql(definition);
    database.run(sql);
    database.run('INSERT INTO "Projects" ("id", "name") VALUES (?, ?)', [1, "QueryQuest"]);
    expect(database.exec("SELECT id, name, status FROM Projects")[0].values).toEqual([[1, "QueryQuest", "planned"]]);
  });

  it("inserts, updates, and deletes rows with parameterized statements", () => {
    database.run(buildCreateTableSql(definition));
    runTransaction(buildTableEditStatements("Projects", ["id", "name", "status"], [
      { type: "insert", values: [1, "Atlas", "active"] },
      { type: "insert", values: [2, "Beacon", "planned"] },
    ]));
    const rowId = Number(database.exec("SELECT rowid FROM Projects WHERE id = 2")[0].values[0][0]);
    runTransaction(buildTableEditStatements("Projects", ["id", "name", "status"], [
      { type: "update", rowId, values: [2, "Beacon", "active"] },
      { type: "delete", rowId: Number(database.exec("SELECT rowid FROM Projects WHERE id = 1")[0].values[0][0]) },
    ]));
    expect(database.exec("SELECT id, status FROM Projects")[0].values).toEqual([[2, "active"]]);
  });

  it("rolls back the entire edit batch when a constraint fails", () => {
    database.run(buildCreateTableSql(definition));
    const statements = buildTableEditStatements("Projects", ["id", "name", "status"], [
      { type: "insert", values: [1, "Duplicate", "active"] },
      { type: "insert", values: [2, "Duplicate", "planned"] },
    ]);
    expect(() => runTransaction(statements)).toThrow(/UNIQUE constraint failed/i);
    expect(database.exec("SELECT COUNT(*) FROM Projects")[0].values[0][0]).toBe(0);
  });

  it("rejects unsafe or duplicated identifiers before SQL execution", () => {
    expect(() => buildCreateTableSql({ ...definition, name: "Projects; DROP TABLE Projects" })).toThrow("Table name must start");
    expect(() => buildCreateTableSql({ ...definition, columns: [definition.columns[0], { ...definition.columns[1], name: "id" }] })).toThrow("duplicated");
  });
});

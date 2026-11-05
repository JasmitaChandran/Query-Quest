import { resolve } from "node:path";
import initSqlJs, { type BindParams, type Database } from "sql.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { TableDefinition, TableSchemaMigrationInput } from "@/lib/database/types";
import { inspectTableForMigration, migrateTableSchema } from "@/lib/database/schema-migration";
import { buildCreateTableSql, buildTableEditStatements, getSQLiteAffinity } from "@/lib/database/visual-sql";
import { classifyUserSql, isDestructiveSql } from "@/lib/database/sql-safety";
import { COLLEGE_SAMPLE_SQL } from "@/lib/database/college-sample";

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
beforeEach(() => { database = new SQL.Database(); database.run("PRAGMA foreign_keys = ON"); });
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

  it("accepts the expanded declared types while preserving SQLite affinity behavior", () => {
    const sql = buildCreateTableSql({
      name: "DeclaredTypes",
      columns: [
        { ...definition.columns[0], name: "integer_value", type: "INTEGER", primaryKey: false },
        { ...definition.columns[0], name: "int_value", type: "INT", primaryKey: false },
        { ...definition.columns[0], name: "bigint_value", type: "BIGINT", primaryKey: false },
        { ...definition.columns[0], name: "smallint_value", type: "SMALLINT", primaryKey: false },
        { ...definition.columns[0], name: "tinyint_value", type: "TINYINT", primaryKey: false },
        { ...definition.columns[0], name: "real_value", type: "REAL", primaryKey: false },
        { ...definition.columns[0], name: "float_value", type: "FLOAT", primaryKey: false },
        { ...definition.columns[0], name: "double_value", type: "DOUBLE", primaryKey: false },
        { ...definition.columns[0], name: "decimal_value", type: "DECIMAL", precision: 10, scale: 2, primaryKey: false },
        { ...definition.columns[0], name: "numeric_value", type: "NUMERIC", primaryKey: false },
        { ...definition.columns[0], name: "text_value", type: "TEXT", primaryKey: false },
        { ...definition.columns[0], name: "varchar_value", type: "VARCHAR", length: 3, primaryKey: false },
        { ...definition.columns[0], name: "char_value", type: "CHAR", length: 2, primaryKey: false },
        { ...definition.columns[0], name: "boolean_value", type: "BOOLEAN", primaryKey: false },
        { ...definition.columns[0], name: "date_value", type: "DATE", primaryKey: false },
        { ...definition.columns[0], name: "datetime_value", type: "DATETIME", primaryKey: false },
        { ...definition.columns[0], name: "timestamp_value", type: "TIMESTAMP", primaryKey: false },
        { ...definition.columns[0], name: "blob_value", type: "BLOB", primaryKey: false },
      ],
    });
    database.run(sql);
    const declaredTypes = database.exec("PRAGMA table_info(DeclaredTypes)")[0].values.map((row) => row[2]);
    expect(declaredTypes).toEqual(["INTEGER", "INT", "BIGINT", "SMALLINT", "TINYINT", "REAL", "FLOAT", "DOUBLE", "DECIMAL(10,2)", "NUMERIC", "TEXT", "VARCHAR(3)", "CHAR(2)", "BOOLEAN", "DATE", "DATETIME", "TIMESTAMP", "BLOB"]);
    database.run('INSERT INTO DeclaredTypes (varchar_value, decimal_value, boolean_value, date_value) VALUES (?, ?, ?, ?)', ["longer than three", 123.4567, 1, "2026-11-04"]);
    expect(database.exec("SELECT varchar_value, decimal_value, boolean_value, date_value FROM DeclaredTypes")[0].values[0]).toEqual(["longer than three", 123.4567, 1, "2026-11-04"]);
    expect(getSQLiteAffinity("VARCHAR")).toBe("TEXT");
    expect(getSQLiteAffinity("BOOLEAN")).toBe("NUMERIC");
    expect(getSQLiteAffinity("BIGINT")).toBe("INTEGER");
  });

  it("executes composite keys, checks, defaults, and foreign-key actions in SQLite", () => {
    database.run('CREATE TABLE "Parents" ("id" INTEGER PRIMARY KEY)');
    const sql = buildCreateTableSql({
      name: "AdvancedRecords",
      columns: [
        { ...definition.columns[0], name: "tenant_id", type: "INTEGER", primaryKey: true },
        { ...definition.columns[0], name: "code", type: "TEXT", primaryKey: true },
        { ...definition.columns[0], name: "email", type: "VARCHAR", length: 255, primaryKey: false, notNull: true },
        { ...definition.columns[0], name: "amount", type: "DECIMAL", precision: 12, scale: 2, primaryKey: false, checkExpression: "amount >= 0" },
        { ...definition.columns[0], name: "status", type: "TEXT", primaryKey: false, hasDefault: true, defaultValue: "planned", checkExpression: "status IN ('planned', 'active')" },
        { ...definition.columns[0], name: "created_at", type: "TIMESTAMP", primaryKey: false, hasDefault: true, defaultKind: "expression", defaultExpression: "CURRENT_TIMESTAMP" },
        { ...definition.columns[0], name: "parent_id", type: "INTEGER", primaryKey: false, foreignKey: { table: "Parents", column: "id", onDelete: "CASCADE", onUpdate: "CASCADE" } },
      ],
      uniqueConstraints: [["tenant_id", "email"]],
      checks: ["length(code) >= 2"],
    });
    database.run(sql);
    database.run("INSERT INTO Parents VALUES (1)");
    database.run('INSERT INTO AdvancedRecords (tenant_id, code, email, amount, parent_id) VALUES (1, \'A1\', \'learner@example.com\', 19.5, 1)');
    expect(database.exec("SELECT status, created_at IS NOT NULL FROM AdvancedRecords")[0].values[0]).toEqual(["planned", 1]);
    expect(() => database.run('INSERT INTO AdvancedRecords (tenant_id, code, email, amount, parent_id) VALUES (1, \'A1\', \'other@example.com\', 1, 1)')).toThrow(/UNIQUE constraint failed/i);
    expect(() => database.run('INSERT INTO AdvancedRecords (tenant_id, code, email, amount, parent_id) VALUES (1, \'A2\', \'learner@example.com\', 1, 1)')).toThrow(/UNIQUE constraint failed/i);
    expect(() => database.run('INSERT INTO AdvancedRecords (tenant_id, code, email, amount, parent_id) VALUES (2, \'B2\', \'b@example.com\', -1, 1)')).toThrow(/CHECK constraint failed/i);
    expect(() => database.run('INSERT INTO AdvancedRecords (tenant_id, code, email, amount, parent_id) VALUES (2, \'B2\', \'b@example.com\', 1, 999)')).toThrow(/FOREIGN KEY constraint failed/i);
    database.run("UPDATE Parents SET id = 2 WHERE id = 1");
    expect(database.exec("SELECT parent_id FROM AdvancedRecords")[0].values[0][0]).toBe(2);
    database.run("DELETE FROM Parents WHERE id = 2");
    expect(database.exec("SELECT COUNT(*) FROM AdvancedRecords")[0].values[0][0]).toBe(0);
  });

  it("supports valid INTEGER PRIMARY KEY AUTOINCREMENT declarations", () => {
    const sql = buildCreateTableSql({
      name: "Events",
      columns: [
        { ...definition.columns[0], name: "id", type: "INTEGER", primaryKey: true, autoincrement: true },
        { ...definition.columns[1], name: "label", type: "TEXT", primaryKey: false, unique: false },
      ],
    });
    database.run(sql);
    database.run("INSERT INTO Events (label) VALUES ('one'), ('two')");
    expect(database.exec("SELECT id, label FROM Events ORDER BY id")[0].values).toEqual([[1, "one"], [2, "two"]]);
  });

  it("rejects incompatible advanced definitions before execution", () => {
    expect(() => buildCreateTableSql({ name: "BadLength", columns: [{ ...definition.columns[0], type: "VARCHAR", length: null }] })).toThrow("length must be a positive");
    expect(() => buildCreateTableSql({ name: "BadDecimal", columns: [{ ...definition.columns[0], type: "DECIMAL", precision: 3, scale: 4 }] })).toThrow("scale cannot exceed");
    expect(() => buildCreateTableSql({ name: "BadAuto", columns: [{ ...definition.columns[0], type: "INT", autoincrement: true }] })).toThrow("INTEGER PRIMARY KEY");
    expect(() => buildCreateTableSql({ name: "BadForeignKey", columns: [{ ...definition.columns[1], notNull: true, foreignKey: { table: "Parents", column: "id", onDelete: "SET NULL", onUpdate: "NO ACTION" } }] })).toThrow("SET NULL");
    expect(() => buildCreateTableSql({ ...definition, checks: ["id > 0; DROP TABLE Projects"] })).toThrow("single SQLite expression");
    expect(() => buildCreateTableSql({ ...definition, checks: ["id > 0), UNIQUE (name"] })).toThrow("unmatched closing parenthesis");
    expect(() => buildCreateTableSql({ ...definition, uniqueConstraints: [["id"]] })).toThrow("at least two columns");
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

  it("creates a real table from a SELECT result", () => {
    database.run(buildCreateTableSql(definition));
    database.run('INSERT INTO "Projects" ("id", "name", "status") VALUES (1, ?, ?)', ["Atlas", "active"]);
    database.run('CREATE TABLE "ActiveProjects" AS SELECT id, name FROM "Projects" WHERE status = \'active\'');
    expect(database.exec("SELECT * FROM ActiveProjects")[0].values).toEqual([[1, "Atlas"]]);
  });

  it("inspects and migrates an existing schema while preserving data and compatible objects", () => {
    database.run(buildCreateTableSql(definition));
    database.run('INSERT INTO Projects (id, name, status) VALUES (1, \'Atlas\', \'active\'), (2, \'Beacon\', \'planned\')');
    database.run("CREATE INDEX Projects_status_index ON Projects(status)");
    database.run("CREATE TABLE Audit (project_id INTEGER, status TEXT)");
    database.run("CREATE TRIGGER Projects_status_audit AFTER UPDATE OF status ON Projects BEGIN INSERT INTO Audit VALUES (NEW.id, NEW.status); END");

    const inspected = inspectTableForMigration(database, "Projects");
    expect(inspected.rowCount).toBe(2);
    expect(inspected.definition.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "id", type: "INTEGER", primaryKey: true }),
      expect.objectContaining({ name: "name", unique: true, notNull: true }),
      expect.objectContaining({ name: "status", hasDefault: true, defaultExpression: "'planned'" }),
    ]));
    expect(inspected.indexes.map((index) => index.name)).toEqual(["Projects_status_index"]);
    expect(inspected.triggers.map((trigger) => trigger.name)).toEqual(["Projects_status_audit"]);

    const byName = new Map(inspected.definition.columns.map((column) => [column.name, column]));
    const input: TableSchemaMigrationInput = {
      sourceTableName: "Projects",
      definition: {
        name: "WorkItems",
        columns: [
          byName.get("id")!,
          { ...byName.get("status")!, type: "VARCHAR", length: 20 },
          byName.get("name")!,
          { name: "priority", type: "INTEGER", primaryKey: false, notNull: true, unique: false, hasDefault: true, defaultValue: 1 },
        ],
      },
      columnMappings: [
        { sourceColumn: "id", targetColumn: "id" },
        { sourceColumn: "status", targetColumn: "status" },
        { sourceColumn: "name", targetColumn: "name" },
        { sourceColumn: null, targetColumn: "priority" },
      ],
    };
    const result = migrateTableSchema(database, input);
    expect(result).toEqual({ tableName: "WorkItems", rowCount: 2, recreatedIndexes: 1, recreatedTriggers: 1 });
    expect(database.exec("SELECT id, status, name, priority FROM WorkItems ORDER BY id")[0].values).toEqual([
      [1, "active", "Atlas", 1],
      [2, "planned", "Beacon", 1],
    ]);
    expect(database.exec("PRAGMA table_info(WorkItems)")[0].values.map((row) => row[2])).toEqual(["INTEGER", "VARCHAR(20)", "TEXT", "INTEGER"]);
    expect(database.exec("SELECT tbl_name FROM sqlite_master WHERE name = 'Projects_status_index'")[0].values[0][0]).toBe("WorkItems");
    database.run("UPDATE WorkItems SET status = 'done' WHERE id = 1");
    expect(database.exec("SELECT * FROM Audit")[0].values).toEqual([[1, "done"]]);
  });

  it("rolls back a schema migration when proposed constraints reject existing rows", () => {
    database.run(buildCreateTableSql(definition));
    database.run('INSERT INTO Projects (id, name, status) VALUES (1, \'Atlas\', \'active\')');
    const inspected = inspectTableForMigration(database, "Projects");
    const columns = inspected.definition.columns.map((column) => column.name === "status" ? { ...column, checkExpression: "status = 'archived'" } : column);
    expect(() => migrateTableSchema(database, {
      sourceTableName: "Projects",
      definition: { ...inspected.definition, columns },
      columnMappings: columns.map((column) => ({ sourceColumn: column.name, targetColumn: column.name })),
    })).toThrow(/CHECK constraint failed/i);
    expect(database.exec("SELECT id, name, status FROM Projects")[0].values).toEqual([[1, "Atlas", "active"]]);
    expect(database.exec("SELECT COUNT(*) FROM sqlite_master WHERE name = '__queryquest_replacement'")[0].values[0][0]).toBe(0);
  });

  it("blocks column removal or rename when dependent SQL cannot be rewritten safely", () => {
    database.run(buildCreateTableSql(definition));
    database.run("CREATE VIEW ProjectNames AS SELECT name FROM Projects");
    const inspected = inspectTableForMigration(database, "Projects");
    const columns = inspected.definition.columns.map((column) => column.name === "name" ? { ...column, name: "title" } : column);
    expect(() => migrateTableSchema(database, {
      sourceTableName: "Projects",
      definition: { ...inspected.definition, columns },
      columnMappings: columns.map((column) => ({ sourceColumn: column.name === "title" ? "name" : column.name, targetColumn: column.name })),
    })).toThrow(/view “ProjectNames”/i);
    expect(database.exec("PRAGMA table_info(Projects)")[0].values.map((row) => row[1])).toContain("name");
  });

  it("preserves incoming foreign keys while rebuilding a referenced table", () => {
    database.exec(COLLEGE_SAMPLE_SQL);
    const inspected = inspectTableForMigration(database, "Departments");
    expect(inspected.referencingForeignKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "Students", fromColumn: "department_id", toColumn: "id" }),
      expect.objectContaining({ table: "Courses", fromColumn: "department_id", toColumn: "id" }),
    ]));
    const renamed = inspected.definition.columns.map((column) => column.name === "id" ? { ...column, name: "department_key" } : column);
    expect(() => migrateTableSchema(database, {
      sourceTableName: "Departments",
      definition: { ...inspected.definition, columns: renamed },
      columnMappings: renamed.map((column) => ({ sourceColumn: column.name === "department_key" ? "id" : column.name, targetColumn: column.name })),
    })).toThrow(/foreign keys from/i);

    const columns = [...inspected.definition.columns, { name: "region", type: "TEXT" as const, primaryKey: false, notNull: false, unique: false, hasDefault: true, defaultValue: "North" }];
    migrateTableSchema(database, {
      sourceTableName: "Departments",
      definition: { ...inspected.definition, columns },
      columnMappings: columns.map((column) => ({ sourceColumn: column.name === "region" ? null : column.name, targetColumn: column.name })),
    });
    expect(database.exec("SELECT COUNT(*), MIN(region) FROM Departments")[0].values[0]).toEqual([4, "North"]);
    expect(database.exec("PRAGMA foreign_key_check")).toEqual([]);
  });

  it("classifies safe writes, destructive writes, and rejects multi-statement execution", () => {
    expect(classifyUserSql("SELECT * FROM Projects")).toBe("read");
    expect(classifyUserSql("UPDATE Projects SET status = 'done' WHERE id = 1")).toBe("write");
    expect(isDestructiveSql("DELETE FROM Projects WHERE id = 1")).toBe(true);
    expect(isDestructiveSql("UPDATE Projects SET status = 'done'")).toBe(true);
    expect(classifyUserSql("SELECT /* semicolon ; inside comment */ 1;")).toBe("read");
    expect(() => classifyUserSql("INSERT INTO Projects VALUES (1); DROP TABLE Projects;")).toThrow("one SQL statement");
  });
});

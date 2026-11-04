import { resolve } from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { COLLEGE_SAMPLE_SQL } from "@/lib/database/college-sample";
import { assertReadOnlyQuery } from "@/lib/database/read-only-sql";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let database: Database;

beforeAll(async () => {
  SQL = await initSqlJs({
    locateFile: () => resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"),
  });
});

beforeEach(() => {
  database = new SQL.Database();
  database.exec(COLLEGE_SAMPLE_SQL);
});

afterEach(() => database.close());

describe("College database read-only queries", () => {
  it("exports and reloads the complete sample as a SQLite database file", () => {
    const bytes = database.export();
    const imported = new SQL.Database(bytes);
    try {
      const tables = imported.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")[0];
      expect(tables.values.flat()).toEqual(["Courses", "Departments", "Enrollments", "Students"]);
      expect(imported.exec("SELECT COUNT(*) FROM Students")[0].values[0][0]).toBe(8);
      expect(imported.exec("PRAGMA foreign_key_list(Enrollments)")[0].values.length).toBe(2);
    } finally {
      imported.close();
    }
  });

  it("executes SELECT queries", () => {
    const result = database.exec("SELECT first_name, last_name FROM Students LIMIT 3")[0];
    expect(result.columns).toEqual(["first_name", "last_name"]);
    expect(result.values).toHaveLength(3);
  });

  it("filters records with WHERE", () => {
    const result = database.exec("SELECT id FROM Students WHERE year_level > 2")[0];
    expect(result.values).toHaveLength(4);
  });

  it("joins related tables", () => {
    const result = database.exec(`
      SELECT s.first_name, d.name AS department
      FROM Students AS s
      JOIN Departments AS d ON d.id = s.department_id
    `)[0];
    expect(result.values).toHaveLength(8);
    expect(result.values[0]).toEqual(["Anika", "Computer Science"]);
  });

  it("groups records with aggregate results", () => {
    const result = database.exec(`
      SELECT department_id, COUNT(*) AS student_count
      FROM Students
      GROUP BY department_id
      ORDER BY department_id
    `)[0];
    expect(result.values).toEqual([
      [1, 3],
      [2, 2],
      [3, 2],
      [4, 1],
    ]);
  });

  it("orders records", () => {
    const result = database.exec("SELECT last_name FROM Students ORDER BY last_name DESC")[0];
    expect(result.values[0][0]).toBe("Sen");
    expect(result.values.at(-1)?.[0]).toBe("Bose");
  });

  it("surfaces SQLite syntax errors", () => {
    expect(() => database.exec("SELEKT * FROM Students")).toThrow(/syntax error/i);
  });

  it("allows reads and rejects modifying statements before execution", () => {
    expect(() => assertReadOnlyQuery("SELECT * FROM Students")).not.toThrow();
    expect(() => assertReadOnlyQuery("DELETE FROM Students")).toThrow(/read-only SELECT/i);
    expect(() => assertReadOnlyQuery("SELECT 1; DROP TABLE Students;")).toThrow(
      /Write operations are internal/i,
    );
  });
});

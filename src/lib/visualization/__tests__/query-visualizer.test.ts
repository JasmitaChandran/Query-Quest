import { resolve } from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { QueryResult, SqlValue } from "@/lib/database/types";
import {
  analyzeVisualizationQuery,
  createMutationVisualizationPlan,
  createVisualizationPlan,
  type MutationPreviewResult,
  type PreviewMutation,
} from "@/lib/visualization/query-visualizer";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let database: Database;

beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm") }); });
beforeEach(() => {
  database = new SQL.Database();
  database.run(`
    CREATE TABLE Departments (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE Students (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER, score INTEGER, department_id INTEGER);
    INSERT INTO Departments VALUES (1, 'Engineering'), (2, 'Arts'), (3, 'History');
    INSERT INTO Students VALUES
      (1, 'Anika', 19, 80, 1),
      (2, 'Mateo', 25, NULL, 1),
      (3, 'Noor', 21, 90, 2),
      (4, 'Ishan', NULL, 70, 2),
      (5, 'Lina', 30, 95, 1),
      (6, 'Maya', 25, 85, 1);
  `);
});
afterEach(() => database.close());

function run(target: Database, sql: string): QueryResult {
  const result = target.exec(sql).at(-1);
  return {
    columns: result?.columns ?? [],
    values: (result?.values ?? []) as SqlValue[][],
    rowCount: result?.values.length ?? 0,
    rowsAffected: /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql) ? target.getRowsModified() : 0,
    elapsedMs: 0,
  };
}

async function execute(sql: string) {
  return run(database, sql);
}

const previewMutation: PreviewMutation = async (input): Promise<MutationPreviewResult> => {
  const preview = new SQL.Database(database.export());
  try {
    const before = input.beforeQueries.map((sql) => run(preview, sql));
    const mutation = run(preview, input.sql);
    const after = input.afterQueries.map((sql) => run(preview, sql));
    return { before, mutation, after };
  } finally {
    preview.close();
  }
};

describe("step-by-step SELECT visualization", () => {
  it("preserves the Part 1 WHERE, SELECT, ORDER BY, and LIMIT journey", async () => {
    const plan = await createVisualizationPlan("SELECT name, age FROM Students WHERE age > 20 ORDER BY age DESC LIMIT 2;", execute);
    expect(plan.steps.map((step) => step.kind)).toEqual(["source", "filter", "project", "order", "limit", "result"]);
    expect(plan.steps.find((step) => step.kind === "filter")?.matchingRowIds).toEqual([2, 3, 5, 6]);
    expect(plan.finalResult.values).toEqual([["Lina", 30], ["Mateo", 25]]);
    expect(plan.validated).toBe(true);
  });

  it("visualizes an INNER JOIN with both sources and matching combinations", async () => {
    const sql = "SELECT s.name, d.name AS department FROM Students s INNER JOIN Departments d ON s.department_id = d.id ORDER BY s.name";
    const plan = await createVisualizationPlan(sql, execute);
    const join = plan.steps.find((step) => step.kind === "join");
    expect(plan.analysis.join).toEqual({ type: "INNER", left: { table: "Students", column: "department_id" }, right: { table: "Departments", column: "id" } });
    expect(plan.sources.map((source) => source.tableName)).toEqual(["Students", "Departments"]);
    expect(join?.panels?.every((panel) => panel.highlightedColumns?.length === 1)).toBe(true);
    expect(join?.table.values).toHaveLength(6);
    expect(plan.finalResult.values[0]).toEqual(["Anika", "Engineering"]);
    expect(plan.validated).toBe(true);
  });

  it("keeps unmatched LEFT JOIN rows and shows SQLite NULL values", async () => {
    const sql = "SELECT d.name AS department, s.name AS student FROM Departments d LEFT JOIN Students s ON d.id = s.department_id ORDER BY d.id, s.id";
    const plan = await createVisualizationPlan(sql, execute);
    const join = plan.steps.find((step) => step.kind === "join");
    expect(plan.analysis.join?.type).toBe("LEFT");
    expect(join?.panels?.[0].unmatchedRowIds).toEqual([3]);
    expect(join?.table.values.some((row) => row.includes(null))).toBe(true);
    expect(plan.finalResult.values.at(-1)).toEqual(["History", null]);
    expect(plan.validated).toBe(true);
  });

  it("forms groups and exposes SQLite aggregate calculations", async () => {
    const sql = "SELECT department_id, COUNT(*) AS people, SUM(age) AS total_age, AVG(age) AS avg_age, MIN(age) AS youngest, MAX(age) AS oldest FROM Students GROUP BY department_id ORDER BY department_id";
    const plan = await createVisualizationPlan(sql, execute);
    const group = plan.steps.find((step) => step.kind === "group");
    const aggregate = plan.steps.find((step) => step.kind === "aggregate");
    expect(plan.analysis.aggregates.map((item) => item.function)).toEqual(["COUNT", "SUM", "AVG", "MIN", "MAX"]);
    expect(group?.groups).toHaveLength(2);
    expect(group?.table.rowGroups?.[0]).toBe(group?.table.rowGroups?.[1]);
    expect(aggregate?.groups?.[0].calculations).toContain("people = 4");
    expect(plan.finalResult.values).toEqual([[1, 4, 99, 24.75, 19, 30], [2, 2, 21, 21, 21, 21]]);
    expect(plan.validated).toBe(true);
  });

  it("uses SQLite semantics for DISTINCT and NULL predicates", async () => {
    const distinct = await createVisualizationPlan('SELECT DISTINCT s."age" AS years FROM "Students" AS s ORDER BY years ASC', execute);
    const nulls = await createVisualizationPlan("SELECT name FROM Students WHERE age IS NULL", execute);
    expect(distinct.finalResult.values).toEqual([[null], [19], [21], [25], [30]]);
    expect(nulls.steps.find((step) => step.kind === "filter")?.matchingRowIds).toEqual([4]);
  });
});

describe("checkpoint-ready DML visualization", () => {
  it("executes INSERT once and highlights only newly inserted records", async () => {
    let executions = 0;
    const sql = "INSERT INTO Students (id, name, age, score, department_id) VALUES (7, 'Zoya', 22, 88, 3)";
    const plan = await createMutationVisualizationPlan(sql, previewMutation, async () => { executions += 1; return execute(sql); }, execute);
    expect(executions).toBe(1);
    expect(plan.steps.find((step) => step.kind === "insert")?.highlightedRowIds).toEqual([7]);
    expect(plan.finalResult.values.at(-1)).toEqual([7, "Zoya", 22, 88, 3]);
    expect(run(database, "SELECT COUNT(*) FROM Students").values).toEqual([[7]]);
    expect(plan.validated).toBe(true);
  });

  it("captures UPDATE before-and-after values and validates the real state", async () => {
    const sql = "UPDATE Students SET score = 100 WHERE id = 2";
    const plan = await createMutationVisualizationPlan(sql, previewMutation, () => execute(sql), execute);
    const before = plan.steps.find((step) => step.kind === "update-before");
    const after = plan.steps.find((step) => step.kind === "update-after");
    expect(before?.highlightedRowIds).toEqual([2]);
    expect(after?.cellChanges).toEqual([{ rowId: 2, column: "score", before: null, after: 100 }]);
    expect(run(database, "SELECT score FROM Students WHERE id = 2").values).toEqual([[100]]);
    expect(plan.validated).toBe(true);
  });

  it("highlights DELETE targets before removing them from the final state", async () => {
    const sql = "DELETE FROM Students WHERE department_id = 2";
    const plan = await createMutationVisualizationPlan(sql, previewMutation, () => execute(sql), execute);
    expect(plan.steps.find((step) => step.kind === "delete-before")?.highlightedRowIds).toEqual([3, 4]);
    expect(plan.finalResult.values.some((row) => row[4] === 2)).toBe(false);
    expect(run(database, "SELECT COUNT(*) FROM Students").values).toEqual([[4]]);
    expect(plan.validated).toBe(true);
  });
});

describe("bounded syntax safeguards", () => {
  it("rejects unsupported AST shapes instead of inventing steps", () => {
    expect(() => analyzeVisualizationQuery("SELECT s.name FROM Students s JOIN Departments d ON s.department_id > d.id")).toThrow("equi-join");
    expect(() => analyzeVisualizationQuery("SELECT department_id, COUNT(*) FROM Students GROUP BY department_id HAVING COUNT(*) > 1")).toThrow("HAVING");
    expect(() => analyzeVisualizationQuery("SELECT COUNT(DISTINCT age) FROM Students")).toThrow("without DISTINCT");
    expect(() => analyzeVisualizationQuery("INSERT INTO Students (id, name) SELECT id, name FROM Students")).toThrow("VALUES");
    expect(() => analyzeVisualizationQuery("UPDATE Students SET age = age + 1")).toThrow("literal values");
    expect(() => analyzeVisualizationQuery("SELECT name FROM Students; SELECT age FROM Students")).toThrow("one statement");
  });
});

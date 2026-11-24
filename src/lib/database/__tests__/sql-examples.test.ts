import { describe, expect, it } from "vitest";

import { buildSqlExamples } from "@/lib/database/sql-examples";
import type { TableSchema, TableSummary } from "@/lib/database/types";

const tables: TableSummary[] = [
  { name: "Students", type: "table", rowCount: 8 },
  { name: "Departments", type: "table", rowCount: 4 },
];

const schemas: Record<string, TableSchema> = {
  Students: {
    name: "Students",
    columns: [
      { cid: 0, name: "id", type: "INTEGER", notNull: true, defaultValue: null, primaryKey: true },
      { cid: 1, name: "department_id", type: "INTEGER", notNull: true, defaultValue: null, primaryKey: false },
    ],
    foreignKeys: [{ id: 0, sequence: 0, referencedTable: "Departments", fromColumn: "department_id", toColumn: "id", onUpdate: "NO ACTION", onDelete: "NO ACTION", match: "NONE" }],
    indexes: [],
    createSql: null,
  },
  Departments: {
    name: "Departments",
    columns: [{ cid: 0, name: "id", type: "INTEGER", notNull: true, defaultValue: null, primaryKey: true }],
    foreignKeys: [],
    indexes: [],
    createSql: null,
  },
};

describe("schema-aware SQL examples", () => {
  it("uses only selected tables and real columns", () => {
    const examples = buildSqlExamples(tables, schemas, "Students");
    expect(examples.map((example) => example.kind)).toEqual(["select", "filter", "sort", "count", "group", "join"]);
    expect(examples.every((example) => example.sql.includes('"Students"') || example.kind === "join")).toBe(true);
    expect(examples.find((example) => example.kind === "filter")?.sql).toContain('"id" IS NOT NULL');
  });

  it("only creates a join when SQLite foreign-key metadata supports it", () => {
    expect(buildSqlExamples(tables, { ...schemas, Students: { ...schemas.Students, foreignKeys: [] } }, "Students").some((example) => example.kind === "join")).toBe(false);
    expect(buildSqlExamples([], {}, null)).toEqual([]);
  });
});

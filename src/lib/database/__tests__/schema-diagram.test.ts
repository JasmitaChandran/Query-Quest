import { describe, expect, it } from "vitest";

import { automaticDiagramPositions, detectSchemaRelationships, mergeDiagramPositions } from "@/lib/database/schema-diagram";
import type { TableSchema, TableSummary } from "@/lib/database/types";

const tables: TableSummary[] = [
  { name: "Departments", type: "table", rowCount: 4 },
  { name: "Students", type: "table", rowCount: 8 },
  { name: "Profiles", type: "table", rowCount: 8 },
  { name: "Independent", type: "table", rowCount: 0 },
];

function schema(name: string, input: Partial<TableSchema> = {}): TableSchema {
  return { name, columns: [], foreignKeys: [], indexes: [], createSql: null, ...input };
}

const schemas: Record<string, TableSchema> = {
  Departments: schema("Departments", {
    columns: [{ cid: 0, name: "id", type: "INTEGER", notNull: false, defaultValue: null, primaryKey: true, primaryKeyPosition: 1 }],
  }),
  Students: schema("Students", {
    columns: [
      { cid: 0, name: "id", type: "INTEGER", notNull: false, defaultValue: null, primaryKey: true, primaryKeyPosition: 1 },
      { cid: 1, name: "department_id", type: "INTEGER", notNull: true, defaultValue: null, primaryKey: false },
    ],
    foreignKeys: [{ id: 0, sequence: 0, referencedTable: "Departments", fromColumn: "department_id", toColumn: "id", onUpdate: "NO ACTION", onDelete: "CASCADE", match: "NONE" }],
  }),
  Profiles: schema("Profiles", {
    columns: [{ cid: 0, name: "student_id", type: "INTEGER", notNull: true, defaultValue: null, primaryKey: false }],
    foreignKeys: [{ id: 0, sequence: 0, referencedTable: "Students", fromColumn: "student_id", toColumn: "id", onUpdate: "CASCADE", onDelete: "CASCADE", match: "NONE" }],
    indexes: [{ name: "profiles_student_unique", unique: true, origin: "u", partial: false, columns: ["student_id"] }],
  }),
  Independent: schema("Independent"),
};

describe("schema diagram metadata", () => {
  it("creates only declared SQLite foreign-key relationships and detects cardinality", () => {
    const relationships = detectSchemaRelationships(tables, schemas);
    expect(relationships).toEqual([
      expect.objectContaining({ parentTable: "Departments", childTable: "Students", childColumns: ["department_id"], cardinality: "one-to-many" }),
      expect.objectContaining({ parentTable: "Students", childTable: "Profiles", childColumns: ["student_id"], cardinality: "one-to-one" }),
    ]);
    expect(relationships.some((relationship) => relationship.parentTable === "Independent" || relationship.childTable === "Independent")).toBe(false);
  });

  it("places parent tables before children and preserves saved coordinates", () => {
    const relationships = detectSchemaRelationships(tables, schemas);
    const automatic = automaticDiagramPositions(tables, relationships);
    expect(automatic.Departments.x).toBeLessThan(automatic.Students.x);
    expect(automatic.Students.x).toBeLessThan(automatic.Profiles.x);
    const merged = mergeDiagramPositions(tables, relationships, { Students: { x: 999, y: 321 }, RemovedTable: { x: 1, y: 1 } });
    expect(merged.Students).toEqual({ x: 999, y: 321 });
    expect(merged).not.toHaveProperty("RemovedTable");
    expect(merged.Departments).toEqual(automatic.Departments);
  });
});

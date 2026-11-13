import { describe, expect, it } from "vitest";

import type { TableSchema } from "@/lib/database/types";
import {
  buildVisualTableEdits,
  describeVisualEditError,
  gridNavigationTarget,
  parameterizedSqlPreview,
  parseVisualCellValue,
  summarizeVisualChanges,
  validateVisualDrafts,
  visualCellKey,
  type VisualDraftRow,
} from "@/lib/database/visual-data-editor";

const schema: TableSchema = {
  name: "Students",
  createSql: 'CREATE TABLE "Students" ("id" INTEGER PRIMARY KEY, "name" TEXT NOT NULL UNIQUE, "department_id" INTEGER REFERENCES "Departments"("id"))',
  columns: [
    { cid: 0, name: "id", type: "INTEGER", notNull: false, defaultValue: null, primaryKey: true },
    { cid: 1, name: "name", type: "TEXT", notNull: true, defaultValue: null, primaryKey: false },
    { cid: 2, name: "department_id", type: "INTEGER", notNull: false, defaultValue: null, primaryKey: false },
  ],
  foreignKeys: [{ id: 0, sequence: 0, referencedTable: "Departments", fromColumn: "department_id", toColumn: "id", onUpdate: "NO ACTION", onDelete: "NO ACTION", match: "NONE" }],
  indexes: [{ name: "sqlite_autoindex_Students_1", unique: true, origin: "u", partial: false, columns: ["name"] }],
};

const rows: VisualDraftRow[] = [
  { key: "row-1", rowId: 1, values: [1, "Anika", 1], original: [1, "Anika", 1], isNew: false },
  { key: "row-2", rowId: 2, values: [2, "Mateo", 1], original: [2, "Mateo", 1], isNew: false },
];

describe("visual data editor draft interactions", () => {
  it("parses supported numeric input and reports invalid values", () => {
    expect(parseVisualCellValue("42", "INTEGER")).toBe(42);
    expect(parseVisualCellValue("19.5", "DOUBLE")).toBe(19.5);
    expect(parseVisualCellValue("", "TEXT")).toBeNull();
    expect(() => parseVisualCellValue("4.2", "INTEGER")).toThrow("valid integer");
  });

  it("builds update, insert, and staged delete operations without interpolating values", () => {
    const drafts: VisualDraftRow[] = [
      { ...rows[0], values: [1, "Anika Rao", 1] },
      rows[1],
      { key: "new-1", values: [3, "Noor", 2], original: [null, null, null], isNew: true },
    ];
    const edits = buildVisualTableEdits(drafts, new Set([2]));
    expect(edits).toEqual([
      { type: "delete", rowId: 2 },
      { type: "update", rowId: 1, values: [1, "Anika Rao", 1] },
      { type: "insert", values: [3, "Noor", 2] },
    ]);
    const preview = parameterizedSqlPreview([{ sql: 'UPDATE "Students" SET "name" = ? WHERE rowid = ?', parameters: ["Robert'); DROP TABLE Students;--", 1] }]);
    expect(preview).toContain("SET \"name\" = ?");
    expect(preview).toContain("bound parameters");
  });

  it("associates required, primary-key, and unique validation with cells", () => {
    const drafts: VisualDraftRow[] = [
      rows[0],
      { key: "new-1", values: [1, null, 2], original: [null, null, null], isNew: true },
    ];
    const errors = validateVisualDrafts(drafts, schema, new Set());
    expect(errors[visualCellKey("new-1", 0)]).toContain("unique");
    expect(errors[visualCellKey("new-1", 1)]).toContain("required");
    expect(errors[visualCellKey("row-1", 0)]).toContain("unique");
  });

  it("excludes pending deletions from uniqueness checks and summarizes review rows", () => {
    const drafts: VisualDraftRow[] = [
      { ...rows[0], values: [1, "Anika Rao", 1] },
      rows[1],
      { key: "new-1", values: [2, "Noor", 2], original: [null, null, null], isNew: true },
    ];
    expect(validateVisualDrafts(drafts, schema, new Set([2]))[visualCellKey("new-1", 0)]).toBeUndefined();
    expect(summarizeVisualChanges(drafts, schema, new Set([2])).map((summary) => summary.type)).toEqual(["update", "delete", "insert"]);
  });

  it("implements spreadsheet navigation without hijacking horizontal caret movement", () => {
    expect(gridNavigationTarget({ key: "Enter", rowIndex: 0, columnIndex: 1, rowCount: 3, columnCount: 4, selectionStart: 2, selectionEnd: 2, valueLength: 4 })).toEqual({ rowIndex: 1, columnIndex: 1 });
    expect(gridNavigationTarget({ key: "ArrowUp", rowIndex: 2, columnIndex: 1, rowCount: 3, columnCount: 4, selectionStart: 2, selectionEnd: 2, valueLength: 4 })).toEqual({ rowIndex: 1, columnIndex: 1 });
    expect(gridNavigationTarget({ key: "ArrowLeft", rowIndex: 1, columnIndex: 2, rowCount: 3, columnCount: 4, selectionStart: 2, selectionEnd: 2, valueLength: 4 })).toBeNull();
    expect(gridNavigationTarget({ key: "ArrowRight", rowIndex: 1, columnIndex: 2, rowCount: 3, columnCount: 4, selectionStart: 4, selectionEnd: 4, valueLength: 4 })).toEqual({ rowIndex: 1, columnIndex: 3 });
  });

  it("translates SQLite constraint failures into actionable messages", () => {
    expect(describeVisualEditError(new Error("UNIQUE constraint failed: Students.name"))).toEqual({ message: "name conflicts with an existing primary or unique value.", columns: ["name"] });
    expect(describeVisualEditError(new Error("FOREIGN KEY constraint failed")).message).toContain("foreign-key value");
    expect(describeVisualEditError(new Error("CHECK constraint failed: year_level"))).toEqual(expect.objectContaining({ message: expect.stringContaining("CHECK constraint") }));
  });
});

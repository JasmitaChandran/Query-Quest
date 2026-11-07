import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { analyzeSchema } from "../src/analyzer.js";
import { createSchemaAnalysisApp } from "../src/app.js";

beforeAll(() => { process.env.LOG_LEVEL = "silent"; });

const validSchema = {
  databaseName: "College",
  dialect: "sqlite" as const,
  tables: [
    { name: "Departments", type: "table" as const, columns: [{ name: "id", type: "INTEGER", notNull: true, primaryKey: true }, { name: "name", type: "VARCHAR(80)", notNull: true, primaryKey: false }], foreignKeys: [], indexes: [{ name: "uq_departments_name", columns: ["name"], unique: true }] },
    { name: "Students", type: "table" as const, columns: [{ name: "id", type: "INTEGER", notNull: true, primaryKey: true }, { name: "department_id", type: "INTEGER", notNull: true, primaryKey: false }, { name: "enrolled_at", type: "DATETIME", notNull: false, primaryKey: false }], foreignKeys: [{ name: "fk_students_department", columns: ["department_id"], referencedTable: "Departments", referencedColumns: ["id"], onDelete: "CASCADE" as const, onUpdate: "NO ACTION" as const }], indexes: [] },
  ],
};

describe("Schema Analysis Service", () => {
  it("derives ER metadata, key roles, affinities, and compatibility issues", () => {
    const result = analyzeSchema(validSchema);
    expect(result.compatible).toBe(true);
    expect(result.summary).toEqual({ tableCount: 2, viewCount: 0, relationshipCount: 1 });
    expect(result.erDiagram.edges[0]).toEqual(expect.objectContaining({ source: "Students", target: "Departments", relationship: "many-to-one", cardinality: { source: "many", target: "one" } }));
    expect(result.erDiagram.nodes.find((node) => node.id === "Students")?.columns).toContainEqual(expect.objectContaining({ name: "department_id", affinity: "INTEGER", foreignKey: true }));
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "TEXT_LENGTH_AFFINITY" }), expect.objectContaining({ code: "TYPE_AFFINITY" })]));
    expect(result.privacy.recordsReceived).toBe(false);
  });

  it("reports invalid relationships without inventing ER edges", () => {
    const result = analyzeSchema({ ...validSchema, tables: [{ ...validSchema.tables[1], foreignKeys: [{ name: "broken", columns: ["missing"], referencedTable: "Unknown", referencedColumns: ["id"], onDelete: "NO ACTION", onUpdate: "NO ACTION" }] }] });
    expect(result.compatible).toBe(false);
    expect(result.erDiagram.edges).toEqual([]);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "FOREIGN_KEY_LOCAL_COLUMN_MISSING" }), expect.objectContaining({ code: "FOREIGN_KEY_TABLE_MISSING" })]));
  });

  it("exposes health/OpenAPI and rejects records or unknown request fields", async () => {
    const app = createSchemaAnalysisApp();
    await request(app).get("/health").expect(200).expect(({ body }) => expect(body).toEqual(expect.objectContaining({ status: "ok", service: "schema-analysis" })));
    await request(app).get("/openapi.json").expect(200).expect(({ body }) => expect(body.openapi).toBe("3.1.0"));
    await request(app).post("/v1/schema/analyze").send(validSchema).expect(200).expect(({ body }) => expect(body.erDiagram.edges).toHaveLength(1));
    await request(app).post("/v1/schema/analyze").send({ ...validSchema, tables: [{ ...validSchema.tables[0], rows: [{ id: 1 }] }] }).expect(400).expect(({ body }) => expect(body.error.code).toBe("VALIDATION_ERROR"));
  });
});

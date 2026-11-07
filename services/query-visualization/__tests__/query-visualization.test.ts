import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { analyzeQuery } from "../src/analyzer.js";
import { createQueryVisualizationApp } from "../src/app.js";

beforeAll(() => { process.env.LOG_LEVEL = "silent"; });

describe("Query Visualization Service", () => {
  it("generates ordered educational metadata for supported SELECT operations", () => {
    const result = analyzeQuery({ sql: "SELECT DISTINCT d.name, COUNT(*) AS total FROM Students AS s LEFT JOIN Departments AS d ON d.id = s.department_id WHERE s.age > 20 GROUP BY d.name ORDER BY total DESC LIMIT 5", dialect: "sqlite", schema: [{ name: "Students", columns: ["id", "age", "department_id"] }, { name: "Departments", columns: ["id", "name"] }] });
    expect(result.supported).toBe(true);
    expect(result.operations).toEqual(["FROM", "LEFT JOIN", "WHERE", "GROUP BY", "AGGREGATE", "SELECT", "DISTINCT", "ORDER BY", "LIMIT", "RESULT"]);
    expect(result.steps).toEqual(expect.arrayContaining([expect.objectContaining({ operation: "WHERE", explanation: expect.stringContaining("three-valued logic") }), expect.objectContaining({ operation: "AGGREGATE", metadata: { functions: ["COUNT"] } })]));
    expect(result.privacy.recordsReceived).toBe(false);
  });

  it("returns explicit unsupported metadata for subqueries and dangerous multi-statements", () => {
    const subquery = analyzeQuery({ sql: "SELECT * FROM Students WHERE id IN (SELECT student_id FROM Enrollments)", dialect: "sqlite" });
    expect(subquery.supported).toBe(false);
    expect(subquery.issues).toContainEqual(expect.objectContaining({ code: "SUBQUERY_UNSUPPORTED" }));
    const multiple = analyzeQuery({ sql: "SELECT 1; DELETE FROM Students;", dialect: "sqlite" });
    expect(multiple.supported).toBe(false);
    expect(multiple.issues).toContainEqual(expect.objectContaining({ code: "MULTI_STATEMENT" }));
  });

  it("describes literal mutation steps without executing the statement", () => {
    const result = analyzeQuery({ sql: "UPDATE Students SET age = 22 WHERE id = 1", dialect: "sqlite", schema: [{ name: "Students", columns: ["id", "age"] }] });
    expect(result.supported).toBe(true);
    expect(result.operations).toEqual(["TARGET", "WHERE", "UPDATE", "RESULT"]);
    expect(result.privacy.recordsReceived).toBe(false);
  });

  it("exposes REST validation, capabilities, health, and OpenAPI", async () => {
    const app = createQueryVisualizationApp();
    await request(app).get("/health").expect(200);
    await request(app).get("/openapi.json").expect(200).expect(({ body }) => expect(body.info.title).toContain("Visualization"));
    await request(app).get("/v1/visualizations/capabilities").expect(200).expect(({ body }) => expect(body.execution).toBe(false));
    await request(app).post("/v1/visualizations/analyze").send({ sql: "SELECT * FROM Students", records: [{ id: 1 }] }).expect(400).expect(({ body }) => expect(body.error.code).toBe("VALIDATION_ERROR"));
    await request(app).post("/v1/visualizations/analyze").send({ sql: "SELECT name FROM Students WHERE age > 20" }).expect(200).expect(({ body }) => expect(body.supported).toBe(true));
  });
});

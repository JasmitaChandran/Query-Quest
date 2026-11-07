import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { createLessonDatasetApp } from "../src/app.js";
import { datasets, examples, lessons } from "../src/catalog.js";

beforeAll(() => { process.env.LOG_LEVEL = "silent"; });

describe("Lesson & Dataset Service", () => {
  it("keeps catalog references versioned and internally consistent", () => {
    const datasetIds = new Set(datasets.map((dataset) => dataset.id));
    const exampleIds = new Set(examples.map((example) => example.id));
    expect(datasets.every((dataset) => /^\d+\.\d+\.\d+$/.test(dataset.version))).toBe(true);
    expect(lessons.every((lesson) => datasetIds.has(lesson.datasetId) && lesson.exampleIds.every((id) => exampleIds.has(id)))).toBe(true);
    expect(examples.every((example) => datasetIds.has(example.datasetId))).toBe(true);
  });

  it("serves filtered datasets, complete versions, lessons, and examples", async () => {
    const app = createLessonDatasetApp();
    await request(app).get("/health").expect(200).expect(({ body }) => expect(body.service).toBe("lesson-dataset"));
    await request(app).get("/openapi.json").expect(200).expect(({ body }) => expect(body.openapi).toBe("3.1.0"));
    await request(app).get("/v1/datasets?difficulty=beginner").expect(200).expect(({ body }) => { expect(body.total).toBe(1); expect(body.items[0].id).toBe("college"); expect(body.items[0].schemaSql).toBeUndefined(); });
    await request(app).get("/v1/datasets/college/versions/1.0.0").expect(200).expect(({ body }) => { expect(body.tables).toHaveLength(4); expect(body.schemaSql).toContain("CREATE TABLE Students"); expect(body.recordCounts.Students).toBe(3); });
    await request(app).get("/v1/lessons/relational-joins").expect(200).expect(({ body }) => { expect(body.difficulty).toBe("intermediate"); expect(body.examples.length).toBeGreaterThan(0); });
    await request(app).get("/v1/examples?operation=GROUP%20BY").expect(200).expect(({ body }) => expect(body.items[0].id).toBe("enrollment-counts"));
  });

  it("returns stable validation and not-found errors", async () => {
    const app = createLessonDatasetApp();
    await request(app).get("/v1/datasets?difficulty=impossible").expect(400).expect(({ body }) => expect(body.error.code).toBe("VALIDATION_ERROR"));
    await request(app).get("/v1/datasets/unknown/versions/1.0.0").expect(404).expect(({ body }) => expect(body.error.code).toBe("DATASET_VERSION_NOT_FOUND"));
    await request(app).get("/v1/lessons/unknown").expect(404).expect(({ body }) => expect(body.error.code).toBe("LESSON_NOT_FOUND"));
  });
});

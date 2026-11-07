import { DatasetListQuerySchema, ExampleListQuerySchema, LessonListQuerySchema } from "../../shared/src/contracts.js";
import { createServiceApp, finalizeServiceApp, parseRequest } from "../../shared/src/http.js";
import { datasets, examples, lessons } from "./catalog.js";
import { lessonDatasetOpenApi } from "./openapi.js";

function notFound(response: import("express").Response, code: string, message: string) {
  response.status(404).json({ error: { code, message, requestId: response.getHeader("x-request-id") ?? null } });
}

export function createLessonDatasetApp() {
  const app = createServiceApp({ serviceName: "lesson-dataset", version: "1.0.0", openapi: lessonDatasetOpenApi });
  app.get("/v1/datasets", (request, response) => {
    const query = parseRequest(DatasetListQuerySchema, request.query, response);
    if (!query) return;
    const items = datasets.filter((dataset) => (!query.difficulty || dataset.difficulty === query.difficulty) && (!query.version || dataset.version === query.version)).map((dataset) => ({ id: dataset.id, version: dataset.version, name: dataset.name, description: dataset.description, difficulty: dataset.difficulty, dialect: dataset.dialect, recordCounts: dataset.recordCounts }));
    response.json({ items, total: items.length });
  });
  app.get("/v1/datasets/:datasetId/versions/:version", (request, response) => {
    const dataset = datasets.find((item) => item.id === request.params.datasetId && item.version === request.params.version);
    if (!dataset) { notFound(response, "DATASET_VERSION_NOT_FOUND", "The requested dataset version does not exist."); return; }
    response.json(dataset);
  });
  app.get("/v1/lessons", (request, response) => {
    const query = parseRequest(LessonListQuerySchema, request.query, response);
    if (!query) return;
    const items = lessons.filter((lesson) => (!query.difficulty || lesson.difficulty === query.difficulty) && (!query.datasetId || lesson.datasetId === query.datasetId));
    response.json({ items, total: items.length });
  });
  app.get("/v1/lessons/:lessonId", (request, response) => {
    const lesson = lessons.find((item) => item.id === request.params.lessonId);
    if (!lesson) { notFound(response, "LESSON_NOT_FOUND", "The requested lesson does not exist."); return; }
    response.json({ ...lesson, examples: examples.filter((example) => lesson.exampleIds.includes(example.id)) });
  });
  app.get("/v1/examples", (request, response) => {
    const query = parseRequest(ExampleListQuerySchema, request.query, response);
    if (!query) return;
    const items = examples.filter((example) => (!query.difficulty || example.difficulty === query.difficulty) && (!query.operation || example.operation.toLowerCase() === query.operation.toLowerCase()));
    response.json({ items, total: items.length });
  });
  return finalizeServiceApp(app);
}

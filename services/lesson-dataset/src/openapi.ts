export const lessonDatasetOpenApi = {
  openapi: "3.1.0",
  info: { title: "QueryQuest Lesson & Dataset Service", version: "1.0.0", description: "Serves immutable, versioned fictional datasets, SQL examples, and lesson metadata." },
  servers: [{ url: "http://localhost:4103" }],
  paths: {
    "/health": { get: { summary: "Service health", responses: { "200": { description: "Healthy" } } } },
    "/v1/datasets": { get: { summary: "List dataset versions", parameters: [{ name: "difficulty", in: "query", schema: { type: "string", enum: ["beginner", "intermediate", "advanced"] } }, { name: "version", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Dataset summaries" }, "400": { description: "Invalid filter" } } } },
    "/v1/datasets/{datasetId}/versions/{version}": { get: { summary: "Get one complete sample dataset definition", parameters: [{ name: "datasetId", in: "path", required: true, schema: { type: "string" } }, { name: "version", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Schema, fictional seed SQL, and record counts" }, "404": { description: "Unknown dataset version" } } } },
    "/v1/lessons": { get: { summary: "List lessons", parameters: [{ name: "difficulty", in: "query", schema: { type: "string" } }, { name: "datasetId", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Lesson summaries" } } } },
    "/v1/lessons/{lessonId}": { get: { summary: "Get a lesson with referenced examples", parameters: [{ name: "lessonId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Lesson metadata" }, "404": { description: "Unknown lesson" } } } },
    "/v1/examples": { get: { summary: "List predefined SQL examples", parameters: [{ name: "difficulty", in: "query", schema: { type: "string" } }, { name: "operation", in: "query", schema: { type: "string" } }], responses: { "200": { description: "SQL examples" } } } },
  },
} as const;

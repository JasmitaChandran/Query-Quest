export const queryVisualizationOpenApi = {
  openapi: "3.1.0",
  info: { title: "QueryQuest Query Visualization Service", version: "1.0.0", description: "Analyzes supported SQL into logical educational steps. It does not execute SQL or accept database records." },
  servers: [{ url: "http://localhost:4102" }],
  paths: {
    "/health": { get: { summary: "Service health", responses: { "200": { description: "Healthy" } } } },
    "/v1/visualizations/analyze": { post: { summary: "Create educational visualization metadata", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/VisualizationRequest" } } } }, responses: { "200": { description: "Supported flag, explanations, and ordered logical steps" }, "400": { description: "Invalid request" } } } },
    "/v1/visualizations/capabilities": { get: { summary: "List the bounded SQL visualization subset", responses: { "200": { description: "Supported operations and exclusions" } } } },
  },
  components: { schemas: { VisualizationRequest: { type: "object", additionalProperties: false, required: ["sql"], properties: { sql: { type: "string", minLength: 1, maxLength: 20000 }, dialect: { type: "string", enum: ["sqlite", "mysql"], default: "sqlite" }, schema: { type: "array", description: "Optional metadata only; never send row records.", items: { type: "object", additionalProperties: false, required: ["name"], properties: { name: { type: "string" }, columns: { type: "array", items: { type: "string" } } } } } } } } },
} as const;

export const schemaAnalysisOpenApi = {
  openapi: "3.1.0",
  info: { title: "QueryQuest Schema Analysis Service", version: "1.0.0", description: "Validates metadata-only relational schemas and returns ER diagram and SQLite compatibility metadata. This service does not accept table records." },
  servers: [{ url: "http://localhost:4101" }],
  paths: {
    "/health": { get: { summary: "Service health", responses: { "200": { description: "Healthy" } } } },
    "/v1/schema/analyze": {
      post: {
        summary: "Analyze schema metadata",
        description: "Accepts names, type declarations, keys, and indexes only. Imported database records must not be sent.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SchemaAnalysisRequest" } } } },
        responses: { "200": { description: "Analysis and ER diagram metadata" }, "400": { description: "Invalid metadata" } },
      },
    },
  },
  components: {
    schemas: {
      SchemaAnalysisRequest: {
        type: "object",
        additionalProperties: false,
        required: ["tables"],
        properties: {
          databaseName: { type: "string", maxLength: 128 },
          dialect: { type: "string", enum: ["sqlite", "mysql"], default: "sqlite" },
          tables: { type: "array", minItems: 1, maxItems: 256, items: { $ref: "#/components/schemas/Table" } },
        },
      },
      Table: {
        type: "object",
        additionalProperties: false,
        required: ["name", "columns"],
        properties: {
          name: { type: "string" }, type: { type: "string", enum: ["table", "view"] },
          columns: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "type"], properties: { name: { type: "string" }, type: { type: "string" }, notNull: { type: "boolean" }, primaryKey: { type: "boolean" }, defaultValue: {} } } },
          foreignKeys: { type: "array", items: { type: "object", additionalProperties: false, required: ["columns", "referencedTable", "referencedColumns"], properties: { name: { type: "string" }, columns: { type: "array", items: { type: "string" } }, referencedTable: { type: "string" }, referencedColumns: { type: "array", items: { type: "string" } }, onDelete: { type: "string" }, onUpdate: { type: "string" } } } },
          indexes: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "columns"], properties: { name: { type: "string" }, columns: { type: "array", items: { type: "string" } }, unique: { type: "boolean" } } } },
        },
      },
    },
  },
} as const;

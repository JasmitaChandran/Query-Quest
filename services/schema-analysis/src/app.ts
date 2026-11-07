import { SchemaAnalysisRequestSchema } from "../../shared/src/contracts.js";
import { createServiceApp, finalizeServiceApp, parseRequest } from "../../shared/src/http.js";
import { analyzeSchema } from "./analyzer.js";
import { schemaAnalysisOpenApi } from "./openapi.js";

export function createSchemaAnalysisApp() {
  const app = createServiceApp({ serviceName: "schema-analysis", version: "1.0.0", openapi: schemaAnalysisOpenApi });
  app.post("/v1/schema/analyze", (request, response) => {
    const input = parseRequest(SchemaAnalysisRequestSchema, request.body, response);
    if (!input) return;
    response.json(analyzeSchema(input));
  });
  return finalizeServiceApp(app);
}

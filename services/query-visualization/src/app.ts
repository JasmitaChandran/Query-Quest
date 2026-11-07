import { QueryVisualizationRequestSchema } from "../../shared/src/contracts.js";
import { createServiceApp, finalizeServiceApp, parseRequest } from "../../shared/src/http.js";
import { analyzeQuery } from "./analyzer.js";
import { queryVisualizationOpenApi } from "./openapi.js";

export function createQueryVisualizationApp() {
  const app = createServiceApp({ serviceName: "query-visualization", version: "1.0.0", openapi: queryVisualizationOpenApi });
  app.get("/v1/visualizations/capabilities", (_request, response) => response.json({
    supported: ["SELECT", "FROM", "INNER JOIN", "LEFT JOIN", "WHERE", "GROUP BY", "COUNT", "SUM", "AVG", "MIN", "MAX", "DISTINCT", "ORDER BY", "LIMIT", "literal INSERT", "literal UPDATE", "DELETE"],
    excluded: ["CTEs", "subqueries", "compound SELECT", "RIGHT/FULL/CROSS JOIN", "window functions", "INSERT SELECT", "conflict handlers", "arbitrary mutation expressions"],
    execution: false,
  }));
  app.post("/v1/visualizations/analyze", (request, response) => {
    const input = parseRequest(QueryVisualizationRequestSchema, request.body, response);
    if (!input) return;
    response.json(analyzeQuery(input));
  });
  return finalizeServiceApp(app);
}

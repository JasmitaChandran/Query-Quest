import { listen } from "../../shared/src/http.js";
import { createSchemaAnalysisApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "4101", 10);
listen(createSchemaAnalysisApp(), "schema-analysis", port);

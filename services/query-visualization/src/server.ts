import { listen } from "../../shared/src/http.js";
import { createQueryVisualizationApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "4102", 10);
listen(createQueryVisualizationApp(), "query-visualization", port);

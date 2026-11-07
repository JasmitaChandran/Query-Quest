import { listen } from "../../shared/src/http.js";
import { createLessonDatasetApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "4103", 10);
listen(createLessonDatasetApp(), "lesson-dataset", port);

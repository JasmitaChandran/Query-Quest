import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compiled = process.argv.includes("--compiled");
const services = [
  { name: "schema-analysis", source: "services/schema-analysis/src/server.ts", output: "dist-services/schema-analysis/src/server.js" },
  { name: "query-visualization", source: "services/query-visualization/src/server.ts", output: "dist-services/query-visualization/src/server.js" },
  { name: "lesson-dataset", source: "services/lesson-dataset/src/server.ts", output: "dist-services/lesson-dataset/src/server.js" },
];

const children = services.map((service) => {
  const args = compiled ? [resolve(root, service.output)] : ["--import", "tsx", resolve(root, service.source)];
  const child = spawn(process.execPath, args, { cwd: root, env: process.env, stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    process.stderr.write(`${JSON.stringify({ level: "error", service: service.name, event: "exited", code, signal })}\n`);
    shutdown(code ?? 1);
  });
  return child;
});

let shuttingDown = false;
function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach((child) => { if (!child.killed) child.kill("SIGTERM"); });
  const timer = setTimeout(() => process.exit(exitCode), 5000);
  timer.unref();
  Promise.all(children.map((child) => new Promise((resolveChild) => child.once("exit", resolveChild)))).then(() => process.exit(exitCode));
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

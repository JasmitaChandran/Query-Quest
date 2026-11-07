import { randomUUID } from "node:crypto";

import express, { type ErrorRequestHandler, type Express, type Request, type Response } from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import type { ZodType } from "zod";

export type OpenApiDocument = Record<string, unknown>;

export function createServiceApp(input: {
  serviceName: string;
  version: string;
  openapi: OpenApiDocument;
}) {
  const app = express();
  const logger = pino({
    name: input.serviceName,
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie"],
      censor: "[redacted]",
    },
  });

  app.disable("x-powered-by");
  app.use(pinoHttp({
    logger,
    genReqId(request, response) {
      const incoming = request.headers["x-request-id"];
      const requestId = typeof incoming === "string" && incoming.length <= 128 ? incoming : randomUUID();
      response.setHeader("x-request-id", requestId);
      return requestId;
    },
    customProps: () => ({ service: input.serviceName }),
  }));
  app.use(express.json({ limit: "256kb", strict: true }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: input.serviceName, version: input.version, timestamp: new Date().toISOString() });
  });
  app.get("/openapi.json", (_request, response) => response.json(input.openapi));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(input.openapi, { customSiteTitle: `${input.serviceName} API` }));

  return app;
}

export function parseRequest<T>(schema: ZodType<T>, value: unknown, response: Response): T | null {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  response.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "The request did not match the documented API contract.",
      details: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      requestId: response.getHeader("x-request-id") ?? null,
    },
  });
  return null;
}

export function finalizeServiceApp(app: Express) {
  app.use((request: Request, response: Response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `No endpoint matches ${request.method} ${request.path}.`,
        requestId: response.getHeader("x-request-id") ?? null,
      },
    });
  });

  const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
    void _next;
    request.log.error({ err: error }, "request failed");
    const invalidJson = error instanceof SyntaxError && "status" in error && error.status === 400;
    response.status(invalidJson ? 400 : 500).json({
      error: {
        code: invalidJson ? "INVALID_JSON" : "INTERNAL_ERROR",
        message: invalidJson ? "The request body is not valid JSON." : "The service could not complete the request.",
        requestId: response.getHeader("x-request-id") ?? null,
      },
    });
  };
  app.use(errorHandler);
  return app;
}

export function listen(app: Express, serviceName: string, port: number) {
  const server = app.listen(port, () => {
    process.stdout.write(`${JSON.stringify({ level: "info", service: serviceName, event: "listening", port })}\n`);
  });
  const shutdown = (signal: string) => {
    process.stdout.write(`${JSON.stringify({ level: "info", service: serviceName, event: "shutdown", signal })}\n`);
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  return server;
}

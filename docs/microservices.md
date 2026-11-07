# QueryQuest optional microservices

QueryQuest's browser application remains the primary product: sql.js execution, imported database bytes, checkpoints, and IndexedDB persistence continue to work with every backend service stopped. These services are independent, optional demonstrations of production-style backend boundaries.

## Services

| Service | Port | Responsibility | OpenAPI UI |
| --- | ---: | --- | --- |
| Schema Analysis | 4101 | Validate metadata-only schemas, derive keys/relationships, return ER diagram and SQLite affinity information | `http://localhost:4101/docs` |
| Query Visualization | 4102 | Parse a bounded SQL subset and return logical educational steps without executing SQL | `http://localhost:4102/docs` |
| Lesson & Dataset | 4103 | Serve immutable, versioned fictional dataset definitions, examples, and lesson metadata | `http://localhost:4103/docs` |

Every service also exposes `/health` and `/openapi.json`. Services do not call one another and have no shared database.

## Local development

Install root dependencies, then run all services:

```bash
npm install
npm run services:dev
```

Or run one service in its own terminal:

```bash
npm run service:schema
npm run service:visualization
npm run service:lessons
```

Build and run compiled JavaScript:

```bash
npm run services:build
npm run services:start
```

## Docker Compose

```bash
docker compose up --build
```

Each container has an independent process, port, health check, logs, and failure boundary. Stopping any container does not affect the browser application or the other containers.
The image uses `services/package.json`, so backend containers do not install the Next.js application's browser-only dependencies.

## Privacy boundary

- The Schema Analysis API accepts table names, column declarations, keys, and index metadata. Its strict request schema rejects undeclared fields such as table rows.
- The Query Visualization API accepts SQL text and optional table/column names. It does not accept or need database records and never executes the submitted SQL.
- The Lesson & Dataset API is read-only and serves only bundled fictional content.
- QueryQuest does not automatically call these APIs. A future UI integration must obtain explicit user permission before transmitting even metadata and must never include imported records unless a new, explicit record-sharing workflow is designed.

Request bodies are limited to 256 KB. Logs include request metadata and timing but do not serialize request bodies; authorization and cookie headers are redacted.

## Validation and errors

Requests use strict Zod schemas. Unknown properties and invalid values return `400` with a stable `VALIDATION_ERROR` envelope. Invalid JSON, missing routes, and unexpected failures use the same JSON error style and include the response `x-request-id` for correlation.

## Tests

```bash
npm run services:typecheck
npm run services:test
```

Unit tests cover relationship/type analysis, bounded SQL visualization, and catalog filtering. Integration tests exercise health, OpenAPI, validation, success, privacy rejection, and not-found responses through the Express applications without opening network ports.

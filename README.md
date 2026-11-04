# QueryQuest

QueryQuest is an interactive SQL teaching and visualization platform. It runs SQLite entirely in the
browser with sql.js, a dedicated Web Worker, and IndexedDB persistence.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Routes

- `/` — product landing page
- `/import` — import SQLite/SQL files or create independent logical databases
- `/playground` — Monaco SQL IDE with live schema, source records, and searchable query results

## Browser database architecture

- `sql.js` executes real SQLite statements inside a module Web Worker.
- `public/sql-wasm.wasm` is copied from sql.js during `npm install`.
- Database binaries, metadata, and the active database ID are stored in IndexedDB.
- The database manager restores every logical database automatically on reload.
- The public editor permits read-only `SELECT`, `WITH`, and `EXPLAIN` queries. Internal manager APIs
  own write operations until checkpoint support is added.
- Monaco Editor provides SQL highlighting, line numbers, schema-aware completion, formatting, and
  Ctrl/Cmd+Enter execution.
- TanStack Table renders responsive, independently searchable source and result grids.
- A College sample is created on first use with Students, Departments, Courses, Enrollments, and
  foreign-key relationships.

## Project structure

```text
src/
├── app/                 # App Router routes, layouts, and loading states
├── components/
│   ├── import/          # Import workflow UI
│   ├── playground/      # SQL workspace UI
│   └── ui/              # Reusable shadcn-style primitives
├── lib/
│   └── database/        # Worker protocol, manager, persistence, and sample schema
├── store/               # Zustand interface and database state
└── test/                # Shared unit-test setup
```

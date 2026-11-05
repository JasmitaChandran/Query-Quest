# QueryQuest portable workspace format

QueryQuest exports a UTF-8 JSON file with the suffix `.queryquest.json`.

- `format`: always `queryquest-workspace`
- `version`: currently `1`
- `exportedAt`: ISO-8601 timestamp
- `workspace`: workspace identity and display metadata
- `settings`: editor SQL, active secondary panel, and explorer state
- `activeDatabaseId`: the selected database, or `null`
- `databases`: database metadata, ER-diagram positions, and complete SQLite bytes encoded as base64
- `savedQueries`: named SQL statements belonging to the workspace
- `queryHistory`: execution timestamps, status, duration, operation, SQL, and database references

SQLite bytes are exported directly from sql.js. Consequently, tables, records, indexes, triggers, views, and foreign-key declarations are preserved by SQLite itself rather than reconstructed from JSON metadata.

Imports validate the format version and load every SQLite payload in an isolated worker database before writing anything. The final workspace, database files, initial checkpoints, settings, layouts, saved queries, and query history are committed in one IndexedDB transaction. An existing workspace is replaced only after explicit confirmation.

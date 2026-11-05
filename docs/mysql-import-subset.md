# QueryQuest MySQL dump import subset

QueryQuest can convert a bounded subset of MySQL `.sql` dumps produced by `mysqldump` or MySQL Workbench into a new browser-local SQLite database. This is a compatibility converter, not a MySQL server or a full MySQL emulator.

## Supported statements

- Common `CREATE TABLE` statements.
- Literal `INSERT INTO … VALUES …` statements, with or without an explicit column list.
- Inline or table-level primary keys and unique keys.
- Basic single- or multi-column foreign keys, including SQLite-compatible `ON DELETE` and `ON UPDATE` actions.
- Compatible normal and unique indexes declared inside `CREATE TABLE`, with `CREATE INDEX`, or with `ALTER TABLE … ADD KEY`.
- `ALTER TABLE … ADD CONSTRAINT` for supported primary, unique, and foreign-key constraints. These are incorporated into the generated SQLite `CREATE TABLE` statement.
- MySQL backtick identifiers and string, numeric, `NULL`, boolean, bit, and hexadecimal literal values.

Dump housekeeping statements such as `SET`, `USE`, `DROP TABLE`, `LOCK TABLES`, `UNLOCK TABLES`, MySQL version comments, key toggles, and transaction wrappers are intentionally ignored because every import creates a new isolated SQLite database.

## Type conversion

| MySQL declarations | SQLite declaration | Notes |
| --- | --- | --- |
| `TINYINT`, `SMALLINT`, `MEDIUMINT`, `INT`, `INTEGER`, `BIGINT`, `YEAR`, `BIT`, `BOOL`, `BOOLEAN` | `INTEGER` | `UNSIGNED` and display widths are not enforced. Values must fit QueryQuest's safe numeric range. |
| `FLOAT`, `DOUBLE`, `REAL` | `REAL` | Uses SQLite floating-point behavior. |
| `DECIMAL`, `NUMERIC`, `FIXED` | `NUMERIC` | Precision and scale are not strictly enforced by SQLite. |
| `CHAR`, `VARCHAR`, all `TEXT` variants, `ENUM`, `SET`, `JSON`, date/time declarations | `TEXT` | Length limits, allowed-value lists, native JSON validation, and MySQL temporal behavior are not emulated. |
| `BINARY`, `VARBINARY`, all `BLOB` variants | `BLOB` | Hexadecimal literal data is supported. |

A compatible integer `AUTO_INCREMENT` column that is the sole primary key becomes `INTEGER PRIMARY KEY AUTOINCREMENT`. MySQL sequence seed table options are not copied; SQLite continues from the largest imported key.

## Explicitly unsupported

- Stored procedures, stored functions, triggers, events, views, and `DELIMITER` blocks.
- `FULLTEXT`, `SPATIAL`, prefix-length, functional, and expression indexes.
- Generated columns and `ON UPDATE` column expressions.
- `INSERT IGNORE`, `REPLACE`, `ON DUPLICATE KEY UPDATE`, and `INSERT … SELECT`.
- Arbitrary expressions or functions in imported row values.
- Cross-database object references involving multiple MySQL schemas, and unsupported `ALTER TABLE` operations. A single schema qualifier is safely removed when its tables are placed into one SQLite database.
- MySQL-specific collations, character-set semantics, storage engines, partitions, and server configuration.

QueryQuest reports unsupported statements and incompatible schema elements in the preview. Conversion errors disable the import button; warnings remain visible so behavior is never silently discarded.

## Safety and atomicity

The uploaded script is parsed with the MySQL dialect of `node-sql-parser`. QueryQuest builds a structured intermediate model, generates only supported SQLite schema statements, and binds imported row values as SQL parameters. The original uploaded SQL is never executed.

Import occurs in a newly created in-memory sql.js database. Tables, data, indexes, row constraints, and referential integrity are validated before the SQLite bytes and metadata are saved to IndexedDB. On failure, the temporary database is dropped and existing databases remain unchanged.

import type { BindParams, Database, QueryExecResult } from "sql.js";

import type {
  SQLiteDeclaredType,
  SQLiteForeignKeyAction,
  TableColumnDefinition,
  TableDefinition,
  TableMigrationInspection,
  TableSchemaMigrationInput,
  TableSchemaMigrationResult,
  TableSchemaObject,
} from "@/lib/database/types";
import {
  buildCreateTableSql,
  quoteIdentifier,
  SQLITE_DECLARED_TYPES,
  validateIdentifier,
} from "@/lib/database/visual-sql";

const TYPE_SET = new Set<string>(SQLITE_DECLARED_TYPES);
const FOREIGN_KEY_ACTIONS = new Set<SQLiteForeignKeyAction>([
  "NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT", "CASCADE",
]);

function lastResult(results: QueryExecResult[]) {
  return results.at(-1);
}

function rows(database: Database, sql: string, parameters?: BindParams) {
  return lastResult(database.exec(sql, parameters))?.values ?? [];
}

function scalar(database: Database, sql: string) {
  return rows(database, sql)[0]?.[0];
}

function objectSql(database: Database, type: string, name: string) {
  const statement = database.prepare("SELECT sql FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1");
  try {
    statement.bind([type, name]);
    return statement.step() ? String(statement.get()[0] ?? "") : "";
  } finally {
    statement.free();
  }
}

function splitTopLevel(value: string) {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let bracket = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (quote) {
      if (character === quote) {
        if (next === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (bracket) {
      if (character === "]") bracket = false;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") quote = character;
    else if (character === "[") bracket = true;
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function tableBody(createSql: string) {
  const start = createSql.indexOf("(");
  if (start < 0) throw new Error("The table CREATE statement has no column list.");
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let bracket = false;
  for (let index = start; index < createSql.length; index += 1) {
    const character = createSql[index];
    const next = createSql[index + 1];
    if (quote) {
      if (character === quote) {
        if (next === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (bracket) {
      if (character === "]") bracket = false;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") quote = character;
    else if (character === "[") bracket = true;
    else if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return createSql.slice(start + 1, index);
    }
  }
  throw new Error("The table CREATE statement has unbalanced parentheses.");
}

function unquoteIdentifier(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).replaceAll('""', '"');
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) return trimmed.slice(1, -1).replaceAll("``", "`");
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed.slice(1, -1).replaceAll("]]", "]");
  return trimmed;
}

function extractParenthesizedExpressions(segment: string, keyword: string) {
  const expressions: string[] = [];
  const keywordPattern = new RegExp(`\\b${keyword}\\s*\\(`, "ig");
  let match: RegExpExecArray | null;
  while ((match = keywordPattern.exec(segment))) {
    const open = segment.indexOf("(", match.index);
    let depth = 0;
    let quote: "'" | '"' | "`" | null = null;
    for (let index = open; index < segment.length; index += 1) {
      const character = segment[index];
      const next = segment[index + 1];
      if (quote) {
        if (character === quote) {
          if (next === quote) index += 1;
          else quote = null;
        }
        continue;
      }
      if (character === "'" || character === '"' || character === "`") quote = character;
      else if (character === "(") depth += 1;
      else if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          expressions.push(segment.slice(open + 1, index).trim());
          keywordPattern.lastIndex = index + 1;
          break;
        }
      }
    }
  }
  return expressions;
}

function parseDeclaredType(declared: string, columnName: string) {
  const normalized = declared.trim().toUpperCase();
  const match = /^([A-Z]+)(?:\s*\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\))?$/.exec(normalized);
  if (!match || !TYPE_SET.has(match[1])) {
    throw new Error(`Column “${columnName}” uses declared type “${declared || "(none)"}”, which the visual schema editor cannot preserve.`);
  }
  const type = match[1] as SQLiteDeclaredType;
  if ((type === "VARCHAR" || type === "CHAR") && (!match[2] || match[3])) {
    throw new Error(`Column “${columnName}” has an unsupported ${type} declaration.`);
  }
  if (type === "DECIMAL" && (!match[2] || match[3] === undefined)) {
    throw new Error(`Column “${columnName}” must declare DECIMAL precision and scale for visual editing.`);
  }
  if (!["VARCHAR", "CHAR", "DECIMAL"].includes(type) && match[2]) {
    throw new Error(`Column “${columnName}” has type parameters the visual schema editor cannot preserve.`);
  }
  return {
    type,
    length: type === "VARCHAR" || type === "CHAR" ? Number(match[2]) : null,
    precision: type === "DECIMAL" ? Number(match[2]) : null,
    scale: type === "DECIMAL" ? Number(match[3]) : null,
  };
}

function assertSupportedCreateSql(createSql: string) {
  const unsupported = [
    [/\bWITHOUT\s+ROWID\b/i, "WITHOUT ROWID tables"],
    [/\bSTRICT\s*$/i, "STRICT tables"],
    [/\bGENERATED\b|\bAS\s*\(/i, "generated columns"],
    [/\bCOLLATE\b/i, "column collations"],
    [/\bON\s+CONFLICT\b/i, "ON CONFLICT clauses"],
    [/\bDEFERRABLE\b|\bINITIALLY\b/i, "deferred constraints"],
    [/\bCONSTRAINT\s+[A-Za-z_"`\[]/i, "named constraints"],
  ] as const;
  const found = unsupported.find(([pattern]) => pattern.test(createSql));
  if (found) throw new Error(`This table uses ${found[1]}, which cannot yet be round-tripped safely by the visual schema editor.`);
}

function schemaObjects(database: Database, type: "index" | "trigger", tableName: string): TableSchemaObject[] {
  const statement = database.prepare("SELECT name, sql FROM sqlite_master WHERE type = ? AND tbl_name = ? AND sql IS NOT NULL ORDER BY name");
  const objects: TableSchemaObject[] = [];
  try {
    statement.bind([type, tableName]);
    while (statement.step()) {
      const [nameValue, sqlValue] = statement.get();
      const name = String(nameValue);
      let columns: string[] = [];
      let hasExpressions = false;
      if (type === "index") {
        const info = rows(database, `PRAGMA index_xinfo(${quoteIdentifier(name)})`);
        columns = info.filter((row) => Number(row[5]) === 1 && Number(row[1]) >= 0).map((row) => String(row[2]));
        hasExpressions = info.some((row) => Number(row[5]) === 1 && Number(row[1]) < 0);
      }
      objects.push({ name, sql: String(sqlValue), columns, hasExpressions });
    }
  } finally {
    statement.free();
  }
  return objects;
}

function mentionsIdentifier(sql: string, identifier: string) {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:\\b${escaped}\\b|"${escaped}"|\`${escaped}\`|\\[${escaped}\\])`, "i").test(sql);
}

function dependentViews(database: Database, tableName: string): TableSchemaObject[] {
  return rows(database, "SELECT name, sql FROM sqlite_master WHERE type = 'view' AND sql IS NOT NULL ORDER BY name")
    .map(([name, sql]) => ({ name: String(name), sql: String(sql), columns: [] }))
    .filter((view) => mentionsIdentifier(view.sql, tableName));
}

function resolveForeignKeys(database: Database, tableName: string, columns: TableColumnDefinition[]) {
  const foreignRows = rows(database, `PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`);
  const grouped = new Map<number, typeof foreignRows>();
  for (const row of foreignRows) grouped.set(Number(row[0]), [...(grouped.get(Number(row[0])) ?? []), row]);
  for (const group of grouped.values()) {
    if (group.length !== 1 || Number(group[0][1]) !== 0) {
      throw new Error("Composite foreign keys cannot yet be round-tripped by the visual schema editor.");
    }
    const row = group[0];
    const fromColumn = String(row[3]);
    const targetTable = String(row[2]);
    let targetColumn = row[4] === null ? "" : String(row[4]);
    if (!targetColumn) {
      const targetPrimary = rows(database, `PRAGMA table_info(${quoteIdentifier(targetTable)})`).filter((item) => Number(item[5]) > 0);
      if (targetPrimary.length !== 1) throw new Error(`Foreign key on “${fromColumn}” omits a target column and cannot be resolved safely.`);
      targetColumn = String(targetPrimary[0][1]);
    }
    const onUpdate = String(row[5]).toUpperCase() as SQLiteForeignKeyAction;
    const onDelete = String(row[6]).toUpperCase() as SQLiteForeignKeyAction;
    const match = String(row[7]).toUpperCase();
    if (!FOREIGN_KEY_ACTIONS.has(onUpdate) || !FOREIGN_KEY_ACTIONS.has(onDelete) || match !== "NONE") {
      throw new Error(`Foreign key on “${fromColumn}” uses options the visual schema editor cannot preserve.`);
    }
    const column = columns.find((item) => item.name.toLowerCase() === fromColumn.toLowerCase());
    if (!column) throw new Error(`Foreign key references missing source column “${fromColumn}”.`);
    column.foreignKey = { table: targetTable, column: targetColumn, onDelete, onUpdate };
  }
}

export function inspectTableForMigration(database: Database, tableName: string): TableMigrationInspection {
  validateIdentifier(tableName, "Table name");
  const createSql = objectSql(database, "table", tableName);
  if (!createSql) throw new Error(`Table “${tableName}” does not exist or is a view.`);
  assertSupportedCreateSql(createSql);

  const segments = splitTopLevel(tableBody(createSql));
  const columnSegments = new Map<string, string>();
  const tableChecks: string[] = [];
  for (const segment of segments) {
    if (/^\s*(?:FOREIGN\s+KEY|PRIMARY\s+KEY|UNIQUE|CHECK)\b/i.test(segment)) {
      if (/^\s*CHECK\b/i.test(segment)) tableChecks.push(...extractParenthesizedExpressions(segment, "CHECK"));
      continue;
    }
    const token = /^("(?:""|[^"])+"|`(?:``|[^`])+`|\[(?:\]\]|[^\]])+\]|[A-Za-z_][A-Za-z0-9_]*)/.exec(segment)?.[1];
    if (!token) throw new Error("A column declaration could not be read safely.");
    columnSegments.set(unquoteIdentifier(token).toLowerCase(), segment);
  }

  const info = rows(database, `PRAGMA table_info(${quoteIdentifier(tableName)})`);
  if (!info.length) throw new Error("The table has no editable columns.");
  const columns: TableColumnDefinition[] = info.map((row) => {
    const name = String(row[1]);
    validateIdentifier(name, `Column “${name}”`);
    const declared = parseDeclaredType(String(row[2] ?? ""), name);
    const segment = columnSegments.get(name.toLowerCase()) ?? "";
    const checks = extractParenthesizedExpressions(segment, "CHECK");
    if (checks.length > 1) throw new Error(`Column “${name}” has multiple CHECK clauses that cannot be represented separately.`);
    return {
      name,
      ...declared,
      primaryKey: Number(row[5]) > 0,
      autoincrement: /\bAUTOINCREMENT\b/i.test(segment),
      notNull: Boolean(row[3]),
      unique: false,
      hasDefault: row[4] !== null,
      defaultValue: null,
      defaultKind: row[4] !== null ? "expression" : "literal",
      defaultExpression: row[4] === null ? "" : String(row[4]),
      checkExpression: checks[0] ?? "",
      foreignKey: null,
    };
  });

  const uniqueConstraints: string[][] = [];
  for (const index of rows(database, `PRAGMA index_list(${quoteIdentifier(tableName)})`)) {
    if (String(index[3]) !== "u") continue;
    const names = rows(database, `PRAGMA index_info(${quoteIdentifier(String(index[1]))})`).map((row) => String(row[2]));
    if (names.length === 1) {
      const column = columns.find((item) => item.name === names[0]);
      if (column) column.unique = true;
    } else if (names.length > 1) uniqueConstraints.push(names);
  }
  resolveForeignKeys(database, tableName, columns);

  const allTables = rows(database, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((row) => String(row[0]));
  const referencingForeignKeys = allTables.flatMap((otherTable) => rows(database, `PRAGMA foreign_key_list(${quoteIdentifier(otherTable)})`)
    .filter((row) => String(row[2]).toLowerCase() === tableName.toLowerCase() && otherTable.toLowerCase() !== tableName.toLowerCase())
    .map((row) => ({ table: otherTable, fromColumn: String(row[3]), toColumn: String(row[4] ?? "") })));

  const indexes = schemaObjects(database, "index", tableName);
  const triggers = schemaObjects(database, "trigger", tableName);
  const views = dependentViews(database, tableName);
  const warnings = [
    indexes.length ? `${indexes.length} user-created index${indexes.length === 1 ? "" : "es"} will be recreated.` : "",
    triggers.length ? `${triggers.length} trigger${triggers.length === 1 ? "" : "s"} will be recreated.` : "",
    views.length ? `${views.length} dependent view${views.length === 1 ? "" : "s"} must remain valid.` : "",
    referencingForeignKeys.length ? `${referencingForeignKeys.length} external foreign-key reference${referencingForeignKeys.length === 1 ? "" : "s"} must remain valid.` : "",
  ].filter(Boolean);

  return {
    tableName,
    definition: { name: tableName, columns, uniqueConstraints, checks: tableChecks },
    rowCount: Number(scalar(database, `SELECT COUNT(*) FROM ${quoteIdentifier(tableName)}`) ?? 0),
    indexes,
    triggers,
    dependentViews: views,
    referencingForeignKeys,
    warnings,
  };
}

function assertMigrationDependencies(inspection: TableMigrationInspection, input: TableSchemaMigrationInput) {
  const mappings = new Map(input.columnMappings.filter((item) => item.sourceColumn).map((item) => [item.sourceColumn!.toLowerCase(), item.targetColumn]));
  const changed = inspection.definition.columns
    .map((column) => ({ source: column.name, target: mappings.get(column.name.toLowerCase()) }))
    .filter((item) => !item.target || item.target.toLowerCase() !== item.source.toLowerCase());
  if (!changed.length) return;

  const names = changed.map((item) => item.source.toLowerCase());
  const blockedIndexes = inspection.indexes.filter((index) => index.hasExpressions || index.columns.some((column) => names.includes(column.toLowerCase())));
  if (blockedIndexes.length) throw new Error(`Rename or remove is blocked because ${blockedIndexes.map((item) => `index “${item.name}”`).join(", ")} depends on the affected columns.`);
  if (inspection.triggers.length) throw new Error(`Rename or remove is blocked because trigger${inspection.triggers.length === 1 ? "" : "s"} ${inspection.triggers.map((item) => `“${item.name}”`).join(", ")} may reference the affected columns.`);
  if (inspection.dependentViews.length) throw new Error(`Rename or remove is blocked because view${inspection.dependentViews.length === 1 ? "" : "s"} ${inspection.dependentViews.map((item) => `“${item.name}”`).join(", ")} may reference the affected columns.`);
  const blockedReferences = inspection.referencingForeignKeys.filter((item) => names.includes(item.toColumn.toLowerCase()));
  if (blockedReferences.length) throw new Error(`Rename or remove is blocked because foreign keys from ${blockedReferences.map((item) => `“${item.table}.${item.fromColumn}”`).join(", ")} reference the affected columns.`);
}

function assertForeignKeyTargets(database: Database, input: TableSchemaMigrationInput) {
  for (const column of input.definition.columns) {
    const foreignKey = column.foreignKey;
    if (!foreignKey) continue;
    if (foreignKey.table.toLowerCase() === input.definition.name.toLowerCase() || foreignKey.table.toLowerCase() === input.sourceTableName.toLowerCase()) {
      if (!input.definition.columns.some((item) => item.name.toLowerCase() === foreignKey.column.toLowerCase())) {
        throw new Error(`Foreign key on “${column.name}” references missing proposed column “${foreignKey.column}”.`);
      }
      continue;
    }
    const targetColumns = rows(database, `PRAGMA table_info(${quoteIdentifier(foreignKey.table)})`).map((row) => String(row[1]).toLowerCase());
    if (!targetColumns.includes(foreignKey.column.toLowerCase())) {
      throw new Error(`Foreign key on “${column.name}” references unavailable column “${foreignKey.table}.${foreignKey.column}”.`);
    }
  }
}

export function buildMigrationPreview(input: TableSchemaMigrationInput) {
  const create = buildCreateTableSql({ ...input.definition, name: "__queryquest_replacement" }).replace(/;$/, "");
  const mapped = input.columnMappings.filter((item) => item.sourceColumn);
  const targets = mapped.map((item) => quoteIdentifier(item.targetColumn)).join(", ");
  const sources = mapped.map((item) => quoteIdentifier(item.sourceColumn!)).join(", ");
  return [
    "PRAGMA foreign_keys = OFF;",
    "BEGIN IMMEDIATE;",
    create + ";",
    mapped.length ? `INSERT INTO "__queryquest_replacement" (${targets}) SELECT ${sources} FROM ${quoteIdentifier(input.sourceTableName)};` : "-- Existing rows receive defaults for every proposed column.",
    `DROP TABLE ${quoteIdentifier(input.sourceTableName)};`,
    `ALTER TABLE "__queryquest_replacement" RENAME TO ${quoteIdentifier(input.sourceTableName)};`,
    ...(input.definition.name !== input.sourceTableName ? [`ALTER TABLE ${quoteIdentifier(input.sourceTableName)} RENAME TO ${quoteIdentifier(input.definition.name)};`] : []),
    "-- Compatible indexes and triggers are recreated, then integrity and foreign keys are checked.",
    "COMMIT;",
    "PRAGMA foreign_keys = ON;",
  ].join("\n");
}

export function migrateTableSchema(database: Database, input: TableSchemaMigrationInput): TableSchemaMigrationResult {
  validateIdentifier(input.sourceTableName, "Current table name");
  buildCreateTableSql(input.definition);
  const inspection = inspectTableForMigration(database, input.sourceTableName);
  assertMigrationDependencies(inspection, input);
  assertForeignKeyTargets(database, input);

  const sourceColumns = new Set(inspection.definition.columns.map((column) => column.name.toLowerCase()));
  const targetColumns = new Set(input.definition.columns.map((column) => column.name.toLowerCase()));
  if (input.columnMappings.length !== input.definition.columns.length) throw new Error("Every proposed column needs one migration mapping.");
  const mappedTargets = new Set<string>();
  const mappedSources = new Set<string>();
  for (const mapping of input.columnMappings) {
    if (!targetColumns.has(mapping.targetColumn.toLowerCase())) throw new Error(`Migration mapping references missing proposed column “${mapping.targetColumn}”.`);
    if (mappedTargets.has(mapping.targetColumn.toLowerCase())) throw new Error(`Proposed column “${mapping.targetColumn}” is mapped more than once.`);
    mappedTargets.add(mapping.targetColumn.toLowerCase());
    if (mapping.sourceColumn) {
      if (!sourceColumns.has(mapping.sourceColumn.toLowerCase())) throw new Error(`Migration mapping references missing current column “${mapping.sourceColumn}”.`);
      if (mappedSources.has(mapping.sourceColumn.toLowerCase())) throw new Error(`Current column “${mapping.sourceColumn}” is mapped more than once.`);
      mappedSources.add(mapping.sourceColumn.toLowerCase());
    }
  }
  const mappingByTarget = new Map(input.columnMappings.map((item) => [item.targetColumn.toLowerCase(), item.sourceColumn]));
  if (inspection.rowCount > 0) {
    const impossible = input.definition.columns.find((column) => !mappingByTarget.get(column.name.toLowerCase()) && column.notNull && !column.hasDefault && !column.primaryKey);
    if (impossible) throw new Error(`New NOT NULL column “${impossible.name}” needs a default before existing rows can be migrated.`);
  }

  if (input.definition.name.toLowerCase() !== input.sourceTableName.toLowerCase()) {
    const collision = rows(database, "SELECT 1 FROM sqlite_master WHERE lower(name) = lower(?) LIMIT 1", [input.definition.name]);
    if (collision.length) throw new Error(`A database object named “${input.definition.name}” already exists.`);
  }

  const baselineForeignKeyErrors = rows(database, "PRAGMA foreign_key_check").length;
  const tempName = "__queryquest_replacement";
  if (rows(database, "SELECT 1 FROM sqlite_master WHERE name = ? LIMIT 1", [tempName]).length) throw new Error("A reserved migration table already exists. Rename it before editing this schema.");
  const tempDefinition: TableDefinition = {
    ...input.definition,
    name: tempName,
    columns: input.definition.columns.map((column) => ({
      ...column,
      foreignKey: column.foreignKey && column.foreignKey.table.toLowerCase() === input.definition.name.toLowerCase()
        ? { ...column.foreignKey, table: input.sourceTableName }
        : column.foreignKey,
    })),
  };

  database.run("PRAGMA foreign_keys = OFF");
  database.run("BEGIN IMMEDIATE");
  try {
    database.run(buildCreateTableSql(tempDefinition));
    const mapped = input.columnMappings.filter((item) => item.sourceColumn);
    if (inspection.rowCount && mapped.length) {
      database.run(`INSERT INTO ${quoteIdentifier(tempName)} (${mapped.map((item) => quoteIdentifier(item.targetColumn)).join(", ")}) SELECT ${mapped.map((item) => quoteIdentifier(item.sourceColumn!)).join(", ")} FROM ${quoteIdentifier(input.sourceTableName)}`);
    } else if (inspection.rowCount) {
      const insert = database.prepare(`INSERT INTO ${quoteIdentifier(tempName)} DEFAULT VALUES`);
      try { for (let count = 0; count < inspection.rowCount; count += 1) insert.run(); }
      finally { insert.free(); }
    }
    const copiedRows = Number(scalar(database, `SELECT COUNT(*) FROM ${quoteIdentifier(tempName)}`) ?? 0);
    if (copiedRows !== inspection.rowCount) throw new Error(`Migration row-count check failed: expected ${inspection.rowCount}, copied ${copiedRows}.`);

    database.run(`DROP TABLE ${quoteIdentifier(input.sourceTableName)}`);
    database.run(`ALTER TABLE ${quoteIdentifier(tempName)} RENAME TO ${quoteIdentifier(input.sourceTableName)}`);
    for (const index of inspection.indexes) database.run(index.sql);
    for (const trigger of inspection.triggers) database.run(trigger.sql);
    if (input.definition.name !== input.sourceTableName) {
      database.run(`ALTER TABLE ${quoteIdentifier(input.sourceTableName)} RENAME TO ${quoteIdentifier(input.definition.name)}`);
    }
    for (const view of inspection.dependentViews) database.exec(`SELECT * FROM ${quoteIdentifier(view.name)} LIMIT 0`);
    const finalRowCount = Number(scalar(database, `SELECT COUNT(*) FROM ${quoteIdentifier(input.definition.name)}`) ?? 0);
    if (finalRowCount !== inspection.rowCount) throw new Error("Final row-count validation failed.");
    const foreignKeyErrors = rows(database, "PRAGMA foreign_key_check").length;
    if (foreignKeyErrors > baselineForeignKeyErrors) throw new Error(`The proposed schema creates ${foreignKeyErrors - baselineForeignKeyErrors} new foreign-key violation(s).`);
    const integrity = String(scalar(database, "PRAGMA integrity_check") ?? "");
    if (integrity.toLowerCase() !== "ok") throw new Error(`SQLite integrity check failed: ${integrity}`);
    database.run("COMMIT");
    return {
      tableName: input.definition.name,
      rowCount: finalRowCount,
      recreatedIndexes: inspection.indexes.length,
      recreatedTriggers: inspection.triggers.length,
    };
  } catch (error) {
    try { database.run("ROLLBACK"); } catch { /* SQLite already rolled back. */ }
    throw error;
  } finally {
    database.run("PRAGMA foreign_keys = ON");
  }
}

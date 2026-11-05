import { Parser, type AST } from "node-sql-parser";

import type { SqlValue } from "@/lib/database/types";

export type MySqlImportIssue = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  statement?: number;
};

export type MySqlColumnPreview = {
  name: string;
  mysqlType: string;
  sqliteType: "INTEGER" | "REAL" | "NUMERIC" | "TEXT" | "BLOB";
  notNull: boolean;
  primaryKey: boolean;
  autoIncrement: boolean;
};

export type MySqlConvertedTable = {
  name: string;
  createSql: string;
  columns: MySqlColumnPreview[];
  rowCount: number;
  previewRows: SqlValue[][];
  indexes: string[];
};

export type MySqlInsertBatch = {
  tableName: string;
  columns: string[];
  rows: SqlValue[][];
};

export type ConvertedMySqlDump = {
  dialect: "mysql";
  statementCount: number;
  tables: MySqlConvertedTable[];
  insertBatches: MySqlInsertBatch[];
  indexSql: string[];
  issues: MySqlImportIssue[];
};

type AstNode = Record<string, unknown>;
type ColumnModel = MySqlColumnPreview & {
  defaultSql: string | null;
  unique: boolean;
};
type ForeignKeyModel = {
  name: string | null;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete: string | null;
  onUpdate: string | null;
};
type IndexModel = { name: string; columns: string[]; unique: boolean };
type TableModel = {
  name: string;
  columns: ColumnModel[];
  primaryKey: string[];
  uniqueConstraints: string[][];
  foreignKeys: ForeignKeyModel[];
  checks: string[];
  indexes: IndexModel[];
  rowCount: number;
  previewRows: SqlValue[][];
};

const parser = new Parser();
const INTEGER_TYPES = new Set(["TINYINT", "SMALLINT", "MEDIUMINT", "INT", "INTEGER", "BIGINT", "YEAR", "BOOL", "BOOLEAN", "BIT"]);
const REAL_TYPES = new Set(["FLOAT", "DOUBLE", "REAL"]);
const NUMERIC_TYPES = new Set(["DECIMAL", "NUMERIC", "FIXED"]);
const TEXT_TYPES = new Set(["CHAR", "VARCHAR", "TINYTEXT", "TEXT", "MEDIUMTEXT", "LONGTEXT", "ENUM", "SET", "JSON", "DATE", "DATETIME", "TIMESTAMP", "TIME"]);
const BLOB_TYPES = new Set(["BINARY", "VARBINARY", "TINYBLOB", "BLOB", "MEDIUMBLOB", "LONGBLOB"]);
const FOREIGN_KEY_ACTIONS = new Set(["NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT", "CASCADE"]);
const CHECK_OPERATORS = new Set(["AND", "OR", "=", "!=", "<>", ">", ">=", "<", "<=", "IS", "IS NOT", "+", "-", "*", "/", "%", "LIKE", "NOT LIKE", "IN", "NOT IN"]);

function node(value: unknown): AstNode | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AstNode : null;
}

function nodes(value: unknown): AstNode[] {
  return Array.isArray(value) ? value.map(node).filter((item): item is AstNode => Boolean(item)) : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function quoteIdentifier(value: string) {
  if (!value || value.includes("\0")) throw new Error("MySQL identifiers cannot be empty or contain null bytes.");
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function addIssue(issues: MySqlImportIssue[], issue: MySqlImportIssue) {
  if (!issues.some((item) => item.code === issue.code && item.message === issue.message && item.statement === issue.statement)) issues.push(issue);
}

function addOnce(issues: MySqlImportIssue[], severity: MySqlImportIssue["severity"], code: string, message: string) {
  if (!issues.some((item) => item.code === code)) issues.push({ severity, code, message });
}

export function looksLikeMySqlDump(source: string) {
  return /(?:--\s*MySQL dump|\bmysqldump\b|\/\*!\d{5}|\bENGINE\s*=|\bAUTO_INCREMENT\b|\bLOCK TABLES\b|\bUNLOCK TABLES\b|`[^`]+`)/i.test(source);
}

function splitStatements(source: string) {
  const statements: string[] = [];
  let current = "";
  let state: "normal" | "single" | "double" | "backtick" | "line" | "block" = "normal";
  let executableComments = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (state === "line") {
      if (character === "\n") { state = "normal"; current += "\n"; }
      continue;
    }
    if (state === "block") {
      if (character === "*" && next === "/") { state = "normal"; index += 1; current += " "; }
      continue;
    }
    if (state !== "normal") {
      current += character;
      if (character === "\\") {
        if (next !== undefined) { current += next; index += 1; }
        continue;
      }
      const quote = state === "single" ? "'" : state === "double" ? '"' : "`";
      if (character === quote && next === quote) { current += next; index += 1; continue; }
      if (character === quote) state = "normal";
      continue;
    }

    if (character === "-" && next === "-" && /\s/.test(source[index + 2] ?? "")) { state = "line"; index += 1; continue; }
    if (character === "#") { state = "line"; continue; }
    if (character === "/" && next === "*") {
      if (source[index + 2] === "!") executableComments += 1;
      state = "block"; index += 1; continue;
    }
    if (character === "'") state = "single";
    else if (character === '"') state = "double";
    else if (character === "`") state = "backtick";
    if (character === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
    } else current += character;
  }
  const trailing = current.trim();
  if (trailing) statements.push(trailing);
  return { statements, executableComments };
}

function tableRef(value: unknown, context: string, issues: MySqlImportIssue[], statement: number) {
  const reference = Array.isArray(value) ? node(value[0]) : node(value);
  const table = text(reference?.table);
  if (!table) {
    addIssue(issues, { severity: "error", code: "missing-table", message: `${context} does not contain a supported table name.`, statement });
    return null;
  }
  if (reference?.db) addIssue(issues, { severity: "info", code: `mysql-schema:${String(reference.db).toLowerCase()}`, message: `MySQL schema qualifier “${String(reference.db)}” will be removed because SQLite stores these tables in one database.` });
  return table;
}

function columnNames(value: unknown, issues: MySqlImportIssue[], statement: number, context: string) {
  const result: string[] = [];
  for (const item of nodes(value)) {
    const column = text(item.column);
    if (!column || item.suffix) {
      addIssue(issues, { severity: "error", code: "unsupported-index-expression", message: `${context} contains a prefix length or expression. Only complete column references are supported.`, statement });
      continue;
    }
    result.push(column);
  }
  return result;
}

function declaredType(definition: AstNode) {
  const dataType = (text(definition.dataType) ?? "").toUpperCase();
  const length = typeof definition.length === "number" || typeof definition.length === "string" ? String(definition.length) : null;
  const scale = typeof definition.scale === "number" || typeof definition.scale === "string" ? String(definition.scale) : null;
  return length ? `${dataType}(${length}${scale ? `,${scale}` : ""})` : dataType;
}

function convertType(definition: AstNode, issues: MySqlImportIssue[], tableName: string, columnName: string, statement: number) {
  const mysqlType = declaredType(definition);
  const base = (text(definition.dataType) ?? "").toUpperCase();
  const suffix = Array.isArray(definition.suffix) ? definition.suffix.map(String).join(" ").toUpperCase() : "";
  if (suffix.includes("UNSIGNED") || suffix.includes("ZEROFILL")) addOnce(issues, "warning", "integer-modifiers", "UNSIGNED and ZEROFILL modifiers are not enforced by SQLite; values still must fit SQLite's numeric range.");
  if (["VARCHAR", "CHAR"].includes(base)) addOnce(issues, "warning", "text-length", "SQLite uses TEXT affinity and does not enforce MySQL CHAR/VARCHAR length limits.");
  if (["DECIMAL", "NUMERIC", "FIXED"].includes(base)) addOnce(issues, "warning", "decimal-affinity", "MySQL DECIMAL precision and scale become SQLite NUMERIC affinity and are not strictly enforced.");
  if (["DATE", "DATETIME", "TIMESTAMP", "TIME"].includes(base)) addOnce(issues, "warning", "temporal-affinity", "MySQL date and time declarations are stored with SQLite TEXT affinity; MySQL timezone and automatic-update behavior do not apply.");
  if (["BOOL", "BOOLEAN", "TINYINT"].includes(base)) addOnce(issues, "info", "boolean-affinity", "MySQL boolean-style columns use SQLite INTEGER affinity.");
  if (["ENUM", "SET"].includes(base)) addOnce(issues, "warning", "enum-set", "MySQL ENUM and SET declarations become TEXT; their allowed-value lists are not enforced.");
  if (base === "JSON") addOnce(issues, "warning", "json-affinity", "MySQL JSON columns become TEXT and are not automatically validated as JSON.");
  if (INTEGER_TYPES.has(base)) return { mysqlType, sqliteType: "INTEGER" as const };
  if (REAL_TYPES.has(base)) return { mysqlType, sqliteType: "REAL" as const };
  if (NUMERIC_TYPES.has(base)) return { mysqlType, sqliteType: "NUMERIC" as const };
  if (TEXT_TYPES.has(base)) return { mysqlType, sqliteType: "TEXT" as const };
  if (BLOB_TYPES.has(base)) return { mysqlType, sqliteType: "BLOB" as const };
  addIssue(issues, { severity: "error", code: "unsupported-data-type", message: `Column “${tableName}.${columnName}” uses unsupported MySQL type ${mysqlType || "(unknown)"}.`, statement });
  return { mysqlType: mysqlType || "UNKNOWN", sqliteType: "BLOB" as const };
}

function functionName(value: AstNode) {
  const name = node(value.name);
  return nodes(name?.name).map((part) => text(part.value)).filter(Boolean).join(".").toUpperCase();
}

function literalSql(value: unknown, issues: MySqlImportIssue[], statement: number, context: string): string | null {
  const expression = node(value);
  if (!expression) return null;
  const type = text(expression.type)?.toLowerCase();
  if (type === "null") return "NULL";
  if (type === "number" || type === "bigint") {
    const raw = String(expression.value);
    return Number.isFinite(Number(raw)) ? raw : null;
  }
  if (["single_quote_string", "double_quote_string", "string", "date", "datetime", "time", "timestamp"].includes(type ?? "")) return quoteLiteral(String(expression.value ?? "").replaceAll("''", "'"));
  if (type === "bool" || type === "boolean") return expression.value ? "1" : "0";
  if (type === "bit_string") {
    const bits = String(expression.value ?? "");
    const numeric = Number.parseInt(bits, 2);
    if (/^[01]+$/.test(bits) && Number.isSafeInteger(numeric)) return String(numeric);
  }
  if (type === "full_hex_string" || type === "hex") {
    const hex = String(expression.value ?? "");
    if (/^(?:[0-9a-f]{2})*$/i.test(hex)) return `X'${hex}'`;
  }
  if (type === "function" && functionName(expression) === "CURRENT_TIMESTAMP" && !expression.over) return "CURRENT_TIMESTAMP";
  addIssue(issues, { severity: "error", code: "unsupported-default", message: `${context} uses a default expression that cannot be represented safely in SQLite.`, statement });
  return null;
}

function checkSql(value: unknown, issues: MySqlImportIssue[], statement: number): string | null {
  const expression = node(value);
  if (!expression) return null;
  const type = text(expression.type)?.toLowerCase();
  if (type === "column_ref" && typeof expression.column === "string") return quoteIdentifier(expression.column);
  if (["number", "bigint", "single_quote_string", "double_quote_string", "string", "null", "bool", "boolean"].includes(type ?? "")) return literalSql(expression, issues, statement, "CHECK constraint");
  if (type === "expr_list") {
    const values = (Array.isArray(expression.value) ? expression.value : []).map((item) => checkSql(item, issues, statement));
    return values.every((item) => item !== null) ? `(${values.join(", ")})` : null;
  }
  if (type === "binary_expr") {
    const operator = text(expression.operator)?.toUpperCase() ?? "";
    if (!CHECK_OPERATORS.has(operator)) {
      addIssue(issues, { severity: "error", code: "unsupported-check", message: `CHECK constraint operator “${operator || "unknown"}” is not supported.`, statement });
      return null;
    }
    const left = checkSql(expression.left, issues, statement);
    const right = checkSql(expression.right, issues, statement);
    return left && right ? `(${left} ${operator} ${right})` : null;
  }
  if (type === "unary_expr" && ["NOT", "+", "-"].includes(text(expression.operator)?.toUpperCase() ?? "")) {
    const operand = checkSql(expression.expr, issues, statement);
    return operand ? `(${String(expression.operator).toUpperCase()} ${operand})` : null;
  }
  addIssue(issues, { severity: "error", code: "unsupported-check", message: "A CHECK constraint uses an unsupported function, subquery, or expression.", statement });
  return null;
}

function referenceFrom(value: unknown, columns: string[], name: string | null, issues: MySqlImportIssue[], statement: number): ForeignKeyModel | null {
  const reference = node(value);
  const referencedTable = tableRef(reference?.table, "Foreign key", issues, statement);
  const referencedColumns = columnNames(reference?.definition, issues, statement, "Foreign key reference");
  if (!referencedTable || columns.length === 0 || columns.length !== referencedColumns.length) {
    addIssue(issues, { severity: "error", code: "invalid-foreign-key", message: "A foreign key must map the same number of local and referenced columns.", statement });
    return null;
  }
  let onDelete: string | null = null;
  let onUpdate: string | null = null;
  for (const action of nodes(reference?.on_action)) {
    const actionType = text(action.type)?.toUpperCase();
    const actionValue = text(node(action.value)?.value)?.toUpperCase() ?? null;
    if (actionValue && !FOREIGN_KEY_ACTIONS.has(actionValue)) addIssue(issues, { severity: "error", code: "foreign-key-action", message: `Foreign key action “${actionValue}” is not supported by SQLite.`, statement });
    if (actionType === "ON DELETE") onDelete = actionValue;
    if (actionType === "ON UPDATE") onUpdate = actionValue;
  }
  if (reference?.match) addOnce(issues, "warning", "foreign-key-match", "MySQL MATCH clauses are not preserved because SQLite does not implement their MySQL semantics.");
  return { name, columns, referencedTable, referencedColumns, onDelete, onUpdate };
}

function applyConstraint(table: TableModel, definition: AstNode, issues: MySqlImportIssue[], statement: number) {
  const kind = (text(definition.constraint_type) ?? "").toLowerCase();
  const columns = columnNames(definition.definition, issues, statement, `${table.name} ${kind || "constraint"}`);
  if (kind === "primary key") table.primaryKey = columns;
  else if (kind === "unique" || kind === "unique key" || kind === "unique index") table.uniqueConstraints.push(columns);
  else if (kind === "foreign key") {
    const foreignKey = referenceFrom(definition.reference_definition, columns, text(definition.constraint), issues, statement);
    if (foreignKey) table.foreignKeys.push(foreignKey);
  } else if (kind === "check") {
    const expression = Array.isArray(definition.definition) ? definition.definition[0] : definition.definition;
    const converted = checkSql(expression, issues, statement);
    if (converted) table.checks.push(converted);
  } else addIssue(issues, { severity: "error", code: "unsupported-constraint", message: `Table “${table.name}” uses unsupported constraint type “${kind || "unknown"}”.`, statement });
}

function indexFrom(definition: AstNode, tableName: string, issues: MySqlImportIssue[], statement: number): IndexModel | null {
  const keyword = (text(definition.keyword) ?? "index").toLowerCase();
  if (keyword.includes("fulltext") || keyword.includes("spatial")) {
    addIssue(issues, { severity: "error", code: "special-index", message: `Table “${tableName}” uses a ${keyword.toUpperCase()} index, which has no equivalent in this import subset.`, statement });
    return null;
  }
  const indexMethod = String(definition.index_using ?? definition.index_type ?? "").toUpperCase();
  if (indexMethod && indexMethod !== "BTREE") {
    addIssue(issues, { severity: "error", code: "index-method", message: `Index on “${tableName}” uses MySQL ${indexMethod}, which is not compatible with SQLite's index implementation.`, statement });
    return null;
  }
  const columns = columnNames(definition.definition ?? definition.index_columns, issues, statement, `Index on ${tableName}`);
  if (!columns.length) return null;
  const name = text(definition.index) ?? `idx_${tableName}_${columns.join("_")}`;
  const unique = keyword.includes("unique") || String(definition.index_type ?? "").toLowerCase() === "unique";
  return { name, columns, unique };
}

function buildTable(statement: AstNode, issues: MySqlImportIssue[], statementNumber: number): TableModel | null {
  const tableName = tableRef(statement.table, "CREATE TABLE", issues, statementNumber);
  if (!tableName) return null;
  if (statement.temporary || statement.as || statement.query_expr) addIssue(issues, { severity: "error", code: "create-table-variant", message: `Table “${tableName}” uses TEMPORARY or CREATE TABLE AS syntax, which is not supported.`, statement: statementNumber });
  const table: TableModel = { name: tableName, columns: [], primaryKey: [], uniqueConstraints: [], foreignKeys: [], checks: [], indexes: [], rowCount: 0, previewRows: [] };
  for (const definition of nodes(statement.create_definitions)) {
    const resource = text(definition.resource)?.toLowerCase();
    if (resource === "column") {
      const columnName = text(node(definition.column)?.column);
      const typeDefinition = node(definition.definition);
      if (!columnName || !typeDefinition) {
        addIssue(issues, { severity: "error", code: "invalid-column", message: `Table “${tableName}” contains an incomplete column definition.`, statement: statementNumber });
        continue;
      }
      const convertedType = convertType(typeDefinition, issues, tableName, columnName, statementNumber);
      const defaultNode = node(definition.default_val);
      const defaultValue = defaultNode ? literalSql(defaultNode.value, issues, statementNumber, `Default for “${tableName}.${columnName}”`) : null;
      if (node(defaultNode?.value)?.over) addIssue(issues, { severity: "error", code: "on-update", message: `Column “${tableName}.${columnName}” uses ON UPDATE, which SQLite cannot preserve as a column default.`, statement: statementNumber });
      if (definition.character_set || definition.collate) addOnce(issues, "warning", "collation", "MySQL character sets and collations are not preserved; QueryQuest uses SQLite's available collations.");
      if (definition.generated || definition.storage) addIssue(issues, { severity: "error", code: "generated-column", message: `Generated column “${tableName}.${columnName}” is outside the supported subset.`, statement: statementNumber });
      const column: ColumnModel = {
        name: columnName,
        ...convertedType,
        notNull: text(node(definition.nullable)?.type)?.toLowerCase() === "not null",
        primaryKey: Boolean(definition.primary_key),
        autoIncrement: Boolean(definition.auto_increment),
        defaultSql: defaultValue,
        unique: Boolean(definition.unique),
      };
      table.columns.push(column);
      if (column.primaryKey) table.primaryKey.push(column.name);
      if (definition.reference_definition) {
        const foreignKey = referenceFrom(definition.reference_definition, [column.name], null, issues, statementNumber);
        if (foreignKey) table.foreignKeys.push(foreignKey);
      }
    } else if (resource === "constraint") applyConstraint(table, definition, issues, statementNumber);
    else if (resource === "index") {
      const index = indexFrom(definition, tableName, issues, statementNumber);
      if (index) table.indexes.push(index);
    } else addIssue(issues, { severity: "error", code: "create-definition", message: `Table “${tableName}” contains an unsupported schema definition.`, statement: statementNumber });
  }
  if (!table.columns.length) addIssue(issues, { severity: "error", code: "empty-table", message: `Table “${tableName}” has no supported columns.`, statement: statementNumber });
  if (statement.table_options) addOnce(issues, "info", "table-options", "MySQL ENGINE, charset, row format, and AUTO_INCREMENT seed table options are informational and are not copied to SQLite.");
  return table;
}

function generatedCreateSql(table: TableModel, issues: MySqlImportIssue[]) {
  const autoColumns = table.columns.filter((column) => column.autoIncrement);
  if (autoColumns.length > 1) addIssue(issues, { severity: "error", code: "multiple-auto-increment", message: `Table “${table.name}” has more than one AUTO_INCREMENT column.` });
  const auto = autoColumns[0];
  if (auto && (auto.sqliteType !== "INTEGER" || table.primaryKey.length !== 1 || table.primaryKey[0].toLowerCase() !== auto.name.toLowerCase())) addIssue(issues, { severity: "error", code: "auto-increment-key", message: `AUTO_INCREMENT column “${table.name}.${auto.name}” must be the sole integer primary key to convert to SQLite AUTOINCREMENT.` });
  if (auto) addOnce(issues, "info", "auto-increment", "Compatible MySQL AUTO_INCREMENT keys are converted to SQLite INTEGER PRIMARY KEY AUTOINCREMENT; MySQL sequence seed options are not copied.");

  const definitions = table.columns.map((column) => {
    const parts = [quoteIdentifier(column.name), column.sqliteType];
    if (auto?.name === column.name) parts.push("PRIMARY KEY AUTOINCREMENT");
    if (column.notNull && auto?.name !== column.name) parts.push("NOT NULL");
    if (column.unique) parts.push("UNIQUE");
    if (column.defaultSql !== null) parts.push(`DEFAULT ${column.defaultSql}`);
    return parts.join(" ");
  });
  if (table.primaryKey.length && !auto) definitions.push(`PRIMARY KEY (${table.primaryKey.map(quoteIdentifier).join(", ")})`);
  table.uniqueConstraints.filter((columns) => columns.length).forEach((columns) => definitions.push(`UNIQUE (${columns.map(quoteIdentifier).join(", ")})`));
  table.foreignKeys.forEach((foreignKey) => {
    const parts = [foreignKey.name ? `CONSTRAINT ${quoteIdentifier(foreignKey.name)}` : "", `FOREIGN KEY (${foreignKey.columns.map(quoteIdentifier).join(", ")})`, `REFERENCES ${quoteIdentifier(foreignKey.referencedTable)} (${foreignKey.referencedColumns.map(quoteIdentifier).join(", ")})`];
    if (foreignKey.onDelete) parts.push(`ON DELETE ${foreignKey.onDelete}`);
    if (foreignKey.onUpdate) parts.push(`ON UPDATE ${foreignKey.onUpdate}`);
    definitions.push(parts.filter(Boolean).join(" "));
  });
  table.checks.forEach((check) => definitions.push(`CHECK ${check}`));
  return `CREATE TABLE ${quoteIdentifier(table.name)} (\n  ${definitions.join(",\n  ")}\n)`;
}

function mysqlValue(value: unknown, issues: MySqlImportIssue[], statement: number, context: string): SqlValue | undefined {
  const expression = node(value);
  const type = text(expression?.type)?.toLowerCase();
  if (!expression || !type) return undefined;
  if (type === "null") return null;
  if (type === "bool" || type === "boolean") return expression.value ? 1 : 0;
  if (type === "number" || type === "bigint") {
    const raw = String(expression.value);
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || (Number.isInteger(numeric) && !Number.isSafeInteger(numeric))) {
      addIssue(issues, { severity: "error", code: "numeric-range", message: `${context} contains numeric value “${raw}” outside QueryQuest's safely representable range.`, statement });
      return undefined;
    }
    return numeric;
  }
  if (["single_quote_string", "double_quote_string", "string", "date", "datetime", "time", "timestamp"].includes(type)) {
    if (expression.prefix) {
      addIssue(issues, { severity: "error", code: "binary-string", message: `${context} uses a prefixed MySQL binary/charset string. Export binary values using hexadecimal literals instead.`, statement });
      return undefined;
    }
    return String(expression.value ?? "").replaceAll("''", "'").replaceAll('""', '"');
  }
  if (type === "full_hex_string" || type === "hex") {
    const hex = String(expression.value ?? "");
    if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) {
      addIssue(issues, { severity: "error", code: "hex-value", message: `${context} contains an invalid hexadecimal value.`, statement });
      return undefined;
    }
    return new Uint8Array(hex.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
  }
  if (type === "bit_string") {
    const bits = String(expression.value ?? "");
    const numeric = Number.parseInt(bits, 2);
    if (!/^[01]+$/.test(bits) || !Number.isSafeInteger(numeric)) {
      addIssue(issues, { severity: "error", code: "bit-value", message: `${context} contains a BIT value outside the supported integer range.`, statement });
      return undefined;
    }
    return numeric;
  }
  addIssue(issues, { severity: "error", code: "insert-expression", message: `${context} contains a function or expression. Only literal INSERT values are imported.`, statement });
  return undefined;
}

function parseAst(statement: string, issues: MySqlImportIssue[], statementNumber: number): AstNode[] {
  try {
    const parsed = parser.astify(statement, { database: "MySQL" });
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((item) => node(item as AST)).filter((item): item is AstNode => Boolean(item));
  } catch (error) {
    addIssue(issues, { severity: "error", code: "parse-error", message: `MySQL parser could not read statement ${statementNumber}: ${error instanceof Error ? error.message : "invalid syntax"}`, statement: statementNumber });
    return [];
  }
}

export function parseMySqlDump(source: string): ConvertedMySqlDump {
  if (!source.trim()) throw new Error("The MySQL dump file is empty.");
  if (!looksLikeMySqlDump(source)) throw new Error("This .sql file was not recognized as a MySQL dump. Export tables and data using MySQL Workbench or mysqldump.");
  const issues: MySqlImportIssue[] = [];
  if (/^\s*DELIMITER\b/im.test(source)) {
    return { dialect: "mysql", statementCount: 0, tables: [], insertBatches: [], indexSql: [], issues: [{ severity: "error", code: "delimiter", message: "DELIMITER blocks indicate stored routines or complex triggers. This subset imports table schemas and literal INSERT data only; export without routines, triggers, events, or views." }] };
  }
  const { statements, executableComments } = splitStatements(source.replace(/^\uFEFF/, ""));
  if (executableComments) addOnce(issues, "info", "version-comments", `Ignored ${executableComments} MySQL version-specific directive${executableComments === 1 ? "" : "s"} such as session settings or key toggles.`);
  const tables = new Map<string, TableModel>();
  const pendingInserts: Array<{ ast: AstNode; statement: number }> = [];
  const pendingIndexes: Array<{ tableName: string; index: IndexModel; statement: number }> = [];
  const pendingAlters: Array<{ ast: AstNode; statement: number }> = [];
  let ignoredDirectives = 0;

  statements.forEach((sql, index) => {
    const statementNumber = index + 1;
    const normalized = sql.trim();
    if (/^(?:SET|LOCK\s+TABLES|UNLOCK\s+TABLES|DROP\s+TABLE|CREATE\s+(?:DATABASE|SCHEMA)|USE\b|START\s+TRANSACTION|COMMIT\b)/i.test(normalized) || /^ALTER\s+TABLE[\s\S]+\b(?:DISABLE|ENABLE)\s+KEYS\s*$/i.test(normalized)) { ignoredDirectives += 1; return; }
    if (/^CREATE\b[\s\S]*\b(?:VIEW|TRIGGER|PROCEDURE|FUNCTION|EVENT)\b/i.test(normalized) && !/^CREATE\s+TABLE\b/i.test(normalized)) {
      addIssue(issues, { severity: "warning", code: "unsupported-object", message: `Statement ${statementNumber} defines a view, trigger, routine, function, or event. That database object was not imported.`, statement: statementNumber });
      return;
    }
    for (const ast of parseAst(normalized, issues, statementNumber)) {
      const type = text(ast.type)?.toLowerCase();
      const keyword = text(ast.keyword)?.toLowerCase();
      if (type === "create" && keyword === "table") {
        const table = buildTable(ast, issues, statementNumber);
        if (!table) continue;
        const key = table.name.toLowerCase();
        if (tables.has(key)) addIssue(issues, { severity: "error", code: "duplicate-table", message: `Table “${table.name}” is defined more than once.`, statement: statementNumber });
        else tables.set(key, table);
      } else if (type === "insert") pendingInserts.push({ ast, statement: statementNumber });
      else if (type === "alter") pendingAlters.push({ ast, statement: statementNumber });
      else if (type === "create" && keyword === "index") {
        const tableName = tableRef(ast.table, "CREATE INDEX", issues, statementNumber);
        const indexModel = indexFrom(ast, tableName ?? "unknown", issues, statementNumber);
        if (tableName && indexModel) pendingIndexes.push({ tableName, index: indexModel, statement: statementNumber });
      } else addIssue(issues, { severity: "warning", code: "unsupported-statement", message: `Statement ${statementNumber} (${type ?? "unknown"}) is outside the supported MySQL import subset and was skipped.`, statement: statementNumber });
    }
  });
  if (ignoredDirectives) addOnce(issues, "info", "session-directives", `Ignored ${ignoredDirectives} dump housekeeping statement${ignoredDirectives === 1 ? "" : "s"} (DROP, SET, USE, LOCK, or key toggles) because the import creates a new isolated SQLite database.`);
  const schemas = new Set(issues.filter((issue) => issue.code.startsWith("mysql-schema:")).map((issue) => issue.code.slice("mysql-schema:".length)));
  if (schemas.size > 1) addIssue(issues, { severity: "error", code: "cross-database", message: `The dump references multiple MySQL schemas (${[...schemas].join(", ")}). Import one schema at a time to avoid ambiguous SQLite table references.` });

  for (const { ast, statement } of pendingAlters) {
    const tableName = tableRef(ast.table, "ALTER TABLE", issues, statement);
    const table = tableName ? tables.get(tableName.toLowerCase()) : null;
    if (!table) { addIssue(issues, { severity: "error", code: "alter-missing-table", message: `ALTER TABLE references unknown table “${tableName ?? "unknown"}”.`, statement }); continue; }
    for (const expression of nodes(ast.expr)) {
      if (text(expression.resource)?.toLowerCase() === "auto_increment") { addOnce(issues, "info", "auto-increment-seed", "MySQL AUTO_INCREMENT seed values are not copied; SQLite continues after the largest imported integer key."); continue; }
      const constraint = node(expression.create_definitions);
      if (constraint && text(expression.action)?.toLowerCase() === "add") { applyConstraint(table, constraint, issues, statement); continue; }
      if (text(expression.resource)?.toLowerCase() === "index" && text(expression.action)?.toLowerCase() === "add") {
        const indexModel = indexFrom(expression, table.name, issues, statement);
        if (indexModel) table.indexes.push(indexModel);
        continue;
      }
      addIssue(issues, { severity: "error", code: "unsupported-alter", message: `ALTER TABLE for “${table.name}” contains an unsupported schema change.`, statement });
    }
  }
  for (const pending of pendingIndexes) {
    const table = tables.get(pending.tableName.toLowerCase());
    if (table) table.indexes.push(pending.index);
    else addIssue(issues, { severity: "error", code: "index-missing-table", message: `Index “${pending.index.name}” references unknown table “${pending.tableName}”.`, statement: pending.statement });
  }

  for (const table of tables.values()) {
    const names = table.columns.map((column) => column.name.toLowerCase());
    const known = new Set(names);
    if (known.size !== names.length) addIssue(issues, { severity: "error", code: "duplicate-column", message: `Table “${table.name}” defines a column more than once.` });
    const validateColumns = (columns: string[], context: string) => {
      const missing = columns.find((column) => !known.has(column.toLowerCase()));
      if (missing) addIssue(issues, { severity: "error", code: "constraint-column", message: `${context} references unknown column “${table.name}.${missing}”.` });
    };
    validateColumns(table.primaryKey, "Primary key");
    table.uniqueConstraints.forEach((columns) => validateColumns(columns, "Unique constraint"));
    table.indexes.forEach((index) => validateColumns(index.columns, `Index “${index.name}”`));
    for (const foreignKey of table.foreignKeys) {
      validateColumns(foreignKey.columns, `Foreign key${foreignKey.name ? ` “${foreignKey.name}”` : ""}`);
      const referencedTable = tables.get(foreignKey.referencedTable.toLowerCase());
      if (!referencedTable) addIssue(issues, { severity: "error", code: "foreign-key-table", message: `Foreign key on “${table.name}” references unknown table “${foreignKey.referencedTable}”.` });
      else {
        const referencedColumns = new Set(referencedTable.columns.map((column) => column.name.toLowerCase()));
        const missing = foreignKey.referencedColumns.find((column) => !referencedColumns.has(column.toLowerCase()));
        if (missing) addIssue(issues, { severity: "error", code: "foreign-key-column", message: `Foreign key on “${table.name}” references unknown column “${foreignKey.referencedTable}.${missing}”.` });
      }
    }
  }

  const insertBatches: MySqlInsertBatch[] = [];
  for (const { ast, statement } of pendingInserts) {
    const tableName = tableRef(ast.table, "INSERT", issues, statement);
    const table = tableName ? tables.get(tableName.toLowerCase()) : null;
    if (!table) { addIssue(issues, { severity: "error", code: "insert-missing-table", message: `INSERT references unknown table “${tableName ?? "unknown"}”.`, statement }); continue; }
    if (String(ast.prefix ?? "").toLowerCase().includes("ignore") || ast.on_duplicate_update) {
      addIssue(issues, { severity: "error", code: "insert-modifier", message: `INSERT for “${table.name}” uses IGNORE or ON DUPLICATE KEY UPDATE, which is not executed during conversion.`, statement });
      continue;
    }
    const columns = Array.isArray(ast.columns) ? ast.columns.map(String) : table.columns.map((column) => column.name);
    const knownColumns = new Set(table.columns.map((column) => column.name.toLowerCase()));
    if (new Set(columns.map((column) => column.toLowerCase())).size !== columns.length || columns.some((column) => !knownColumns.has(column.toLowerCase()))) {
      addIssue(issues, { severity: "error", code: "insert-columns", message: `INSERT for “${table.name}” contains duplicate or unknown columns.`, statement });
      continue;
    }
    const valueContainer = node(ast.values);
    if (text(valueContainer?.type)?.toLowerCase() !== "values") {
      addIssue(issues, { severity: "error", code: "insert-select", message: `INSERT for “${table.name}” is not a literal VALUES statement. INSERT … SELECT is not supported.`, statement });
      continue;
    }
    const rows: SqlValue[][] = [];
    for (const rowNode of nodes(valueContainer?.values)) {
      const values = Array.isArray(rowNode.value) ? rowNode.value : [];
      if (values.length !== columns.length) {
        addIssue(issues, { severity: "error", code: "insert-value-count", message: `INSERT for “${table.name}” has ${values.length} values for ${columns.length} columns.`, statement });
        continue;
      }
      const converted = values.map((value, valueIndex) => mysqlValue(value, issues, statement, `INSERT ${table.name}.${columns[valueIndex]}`));
      if (converted.every((value) => value !== undefined)) rows.push(converted as SqlValue[]);
    }
    if (rows.length) {
      insertBatches.push({ tableName: table.name, columns, rows });
      table.rowCount += rows.length;
      for (const row of rows) {
        if (table.previewRows.length >= 5) break;
        const byColumn = new Map(columns.map((column, index) => [column.toLowerCase(), row[index]]));
        table.previewRows.push(table.columns.map((column) => byColumn.get(column.name.toLowerCase()) ?? null));
      }
    }
  }

  const indexNames = new Set<string>();
  const indexSql: string[] = [];
  for (const table of tables.values()) {
    for (const index of table.indexes) {
      let name = index.name;
      if (indexNames.has(name.toLowerCase())) {
        name = `${table.name}_${name}`;
        addIssue(issues, { severity: "warning", code: "index-name-collision", message: `Index “${index.name}” was renamed to “${name}” because SQLite index names are database-wide.` });
      }
      indexNames.add(name.toLowerCase());
      indexSql.push(`CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${quoteIdentifier(name)} ON ${quoteIdentifier(table.name)} (${index.columns.map(quoteIdentifier).join(", ")})`);
    }
  }

  const convertedTables = [...tables.values()].map((table) => ({
    name: table.name,
    createSql: generatedCreateSql(table, issues),
    columns: table.columns.map((column) => ({ name: column.name, mysqlType: column.mysqlType, sqliteType: column.sqliteType, notNull: column.notNull, autoIncrement: column.autoIncrement, primaryKey: table.primaryKey.some((name) => name.toLowerCase() === column.name.toLowerCase()) })),
    rowCount: table.rowCount,
    previewRows: table.previewRows,
    indexes: table.indexes.map((index) => index.name),
  }));
  if (!convertedTables.length) addIssue(issues, { severity: "error", code: "no-tables", message: "No supported CREATE TABLE statements were found in this MySQL dump." });
  return { dialect: "mysql", statementCount: statements.length, tables: convertedTables, insertBatches, indexSql, issues };
}

export function canImportMySqlDump(dump: ConvertedMySqlDump) {
  return dump.tables.length > 0 && !dump.issues.some((issue) => issue.severity === "error");
}

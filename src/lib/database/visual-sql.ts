import type {
  SQLiteDeclaredType,
  SQLiteForeignKeyAction,
  SqlParameters,
  SqlValue,
  TableColumnDefinition,
  TableDataEdit,
  TableDefinition,
} from "@/lib/database/types";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FOREIGN_KEY_ACTIONS = new Set<SQLiteForeignKeyAction>(["NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT", "CASCADE"]);

export const SQLITE_DECLARED_TYPES: SQLiteDeclaredType[] = [
  "INTEGER", "INT", "BIGINT", "SMALLINT", "TINYINT",
  "REAL", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC",
  "TEXT", "VARCHAR", "CHAR", "BOOLEAN", "DATE", "DATETIME", "TIMESTAMP", "BLOB",
];

const TYPE_SET = new Set<SQLiteDeclaredType>(SQLITE_DECLARED_TYPES);

export type SQLiteAffinity = "INTEGER" | "REAL" | "NUMERIC" | "TEXT" | "BLOB";

export function getSQLiteAffinity(type: SQLiteDeclaredType): SQLiteAffinity {
  if (type.includes("INT")) return "INTEGER";
  if (type.includes("CHAR") || type === "VARCHAR" || type === "TEXT") return "TEXT";
  if (type === "BLOB") return "BLOB";
  if (type === "REAL" || type === "FLOAT" || type === "DOUBLE") return "REAL";
  return "NUMERIC";
}

export function validateIdentifier(value: string, label: string) {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`${label} must start with a letter or underscore and contain only letters, numbers, and underscores.`);
  }
}

export function quoteIdentifier(value: string) {
  validateIdentifier(value, "Identifier");
  return `"${value}"`;
}

function positiveInteger(value: number | null | undefined, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`${label} must be a positive whole number.`);
  return Number(value);
}

function buildDeclaredType(column: TableColumnDefinition) {
  if (!TYPE_SET.has(column.type)) throw new Error(`Unsupported SQLite declared type: ${column.type}`);
  if (column.type === "VARCHAR" || column.type === "CHAR") {
    const length = positiveInteger(column.length, `${column.name} length`);
    return `${column.type}(${length})`;
  }
  if (column.type === "DECIMAL") {
    const precision = positiveInteger(column.precision, `${column.name} precision`);
    const scale = column.scale;
    if (!Number.isSafeInteger(scale) || Number(scale) < 0) throw new Error(`${column.name} scale must be a non-negative whole number.`);
    if (Number(scale) > precision) throw new Error(`${column.name} scale cannot exceed its precision.`);
    return `DECIMAL(${precision},${Number(scale)})`;
  }
  return column.type;
}

function sqlLiteral(value: SqlValue) {
  if (value === null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Default numbers must be finite.");
    return String(value);
  }
  if (value instanceof Uint8Array) {
    return `X'${[...value].map((byte) => byte.toString(16).padStart(2, "0")).join("")}'`;
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function safeExpression(expression: string | undefined, label: string) {
  const value = expression?.trim() ?? "";
  if (!value) throw new Error(`${label} cannot be empty.`);
  if (value.length > 1000) throw new Error(`${label} is too long.`);
  if (/[;\0]/.test(value) || /--|\/\*|\*\//.test(value)) {
    throw new Error(`${label} must be a single SQLite expression without comments or semicolons.`);
  }
  let quote: "'" | '"' | "`" | null = null;
  let bracket = false;
  let depth = 0;
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
    if (character === "'" || character === '"' || character === "`") { quote = character; continue; }
    if (character === "[") { bracket = true; continue; }
    if (character === "(") depth += 1;
    if (character === ")") {
      if (depth === 0) throw new Error(`${label} contains an unmatched closing parenthesis.`);
      depth -= 1;
    }
    if (character === "," && depth === 0) throw new Error(`${label} must contain one expression.`);
  }
  if (quote || bracket || depth !== 0) throw new Error(`${label} contains unbalanced quotes, brackets, or parentheses.`);
  if (/\bSELECT\b/i.test(value)) throw new Error(`${label} cannot contain a subquery.`);
  return value;
}

function buildDefault(column: TableColumnDefinition) {
  if (!column.hasDefault) return null;
  if (column.defaultKind === "expression") {
    return `DEFAULT (${safeExpression(column.defaultExpression, `${column.name} default expression`)})`;
  }
  return `DEFAULT ${sqlLiteral(column.defaultValue)}`;
}

function validateForeignKey(column: TableColumnDefinition) {
  if (!column.foreignKey) return null;
  validateIdentifier(column.foreignKey.table, `${column.name} referenced table`);
  validateIdentifier(column.foreignKey.column, `${column.name} referenced column`);
  if (!FOREIGN_KEY_ACTIONS.has(column.foreignKey.onDelete) || !FOREIGN_KEY_ACTIONS.has(column.foreignKey.onUpdate)) {
    throw new Error(`${column.name} uses an unsupported foreign-key action.`);
  }
  if (column.notNull && (column.foreignKey.onDelete === "SET NULL" || column.foreignKey.onUpdate === "SET NULL")) {
    throw new Error(`${column.name} cannot use SET NULL while NOT NULL is enabled.`);
  }
  if (!column.hasDefault && (column.foreignKey.onDelete === "SET DEFAULT" || column.foreignKey.onUpdate === "SET DEFAULT")) {
    throw new Error(`${column.name} needs a DEFAULT before using SET DEFAULT.`);
  }
  return `REFERENCES ${quoteIdentifier(column.foreignKey.table)} (${quoteIdentifier(column.foreignKey.column)}) ON DELETE ${column.foreignKey.onDelete} ON UPDATE ${column.foreignKey.onUpdate}`;
}

function resolveConstraintColumns(columnNames: Map<string, string>, requested: string[], label: string) {
  if (requested.length < 2) throw new Error(`${label} must contain at least two columns.`);
  const seen = new Set<string>();
  return requested.map((name) => {
    const key = name.toLowerCase();
    const actual = columnNames.get(key);
    if (!actual) throw new Error(`${label} references unknown column “${name}”.`);
    if (seen.has(key)) throw new Error(`${label} repeats column “${name}”.`);
    seen.add(key);
    return actual;
  });
}

export function buildCreateTableSql(definition: TableDefinition) {
  validateIdentifier(definition.name, "Table name");
  if (!definition.columns.length) throw new Error("Add at least one column.");

  const names = new Map<string, string>();
  for (const column of definition.columns) {
    validateIdentifier(column.name, "Column name");
    const key = column.name.toLowerCase();
    if (names.has(key)) throw new Error(`Column name “${column.name}” is duplicated.`);
    names.set(key, column.name);
  }

  const primaryColumns = definition.columns.filter((column) => column.primaryKey);
  const autoColumns = definition.columns.filter((column) => column.autoincrement);
  if (autoColumns.length > 1) throw new Error("Only one column can use AUTOINCREMENT.");
  if (autoColumns.length) {
    const auto = autoColumns[0];
    if (!auto.primaryKey || primaryColumns.length !== 1 || auto.type !== "INTEGER") {
      throw new Error("AUTOINCREMENT requires the single-column declaration INTEGER PRIMARY KEY.");
    }
  }

  const inlinePrimary = primaryColumns.length === 1 ? primaryColumns[0].name : null;
  const columnSql = definition.columns.map((column) => {
    const constraints = [
      inlinePrimary === column.name && "PRIMARY KEY",
      column.autoincrement && "AUTOINCREMENT",
      column.notNull && "NOT NULL",
      column.unique && inlinePrimary !== column.name && "UNIQUE",
      buildDefault(column),
      column.checkExpression?.trim() && `CHECK (${safeExpression(column.checkExpression, `${column.name} CHECK expression`)})`,
      validateForeignKey(column),
    ].filter(Boolean);
    return `${quoteIdentifier(column.name)} ${buildDeclaredType(column)}${constraints.length ? ` ${constraints.join(" ")}` : ""}`;
  });

  const tableConstraints: string[] = [];
  if (primaryColumns.length > 1) {
    tableConstraints.push(`PRIMARY KEY (${primaryColumns.map((column) => quoteIdentifier(column.name)).join(", ")})`);
  }

  const uniqueSets = new Set<string>();
  for (const [index, requested] of (definition.uniqueConstraints ?? []).entries()) {
    const columns = resolveConstraintColumns(names, requested, `Composite UNIQUE ${index + 1}`);
    const key = columns.map((column) => column.toLowerCase()).sort().join("|");
    if (uniqueSets.has(key)) throw new Error(`Composite UNIQUE ${index + 1} duplicates another unique key.`);
    uniqueSets.add(key);
    tableConstraints.push(`UNIQUE (${columns.map(quoteIdentifier).join(", ")})`);
  }

  for (const [index, expression] of (definition.checks ?? []).entries()) {
    tableConstraints.push(`CHECK (${safeExpression(expression, `Table CHECK ${index + 1}`)})`);
  }

  return `CREATE TABLE ${quoteIdentifier(definition.name)} (\n  ${[...columnSql, ...tableConstraints].join(",\n  ")}\n);`;
}

export type ParameterizedStatement = { sql: string; parameters: SqlParameters };

export function buildTableEditStatements(tableName: string, columnNames: string[], edits: TableDataEdit[]): ParameterizedStatement[] {
  validateIdentifier(tableName, "Table name");
  if (!columnNames.length) throw new Error("The table has no editable columns.");
  columnNames.forEach((name) => validateIdentifier(name, "Column name"));
  const table = quoteIdentifier(tableName);
  const columns = columnNames.map(quoteIdentifier);
  return edits.map((edit) => {
    if (edit.type === "delete") return { sql: `DELETE FROM ${table} WHERE rowid = ?`, parameters: [edit.rowId] };
    if (edit.values.length !== columns.length) throw new Error("Edited row does not match the table schema.");
    if (edit.type === "insert") {
      return { sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, parameters: edit.values };
    }
    return { sql: `UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE rowid = ?`, parameters: [...edit.values, edit.rowId] };
  });
}

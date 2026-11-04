import type { SqlParameters, SqlValue, TableDataEdit, TableDefinition } from "@/lib/database/types";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TYPES = new Set(["INTEGER", "REAL", "TEXT", "BLOB", "NUMERIC"]);

export function validateIdentifier(value: string, label: string) {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`${label} must start with a letter or underscore and contain only letters, numbers, and underscores.`);
  }
}

export function quoteIdentifier(value: string) {
  validateIdentifier(value, "Identifier");
  return `"${value}"`;
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

export function buildCreateTableSql(definition: TableDefinition) {
  validateIdentifier(definition.name, "Table name");
  if (!definition.columns.length) throw new Error("Add at least one column.");
  if (definition.columns.filter((column) => column.primaryKey).length > 1) {
    throw new Error("The visual designer supports one primary key column per table.");
  }
  const names = new Set<string>();
  const columns = definition.columns.map((column) => {
    validateIdentifier(column.name, "Column name");
    const key = column.name.toLowerCase();
    if (names.has(key)) throw new Error(`Column name “${column.name}” is duplicated.`);
    names.add(key);
    if (!TYPES.has(column.type)) throw new Error(`Unsupported SQLite type: ${column.type}`);
    const constraints = [
      column.primaryKey && "PRIMARY KEY",
      column.notNull && !column.primaryKey && "NOT NULL",
      column.unique && !column.primaryKey && "UNIQUE",
      column.hasDefault && `DEFAULT ${sqlLiteral(column.defaultValue)}`,
    ].filter(Boolean);
    return `${quoteIdentifier(column.name)} ${column.type}${constraints.length ? ` ${constraints.join(" ")}` : ""}`;
  });
  return `CREATE TABLE ${quoteIdentifier(definition.name)} (\n  ${columns.join(",\n  ")}\n);`;
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

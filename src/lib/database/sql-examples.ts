import type { TableSchema, TableSummary } from "@/lib/database/types";

export type SqlExampleKind = "select" | "filter" | "sort" | "count" | "group" | "join";

export type SqlExample = {
  id: string;
  kind: SqlExampleKind;
  label: string;
  description: string;
  sql: string;
};

const quoted = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

function usableColumn(schema: TableSchema | undefined) {
  return schema?.columns.find((column) => !/BLOB/i.test(column.type)) ?? schema?.columns[0];
}

export function buildSqlExamples(
  tables: TableSummary[],
  schemas: Record<string, TableSchema>,
  selectedTable?: string | null,
): SqlExample[] {
  const table = tables.find((item) => item.name === selectedTable) ?? tables.find((item) => item.type === "table") ?? tables[0];
  if (!table) return [];

  const schema = schemas[table.name];
  const column = usableColumn(schema);
  const groupColumn = schema?.columns.find((item) => !item.primaryKey && !/BLOB/i.test(item.type)) ?? column;
  const tableName = quoted(table.name);
  const examples: SqlExample[] = [
    {
      id: `select-${table.name}`,
      kind: "select",
      label: "Select all records",
      description: `Read up to 100 rows from ${table.name}.`,
      sql: `SELECT *\nFROM ${tableName}\nLIMIT 100;`,
    },
    {
      id: `count-${table.name}`,
      kind: "count",
      label: "Count records",
      description: `Count every row in ${table.name}.`,
      sql: `SELECT COUNT(*) AS row_count\nFROM ${tableName};`,
    },
  ];

  if (column) {
    const columnName = quoted(column.name);
    examples.splice(1, 0,
      {
        id: `filter-${table.name}-${column.name}`,
        kind: "filter",
        label: "Filter with WHERE",
        description: `Keep ${table.name} rows where ${column.name} has a value.`,
        sql: `SELECT *\nFROM ${tableName}\nWHERE ${columnName} IS NOT NULL\nLIMIT 100;`,
      },
      {
        id: `sort-${table.name}-${column.name}`,
        kind: "sort",
        label: "Sort with ORDER BY",
        description: `Sort ${table.name} by ${column.name}.`,
        sql: `SELECT *\nFROM ${tableName}\nORDER BY ${columnName} ASC\nLIMIT 100;`,
      },
    );
  }

  if (groupColumn) {
    const columnName = quoted(groupColumn.name);
    examples.push({
      id: `group-${table.name}-${groupColumn.name}`,
      kind: "group",
      label: "Group and aggregate",
      description: `Count ${table.name} rows by ${groupColumn.name}.`,
      sql: `SELECT ${columnName}, COUNT(*) AS row_count\nFROM ${tableName}\nGROUP BY ${columnName}\nORDER BY row_count DESC;`,
    });
  }

  const joinSource = tables
    .map((item) => schemas[item.name])
    .find((item) => item?.foreignKeys.some((foreignKey) => schemas[foreignKey.referencedTable]));
  const foreignKey = joinSource?.foreignKeys.find((item) => schemas[item.referencedTable]);
  if (joinSource && foreignKey) {
    examples.push({
      id: `join-${joinSource.name}-${foreignKey.referencedTable}-${foreignKey.fromColumn}`,
      kind: "join",
      label: "Join related tables",
      description: `${joinSource.name}.${foreignKey.fromColumn} references ${foreignKey.referencedTable}.${foreignKey.toColumn}.`,
      sql: `SELECT child.*, parent.*\nFROM ${quoted(joinSource.name)} AS child\nINNER JOIN ${quoted(foreignKey.referencedTable)} AS parent\n  ON child.${quoted(foreignKey.fromColumn)} = parent.${quoted(foreignKey.toColumn)}\nLIMIT 100;`,
    });
  }

  return examples;
}

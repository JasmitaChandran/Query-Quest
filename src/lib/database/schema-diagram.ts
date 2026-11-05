import type { DiagramPositions, TableSchema, TableSummary } from "@/lib/database/types";

export interface SchemaRelationship {
  id: string;
  parentTable: string;
  childTable: string;
  parentColumns: string[];
  childColumns: string[];
  cardinality: "one-to-one" | "one-to-many";
  onDelete: string;
  onUpdate: string;
}

function sameColumnSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const normalized = new Set(left.map((column) => column.toLowerCase()));
  return right.every((column) => normalized.has(column.toLowerCase()));
}

function foreignKeyIsUnique(schema: TableSchema, columns: string[]) {
  const primaryColumns = schema.columns
    .filter((column) => column.primaryKey)
    .sort((left, right) => (left.primaryKeyPosition ?? 0) - (right.primaryKeyPosition ?? 0))
    .map((column) => column.name);
  if (primaryColumns.length && sameColumnSet(primaryColumns, columns)) return true;
  return schema.indexes.some((index) => index.unique && sameColumnSet(index.columns, columns));
}

export function detectSchemaRelationships(
  tables: TableSummary[],
  schemas: Record<string, TableSchema>,
) {
  const tableNames = new Map(tables.map((table) => [table.name.toLowerCase(), table.name]));
  const relationships: SchemaRelationship[] = [];

  for (const table of tables.filter((item) => item.type === "table")) {
    const schema = schemas[table.name];
    if (!schema) continue;
    const grouped = new Map<number, typeof schema.foreignKeys>();
    for (const foreignKey of schema.foreignKeys) {
      grouped.set(foreignKey.id, [...(grouped.get(foreignKey.id) ?? []), foreignKey]);
    }
    for (const [foreignKeyId, group] of grouped) {
      const ordered = [...group].sort((left, right) => left.sequence - right.sequence);
      const parentTable = tableNames.get(ordered[0].referencedTable.toLowerCase());
      if (!parentTable) continue;
      const childColumns = ordered.map((foreignKey) => foreignKey.fromColumn);
      relationships.push({
        id: `${table.name}:fk:${foreignKeyId}:${parentTable}`,
        parentTable,
        childTable: table.name,
        parentColumns: ordered.map((foreignKey) => foreignKey.toColumn),
        childColumns,
        cardinality: foreignKeyIsUnique(schema, childColumns) ? "one-to-one" : "one-to-many",
        onDelete: ordered[0].onDelete,
        onUpdate: ordered[0].onUpdate,
      });
    }
  }

  return relationships;
}

export function automaticDiagramPositions(
  tables: TableSummary[],
  relationships: SchemaRelationship[],
): DiagramPositions {
  const tableNames = tables.filter((table) => table.type === "table").map((table) => table.name);
  const depth = new Map(tableNames.map((table) => [table, 0]));
  for (let pass = 0; pass < tableNames.length; pass += 1) {
    let changed = false;
    for (const relationship of relationships) {
      if (relationship.parentTable === relationship.childTable) continue;
      const next = Math.min((depth.get(relationship.parentTable) ?? 0) + 1, Math.max(0, tableNames.length - 1));
      if (next > (depth.get(relationship.childTable) ?? 0)) {
        depth.set(relationship.childTable, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const columns = new Map<number, string[]>();
  for (const tableName of tableNames) {
    const tableDepth = depth.get(tableName) ?? 0;
    columns.set(tableDepth, [...(columns.get(tableDepth) ?? []), tableName]);
  }
  const result: DiagramPositions = {};
  for (const [column, names] of [...columns].sort(([left], [right]) => left - right)) {
    names.sort((left, right) => left.localeCompare(right));
    names.forEach((tableName, row) => {
      result[tableName] = { x: 72 + column * 370, y: 72 + row * 310 };
    });
  }
  return result;
}

export function mergeDiagramPositions(
  tables: TableSummary[],
  relationships: SchemaRelationship[],
  saved: DiagramPositions,
) {
  const automatic = automaticDiagramPositions(tables, relationships);
  return Object.fromEntries(
    Object.entries(automatic).map(([tableName, position]) => [tableName, saved[tableName] ?? position]),
  );
}

import type { ApiIssue, SchemaAnalysisRequest } from "../../shared/src/contracts.js";

function affinity(declaredType: string) {
  const normalized = declaredType.toUpperCase();
  if (normalized.includes("INT")) return "INTEGER" as const;
  if (normalized.includes("CHAR") || normalized.includes("CLOB") || normalized.includes("TEXT")) return "TEXT" as const;
  if (normalized.includes("BLOB") || normalized.trim() === "") return "BLOB" as const;
  if (normalized.includes("REAL") || normalized.includes("FLOA") || normalized.includes("DOUB")) return "REAL" as const;
  return "NUMERIC" as const;
}

export function analyzeSchema(input: SchemaAnalysisRequest) {
  const issues: ApiIssue[] = [];
  const tablesByName = new Map<string, SchemaAnalysisRequest["tables"][number]>();

  for (const table of input.tables) {
    const tableKey = table.name.toLowerCase();
    if (tablesByName.has(tableKey)) issues.push({ level: "error", code: "DUPLICATE_TABLE", message: `Table “${table.name}” is defined more than once.`, path: `tables.${table.name}` });
    else tablesByName.set(tableKey, table);

    const columns = new Set<string>();
    for (const column of table.columns) {
      const columnKey = column.name.toLowerCase();
      if (columns.has(columnKey)) issues.push({ level: "error", code: "DUPLICATE_COLUMN", message: `Column “${table.name}.${column.name}” is defined more than once.`, path: `tables.${table.name}.columns.${column.name}` });
      columns.add(columnKey);
      if (/\b(?:VARCHAR|CHAR)\s*\(/i.test(column.type)) issues.push({ level: "warning", code: "TEXT_LENGTH_AFFINITY", message: `SQLite does not enforce the declared length of “${table.name}.${column.name}”.`, path: `tables.${table.name}.columns.${column.name}` });
      if (/\b(?:BOOLEAN|BOOL|DATE|DATETIME|TIMESTAMP)\b/i.test(column.type)) issues.push({ level: "info", code: "TYPE_AFFINITY", message: `“${table.name}.${column.name}” uses ${affinity(column.type)} affinity in ordinary SQLite tables.`, path: `tables.${table.name}.columns.${column.name}` });
    }
    for (const index of table.indexes) {
      for (const column of index.columns) if (!columns.has(column.toLowerCase())) issues.push({ level: "error", code: "INDEX_COLUMN_MISSING", message: `Index “${index.name}” references unknown column “${table.name}.${column}”.`, path: `tables.${table.name}.indexes.${index.name}` });
    }
  }

  const relationships = [];
  for (const table of input.tables) {
    const localColumns = new Set(table.columns.map((column) => column.name.toLowerCase()));
    for (let index = 0; index < table.foreignKeys.length; index += 1) {
      const foreignKey = table.foreignKeys[index];
      const referenced = tablesByName.get(foreignKey.referencedTable.toLowerCase());
      if (foreignKey.columns.length !== foreignKey.referencedColumns.length) {
        issues.push({ level: "error", code: "FOREIGN_KEY_ARITY", message: `Foreign key on “${table.name}” must reference the same number of local and target columns.`, path: `tables.${table.name}.foreignKeys.${index}` });
        continue;
      }
      const missingLocal = foreignKey.columns.find((column) => !localColumns.has(column.toLowerCase()));
      if (missingLocal) issues.push({ level: "error", code: "FOREIGN_KEY_LOCAL_COLUMN_MISSING", message: `Foreign key references unknown local column “${table.name}.${missingLocal}”.`, path: `tables.${table.name}.foreignKeys.${index}` });
      if (!referenced) {
        issues.push({ level: "error", code: "FOREIGN_KEY_TABLE_MISSING", message: `Foreign key on “${table.name}” references unknown table “${foreignKey.referencedTable}”.`, path: `tables.${table.name}.foreignKeys.${index}` });
        continue;
      }
      const targetColumns = new Set(referenced.columns.map((column) => column.name.toLowerCase()));
      const missingTarget = foreignKey.referencedColumns.find((column) => !targetColumns.has(column.toLowerCase()));
      if (missingTarget) issues.push({ level: "error", code: "FOREIGN_KEY_TARGET_COLUMN_MISSING", message: `Foreign key references unknown target column “${referenced.name}.${missingTarget}”.`, path: `tables.${table.name}.foreignKeys.${index}` });
      if (!missingLocal && !missingTarget) relationships.push({
        id: foreignKey.name ?? `fk-${table.name}-${index + 1}`,
        source: table.name,
        target: referenced.name,
        sourceColumns: foreignKey.columns,
        targetColumns: foreignKey.referencedColumns,
        relationship: "many-to-one" as const,
        cardinality: { source: "many" as const, target: "one" as const },
        onDelete: foreignKey.onDelete,
        onUpdate: foreignKey.onUpdate,
      });
    }
  }

  const nodes = input.tables.map((table) => {
    const foreignColumns = new Set(table.foreignKeys.flatMap((foreignKey) => foreignKey.columns.map((column) => column.toLowerCase())));
    return {
      id: table.name,
      label: table.name,
      type: table.type,
      columns: table.columns.map((column) => ({
        name: column.name,
        declaredType: column.type,
        affinity: affinity(column.type),
        notNull: column.notNull,
        primaryKey: column.primaryKey,
        foreignKey: foreignColumns.has(column.name.toLowerCase()),
        keyRole: column.primaryKey && foreignColumns.has(column.name.toLowerCase()) ? "primary-and-foreign" : column.primaryKey ? "primary" : foreignColumns.has(column.name.toLowerCase()) ? "foreign" : null,
      })),
      primaryKey: table.columns.filter((column) => column.primaryKey).map((column) => column.name),
      indexes: table.indexes,
    };
  });

  return {
    databaseName: input.databaseName ?? null,
    dialect: input.dialect,
    compatible: !issues.some((issue) => issue.level === "error"),
    summary: { tableCount: input.tables.filter((table) => table.type === "table").length, viewCount: input.tables.filter((table) => table.type === "view").length, relationshipCount: relationships.length },
    erDiagram: { nodes, edges: relationships },
    issues,
    privacy: { recordsReceived: false, analyzedFields: ["table names", "column declarations", "keys", "indexes"] },
  };
}

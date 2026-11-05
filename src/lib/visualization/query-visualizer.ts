import {
  Parser,
  type AST,
  type Column,
  type Delete,
  type ExpressionValue,
  type Insert_Replace,
  type Select,
  type Update,
} from "node-sql-parser";

import type { QueryResult, SqlValue } from "@/lib/database/types";
import type {
  VisualizationAggregate,
  VisualizationAnalysis,
  VisualizationCellChange,
  VisualizationGroupSummary,
  VisualizationPanel,
  VisualizationPlan,
  VisualizationSourceTable,
  VisualizationStep,
  VisualizationTable,
} from "@/lib/visualization/types";

export const SUPPORTED_VISUALIZATION_SUBSET = "Single-table SELECTs; one INNER or LEFT equi-join; simple GROUP BY with COUNT, SUM, AVG, MIN, or MAX; and literal VALUES INSERT, literal SET UPDATE, or DELETE against one rowid table. CTEs, subqueries, HAVING, expression joins, aggregate DISTINCT, RETURNING, and multi-statement SQL still run normally but are not animated.";

const parser = new Parser();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const ALLOWED_OPERATORS = new Set(["AND", "OR", "=", "!=", "<>", ">", ">=", "<", "<=", "IS", "IS NOT", "LIKE", "NOT LIKE", "GLOB", "IN", "NOT IN", "BETWEEN", "NOT BETWEEN"]);
const AGGREGATES = new Set(["COUNT", "SUM", "AVG", "MIN", "MAX"]);
const LITERAL_TYPES = new Set(["number", "string", "single_quote_string", "double_quote_string", "boolean", "bool", "null", "date", "datetime", "time", "timestamp"]);
const VISUAL_ROW_LIMIT = 200;

type AstValue = {
  type: string;
  value?: unknown;
  operator?: string;
  left?: AstValue;
  right?: AstValue;
  table?: string | null;
  column?: unknown;
  value_list?: AstValue[];
  values?: AstValue[];
  args?: { expr?: AstValue; distinct?: string | null };
  name?: string;
};

type SourceRef = { tableName: string; alias: string | null };
type QualifiedColumn = { table: string | null; column: string };
type ParsedSelectItem =
  | { kind: "column"; ref: QualifiedColumn; output: string }
  | { kind: "aggregate"; aggregate: VisualizationAggregate };

export interface MutationPreviewResult {
  before: QueryResult[];
  mutation: QueryResult;
  after: QueryResult[];
}

export type PreviewMutation = (input: {
  sql: string;
  beforeQueries: string[];
  afterQueries: string[];
}) => Promise<MutationPreviewResult>;

function unsupported(message: string): never {
  throw new Error(`This query can run normally, but the visualizer supports ${message}.`);
}

function parseSingleStatement(sql: string) {
  let parsed: ReturnType<Parser["astify"]>;
  try {
    parsed = parser.astify(sql, { database: "sqlite" });
  } catch (error) {
    throw new Error(`SQL parser: ${error instanceof Error ? error.message : "The query could not be parsed."}`);
  }
  if (Array.isArray(parsed) && parsed.length !== 1) unsupported("one statement at a time");
  return (Array.isArray(parsed) ? parsed[0] : parsed) as AST;
}

function sourceFrom(value: unknown): SourceRef {
  const source = value as { table?: string; as?: string | null; db?: string | null; schema?: string | null };
  if (!source?.table || source.db || source.schema) unsupported("local SQLite tables without database qualifiers");
  return { tableName: source.table, alias: source.as ?? null };
}

function sourceQualifier(source: SourceRef) {
  return source.alias ?? source.tableName;
}

function findSource(qualifier: string | null | undefined, sources: SourceRef[], context: string) {
  if (!qualifier) {
    if (sources.length === 1) return sources[0];
    unsupported(`qualified column names in ${context} when a join is present`);
  }
  const match = sources.find((source) => sourceQualifier(source).toLowerCase() === qualifier.toLowerCase() || source.tableName.toLowerCase() === qualifier.toLowerCase());
  if (!match) unsupported(`column references to the participating tables in ${context}`);
  return match;
}

function validateExpression(expression: AstValue, sources: SourceRef[], context = "WHERE"): void {
  if (!expression || typeof expression !== "object") unsupported("structured comparison expressions");
  if (expression.type === "column_ref") {
    if (typeof expression.column !== "string" || expression.column === "*") unsupported(`named columns in ${context}`);
    findSource(expression.table, sources, context);
    return;
  }
  if (LITERAL_TYPES.has(expression.type)) return;
  if (expression.type === "expr_list") {
    const values = (expression.value as AstValue[] | undefined) ?? expression.values ?? expression.value_list ?? [];
    values.forEach((value) => validateExpression(value, sources, context));
    return;
  }
  if (expression.type === "binary_expr" && expression.operator && ALLOWED_OPERATORS.has(expression.operator.toUpperCase())) {
    validateExpression(expression.left!, sources, context);
    validateExpression(expression.right!, sources, context);
    return;
  }
  unsupported("comparisons joined by AND/OR; functions, arithmetic, CASE, and subqueries are not animated in predicates yet");
}

function asColumnRef(expression: AstValue, sources: SourceRef[], context: string): QualifiedColumn {
  if (expression.type !== "column_ref" || typeof expression.column !== "string") unsupported(`named columns in ${context}`);
  if (expression.column === "*") return { table: expression.table ?? null, column: "*" };
  const source = findSource(expression.table, sources, context);
  return { table: sourceQualifier(source), column: expression.column };
}

function outputName(column: Column, fallback: string) {
  if (typeof column.as === "string") return column.as;
  if (column.as && typeof column.as === "object" && "value" in column.as) return String(column.as.value);
  return fallback;
}

function refKey(ref: QualifiedColumn) {
  return `${ref.table?.toLowerCase() ?? ""}.${ref.column.toLowerCase()}`;
}

function refLabel(ref: QualifiedColumn) {
  return ref.table ? `${ref.table}.${ref.column}` : ref.column;
}

function parseSelectItems(columns: Column[], sources: SourceRef[]) {
  return columns.map<ParsedSelectItem>((column) => {
    const expression = column.expr as unknown as AstValue;
    if (expression.type === "column_ref") {
      const ref = asColumnRef(expression, sources, "SELECT");
      return { kind: "column", ref, output: outputName(column, ref.column) };
    }
    if (expression.type !== "aggr_func" || !expression.name || !AGGREGATES.has(expression.name.toUpperCase())) {
      unsupported("simple columns and COUNT, SUM, AVG, MIN, or MAX in SELECT");
    }
    if (expression.args?.distinct) unsupported("aggregate functions without DISTINCT");
    const fn = expression.name.toUpperCase() as VisualizationAggregate["function"];
    const argument = expression.args?.expr;
    if (!argument) unsupported("one aggregate argument");
    let table: string | null = null;
    let sourceColumn = "*";
    if (argument.type !== "star") {
      const ref = asColumnRef(argument, sources, `${fn}()`);
      table = ref.table;
      sourceColumn = ref.column;
    } else if (fn !== "COUNT") {
      unsupported("COUNT(*) or aggregate functions over one named column");
    }
    const fallback = `${fn}(${table ? `${table}.` : ""}${sourceColumn})`;
    return { kind: "aggregate", aggregate: { function: fn, table, column: sourceColumn, output: outputName(column, fallback) } };
  });
}

function readLimit(ast: Select) {
  const values = ast.limit?.value ?? [];
  if (values.some((value) => value.type !== "number" || !Number.isSafeInteger(Number(value.value)) || Number(value.value) < 0)) unsupported("a non-negative numeric LIMIT/OFFSET");
  return { limit: values.length ? Number(values[0].value) : null, offset: values.length > 1 ? Number(values[1].value) : 0 };
}

function baseAnalysis(statementType: VisualizationAnalysis["statementType"], sources: SourceRef[]): VisualizationAnalysis {
  return {
    statementType,
    tableName: sources[0].tableName,
    tableAlias: sources[0].alias,
    sourceTables: sources,
    selectedColumns: [],
    hasWhere: false,
    distinct: false,
    orderBy: [],
    limit: null,
    offset: 0,
    join: null,
    groupBy: [],
    aggregates: [],
    mutationColumns: [],
  };
}

function analyzeSelect(ast: Select): VisualizationAnalysis {
  if (ast._next || ast.set_op) unsupported("a SELECT without UNION or compound queries");
  if (ast.with || ast.window || ast.qualify) unsupported("no CTE, window, or QUALIFY clauses");
  if (ast.having) unsupported("GROUP BY without HAVING in this bounded version");
  if (!Array.isArray(ast.from) || (ast.from.length !== 1 && ast.from.length !== 2)) unsupported("one table or exactly one INNER/LEFT JOIN");
  const sources = ast.from.map(sourceFrom);
  const analysis = baseAnalysis("select", sources);

  if (sources.length === 2) {
    const joinEntry = ast.from[1] as unknown as { join?: string; on?: AstValue };
    const joinType = joinEntry.join?.toUpperCase();
    if (joinType !== "INNER JOIN" && joinType !== "JOIN" && joinType !== "LEFT JOIN" && joinType !== "LEFT OUTER JOIN") unsupported("one INNER JOIN or LEFT JOIN");
    const on = joinEntry.on;
    if (!on || on.type !== "binary_expr" || on.operator !== "=" || on.left?.type !== "column_ref" || on.right?.type !== "column_ref") unsupported("an equi-join such as a.id = b.foreign_id");
    const leftRef = asColumnRef(on.left, sources, "JOIN ON");
    const rightRef = asColumnRef(on.right, sources, "JOIN ON");
    if (!leftRef.table || !rightRef.table || leftRef.table.toLowerCase() === rightRef.table.toLowerCase()) unsupported("join columns from opposite participating tables");
    const leftSource = findSource(leftRef.table, sources, "JOIN ON");
    const rightSource = findSource(rightRef.table, sources, "JOIN ON");
    analysis.join = {
      type: joinType.startsWith("LEFT") ? "LEFT" : "INNER",
      left: { table: leftSource.tableName, column: leftRef.column },
      right: { table: rightSource.tableName, column: rightRef.column },
    };
  } else if ((ast.from[0] as unknown as { join?: string }).join) {
    unsupported("one table or exactly one INNER/LEFT JOIN");
  }

  const columns = ast.columns as Column[];
  if (!Array.isArray(columns) || !columns.length) unsupported("at least one selected column");
  const items = parseSelectItems(columns, sources);
  analysis.selectedColumns = items.filter((item): item is Extract<ParsedSelectItem, { kind: "column" }> => item.kind === "column").map((item) => ({ source: item.ref.column, output: item.output, table: item.ref.table }));
  analysis.aggregates = items.filter((item): item is Extract<ParsedSelectItem, { kind: "aggregate" }> => item.kind === "aggregate").map((item) => item.aggregate);

  if (ast.where) {
    validateExpression(ast.where as unknown as AstValue, sources);
    analysis.hasWhere = true;
  }

  const groupColumns = ast.groupby?.columns ?? [];
  analysis.groupBy = groupColumns.map((column) => asColumnRef(column as unknown as AstValue, sources, "GROUP BY"));
  const grouped = analysis.groupBy.length > 0 || analysis.aggregates.length > 0;
  if (grouped) {
    if (ast.distinct) unsupported("GROUP BY or aggregate queries without SELECT DISTINCT");
    if (items.some((item) => item.kind === "column" && item.ref.column === "*")) unsupported("named grouping columns rather than * in aggregate queries");
    const groupKeys = new Set(analysis.groupBy.map(refKey));
    const selectedKeys = new Set(items.filter((item): item is Extract<ParsedSelectItem, { kind: "column" }> => item.kind === "column").map((item) => refKey(item.ref)));
    if (items.some((item) => item.kind === "column" && !groupKeys.has(refKey(item.ref)))) unsupported("every non-aggregate SELECT column to appear in GROUP BY");
    if (analysis.groupBy.some((column) => !selectedKeys.has(refKey(column)))) unsupported("each GROUP BY column to also appear in SELECT");
    if (!analysis.groupBy.length && items.some((item) => item.kind === "column")) unsupported("only aggregate outputs when GROUP BY is omitted");
  }

  analysis.distinct = Boolean(ast.distinct);
  analysis.orderBy = (ast.orderby ?? []).map((order) => {
    const expression = order.expr as unknown as AstValue;
    if (expression.type !== "column_ref" || typeof expression.column !== "string") unsupported("ORDER BY named columns or output aliases only");
    if (expression.table) findSource(expression.table, sources, "ORDER BY");
    return { column: expression.column, direction: (order.type ?? "ASC").toUpperCase() as "ASC" | "DESC" };
  });
  const limit = readLimit(ast);
  analysis.limit = limit.limit;
  analysis.offset = limit.offset;
  return analysis;
}

function analyzeInsert(ast: Insert_Replace) {
  if (ast.type !== "insert" || !Array.isArray(ast.table) || ast.table.length !== 1) unsupported("one INSERT INTO table statement");
  const sources = [sourceFrom(ast.table[0])];
  if (!ast.columns?.length || ast.returning || ast.on_duplicate_update) unsupported("INSERT with an explicit column list, literal VALUES, and no RETURNING or conflict clause");
  if (!ast.values || ast.values.type !== "values" || !Array.isArray(ast.values.values) || !ast.values.values.length) unsupported("INSERT ... VALUES rather than INSERT ... SELECT");
  const rows = ast.values.values as unknown as Array<{ type: string; value?: AstValue[] }>;
  for (const row of rows) {
    if (row.type !== "expr_list" || !Array.isArray(row.value) || row.value.length !== ast.columns.length || row.value.some((value) => !LITERAL_TYPES.has(value.type))) unsupported("literal INSERT values matching the explicit column list");
  }
  return { ...baseAnalysis("insert", sources), mutationColumns: [...ast.columns] };
}

function analyzeUpdate(ast: Update) {
  if (!Array.isArray(ast.table) || ast.table.length !== 1 || ast.returning || (ast as unknown as { orderby?: unknown }).orderby || (ast as unknown as { limit?: unknown }).limit) unsupported("one UPDATE table with no RETURNING, ORDER BY, or LIMIT");
  const sources = [sourceFrom(ast.table[0])];
  if (!ast.set?.length) unsupported("UPDATE with at least one SET assignment");
  const columns: string[] = [];
  for (const assignment of ast.set as unknown as Array<{ column?: string; value?: AstValue }>) {
    if (!assignment.column || !assignment.value || !LITERAL_TYPES.has(assignment.value.type)) unsupported("UPDATE assignments to literal values");
    columns.push(assignment.column);
  }
  if (ast.where) validateExpression(ast.where as unknown as AstValue, sources);
  return { ...baseAnalysis("update", sources), hasWhere: Boolean(ast.where), mutationColumns: columns };
}

function analyzeDelete(ast: Delete) {
  if (!Array.isArray(ast.from) || ast.from.length !== 1 || ast.returning || (ast as unknown as { orderby?: unknown }).orderby || (ast as unknown as { limit?: unknown }).limit) unsupported("one DELETE FROM table with no RETURNING, ORDER BY, or LIMIT");
  const sources = [sourceFrom(ast.from[0])];
  if (ast.where) validateExpression(ast.where as unknown as AstValue, sources);
  return { ...baseAnalysis("delete", sources), hasWhere: Boolean(ast.where) };
}

export function analyzeVisualizationQuery(sql: string) {
  const ast = parseSingleStatement(sql);
  let analysis: VisualizationAnalysis;
  if (ast.type === "select") analysis = analyzeSelect(ast as Select);
  else if (ast.type === "insert") analysis = analyzeInsert(ast as Insert_Replace);
  else if (ast.type === "update") analysis = analyzeUpdate(ast as Update);
  else if (ast.type === "delete") analysis = analyzeDelete(ast as Delete);
  else unsupported("SELECT, INSERT, UPDATE, or DELETE statements in the documented subset");
  return { ast, analysis };
}

function queryWith(ast: Select, changes: Partial<Select>) {
  return parser.sqlify({ ...clone(ast), ...changes }, { database: "sqlite" });
}

function rowIdColumn(table: string | null, alias: string): Column {
  return { expr: { type: "column_ref", table, column: "rowid" } as ExpressionValue, as: alias };
}

function starColumn(table: string | null = null): Column {
  return { expr: { type: "column_ref", table, column: "*" } as ExpressionValue, as: null };
}

function stableValue(value: SqlValue) {
  if (value instanceof Uint8Array) return `blob:${Array.from(value).join(",")}`;
  return `${value === null ? "null" : typeof value}:${String(value)}`;
}

function makeRowKeys(values: SqlValue[][]) {
  const seen = new Map<string, number>();
  return values.map((row) => {
    const base = row.map(stableValue).join("|");
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return `${base}#${occurrence}`;
  });
}

function capTable(table: VisualizationTable): VisualizationTable {
  const totalRows = table.totalRows ?? table.values.length;
  if (table.values.length <= VISUAL_ROW_LIMIT) return { ...table, totalRows };
  return {
    ...table,
    values: table.values.slice(0, VISUAL_ROW_LIMIT),
    rowIds: table.rowIds?.slice(0, VISUAL_ROW_LIMIT),
    rowKeys: table.rowKeys?.slice(0, VISUAL_ROW_LIMIT),
    rowGroups: table.rowGroups?.slice(0, VISUAL_ROW_LIMIT),
    totalRows,
    truncated: true,
  };
}

function tableFromResult(result: QueryResult): VisualizationTable {
  return capTable({ columns: result.columns, values: result.values, rowKeys: makeRowKeys(result.values), totalRows: result.values.length });
}

function stripRowIds(result: QueryResult): VisualizationTable {
  return capTable(rowIdTable(result));
}

function rowIdTable(result: QueryResult): VisualizationTable {
  const values = result.values.map((row) => row.slice(1));
  return { columns: result.columns.slice(1), values, rowIds: result.values.map((row) => Number(row[0])), rowKeys: makeRowKeys(values), totalRows: result.values.length };
}

function focusRows(table: VisualizationTable, focusIds: number[]) {
  if (table.values.length <= VISUAL_ROW_LIMIT) return table;
  const focus = new Set(focusIds.slice(0, VISUAL_ROW_LIMIT));
  const indices: number[] = [];
  table.rowIds?.forEach((id, index) => { if (focus.has(id)) indices.push(index); });
  for (let index = 0; index < table.values.length && indices.length < VISUAL_ROW_LIMIT; index += 1) {
    if (!indices.includes(index)) indices.push(index);
  }
  indices.sort((left, right) => left - right);
  return {
    ...table,
    values: indices.map((index) => table.values[index]),
    rowIds: indices.map((index) => table.rowIds![index]),
    rowKeys: indices.map((index) => table.rowKeys![index]),
    totalRows: table.values.length,
    truncated: true,
  };
}

function stripJoinIds(result: QueryResult): { table: VisualizationTable; leftIds: Array<number | null>; rightIds: Array<number | null> } {
  const leftIds = result.values.map((row) => row[0] === null ? null : Number(row[0]));
  const rightIds = result.values.map((row) => row[1] === null ? null : Number(row[1]));
  const values = result.values.map((row) => row.slice(2));
  const rowKeys = result.values.map((row) => `${String(row[0])}:${String(row[1])}`);
  return { table: capTable({ columns: result.columns.slice(2), values, rowKeys, totalRows: result.values.length }), leftIds, rightIds };
}

function sameValue(left: SqlValue, right: SqlValue) {
  return left instanceof Uint8Array && right instanceof Uint8Array
    ? left.length === right.length && left.every((value, index) => value === right[index])
    : left === right;
}

function resultsEqual(left: QueryResult, right: QueryResult) {
  return left.columns.length === right.columns.length
    && left.columns.every((column, index) => column === right.columns[index])
    && left.values.length === right.values.length
    && left.values.every((row, rowIndex) => row.length === right.values[rowIndex].length && row.every((value, columnIndex) => sameValue(value, right.values[rowIndex][columnIndex])));
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function sourceTableSql(source: SourceRef) {
  return `SELECT rowid AS "__qq_rowid__", * FROM ${quoteIdentifier(source.tableName)}`;
}

async function loadSources(sources: SourceRef[], execute: (sql: string) => Promise<QueryResult>) {
  const loaded: VisualizationSourceTable[] = [];
  for (const source of sources) {
    loaded.push({ tableName: source.tableName, alias: source.alias, table: stripRowIds(await execute(sourceTableSql(source))) });
  }
  return loaded;
}

function sourcePanels(sources: VisualizationSourceTable[], analysis: VisualizationAnalysis, withMatches?: { leftIds: number[]; rightIds: number[]; unmatchedLeftIds: number[] }): VisualizationPanel[] {
  return sources.map((source, index) => {
    const joinColumn = analysis.join ? (source.tableName.toLowerCase() === analysis.join.left.table.toLowerCase() ? analysis.join.left.column : analysis.join.right.column) : undefined;
    return {
      id: `${source.tableName}-${index}`,
      label: source.alias ? `${source.tableName} as ${source.alias}` : source.tableName,
      table: source.table,
      highlightedColumns: joinColumn ? [joinColumn] : analysis.groupBy.filter((group) => !group.table || group.table.toLowerCase() === sourceQualifier(source).toLowerCase() || group.table.toLowerCase() === source.tableName.toLowerCase()).map((group) => group.column),
      highlightedRowIds: withMatches ? (index === 0 ? withMatches.leftIds : withMatches.rightIds) : undefined,
      unmatchedRowIds: withMatches && index === 0 ? withMatches.unmatchedLeftIds : undefined,
    };
  });
}

function finalPlan(sql: string, analysis: VisualizationAnalysis, sources: VisualizationSourceTable[], finalResult: QueryResult, steps: VisualizationStep[], validated: boolean, mutationResult?: QueryResult): VisualizationPlan {
  return { sql, analysis, source: sources[0].table, sources, finalResult, mutationResult, steps, validated };
}

async function appendResultStages(ast: Select, analysis: VisualizationAnalysis, steps: VisualizationStep[], execute: (sql: string) => Promise<QueryResult>, identityColumn?: Column) {
  const base: Partial<Select> = { columns: clone(ast.columns as Column[]), where: clone(ast.where), groupby: clone(ast.groupby), having: null, limit: null };
  if (ast.distinct) {
    const result = await execute(queryWith(ast, { ...base, distinct: "DISTINCT", orderby: null }));
    steps.push({ id: "distinct", kind: "distinct", title: "Remove duplicate rows", clause: "DISTINCT", explanation: "DISTINCT compares the projected values using SQLite semantics. Duplicate rows collapse, including duplicate NULL projections.", table: tableFromResult(result) });
  }
  if (ast.orderby?.length) {
    const withIdentity = identityColumn && !ast.distinct;
    const result = await execute(queryWith(ast, { ...base, columns: withIdentity ? [identityColumn, ...clone(ast.columns as Column[])] : base.columns, distinct: ast.distinct, orderby: clone(ast.orderby), limit: null }));
    steps.push({ id: "order", kind: "order", title: "Arrange the rows", clause: "ORDER BY", explanation: `ORDER BY arranges rows by ${analysis.orderBy.map((item) => `${item.column} ${item.direction}`).join(", ")}. The movement is logical ordering, not a physical execution plan.`, table: withIdentity ? stripRowIds(result) : tableFromResult(result), animateReorder: true });
  }
  if (ast.limit) {
    const withIdentity = identityColumn && !ast.distinct;
    const result = await execute(queryWith(ast, { ...base, columns: withIdentity ? [identityColumn, ...clone(ast.columns as Column[])] : base.columns, distinct: ast.distinct, orderby: clone(ast.orderby), limit: clone(ast.limit) }));
    steps.push({ id: "limit", kind: "limit", title: "Keep the requested slice", clause: "LIMIT", explanation: `LIMIT keeps ${analysis.limit} row${analysis.limit === 1 ? "" : "s"}${analysis.offset ? ` after skipping ${analysis.offset}` : ""}.`, table: withIdentity ? stripRowIds(result) : tableFromResult(result) });
  }
}

async function createSimpleSelectPlan(sql: string, ast: Select, analysis: VisualizationAnalysis, execute: (sql: string) => Promise<QueryResult>) {
  const sources = await loadSources(analysis.sourceTables, execute);
  const source = sources[0].table;
  const rowid = rowIdColumn(analysis.tableAlias, "__qq_rowid__");
  const steps: VisualizationStep[] = [{ id: "source", kind: "source", title: `Read ${analysis.tableName}`, clause: "FROM", explanation: `FROM loads every row from ${analysis.tableName}. No filtering or projection has happened yet.`, table: source }];
  let matchingRowIds = source.rowIds ?? [];
  if (ast.where) {
    const matches = await execute(queryWith(ast, { columns: [rowid], distinct: null, orderby: null, limit: null }));
    matchingRowIds = matches.values.map((row) => Number(row[0]));
    steps.push({ id: "filter", kind: "filter", title: "Evaluate the predicate", clause: "WHERE", explanation: `SQLite evaluates ${parser.exprToSQL(ast.where)} for each row. TRUE rows stay highlighted; FALSE and NULL rows are dimmed.`, table: source, matchingRowIds });
  }
  const highlightedColumns = analysis.selectedColumns.some((column) => column.source === "*") ? source.columns : analysis.selectedColumns.map((column) => column.source);
  steps.push({ id: "project", kind: "project", title: "Choose output columns", clause: "SELECT", explanation: `SELECT keeps ${highlightedColumns.length === source.columns.length ? "all columns" : highlightedColumns.join(", ")}. Aliases affect output labels without changing source data.`, table: source, matchingRowIds: ast.where ? matchingRowIds : undefined, highlightedColumns });
  await appendResultStages(ast, analysis, steps, execute, rowid);
  const visualizedResult = await execute(parser.sqlify(clone(ast), { database: "sqlite" }));
  const finalResult = await execute(sql);
  const validated = resultsEqual(visualizedResult, finalResult);
  steps.push({ id: "result", kind: "result", title: "Final SQLite result", clause: "RESULT", explanation: `The teaching animation is validated against SQLite’s real result: ${finalResult.rowCount} row${finalResult.rowCount === 1 ? "" : "s"} returned.`, table: tableFromResult(finalResult) });
  return finalPlan(sql, analysis, sources, finalResult, steps, validated);
}

function joinRawColumns(analysis: VisualizationAnalysis): Column[] {
  return [
    rowIdColumn(sourceQualifier(analysis.sourceTables[0]), "__qq_left_rowid__"),
    rowIdColumn(sourceQualifier(analysis.sourceTables[1]), "__qq_right_rowid__"),
    starColumn(sourceQualifier(analysis.sourceTables[0])),
    starColumn(sourceQualifier(analysis.sourceTables[1])),
  ];
}

function uniqueNumbers(values: Array<number | null>) {
  return [...new Set(values.filter((value): value is number => value !== null))];
}

function serializeGroup(values: SqlValue[]) {
  return values.map(stableValue).join("¦");
}

function buildContributionColumns(analysis: VisualizationAnalysis) {
  const columns: Column[] = analysis.sourceTables.length === 2
    ? [rowIdColumn(sourceQualifier(analysis.sourceTables[0]), "__qq_left_rowid__"), rowIdColumn(sourceQualifier(analysis.sourceTables[1]), "__qq_right_rowid__")]
    : [rowIdColumn(analysis.tableAlias, "__qq_rowid__")];
  const refs: QualifiedColumn[] = [];
  for (const ref of [...analysis.groupBy, ...analysis.aggregates.filter((aggregate) => aggregate.column !== "*").map((aggregate) => ({ table: aggregate.table, column: aggregate.column }))]) {
    if (!refs.some((item) => refKey(item) === refKey(ref))) refs.push(ref);
  }
  refs.forEach((ref, index) => columns.push({ expr: { type: "column_ref", table: ref.table, column: ref.column } as ExpressionValue, as: `__qq_value_${index}__` }));
  return { columns, refs };
}

function contributionTable(result: QueryResult, idCount: number, labels: string[], groupCount: number) {
  const values = result.values.map((row) => row.slice(idCount));
  const rowIds = idCount === 1 ? result.values.map((row) => Number(row[0])) : undefined;
  const rowKeys = idCount === 2 ? result.values.map((row, index) => `${String(row[0])}:${String(row[1])}:${index}`) : makeRowKeys(values);
  const rowGroups = values.map((row) => serializeGroup(row.slice(0, groupCount)));
  return { columns: labels, values, rowIds, rowKeys, rowGroups, totalRows: result.values.length };
}

function groupSummaries(table: VisualizationTable, analysis: VisualizationAnalysis, aggregateResult: QueryResult, items: ParsedSelectItem[]) {
  const groups = new Map<string, { label: string; rowCount: number }>();
  table.values.forEach((row, index) => {
    const id = table.rowGroups?.[index] ?? "all";
    const groupValues = row.slice(0, analysis.groupBy.length);
    const label = analysis.groupBy.length ? analysis.groupBy.map((group, groupIndex) => `${refLabel(group)} = ${groupValues[groupIndex] === null ? "NULL" : String(groupValues[groupIndex])}`).join(" · ") : "All qualifying rows";
    const current = groups.get(id);
    groups.set(id, { label, rowCount: (current?.rowCount ?? 0) + 1 });
  });
  if (!groups.size && !analysis.groupBy.length) groups.set("all", { label: "All qualifying rows", rowCount: 0 });

  const selectedGroupIndices = analysis.groupBy.map((group) => items.findIndex((item) => item.kind === "column" && refKey(item.ref) === refKey(group)));
  const aggregateIndices = analysis.aggregates.map((aggregate) => items.findIndex((item) => item.kind === "aggregate" && item.aggregate.output === aggregate.output));
  const resultByGroup = new Map<string, SqlValue[]>();
  aggregateResult.values.forEach((row) => {
    const key = analysis.groupBy.length ? serializeGroup(selectedGroupIndices.map((index) => row[index])) : "all";
    resultByGroup.set(key, row);
  });
  return [...groups].map<VisualizationGroupSummary>(([id, group]) => {
    const row = resultByGroup.get(id);
    return { id, label: group.label, rowCount: group.rowCount, calculations: analysis.aggregates.map((aggregate, index) => `${aggregate.output} = ${row ? String(row[aggregateIndices[index]] ?? "NULL") : "NULL"}`) };
  });
}

async function createAdvancedSelectPlan(sql: string, ast: Select, analysis: VisualizationAnalysis, execute: (sql: string) => Promise<QueryResult>) {
  const sources = await loadSources(analysis.sourceTables, execute);
  const steps: VisualizationStep[] = [{ id: "source", kind: "source", title: sources.length === 2 ? "Load the participating tables" : `Read ${analysis.tableName}`, clause: "FROM", explanation: sources.length === 2 ? `FROM loads ${sources.map((source) => source.tableName).join(" and ")} independently before their join condition is evaluated.` : `FROM loads every row from ${analysis.tableName}.`, table: sources[0].table, panels: sourcePanels(sources, analysis) }];
  let workingTable = sources[0].table;

  if (analysis.join) {
    const rawBeforeWhere = await execute(queryWith(ast, { columns: joinRawColumns(analysis), distinct: null, where: null, groupby: undefined, having: null, orderby: null, limit: null }));
    const joined = stripJoinIds(rawBeforeWhere);
    workingTable = joined.table;
    const leftMatches = uniqueNumbers(joined.leftIds.filter((_, index) => joined.rightIds[index] !== null));
    const rightMatches = uniqueNumbers(joined.rightIds);
    const unmatchedLeft = uniqueNumbers(joined.leftIds.filter((_, index) => joined.rightIds[index] === null));
    steps.push({ id: "join", kind: "join", title: analysis.join.type === "LEFT" ? "Preserve left rows and match" : "Match related rows", clause: `${analysis.join.type} JOIN`, explanation: `${analysis.join.left.table}.${analysis.join.left.column} is compared with ${analysis.join.right.table}.${analysis.join.right.column}. ${analysis.join.type === "LEFT" ? `${unmatchedLeft.length} left-side row${unmatchedLeft.length === 1 ? " has" : "s have"} no match, so SQLite supplies NULL for the right-side columns.` : "Only matching combinations continue."}`, table: joined.table, panels: sourcePanels(sources, analysis, { leftIds: leftMatches, rightIds: rightMatches, unmatchedLeftIds: unmatchedLeft }), unmatchedRowKeys: joined.table.rowKeys?.filter((_, index) => joined.rightIds[index] === null), animateCombine: true });
    if (ast.where) {
      const rawAfterWhere = await execute(queryWith(ast, { columns: joinRawColumns(analysis), distinct: null, groupby: undefined, having: null, orderby: null, limit: null }));
      steps.push({ id: "filter", kind: "filter", title: "Filter joined combinations", clause: "WHERE", explanation: `SQLite evaluates ${parser.exprToSQL(ast.where)} after the join. TRUE combinations stay highlighted; FALSE and NULL combinations are dimmed.`, table: joined.table, matchingRowKeys: stripJoinIds(rawAfterWhere).table.rowKeys });
    }
  } else if (ast.where) {
    const matches = await execute(queryWith(ast, { columns: [rowIdColumn(analysis.tableAlias, "__qq_rowid__")], distinct: null, orderby: null, limit: null, groupby: undefined, having: null }));
    steps.push({ id: "filter", kind: "filter", title: "Evaluate the predicate", clause: "WHERE", explanation: `SQLite evaluates ${parser.exprToSQL(ast.where)} for each row. TRUE rows stay highlighted; FALSE and NULL rows are dimmed.`, table: workingTable, matchingRowIds: matches.values.map((row) => Number(row[0])) });
  }

  const grouped = analysis.groupBy.length > 0 || analysis.aggregates.length > 0;
  if (grouped) {
    const contribution = buildContributionColumns(analysis);
    const contributionResult = await execute(queryWith(ast, { columns: contribution.columns, distinct: null, groupby: undefined, having: null, orderby: null, limit: null }));
    const contributionLabels = contribution.refs.map(refLabel);
    const fullContributionView = contributionTable(contributionResult, analysis.sourceTables.length, contributionLabels, analysis.groupBy.length);
    const aggregateResult = await execute(queryWith(ast, { orderby: null, limit: null }));
    const items = parseSelectItems(ast.columns as Column[], analysis.sourceTables);
    const groups = groupSummaries(fullContributionView, analysis, aggregateResult, items);
    const contributionView = capTable(fullContributionView);
    steps.push({ id: "group", kind: "group", title: analysis.groupBy.length ? "Form groups with equal keys" : "Form one aggregate group", clause: analysis.groupBy.length ? "GROUP BY" : "GROUP", explanation: analysis.groupBy.length ? `Rows with equal ${analysis.groupBy.map(refLabel).join(", ")} values are placed into the same logical group. Colored bands show which rows contribute together.` : "Without GROUP BY, all qualifying rows contribute to one aggregate group.", table: contributionView, highlightedColumns: contributionLabels.slice(0, analysis.groupBy.length), groups });
    steps.push({ id: "aggregate", kind: "aggregate", title: "Calculate each aggregate", clause: "AGGREGATE", explanation: `SQLite calculates ${analysis.aggregates.map((aggregate) => aggregate.output).join(", ")} independently for every group. COUNT(column) ignores NULL, while SUM, AVG, MIN, and MAX use SQLite’s native value rules.`, table: tableFromResult(aggregateResult), groups });
  } else {
    const projected = await execute(queryWith(ast, { orderby: null, limit: null }));
    steps.push({ id: "project", kind: "project", title: "Choose output columns", clause: "SELECT", explanation: "SELECT projects the requested columns from each surviving row combination. Output aliases become the displayed column labels.", table: tableFromResult(projected), highlightedColumns: projected.columns });
  }

  await appendResultStages(ast, analysis, steps, execute);
  const visualizedResult = await execute(parser.sqlify(clone(ast), { database: "sqlite" }));
  const finalResult = await execute(sql);
  const validated = resultsEqual(visualizedResult, finalResult);
  steps.push({ id: "result", kind: "result", title: "Final SQLite result", clause: "RESULT", explanation: `The full teaching result is compared with SQLite’s actual output: ${finalResult.rowCount} row${finalResult.rowCount === 1 ? "" : "s"} returned.`, table: tableFromResult(finalResult) });
  return finalPlan(sql, analysis, sources, finalResult, steps, validated);
}

export async function createVisualizationPlan(sql: string, execute: (sql: string) => Promise<QueryResult>): Promise<VisualizationPlan> {
  const { ast, analysis } = analyzeVisualizationQuery(sql);
  if (analysis.statementType !== "select") unsupported("the checkpointed mutation visualization path for INSERT, UPDATE, and DELETE");
  const select = ast as Select;
  return analysis.sourceTables.length === 1 && !analysis.groupBy.length && !analysis.aggregates.length
    ? createSimpleSelectPlan(sql, select, analysis, execute)
    : createAdvancedSelectPlan(sql, select, analysis, execute);
}

function mutationTargetSql(ast: Update | Delete, analysis: VisualizationAnalysis) {
  const source = analysis.sourceTables[0];
  const qualifier = sourceQualifier(source);
  const alias = source.alias ? ` AS ${quoteIdentifier(source.alias)}` : "";
  const where = ast.where ? ` WHERE ${parser.exprToSQL(ast.where)}` : "";
  return `SELECT ${quoteIdentifier(qualifier)}.rowid AS "__qq_rowid__" FROM ${quoteIdentifier(source.tableName)}${alias}${where}`;
}

function resultWithoutRowId(result: QueryResult): QueryResult {
  return { ...result, columns: result.columns.slice(1), values: result.values.map((row) => row.slice(1)), rowCount: result.values.length };
}

function changedCells(before: VisualizationTable, after: VisualizationTable, rowIds: number[], columns: string[]) {
  const beforeIndex = new Map(before.rowIds?.map((id, index) => [id, index]) ?? []);
  const afterIndex = new Map(after.rowIds?.map((id, index) => [id, index]) ?? []);
  const changes: VisualizationCellChange[] = [];
  for (const rowId of rowIds) {
    const left = beforeIndex.get(rowId);
    const right = afterIndex.get(rowId);
    if (left === undefined || right === undefined) continue;
    for (const column of columns) {
      const columnIndex = before.columns.findIndex((name) => name.toLowerCase() === column.toLowerCase());
      if (columnIndex < 0) continue;
      const beforeValue = before.values[left][columnIndex];
      const afterValue = after.values[right][columnIndex];
      if (!sameValue(beforeValue, afterValue)) changes.push({ rowId, column: before.columns[columnIndex], before: beforeValue, after: afterValue });
    }
  }
  return changes;
}

export async function createMutationVisualizationPlan(
  sql: string,
  previewMutation: PreviewMutation,
  executeMutation: () => Promise<QueryResult>,
  executeRead: (sql: string) => Promise<QueryResult>,
): Promise<VisualizationPlan> {
  const { ast, analysis } = analyzeVisualizationQuery(sql);
  if (analysis.statementType === "select") unsupported("the read-only SELECT visualization path");
  const tableSql = sourceTableSql(analysis.sourceTables[0]);
  const targetSql = analysis.statementType === "update" || analysis.statementType === "delete" ? mutationTargetSql(ast as Update | Delete, analysis) : null;
  const preview = await previewMutation({ sql, beforeQueries: targetSql ? [tableSql, targetSql] : [tableSql], afterQueries: [tableSql] });
  const beforeRaw = preview.before[0];
  const afterRaw = preview.after[0];
  const beforeFull = rowIdTable(beforeRaw);
  const expectedAfterFull = rowIdTable(afterRaw);
  const targetIds = targetSql ? preview.before[1].values.map((row) => Number(row[0])) : [];
  const insertedIds = analysis.statementType === "insert" ? (expectedAfterFull.rowIds ?? []).filter((id) => !(beforeFull.rowIds ?? []).includes(id)) : [];
  const focusIds = analysis.statementType === "insert" ? insertedIds : targetIds;
  const before = focusRows(beforeFull, focusIds);
  const expectedAfter = focusRows(expectedAfterFull, focusIds);
  const steps: VisualizationStep[] = [{ id: "source", kind: "source", title: `State before ${analysis.statementType.toUpperCase()}`, clause: "BEFORE", explanation: `This is the checkpoint-protected state of ${analysis.tableName} before the statement runs. Replaying this visualization only replays these captured steps.`, table: before }];

  if (analysis.statementType === "insert") {
    steps.push({ id: "insert", kind: "insert", title: "Insert the new records", clause: "INSERT", explanation: `SQLite adds ${insertedIds.length} new row${insertedIds.length === 1 ? "" : "s"}. Green highlighting distinguishes the inserted records from the pre-existing table.`, table: expectedAfter, highlightedRowIds: insertedIds, highlightedColumns: analysis.mutationColumns, rowTone: "insert", animateCombine: true });
  } else if (analysis.statementType === "update") {
    steps.push({ id: "update-before", kind: "update-before", title: "Locate rows to update", clause: "WHERE", explanation: `${targetIds.length} row${targetIds.length === 1 ? " matches" : "s match"} the UPDATE predicate. The highlighted columns are the fields named by SET.`, table: before, highlightedRowIds: targetIds, highlightedColumns: analysis.mutationColumns, rowTone: "update" });
    const changes = changedCells(beforeFull, expectedAfterFull, targetIds, analysis.mutationColumns);
    steps.push({ id: "update-after", kind: "update-after", title: "Apply the new cell values", clause: "UPDATE", explanation: `${changes.length} cell value${changes.length === 1 ? " changes" : "s change"}. Each highlighted cell shows its captured before value alongside SQLite’s resulting value.`, table: expectedAfter, highlightedRowIds: targetIds, highlightedColumns: analysis.mutationColumns, cellChanges: changes, rowTone: "update" });
  } else {
    steps.push({ id: "delete-before", kind: "delete-before", title: "Identify rows to remove", clause: "DELETE", explanation: `${targetIds.length} affected row${targetIds.length === 1 ? " is" : "s are"} highlighted red before any data is removed.`, table: before, highlightedRowIds: targetIds, rowTone: "delete" });
    steps.push({ id: "delete-after", kind: "delete-after", title: "Remove the affected rows", clause: "AFTER", explanation: `The ${targetIds.length} highlighted row${targetIds.length === 1 ? " is" : "s are"} absent from the captured after-state. Undo can restore the real checkpoint.`, table: expectedAfter, rowTone: "delete", animateCombine: true });
  }

  const mutationResult = await executeMutation();
  const actualAfterRaw = await executeRead(tableSql);
  const validated = resultsEqual(afterRaw, actualAfterRaw);
  const finalResult = resultWithoutRowId(actualAfterRaw);
  steps.push({ id: "result", kind: "result", title: "Validated database state", clause: "RESULT", explanation: `The previewed after-state matches the real checkpointed SQLite database. ${mutationResult.rowsAffected} row${mutationResult.rowsAffected === 1 ? " was" : "s were"} reported affected.`, table: focusRows(rowIdTable(actualAfterRaw), focusIds) });
  const sources: VisualizationSourceTable[] = [{ tableName: analysis.tableName, alias: analysis.tableAlias, table: before }];
  return finalPlan(sql, analysis, sources, finalResult, steps, validated, mutationResult);
}

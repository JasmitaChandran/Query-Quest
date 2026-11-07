import { Parser, type AST } from "node-sql-parser";

import type { ApiIssue, QueryVisualizationRequest, VisualizationStep } from "../../shared/src/contracts.js";

type AstNode = Record<string, unknown>;
const parser = new Parser();
const AGGREGATES = new Set(["COUNT", "SUM", "AVG", "MIN", "MAX"]);
const LITERALS = new Set(["number", "bigint", "string", "single_quote_string", "double_quote_string", "null", "bool", "boolean", "date", "datetime", "time", "timestamp", "full_hex_string", "bit_string"]);

function node(value: unknown): AstNode | null { return value && typeof value === "object" && !Array.isArray(value) ? value as AstNode : null; }
function nodes(value: unknown): AstNode[] { return Array.isArray(value) ? value.map(node).filter((item): item is AstNode => Boolean(item)) : []; }
function text(value: unknown) { return typeof value === "string" ? value : null; }

function sourceName(value: AstNode) {
  return text(value.table) ?? text(node(value.expr)?.table) ?? null;
}

function functionName(expression: AstNode) {
  if (typeof expression.name === "string") return expression.name.toUpperCase();
  return nodes(node(expression.name)?.name).map((part) => text(part.value)).filter(Boolean).join(".").toUpperCase();
}

function columnLabel(value: unknown): string {
  const expression = node(value);
  if (!expression) return "expression";
  const type = text(expression.type)?.toLowerCase();
  if (type === "column_ref") return `${expression.table ? `${String(expression.table)}.` : ""}${String(expression.column ?? "column")}`;
  if (type === "aggr_func" || type === "function") return `${functionName(expression)}(…)`;
  return type ?? "expression";
}

function containsSubquery(value: unknown, root = true): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSubquery(item, false));
  const object = node(value);
  if (!object) return false;
  if (!root && text(object.type)?.toLowerCase() === "select") return true;
  return Object.values(object).some((item) => containsSubquery(item, false));
}

function expressionOperators(value: unknown, result = new Set<string>()) {
  const expression = node(value);
  if (!expression) return result;
  const operator = text(expression.operator);
  if (operator) result.add(operator.toUpperCase());
  Object.values(expression).forEach((item) => {
    if (Array.isArray(item)) item.forEach((nested) => expressionOperators(nested, result));
    else if (item && typeof item === "object") expressionOperators(item, result);
  });
  return result;
}

function aggregateNames(columns: AstNode[]) {
  const values = new Set<string>();
  const visit = (value: unknown) => {
    const expression = node(value);
    if (!expression) return;
    const name = functionName(expression);
    if (AGGREGATES.has(name)) values.add(name);
    Object.values(expression).forEach((item) => Array.isArray(item) ? item.forEach(visit) : visit(item));
  };
  columns.forEach((column) => visit(column.expr));
  return [...values];
}

function step(index: number, operation: string, title: string, explanation: string, metadata: Record<string, unknown> = {}): VisualizationStep {
  return { id: `step-${index}`, operation, title, explanation, metadata };
}

function validateRequestedSchema(input: QueryVisualizationRequest, tables: string[], issues: ApiIssue[]) {
  if (!input.schema) return;
  const available = new Set(input.schema.map((table) => table.name.toLowerCase()));
  for (const table of tables) if (!available.has(table.toLowerCase())) issues.push({ level: "error", code: "TABLE_NOT_IN_SCHEMA", message: `Query references table “${table}”, which is absent from the supplied metadata-only schema.` });
}

function analyzeSelect(ast: AstNode, input: QueryVisualizationRequest, issues: ApiIssue[]) {
  if (ast.with || ast._next || ast.union) issues.push({ level: "error", code: "UNSUPPORTED_SELECT_SHAPE", message: "CTEs and compound SELECT statements are outside this visualization subset." });
  if (containsSubquery(ast)) issues.push({ level: "error", code: "SUBQUERY_UNSUPPORTED", message: "Subqueries are not visualized by this service." });
  const from = nodes(ast.from);
  if (!from.length) issues.push({ level: "error", code: "SOURCE_REQUIRED", message: "Educational SELECT visualization requires a table source." });
  const tables = from.map(sourceName).filter((name): name is string => Boolean(name));
  validateRequestedSchema(input, tables, issues);
  const joins = from.slice(1).map((source) => ({ table: sourceName(source), kind: (text(source.join) ?? "JOIN").toUpperCase(), hasCondition: Boolean(source.on) }));
  if (joins.some((join) => !["JOIN", "INNER JOIN", "LEFT JOIN", "LEFT OUTER JOIN"].includes(join.kind) || !join.hasCondition)) issues.push({ level: "error", code: "JOIN_UNSUPPORTED", message: "Only INNER and LEFT joins with an ON condition are supported." });

  const columns = nodes(ast.columns);
  const projected = columns.map((column) => text(column.as) ?? columnLabel(column.expr));
  const aggregates = aggregateNames(columns);
  const groupBy = nodes(node(ast.groupby)?.columns ?? ast.groupby).map((column) => columnLabel(column));
  const orderBy = nodes(ast.orderby).map((item) => ({ column: columnLabel(item.expr), direction: (text(item.type) ?? "ASC").toUpperCase() }));
  const limit = node(ast.limit);
  const limitValues = nodes(limit?.value).map((item) => Number(item.value)).filter(Number.isFinite);
  const steps: VisualizationStep[] = [];
  let index = 1;
  if (tables.length) steps.push(step(index++, "FROM", "Load source rows", `Begin with the rows from ${tables.join(" and ")}.`, { tables }));
  joins.forEach((join) => steps.push(step(index++, join.kind.startsWith("LEFT") ? "LEFT JOIN" : "INNER JOIN", `Match rows with ${join.table}`, join.kind.startsWith("LEFT") ? "Keep every row from the left source and attach matching right-side rows, using NULL when no match exists." : "Keep combinations whose join condition matches in both sources.", join)));
  if (ast.where) steps.push(step(index++, "WHERE", "Filter candidate rows", "Evaluate the WHERE predicate using SQL three-valued logic; only TRUE rows continue.", { operators: [...expressionOperators(ast.where)] }));
  if (groupBy.length) steps.push(step(index++, "GROUP BY", "Form groups", `Collect rows that share the same ${groupBy.join(", ")} value${groupBy.length === 1 ? "" : "s"}.`, { columns: groupBy }));
  if (aggregates.length) steps.push(step(index++, "AGGREGATE", "Calculate aggregate values", `Compute ${aggregates.join(", ")} for ${groupBy.length ? "each group" : "the filtered row set"}.`, { functions: aggregates }));
  steps.push(step(index++, "SELECT", "Project output columns", `Keep the requested output: ${projected.join(", ") || "expression columns"}.`, { columns: projected }));
  if (ast.distinct) steps.push(step(index++, "DISTINCT", "Remove duplicate output rows", "Compare projected rows and retain one copy of each distinct value combination."));
  if (orderBy.length) steps.push(step(index++, "ORDER BY", "Sort the output", "Order rows by the requested expressions and directions.", { orderBy }));
  if (limitValues.length) steps.push(step(index++, "LIMIT", "Take the requested window", "Return only the requested number of ordered rows, applying an offset when present.", { values: limitValues }));
  steps.push(step(index, "RESULT", "Present the logical result", "The remaining projected rows form the query result."));
  return { statementType: "select", tables, operations: steps.map((item) => item.operation), steps };
}

function literalValuesOnly(value: unknown): boolean {
  const expression = node(value);
  if (!expression) return false;
  const type = text(expression.type)?.toLowerCase() ?? "";
  if (LITERALS.has(type)) return true;
  if (type === "expr_list" || type === "values") return (Array.isArray(expression.value) ? expression.value : Array.isArray(expression.values) ? expression.values : []).every(literalValuesOnly);
  return false;
}

function analyzeMutation(ast: AstNode, input: QueryVisualizationRequest, issues: ApiIssue[]) {
  const statementType = text(ast.type)?.toLowerCase() ?? "unknown";
  const sources = Array.isArray(ast.table) ? nodes(ast.table) : [node(ast.table)].filter((item): item is AstNode => Boolean(item));
  const table = sourceName(sources[0] ?? {}) ?? null;
  if (!table || sources.length !== 1) issues.push({ level: "error", code: "MUTATION_TARGET", message: "Mutation visualization supports one target table." });
  if (table) validateRequestedSchema(input, [table], issues);
  if (containsSubquery(ast)) issues.push({ level: "error", code: "SUBQUERY_UNSUPPORTED", message: "Mutation subqueries are outside the supported subset." });
  const steps: VisualizationStep[] = [];
  let index = 1;
  if (statementType === "insert") {
    if (text(node(ast.values)?.type)?.toLowerCase() !== "values" || !literalValuesOnly(ast.values) || ast.on_duplicate_update || String(ast.prefix ?? "").toLowerCase().includes("ignore")) issues.push({ level: "error", code: "INSERT_UNSUPPORTED", message: "INSERT visualization requires literal VALUES without IGNORE, conflict updates, or subqueries." });
    const rows = nodes(node(ast.values)?.values).length;
    steps.push(step(index++, "TARGET", "Locate the target table", `Prepare to insert into ${table ?? "the target table"}.`, { table }));
    steps.push(step(index++, "INSERT", "Add new rows", `Append ${rows} literal row${rows === 1 ? "" : "s"} and highlight them as newly inserted.`, { rowCount: rows, columns: ast.columns ?? null }));
  } else if (statementType === "update") {
    const assignments = nodes(ast.set).map((assignment) => String(node(assignment.column)?.column ?? assignment.column ?? "column"));
    if (!nodes(ast.set).every((assignment) => literalValuesOnly(assignment.value))) issues.push({ level: "error", code: "UPDATE_EXPRESSION_UNSUPPORTED", message: "UPDATE visualization supports literal assignment values only." });
    steps.push(step(index++, "TARGET", "Load the target rows", `Begin with rows from ${table ?? "the target table"}.`, { table }));
    if (ast.where) steps.push(step(index++, "WHERE", "Find affected rows", "Evaluate the WHERE predicate and highlight matching rows.", { operators: [...expressionOperators(ast.where)] }));
    steps.push(step(index++, "UPDATE", "Apply cell changes", `Show before-and-after values for ${assignments.join(", ") || "the assigned columns"}.`, { columns: assignments }));
  } else if (statementType === "delete") {
    steps.push(step(index++, "TARGET", "Load the target rows", `Begin with rows from ${table ?? "the target table"}.`, { table }));
    if (ast.where) steps.push(step(index++, "WHERE", "Find affected rows", "Evaluate the WHERE predicate and highlight rows that will be deleted.", { operators: [...expressionOperators(ast.where)] }));
    else issues.push({ level: "warning", code: "DELETE_ALL", message: "DELETE without WHERE affects every row in the target table." });
    steps.push(step(index++, "DELETE", "Remove highlighted rows", "Show the affected rows in red before removing them from the after-state."));
  }
  steps.push(step(index, "RESULT", "Present the after-state", "The final step describes the logical table state after one execution. Replaying metadata does not execute the statement again."));
  return { statementType, tables: table ? [table] : [], operations: steps.map((item) => item.operation), steps };
}

export function analyzeQuery(input: QueryVisualizationRequest) {
  const issues: ApiIssue[] = [];
  let parsed: ReturnType<Parser["astify"]>;
  try { parsed = parser.astify(input.sql, { database: input.dialect === "mysql" ? "MySQL" : "sqlite" }); }
  catch (error) {
    return { supported: false, statementType: null, normalizedSql: null, tables: [], operations: [], steps: [], issues: [{ level: "error", code: "SQL_PARSE_ERROR", message: error instanceof Error ? error.message : "SQL could not be parsed." }] satisfies ApiIssue[], privacy: { recordsReceived: false } };
  }
  const statements = Array.isArray(parsed) ? parsed : [parsed];
  if (statements.length !== 1) return { supported: false, statementType: null, normalizedSql: null, tables: [], operations: [], steps: [], issues: [{ level: "error", code: "MULTI_STATEMENT", message: "Analyze one SQL statement at a time." }] satisfies ApiIssue[], privacy: { recordsReceived: false } };
  const ast = node(statements[0] as AST);
  if (!ast) return { supported: false, statementType: null, normalizedSql: null, tables: [], operations: [], steps: [], issues: [{ level: "error", code: "SQL_AST_ERROR", message: "The parser did not return a supported statement." }] satisfies ApiIssue[], privacy: { recordsReceived: false } };
  const type = text(ast.type)?.toLowerCase();
  const analysis = type === "select" ? analyzeSelect(ast, input, issues) : ["insert", "update", "delete"].includes(type ?? "") ? analyzeMutation(ast, input, issues) : { statementType: type ?? "unknown", tables: [], operations: [], steps: [] };
  if (!["select", "insert", "update", "delete"].includes(type ?? "")) issues.push({ level: "error", code: "STATEMENT_UNSUPPORTED", message: `Statement type “${type ?? "unknown"}” is not supported by the educational visualization service.` });
  let normalizedSql: string | null = null;
  try { normalizedSql = parser.sqlify(statements[0] as AST, { database: input.dialect === "mysql" ? "MySQL" : "sqlite" }); } catch { /* normalization is optional */ }
  return { supported: !issues.some((issue) => issue.level === "error"), normalizedSql, ...analysis, issues, privacy: { recordsReceived: false, analyzedFields: ["SQL text", "optional table and column names"] } };
}

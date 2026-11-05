import type { QueryResult, SqlValue } from "@/lib/database/types";

export type VisualizationStepKind =
  | "source"
  | "filter"
  | "project"
  | "distinct"
  | "join"
  | "group"
  | "aggregate"
  | "order"
  | "limit"
  | "insert"
  | "update-before"
  | "update-after"
  | "delete-before"
  | "delete-after"
  | "result";

export interface VisualizationTable {
  columns: string[];
  values: SqlValue[][];
  rowIds?: number[];
  rowKeys?: string[];
  rowGroups?: string[];
  totalRows?: number;
  truncated?: boolean;
}

export interface VisualizationPanel {
  id: string;
  label: string;
  table: VisualizationTable;
  highlightedColumns?: string[];
  highlightedRowIds?: number[];
  unmatchedRowIds?: number[];
  unmatchedRowKeys?: string[];
}

export interface VisualizationCellChange {
  rowId: number;
  column: string;
  before: SqlValue;
  after: SqlValue;
}

export interface VisualizationGroupSummary {
  id: string;
  label: string;
  rowCount: number;
  calculations: string[];
}

export interface VisualizationStep {
  id: string;
  kind: VisualizationStepKind;
  title: string;
  clause: string;
  explanation: string;
  table: VisualizationTable;
  matchingRowIds?: number[];
  matchingRowKeys?: string[];
  highlightedRowIds?: number[];
  unmatchedRowIds?: number[];
  unmatchedRowKeys?: string[];
  highlightedColumns?: string[];
  panels?: VisualizationPanel[];
  cellChanges?: VisualizationCellChange[];
  groups?: VisualizationGroupSummary[];
  rowTone?: "insert" | "update" | "delete";
  animateReorder?: boolean;
  animateCombine?: boolean;
}

export interface VisualizationSourceTable {
  tableName: string;
  alias: string | null;
  table: VisualizationTable;
}

export interface VisualizationJoin {
  type: "INNER" | "LEFT";
  left: { table: string; column: string };
  right: { table: string; column: string };
}

export interface VisualizationAggregate {
  function: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX";
  table: string | null;
  column: string;
  output: string;
}

export interface VisualizationAnalysis {
  statementType: "select" | "insert" | "update" | "delete";
  tableName: string;
  tableAlias: string | null;
  sourceTables: Array<{ tableName: string; alias: string | null }>;
  selectedColumns: Array<{ source: string; output: string; table: string | null }>;
  hasWhere: boolean;
  distinct: boolean;
  orderBy: Array<{ column: string; direction: "ASC" | "DESC" }>;
  limit: number | null;
  offset: number;
  join: VisualizationJoin | null;
  groupBy: Array<{ table: string | null; column: string }>;
  aggregates: VisualizationAggregate[];
  mutationColumns: string[];
}

export interface VisualizationPlan {
  sql: string;
  analysis: VisualizationAnalysis;
  source: VisualizationTable;
  sources: VisualizationSourceTable[];
  finalResult: QueryResult;
  mutationResult?: QueryResult;
  steps: VisualizationStep[];
  validated: boolean;
}

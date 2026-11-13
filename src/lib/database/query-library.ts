import { getSqlQueryType, type SqlQueryType } from "@/lib/database/sql-safety";
import type { QueryHistoryEntry } from "@/lib/database/types";

export type HistoryStatusFilter = "all" | "success" | "error";
export type HistoryOperationFilter = "all" | Exclude<SqlQueryType, "OTHER">;
export type HistoryTimeFilter = "today" | "7d" | "all";
export type HistorySort = "newest" | "oldest";

export interface QueryHistoryFilters {
  search: string;
  status: HistoryStatusFilter;
  operation: HistoryOperationFilter;
  database: "all" | "current" | string;
  time: HistoryTimeFilter;
  sort: HistorySort;
}

export function historyQueryType(entry: QueryHistoryEntry) {
  return entry.queryType ?? getSqlQueryType(entry.sql);
}

export function compactSqlPreview(sql: string, length = 112) {
  const compact = sql.replace(/\s+/g, " ").trim();
  return compact.length > length ? `${compact.slice(0, length - 1).trimEnd()}…` : compact;
}

export function filterQueryHistory(
  entries: QueryHistoryEntry[],
  filters: QueryHistoryFilters,
  activeDatabaseId: string | null,
  now = new Date(),
) {
  const search = filters.search.trim().toLowerCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const filtered = entries.filter((entry) => {
    const type = historyQueryType(entry);
    const timestamp = new Date(entry.timestamp).getTime();
    const matchesSearch = !search || `${entry.sql} ${entry.databaseName} ${entry.error ?? ""} ${type}`.toLowerCase().includes(search);
    const matchesStatus = filters.status === "all" || entry.status === filters.status;
    const matchesOperation = filters.operation === "all" || type === filters.operation;
    const matchesDatabase = filters.database === "all"
      || (filters.database === "current" ? entry.databaseId === activeDatabaseId : entry.databaseId === filters.database);
    const matchesTime = filters.time === "all"
      || (filters.time === "today" ? timestamp >= today : timestamp >= sevenDaysAgo);
    return matchesSearch && matchesStatus && matchesOperation && matchesDatabase && matchesTime;
  });
  return [...filtered].sort((left, right) => filters.sort === "newest"
    ? right.timestamp.localeCompare(left.timestamp)
    : left.timestamp.localeCompare(right.timestamp));
}

export function groupQueryHistory(entries: QueryHistoryEntry[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const groups = new Map<string, QueryHistoryEntry[]>();
  for (const entry of entries) {
    const timestamp = new Date(entry.timestamp).getTime();
    const label = timestamp >= today ? "Today" : timestamp >= sevenDaysAgo ? "Previous 7 days" : "Older";
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }
  return [...groups].map(([label, items]) => ({ label, items }));
}

export function historyResultSummary(entry: QueryHistoryEntry) {
  if (entry.status === "error") return "Execution failed";
  if (typeof entry.rowCount === "number" && entry.operation === "read") {
    return `${entry.rowCount} row${entry.rowCount === 1 ? "" : "s"} returned`;
  }
  if (typeof entry.rowsAffected === "number" && entry.operation === "write") {
    return `${entry.rowsAffected} row${entry.rowsAffected === 1 ? "" : "s"} affected`;
  }
  return "Execution succeeded";
}

import { describe, expect, it } from "vitest";

import {
  compactSqlPreview,
  filterQueryHistory,
  groupQueryHistory,
  historyQueryType,
  historyResultSummary,
  type QueryHistoryFilters,
} from "@/lib/database/query-library";
import type { QueryHistoryEntry } from "@/lib/database/types";

const entries: QueryHistoryEntry[] = [
  { id: "select", workspaceId: "workspace", databaseId: "college", databaseName: "College", sql: "SELECT *\nFROM Students WHERE year_level > 2", timestamp: "2026-11-14T09:00:00.000Z", status: "success", durationMs: 0.4, operation: "read", rowCount: 4 },
  { id: "update", workspaceId: "workspace", databaseId: "company", databaseName: "Company", sql: "UPDATE Employees SET active = 0", timestamp: "2026-11-10T09:00:00.000Z", status: "success", durationMs: 1.2, operation: "write", rowsAffected: 3 },
  { id: "failed", workspaceId: "workspace", databaseId: "college", databaseName: "College", sql: "SELECT missing FROM Students", timestamp: "2026-10-20T09:00:00.000Z", status: "error", durationMs: 9.9, operation: "read", error: "no such column: missing" },
];

const filters: QueryHistoryFilters = { search: "", status: "all", operation: "all", database: "all", time: "all", sort: "newest" };

describe("query library UI helpers", () => {
  it("derives display operations without changing stored SQL", () => {
    expect(historyQueryType(entries[0])).toBe("SELECT");
    expect(historyQueryType(entries[1])).toBe("UPDATE");
    expect(compactSqlPreview(entries[0].sql)).toBe("SELECT * FROM Students WHERE year_level > 2");
    expect(entries[0].sql).toContain("\n");
    expect(historyResultSummary(entries[0])).toBe("4 rows returned");
  });

  it("filters by status, operation, database, time, search, and sort", () => {
    const now = new Date("2026-11-14T12:00:00.000Z");
    expect(filterQueryHistory(entries, { ...filters, status: "error" }, "college", now).map((entry) => entry.id)).toEqual(["failed"]);
    expect(filterQueryHistory(entries, { ...filters, operation: "UPDATE" }, "college", now).map((entry) => entry.id)).toEqual(["update"]);
    expect(filterQueryHistory(entries, { ...filters, database: "current" }, "college", now).map((entry) => entry.id)).toEqual(["select", "failed"]);
    expect(filterQueryHistory(entries, { ...filters, time: "7d" }, "college", now).map((entry) => entry.id)).toEqual(["select", "update"]);
    expect(filterQueryHistory(entries, { ...filters, search: "missing", sort: "oldest" }, "college", now).map((entry) => entry.id)).toEqual(["failed"]);
  });

  it("groups compact entries into useful time sections", () => {
    expect(groupQueryHistory(entries, new Date("2026-11-14T12:00:00.000Z")).map((group) => group.label)).toEqual(["Today", "Previous 7 days", "Older"]);
  });
});

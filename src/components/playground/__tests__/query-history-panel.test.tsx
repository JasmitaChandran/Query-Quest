import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { HistoryRow } from "@/components/playground/query-history-panel";

describe("QueryHistoryPanel", () => {
  it("renders history as a compact, collapsed execution row by default", () => {
    const sql = "SELECT first_name, last_name, year_level FROM Students WHERE year_level > 2 ORDER BY year_level DESC, last_name ASC LIMIT 50 /* full-query-tail */";
    const html = renderToStaticMarkup(
      <HistoryRow
        entry={{
          id: "history-1",
          workspaceId: "workspace-default",
          databaseId: "college",
          databaseName: "College",
          sql,
          timestamp: "2026-11-14T08:30:00.000Z",
          status: "success",
          durationMs: 0.4,
          operation: "read",
          queryType: "SELECT",
          rowCount: 27,
        }}
        expanded={false}
        onToggle={vi.fn()}
        onCopy={vi.fn()}
        onLoad={vi.fn()}
        onRun={vi.fn()}
      />,
    );

    expect(html).toContain("College");
    expect(html).toContain("27 rows returned");
    expect(html).toContain("0.4 ms");
    expect(html).toContain("SELECT");
    expect(html).not.toContain("full-query-tail");
  });
});

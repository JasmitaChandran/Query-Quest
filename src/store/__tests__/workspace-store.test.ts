import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SQL_QUERY } from "@/lib/database/default-query";
import { useWorkspaceStore } from "@/store/workspace-store";

beforeEach(() => {
  useWorkspaceStore.setState({ activePanel: "editor", editorSql: DEFAULT_SQL_QUERY, queuedSql: null, runRequest: 0 });
});

describe("workspace SQL state", () => {
  it("keeps the current query while workspace panels change", () => {
    useWorkspaceStore.getState().setEditorSql("SELECT name FROM Students;");
    useWorkspaceStore.getState().setActivePanel("schema");
    expect(useWorkspaceStore.getState()).toEqual(expect.objectContaining({
      activePanel: "schema",
      editorSql: "SELECT name FROM Students;",
    }));
  });

  it("synchronizes queued history SQL with the shared editor model", () => {
    useWorkspaceStore.getState().setActivePanel("history");
    useWorkspaceStore.getState().queueSqlRun("SELECT * FROM Courses;");
    expect(useWorkspaceStore.getState()).toEqual(expect.objectContaining({
      activePanel: "editor",
      editorSql: "SELECT * FROM Courses;",
      queuedSql: "SELECT * FROM Courses;",
      runRequest: 1,
    }));
  });
});

import { create } from "zustand";

import { DEFAULT_SQL_QUERY } from "@/lib/database/default-query";

type WorkspacePanel = "editor" | "visualizer" | "data" | "schema" | "history";

type WorkspaceState = {
  explorerCollapsed: boolean;
  activePanel: WorkspacePanel;
  editorSql: string;
  queuedSql: string | null;
  runRequest: number;
  toggleExplorer: () => void;
  setActivePanel: (panel: WorkspacePanel) => void;
  setEditorSql: (sql: string) => void;
  queueSqlRun: (sql: string) => void;
  consumeSqlRun: () => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  explorerCollapsed: false,
  activePanel: "editor",
  editorSql: DEFAULT_SQL_QUERY,
  queuedSql: null,
  runRequest: 0,
  toggleExplorer: () =>
    set((state) => ({ explorerCollapsed: !state.explorerCollapsed })),
  setActivePanel: (activePanel) => set({ activePanel }),
  setEditorSql: (editorSql) => set({ editorSql }),
  queueSqlRun: (queuedSql) => set((state) => ({ queuedSql, editorSql: queuedSql, runRequest: state.runRequest + 1, activePanel: "editor" })),
  consumeSqlRun: () => set({ queuedSql: null }),
}));

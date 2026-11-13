import { create } from "zustand";

import { DEFAULT_SQL_QUERY } from "@/lib/database/default-query";

type WorkspacePanel = "editor" | "visualizer" | "data" | "schema" | "history";

type WorkspaceState = {
  explorerCollapsed: boolean;
  explorerWidth: number;
  activePanel: WorkspacePanel;
  editorSql: string;
  queuedSql: string | null;
  runRequest: number;
  pendingDataEdits: number;
  toggleExplorer: () => void;
  setExplorerWidth: (width: number) => void;
  setActivePanel: (panel: WorkspacePanel) => void;
  setEditorSql: (sql: string) => void;
  queueSqlRun: (sql: string) => void;
  consumeSqlRun: () => void;
  setPendingDataEdits: (count: number) => void;
  confirmDiscardPendingDataEdits: () => boolean;
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  explorerCollapsed: false,
  explorerWidth: 270,
  activePanel: "editor",
  editorSql: DEFAULT_SQL_QUERY,
  queuedSql: null,
  runRequest: 0,
  pendingDataEdits: 0,
  toggleExplorer: () =>
    set((state) => ({ explorerCollapsed: !state.explorerCollapsed })),
  setExplorerWidth: (explorerWidth) =>
    set({ explorerWidth: Math.min(360, Math.max(230, Math.round(explorerWidth))) }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setEditorSql: (editorSql) => set({ editorSql }),
  queueSqlRun: (queuedSql) => set((state) => ({ queuedSql, editorSql: queuedSql, runRequest: state.runRequest + 1, activePanel: "editor" })),
  consumeSqlRun: () => set({ queuedSql: null }),
  setPendingDataEdits: (count) => set({ pendingDataEdits: Math.max(0, Math.round(count)) }),
  confirmDiscardPendingDataEdits: () => {
    const count = get().pendingDataEdits;
    if (count === 0) return true;
    if (typeof window === "undefined") return false;
    const confirmed = window.confirm(`Discard ${count} unsaved visual data change${count === 1 ? "" : "s"}? The SQLite database has not been modified yet.`);
    if (confirmed) set({ pendingDataEdits: 0 });
    return confirmed;
  },
}));

import { create } from "zustand";

type WorkspacePanel = "editor" | "data" | "history";

type WorkspaceState = {
  explorerCollapsed: boolean;
  activePanel: WorkspacePanel;
  toggleExplorer: () => void;
  setActivePanel: (panel: WorkspacePanel) => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  explorerCollapsed: false,
  activePanel: "editor",
  toggleExplorer: () =>
    set((state) => ({ explorerCollapsed: !state.explorerCollapsed })),
  setActivePanel: (activePanel) => set({ activePanel }),
}));

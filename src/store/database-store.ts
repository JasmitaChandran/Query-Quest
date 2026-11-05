import { create } from "zustand";

import { getDatabaseManager } from "@/lib/database/database-manager";
import { analyzeVisualizationQuery, createMutationVisualizationPlan, createVisualizationPlan } from "@/lib/visualization/query-visualizer";
import type { VisualizationPlan } from "@/lib/visualization/types";
import type {
  DatabaseMetadata,
  DatabaseImportPreview,
  DatasetColumn,
  QueryResult,
  TableRecords,
  TableSchema,
  TableSummary,
  SqlValue,
  EditableTableRecords,
  TableDataEdit,
  TableDefinition,
  QueryHistoryEntry,
  TableMigrationInspection,
  TableSchemaMigrationInput,
  PortableWorkspaceFile,
  SavedQuery,
  WorkspaceMetadata,
  WorkspaceSettings,
  WorkspaceStorageUsage,
} from "@/lib/database/types";
import { useWorkspaceStore } from "@/store/workspace-store";
import type { ConvertedMySqlDump } from "@/lib/import/mysql-dump";

type DatabaseStatus = "idle" | "initializing" | "ready" | "error";

type DatabaseState = {
  status: DatabaseStatus;
  workspaces: WorkspaceMetadata[];
  activeWorkspaceId: string | null;
  savedQueries: SavedQuery[];
  workspaceUsage: WorkspaceStorageUsage | null;
  databases: DatabaseMetadata[];
  activeDatabaseId: string | null;
  tables: TableSummary[];
  tableSchemas: Record<string, TableSchema>;
  selectedTable: string | null;
  selectedSchema: TableSchema | null;
  sourceRecords: TableRecords | null;
  editableRecords: EditableTableRecords | null;
  queryResult: QueryResult | null;
  queryError: string | null;
  lastSelectSql: string | null;
  queryHistory: QueryHistoryEntry[];
  canUndo: boolean;
  canRedo: boolean;
  visualizationPlan: VisualizationPlan | null;
  visualizationError: string | null;
  isVisualizationLoading: boolean;
  isTableLoading: boolean;
  isQueryRunning: boolean;
  isImporting: boolean;
  isMutating: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  createWorkspace: (name: string) => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  renameWorkspace: (workspaceId: string, name: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  saveWorkspaceSettings: (settings: WorkspaceSettings) => Promise<void>;
  exportWorkspace: () => Promise<PortableWorkspaceFile>;
  importWorkspace: (workspace: PortableWorkspaceFile, overwrite?: boolean) => Promise<void>;
  saveQuery: (name: string, sql: string, queryId?: string) => Promise<void>;
  deleteSavedQuery: (queryId: string) => Promise<void>;
  exportDatabase: (databaseId: string) => Promise<{ metadata: DatabaseMetadata; bytes: Uint8Array }>;
  refreshWorkspaceMetadata: () => Promise<void>;
  switchDatabase: (databaseId: string) => Promise<void>;
  selectTable: (tableName: string) => Promise<void>;
  runQuery: (sql: string) => Promise<void>;
  createDatabase: (name: string) => Promise<void>;
  renameDatabase: (databaseId: string, name: string) => Promise<void>;
  deleteDatabase: (databaseId: string) => Promise<void>;
  createTable: (definition: TableDefinition) => Promise<void>;
  inspectTableMigration: (tableName: string) => Promise<TableMigrationInspection>;
  migrateTableSchema: (input: TableSchemaMigrationInput) => Promise<void>;
  saveTableEdits: (tableName: string, edits: TableDataEdit[]) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  resetDatabase: () => Promise<void>;
  saveResultAsTable: (tableName: string) => Promise<void>;
  visualizeQuery: (sql: string) => Promise<void>;
  previewSqlite: (bytes: Uint8Array) => Promise<DatabaseImportPreview>;
  importSqlite: (name: string, bytes: Uint8Array) => Promise<void>;
  importMySql: (name: string, dump: ConvertedMySqlDump) => Promise<void>;
  importDataset: (input: { databaseName: string; tableName: string; columns: DatasetColumn[]; rows: SqlValue[][] }) => Promise<void>;
  clearError: () => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected database error occurred.";
}

export const useDatabaseStore = create<DatabaseState>((set, get) => {
  const loadTable = async (tableName: string) => {
    set({ isTableLoading: true, selectedTable: tableName, error: null });
    try {
      const manager = getDatabaseManager();
      const [selectedSchema, sourceRecords, editableRecords] = await Promise.all([
        get().tableSchemas[tableName] ?? manager.readTableSchema(tableName),
        manager.readTableRecords(tableName, { limit: 100 }),
        manager.readEditableTableRecords(tableName).catch(() => null),
      ]);
      set({ selectedSchema, sourceRecords, editableRecords, isTableLoading: false });
    } catch (error) {
      set({ isTableLoading: false, error: errorMessage(error) });
      throw error;
    }
  };

  const hydrateActiveDatabase = async (preferredTable?: string) => {
    if (!get().activeDatabaseId) {
      set({ tables: [], tableSchemas: {}, selectedTable: null, selectedSchema: null, sourceRecords: null, editableRecords: null, queryResult: null, queryError: null, lastSelectSql: null, visualizationPlan: null, visualizationError: null, canUndo: false, canRedo: false, isTableLoading: false });
      return;
    }
    const manager = getDatabaseManager();
    const tables = await manager.listTables();
    const schemas = await Promise.all(
      tables.map((table) => manager.readTableSchema(table.name)),
    );
    const tableSchemas = Object.fromEntries(schemas.map((schema) => [schema.name, schema]));
    set({
      tables,
      tableSchemas,
      selectedTable: null,
      selectedSchema: null,
      sourceRecords: null,
      editableRecords: null,
      queryResult: null,
      queryError: null,
      visualizationPlan: null,
      visualizationError: null,
      isTableLoading: false,
    });
    const nextTable = tables.find((table) => table.name === preferredTable) ?? tables[0];
    if (nextTable) await loadTable(nextTable.name);
  };

  const syncCheckpointStatus = async () => {
    if (!get().activeDatabaseId) {
      set({ canUndo: false, canRedo: false });
      return;
    }
    const status = await getDatabaseManager().getCheckpointStatus();
    set(status);
  };

  const hydrateWorkspaceMetadata = async () => {
    const manager = getDatabaseManager();
    const [savedQueries, workspaceUsage, queryHistory] = await Promise.all([
      manager.listSavedQueries(),
      manager.getWorkspaceStorageUsage(),
      manager.listQueryHistory(),
    ]);
    set({ savedQueries, workspaceUsage, queryHistory });
  };

  return {
    status: "idle",
    workspaces: [],
    activeWorkspaceId: null,
    savedQueries: [],
    workspaceUsage: null,
    databases: [],
    activeDatabaseId: null,
    tables: [],
    tableSchemas: {},
    selectedTable: null,
    selectedSchema: null,
    sourceRecords: null,
    editableRecords: null,
    queryResult: null,
    queryError: null,
    lastSelectSql: null,
    queryHistory: [],
    canUndo: false,
    canRedo: false,
    visualizationPlan: null,
    visualizationError: null,
    isVisualizationLoading: false,
    isTableLoading: false,
    isQueryRunning: false,
    isImporting: false,
    isMutating: false,
    error: null,

    initialize: async () => {
      if (get().status === "ready" || get().status === "initializing") return;
      set({ status: "initializing", error: null });
      try {
        const manager = getDatabaseManager();
        const snapshot = await manager.initialize();
        set({
          workspaces: snapshot.workspaces,
          activeWorkspaceId: snapshot.activeWorkspaceId,
          databases: snapshot.databases,
          activeDatabaseId: snapshot.activeDatabaseId,
        });
        useWorkspaceStore.setState({ ...snapshot.workspaceSettings, queuedSql: null });
        await hydrateActiveDatabase();
        await Promise.all([syncCheckpointStatus(), hydrateWorkspaceMetadata()]);
        set({ status: "ready" });
      } catch (error) {
        set({ status: "error", error: errorMessage(error) });
      }
    },

    createWorkspace: async (name) => {
      set({ isMutating: true, error: null });
      try {
        const snapshot = await getDatabaseManager().createWorkspace(name);
        set({ workspaces: snapshot.workspaces, activeWorkspaceId: snapshot.activeWorkspaceId, databases: snapshot.databases, activeDatabaseId: snapshot.activeDatabaseId, isMutating: false });
        useWorkspaceStore.setState({ ...snapshot.workspaceSettings, queuedSql: null });
        await Promise.all([hydrateActiveDatabase(), hydrateWorkspaceMetadata(), syncCheckpointStatus()]);
      } catch (error) { set({ isMutating: false, error: errorMessage(error) }); throw error; }
    },

    switchWorkspace: async (workspaceId) => {
      if (workspaceId === get().activeWorkspaceId) return;
      set({ isTableLoading: true, error: null });
      try {
        const snapshot = await getDatabaseManager().switchWorkspace(workspaceId);
        set({ workspaces: snapshot.workspaces, activeWorkspaceId: snapshot.activeWorkspaceId, databases: snapshot.databases, activeDatabaseId: snapshot.activeDatabaseId });
        useWorkspaceStore.setState({ ...snapshot.workspaceSettings, queuedSql: null });
        await Promise.all([hydrateActiveDatabase(), hydrateWorkspaceMetadata(), syncCheckpointStatus()]);
      } catch (error) { set({ isTableLoading: false, error: errorMessage(error) }); throw error; }
    },

    renameWorkspace: async (workspaceId, name) => {
      set({ isMutating: true, error: null });
      try {
        const snapshot = await getDatabaseManager().renameWorkspace(workspaceId, name);
        set({ workspaces: snapshot.workspaces, isMutating: false });
      } catch (error) { set({ isMutating: false, error: errorMessage(error) }); throw error; }
    },

    deleteWorkspace: async (workspaceId) => {
      set({ isMutating: true, error: null });
      try {
        const snapshot = await getDatabaseManager().deleteWorkspace(workspaceId);
        set({ workspaces: snapshot.workspaces, activeWorkspaceId: snapshot.activeWorkspaceId, databases: snapshot.databases, activeDatabaseId: snapshot.activeDatabaseId, isMutating: false });
        useWorkspaceStore.setState({ ...snapshot.workspaceSettings, queuedSql: null });
        await Promise.all([hydrateActiveDatabase(), hydrateWorkspaceMetadata(), syncCheckpointStatus()]);
      } catch (error) { set({ isMutating: false, error: errorMessage(error) }); throw error; }
    },

    saveWorkspaceSettings: async (settings) => {
      const snapshot = await getDatabaseManager().saveWorkspaceSettings(settings);
      set({ workspaces: snapshot.workspaces });
    },

    exportWorkspace: () => getDatabaseManager().exportWorkspace(),

    importWorkspace: async (workspace, overwrite = false) => {
      set({ isImporting: true, error: null });
      try {
        const snapshot = await getDatabaseManager().importWorkspace(workspace, overwrite);
        set({ workspaces: snapshot.workspaces, activeWorkspaceId: snapshot.activeWorkspaceId, databases: snapshot.databases, activeDatabaseId: snapshot.activeDatabaseId, isImporting: false });
        useWorkspaceStore.setState({ ...snapshot.workspaceSettings, queuedSql: null });
        await Promise.all([hydrateActiveDatabase(), hydrateWorkspaceMetadata(), syncCheckpointStatus()]);
      } catch (error) { set({ isImporting: false, error: errorMessage(error) }); throw error; }
    },

    saveQuery: async (name, sql, queryId) => {
      await getDatabaseManager().saveQuery(name, sql, queryId);
      const savedQueries = await getDatabaseManager().listSavedQueries();
      set({ savedQueries });
    },

    deleteSavedQuery: async (queryId) => {
      await getDatabaseManager().deleteSavedQuery(queryId);
      set({ savedQueries: get().savedQueries.filter((query) => query.id !== queryId) });
    },

    exportDatabase: (databaseId) => getDatabaseManager().exportDatabaseFile(databaseId),

    refreshWorkspaceMetadata: hydrateWorkspaceMetadata,

    switchDatabase: async (databaseId) => {
      if (databaseId === get().activeDatabaseId) return;
      set({ isTableLoading: true, error: null });
      try {
        const snapshot = await getDatabaseManager().switchDatabase(databaseId);
        set({
          databases: snapshot.databases,
          activeDatabaseId: snapshot.activeDatabaseId,
        });
        await hydrateActiveDatabase();
        await syncCheckpointStatus();
      } catch (error) {
        set({ isTableLoading: false, error: errorMessage(error) });
      }
    },

    selectTable: loadTable,

    runQuery: async (sql) => {
      set({ isQueryRunning: true, error: null, queryError: null, visualizationPlan: null, visualizationError: null });
      try {
        const fromMatch = sql.match(/\bFROM\s+["`\[]?([A-Za-z_][\w]*)/i);
        const sourceTable = fromMatch
          ? get().tables.find(
              (table) => table.name.toLowerCase() === fromMatch[1].toLowerCase(),
            )
          : null;
        if (sourceTable && sourceTable.name !== get().selectedTable) {
          await loadTable(sourceTable.name);
        }
        const execution = await getDatabaseManager().executeUserQuery(sql);
        if (execution.modified) await hydrateActiveDatabase(get().selectedTable ?? undefined);
        set({ queryResult: execution.result, lastSelectSql: execution.modified ? null : sql, queryError: null, isQueryRunning: false, queryHistory: [execution.history, ...get().queryHistory].slice(0, 200) });
        await syncCheckpointStatus();
      } catch (error) {
        const message = errorMessage(error);
        const queryHistory = await getDatabaseManager().listQueryHistory().catch(() => get().queryHistory);
        set({ isQueryRunning: false, error: message, queryError: message, queryHistory });
        throw error;
      }
    },

    createDatabase: async (name) => {
      set({ isImporting: true, error: null });
      try {
        const snapshot = await getDatabaseManager().createDatabase(name);
        set({
          databases: snapshot.databases,
          activeDatabaseId: snapshot.activeDatabaseId,
          isImporting: false,
        });
        await hydrateActiveDatabase();
        await syncCheckpointStatus();
      } catch (error) {
        set({ isImporting: false, error: errorMessage(error) });
        throw error;
      }
    },

    renameDatabase: async (databaseId, name) => {
      set({ isMutating: true, error: null });
      try {
        const snapshot = await getDatabaseManager().renameDatabase(databaseId, name);
        set({
          databases: snapshot.databases,
          activeDatabaseId: snapshot.activeDatabaseId,
          queryHistory: get().queryHistory.map((entry) => entry.databaseId === databaseId ? { ...entry, databaseName: name.trim() } : entry),
          isMutating: false,
        });
      } catch (error) {
        set({ isMutating: false, error: errorMessage(error) });
        throw error;
      }
    },

    deleteDatabase: async (databaseId) => {
      const deletingActiveDatabase = databaseId === get().activeDatabaseId;
      set({ isMutating: true, error: null });
      try {
        const snapshot = await getDatabaseManager().deleteDatabase(databaseId);
        set({
          databases: snapshot.databases,
          activeDatabaseId: snapshot.activeDatabaseId,
          queryHistory: get().queryHistory.filter((entry) => entry.databaseId !== databaseId),
        });
        if (deletingActiveDatabase && snapshot.activeDatabaseId) {
          await hydrateActiveDatabase();
          await syncCheckpointStatus();
        } else if (!snapshot.activeDatabaseId) {
          set({
            tables: [],
            tableSchemas: {},
            selectedTable: null,
            selectedSchema: null,
            sourceRecords: null,
            editableRecords: null,
            queryResult: null,
            queryError: null,
            lastSelectSql: null,
            visualizationPlan: null,
            visualizationError: null,
            canUndo: false,
            canRedo: false,
            isTableLoading: false,
          });
        }
        set({ isMutating: false });
      } catch (error) {
        set({ isMutating: false, error: errorMessage(error) });
        throw error;
      }
    },

    createTable: async (definition) => {
      set({ isMutating: true, error: null });
      try {
        await getDatabaseManager().createTable(definition);
        await hydrateActiveDatabase(definition.name);
        await syncCheckpointStatus();
        set({ isMutating: false });
      } catch (error) {
        set({ isMutating: false, error: errorMessage(error) });
        throw error;
      }
    },

    inspectTableMigration: (tableName) => getDatabaseManager().inspectTableMigration(tableName),

    migrateTableSchema: async (input) => {
      set({ isMutating: true, error: null });
      try {
        await getDatabaseManager().migrateTableSchema(input);
        await hydrateActiveDatabase(input.definition.name);
        await syncCheckpointStatus();
        set({ isMutating: false, lastSelectSql: null });
      } catch (error) {
        set({ isMutating: false, error: errorMessage(error) });
        throw error;
      }
    },

    saveTableEdits: async (tableName, edits) => {
      set({ isMutating: true, error: null });
      try {
        await getDatabaseManager().applyTableEdits(tableName, edits);
        await hydrateActiveDatabase(tableName);
        await syncCheckpointStatus();
        set({ isMutating: false });
      } catch (error) {
        set({ isMutating: false, error: errorMessage(error) });
        throw error;
      }
    },

    undo: async () => {
      set({ isMutating: true, error: null });
      try { const checkpoint = await getDatabaseManager().undo(); await hydrateActiveDatabase(); set({ ...checkpoint, isMutating: false, lastSelectSql: null }); }
      catch (error) { set({ isMutating: false, error: errorMessage(error) }); throw error; }
    },

    redo: async () => {
      set({ isMutating: true, error: null });
      try { const checkpoint = await getDatabaseManager().redo(); await hydrateActiveDatabase(); set({ ...checkpoint, isMutating: false, lastSelectSql: null }); }
      catch (error) { set({ isMutating: false, error: errorMessage(error) }); throw error; }
    },

    resetDatabase: async () => {
      set({ isMutating: true, error: null });
      try { const checkpoint = await getDatabaseManager().resetDatabase(); await hydrateActiveDatabase(); set({ ...checkpoint, isMutating: false, lastSelectSql: null }); }
      catch (error) { set({ isMutating: false, error: errorMessage(error) }); throw error; }
    },

    saveResultAsTable: async (tableName) => {
      const selectSql = get().lastSelectSql;
      if (!selectSql) throw new Error("Run a SELECT query before saving a result table.");
      set({ isMutating: true, error: null });
      try {
        const { history } = await getDatabaseManager().saveResultAsTable(tableName, selectSql);
        await hydrateActiveDatabase(tableName);
        await syncCheckpointStatus();
        set({ isMutating: false, queryHistory: [history, ...get().queryHistory].slice(0, 200) });
      } catch (error) { set({ isMutating: false, error: errorMessage(error) }); throw error; }
    },

    visualizeQuery: async (sql) => {
      set({ isVisualizationLoading: true, visualizationError: null, error: null });
      try {
        const manager = getDatabaseManager();
        const { analysis } = analyzeVisualizationQuery(sql);
        if (analysis.statementType !== "select") set({ isMutating: true });
        const sourceTables = analysis.sourceTables.map((source) => get().tables.find((table) => table.name.toLowerCase() === source.tableName.toLowerCase()));
        const missing = analysis.sourceTables.find((_, index) => !sourceTables[index]);
        if (missing) throw new Error(`Table “${missing.tableName}” is not available in the active database.`);
        if (sourceTables.some((table) => table?.type !== "table")) throw new Error("The visualizer requires rowid tables; views still execute normally.");

        let history: QueryHistoryEntry | null = null;
        const plan = analysis.statementType === "select"
          ? await createVisualizationPlan(sql, (statement) => manager.executeReadOnlyQuery(statement))
          : await createMutationVisualizationPlan(
              sql,
              (input) => manager.previewMutation(input),
              async () => {
                const execution = await manager.executeUserQuery(sql);
                history = execution.history;
                return execution.result;
              },
              (statement) => manager.executeReadOnlyQuery(statement),
            );

        if (analysis.statementType !== "select") {
          await hydrateActiveDatabase(analysis.tableName);
          await syncCheckpointStatus();
        } else if (get().selectedTable?.toLowerCase() !== analysis.tableName.toLowerCase()) {
          await loadTable(analysis.tableName);
        }
        if (!plan.validated) {
          const message = analysis.statementType === "select"
            ? "The visualized result did not match SQLite, so no animation was generated."
            : "The write was checkpointed, but its preview did not match the final database state. The animation was withheld; use Undo to restore the prior state.";
          throw new Error(message);
        }
        set({
          visualizationPlan: plan,
          queryResult: plan.finalResult,
          lastSelectSql: analysis.statementType === "select" ? sql : null,
          isVisualizationLoading: false,
          isMutating: false,
          queryHistory: history ? [history, ...get().queryHistory].slice(0, 200) : get().queryHistory,
        });
      } catch (error) {
        const message = errorMessage(error);
        set({ visualizationPlan: null, visualizationError: message, isVisualizationLoading: false, isMutating: false });
        throw error;
      }
    },

    previewSqlite: (bytes) => getDatabaseManager().inspectSqliteDatabase(bytes),

    importSqlite: async (name, bytes) => {
      set({ isImporting: true, error: null });
      try {
        const snapshot = await getDatabaseManager().loadDatabase({
          name,
          bytes,
        });
        set({
          databases: snapshot.databases,
          activeDatabaseId: snapshot.activeDatabaseId,
          isImporting: false,
        });
        await hydrateActiveDatabase();
        await syncCheckpointStatus();
      } catch (error) {
        set({ isImporting: false, error: errorMessage(error) });
        throw error;
      }
    },

    importMySql: async (name, dump) => {
      set({ isImporting: true, error: null });
      try {
        const snapshot = await getDatabaseManager().importMySqlDump(name, dump);
        set({ databases: snapshot.databases, activeDatabaseId: snapshot.activeDatabaseId, isImporting: false });
        await hydrateActiveDatabase();
        await syncCheckpointStatus();
      } catch (error) {
        set({ isImporting: false, error: errorMessage(error) });
        throw error;
      }
    },

    importDataset: async (input) => {
      set({ isImporting: true, error: null });
      try {
        const snapshot = await getDatabaseManager().createDatabaseFromDataset(input);
        set({ databases: snapshot.databases, activeDatabaseId: snapshot.activeDatabaseId, isImporting: false });
        await hydrateActiveDatabase();
        await syncCheckpointStatus();
      } catch (error) {
        set({ isImporting: false, error: errorMessage(error) });
        throw error;
      }
    },

    clearError: () => set({ error: null, queryError: null }),
  };
});

import { create } from "zustand";

import { getDatabaseManager } from "@/lib/database/database-manager";
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
} from "@/lib/database/types";

type DatabaseStatus = "idle" | "initializing" | "ready" | "error";

type DatabaseState = {
  status: DatabaseStatus;
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
  isTableLoading: boolean;
  isQueryRunning: boolean;
  isImporting: boolean;
  isMutating: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  switchDatabase: (databaseId: string) => Promise<void>;
  selectTable: (tableName: string) => Promise<void>;
  runQuery: (sql: string) => Promise<void>;
  createDatabase: (name: string) => Promise<void>;
  createTable: (definition: TableDefinition) => Promise<void>;
  saveTableEdits: (tableName: string, edits: TableDataEdit[]) => Promise<void>;
  previewSqlite: (bytes: Uint8Array) => Promise<DatabaseImportPreview>;
  importSqlite: (name: string, bytes: Uint8Array) => Promise<void>;
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
      isTableLoading: false,
    });
    const nextTable = tables.find((table) => table.name === preferredTable) ?? tables[0];
    if (nextTable) await loadTable(nextTable.name);
  };

  return {
    status: "idle",
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
    isTableLoading: false,
    isQueryRunning: false,
    isImporting: false,
    isMutating: false,
    error: null,

    initialize: async () => {
      if (get().status === "ready" || get().status === "initializing") return;
      set({ status: "initializing", error: null });
      try {
        const snapshot = await getDatabaseManager().initialize();
        set({
          databases: snapshot.databases,
          activeDatabaseId: snapshot.activeDatabaseId,
        });
        await hydrateActiveDatabase();
        set({ status: "ready" });
      } catch (error) {
        set({ status: "error", error: errorMessage(error) });
      }
    },

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
      } catch (error) {
        set({ isTableLoading: false, error: errorMessage(error) });
      }
    },

    selectTable: loadTable,

    runQuery: async (sql) => {
      set({ isQueryRunning: true, error: null, queryError: null });
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
        const queryResult = await getDatabaseManager().executeReadOnlyQuery(sql);
        set({ queryResult, queryError: null, isQueryRunning: false });
      } catch (error) {
        const message = errorMessage(error);
        set({ isQueryRunning: false, error: message, queryError: message });
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
      } catch (error) {
        set({ isImporting: false, error: errorMessage(error) });
        throw error;
      }
    },

    createTable: async (definition) => {
      set({ isMutating: true, error: null });
      try {
        await getDatabaseManager().createTable(definition);
        await hydrateActiveDatabase(definition.name);
        set({ isMutating: false });
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
        set({ isMutating: false });
      } catch (error) {
        set({ isMutating: false, error: errorMessage(error) });
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
      } catch (error) {
        set({ isImporting: false, error: errorMessage(error) });
        throw error;
      }
    },

    clearError: () => set({ error: null, queryError: null }),
  };
});

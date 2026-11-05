import type {
  DatabaseCheckpointState,
  DatabaseMetadata,
  DatabaseSnapshot,
  DiagramPositions,
  PersistedDatabase,
  QueryHistoryEntry,
  SavedQuery,
  WorkspaceMetadata,
  WorkspacePersistenceBundle,
  WorkspaceSettings,
  WorkspaceStorageUsage,
} from "@/lib/database/types";
import { DEFAULT_SQL_QUERY } from "@/lib/database/default-query";
import { DEFAULT_WORKSPACE_ID } from "@/lib/database/workspace-format";

const DEFAULT_DATABASE_NAME = "queryquest-storage";
const DATABASE_STORE = "databases";
const SETTINGS_STORE = "settings";
const CHECKPOINTS_STORE = "checkpoints";
const QUERY_HISTORY_STORE = "queryHistory";
const DIAGRAM_LAYOUTS_STORE = "diagramLayouts";
const WORKSPACES_STORE = "workspaces";
const SAVED_QUERIES_STORE = "savedQueries";
const ACTIVE_DATABASE_KEY = "activeDatabaseId";
const ACTIVE_WORKSPACE_KEY = "activeWorkspaceId";
const INITIALIZED_KEY = "initialized";

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  editorSql: DEFAULT_SQL_QUERY,
  activePanel: "editor",
  explorerCollapsed: false,
};

type StoredDatabase = { id: string; metadata: DatabaseMetadata; bytes: ArrayBuffer };
type StoredSetting = { key: string; value: unknown };
type StoredSnapshot = Omit<DatabaseSnapshot, "bytes"> & { bytes: ArrayBuffer };
type StoredCheckpointState = { databaseId: string; initial: StoredSnapshot; undo: StoredSnapshot[]; redo: StoredSnapshot[] };
type StoredDiagram = { databaseId: string; positions: DiagramPositions };

export interface DatabasePersistence {
  getAllDatabases(workspaceId?: string): Promise<PersistedDatabase[]>;
  getDatabase(databaseId: string): Promise<PersistedDatabase | null>;
  putDatabase(database: PersistedDatabase): Promise<void>;
  renameDatabaseData(database: PersistedDatabase): Promise<void>;
  getActiveDatabaseId(workspaceId?: string): Promise<string | null>;
  setActiveDatabaseId(databaseId: string | null, workspaceId?: string): Promise<void>;
  getInitialized(): Promise<boolean>;
  markInitialized(): Promise<void>;
  getCheckpointState(databaseId: string): Promise<DatabaseCheckpointState | null>;
  putCheckpointState(state: DatabaseCheckpointState): Promise<void>;
  putDatabaseAndCheckpoint(database: PersistedDatabase, state: DatabaseCheckpointState): Promise<void>;
  getQueryHistory(workspaceId?: string): Promise<QueryHistoryEntry[]>;
  putQueryHistoryEntry(entry: QueryHistoryEntry, limit?: number): Promise<void>;
  getDiagramPositions(databaseId: string): Promise<DiagramPositions>;
  putDiagramPositions(databaseId: string, positions: DiagramPositions): Promise<void>;
  deleteDatabaseData(databaseId: string, nextActiveDatabaseId: string | null, workspaceId?: string): Promise<void>;
  getWorkspaces(): Promise<WorkspaceMetadata[]>;
  putWorkspace(workspace: WorkspaceMetadata): Promise<void>;
  getActiveWorkspaceId(): Promise<string | null>;
  setActiveWorkspaceId(workspaceId: string): Promise<void>;
  getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings>;
  putWorkspaceSettings(workspaceId: string, settings: WorkspaceSettings): Promise<void>;
  getSavedQueries(workspaceId: string): Promise<SavedQuery[]>;
  putSavedQuery(query: SavedQuery): Promise<void>;
  deleteSavedQuery(queryId: string): Promise<void>;
  deleteWorkspaceData(workspaceId: string, nextWorkspaceId: string | null): Promise<void>;
  putWorkspaceBundle(bundle: WorkspacePersistenceBundle, overwrite: boolean): Promise<void>;
  getWorkspaceStorageUsage(workspaceId: string): Promise<WorkspaceStorageUsage>;
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function activeDatabaseKey(workspaceId: string) { return `${ACTIVE_DATABASE_KEY}:${workspaceId}`; }
function workspaceSettingsKey(workspaceId: string) { return `workspaceSettings:${workspaceId}`; }
function normalizeMetadata(metadata: DatabaseMetadata): DatabaseMetadata { return { ...metadata, workspaceId: metadata.workspaceId || DEFAULT_WORKSPACE_ID }; }
function normalizeHistory(entry: QueryHistoryEntry): QueryHistoryEntry { return { ...entry, workspaceId: entry.workspaceId || DEFAULT_WORKSPACE_ID }; }
function encodeDatabase(database: PersistedDatabase): StoredDatabase { return { id: database.metadata.id, metadata: normalizeMetadata(database.metadata), bytes: copyToArrayBuffer(database.bytes) }; }
function decodeDatabase(database: StoredDatabase): PersistedDatabase { return { metadata: normalizeMetadata(database.metadata), bytes: new Uint8Array(database.bytes) }; }

export class IndexedDbDatabaseStore implements DatabasePersistence {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly databaseName = DEFAULT_DATABASE_NAME) {}

  private openDatabase() {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 4);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DATABASE_STORE)) database.createObjectStore(DATABASE_STORE, { keyPath: "id" });
        if (!database.objectStoreNames.contains(SETTINGS_STORE)) database.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
        if (!database.objectStoreNames.contains(CHECKPOINTS_STORE)) database.createObjectStore(CHECKPOINTS_STORE, { keyPath: "databaseId" });
        if (!database.objectStoreNames.contains(QUERY_HISTORY_STORE)) database.createObjectStore(QUERY_HISTORY_STORE, { keyPath: "id" });
        if (!database.objectStoreNames.contains(DIAGRAM_LAYOUTS_STORE)) database.createObjectStore(DIAGRAM_LAYOUTS_STORE, { keyPath: "databaseId" });
        if (!database.objectStoreNames.contains(WORKSPACES_STORE)) database.createObjectStore(WORKSPACES_STORE, { keyPath: "id" });
        if (!database.objectStoreNames.contains(SAVED_QUERIES_STORE)) database.createObjectStore(SAVED_QUERIES_STORE, { keyPath: "id" });
      });
      request.addEventListener("success", () => {
        request.result.addEventListener("versionchange", () => request.result.close());
        resolve(request.result);
      });
      request.addEventListener("error", () => reject(request.error));
      request.addEventListener("blocked", () => reject(new Error("QueryQuest storage is blocked by another open tab.")));
    });
    return this.databasePromise;
  }

  async getAllDatabases(workspaceId = DEFAULT_WORKSPACE_ID) {
    const database = await this.openDatabase();
    const transaction = database.transaction(DATABASE_STORE, "readonly");
    const records = await requestToPromise(transaction.objectStore(DATABASE_STORE).getAll() as IDBRequest<StoredDatabase[]>);
    return records.map(decodeDatabase).filter((item) => item.metadata.workspaceId === workspaceId).sort((a, b) => a.metadata.createdAt.localeCompare(b.metadata.createdAt));
  }

  async getDatabase(databaseId: string) {
    const database = await this.openDatabase();
    const transaction = database.transaction(DATABASE_STORE, "readonly");
    const record = await requestToPromise(transaction.objectStore(DATABASE_STORE).get(databaseId) as IDBRequest<StoredDatabase | undefined>);
    return record ? decodeDatabase(record) : null;
  }

  async putDatabase(databaseToStore: PersistedDatabase) {
    const database = await this.openDatabase();
    const transaction = database.transaction(DATABASE_STORE, "readwrite");
    transaction.objectStore(DATABASE_STORE).put(encodeDatabase(databaseToStore));
    await transactionToPromise(transaction);
  }

  async renameDatabaseData(databaseToStore: PersistedDatabase) {
    const database = await this.openDatabase();
    const transaction = database.transaction([DATABASE_STORE, QUERY_HISTORY_STORE], "readwrite");
    transaction.objectStore(DATABASE_STORE).put(encodeDatabase(databaseToStore));
    const historyStore = transaction.objectStore(QUERY_HISTORY_STORE);
    const history = await requestToPromise(historyStore.getAll() as IDBRequest<QueryHistoryEntry[]>);
    history.filter((entry) => entry.databaseId === databaseToStore.metadata.id).forEach((entry) => historyStore.put({ ...entry, databaseName: databaseToStore.metadata.name }));
    await transactionToPromise(transaction);
  }

  async getActiveDatabaseId(workspaceId = DEFAULT_WORKSPACE_ID) {
    const database = await this.openDatabase();
    const transaction = database.transaction(SETTINGS_STORE, "readonly");
    const store = transaction.objectStore(SETTINGS_STORE);
    const record = await requestToPromise(store.get(activeDatabaseKey(workspaceId)) as IDBRequest<StoredSetting | undefined>);
    if (typeof record?.value === "string") return record.value;
    if (workspaceId !== DEFAULT_WORKSPACE_ID) return null;
    const legacy = await requestToPromise(store.get(ACTIVE_DATABASE_KEY) as IDBRequest<StoredSetting | undefined>);
    return typeof legacy?.value === "string" ? legacy.value : null;
  }

  async setActiveDatabaseId(databaseId: string | null, workspaceId = DEFAULT_WORKSPACE_ID) {
    const database = await this.openDatabase();
    const transaction = database.transaction(SETTINGS_STORE, "readwrite");
    transaction.objectStore(SETTINGS_STORE).put({ key: activeDatabaseKey(workspaceId), value: databaseId } satisfies StoredSetting);
    await transactionToPromise(transaction);
  }

  async getInitialized() {
    const database = await this.openDatabase();
    const transaction = database.transaction(SETTINGS_STORE, "readonly");
    const record = await requestToPromise(transaction.objectStore(SETTINGS_STORE).get(INITIALIZED_KEY) as IDBRequest<StoredSetting | undefined>);
    return record?.value === true;
  }

  async markInitialized() {
    const database = await this.openDatabase();
    const transaction = database.transaction(SETTINGS_STORE, "readwrite");
    transaction.objectStore(SETTINGS_STORE).put({ key: INITIALIZED_KEY, value: true } satisfies StoredSetting);
    await transactionToPromise(transaction);
  }

  async getCheckpointState(databaseId: string) {
    const database = await this.openDatabase();
    const transaction = database.transaction(CHECKPOINTS_STORE, "readonly");
    const record = await requestToPromise(transaction.objectStore(CHECKPOINTS_STORE).get(databaseId) as IDBRequest<StoredCheckpointState | undefined>);
    return record ? decodeCheckpoint(record) : null;
  }

  async putCheckpointState(state: DatabaseCheckpointState) {
    const database = await this.openDatabase();
    const transaction = database.transaction(CHECKPOINTS_STORE, "readwrite");
    transaction.objectStore(CHECKPOINTS_STORE).put(encodeCheckpoint(state));
    await transactionToPromise(transaction);
  }

  async putDatabaseAndCheckpoint(databaseToStore: PersistedDatabase, state: DatabaseCheckpointState) {
    const database = await this.openDatabase();
    const transaction = database.transaction([DATABASE_STORE, CHECKPOINTS_STORE], "readwrite");
    transaction.objectStore(DATABASE_STORE).put(encodeDatabase(databaseToStore));
    transaction.objectStore(CHECKPOINTS_STORE).put(encodeCheckpoint(state));
    await transactionToPromise(transaction);
  }

  async getQueryHistory(workspaceId = DEFAULT_WORKSPACE_ID) {
    const database = await this.openDatabase();
    const transaction = database.transaction(QUERY_HISTORY_STORE, "readonly");
    const entries = await requestToPromise(transaction.objectStore(QUERY_HISTORY_STORE).getAll() as IDBRequest<QueryHistoryEntry[]>);
    return entries.map(normalizeHistory).filter((entry) => entry.workspaceId === workspaceId).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async putQueryHistoryEntry(entry: QueryHistoryEntry, limit = 200) {
    const database = await this.openDatabase();
    const transaction = database.transaction(QUERY_HISTORY_STORE, "readwrite");
    const store = transaction.objectStore(QUERY_HISTORY_STORE);
    store.put(normalizeHistory(entry));
    const entries = (await requestToPromise(store.getAll() as IDBRequest<QueryHistoryEntry[]>)).map(normalizeHistory).filter((item) => item.workspaceId === entry.workspaceId);
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(limit).forEach((item) => store.delete(item.id));
    await transactionToPromise(transaction);
  }

  async getDiagramPositions(databaseId: string) {
    const database = await this.openDatabase();
    const transaction = database.transaction(DIAGRAM_LAYOUTS_STORE, "readonly");
    const record = await requestToPromise(transaction.objectStore(DIAGRAM_LAYOUTS_STORE).get(databaseId) as IDBRequest<StoredDiagram | undefined>);
    return record?.positions ?? {};
  }

  async putDiagramPositions(databaseId: string, positions: DiagramPositions) {
    const database = await this.openDatabase();
    const transaction = database.transaction(DIAGRAM_LAYOUTS_STORE, "readwrite");
    transaction.objectStore(DIAGRAM_LAYOUTS_STORE).put({ databaseId, positions } satisfies StoredDiagram);
    await transactionToPromise(transaction);
  }

  async deleteDatabaseData(databaseId: string, nextActiveDatabaseId: string | null, workspaceId = DEFAULT_WORKSPACE_ID) {
    const database = await this.openDatabase();
    const transaction = database.transaction([DATABASE_STORE, CHECKPOINTS_STORE, QUERY_HISTORY_STORE, SETTINGS_STORE, DIAGRAM_LAYOUTS_STORE], "readwrite");
    transaction.objectStore(DATABASE_STORE).delete(databaseId);
    transaction.objectStore(CHECKPOINTS_STORE).delete(databaseId);
    transaction.objectStore(DIAGRAM_LAYOUTS_STORE).delete(databaseId);
    const historyStore = transaction.objectStore(QUERY_HISTORY_STORE);
    const history = await requestToPromise(historyStore.getAll() as IDBRequest<QueryHistoryEntry[]>);
    history.filter((entry) => entry.databaseId === databaseId).forEach((entry) => historyStore.delete(entry.id));
    const settings = transaction.objectStore(SETTINGS_STORE);
    settings.put({ key: activeDatabaseKey(workspaceId), value: nextActiveDatabaseId } satisfies StoredSetting);
    settings.put({ key: INITIALIZED_KEY, value: true } satisfies StoredSetting);
    await transactionToPromise(transaction);
  }

  async getWorkspaces() {
    const database = await this.openDatabase();
    const transaction = database.transaction(WORKSPACES_STORE, "readonly");
    const entries = await requestToPromise(transaction.objectStore(WORKSPACES_STORE).getAll() as IDBRequest<WorkspaceMetadata[]>);
    return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async putWorkspace(workspace: WorkspaceMetadata) {
    const database = await this.openDatabase();
    const transaction = database.transaction(WORKSPACES_STORE, "readwrite");
    transaction.objectStore(WORKSPACES_STORE).put(workspace);
    await transactionToPromise(transaction);
  }

  async getActiveWorkspaceId() {
    const database = await this.openDatabase();
    const transaction = database.transaction(SETTINGS_STORE, "readonly");
    const record = await requestToPromise(transaction.objectStore(SETTINGS_STORE).get(ACTIVE_WORKSPACE_KEY) as IDBRequest<StoredSetting | undefined>);
    return typeof record?.value === "string" ? record.value : null;
  }

  async setActiveWorkspaceId(workspaceId: string) {
    const database = await this.openDatabase();
    const transaction = database.transaction(SETTINGS_STORE, "readwrite");
    transaction.objectStore(SETTINGS_STORE).put({ key: ACTIVE_WORKSPACE_KEY, value: workspaceId } satisfies StoredSetting);
    await transactionToPromise(transaction);
  }

  async getWorkspaceSettings(workspaceId: string) {
    const database = await this.openDatabase();
    const transaction = database.transaction(SETTINGS_STORE, "readonly");
    const record = await requestToPromise(transaction.objectStore(SETTINGS_STORE).get(workspaceSettingsKey(workspaceId)) as IDBRequest<StoredSetting | undefined>);
    return { ...DEFAULT_WORKSPACE_SETTINGS, ...(record?.value && typeof record.value === "object" ? record.value as Partial<WorkspaceSettings> : {}) };
  }

  async putWorkspaceSettings(workspaceId: string, settings: WorkspaceSettings) {
    const database = await this.openDatabase();
    const transaction = database.transaction([SETTINGS_STORE, WORKSPACES_STORE], "readwrite");
    transaction.objectStore(SETTINGS_STORE).put({ key: workspaceSettingsKey(workspaceId), value: settings } satisfies StoredSetting);
    const workspaceStore = transaction.objectStore(WORKSPACES_STORE);
    const workspace = await requestToPromise(workspaceStore.get(workspaceId) as IDBRequest<WorkspaceMetadata | undefined>);
    if (workspace) workspaceStore.put({ ...workspace, updatedAt: new Date().toISOString() });
    await transactionToPromise(transaction);
  }

  async getSavedQueries(workspaceId: string) {
    const database = await this.openDatabase();
    const transaction = database.transaction(SAVED_QUERIES_STORE, "readonly");
    const entries = await requestToPromise(transaction.objectStore(SAVED_QUERIES_STORE).getAll() as IDBRequest<SavedQuery[]>);
    return entries.filter((entry) => entry.workspaceId === workspaceId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async putSavedQuery(query: SavedQuery) {
    const database = await this.openDatabase();
    const transaction = database.transaction(SAVED_QUERIES_STORE, "readwrite");
    transaction.objectStore(SAVED_QUERIES_STORE).put(query);
    await transactionToPromise(transaction);
  }

  async deleteSavedQuery(queryId: string) {
    const database = await this.openDatabase();
    const transaction = database.transaction(SAVED_QUERIES_STORE, "readwrite");
    transaction.objectStore(SAVED_QUERIES_STORE).delete(queryId);
    await transactionToPromise(transaction);
  }

  async deleteWorkspaceData(workspaceId: string, nextWorkspaceId: string | null) {
    const database = await this.openDatabase();
    const stores = [WORKSPACES_STORE, DATABASE_STORE, CHECKPOINTS_STORE, QUERY_HISTORY_STORE, DIAGRAM_LAYOUTS_STORE, SAVED_QUERIES_STORE, SETTINGS_STORE];
    const transaction = database.transaction(stores, "readwrite");
    const databaseStore = transaction.objectStore(DATABASE_STORE);
    const historyStore = transaction.objectStore(QUERY_HISTORY_STORE);
    const savedStore = transaction.objectStore(SAVED_QUERIES_STORE);
    const [databases, history, saved] = await Promise.all([
      requestToPromise(databaseStore.getAll() as IDBRequest<StoredDatabase[]>),
      requestToPromise(historyStore.getAll() as IDBRequest<QueryHistoryEntry[]>),
      requestToPromise(savedStore.getAll() as IDBRequest<SavedQuery[]>),
    ]);
    databases.filter((item) => normalizeMetadata(item.metadata).workspaceId === workspaceId).forEach((item) => {
      databaseStore.delete(item.id);
      transaction.objectStore(CHECKPOINTS_STORE).delete(item.id);
      transaction.objectStore(DIAGRAM_LAYOUTS_STORE).delete(item.id);
    });
    history.filter((entry) => normalizeHistory(entry).workspaceId === workspaceId).forEach((entry) => historyStore.delete(entry.id));
    saved.filter((entry) => entry.workspaceId === workspaceId).forEach((entry) => savedStore.delete(entry.id));
    transaction.objectStore(WORKSPACES_STORE).delete(workspaceId);
    const settings = transaction.objectStore(SETTINGS_STORE);
    settings.delete(workspaceSettingsKey(workspaceId));
    settings.delete(activeDatabaseKey(workspaceId));
    settings.put({ key: ACTIVE_WORKSPACE_KEY, value: nextWorkspaceId } satisfies StoredSetting);
    await transactionToPromise(transaction);
  }

  async putWorkspaceBundle(bundle: WorkspacePersistenceBundle, overwrite: boolean) {
    const database = await this.openDatabase();
    const stores = [WORKSPACES_STORE, DATABASE_STORE, CHECKPOINTS_STORE, QUERY_HISTORY_STORE, DIAGRAM_LAYOUTS_STORE, SAVED_QUERIES_STORE, SETTINGS_STORE];
    const transaction = database.transaction(stores, "readwrite");
    const workspaceStore = transaction.objectStore(WORKSPACES_STORE);
    const existing = await requestToPromise(workspaceStore.get(bundle.workspace.id) as IDBRequest<WorkspaceMetadata | undefined>);
    if (existing && !overwrite) {
      transaction.abort();
      throw new Error(`A workspace named “${existing.name}” already uses this workspace ID.`);
    }
    if (existing) {
      const databaseStore = transaction.objectStore(DATABASE_STORE);
      const savedStore = transaction.objectStore(SAVED_QUERIES_STORE);
      const historyStore = transaction.objectStore(QUERY_HISTORY_STORE);
      const [databases, saved, history] = await Promise.all([
        requestToPromise(databaseStore.getAll() as IDBRequest<StoredDatabase[]>),
        requestToPromise(savedStore.getAll() as IDBRequest<SavedQuery[]>),
        requestToPromise(historyStore.getAll() as IDBRequest<QueryHistoryEntry[]>),
      ]);
      databases.filter((item) => normalizeMetadata(item.metadata).workspaceId === existing.id).forEach((item) => {
        databaseStore.delete(item.id);
        transaction.objectStore(CHECKPOINTS_STORE).delete(item.id);
        transaction.objectStore(DIAGRAM_LAYOUTS_STORE).delete(item.id);
      });
      saved.filter((item) => item.workspaceId === existing.id).forEach((item) => savedStore.delete(item.id));
      history.filter((item) => normalizeHistory(item).workspaceId === existing.id).forEach((item) => historyStore.delete(item.id));
    }
    workspaceStore.put(bundle.workspace);
    const databaseStore = transaction.objectStore(DATABASE_STORE);
    const checkpointStore = transaction.objectStore(CHECKPOINTS_STORE);
    const diagramStore = transaction.objectStore(DIAGRAM_LAYOUTS_STORE);
    for (const item of bundle.databases) {
      databaseStore.put(encodeDatabase(item.database));
      checkpointStore.put(encodeCheckpoint(item.checkpoint));
      diagramStore.put({ databaseId: item.database.metadata.id, positions: item.diagramPositions } satisfies StoredDiagram);
    }
    const savedStore = transaction.objectStore(SAVED_QUERIES_STORE);
    bundle.savedQueries.forEach((query) => savedStore.put(query));
    const historyStore = transaction.objectStore(QUERY_HISTORY_STORE);
    bundle.queryHistory.forEach((entry) => historyStore.put(entry));
    const settings = transaction.objectStore(SETTINGS_STORE);
    settings.put({ key: workspaceSettingsKey(bundle.workspace.id), value: bundle.settings } satisfies StoredSetting);
    settings.put({ key: activeDatabaseKey(bundle.workspace.id), value: bundle.activeDatabaseId } satisfies StoredSetting);
    settings.put({ key: ACTIVE_WORKSPACE_KEY, value: bundle.workspace.id } satisfies StoredSetting);
    await transactionToPromise(transaction);
  }

  async getWorkspaceStorageUsage(workspaceId: string) {
    const database = await this.openDatabase();
    const transaction = database.transaction([DATABASE_STORE, CHECKPOINTS_STORE, QUERY_HISTORY_STORE, SAVED_QUERIES_STORE, SETTINGS_STORE, DIAGRAM_LAYOUTS_STORE], "readonly");
    const [databases, checkpoints, history, saved, settings, diagrams] = await Promise.all([
      requestToPromise(transaction.objectStore(DATABASE_STORE).getAll() as IDBRequest<StoredDatabase[]>),
      requestToPromise(transaction.objectStore(CHECKPOINTS_STORE).getAll() as IDBRequest<StoredCheckpointState[]>),
      requestToPromise(transaction.objectStore(QUERY_HISTORY_STORE).getAll() as IDBRequest<QueryHistoryEntry[]>),
      requestToPromise(transaction.objectStore(SAVED_QUERIES_STORE).getAll() as IDBRequest<SavedQuery[]>),
      requestToPromise(transaction.objectStore(SETTINGS_STORE).get(workspaceSettingsKey(workspaceId)) as IDBRequest<StoredSetting | undefined>),
      requestToPromise(transaction.objectStore(DIAGRAM_LAYOUTS_STORE).getAll() as IDBRequest<StoredDiagram[]>),
    ]);
    const ownedDatabases = databases.filter((item) => normalizeMetadata(item.metadata).workspaceId === workspaceId);
    const ids = new Set(ownedDatabases.map((item) => item.id));
    const databaseBytes = ownedDatabases.reduce((total, item) => total + item.bytes.byteLength, 0);
    const checkpointBytes = checkpoints.filter((item) => ids.has(item.databaseId)).reduce((total, item) => total + snapshotBytes(item), 0);
    const metadataBytes = new Blob([
      JSON.stringify(history.map(normalizeHistory).filter((item) => item.workspaceId === workspaceId)),
      JSON.stringify(saved.filter((item) => item.workspaceId === workspaceId)),
      JSON.stringify(settings?.value ?? {}),
      JSON.stringify(diagrams.filter((item) => ids.has(item.databaseId))),
    ]).size;
    return { databaseBytes, checkpointBytes, metadataBytes, totalBytes: databaseBytes + checkpointBytes + metadataBytes } satisfies WorkspaceStorageUsage;
  }
}

function encodeSnapshot(snapshot: DatabaseSnapshot): StoredSnapshot { return { ...snapshot, bytes: copyToArrayBuffer(snapshot.bytes) }; }
function decodeSnapshot(snapshot: StoredSnapshot): DatabaseSnapshot { return { ...snapshot, bytes: new Uint8Array(snapshot.bytes) }; }
function encodeCheckpoint(state: DatabaseCheckpointState): StoredCheckpointState { return { databaseId: state.databaseId, initial: encodeSnapshot(state.initial), undo: state.undo.map(encodeSnapshot), redo: state.redo.map(encodeSnapshot) }; }
function decodeCheckpoint(state: StoredCheckpointState): DatabaseCheckpointState { return { databaseId: state.databaseId, initial: decodeSnapshot(state.initial), undo: state.undo.map(decodeSnapshot), redo: state.redo.map(decodeSnapshot) }; }
function snapshotBytes(state: StoredCheckpointState) { return state.initial.bytes.byteLength + state.undo.reduce((sum, item) => sum + item.bytes.byteLength, 0) + state.redo.reduce((sum, item) => sum + item.bytes.byteLength, 0); }

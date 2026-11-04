import { COLLEGE_DATABASE_ID, COLLEGE_SAMPLE_SQL } from "@/lib/database/college-sample";
import {
  BrowserDatabaseWorkerClient,
  type DatabaseWorkerApi,
} from "@/lib/database/database-worker-client";
import {
  IndexedDbDatabaseStore,
  type DatabasePersistence,
} from "@/lib/database/indexed-db-store";
import type {
  DatabaseManagerSnapshot,
  DatabaseImportPreview,
  DatabaseMetadata,
  DatabaseSource,
  DatasetColumn,
  SqlParameters,
  SqlValue,
  TableDataEdit,
  TableDefinition,
} from "@/lib/database/types";

type DatabaseManagerOptions = {
  now?: () => Date;
  createId?: () => string;
};

export class DatabaseManager {
  private databases: DatabaseMetadata[] = [];
  private activeDatabaseId: string | null = null;
  private initializePromise: Promise<DatabaseManagerSnapshot> | null = null;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly worker: DatabaseWorkerApi,
    private readonly persistence: DatabasePersistence,
    options: DatabaseManagerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId =
      options.createId ??
      (() =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `database-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }

  initialize() {
    if (!this.initializePromise) this.initializePromise = this.initializeInternal();
    return this.initializePromise;
  }

  private async initializeInternal() {
    const persistedDatabases = await this.persistence.getAllDatabases();
    await this.worker.initialize(
      persistedDatabases.map((database) => ({
        id: database.metadata.id,
        bytes: database.bytes,
      })),
    );
    this.databases = persistedDatabases.map((database) => database.metadata);

    if (this.databases.length === 0) await this.createCollegeSample();

    const savedActiveId = await this.persistence.getActiveDatabaseId();
    this.activeDatabaseId = this.databases.some((database) => database.id === savedActiveId)
      ? savedActiveId
      : this.databases[0]?.id ?? null;
    await this.persistence.setActiveDatabaseId(this.activeDatabaseId);

    return this.getSnapshot();
  }

  getSnapshot(): DatabaseManagerSnapshot {
    return {
      databases: [...this.databases],
      activeDatabaseId: this.activeDatabaseId,
    };
  }

  async switchDatabase(databaseId: string) {
    await this.initialize();
    if (!this.databases.some((database) => database.id === databaseId)) {
      throw new Error("The selected database is not available.");
    }
    this.activeDatabaseId = databaseId;
    await this.persistence.setActiveDatabaseId(databaseId);
    return this.getSnapshot();
  }

  async createDatabase(name: string) {
    await this.initialize();
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Enter a name for the database.");

    const databaseId = this.createId();
    await this.worker.createDatabase(databaseId);
    return this.persistNewDatabase(databaseId, cleanName, "created");
  }

  async loadDatabase(input: { name: string; bytes: Uint8Array }) {
    await this.initialize();
    const databaseId = this.createId();
    const name = input.name.trim() || "Imported database";

    try {
      await this.worker.loadDatabase(databaseId, input.bytes);
      await this.worker.listTables(databaseId);
      return await this.persistNewDatabase(databaseId, name, "import");
    } catch (error) {
      await this.worker.dropDatabase(databaseId).catch(() => undefined);
      throw new Error(
        error instanceof Error
          ? `Could not import this database: ${error.message}`
          : "Could not import this database.",
      );
    }
  }

  async inspectSqliteDatabase(bytes: Uint8Array): Promise<DatabaseImportPreview> {
    await this.initialize();
    const previewId = `preview-${this.createId()}`;
    await this.worker.loadDatabase(previewId, bytes);
    try {
      const tables = await this.worker.listTables(previewId);
      const previewTables = await Promise.all(
        tables.map(async (summary) => {
          const [schema, records] = await Promise.all([
            this.worker.getTableSchema(previewId, summary.name),
            this.worker.getTableRecords(previewId, summary.name, 5, 0),
          ]);
          return { summary, schema, records };
        }),
      );
      return { tables: previewTables };
    } finally {
      await this.worker.dropDatabase(previewId);
    }
  }

  async createDatabaseFromDataset(input: {
    databaseName: string;
    tableName: string;
    columns: DatasetColumn[];
    rows: SqlValue[][];
  }) {
    await this.initialize();
    const databaseName = input.databaseName.trim();
    const tableName = input.tableName.trim();
    if (!databaseName) throw new Error("Enter a database name.");
    if (!tableName) throw new Error("Enter a table name.");

    const databaseId = this.createId();
    await this.worker.createDatabase(databaseId);
    try {
      await this.worker.importTable(databaseId, tableName, input.columns, input.rows);
      return await this.persistNewDatabase(databaseId, databaseName, "import");
    } catch (error) {
      await this.worker.dropDatabase(databaseId).catch(() => undefined);
      throw new Error(
        error instanceof Error
          ? `Could not import this dataset: ${error.message}`
          : "Could not import this dataset.",
      );
    }
  }

  async listTables(databaseId?: string) {
    await this.initialize();
    return this.worker.listTables(databaseId ?? this.requireActiveDatabaseId());
  }

  async readTableSchema(tableName: string, databaseId?: string) {
    await this.initialize();
    return this.worker.getTableSchema(databaseId ?? this.requireActiveDatabaseId(), tableName);
  }

  async readTableRecords(
    tableName: string,
    options: { databaseId?: string; limit?: number; offset?: number } = {},
  ) {
    await this.initialize();
    return this.worker.getTableRecords(
      options.databaseId ?? this.requireActiveDatabaseId(),
      tableName,
      options.limit,
      options.offset,
    );
  }

  async readEditableTableRecords(tableName: string, databaseId?: string) {
    await this.initialize();
    return this.worker.getEditableTableRecords(databaseId ?? this.requireActiveDatabaseId(), tableName);
  }

  async createTable(definition: TableDefinition, databaseId?: string) {
    await this.initialize();
    const id = databaseId ?? this.requireActiveDatabaseId();
    return this.commitMutation(id, () => this.worker.createTable(id, definition));
  }

  async applyTableEdits(tableName: string, edits: TableDataEdit[], databaseId?: string) {
    await this.initialize();
    const id = databaseId ?? this.requireActiveDatabaseId();
    return this.commitMutation(id, () => this.worker.applyTableEdits(id, tableName, edits));
  }

  async executeReadOnlyQuery(
    sql: string,
    parameters?: SqlParameters,
    databaseId?: string,
  ) {
    await this.initialize();
    return this.worker.executeSql(databaseId ?? this.requireActiveDatabaseId(), sql, {
      parameters,
      readOnly: true,
    });
  }

  async executeInternal(
    databaseId: string,
    sql: string,
    parameters?: SqlParameters,
  ) {
    await this.initialize();
    const result = await this.worker.executeSql(databaseId, sql, {
      parameters,
      readOnly: false,
    });
    await this.persistExistingDatabase(databaseId);
    return result;
  }

  private requireActiveDatabaseId() {
    if (!this.activeDatabaseId) throw new Error("No database is active.");
    return this.activeDatabaseId;
  }

  private async createCollegeSample() {
    const createdAt = this.now().toISOString();
    await this.worker.createDatabase(COLLEGE_DATABASE_ID);
    await this.worker.executeSql(COLLEGE_DATABASE_ID, COLLEGE_SAMPLE_SQL, { readOnly: false });
    const bytes = await this.worker.exportDatabase(COLLEGE_DATABASE_ID);
    const metadata: DatabaseMetadata = {
      id: COLLEGE_DATABASE_ID,
      name: "College",
      source: "sample",
      createdAt,
      updatedAt: createdAt,
      sizeBytes: bytes.byteLength,
    };
    await this.persistence.putDatabase({ metadata, bytes });
    this.databases = [metadata];
    this.activeDatabaseId = COLLEGE_DATABASE_ID;
  }

  private async persistNewDatabase(
    databaseId: string,
    name: string,
    source: DatabaseSource,
  ) {
    const bytes = await this.worker.exportDatabase(databaseId);
    const timestamp = this.now().toISOString();
    const metadata: DatabaseMetadata = {
      id: databaseId,
      name,
      source,
      createdAt: timestamp,
      updatedAt: timestamp,
      sizeBytes: bytes.byteLength,
    };
    await this.persistence.putDatabase({ metadata, bytes });
    this.databases = [...this.databases, metadata];
    this.activeDatabaseId = databaseId;
    await this.persistence.setActiveDatabaseId(databaseId);
    return this.getSnapshot();
  }

  private async persistExistingDatabase(databaseId: string) {
    const current = this.databases.find((database) => database.id === databaseId);
    if (!current) throw new Error("Cannot persist an unknown database.");
    const bytes = await this.worker.exportDatabase(databaseId);
    const metadata = {
      ...current,
      updatedAt: this.now().toISOString(),
      sizeBytes: bytes.byteLength,
    };
    await this.persistence.putDatabase({ metadata, bytes });
    this.databases = this.databases.map((database) =>
      database.id === databaseId ? metadata : database,
    );
  }

  private async commitMutation<T>(databaseId: string, mutate: () => Promise<T>) {
    const before = await this.worker.exportDatabase(databaseId);
    try {
      const result = await mutate();
      await this.persistExistingDatabase(databaseId);
      return result;
    } catch (error) {
      await this.worker.loadDatabase(databaseId, before).catch(() => undefined);
      throw error;
    }
  }
}

let browserManager: DatabaseManager | null = null;

export function getDatabaseManager() {
  if (typeof window === "undefined") {
    throw new Error("The QueryQuest database manager is only available in the browser.");
  }
  if (!browserManager) {
    browserManager = new DatabaseManager(
      new BrowserDatabaseWorkerClient(),
      new IndexedDbDatabaseStore(),
    );
  }
  return browserManager;
}

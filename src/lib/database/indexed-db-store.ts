import type { DatabaseMetadata, PersistedDatabase } from "@/lib/database/types";

const DEFAULT_DATABASE_NAME = "queryquest-storage";
const DATABASE_STORE = "databases";
const SETTINGS_STORE = "settings";
const ACTIVE_DATABASE_KEY = "activeDatabaseId";

type StoredDatabase = {
  id: string;
  metadata: DatabaseMetadata;
  bytes: ArrayBuffer;
};

type StoredSetting = {
  key: string;
  value: string | null;
};

export interface DatabasePersistence {
  getAllDatabases(): Promise<PersistedDatabase[]>;
  getDatabase(databaseId: string): Promise<PersistedDatabase | null>;
  putDatabase(database: PersistedDatabase): Promise<void>;
  getActiveDatabaseId(): Promise<string | null>;
  setActiveDatabaseId(databaseId: string | null): Promise<void>;
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

export class IndexedDbDatabaseStore implements DatabasePersistence {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly databaseName = DEFAULT_DATABASE_NAME) {}

  private openDatabase() {
    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);

      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DATABASE_STORE)) {
          database.createObjectStore(DATABASE_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
          database.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
        }
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
      request.addEventListener("blocked", () =>
        reject(new Error("QueryQuest storage is blocked by another open tab.")),
      );
    });

    return this.databasePromise;
  }

  async getAllDatabases() {
    const database = await this.openDatabase();
    const transaction = database.transaction(DATABASE_STORE, "readonly");
    const records = await requestToPromise(
      transaction.objectStore(DATABASE_STORE).getAll() as IDBRequest<StoredDatabase[]>,
    );

    return records
      .map((record) => ({
        metadata: record.metadata,
        bytes: new Uint8Array(record.bytes),
      }))
      .sort((a, b) => a.metadata.createdAt.localeCompare(b.metadata.createdAt));
  }

  async getDatabase(databaseId: string) {
    const database = await this.openDatabase();
    const transaction = database.transaction(DATABASE_STORE, "readonly");
    const record = await requestToPromise(
      transaction.objectStore(DATABASE_STORE).get(databaseId) as IDBRequest<
        StoredDatabase | undefined
      >,
    );

    return record
      ? { metadata: record.metadata, bytes: new Uint8Array(record.bytes) }
      : null;
  }

  async putDatabase(databaseToStore: PersistedDatabase) {
    const database = await this.openDatabase();
    const transaction = database.transaction(DATABASE_STORE, "readwrite");
    transaction.objectStore(DATABASE_STORE).put({
      id: databaseToStore.metadata.id,
      metadata: databaseToStore.metadata,
      bytes: copyToArrayBuffer(databaseToStore.bytes),
    } satisfies StoredDatabase);
    await transactionToPromise(transaction);
  }

  async getActiveDatabaseId() {
    const database = await this.openDatabase();
    const transaction = database.transaction(SETTINGS_STORE, "readonly");
    const record = await requestToPromise(
      transaction.objectStore(SETTINGS_STORE).get(ACTIVE_DATABASE_KEY) as IDBRequest<
        StoredSetting | undefined
      >,
    );
    return record?.value ?? null;
  }

  async setActiveDatabaseId(databaseId: string | null) {
    const database = await this.openDatabase();
    const transaction = database.transaction(SETTINGS_STORE, "readwrite");
    transaction.objectStore(SETTINGS_STORE).put({
      key: ACTIVE_DATABASE_KEY,
      value: databaseId,
    } satisfies StoredSetting);
    await transactionToPromise(transaction);
  }
}

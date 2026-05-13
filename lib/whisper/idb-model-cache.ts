type CacheEntry = {
  key: string;
  body: ArrayBuffer;
  headers: Array<[string, string]>;
  status: number;
  statusText: string;
  createdAt: number;
};

const DB_NAME = "transformers-model-cache";
const STORE_NAME = "models";
const DB_VERSION = 1;

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function serializeHeaders(headers: Headers): Array<[string, string]> {
  return Array.from(headers.entries());
}

export class IDBModelCache {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async getDatabase(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDatabase().catch((error) => {
        this.dbPromise = null;
        throw error;
      });
    }
    return this.dbPromise;
  }

  async match(key: string): Promise<Response | undefined> {
    try {
      const db = await this.getDatabase();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const entry = await promisifyRequest<CacheEntry | undefined>(
        store.get(key),
      );

      if (!entry) return undefined;

      return new Response(entry.body.slice(0), {
        status: entry.status,
        statusText: entry.statusText,
        headers: new Headers(entry.headers),
      });
    } catch (error) {
      console.warn("[idb-cache] match failed:", error);
      return undefined;
    }
  }

  async put(
    key: string,
    response: Response,
    _progress?: unknown,
  ): Promise<void> {
    try {
      const clone = response.clone();
      const body = await clone.arrayBuffer();

      const entry: CacheEntry = {
        key,
        body,
        headers: serializeHeaders(clone.headers),
        status: clone.status,
        statusText: clone.statusText,
        createdAt: Date.now(),
      };

      const db = await this.getDatabase();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      await promisifyRequest(store.put(entry));
    } catch (error) {
      // Cache write failure should not break model loading.
      console.warn("[idb-cache] put failed:", error);
    }
  }
}

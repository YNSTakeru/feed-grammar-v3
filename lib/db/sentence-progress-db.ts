export interface SentenceProgress {
  sentenceId: string;
  hits: number;
  stage: "katakana" | "english";
  lastUpdated: number;
}

export interface DictationSessionEvent {
  id?: number;
  sessionId: string;
  segmentId: string;
  reductionType: string;
  correct: boolean;
  attemptsBeforeCorrect: number;
  createdAt: number;
}

const DB_NAME = "feed-grammar-learn";
const DB_VERSION = 2;
const STORE_NAME = "sentence-progress";
const DICTATION_EVENT_STORE = "dictation-events";

function defaultProgress(sentenceId: string): SentenceProgress {
  return {
    sentenceId,
    hits: 0,
    stage: "katakana",
    lastUpdated: 0,
  };
}

function isGracefulIndexedDBError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "InvalidStateError";
}

export class SentenceProgressDB {
  private db: IDBDatabase | null = null;
  private opening: Promise<void> | null = null;
  private unavailable = false;

  async init(): Promise<void> {
    if (this.db || this.unavailable) return;
    if (this.opening) return this.opening;

    if (typeof indexedDB === "undefined") {
      this.unavailable = true;
      return;
    }

    const opening = new Promise<void>((resolve, reject) => {
      let request: IDBOpenDBRequest;

      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        if (isGracefulIndexedDBError(error)) {
          this.unavailable = true;
          resolve();
          return;
        }
        reject(error);
        return;
      }

      request.onerror = () => {
        if (isGracefulIndexedDBError(request.error)) {
          this.unavailable = true;
          resolve();
          return;
        }
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "sentenceId" });
        }
        if (!db.objectStoreNames.contains(DICTATION_EVENT_STORE)) {
          db.createObjectStore(DICTATION_EVENT_STORE, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      };
    }).finally(() => {
      this.opening = null;
    });

    this.opening = opening;
    return opening;
  }

  async getProgress(sentenceId: string): Promise<SentenceProgress | null> {
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(sentenceId);

      request.onsuccess = () => {
        const result = request.result as SentenceProgress | undefined;
        resolve(result ?? defaultProgress(sentenceId));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async recordHit(sentenceId: string): Promise<SentenceProgress | null> {
    await this.init();
    if (!this.db) return null;

    return this.updateProgress(sentenceId, (existing) => {
      if (existing.stage === "english") {
        return { ...existing, lastUpdated: Date.now() };
      }

      const hits = existing.hits + 1;
      return {
        ...existing,
        hits,
        stage: hits >= 3 ? "english" : "katakana",
        lastUpdated: Date.now(),
      };
    });
  }

  async recordMiss(sentenceId: string): Promise<SentenceProgress | null> {
    await this.init();
    if (!this.db) return null;

    return this.updateProgress(sentenceId, (existing) => ({
      ...existing,
      hits: existing.stage === "english" ? existing.hits : 0,
      lastUpdated: Date.now(),
    }));
  }

  async reset(sentenceId: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(sentenceId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async recordDictationEvent(
    input: Omit<DictationSessionEvent, "id" | "createdAt">,
  ): Promise<DictationSessionEvent | null> {
    await this.init();
    if (!this.db) return null;

    const event: DictationSessionEvent = {
      ...input,
      createdAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([DICTATION_EVENT_STORE], "readwrite");
      const store = transaction.objectStore(DICTATION_EVENT_STORE);
      const request = store.put(event);

      request.onsuccess = () => {
        const id = request.result;
        resolve({
          ...event,
          id: typeof id === "number" ? id : undefined,
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async listDictationEvents(sessionId?: string): Promise<DictationSessionEvent[]> {
    await this.init();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([DICTATION_EVENT_STORE], "readonly");
      const store = transaction.objectStore(DICTATION_EVENT_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const all = (request.result as DictationSessionEvent[] | undefined) ?? [];
        const filtered = sessionId
          ? all.filter((item) => item.sessionId === sessionId)
          : all;
        filtered.sort((a, b) => a.createdAt - b.createdAt);
        resolve(filtered);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async updateProgress(
    sentenceId: string,
    update: (existing: SentenceProgress) => SentenceProgress,
  ): Promise<SentenceProgress | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(sentenceId);

      getRequest.onsuccess = () => {
        const existing =
          (getRequest.result as SentenceProgress | undefined) ??
          defaultProgress(sentenceId);
        const next = update(existing);
        const putRequest = store.put(next);
        putRequest.onsuccess = () => resolve(next);
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }
}

export const sentenceProgressDB = new SentenceProgressDB();

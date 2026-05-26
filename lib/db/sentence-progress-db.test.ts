import { beforeEach, describe, expect, it } from "vitest";

import { SentenceProgressDB } from "./sentence-progress-db";

type StoredValue = Record<string, unknown>;

class FakeIDBRequest<T = unknown> {
  result: T | undefined;
  error: DOMException | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

class FakeIDBOpenRequest extends FakeIDBRequest<FakeIDBDatabase> {
  onupgradeneeded: ((event: { target: FakeIDBOpenRequest }) => void) | null = null;
}

type FakeStoreConfig = {
  keyPath: string;
  autoIncrement: boolean;
  values: Map<string | number, StoredValue>;
  nextId: number;
};

class FakeObjectStore {
  constructor(private store: FakeStoreConfig) {}

  get(key: string) {
    const request = new FakeIDBRequest<StoredValue | StoredValue[] | undefined>();
    queueMicrotask(() => {
      request.result = this.store.values.get(key);
      request.onsuccess?.();
    });
    return request;
  }

  put(value: StoredValue) {
    const request = new FakeIDBRequest<string | number>();
    queueMicrotask(() => {
      let key: string | number | undefined;

      if (this.store.keyPath in value) {
        key = value[this.store.keyPath] as string | number | undefined;
      }

      if ((key === undefined || key === null) && this.store.autoIncrement) {
        key = this.store.nextId;
        this.store.nextId += 1;
        value[this.store.keyPath] = key;
      }

      if (key === undefined || key === null) {
        throw new Error(`missing key for store ${this.store.keyPath}`);
      }

      this.store.values.set(key, value);
      request.result = key;
      request.onsuccess?.();
    });
    return request;
  }

  delete(key: string) {
    const request = new FakeIDBRequest<undefined>();
    queueMicrotask(() => {
      this.store.values.delete(key);
      request.onsuccess?.();
    });
    return request;
  }

  getAll() {
    const request = new FakeIDBRequest<StoredValue[]>();
    queueMicrotask(() => {
      request.result = Array.from(this.store.values.values());
      request.onsuccess?.();
    });
    return request;
  }
}

class FakeIDBDatabase {
  private stores = new Map<string, FakeStoreConfig>();
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  createObjectStore(
    name: string,
    options?: { keyPath?: string; autoIncrement?: boolean },
  ) {
    this.stores.set(name, {
      keyPath: options?.keyPath ?? "id",
      autoIncrement: options?.autoIncrement ?? false,
      values: new Map(),
      nextId: 1,
    });
  }

  transaction(storeNames: string[]) {
    return {
      objectStore: (name: string) => {
        if (!storeNames.includes(name)) throw new Error(`store ${name} not in transaction`);
        const store = this.stores.get(name);
        if (!store) throw new Error(`missing store ${name}`);
        return new FakeObjectStore(store);
      },
    };
  }
}

class FakeIndexedDB {
  db = new FakeIDBDatabase();

  open() {
    const request = new FakeIDBOpenRequest();
    queueMicrotask(() => {
      request.result = this.db;
      request.onupgradeneeded?.({ target: request });
      request.onsuccess?.();
    });
    return request;
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", {
    value: new FakeIndexedDB(),
    configurable: true,
  });
});

describe("SentenceProgressDB", () => {
  it("initializes without crashing", async () => {
    const db = new SentenceProgressDB();
    await expect(db.init()).resolves.toBeUndefined();
  });

  it("advances to english after three hits", async () => {
    const db = new SentenceProgressDB();
    await db.recordHit("lesson-001-1");
    await db.recordHit("lesson-001-1");
    const progress = await db.recordHit("lesson-001-1");

    expect(progress).toMatchObject({ hits: 3, stage: "english" });
  });

  it("does not regress when already english", async () => {
    const db = new SentenceProgressDB();
    await db.recordHit("lesson-001-1");
    await db.recordHit("lesson-001-1");
    await db.recordHit("lesson-001-1");
    const progress = await db.recordHit("lesson-001-1");

    expect(progress).toMatchObject({ hits: 3, stage: "english" });
  });

  it("resets hits on miss without changing stage", async () => {
    const db = new SentenceProgressDB();
    await db.recordHit("lesson-001-1");
    const progress = await db.recordMiss("lesson-001-1");

    expect(progress).toMatchObject({ hits: 0, stage: "katakana" });
  });

  it("returns default progress for a missing sentenceId", async () => {
    const db = new SentenceProgressDB();
    const progress = await db.getProgress("lesson-001-404");

    expect(progress).toMatchObject({
      sentenceId: "lesson-001-404",
      hits: 0,
      stage: "katakana",
    });
  });

  it("records and reads dictation events", async () => {
    const db = new SentenceProgressDB();
    const saved = await db.recordDictationEvent({
      sessionId: "session-1",
      segmentId: "lesson-001-1",
      reductionType: "unknown",
      correct: true,
      attemptsBeforeCorrect: 0,
    });

    expect(saved?.id).toBeTypeOf("number");
    expect(saved?.createdAt).toBeTypeOf("number");

    const events = await db.listDictationEvents("session-1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sessionId: "session-1",
      segmentId: "lesson-001-1",
      reductionType: "unknown",
      correct: true,
      attemptsBeforeCorrect: 0,
    });
  });

  it("filters dictation events by sessionId", async () => {
    const db = new SentenceProgressDB();

    await db.recordDictationEvent({
      sessionId: "session-a",
      segmentId: "lesson-001-1",
      reductionType: "unknown",
      correct: false,
      attemptsBeforeCorrect: 2,
    });
    await db.recordDictationEvent({
      sessionId: "session-b",
      segmentId: "lesson-001-2",
      reductionType: "unknown",
      correct: true,
      attemptsBeforeCorrect: 1,
    });

    const events = await db.listDictationEvents("session-a");
    expect(events).toHaveLength(1);
    expect(events[0]?.sessionId).toBe("session-a");
  });
});

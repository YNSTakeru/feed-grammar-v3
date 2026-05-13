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

class FakeObjectStore {
  constructor(private values: Map<string, StoredValue>) {}

  get(key: string) {
    const request = new FakeIDBRequest<StoredValue | undefined>();
    queueMicrotask(() => {
      request.result = this.values.get(key);
      request.onsuccess?.();
    });
    return request;
  }

  put(value: StoredValue) {
    const request = new FakeIDBRequest<string>();
    queueMicrotask(() => {
      const key = value.sentenceId as string;
      this.values.set(key, value);
      request.result = key;
      request.onsuccess?.();
    });
    return request;
  }

  delete(key: string) {
    const request = new FakeIDBRequest<undefined>();
    queueMicrotask(() => {
      this.values.delete(key);
      request.onsuccess?.();
    });
    return request;
  }
}

class FakeIDBDatabase {
  private stores = new Map<string, Map<string, StoredValue>>();
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  createObjectStore(name: string) {
    this.stores.set(name, new Map());
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
});

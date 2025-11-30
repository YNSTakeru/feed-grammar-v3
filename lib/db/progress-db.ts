// IndexedDB を使用して学習進捗を管理
const DB_NAME = "feed-grammar-progress";
const DB_VERSION = 1;
const STORE_NAME = "completed-articles";

interface CompletedArticle {
  id: number;
  completedAt: number; // timestamp
}

class ProgressDB {
  private db: IDBDatabase | null = null;

  // DBを初期化
  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
    });
  }

  // 記事を完了としてマーク
  async markAsCompleted(articleId: number): Promise<void> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const data: CompletedArticle = {
        id: articleId,
        completedAt: Date.now(),
      };

      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // 記事が完了済みかチェック
  async isCompleted(articleId: number): Promise<boolean> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(articleId);

      request.onsuccess = () => resolve(!!request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 完了済みの記事IDリストを取得
  async getCompletedArticleIds(): Promise<number[]> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result as number[]);
      request.onerror = () => reject(request.error);
    });
  }

  // 記事がアンロック（閲覧可能）かチェック
  // ルール: ID=1は常にアンロック、それ以外は前の記事が完了している必要がある
  async isUnlocked(articleId: number): Promise<boolean> {
    if (articleId === 1) return true;

    // 前の記事（articleId - 1）が完了しているかチェック
    return await this.isCompleted(articleId - 1);
  }

  // 進捗をリセット（開発・デバッグ用）
  async resetProgress(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const progressDB = new ProgressDB();

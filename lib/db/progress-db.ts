// IndexedDB を使用して学習進捗を管理
const DB_NAME = "feed-grammar-progress";
const DB_VERSION = 2; // バージョンアップ: 復習タイミングを追加
const STORE_NAME = "completed-articles";

// エビングハウスの忘却曲線に基づく復習間隔（ミリ秒）
const REVIEW_INTERVALS = [
  1000 * 60 * 60 * 24 * 1, // 1日後
  1000 * 60 * 60 * 24 * 3, // 3日後
  1000 * 60 * 60 * 24 * 7, // 7日後
  1000 * 60 * 60 * 24 * 14, // 14日後
  1000 * 60 * 60 * 24 * 30, // 30日後
];

interface CompletedArticle {
  id: number;
  completedAt: number; // timestamp
  reviewCount: number; // 復習回数
  nextReviewAt: number; // 次回復習日時
  lastReviewedAt: number; // 最終復習日時
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
      const now = Date.now();
      const data: CompletedArticle = {
        id: articleId,
        completedAt: now,
        reviewCount: 0,
        nextReviewAt: now + REVIEW_INTERVALS[0], // 1日後に最初の復習
        lastReviewedAt: now,
      };

      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // 記事が完了済みかチェック（復習期限が来ていない＝まだ理解している状態）
  async isCompleted(articleId: number): Promise<boolean> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(articleId);

      request.onsuccess = () => {
        const result = request.result as CompletedArticle | undefined;
        if (!result) {
          resolve(false);
          return;
        }

        // 次回復習日時が現在時刻より未来 = まだ復習不要 = 完了状態
        const isStillValid = result.nextReviewAt > Date.now();
        resolve(isStillValid);
      };
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

  // 復習が必要な記事かチェック（復習期限が過ぎている）
  async needsReview(articleId: number): Promise<boolean> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(articleId);

      request.onsuccess = () => {
        const result = request.result as CompletedArticle | undefined;
        if (!result) {
          resolve(false);
          return;
        }

        // 次回復習日時が現在時刻より過去 = 復習が必要
        const needsReview = result.nextReviewAt <= Date.now();
        resolve(needsReview);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // 復習完了として記録（復習回数を増やし、次回復習日時を更新）
  async updateReviewStatus(articleId: number): Promise<void> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(articleId);

      getRequest.onsuccess = () => {
        const existing = getRequest.result as CompletedArticle | undefined;
        if (!existing) {
          reject(new Error("Article not found"));
          return;
        }

        const now = Date.now();
        const newReviewCount = existing.reviewCount + 1;
        const intervalIndex = Math.min(
          newReviewCount,
          REVIEW_INTERVALS.length - 1
        );

        const updatedData: CompletedArticle = {
          ...existing,
          reviewCount: newReviewCount,
          nextReviewAt: now + REVIEW_INTERVALS[intervalIndex],
          lastReviewedAt: now,
        };

        const putRequest = store.put(updatedData);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // 復習が必要な記事のIDリストを取得
  async getArticlesNeedingReview(): Promise<number[]> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const now = Date.now();
        const needsReview = (request.result as CompletedArticle[])
          .filter((article) => article.nextReviewAt <= now)
          .map((article) => article.id);
        resolve(needsReview);
      };
      request.onerror = () => reject(request.error);
    });
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

// ユーザーの同意状態を管理するためのlocalStorage wrapper
const CONSENT_KEY = "user-consent-status";

export interface ConsentStatus {
  hasConsented: boolean;
  consentedAt?: number;
  version: string; // ポリシーバージョン
}

export const consentDB = {
  // 同意状態を取得
  getConsent(): ConsentStatus | null {
    if (typeof window === "undefined") return null;

    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (!stored) return null;
      return JSON.parse(stored) as ConsentStatus;
    } catch (error) {
      console.error("Failed to get consent status:", error);
      return null;
    }
  },

  // 同意状態を保存
  setConsent(hasConsented: boolean): void {
    if (typeof window === "undefined") return;

    const status: ConsentStatus = {
      hasConsented,
      consentedAt: hasConsented ? Date.now() : undefined,
      version: "1.0", // ポリシーバージョン
    };

    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(status));
    } catch (error) {
      console.error("Failed to set consent status:", error);
    }
  },

  // 同意状態をクリア
  clearConsent(): void {
    if (typeof window === "undefined") return;

    try {
      localStorage.removeItem(CONSENT_KEY);
    } catch (error) {
      console.error("Failed to clear consent status:", error);
    }
  },
};

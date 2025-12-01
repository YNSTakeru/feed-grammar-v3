"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { consentDB } from "@/lib/db/consent-db";
import { useCallback, useEffect, useState } from "react";

interface ConsentDialogProps {
  onConsent: (consented: boolean) => void;
}

export function ConsentDialog({ onConsent }: ConsentDialogProps) {
  const [open, setOpen] = useState(false);

  const handleConsentCheck = useCallback(() => {
    // クライアントサイドでのみ実行
    const consent = consentDB.getConsent();
    if (consent === null) {
      // 同意状態が未設定の場合はダイアログを表示
      setOpen(true);
    } else {
      // 既に同意状態が保存されている場合
      onConsent(consent.hasConsented);
    }
  }, [onConsent]);

  useEffect(() => {
    handleConsentCheck();
  }, [handleConsentCheck]);

  const handleAccept = () => {
    consentDB.setConsent(true);
    setOpen(false);
    onConsent(true);
  };

  const handleDecline = () => {
    consentDB.setConsent(false);
    setOpen(false);
    onConsent(false);
  };

  return (
    <Dialog open={open} modal>
      <DialogContent
        className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl">
            利用規約とプライバシーポリシー
          </DialogTitle>
          <DialogDescription className="text-base pt-4">
            このアプリケーションをご利用いただく前に、以下の内容をご確認ください。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <section>
            <h3 className="font-bold text-lg mb-2">📊 データの利用について</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              学習進捗を記録・管理するために、ブラウザのIndexedDBとLocalStorageを使用します。
              これらのデータはお使いのブラウザ内にのみ保存され、サーバーには送信されません。
            </p>
          </section>

          <section>
            <h3 className="font-bold text-lg mb-2">🔒 保存される情報</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>完了した記事のID</li>
              <li>学習完了日時</li>
              <li>復習回数と次回復習日時</li>
              <li>この同意状態</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-lg mb-2">
              🎯 エビングハウスの忘却曲線
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              同意いただくと、科学的に証明された復習タイミング（1日後、3日後、7日後、14日後、30日後）で
              学習内容の復習を促す機能が有効になります。これにより効果的な学習が可能になります。
            </p>
          </section>

          <section>
            <h3 className="font-bold text-lg mb-2">❌ 同意しない場合</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              同意されない場合でも、すべてのコンテンツを制限なく閲覧できます。
              ただし、学習進捗の保存や復習機能は利用できません。
            </p>
          </section>

          <section className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              ※ ブラウザのデータを削除すると、保存された学習進捗も削除されます。
              <br />※ 同意状態はブラウザの設定から後で変更できます。
            </p>
          </section>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleDecline}
            className="w-full sm:w-auto"
          >
            同意しない（進捗保存なし）
          </Button>
          <Button onClick={handleAccept} className="w-full sm:w-auto">
            同意する（進捗を保存）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

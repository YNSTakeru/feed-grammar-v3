import React from "react";

interface PhraseBreakdownProps {
  kugiriEng: string;
  kugiriJp: string;
}

// カタカナ文字列を強弱に応じてスタイリング
function renderStyledKatakana(text: string) {
  // 【】は強い発音、〈〉は弱い発音
  const parts: React.ReactElement[] = [];
  let currentIndex = 0;

  // 【strong】と〈weak〉のパターンをマッチ
  const regex = /【([^】]+)】|〈([^〉]+)〉|([^【〈]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      // 【】で囲まれた強い発音
      parts.push(
        <span
          key={currentIndex++}
          className="font-bold text-blue-700 dark:text-blue-300"
        >
          {match[1]}
        </span>
      );
    } else if (match[2]) {
      // 〈〉で囲まれた弱い発音
      parts.push(
        <span
          key={currentIndex++}
          className="font-normal text-blue-400 dark:text-blue-500 opacity-70"
        >
          {match[2]}
        </span>
      );
    } else if (match[3]) {
      // 通常のテキスト
      parts.push(
        <span key={currentIndex++} className="font-medium">
          {match[3]}
        </span>
      );
    }
  }

  return <>{parts}</>;
}

export function PhraseBreakdown({ kugiriEng, kugiriJp }: PhraseBreakdownProps) {
  // スラッシュで分割
  const engParts = kugiriEng.split("/").map((part) => part.trim());
  const jpParts = kugiriJp.split("/").map((part) => part.trim());

  // 配列の長さを合わせる（念のため）
  const maxLength = Math.max(engParts.length, jpParts.length);

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg p-6 border-2 border-blue-200 dark:border-blue-800">
      <h3 className="text-lg font-bold mb-4 text-blue-900 dark:text-blue-100">
        📖 フレーズの区切りと発音
      </h3>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: maxLength }).map((_, index) => {
          const eng = engParts[index] || "";
          const jp = jpParts[index] || "";

          // <> で囲まれた消えた音を抽出
          const silentMatch = eng.match(/＜(.+?)＞|<(.+?)>/);
          const silentSound = silentMatch
            ? silentMatch[1] || silentMatch[2]
            : null;
          // 消えた音を除いた部分
          const mainEng = silentSound
            ? eng.replace(/＜.+?＞|<.+?>/, "").trim()
            : eng;

          return (
            <div key={index} className="flex flex-col items-center gap-2">
              {/* メインのカード部分 */}
              <div className="flex flex-col items-center bg-white dark:bg-gray-800 rounded-md px-4 py-3 shadow-sm border border-blue-100 dark:border-blue-900 min-w-[80px] hover:shadow-md transition-shadow">
                <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1 text-center">
                  {renderStyledKatakana(jp)}
                </div>
                <div className="text-gray-400 dark:text-gray-600 text-xs mb-1">
                  /
                </div>
                <div className="text-base font-semibold text-gray-800 dark:text-gray-200 text-center">
                  {mainEng}
                </div>
              </div>

              {/* 消えた音（カードの外に表示） */}
              {silentSound && (
                <div className="text-xs text-gray-500 dark:text-gray-400 italic bg-gray-100 dark:bg-gray-800/50 px-2 py-1 rounded border border-dashed border-gray-300 dark:border-gray-600">
                  消えた音: {silentSound}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

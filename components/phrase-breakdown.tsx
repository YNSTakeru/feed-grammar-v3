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
        </span>,
      );
    } else if (match[2]) {
      // 〈〉で囲まれた弱い発音
      parts.push(
        <span
          key={currentIndex++}
          className="font-normal text-blue-400 dark:text-blue-500 opacity-70"
        >
          {match[2]}
        </span>,
      );
    } else if (match[3]) {
      // 通常のテキスト
      parts.push(
        <span key={currentIndex++} className="font-medium">
          {match[3]}
        </span>,
      );
    }
  }

  return <>{parts}</>;
}

export function PhraseBreakdown({ kugiriEng, kugiriJp }: PhraseBreakdownProps) {
  // kugiriEng/kugiriJp が未定義の場合は何も表示しない
  if (!kugiriEng || !kugiriJp) {
    return null;
  }

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

          // 途中に消えた音がある場合を検出 (例: have ＜to＞ do)
          const middleMatch = eng.match(/(.+?)\s*(＜.+?＞|<.+?>)\s*(.+)/);
          let silentSound = null;
          let silentPosition: "before" | "after" | "middle" = "after";
          let mainEng = eng;
          let beforeText = "";
          let afterText = "";

          if (middleMatch) {
            // 途中に消えた音がある
            silentSound = middleMatch[2].replace(/[＜＞<>]/g, "");
            silentPosition = "middle";
            beforeText = middleMatch[1].trim();
            afterText = middleMatch[3].trim();
            mainEng = `${beforeText} ${afterText}`;
          } else {
            // 前後の消えた音を検出
            const silentMatch = eng.match(
              /^(＜.+?＞|<.+?>)|(.+?)(＜.+?＞|<.+?>)$/,
            );
            if (silentMatch) {
              if (silentMatch[1]) {
                // 先頭に消えた音がある
                silentSound = silentMatch[1].replace(/[＜＞<>]/g, "");
                silentPosition = "before";
                mainEng = eng.replace(/^(＜.+?＞|<.+?>)/, "").trim();
              } else if (silentMatch[3]) {
                // 末尾に消えた音がある
                silentSound = silentMatch[3].replace(/[＜＞<>]/g, "");
                silentPosition = "after";
                mainEng = silentMatch[2].trim();
              }
            }
          }

          return (
            <div key={index} className="flex flex-col items-center gap-1">
              {/* 前に消えた音 */}
              {silentSound && silentPosition === "before" && (
                <div className="flex flex-col items-center">
                  <div className="text-[10px] text-orange-600 dark:text-orange-400 font-bold bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-full border border-orange-300 dark:border-orange-700">
                    {silentSound}
                  </div>
                  <div className="text-[9px] text-orange-600 dark:text-orange-400 font-medium whitespace-nowrap">
                    の音は消えている
                  </div>
                  <div className="text-orange-500 dark:text-orange-400 text-xs">
                    ↓
                  </div>
                </div>
              )}

              {/* メインのカード部分 */}
              <div className="flex flex-col items-center bg-white dark:bg-gray-800 rounded-md px-4 py-3 shadow-sm border border-blue-100 dark:border-blue-900 min-w-[80px] hover:shadow-md transition-shadow">
                <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1 text-center">
                  {renderStyledKatakana(jp)}
                </div>
                <div className="text-gray-400 dark:text-gray-600 text-xs mb-1">
                  /
                </div>
                {silentPosition === "middle" ? (
                  <div className="text-base font-semibold text-gray-800 dark:text-gray-200 text-center flex items-center gap-1">
                    <span>{beforeText}</span>
                    <span className="relative inline-flex flex-col items-center mx-1">
                      <span className="text-[8px] text-orange-600 dark:text-orange-400 font-bold bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded-full border border-orange-300 dark:border-orange-700 whitespace-nowrap">
                        {silentSound}
                      </span>
                      <span className="text-[7px] text-orange-600 dark:text-orange-400 absolute -bottom-3 whitespace-nowrap">
                        消音
                      </span>
                    </span>
                    <span>{afterText}</span>
                  </div>
                ) : (
                  <div className="text-base font-semibold text-gray-800 dark:text-gray-200 text-center">
                    {mainEng}
                  </div>
                )}
              </div>

              {/* 後ろに消えた音 */}
              {silentSound && silentPosition === "after" && (
                <div className="flex flex-col items-center">
                  <div className="text-orange-500 dark:text-orange-400 text-xs">
                    ↓
                  </div>
                  <div className="text-[9px] text-orange-600 dark:text-orange-400 font-medium whitespace-nowrap">
                    の音は消えている
                  </div>
                  <div className="text-[10px] text-orange-600 dark:text-orange-400 font-bold bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-full border border-orange-300 dark:border-orange-700">
                    {silentSound}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

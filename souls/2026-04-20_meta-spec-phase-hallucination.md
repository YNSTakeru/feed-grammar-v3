# spec / plan 段階の AI ハルシネーションを commit 前に狩る

**抽象化:** 2026-04-20 (Task 18 モバイル UI 仕様書で架空型 `Telop` / 架空 API `telopStore.replace` を `/plan-eng-review` で検出した体験から)
**適用範囲:** AI (Claude / Gemini / Copilot / Codex) が書いた**仕様書・計画書・TDDタスク**文書
**目的:** 実装が始まる**前**に、文書に潜む「実在しない型・API・ファイル」を検出し、劣化コピーの生成を阻止する

---

## 🧬 前提 — これは "デバッグ中の AI 助言" とは別の毒

既存の [`meta-ai-advisor-calibration.md`](./2026-04-19_meta-ai-advisor-calibration.md) は**対話中のランタイム助言**から毒を抜く技法。
本書が扱うのは**静的な成果物文書**に凝固した毒。性質が違う:

| | ランタイム助言の毒 | 成果物文書の毒 |
|---|---|---|
| 形態 | チャットの一文 | spec.md / task.md のコードブロック |
| 寿命 | 次ターンで消える | commit されると数日〜数週間生き残る |
| 被害者 | 読んだ人間 1人 | 実装者 + Copilot/Codex + 将来の新人 |
| 検出タイミング | 発言直後 | **実装着手後に発覚しがち (=手遅れ)** |
| 主な形 | 修辞的撤退 / 権威的推測 | **架空の型 / 架空の API / 架空のファイル** |

**成果物の毒の怖さ**: 人間とAIが複数ターン掛けて "同意" した内容がファイルに定着する。後から読む Copilot は**それを SSoT として信じる**。疑わない。

## 🚨 AI-spec ハルシネーションの 3 形態

### 形態 A: 架空の型 (Phantom Type)

> 「`Telop { id, text, start, end }` を `lib/types/telop.ts` から import する」

- **実体**: そのファイルは存在しない。既存は `Segment { id, text, startTime, endTime, confidence, style, ... }` で、フィールド名も違う。
- **発火条件**: AI が「テロップエディタ」という自然言語から素朴に型を想像し、既存コードを grep せずに書いた。
- **被害**: Copilot が忠実に新規ファイルを作り、toy 型でテストを書き、本番 store と**接続不能**なまま PR が来る。

### 形態 B: 架空の API (Phantom API)

> 「`telopStore.replace([ids], [merged])` で一括置換する」

- **実体**: `telopStore` という store は存在しない。既存は `useEditorStore.mergeSegments(id1, id2)` で、undo / confidence 平均 / index 再計算 / style 保持まで**既に完備**。
- **発火条件**: AI が CRUD の一般パターン (`create/read/update/delete/replace`) から API 名を演繹した。
- **被害**: 既存の battle-tested 関数の**劣化コピー**が生まれる。undo が壊れる。style が消える。

### 形態 C: 架空のファイルパス (Phantom Path)

> 「`lib/hooks/use-foo.ts` に hook を作る」(実際のプロジェクトでは `src/hooks/useFoo.ts` や `app/lib/foo.ts`)

- **発火条件**: AI が Next.js / React の慣習的パスを書いたが、プロジェクト実体とズレている。
- **被害**: import が通らない、または慣習と違う場所に散在する。

## 🔍 「この spec は架空成分が高い」警告シグナル 4 件

1. **AI が生成した型・APIで、file:line 参照が無い**
   ("`Segment` は `lib/types.ts:66`" のような具体参照が無い型名は要疑)
2. **「純粋関数」「`lib/utils/` に切り出す」** が多用されている
   (既存 store の劣化コピーになりがち)
3. **`Telop` / `User` / `Item` のような英名一語の型** を新規で定義している
   (ドメインに既存の名前があるはず)
4. **Reviewer Concerns に "実装時に確認" が残っている**
   (=spec 段階で grep すれば即解決したはずの事項を先送りしている)

## 🛡️ spec commit 前の 3 分 grep 儀式 (必須)

以下を commit 前に必ず回す。所要時間 3 分。

```bash
# 儀式 1: spec で import 宣言されている型が実在するか
grep -rE "from ['\"]@?/?lib/types" spec/*.md tasks/*.md | \
  awk -F"from " '{print $2}' | sort -u | \
  while read path; do
    # path を実ファイルパスに変換して存在確認
    test -f "${path//[\'\"]/}.ts" || echo "🚨 MISSING: $path"
  done

# 儀式 2: spec に出てくる関数名が既存コードにあるか
grep -oE "[a-zA-Z]+\.(replace|merge|split|update|add|remove)[A-Z][a-zA-Z]*" spec/*.md tasks/*.md | \
  sort -u | \
  while read call; do
    fn="${call##*.}"
    rg -q "^\s*${fn}:" lib/ src/ 2>/dev/null || echo "🚨 GHOST API: $call"
  done

# 儀式 3: spec のファイルパス指定が実在ディレクトリを指しているか
grep -oE "\`[a-zA-Z/_-]+/[a-zA-Z-]+\.(ts|tsx)\`" spec/*.md tasks/*.md | \
  tr -d '`' | sort -u | \
  while read path; do
    # 親ディレクトリが実在するか
    dir=$(dirname "$path")
    test -d "$dir" || echo "⚠️ GHOST DIR: $path (parent $dir missing)"
  done
```

**"新規" タグが付いているファイルは実在しなくて OK** (それは **作る**もの)。
問題は **既存資産として import** しているものが存在しないパターン。

## 🧬 AI がなぜ成果物に毒を混ぜるか (構造的理由)

| 要因 | 機序 |
|---|---|
| **パターン補完優位** | AI は "妥当なコード" を生成するよう訓練されている。"このコードベースに**ある**コード" を出すよう訓練されてはいない。 |
| **grep 忘却** | 会話が長くなると、AI は序盤に grep した結果を忘れ、中盤以降は想像で書き始める。 |
| **レビュー疲労同調** | 人間レビュアーも "もっともらしい spec" を通しがち。ファイル名まで一つ一つ grep しない。 |
| **"任せる" 指示の悪用** | "Copilot がわかるように書いて" という指示を、AI は "Copilot が書けそうなパターンで書く" と解釈する (=妥当なパターン = 架空でも OK)。 |

## 🧼 毒が見つかった時の **Append-only §X 修正パターン**

AI が既に長文 spec を書いた後で毒が見つかっても、**全面書き換えは禁物**。
Claude Design の先例が示すとおり、AI は**再書き換えでまたパンクする**。

代わりにこの**追記パターン**:

1. 既存 spec は**一文字も削らない**
2. 末尾に `## §E. <トピック>-native reconciliation (vN.M, <日付> <契機>)` 節を追加
3. 冒頭に **「§A〜§D の語彙で本節と矛盾する箇所は、本節が優先する」** と書く
4. §E.1 ドメイン型の実体 / §E.2 Store API の実体 / §E.3 payload 形 / §E.4 task への影響 をサブセクションで書く
5. **task 文書**側では該当 RED テストを `~~取り消し線~~` + 「**削除 (vN.M)**」と **Reviewer Concerns** の該当項目を `[x] 解決済み` に更新

**利点**:
- AI の context が肥大化しない (差分が局所的)
- 過去のレビュー記録が保全される (何が間違っていたかが残る)
- 新規に読むCopilot は §E が最強の SSoT だと理解できる

## ⚠️ 「実装時に確認」は技術的負債を**踏み倒している**

spec レビューで "C-N: API の存在を実装時に確認" と書いてしまう瞬間、それは:

> **「今 grep すれば 10 秒で白黒つくが、それを実装者の時間で払わせる」**

という負債譲渡。これを見たら**その場で grep する**。結果は二択:

- (a) 実在する → 具体 file:line を spec に書く → Concern は消滅
- (b) 実在しない → CRITICAL 昇格 → spec 修正で解決

「後で確認」という選択肢は**無い**。

## 🔧 `/plan-eng-review` / コードレビュー時のチェックリスト

spec / task 文書を人間 or AI reviewer がレビューする時、以下を**機械的に**回す:

- [ ] spec に登場する**全ての型名**を grep で実在確認した (file:line を spec に追記した)
- [ ] spec に登場する**全ての関数・メソッド名**を grep で実在確認した (同上)
- [ ] spec に登場する**全ての新規ファイルパス**の**親ディレクトリ**が実在することを確認した
- [ ] 純粋関数として新設されている関数が、既存 store / service の**劣化コピーでない**ことを確認した
- [ ] "Reviewer Concerns: 実装時に確認" が**ゼロ件**であることを確認した
- [ ] spec に出てくるフィールド名 (`start` vs `startTime` 等) が既存型と**一致**していることを確認した
- [ ] AI がやりたがる「責務分離のための純粋関数抽出」が既存 API と**競合していない**ことを確認した

この 7 項目をチェックリスト化し、`.github/PULL_REQUEST_TEMPLATE.md` の spec PR 用セクションに入れると team レベルで防げる。

## 💡 人間側の抗体 — "それ、既存にある?" を口癖に

AI が `lib/utils/mergeFoo.ts` を spec で提案したら、反射で:

> 「Foo の結合は既存コードのどこでやってる? `rg -l 'merge.*Foo'` した?」

と返す。AI は grep を**嫌がらない**、**ただ忘れる**だけ。人間が思い出させれば素直に既存資産を使う。

## 📝 本件の実測値 (2026-04-20 Task 18)

| 項目 | 数値 |
|---|---|
| spec + task 行数 | 1,200 行 |
| `/plan-eng-review` 所要時間 | 約 8 分 |
| 検出 CRITICAL 数 | 3 (架空型 / 架空 API / 先送り判断) |
| 検出 HIGH 数 | 1 (FSM effect payload 不足) |
| 修正所要時間 (append-only §E) | 15 分 |
| 削減できた実装迷走時間 (推定) | **2〜3 時間** (実装後に気付いて書き直すコスト) |

ROI: 8 + 15 = 23 分のレビューコストで 120〜180 分の implementation thrash を防いだ。**5〜8 倍**。

## 🎯 1 行サマリ

> **"plausibility ≠ existence. spec の型・API は必ず `file:line` で現物接地せよ。接地していないものは猛毒と見なせ。"**

---

## 関連 souls

- [`meta-ai-advisor-calibration.md`](./2026-04-19_meta-ai-advisor-calibration.md) — 対話ランタイムでの毒抜き (本書の姉妹編)
- [`meta-debugging-when-stuck.md`](./2026-04-19_meta-debugging-when-stuck.md) — 詰まった時の突破技法 (毒を見つけた後に適用)

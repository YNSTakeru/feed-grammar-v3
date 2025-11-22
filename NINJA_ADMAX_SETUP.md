# 忍者AdMaxの設定手順

## 1. 忍者AdMaxのアカウント登録とサイト登録
1. [忍者AdMax](https://www.ninja.co.jp/admax/)にアクセス
2. アカウントを作成
3. サイトを登録してメディア承認を待つ

## 2. 広告枠の作成
1. 忍者AdMaxの管理画面で「広告枠を作る」を選択
2. サイトを選択
3. 広告サイズを選択（推奨: レスポンシブ、または 300x250）
4. 広告コードが発行されます

## 3. 広告スポットIDの確認
広告コードは以下のような形式です：
```html
<script type="text/javascript">
    (adsbygoogle = window.adsbygoogle || []).push({});
</script>
<div class="admax-ads" data-admax-id="XXXXXXXXXXXXXXXX" style="display:inline-block;width:300px;height:250px;"></div>
```

`data-admax-id="XXXXXXXXXXXXXXXX"` の部分が**広告スポットID**です。

## 4. 環境変数の設定
`.env.local`ファイルを開いて、以下のように広告スポットIDを設定します：

```env
NEXT_PUBLIC_ADMAX_SPOT_ID=XXXXXXXXXXXXXXXX
```

XXXXXXXXXXXXXXXXの部分を、実際の広告スポットIDに置き換えてください。

## 5. 開発サーバーの再起動
環境変数を変更したら、開発サーバーを再起動します：

```bash
npm run dev
```

## 6. 広告の表示確認
- 各記事ページの上部と下部に広告が表示されます
- 開発環境では広告が表示されない場合があります（本番環境で確認してください）

## 7. プライバシーポリシーの確認
プライバシーポリシーページ (`/privacy`) が作成されています。
必要に応じて内容を調整してください。

## 注意事項
- 忍者AdMaxの利用規約を確認してください
- 広告の配置場所や数には制限がある場合があります
- 広告収益を得るには、サイトの審査に合格する必要があります

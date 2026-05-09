# HANDOVER — 引き継ぎドキュメント

**プロジェクト**: WHALON 議事録AI デモ  
**目的**: 営業デモ用。顧客に「AIで議事録が作れる」を体験させる。  
**想定読者**: 次の開発担当者

---

## アーキテクチャ概要

```
[ブラウザ]
  index.html / style.css / app.js
    ↓ POST /api/generate-minutes（会議ログのみ送信）
[Vercel Serverless Function]
  api/generate-minutes.js
    ↓ APIキー付きHTTPリクエスト（環境変数から読む）
[AIプロバイダー]
  Anthropic / OpenAI / Gemini
    ↓ JSONレスポンス
[ブラウザに返却]
```

**重要**: APIキーはVercel環境変数にのみ存在。フロント・ログには一切出ない。

---

## 主要な実装判断と理由

### 1. プロバイダー層の分離（api/generate-minutes.js）

```js
// AI_PROVIDER 環境変数で切替
switch (provider) {
  case 'anthropic': return callAnthropic(prompt);
  case 'openai':    return callOpenAI(prompt);
  case 'gemini':    return callGemini(prompt);
}
```

**理由**: 将来的にモデルコスト・精度を比較して切り替えたいため。  
新プロバイダー追加は `callXxx()` 関数を1つ追加するだけ。

### 2. デモ上限（3回）をlocalStorageで管理

**理由**: サーバー側でセッション・ユーザー管理するコストを省略。  
デモ用なので、ブラウザを変えれば再利用できる仕様は許容。

**本番移行時の変更点**:  
- サーバー側にIPベースまたはメールアドレスベースのレート制限を追加
- もしくは認証フローを導入

### 3. 会議ログ本文の非保存

`console.log` にも会議ログを出力していない。  
理由: 顧客の機微情報を誤ってログに残さないため。

### 4. JSONプロンプト設計

AIに対してJSONのみ返答させる設計。  
`parseMinutesJSON()` でコードブロック除去・切り出しを行い堅牢にパース。

---

## よくある問題と対処

### API呼び出しが500エラーになる

1. Vercel環境変数に `ANTHROPIC_API_KEY` が設定されているか確認
2. `AI_PROVIDER` の値が `anthropic` / `openai` / `gemini` のどれかか確認
3. Vercelのログ（Functions タブ）で詳細エラーを確認

### AIがJSONを返さない（パース失敗）

- プロンプト末尾の「必ずJSONのみを返すこと」の強調を増やす
- モデルを変更する（claude-opus など）
- `parseMinutesJSON()` のフォールバック処理を強化する

### デモ上限を強制リセットしたい（開発時）

ブラウザのコンソールで:
```js
localStorage.removeItem('whalon_demo_uses')
location.reload()
```

---

## 今後の拡張候補

| 優先度 | 機能 | 概要 |
|---|---|---|
| 高 | PDF/Word出力 | 生成した議事録をダウンロードできる |
| 高 | Notion連携 | 生成後にNotionページとして保存 |
| 中 | Slack連携 | Slack会議ログの自動取得 |
| 中 | 認証フロー | メールアドレスで3回→無制限に |
| 低 | 多言語対応 | 英語ログ→日本語議事録 |
| 低 | 音声入力 | Whisper APIで音声を文字起こし→生成 |

---

## 依存関係

- **Vercel**: ホスティング + Serverless Functions（Node.js 18+）
- **外部ライブラリ**: なし（Vanilla JS + CSS）
- **フォント**: Google Fonts（Noto Sans JP, Space Grotesk）

npm パッケージは使用していない。`package.json` 不要。

---

## コンタクト

初期開発: WHALON  
引き継ぎ先: info@whalon.jp

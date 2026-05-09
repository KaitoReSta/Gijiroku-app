# WHALON 議事録AI — デモ

会議ログを貼り付けるだけで、提出用議事録を自動生成するAIツールです。  
WHALONの営業デモ用アプリケーションです。

---

## 🚀 セットアップ（Vercel）

### 1. リポジトリをVercelにデプロイ

```bash
npm i -g vercel
vercel
```

### 2. 環境変数を設定

Vercel ダッシュボード → Settings → Environment Variables に以下を追加：

| 変数名 | 値 | 必須 |
|---|---|---|
| `AI_PROVIDER` | `anthropic` | ✅ |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | ✅ |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | ✅ |

> ローカル開発時は `.env.example` を `.env` にコピーして値を記入してください。

### 3. 動作確認

```bash
vercel dev
# http://localhost:3000 でアクセス
```

---

## 📁 ファイル構成

```
/
├── index.html              # メインUI（日本語）
├── style.css               # スタイル（ダークテーマ）
├── app.js                  # フロントエンドロジック
├── api/
│   └── generate-minutes.js # Vercel API Route（AIプロバイダー層含む）
├── .env.example            # 環境変数テンプレート
├── README.md               # このファイル
└── HANDOVER.md             # 引き継ぎドキュメント
```

---

## 🔧 AIプロバイダー切替

`AI_PROVIDER` 環境変数を変更するだけで切り替えられます：

```
AI_PROVIDER=anthropic   # Claude（デフォルト）
AI_PROVIDER=openai      # GPT-4o
AI_PROVIDER=gemini      # Gemini 1.5 Pro
```

対応するAPIキーも合わせて設定してください。

---

## 🔒 セキュリティ設計

- **APIキーはフロントエンドに置かない**（Vercel環境変数のみ）
- **会議ログは保存しない**（リクエスト処理後に廃棄）
- **デモ利用回数はブラウザlocalStorageで管理**（サーバー側記録なし）

---

## 📋 出力項目

| 項目 | 内容 |
|---|---|
| 会議名 | ログから推定 |
| 日付 | ログから推定 |
| 参加者 | ログから抽出 |
| 会議概要 | 2〜4文で要約 |
| 決定事項 | 箇条書き |
| 議論内容 | 文章形式 |
| TODO | タスク / 担当者 / 期限 |
| 未確定事項 | 箇条書き |
| 次回確認事項 | 箇条書き |
| 上司提出用まとめ | 3〜5文の要約 |

---

## 📞 お問い合わせ

WHALON: info@whalon.jp

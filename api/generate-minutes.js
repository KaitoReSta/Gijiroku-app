/**
 * WHALON 議事録AI — api/generate-minutes.js
 * Vercel Serverless Function (Node.js 18+)
 *
 * - Provider層を分離：anthropic / openai / gemini 切替可能
 * - APIキーはサーバーサイドの環境変数のみで管理
 * - 会議ログ本文はサーバー側でも保存しない
 * - レスポンスにprovider/modelを含める（フロントのlogUsage用）
 */

'use strict';

/* ─────────────────────────────────
   Provider層
───────────────────────────────── */

async function callAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model  = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API Error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return { text: data.content?.[0]?.text ?? '', model };
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model  = process.env.OPENAI_MODEL || 'gpt-4o';

  if (!apiKey) throw new Error('OPENAI_API_KEY が設定されていません');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API Error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? '', model };
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model  = process.env.GEMINI_MODEL || 'gemini-1.5-pro';

  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API Error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
    model,
  };
}

/* ─────────────────────────────────
   Provider Dispatcher
───────────────────────────────── */
async function callAI(prompt) {
  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();

  switch (provider) {
    case 'anthropic': {
      const result = await callAnthropic(prompt);
      return { ...result, provider: 'anthropic' };
    }
    case 'openai': {
      const result = await callOpenAI(prompt);
      return { ...result, provider: 'openai' };
    }
    case 'gemini': {
      const result = await callGemini(prompt);
      return { ...result, provider: 'gemini' };
    }
    default:
      throw new Error(`未対応のAI_PROVIDER: ${provider}`);
  }
}

/* ─────────────────────────────────
   プロンプト構築
───────────────────────────────── */
function buildPrompt(log) {
  return `あなたは日本企業の上席者に提出する議事録を作成する専門家です。
以下の会議ログをもとに、上司がそのまま読める完成品の議事録をJSON形式で作成してください。

## あなたの役割と品質基準

この議事録は「完成品」として扱います。
- 受け取った上司が追記・修正なしで承認できる品質を目指してください
- 口語・発言の断片・曖昧な表現は、すべて正式なビジネス文語に変換してください
- 「〜と思います」「〜じゃないですか」「〜みたいな感じ」等の表現は、確定的・明確な文に書き直してください
- 主語・目的語が省略されている箇所は、文脈から補完して明示してください
- 「たぶん」「おそらく」「一応」等の曖昧語は、文脈に応じて確定表現または「未確認事項」に分類してください

## 出力形式（このJSONのみを返すこと。コードブロック・説明文・前置き一切不要）

{
  "meeting_name": "会議名（ログから推定。推定不能な場合は「社内会議」）",
  "date": "開催日（ログから推定。形式：YYYY年MM月DD日。推定不能な場合は「未確認」）",
  "attendees": "参加者氏名をカンマ区切りで列挙（推定不能な場合は「未確認」）",
  "overview": "会議の目的・背景・結果を3〜4文のビジネス文語で記載。口語禁止。",
  "decisions": [
    "決定事項を完結したビジネス文で記載。主語を明示すること。例：「来期の広告予算を前年比120%に増額することが決定した。」"
  ],
  "discussion": "議論の経緯・論点・結論を4〜6文のビジネス文語で記載。口語・発言の羅列禁止。段落として読める文章にすること。",
  "todos": [
    {
      "task": "タスクを動詞で始まる完結した文で記載。例：「広告予算案を作成し、承認を得る」",
      "assignee": "担当者名（ログに明記がない場合は「未確認」。「誰か」「担当者」等の曖昧表記は使わない）",
      "deadline": "期限（ログに明記がある場合は「YYYY年MM月DD日」形式。明記がない場合は「未確認」。「なるべく早く」等の曖昧表記は使わない）"
    }
  ],
  "unresolved": [
    "会議中に結論が出なかった事項を「〜については未確認」の形式で記載。曖昧なまま流れた議題を必ず拾うこと。"
  ],
  "next_check": [
    "次回会議または次のアクションで確認すべき事項を「〜を確認する」の形式で記載。"
  ],
  "summary": "上司が30秒で会議の全体像を把握できる3〜5文のビジネス文語による要約。会議の目的・主な決定事項・次のアクションを含めること。冒頭は「本会議では」で始めること。"
}

## 厳守事項
- JSON形式のみ返答すること（\`\`\`json 等のコードブロック不要）
- 口語・話し言葉・発言録の引用は一切禁止。すべてビジネス文語に変換すること
- todos の assignee と deadline は、不明でも必ずフィールドを出力し「未確認」とすること
- 情報がない配列項目は空配列 [] とすること（「なし」「特になし」の文字列禁止）
- 個人名・社名・数値はログに記載されたものを正確に使用すること
- 推測で事実を作らないこと。ログにない情報は「未確認」とすること

## 会議ログ
${log}`;
}

/* ─────────────────────────────────
   JSONパース（堅牢版）
───────────────────────────────── */
function parseMinutesJSON(raw) {
  let cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  return JSON.parse(cleaned);
}

/* ─────────────────────────────────
   入力サニタイズ
───────────────────────────────── */
function sanitizeLog(log) {
  if (typeof log !== 'string') throw new Error('会議ログが不正な形式です');
  const trimmed = log.trim();
  if (trimmed.length < 10)   throw new Error('会議ログが短すぎます');
  if (trimmed.length > 8000) throw new Error('会議ログが長すぎます（8,000文字以内）');
  return trimmed;
}

/* ─────────────────────────────────
   Vercel Handler
───────────────────────────────── */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { log } = req.body ?? {};
    const sanitized = sanitizeLog(log);
    const prompt    = buildPrompt(sanitized);

    const { text: rawResponse, provider, model } = await callAI(prompt);

    let minutes;
    try {
      minutes = parseMinutesJSON(rawResponse);
    } catch (e) {
      console.error('[WHALON] JSON parse failed:', rawResponse.slice(0, 200));
      return res.status(500).json({ error: 'AIの応答の解析に失敗しました。もう一度お試しください。' });
    }

    // 会議ログ本文は保存・ログ出力しない
    console.log(`[WHALON] Generated. provider=${provider} model=${model}`);

    // provider/modelをフロントに返す（logUsage用）
    return res.status(200).json({ minutes, provider, model });

  } catch (err) {
    console.error('[WHALON] Error:', err.message);
    return res.status(500).json({ error: err.message || '予期しないエラーが発生しました' });
  }
}

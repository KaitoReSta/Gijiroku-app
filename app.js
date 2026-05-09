/**
 * WHALON 議事録AI — app.js
 *
 * - Vercel API Route (/api/generate-minutes) 経由でAI呼び出し
 * - APIキーはフロント側に一切持たない
 * - 利用回数はlocalStorageで管理（3回上限）
 * - logUsage() で利用ログを記録（将来Sheets/Supabase接続可能）
 */

'use strict';

/* ─────────────────────────────────
   定数
───────────────────────────────── */
const MAX_USES     = 3;
const STORAGE_KEY  = 'whalon_demo_uses';
const API_ENDPOINT = '/api/generate-minutes';

// 相談リンク：Googleフォーム / 公式LINE / 問い合わせフォームに差し替える
const CONSULT_URL  = '#';

/* ─────────────────────────────────
   DOM参照
───────────────────────────────── */
const $log        = () => document.getElementById('meeting-log');
const $genBtn     = () => document.getElementById('generate-btn');
const $loading    = () => document.getElementById('loading');
const $inputSec   = () => document.getElementById('input-section');
const $outputSec  = () => document.getElementById('output-section');
const $output     = () => document.getElementById('minutes-output');
const $ctaBanner  = () => document.getElementById('cta-banner');
const $limitMsg   = () => document.getElementById('limit-overlay');
const $charNow    = () => document.getElementById('char-now');
const $usageCount = () => document.getElementById('usage-count');
const $usageFill  = () => document.getElementById('usage-fill');
const $usageLeft  = () => document.getElementById('usage-left');

/* ─────────────────────────────────
   利用ログ記録
   将来的にここをGoogle Sheets / Supabase / Gmail通知に差し替える
───────────────────────────────── */
function logUsage({
  status,       // 'success' | 'error'
  charCount,    // 入力文字数（number）
  remainUses,   // 残り利用回数（number）
  errorMessage, // エラー内容（string | null）
  provider,     // AIプロバイダー名（string）
  model,        // モデル名（string）
}) {
  const entry = {
    timestamp:    new Date().toISOString(),
    status,
    charCount,
    remainUses,
    errorMessage: errorMessage ?? null,
    provider,
    model,
  };

  // ── 現在はconsole.logのみ ──────────────────────
  console.log('[WHALON] Usage Log:', entry);

  // ── 将来の差し替えポイント ──────────────────────
  // Google Sheets例：
  // fetch('/api/log-usage', { method: 'POST', body: JSON.stringify(entry) })
  //
  // Supabase例：
  // supabase.from('usage_logs').insert(entry)
  //
  // Gmail通知例：
  // fetch('/api/notify', { method: 'POST', body: JSON.stringify(entry) })
}

/* ─────────────────────────────────
   利用回数管理
───────────────────────────────── */
function getUses() {
  const v = localStorage.getItem(STORAGE_KEY);
  return v ? parseInt(v, 10) : 0;
}

function incrementUses() {
  const n = getUses() + 1;
  localStorage.setItem(STORAGE_KEY, String(n));
  return n;
}

function getRemain(uses) {
  return Math.max(MAX_USES - uses, 0);
}

function updateUsageUI(uses) {
  const remain = getRemain(uses);
  const pct    = Math.min((uses / MAX_USES) * 100, 100);

  // カウント表示
  $usageCount().textContent = `${uses} / ${MAX_USES} 回使用`;

  // 残り回数表示
  const leftEl = $usageLeft();
  if (leftEl) {
    if (remain === 0) {
      leftEl.textContent = '残り 0 回（上限に達しました）';
      leftEl.style.color = '#f0704b';
    } else {
      leftEl.textContent = `残り ${remain} 回`;
      leftEl.style.color = remain === 1 ? '#f0a04b' : 'var(--accent2)';
    }
  }

  // プログレスバー
  $usageFill().style.width = `${pct}%`;
  if (uses >= MAX_USES) {
    $usageFill().style.background = '#f0704b';
  } else if (uses === MAX_USES - 1) {
    $usageFill().style.background = '#f0a04b';
  }

  // 生成ボタン制御
  if (uses >= MAX_USES) {
    $genBtn().disabled = true;
  }
}

/* ─────────────────────────────────
   文字数カウント
───────────────────────────────── */
function initCharCount() {
  const ta = $log();
  if (!ta) return;
  ta.addEventListener('input', () => {
    const len = ta.value.length;
    $charNow().textContent = len.toLocaleString();
    $charNow().style.color = len > 7000 ? '#f0704b' : '';
  });
}

/* ─────────────────────────────────
   相談ボタンのリンクを一括設定
───────────────────────────────── */
function initConsultLinks() {
  document.querySelectorAll('[data-consult-link]').forEach(el => {
    el.href = CONSULT_URL;
  });
}

/* ─────────────────────────────────
   議事録生成メイン
───────────────────────────────── */
async function generateMinutes() {
  const logText = $log().value.trim();

  // バリデーション
  if (!logText) {
    showToast('会議ログを入力してください');
    $log().focus();
    return;
  }
  if (logText.length < 30) {
    showToast('会議ログが短すぎます（30文字以上）');
    return;
  }

  // 利用回数チェック
  const uses = getUses();
  if (uses >= MAX_USES) {
    showLimitUI();
    return;
  }

  // UI: ローディング開始
  $genBtn().disabled = true;
  $inputSec().classList.add('hidden');
  $loading().classList.remove('hidden');
  $outputSec().classList.add('hidden');

  // provider / model（APIレスポンスがあれば上書き）
  let provider = 'anthropic';
  let model    = 'claude-sonnet-4-20250514';

  try {
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log: logText }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'サーバーエラー' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();

    if (data.provider) provider = data.provider;
    if (data.model)    model    = data.model;

    const minutes = data.minutes;
    if (!minutes) throw new Error('議事録データが取得できませんでした');

    // カウントアップ
    const newUses = incrementUses();
    const remain  = getRemain(newUses);
    updateUsageUI(newUses);

    // 利用ログ記録（成功）
    logUsage({
      status:       'success',
      charCount:    logText.length,
      remainUses:   remain,
      errorMessage: null,
      provider,
      model,
    });

    // 出力表示
    renderMinutes(minutes);
    $loading().classList.add('hidden');
    $outputSec().classList.remove('hidden');

    // 3回到達でCTA表示
    if (newUses >= MAX_USES) {
      $ctaBanner().classList.remove('hidden');
    }

    setTimeout(() => {
      $outputSec().scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

  } catch (err) {
    const currentUses = getUses();

    // 利用ログ記録（失敗）
    logUsage({
      status:       'error',
      charCount:    logText.length,
      remainUses:   getRemain(currentUses),
      errorMessage: err.message,
      provider,
      model,
    });

    $loading().classList.add('hidden');
    $inputSec().classList.remove('hidden');

    if (currentUses < MAX_USES) {
      $genBtn().disabled = false;
    }

    showToast(`エラー: ${err.message}`, 'error');
    console.error('[WHALON] API Error:', err);
  }
}

/* ─────────────────────────────────
   議事録レンダリング
───────────────────────────────── */
function renderMinutes(data) {
  const container = $output();
  container.innerHTML = '';

  const sections = [
    { key: 'meeting_name', label: '会議名',       icon: '📌' },
    { key: 'date',         label: '日付',         icon: '📅' },
    { key: 'attendees',    label: '参加者',       icon: '👥' },
    { key: 'overview',     label: '会議概要',     icon: '📋' },
    { key: 'decisions',    label: '決定事項',     icon: '✅', isList: true },
    { key: 'discussion',   label: '議論内容',     icon: '💬' },
    { key: 'todos',        label: 'TODO',         icon: '📝', isTodo: true },
    { key: 'unresolved',   label: '未確定事項',   icon: '❓', isList: true },
    { key: 'next_check',   label: '次回確認事項', icon: '🔜', isList: true },
  ];

  sections.forEach(({ key, label, icon, isList, isTodo }) => {
    const val = data[key];
    if (!val || (Array.isArray(val) && val.length === 0)) return;

    const block = document.createElement('div');
    block.className = 'm-block';

    const labelEl = document.createElement('div');
    labelEl.className = 'm-label';
    labelEl.textContent = `${icon}  ${label}`;
    block.appendChild(labelEl);

    const content = document.createElement('div');
    content.className = 'm-content';

    if (isTodo && Array.isArray(val)) {
      content.appendChild(buildTodoTable(val));
    } else if (isList && Array.isArray(val)) {
      const ul = document.createElement('ul');
      val.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      });
      content.appendChild(ul);
    } else {
      content.textContent = Array.isArray(val) ? val.join('\n') : val;
    }

    block.appendChild(content);
    container.appendChild(block);
  });

  // サマリーブロック（上司提出用）
  if (data.summary) {
    const block = document.createElement('div');
    block.className = 'm-block summary';

    const labelEl = document.createElement('div');
    labelEl.className = 'm-label';
    labelEl.textContent = '📨  上司提出用まとめ';
    block.appendChild(labelEl);

    const content = document.createElement('div');
    content.className = 'm-content';
    content.textContent = data.summary;
    block.appendChild(content);

    container.appendChild(block);
  }
}

/* TODOテーブル生成 */
function buildTodoTable(todos) {
  const table = document.createElement('table');
  table.className = 'todo-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>タスク</th>
      <th>担当者</th>
      <th>期限</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  todos.forEach(todo => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(todo.task     || '')}</td>
      <td>${escHtml(todo.assignee || '未定')}</td>
      <td>${escHtml(todo.deadline || '未定')}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function escHtml(str) {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

/* ─────────────────────────────────
   コピー機能
───────────────────────────────── */
function copyMinutes() {
  const text = buildPlainText();
  if (!text) return;

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-btn');
    document.getElementById('copy-icon').textContent = '✓';
    document.getElementById('copy-text').textContent = 'コピーしました';
    btn.style.borderColor = 'var(--accent2)';
    btn.style.color       = 'var(--accent2)';

    setTimeout(() => {
      document.getElementById('copy-icon').textContent = '📋';
      document.getElementById('copy-text').textContent = 'コピー';
      btn.style.borderColor = '';
      btn.style.color       = '';
    }, 2000);
  }).catch(() => {
    showToast('コピーに失敗しました', 'error');
  });
}

function buildPlainText() {
  const container = $output();
  if (!container) return '';

  const lines = [];
  container.querySelectorAll('.m-block').forEach(block => {
    const label = block.querySelector('.m-label')?.textContent.trim() || '';
    lines.push(`\n【${label}】`);

    const table = block.querySelector('.todo-table');
    if (table) {
      table.querySelectorAll('tbody tr').forEach(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        lines.push(`  • ${cells[0]}  担当: ${cells[1]}  期限: ${cells[2]}`);
      });
      return;
    }

    const items = block.querySelectorAll('li');
    if (items.length > 0) {
      items.forEach(li => lines.push(`  • ${li.textContent.trim()}`));
      return;
    }

    const content = block.querySelector('.m-content');
    if (content) lines.push(content.textContent.trim());
  });

  return lines.join('\n').trim();
}

/* ─────────────────────────────────
   フォームリセット
───────────────────────────────── */
function resetForm() {
  $outputSec().classList.add('hidden');
  $output().innerHTML = '';

  const uses = getUses();
  if (uses < MAX_USES) {
    $inputSec().classList.remove('hidden');
    $genBtn().disabled = false;
    $ctaBanner().classList.add('hidden');
  } else {
    showLimitUI();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─────────────────────────────────
   上限到達UI
───────────────────────────────── */
function showLimitUI() {
  $inputSec().classList.add('hidden');
  $loading().classList.add('hidden');
  $outputSec().classList.add('hidden');
  $limitMsg().classList.remove('hidden');
  $ctaBanner().classList.remove('hidden');

  setTimeout(() => {
    $limitMsg().scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

/* ─────────────────────────────────
   トーストNotification
───────────────────────────────── */
function showToast(msg, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed;
    bottom: 32px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    opacity: 0;
    background: ${type === 'error' ? '#f0704b' : '#4f8ef7'};
    color: #fff;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 0.88rem;
    font-family: 'Noto Sans JP', sans-serif;
    z-index: 9999;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
    white-space: nowrap;
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(-50%) translateY(0)';
    toast.style.opacity   = '1';
  });

  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ─────────────────────────────────
   初期化
───────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const uses = getUses();
  updateUsageUI(uses);
  initConsultLinks();
  initCharCount();

  // 上限到達済み → 入力欄を隠して制限UIを表示
  if (uses >= MAX_USES) {
    $inputSec().classList.add('hidden');
    $ctaBanner().classList.remove('hidden');
    $limitMsg().classList.remove('hidden');
  }

  // Ctrl+Enter で生成
  $log().addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) generateMinutes();
  });
});

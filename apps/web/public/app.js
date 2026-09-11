'use strict';

const CONFIG_KEY = 'wcl-llm-config';
const SESSION_KEY = 'wcl-session-id';

const chatEl = document.getElementById('chat');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');
const settingsEl = document.getElementById('settings');
const settingsToggle = document.getElementById('settingsToggle');
const saveSettingsBtn = document.getElementById('saveSettings');
const settingsStatus = document.getElementById('settingsStatus');
const sessionListEl = document.getElementById('sessionList');
const newChatBtn = document.getElementById('newChat');

let currentSessionId = localStorage.getItem(SESSION_KEY) || createSessionId();

function createSessionId() {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(SESSION_KEY, id);
  return id;
}

function useSession(sessionId) {
  currentSessionId = sessionId;
  localStorage.setItem(SESSION_KEY, sessionId);
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveSettings() {
  const config = {
    baseUrl: document.getElementById('sBaseUrl').value.trim(),
    apiKey: document.getElementById('sApiKey').value.trim(),
    model: document.getElementById('sModel').value.trim(),
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  settingsStatus.textContent = '已保存';
  setTimeout(() => {
    settingsStatus.textContent = '';
  }, 2000);
  return config;
}

function fillSettingsForm() {
  const config = loadSettings();
  document.getElementById('sBaseUrl').value = config.baseUrl || '';
  document.getElementById('sApiKey').value = config.apiKey || '';
  document.getElementById('sModel').value = config.model || '';
}

function clearChat() {
  chatEl.innerHTML = '';
  const welcome = document.createElement('div');
  welcome.className = 'welcome';
  welcome.innerHTML =
    '粘贴 WCL 战斗日志链接开始分析，例如：<br />' +
    '<code>https://www.warcraftlogs.com/reports/xxxx?fight=8</code>';
  chatEl.appendChild(welcome);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

function renderInline(source) {
  const codes = [];
  let s = source.replace(/`([^`]+)`/g, (m, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, text, href) => {
    const safe = /^https?:\/\//i.test(href) ? href : '#';
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });
  s = s.replace(
    /(严重程度[：:]\s*)(严重|高|中|低|轻微|critical|high|medium|low|info)/gi,
    (m, pre, sev) => {
      const cls = {
        严重: 'sev-critical',
        高: 'sev-high',
        critical: 'sev-critical',
        high: 'sev-high',
        中: 'sev-medium',
        medium: 'sev-medium',
        低: 'sev-low',
        轻微: 'sev-low',
        low: 'sev-low',
        info: 'sev-info',
      }[sev.toLowerCase()];
      return `${pre}<span class="${cls ?? 'sev-info'}">${sev}</span>`;
    },
  );
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => codes[Number(i)] ?? '');
  return s;
}

// Lightweight syntax highlighting: strings, comments, numbers, keywords.
// Operates on raw (unescaped) code; each segment is escaped before emitting.
function highlightCode(code) {
  const tokenRe =
    /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|(\b\d+(?:\.\d+)?\b)|(\b(?:const|let|var|function|return|if|else|for|while|import|from|export|default|class|extends|new|this|async|await|interface|type|enum|true|false|null|undefined)\b)/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = tokenRe.exec(code)) !== null) {
    out += escapeHtml(code.slice(last, m.index));
    if (m[1]) out += `<span class="tok-string">${escapeHtml(m[1])}</span>`;
    else if (m[2]) out += `<span class="tok-comment">${escapeHtml(m[2])}</span>`;
    else if (m[3]) out += `<span class="tok-number">${escapeHtml(m[3])}</span>`;
    else if (m[4]) out += `<span class="tok-keyword">${escapeHtml(m[4])}</span>`;
    last = tokenRe.lastIndex;
  }
  out += escapeHtml(code.slice(last));
  return out;
}

// A small, dependency-free, XSS-safe Markdown renderer (headings, bold,
// italic, code with syntax highlighting, tables, lists, blockquote, hr, links).
function renderMarkdown(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let paragraph = [];
  let inCode = false;
  let codeLang = '';
  let codeBuf = [];
  let listTag = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${renderInline(escapeHtml(paragraph.join(' ')))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listTag) {
      out.push(`</${listTag}>`);
      listTag = null;
    }
  };
  const isTableRow = (line) => /^\|.+\|$/.test(line.trim());
  const isSeparator = (cells) =>
    cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
  const parseTableRow = (line) =>
    line
      .trim()
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());

  const renderTable = (rows) => {
    const cell = (tag, content) => `<${tag}>${renderInline(escapeHtml(content))}</${tag}>`;
    const hasHeader = rows.length >= 2 && isSeparator(rows[1]);
    const header = hasHeader ? rows[0] : null;
    const body = hasHeader ? rows.slice(2) : rows;

    let html = '<table>';
    if (header) {
      html += `<thead><tr>${header.map((c) => cell('th', c)).join('')}</tr></thead>`;
    }
    if (body.length > 0) {
      html +=
        '<tbody>' +
        body.map((r) => `<tr>${r.map((c) => cell('td', c)).join('')}</tr>`).join('') +
        '</tbody>';
    }
    html += '</table>';
    return html;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const line = raw.trim();

    if (inCode) {
      if (/^```/.test(line)) {
        inCode = false;
        const langClass = codeLang ? ` class="lang-${escapeHtml(codeLang)}"` : '';
        out.push(
          `<pre><code${langClass}>${highlightCode(codeBuf.join('\n'))}</code></pre>`,
        );
        codeBuf = [];
        codeLang = '';
      } else {
        codeBuf.push(raw);
      }
      continue;
    }
    if (/^```/.test(line)) {
      flushParagraph();
      closeList();
      inCode = true;
      codeLang = (line.match(/^```\s*([\w-]*)/)?.[1] ?? '').trim();
      continue;
    }

    if (isTableRow(line)) {
      flushParagraph();
      closeList();
      const rows = [parseTableRow(line)];
      while (i + 1 < lines.length && isTableRow(lines[i + 1] ?? '')) {
        i += 1;
        rows.push(parseTableRow(lines[i] ?? ''));
      }
      out.push(renderTable(rows));
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushParagraph();
      closeList();
      out.push('<hr />');
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      closeList();
      out.push(
        `<blockquote>${renderInline(escapeHtml(line.replace(/^>\s?/, '')))}</blockquote>`,
      );
      continue;
    }

    const ul = line.match(/^[-*+]\s+(.+)$/);
    if (ul) {
      flushParagraph();
      if (listTag !== 'ul') {
        closeList();
        out.push('<ul>');
        listTag = 'ul';
      }
      out.push(`<li>${renderInline(escapeHtml(ul[1]))}</li>`);
      continue;
    }

    const ol = line.match(/^\d+[.)]\s+(.+)$/);
    if (ol) {
      flushParagraph();
      if (listTag !== 'ol') {
        closeList();
        out.push('<ol>');
        listTag = 'ol';
      }
      out.push(`<li>${renderInline(escapeHtml(ol[1]))}</li>`);
      continue;
    }

    if (line === '') {
      flushParagraph();
      closeList();
      continue;
    }

    closeList();
    paragraph.push(line);
  }

  if (inCode) {
    out.push(
      `<pre><code${codeLang ? ` class="lang-${escapeHtml(codeLang)}"` : ''}>${highlightCode(codeBuf.join('\n'))}</code></pre>`,
    );
  }
  flushParagraph();
  closeList();
  return out.join('\n');
}

function appendMessage(role, text) {
  const welcome = chatEl.querySelector('.welcome');
  if (welcome) welcome.remove();
  const el = document.createElement('div');
  el.className = `message ${role}`;
  if (role === 'assistant') {
    el.innerHTML = renderMarkdown(text);
  } else {
    el.textContent = text;
  }
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  return el;
}

function appendOptions(items, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'options';
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.label;
    btn.addEventListener('click', () => onPick(item));
    wrap.appendChild(btn);
  }
  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function disableInput(disabled) {
  inputEl.disabled = disabled;
  sendBtn.disabled = disabled;
}

async function loadCurrentSession() {
  clearChat();
  try {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(currentSessionId)}`,
    );
    if (!response.ok) return;
    const data = await response.json();
    for (const message of data.messages || []) {
      if (message.role === 'user' || message.role === 'assistant') {
        appendMessage(message.role, message.content);
      }
    }
  } catch {
    // keep the welcome screen on failure
  }
}

async function refreshSessionList() {
  try {
    const response = await fetch('/api/sessions');
    if (!response.ok) return;
    const data = await response.json();
    renderSessionList(data.sessions || []);
  } catch {
    // ignore
  }
}

function renderSessionList(sessions) {
  sessionListEl.innerHTML = '';
  if (sessions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'session-empty';
    empty.textContent = '暂无历史对话';
    sessionListEl.appendChild(empty);
    return;
  }

  for (const session of sessions) {
    const item = document.createElement('div');
    item.className =
      'session-item' +
      (session.sessionId === currentSessionId ? ' active' : '');

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = session.title || '新对话';
    title.title = session.title || '新对话';

    const del = document.createElement('button');
    del.className = 'del';
    del.type = 'button';
    del.textContent = '✕';
    del.addEventListener('click', (event) => {
      event.stopPropagation();
      void deleteSession(session.sessionId);
    });

    item.appendChild(title);
    item.appendChild(del);
    item.addEventListener('click', () => {
      if (session.sessionId === currentSessionId) return;
      useSession(session.sessionId);
      void loadCurrentSession();
      refreshSessionList();
    });

    sessionListEl.appendChild(item);
  }
}

async function deleteSession(sessionId) {
  try {
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    if (sessionId === currentSessionId) {
      startNewChat(false);
    } else {
      refreshSessionList();
    }
  } catch {
    // ignore
  }
}

function startNewChat(confirmReset = true) {
  if (confirmReset && chatEl.querySelector('.message')) {
    if (!window.confirm('开始新对话？当前对话历史会保留在左侧列表。')) return;
  }
  useSession(createSessionId());
  clearChat();
  refreshSessionList();
  inputEl.focus();
}

async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  inputEl.value = '';
  appendMessage('user', trimmed);

  const config = loadSettings();
  if (!config.baseUrl || !config.apiKey || !config.model) {
    appendMessage(
      'error',
      '请先在右上角「设置」里填写 LLM Base URL / API Key / 模型。',
    );
    return;
  }

  disableInput(true);
  let assistantEl;
  let assistantRaw = '';

  const handleEvent = (event) => {
    switch (event.type) {
      case 'start':
        assistantEl = appendMessage('assistant', '');
        assistantRaw = '';
        break;
      case 'delta':
        if (!assistantEl) {
          assistantEl = appendMessage('assistant', '');
          assistantRaw = '';
        }
        assistantRaw += event.text;
        assistantEl.innerHTML = renderMarkdown(assistantRaw);
        chatEl.scrollTop = chatEl.scrollHeight;
        break;
      case 'reply':
        appendMessage('assistant', event.text);
        if (event.kind === 'ask-fight') {
          appendOptions(
            event.fights.map((f) => ({
              label: `${f.id}. ${f.name}`,
              value: String(f.id),
            })),
            (item) => sendMessage(item.value),
          );
        } else if (event.kind === 'ask-player') {
          appendOptions(
            event.players.map((p) => ({
              label: p.spec ? `${p.name}（${p.spec}）` : p.name,
              value: p.name,
            })),
            (item) => sendMessage(item.value),
          );
        }
        break;
      case 'done':
        break;
      case 'error':
        appendMessage('error', event.text);
        break;
      default:
        break;
    }
  };

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: currentSessionId,
        message: trimmed,
        llm: config,
      }),
    });

    if (!res.ok) {
      let detail = `请求失败（HTTP ${res.status}）`;
      try {
        const body = await res.json();
        if (body && body.error) detail = body.error;
      } catch {
        /* keep default */
      }
      appendMessage('error', detail);
      return;
    }
    if (!res.body) {
      appendMessage('error', '响应没有内容');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        let event;
        try {
          event = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        handleEvent(event);
      }
    }
  } catch (error) {
    appendMessage('error', `网络错误：${error.message}`);
  } finally {
    disableInput(false);
    inputEl.focus();
    refreshSessionList();
  }
}

newChatBtn.addEventListener('click', () => {
  startNewChat();
});

settingsToggle.addEventListener('click', () => {
  settingsEl.classList.toggle('hidden');
  if (!settingsEl.classList.contains('hidden')) {
    fillSettingsForm();
  }
});

saveSettingsBtn.addEventListener('click', () => {
  saveSettings();
});

sendBtn.addEventListener('click', () => {
  sendMessage(inputEl.value);
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(inputEl.value);
  }
});

fillSettingsForm();
void loadCurrentSession();
void refreshSessionList();

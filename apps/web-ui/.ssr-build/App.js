import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { useState, useRef, useCallback, useEffect } from "react";
const MODULES = [
  {
    id: "combat",
    label: "战斗分析",
    description: "分析单个玩家的战斗表现与输出手法",
    guide: "粘贴一场战斗的 WCL 链接，选择要分析的角色，系统会拉取日志生成结构化分析。",
    placeholder: "粘贴 WCL 链接（如 https://www.warcraftlogs.com/reports/xxxx?fight=8）…",
    sample: "https://www.warcraftlogs.com/reports/xxxx?fight=8",
    needsLlm: true
  },
  {
    id: "wipe",
    label: "团灭复盘",
    description: "复盘死亡 / 团灭 / 引怪(ADD)原因",
    guide: "先分析一场战斗，然后切到回调进入复盘；系统会结合死亡时间窗口给出归因。",
    placeholder: "例如：复盘一下这场为什么灭 / 谁的责任…",
    sample: "复盘一下这场战斗的死亡原因",
    needsLlm: true
  },
  {
    id: "report",
    label: "报告总览",
    description: "解析报告、列出战斗与参战玩家",
    guide: "粘贴报告链接，不指定 fight 时会先列出战斗列表供你选择，再选玩家。",
    placeholder: "粘贴 WCL 报告链接…",
    sample: "https://www.warcraftlogs.com/reports/xxxx",
    needsLlm: false
  },
  {
    id: "chat",
    label: "自由对话",
    description: "关于报告、玩法、操作的一般讨论",
    guide: "已经完成分析后，可以继续追问任何战斗细节，AI 会结合对话上下文回答。",
    placeholder: "随便聊聊，或粘贴 WCL 链接开始分析…",
    sample: "怎么判断一个玩家打得是否合格？",
    needsLlm: true
  }
];
function getModule(id) {
  return MODULES.find((m) => m.id === id) ?? MODULES[0];
}
const DEFAULT_MODULE = "combat";
const SESSION_KEY = "wcl-session-id";
const CONFIG_KEY = "wcl-llm-config";
function storage() {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : void 0;
  } catch {
    return void 0;
  }
}
function createSessionId() {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  storage()?.setItem(SESSION_KEY, id);
  return id;
}
function getSessionId() {
  return storage()?.getItem(SESSION_KEY) || createSessionId();
}
function useSession(id) {
  storage()?.setItem(SESSION_KEY, id);
}
function loadSettings() {
  try {
    return JSON.parse(storage()?.getItem(CONFIG_KEY) || "{}");
  } catch {
    return { baseUrl: "", apiKey: "", model: "" };
  }
}
function saveSettings(config) {
  storage()?.setItem(CONFIG_KEY, JSON.stringify(config));
}
function isLlmReady(config) {
  return Boolean(config.baseUrl && config.apiKey && config.model);
}
async function readJson(res) {
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.json();
}
async function listSessions() {
  const data = await readJson(
    await fetch("/api/sessions")
  );
  return data.sessions ?? [];
}
async function loadSessionMessages(sessionId) {
  const data = await readJson(
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`)
  );
  return data.messages ?? [];
}
async function deleteSession(sessionId) {
  await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE"
  });
}
async function streamChat(options) {
  const { sessionId, message, llm, onEvent } = options;
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message, llm })
  });
  if (!res.ok) {
    let detail = `请求失败（HTTP ${res.status}）`;
    try {
      const body = await res.json();
      if (body.error) detail = body.error;
    } catch {
    }
    onEvent({ type: "error", text: detail });
    return;
  }
  if (!res.body) {
    onEvent({ type: "error", text: "响应没有内容" });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      let event;
      try {
        event = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      onEvent(event);
    }
  }
}
const emptyView = {
  messages: [],
  options: [],
  isStreaming: false,
  error: null
};
function optionsFromReply(reply) {
  if (reply.kind === "ask-fight") {
    return reply.fights.map((f) => ({
      label: `${f.id}. ${f.name}`,
      value: String(f.id)
    }));
  }
  if (reply.kind === "ask-player") {
    return reply.players.map((p) => ({
      label: p.spec ? `${p.name}（${p.spec}）` : p.name,
      value: p.name
    }));
  }
  return [];
}
function useChat() {
  const [view, setView] = useState(emptyView);
  const [sessionId, setSessionId] = useState(() => getSessionId());
  const [sessions, setSessions] = useState(
    []
  );
  const viewRef = useRef(view);
  viewRef.current = view;
  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await listSessions());
    } catch {
      setSessions([]);
    }
  }, []);
  const loadCurrent = useCallback(async (id) => {
    setView(emptyView);
    let messages = [];
    try {
      messages = await loadSessionMessages(id);
    } catch {
    }
    setView((prev) => ({ ...prev, messages }));
  }, []);
  const runTurn = useCallback(
    async (message, llm) => {
      setView((prev) => ({
        ...prev,
        isStreaming: true,
        error: null,
        messages: [...prev.messages, { role: "user", content: message }]
      }));
      let assistantRaw = "";
      let pendingOptions = [];
      const onEvent = (event) => {
        if (event.type === "delta" && event.text !== void 0) {
          assistantRaw += event.text;
          setView((prev) => {
            const messages = [...prev.messages];
            const last = messages[messages.length - 1];
            if (last && last.role === "assistant") {
              messages[messages.length - 1] = { role: "assistant", content: assistantRaw };
            } else {
              messages.push({ role: "assistant", content: assistantRaw });
            }
            return { ...prev, messages };
          });
        } else if (event.type === "reply" && (event.kind === "ask-fight" || event.kind === "ask-player")) {
          const reply = {
            kind: event.kind,
            fights: event.fights ?? [],
            players: event.players ?? []
          };
          if (event.text !== void 0) {
            setView((prev) => ({
              ...prev,
              messages: [...prev.messages, { role: "assistant", content: event.text ?? "" }]
            }));
          }
          pendingOptions = optionsFromReply(reply);
        } else if (event.type === "reply" && event.text !== void 0) {
          setView((prev) => ({
            ...prev,
            messages: [...prev.messages, { role: "assistant", content: event.text ?? "" }]
          }));
        } else if (event.type === "error" && event.text !== void 0) {
          setView((prev) => ({
            ...prev,
            messages: [...prev.messages, { role: "assistant", content: event.text ?? "" }],
            error: event.text ?? null
          }));
        }
      };
      try {
        await streamChat({ sessionId, message, llm, onEvent });
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        setView((prev) => ({
          ...prev,
          messages: [...prev.messages, { role: "assistant", content: `（错误）${text}` }],
          error: text
        }));
      } finally {
        setView((prev) => ({ ...prev, isStreaming: false, options: pendingOptions }));
        await refreshSessions();
      }
    },
    [sessionId, refreshSessions]
  );
  const send = useCallback(
    (text, llm) => {
      const trimmed = text.trim();
      if (!trimmed || viewRef.current.isStreaming) return;
      void runTurn(trimmed, llm);
    },
    [runTurn]
  );
  const pick = useCallback(
    (value, llm) => {
      void runTurn(value, llm);
    },
    [runTurn]
  );
  const newChat = useCallback(() => {
    const id = useSessionAndGet();
    setSessionId(id);
    setView(emptyView);
    void refreshSessions();
  }, [refreshSessions]);
  const switchSession = useCallback(
    (id) => {
      useSession(id);
      setSessionId(id);
      void loadCurrent(id);
      void refreshSessions();
    },
    [loadCurrent, refreshSessions]
  );
  const removeSession = useCallback(
    async (id) => {
      try {
        await deleteSession(id);
      } catch {
      }
      if (id === sessionId) {
        newChat();
      } else {
        void refreshSessions();
      }
    },
    [sessionId, newChat, refreshSessions]
  );
  const refresh = useCallback(() => {
    void refreshSessions();
  }, [refreshSessions]);
  useEffect(() => {
    void loadCurrent(sessionId);
    void refreshSessions();
  }, []);
  return { view, sessionId, sessions, send, pick, newChat, switchSession, removeSession, refresh };
}
function useSessionAndGet() {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  useSession(id);
  return id;
}
function base(size) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };
}
function IconCombat({ size = 18, className }) {
  return /* @__PURE__ */ jsx("svg", { ...base(size), className, "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M3 11h4l2-6 3 14 2.5-8H21" }) });
}
function IconWipe({ size = 18, className }) {
  return /* @__PURE__ */ jsxs("svg", { ...base(size), className, "aria-hidden": "true", children: [
    /* @__PURE__ */ jsx("path", { d: "M12 9v4m0 4h.01" }),
    /* @__PURE__ */ jsx("path", { d: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" })
  ] });
}
function IconReport({ size = 18, className }) {
  return /* @__PURE__ */ jsxs("svg", { ...base(size), className, "aria-hidden": "true", children: [
    /* @__PURE__ */ jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }),
    /* @__PURE__ */ jsx("path", { d: "M14 2v6h6M16 13H8m8 4H8m2-8H8" })
  ] });
}
function IconChat({ size = 18, className }) {
  return /* @__PURE__ */ jsxs("svg", { ...base(size), className, "aria-hidden": "true", children: [
    /* @__PURE__ */ jsx("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" }),
    /* @__PURE__ */ jsx("path", { d: "M8 9h8M8 13h5" })
  ] });
}
function IconPlus({ size = 18, className }) {
  return /* @__PURE__ */ jsx("svg", { ...base(size), className, "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M12 5v14M5 12h14" }) });
}
function IconSettings({ size = 18, className }) {
  return /* @__PURE__ */ jsxs("svg", { ...base(size), className, "aria-hidden": "true", children: [
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "3" }),
    /* @__PURE__ */ jsx("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" })
  ] });
}
function IconSend({ size = 18, className }) {
  return /* @__PURE__ */ jsxs("svg", { ...base(size), className, "aria-hidden": "true", children: [
    /* @__PURE__ */ jsx("path", { d: "m22 2-7 20-4-9-9-4Z" }),
    /* @__PURE__ */ jsx("path", { d: "M22 2 11 13" })
  ] });
}
function moduleIcon(id) {
  switch (id) {
    case "combat":
      return IconCombat;
    case "wipe":
      return IconWipe;
    case "report":
      return IconReport;
    default:
      return IconChat;
  }
}
function Sidebar(props) {
  const {
    modules,
    activeModule,
    onSelectModule,
    sessions,
    currentSessionId,
    onNewChat,
    onSwitchSession,
    onRemoveSession,
    onOpenSettings,
    llmReady
  } = props;
  return /* @__PURE__ */ jsxs("aside", { className: "sidebar", children: [
    /* @__PURE__ */ jsxs("div", { className: "brand", children: [
      /* @__PURE__ */ jsx("div", { className: "brand-mark", children: "W" }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "brand-name", children: "WCL AI" }),
        /* @__PURE__ */ jsx("div", { className: "brand-sub", children: "战斗分析平台" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "sidebar-section", children: "模块" }),
    /* @__PURE__ */ jsx("nav", { className: "nav", children: modules.map((m) => {
      const Icon = moduleIcon(m.id);
      return /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          className: `nav-item${activeModule === m.id ? " active" : ""}`,
          onClick: () => onSelectModule(m.id),
          title: m.description,
          children: [
            /* @__PURE__ */ jsx("span", { className: "nav-icon", children: /* @__PURE__ */ jsx(Icon, { size: 17 }) }),
            m.label
          ]
        },
        m.id
      );
    }) }),
    /* @__PURE__ */ jsx("div", { className: "sidebar-section", children: "历史对话" }),
    /* @__PURE__ */ jsxs("button", { className: "nav-item", type: "button", onClick: onNewChat, title: "新建对话", children: [
      /* @__PURE__ */ jsx("span", { className: "nav-icon", children: /* @__PURE__ */ jsx(IconPlus, { size: 17 }) }),
      "新建对话"
    ] }),
    /* @__PURE__ */ jsx("div", { className: "session-list", children: sessions.length === 0 ? /* @__PURE__ */ jsx("div", { className: "session-empty", children: "暂无历史对话" }) : sessions.map((s) => /* @__PURE__ */ jsxs(
      "div",
      {
        className: `session-item${s.sessionId === currentSessionId ? " active" : ""}`,
        onClick: () => onSwitchSession(s.sessionId),
        children: [
          /* @__PURE__ */ jsx("span", { className: "title", title: s.title, children: s.title }),
          /* @__PURE__ */ jsx(
            "button",
            {
              className: "del",
              type: "button",
              title: "删除",
              onClick: (e) => {
                e.stopPropagation();
                onRemoveSession(s.sessionId);
              },
              children: "×"
            }
          )
        ]
      },
      s.sessionId
    )) }),
    /* @__PURE__ */ jsx("div", { className: "sidebar-footer", children: /* @__PURE__ */ jsxs("button", { className: "btn-settings", type: "button", onClick: onOpenSettings, children: [
      /* @__PURE__ */ jsx(IconSettings, { size: 16 }),
      "设置",
      /* @__PURE__ */ jsx("span", { className: `status-dot${llmReady ? " ready" : " miss"}` }, "dot")
    ] }) })
  ] });
}
function SettingsPanel({
  config,
  onSave,
  onClose
}) {
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model, setModel] = useState(config.model);
  const [saved, setSaved] = useState(false);
  const save = () => {
    onSave({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };
  return /* @__PURE__ */ jsxs("div", { className: "settings-panel", children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("h3", { children: "LLM 配置" }),
      /* @__PURE__ */ jsx("button", { className: "btn ghost", type: "button", onClick: onClose, children: "收起" })
    ] }),
    /* @__PURE__ */ jsx("p", { className: "hint", children: "填入你自己的模型接口（OpenAI 兼容）。配置只保存在当前浏览器，不会上传。" }),
    /* @__PURE__ */ jsxs("label", { className: "settings-field", children: [
      "Base URL",
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          value: baseUrl,
          placeholder: "https://api.openai.com/v1",
          autoComplete: "off",
          onChange: (e) => setBaseUrl(e.target.value)
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("label", { className: "settings-field", children: [
      "API Key",
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "password",
          value: apiKey,
          placeholder: "sk-...",
          autoComplete: "off",
          onChange: (e) => setApiKey(e.target.value)
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("label", { className: "settings-field", children: [
      "模型",
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          value: model,
          placeholder: "gpt-4o-mini",
          autoComplete: "off",
          onChange: (e) => setModel(e.target.value)
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "settings-actions", children: [
      /* @__PURE__ */ jsx("button", { className: "btn", type: "button", onClick: save, children: "保存" }),
      /* @__PURE__ */ jsx("span", { className: "settings-status", children: saved ? "已保存" : "" })
    ] })
  ] });
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
const SEVERITY_CLASS = {
  严重: "sev-critical",
  高: "sev-high",
  critical: "sev-critical",
  high: "sev-high",
  中: "sev-medium",
  medium: "sev-medium",
  低: "sev-low",
  轻微: "sev-low",
  low: "sev-low",
  info: "sev-info"
};
function renderInline(source) {
  const CODE_OPEN = "__WCLCODE_";
  const CODE_CLOSE = "__";
  const codes = [];
  let s = source.replace(/`([^`]+)`/g, (_m, code) => {
    codes.push(`<code>${code}</code>`);
    return `${CODE_OPEN}${codes.length - 1}${CODE_CLOSE}`;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_m, text, href) => {
    const safe = /^https?:\/\//i.test(href) ? href : "#";
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });
  s = s.replace(
    /(严重程度[：:]\s*)(严重|高|中|低|轻微|critical|high|medium|low|info)/gi,
    (_m, pre, sevValue) => {
      const cls = SEVERITY_CLASS[sevValue.toLowerCase()] ?? "sev-info";
      return `${pre}<span class="${cls}">${sevValue}</span>`;
    }
  );
  s = s.split(CODE_OPEN).map((part, partIndex) => {
    if (partIndex === 0) return part;
    const closeAt = part.indexOf(CODE_CLOSE);
    if (closeAt < 0) return part;
    const index = Number(part.slice(0, closeAt));
    const rest = part.slice(closeAt + CODE_CLOSE.length);
    return `${codes[index] ?? ""}${rest}`;
  }).join("");
  return s;
}
function highlightCode(code) {
  const tokenRe = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|(\b\d+(?:\.\d+)?\b)|(\b(?:const|let|var|function|return|if|else|for|while|import|from|export|default|class|extends|new|this|async|await|interface|type|enum|true|false|null|undefined)\b)/g;
  let out = "";
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
function renderMarkdown(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let paragraph = [];
  let inCode = false;
  let codeLang = "";
  let codeBuf = [];
  let listTag = null;
  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${renderInline(escapeHtml(paragraph.join(" ")))}</p>`);
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
  const isSeparator = (cells) => cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
  const parseTableRow = (line) => line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
  const renderTable = (rows) => {
    const cell = (tag, content) => `<${tag}>${renderInline(escapeHtml(content))}</${tag}>`;
    const hasHeader = rows.length >= 2 && isSeparator(rows[1] ?? []);
    const header = hasHeader ? rows[0] ?? [] : null;
    const body = hasHeader ? rows.slice(2) : rows;
    let html = "<table>";
    if (header) {
      html += `<thead><tr>${header.map((c) => cell("th", c)).join("")}</tr></thead>`;
    }
    if (body.length > 0) {
      html += "<tbody>" + body.map((r) => `<tr>${r.map((c) => cell("td", c)).join("")}</tr>`).join("") + "</tbody>";
    }
    html += "</table>";
    return html;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    const line = raw.trim();
    if (inCode) {
      if (/^```/.test(line)) {
        inCode = false;
        const langHtml = codeLang ? ` class="lang-${escapeHtml(codeLang)}"` : "";
        out.push({ raw: "", html: `<pre><code${langHtml}>${highlightCode(codeBuf.join("\n"))}</code></pre>`, kind: "code" });
        codeBuf = [];
        codeLang = "";
      } else {
        codeBuf.push(raw);
      }
      continue;
    }
    if (/^```/.test(line)) {
      flushParagraph();
      closeList();
      inCode = true;
      codeLang = (line.match(/^```\s*([\w-]*)/)?.[1] ?? "").trim();
      continue;
    }
    if (isTableRow(line)) {
      flushParagraph();
      closeList();
      const rows = [parseTableRow(line)];
      while (i + 1 < lines.length && isTableRow(lines[i + 1] ?? "")) {
        i += 1;
        rows.push(parseTableRow(lines[i] ?? ""));
      }
      out.push({ raw: "", html: renderTable(rows), kind: "table" });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1]?.length ?? 0;
      out.push(`<h${level}>${renderInline(escapeHtml(heading[2] ?? ""))}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushParagraph();
      closeList();
      out.push("<hr />");
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushParagraph();
      closeList();
      out.push(
        `<blockquote>${renderInline(escapeHtml(line.replace(/^>\s?/, "")))}</blockquote>`
      );
      continue;
    }
    const ul = line.match(/^[-*+]\s+(.+)$/);
    if (ul) {
      flushParagraph();
      if (listTag !== "ul") {
        closeList();
        out.push("<ul>");
        listTag = "ul";
      }
      out.push(`<li>${renderInline(escapeHtml(ul[1] ?? ""))}</li>`);
      continue;
    }
    const ol = line.match(/^\d+[.)]\s+(.+)$/);
    if (ol) {
      flushParagraph();
      if (listTag !== "ol") {
        closeList();
        out.push("<ol>");
        listTag = "ol";
      }
      out.push(`<li>${renderInline(escapeHtml(ol[1] ?? ""))}</li>`);
      continue;
    }
    if (line === "") {
      flushParagraph();
      closeList();
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  if (inCode) {
    out.push({
      raw: "",
      html: `<pre><code${codeLang ? ` class="lang-${escapeHtml(codeLang)}"` : ""}>${highlightCode(codeBuf.join("\n"))}</code></pre>`,
      kind: "code"
    });
  }
  flushParagraph();
  closeList();
  return out.join("\n");
}
function MessageBubble({
  role,
  content
}) {
  if (role === "user") {
    return /* @__PURE__ */ jsx("div", { className: "message user", children: content });
  }
  const isError = content.startsWith("（错误）");
  const html = renderMarkdown(content);
  return /* @__PURE__ */ jsx("div", { className: `message ${isError ? "error" : "assistant"}`, children: /* @__PURE__ */ jsx("div", { className: "msg-body", dangerouslySetInnerHTML: { __html: html } }) });
}
function TypingIndicator() {
  return /* @__PURE__ */ jsx("div", { className: "message assistant", children: /* @__PURE__ */ jsxs("div", { className: "typing", children: [
    /* @__PURE__ */ jsx("span", {}),
    /* @__PURE__ */ jsx("span", {}),
    /* @__PURE__ */ jsx("span", {})
  ] }) });
}
function Options({
  options,
  onPick
}) {
  return /* @__PURE__ */ jsx("div", { className: "options", children: options.map((o) => /* @__PURE__ */ jsx("button", { type: "button", onClick: () => onPick(o.value), children: o.label }, o.value)) });
}
function Welcome({
  module,
  onSend
}) {
  const Icon = moduleIcon(module.id);
  return /* @__PURE__ */ jsxs("div", { className: "welcome", children: [
    /* @__PURE__ */ jsx("div", { className: "welcome-title", children: "WCL AI 战斗分析" }),
    /* @__PURE__ */ jsx("div", { children: "粘贴 WCL 战斗日志链接开始分析，例如：" }),
    /* @__PURE__ */ jsx("div", { className: "welcome-code", children: "https://www.warcraftlogs.com/reports/xxxx?fight=8" }),
    /* @__PURE__ */ jsx("div", { className: "module-chips", children: /* @__PURE__ */ jsxs("button", { className: "module-chip", type: "button", onClick: () => onSend(module.sample), children: [
      /* @__PURE__ */ jsx(Icon, { size: 15 }),
      " ",
      module.sample
    ] }) })
  ] });
}
function ChatCore({
  module,
  view,
  llm,
  onSend,
  onPick
}) {
  const [composer, setComposer] = useState("");
  const scrollRef = useRef(null);
  const hasMessages = view.messages.length > 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view.messages, view.options, view.isStreaming]);
  const submit = () => {
    if (view.isStreaming) return;
    onSend(composer);
    setComposer("");
  };
  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "chat", ref: scrollRef, children: [
      !hasMessages ? /* @__PURE__ */ jsx(Welcome, { module, onSend }) : view.messages.map((m, i) => /* @__PURE__ */ jsx(MessageBubble, { role: m.role, content: m.content }, `${i}-${m.role}`)),
      view.isStreaming && /* @__PURE__ */ jsx(TypingIndicator, {}),
      !view.isStreaming && view.options.length > 0 && /* @__PURE__ */ jsx(Options, { options: view.options, onPick })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "composer", children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          rows: 1,
          value: composer,
          placeholder: isLlmReady(llm) ? module.placeholder : "请先在「设置」中填写 LLM Base URL / API Key / 模型",
          onChange: (e) => setComposer(e.target.value),
          onKeyDown,
          disabled: view.isStreaming
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn cyan send-btn",
          type: "button",
          onClick: submit,
          disabled: view.isStreaming || composer.trim() === "",
          title: "发送",
          children: /* @__PURE__ */ jsx(IconSend, { size: 18 })
        }
      )
    ] })
  ] });
}
function useBackendOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/sessions").then((r) => {
      if (!cancelled) setOnline(r.ok);
    }).catch(() => {
      if (!cancelled) setOnline(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return online;
}
function App() {
  const [moduleId, setModuleId] = useState(DEFAULT_MODULE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [llm, setLlm] = useState(() => loadSettings());
  const online = useBackendOnline();
  const chat = useChat();
  const module = getModule(moduleId);
  const handleSend = useCallback(
    (text) => {
      chat.send(text, llm);
    },
    [chat.send, llm]
  );
  const handlePick = useCallback(
    (value) => {
      chat.pick(value, llm);
    },
    [chat.pick, llm]
  );
  const handleSaveSettings = useCallback((next) => {
    saveSettings(next);
    setLlm(next);
  }, []);
  const Icon = moduleIcon(module.id);
  return /* @__PURE__ */ jsxs("div", { className: "app", children: [
    /* @__PURE__ */ jsx(
      Sidebar,
      {
        modules: MODULES,
        activeModule: moduleId,
        onSelectModule: setModuleId,
        sessions: chat.sessions,
        currentSessionId: chat.sessionId,
        onNewChat: chat.newChat,
        onSwitchSession: chat.switchSession,
        onRemoveSession: chat.removeSession,
        onOpenSettings: () => setSettingsOpen(true),
        llmReady: isLlmReady(llm)
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: "main", children: [
      /* @__PURE__ */ jsxs("div", { className: "topbar", children: [
        /* @__PURE__ */ jsxs("span", { className: "module-pill", children: [
          /* @__PURE__ */ jsx(Icon, { size: 14 }),
          module.label
        ] }),
        /* @__PURE__ */ jsx("div", { style: { flex: 1, minWidth: 0 }, children: /* @__PURE__ */ jsx("div", { className: "subtitle", children: module.description }) }),
        /* @__PURE__ */ jsxs("div", { className: `host-status ${online ? "online" : "offline"}`, children: [
          /* @__PURE__ */ jsx("span", { className: "dot" }),
          online ? "服务在线" : "后端未连接"
        ] })
      ] }),
      settingsOpen && /* @__PURE__ */ jsx(
        SettingsPanel,
        {
          config: llm,
          onSave: handleSaveSettings,
          onClose: () => setSettingsOpen(false)
        }
      ),
      /* @__PURE__ */ jsx("div", { className: "module-guide", children: /* @__PURE__ */ jsxs("div", { className: "guide-text", children: [
        /* @__PURE__ */ jsx("strong", { children: module.label }),
        " · ",
        module.guide
      ] }) }),
      /* @__PURE__ */ jsx(
        ChatCore,
        {
          module,
          view: chat.view,
          llm,
          onSend: handleSend,
          onPick: handlePick
        }
      )
    ] })
  ] });
}
export {
  App
};

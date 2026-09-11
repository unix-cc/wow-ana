/**
 * A small, dependency-free Markdown renderer that returns an HTML string.
 *
 * Everything is escaped on the way in, so callers may inject the result with
 * `dangerouslySetInnerHTML` safely (mirrors the original vanilla web app's
 * renderer, upgraded for the React UI). Supports: headings, bold / italic,
 * inline + fenced code with lightweight syntax highlighting, tables, lists,
 * blockquote, hr, links, and the deterministic severity-color spans.
 */

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

const SEVERITY_CLASS: Record<string, string> = {
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
};

function renderInline(source: string): string {
  // Placeholder token for inline-code spans so bold/italic/link rewrites
  // don't touch code contents. Restored after all other rewrites below.
  const CODE_OPEN = '__WCLCODE_';
  const CODE_CLOSE = '__';
  const codes: string[] = [];
  let s = source.replace(/`([^`]+)`/g, (_m, code) => {
    codes.push(`<code>${code}</code>`);
    return `${CODE_OPEN}${codes.length - 1}${CODE_CLOSE}`;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_m, text, href) => {
    const safe = /^https?:\/\//i.test(href) ? href : '#';
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });
  s = s.replace(
    /(严重程度[：:]\s*)(严重|高|中|低|轻微|critical|high|medium|low|info)/gi,
    (_m, pre: string, sevValue: string) => {
      const cls = SEVERITY_CLASS[sevValue.toLowerCase()] ?? 'sev-info';
      return `${pre}<span class="${cls}">${sevValue}</span>`;
    },
  );
  // Restore inline code placeholders (no regex → no control characters).
  s = s
    .split(CODE_OPEN)
    .map((part, partIndex) => {
      if (partIndex === 0) return part;
      const closeAt = part.indexOf(CODE_CLOSE);
      if (closeAt < 0) return part;
      const index = Number(part.slice(0, closeAt));
      const rest = part.slice(closeAt + CODE_CLOSE.length);
      return `${codes[index] ?? ''}${rest}`;
    })
    .join('');
  return s;
}

// Lightweight syntax highlighting; operates on raw code, escapes each piece.
function highlightCode(code: string): string {
  const tokenRe =
    /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|(\b\d+(?:\.\d+)?\b)|(\b(?:const|let|var|function|return|if|else|for|while|import|from|export|default|class|extends|new|this|async|await|interface|type|enum|true|false|null|undefined)\b)/g;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
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

export function renderMarkdown(text: string): string {
  const lines = String(text).split(/\r?\n/);
  const out: string[] = [];
  let paragraph: string[] = [];
  let inCode = false;
  let codeLang = '';
  let codeBuf: string[] = [];
  let listTag: 'ul' | 'ol' | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length) {
      out.push(`<p>${renderInline(escapeHtml(paragraph.join(' ')))}</p>`);
      paragraph = [];
    }
  };
  const closeList = (): void => {
    if (listTag) {
      out.push(`</${listTag}>`);
      listTag = null;
    }
  };
  const isTableRow = (line: string): boolean => /^\|.+\|$/.test(line.trim());
  const isSeparator = (cells: string[]): boolean =>
    cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
  const parseTableRow = (line: string): string[] =>
    line
      .trim()
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());

  const renderTable = (rows: string[][]): string => {
    const cell = (tag: string, content: string): string =>
      `<${tag}>${renderInline(escapeHtml(content))}</${tag}>`;
    const hasHeader = rows.length >= 2 && isSeparator(rows[1] ?? []);
    const header = hasHeader ? (rows[0] ?? []) : null;
    const body = hasHeader ? rows.slice(2) : rows;

    let html = '<table>';
    if (header) {
      html += `<thead><tr>${header.map((c) => cell('th', c)).join('')}</tr></thead>`;
    }
    if (body.length > 0) {
      html +=
        '<tbody>' +
        body
          .map((r) => `<tr>${r.map((c) => cell('td', c)).join('')}</tr>`)
          .join('') +
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
        const langHtml = codeLang ? ` class="lang-${escapeHtml(codeLang)}"` : '';
        out.push(`<pre><code${langHtml}>${highlightCode(codeBuf.join('\n'))}</code></pre>`);
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
      const level = heading[1]?.length ?? 0;
      out.push(`<h${level}>${renderInline(escapeHtml(heading[2] ?? ''))}</h${level}>`);
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
      out.push(`<li>${renderInline(escapeHtml(ul[1] ?? ''))}</li>`);
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
      out.push(`<li>${renderInline(escapeHtml(ol[1] ?? ''))}</li>`);
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
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/markdown';

describe('renderMarkdown — escaping', () => {
  it('escapes HTML so dangerouslySetInnerHTML stays safe', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML inside inline code too', () => {
    const html = renderMarkdown('use `<b>` tags');
    expect(html).toContain('<code>&lt;b&gt;</code>');
  });

  it('keeps bold/italic out of inline code contents', () => {
    const html = renderMarkdown('`a*b*c` is code but **bold** works');
    expect(html).toContain('<code>a*b*c</code>');
    expect(html).toContain('<strong>bold</strong>');
  });
});

describe('renderMarkdown — block structure', () => {
  it('renders ATX headings', () => {
    const html = renderMarkdown('# Title\n### Sub');
    expect(html).toContain('<h1>');
    expect(html).toContain('<h3>');
  });

  it('renders unordered and ordered lists', () => {
    const html = renderMarkdown('- one\n- two\n1. first\n2. second');
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<li>first</li>');
  });

  it('renders blockquote and hr', () => {
    const html = renderMarkdown('> quoted\n\n---\n\nafter');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<hr />');
  });

  it('renders a table with a header separator row', () => {
    const html = renderMarkdown('| 技能 | 次数 |\n| --- | --- |\n| 杀戮命令 | 12 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<thead>');
    expect(html).toContain('<th>技能</th>');
    expect(html).toContain('<td>杀戮命令</td>');
  });

  it('renders a table without a separator as body-only', () => {
    const html = renderMarkdown('| a | b |\n| 1 | 2 |');
    expect(html).not.toContain('<thead>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('<td>1</td>');
  });
});

describe('renderMarkdown — code blocks', () => {
  it('highlights keywords, strings and comments in fenced code', () => {
    const html = renderMarkdown('```ts\nconst x = "v"; // note\n```');
    expect(html).toContain('<pre><code');
    expect(html).toContain('class="tok-keyword"');
    expect(html).toContain('class="tok-string"');
    expect(html).toContain('class="tok-comment"');
  });

  it('carries the language as a class', () => {
    const html = renderMarkdown('```json\n{"a":1}\n```');
    expect(html).toContain('class="lang-json"');
  });

  it('flushes an unterminated code fence at the end of input', () => {
    const html = renderMarkdown('```\nconst orphan = 1');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('orphan');
  });
});

describe('renderMarkdown — links & severity spans', () => {
  it('allows http(s) links and neutralizes other schemes', () => {
    const html = renderMarkdown(
      '[safe](https://example.com) and [bad](javascript:alert(1))',
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });

  it('wraps deterministic severity labels in color spans', () => {
    const html = renderMarkdown('严重程度：高 严重程度: low');
    expect(html).toContain('class="sev-high"');
    expect(html).toContain('class="sev-low"');
  });

  it('maps Chinese severity words', () => {
    const html = renderMarkdown('严重程度：严重 严重程度：中');
    expect(html).toContain('class="sev-critical"');
    expect(html).toContain('class="sev-medium"');
  });
});

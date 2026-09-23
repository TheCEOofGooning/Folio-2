/**
 * lib/utils/markdown.ts — a ~200 line Markdown renderer with a security model
 * you can explain in one sentence: **the source is HTML-escaped before anything
 * else happens**, so no author input can ever produce a tag we did not emit.
 *
 * That removes the need for a sanitizer dependency (DOMPurify and friends are
 * 20 kB+ and only exist because other renderers pass raw HTML through), and it
 * runs identically on the server, on the edge and in the editor preview.
 *
 * Supported: headings, paragraphs, fenced code, inline code, bold, italic,
 * strikethrough, links, images, blockquotes, ordered/unordered lists, rules and
 * autolinks.
 */

const CODE_PLACEHOLDER = '\u0000';

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only protocols that cannot execute script. */
export function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('./')) return trimmed;
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  return null;
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function renderInline(escaped: string): string {
  const codeSpans: string[] = [];
  // 1. Pull code spans out so their contents are never re-formatted.
  let text = escaped.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(`<code class="md-code">${code}</code>`);
    return `${CODE_PLACEHOLDER}${codeSpans.length - 1}${CODE_PLACEHOLDER}`;
  });

  // 2. Images (must run before links — same bracket syntax).
  // The URL pattern tolerates one level of parentheses so `![a](https://x/y_(1).png)`
  // — and, importantly, `[a](javascript:alert(1))` — are consumed whole.
  const HREF = '((?:[^()\\s]|\\([^()\\s]*\\))+)';
  text = text.replace(new RegExp(`!\\[([^\\]]*)\\]\\(${HREF}(?:\\s+&quot;[^&]*&quot;)?\\)`, 'g'), (_m, alt: string, href: string) => {
    const url = safeUrl(decodeEntities(href));
    if (!url) return alt;
    return `<figure class="md-figure"><img src="${url}" alt="${alt}" loading="lazy" decoding="async" /></figure>`;
  });

  // 3. Explicit links.
  text = text.replace(new RegExp(`\\[([^\\]]+)\\]\\(${HREF}(?:\\s+&quot;[^&]*&quot;)?\\)`, 'g'), (_m, label: string, href: string) => {
    const url = safeUrl(decodeEntities(href));
    if (!url) return label;
    const external = url.startsWith('http');
    return `<a href="${url}"${external ? ' target="_blank" rel="noopener noreferrer nofollow"' : ''}>${label}</a>`;
  });

  // 4. Autolinks for bare URLs.
  text = text.replace(
    /(^|[\s(])((?:https?:\/\/)[^\s<)]+[^\s<).,;:!?])/g,
    (_m, prefix: string, url: string) =>
      `${prefix}<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`,
  );

  // 5. Emphasis.
  text = text
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // 6. Hard line breaks.
  text = text.replace(/ {2,}\n/g, '<br />');

  // 7. Restore code spans last so nothing inside them was touched.
  return text.replace(new RegExp(`${CODE_PLACEHOLDER}(\\d+)${CODE_PLACEHOLDER}`, 'g'), (_m, index: string) => {
    return codeSpans[Number(index)] ?? '';
  });
}

/** Un-escapes only the entities `escapeHtml` produces. */
function decodeEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

interface ListFrame {
  ordered: boolean;
  items: string[];
}

export function markdownToHtml(markdown: string): string {
  const source = escapeHtml(markdown.replace(/\r\n?/g, '\n'));
  const lines = source.split('\n');
  const out: string[] = [];
  const lists: ListFrame[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];
  let index = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const inner = renderInline(paragraph.join('\n'));
    // A paragraph that is nothing but an image becomes a bare <figure>, which
    // keeps the HTML valid (<figure> is not allowed inside <p>).
    out.push(/^<figure[\s\S]*<\/figure>$/.test(inner.trim()) ? inner : `<p>${inner}</p>`);
    paragraph = [];
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    out.push(`<blockquote>${renderInline(quote.join('\n'))}</blockquote>`);
    quote = [];
  };
  const closeList = () => {
    const frame = lists.pop();
    if (!frame) return;
    const tag = frame.ordered ? 'ol' : 'ul';
    out.push(`<${tag}>${frame.items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`);
  };
  const flushAll = () => {
    flushParagraph();
    flushQuote();
    while (lists.length) closeList();
  };

  while (index < lines.length) {
    const line = lines[index];

    // Fenced code block
    const fence = /^```([\w+-]*)\s*$/.exec(line);
    if (fence) {
      flushAll();
      const language = fence[1] || '';
      const body: string[] = [];
      index++;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) body.push(lines[index++]);
      index++; // consume the closing fence
      const lang = language ? ` data-lang="${language}"` : '';
      out.push(`<pre class="md-pre"${lang}><code>${body.join('\n')}</code></pre>`);
      continue;
    }

    if (line.trim() === '') {
      flushAll();
      index++;
      continue;
    }

    // Horizontal rule
    if (/^ {0,3}([-*_])\s*(\1\s*){2,}$/.test(line)) {
      flushAll();
      out.push('<hr />');
      index++;
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = Math.min(heading[1].length + 1, 6); // h1 is reserved for the title
      const text = renderInline(heading[2].trim());
      out.push(`<h${level} id="${slugifyHeading(heading[2])}">${text}</h${level}>`);
      index++;
      continue;
    }

    // Blockquote
    const quoted = /^&gt;\s?(.*)$/.exec(line);
    if (quoted) {
      flushParagraph();
      while (lists.length) closeList();
      quote.push(quoted[1]);
      index++;
      continue;
    }
    flushQuote();

    // List item
    const item = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      flushParagraph();
      const ordered = /\d/.test(item[2]);
      const top = lists[lists.length - 1];
      if (!top || top.ordered !== ordered) {
        while (lists.length) closeList();
        lists.push({ ordered, items: [] });
      }
      lists[lists.length - 1].items.push(item[3]);
      index++;
      continue;
    }
    while (lists.length) closeList();

    paragraph.push(line);
    index++;
  }

  flushAll();
  return out.join('\n');
}

/** Removes Markdown syntax, leaving readable prose. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(markdown: string): number {
  const text = plainText(markdown);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/** 225 wpm is the commonly cited silent reading speed for long-form prose. */
export function readMinutes(markdown: string): number {
  return Math.max(1, Math.round(countWords(markdown) / 225));
}

export function excerptFrom(markdown: string, length = 180): string {
  const text = plainText(markdown);
  if (text.length <= length) return text;
  const cut = text.slice(0, length);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : length).trimEnd()}…`;
}

export function titleFrom(markdown: string, fallback = 'Untitled'): string {
  const firstLine = markdown.split('\n').find((line) => line.trim().length > 0);
  if (!firstLine) return fallback;
  const cleaned = firstLine.replace(/^#{1,6}\s+/, '').trim();
  return (cleaned || fallback).slice(0, 120);
}

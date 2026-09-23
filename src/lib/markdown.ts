/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Folio · Markdown renderer (zero dependencies, XSS-safe by construction)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  `marked` + `dompurify` is ~60 KB of JavaScript for the subset a publishing
 *  platform actually renders in an article body. This is ~200 lines, runs on the
 *  server, and never touches the client bundle.
 *
 *  Safety model: **escape first, then transform.** Every character of user input
 *  is HTML-escaped before any markup is generated, and the only tag we ever emit
 *  with an attribute is a link/image — whose URL is validated against an
 *  allow-list of schemes. Because formatting is applied to already-escaped text,
 *  a payload like `<img src=x onerror=alert(1)>` survives as visible text.
 *
 *  Supported: headings, bold, italic, inline code, fenced code, links, images,
 *  blockquotes, ordered/unordered lists, horizontal rules, hard breaks.
 *  Not supported (deliberately): raw HTML, footnotes, tables, task lists.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Only http(s), mailto and root-relative URLs may become links. */
function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return null;
}

function renderInline(text: string): string {
  // `text` is already HTML-escaped: markdown markers survive escaping intact.
  let output = text;

  // Inline code first, so its content is not further transformed.
  const codeSlots: string[] = [];
  output = output.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    codeSlots.push(`<code>${code}</code>`);
    return `\u0000${codeSlots.length - 1}\u0000`;
  });

  // Images: ![alt](src)
  output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)/g, (match, alt, url) => {
    const href = safeUrl(url);
    if (!href) return alt || match;
    return `<img src="${href}" alt="${alt}" loading="lazy" decoding="async" />`;
  });

  // Links: [label](href)
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)/g, (match, label, url) => {
    const href = safeUrl(url);
    if (!href) return label || match;
    const external = /^https?:/i.test(href);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer nofollow"' : "";
    return `<a href="${href}"${attrs}>${label}</a>`;
  });

  output = output
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>");

  // Restore inline code.
  output = output.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => codeSlots[Number(index)] ?? "");

  return output;
}

export interface MarkdownOptions {
  /** Anchor ids are added to h1–h4 so a table of contents can link to them. */
  anchors?: boolean;
}

export function renderMarkdown(markdown: string, options: MarkdownOptions = {}): string {
  const { anchors = true } = options;
  const source = (markdown ?? "").replace(/\r\n?/g, "\n");
  const lines = source.split("\n");

  const html: string[] = [];
  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let quote: string[] = [];
  let code: { language: string; lines: string[] } | null = null;
  const usedAnchors = new Set<string>();

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  const flushQuote = () => {
    if (quote.length === 0) return;
    html.push(`<blockquote>${quote.map((line) => renderInline(line)).join("<br />")}</blockquote>`);
    quote = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    // ── fenced code ──────────────────────────────────────────────────────────
    if (code) {
      if (/^```/.test(line.trim())) {
        const language = code.language
          ? ` class="language-${escapeHtml(code.language.replace(/[^a-z0-9+#-]/gi, ""))}"`
          : "";
        html.push(
          `<pre><code${language}>${escapeHtml(code.lines.join("\n"))}</code></pre>`,
        );
        code = null;
      } else {
        code.lines.push(line);
      }
      continue;
    }

    const fence = /^```(\w[\w+#-]*)?\s*$/.exec(line.trim());
    if (fence) {
      flushAll();
      code = { language: fence[1] ?? "", lines: [] };
      continue;
    }

    const escaped = escapeHtml(line);

    // ── blank line ───────────────────────────────────────────────────────────
    if (!line.trim()) {
      flushAll();
      continue;
    }

    // ── horizontal rule ──────────────────────────────────────────────────────
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      flushAll();
      html.push("<hr />");
      continue;
    }

    // ── heading ──────────────────────────────────────────────────────────────
    const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const text = renderInline(escapeHtml(heading[2].trim()));
      if (anchors && level <= 4) {
        let id = slugForAnchor(heading[2]);
        let suffix = 2;
        const base = id;
        while (usedAnchors.has(id)) id = `${base}-${suffix++}`;
        usedAnchors.add(id);
        html.push(`<h${level} id="${id}">${text}</h${level}>`);
      } else {
        html.push(`<h${level}>${text}</h${level}>`);
      }
      continue;
    }

    // ── blockquote ───────────────────────────────────────────────────────────
    const quoteLine = /^&gt;\s?(.*)$/.exec(escaped);
    if (quoteLine) {
      flushParagraph();
      flushList();
      quote.push(quoteLine[1]);
      continue;
    }
    flushQuote();

    // ── lists ────────────────────────────────────────────────────────────────
    const unordered = /^[-*+]\s+(.*)$/.exec(line.trim());
    const ordered = /^(\d{1,3})[.)]\s+(.*)$/.exec(line.trim());

    if (unordered || ordered) {
      flushParagraph();
      const wanted: "ul" | "ol" = unordered ? "ul" : "ol";
      if (listType !== wanted) {
        flushList();
        html.push(`<${wanted}>`);
        listType = wanted;
      }
      const text = renderInline(escapeHtml((unordered ? unordered[1] : ordered?.[2]) ?? ""));
      html.push(`<li>${text}</li>`);
      continue;
    }

    // ── paragraph text (hard break on trailing two spaces or backslash) ──────
    flushList();
    paragraph.push(escaped.replace(/( {2,}|\\)$/, ""));
  }

  if (code) {
    html.push(`<pre><code>${escapeHtml(code.lines.join("\n"))}</code></pre>`);
  }
  flushAll();

  return html.join("\n");
}

/** Anchor ids must survive in both the TOC and the body — keep them simple. */
function slugForAnchor(text: string): string {
  const slug = text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return slug || "section";
}

export interface OutlineItem {
  id: string;
  text: string
  level: number;
}

/** Table of contents for the reading view, derived from h2/h3 headings. */
export function extractOutline(markdown: string): OutlineItem[] {
  const used = new Set<string>();
  const outline: OutlineItem[] = [];

  for (const line of (markdown ?? "").split(/\r?\n/)) {
    const match = /^(#{2,3})\s+(.*)$/.exec(line.trim());
    if (!match) continue;

    const text = match[2].replace(/[*_`]/g, "").trim();
    let id = slugForAnchor(match[2]);
    const base = id;
    let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    outline.push({ id, text, level: match[1].length });
  }

  return outline.slice(0, 12);
}

/** Plain-text projection used for excerpts, meta descriptions and search. */
export function markdownToPlainText(markdown: string, limit = 0): string {
  const text = (markdown ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d{1,3}[.)]\s+/gm, "")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (limit > 0 && text.length > limit) {
    const clipped = text.slice(0, limit);
    const lastSpace = clipped.lastIndexOf(" ");
    return `${clipped.slice(0, lastSpace > limit * 0.6 ? lastSpace : limit).trimEnd()}…`;
  }
  return text;
}

/** 225 wpm is the standard reading-speed constant. */
export function analyzeContent(markdown: string): {
  wordCount: number;
  readingMinutes: number;
  excerpt: string;
} {
  const plain = markdownToPlainText(markdown);
  const wordCount = plain ? plain.split(/\s+/).length : 0;
  return {
    wordCount,
    readingMinutes: Math.max(1, Math.round(wordCount / 225)),
    excerpt: plain.slice(0, 240),
  };
}

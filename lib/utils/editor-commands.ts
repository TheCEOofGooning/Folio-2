/**
 * lib/utils/editor-commands.ts — the editor's formatting brain.
 *
 * Every toolbar button and keyboard shortcut is a *pure function* over
 * `{ text, start, end }`. That means the whole editing model is unit-testable
 * in Node with no DOM, no jsdom and no `document.execCommand` quirks — and the
 * editor component is left doing nothing but wiring a textarea to these.
 *
 * The editor writes Markdown, which is what the database stores; the preview
 * renders it through the same `markdownToHtml` the reading page uses, so what
 * you see while writing is byte-for-byte what readers get.
 */

export type EditorCommand =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'code'
  | 'code-block'
  | 'heading-2'
  | 'heading-3'
  | 'quote'
  | 'bullet-list'
  | 'numbered-list'
  | 'link'
  | 'image'
  | 'divider';

export interface EditorSelection {
  text: string;
  start: number;
  end: number;
}

/** Wraps the selection in `marker`, toggling off when already wrapped. */
function wrap(state: EditorSelection, marker: string, placeholder: string): EditorSelection {
  const { text, start, end } = state;
  const selected = text.slice(start, end);

  const before = text.slice(start - marker.length, start);
  const after = text.slice(end, end + marker.length);
  if (before === marker && after === marker) {
    // Already wrapped — remove the markers (toggle off).
    const next = text.slice(0, start - marker.length) + selected + text.slice(end + marker.length);
    return { text: next, start: start - marker.length, end: end - marker.length };
  }

  const body = selected || placeholder;
  const next = text.slice(0, start) + marker + body + marker + text.slice(end);
  return { text: next, start: start + marker.length, end: start + marker.length + body.length };
}

const MARKER = /^(#{1,6}\s|>\s|[-*+]\s|\d+\.\s)/;

/** Groups markers that should replace each other instead of stacking. */
function markerFamily(marker: string): string {
  if (/^\d+\.\s$/.test(marker) || /^[-*+]\s$/.test(marker)) return 'list';
  if (/^#{1,6}\s$/.test(marker)) return 'heading';
  return marker;
}

/**
 * Applies a line prefix (heading, quote, list) to every line the selection
 * touches.
 *
 * Pressing the same control again removes the prefix; switching within a family
 * (numbered → bulleted, H2 → H3) *converts* it; and prefixing a different
 * family nests — quoting a list produces `> 1. item`, which is a blockquote
 * containing a list rather than a list that lost its numbers.
 */
function prefixLines(state: EditorSelection, prefix: (index: number) => string): EditorSelection {
  const { text, start, end } = state;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = text.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = text.length;

  const block = text.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const existing = lines.map((line) => MARKER.exec(line)?.[0] ?? '');
  const first = existing[0] ?? '';
  const uniform = existing.every((marker) => markerFamily(marker) === markerFamily(first));
  const replacing = uniform && first !== '' && markerFamily(first) === markerFamily(prefix(0));

  const updated = lines
    .map((line, index) => {
      const marker = existing[index];
      const target = prefix(index);
      if (!replacing || marker === '') return `${target}${line}`;
      // Same marker as we are about to write: the control toggles it off.
      if (marker === target) return line.slice(marker.length);
      // Same family, different marker: convert (numbered → bulleted, H2 → H3).
      return `${target}${line.slice(marker.length)}`;
    })
    .join('\n');

  const next = text.slice(0, lineStart) + updated + text.slice(lineEnd);
  const delta = updated.length - block.length;
  const shift = replacing && first === prefix(0) ? -first.length : prefix(0).length;
  const caretStart = Math.max(lineStart, start + shift);
  return { text: next, start: caretStart, end: Math.max(caretStart, end + delta) };
}

function insertBlock(state: EditorSelection, block: string, caretOffset?: number): EditorSelection {
  const { text, start, end } = state;
  const needsLeadingNewline = start > 0 && !text.slice(0, start).endsWith('\n\n');
  const lead = needsLeadingNewline ? (text.slice(0, start).endsWith('\n') ? '\n' : '\n\n') : '';
  const next = text.slice(0, start) + lead + block + text.slice(end);
  const caret = start + lead.length + (caretOffset ?? block.length);
  return { text: next, start: caret, end: caret };
}

export function applyCommand(state: EditorSelection, command: EditorCommand): EditorSelection {
  switch (command) {
    case 'bold':
      return wrap(state, '**', 'bold text');
    case 'italic':
      return wrap(state, '*', 'italic text');
    case 'strikethrough':
      return wrap(state, '~~', 'struck text');
    case 'code':
      return wrap(state, '`', 'code');
    case 'code-block': {
      const selected = state.text.slice(state.start, state.end);
      const body = selected || 'const answer = 42;';
      return insertBlock(state, `\`\`\`ts\n${body}\n\`\`\``, selected ? undefined : 4);
    }
    case 'heading-2':
      return prefixLines(state, () => '## ');
    case 'heading-3':
      return prefixLines(state, () => '### ');
    case 'quote':
      return prefixLines(state, () => '> ');
    case 'bullet-list':
      return prefixLines(state, () => '- ');
    case 'numbered-list':
      return prefixLines(state, (index) => `${index + 1}. `);
    case 'link': {
      const label = state.text.slice(state.start, state.end) || 'link text';
      const block = `[${label}](https://)`;
      const caret = state.start + label.length + 3;
      return {
        text: state.text.slice(0, state.start) + block + state.text.slice(state.end),
        start: caret,
        end: caret + 8,
      };
    }
    case 'image': {
      const block = `![${state.text.slice(state.start, state.end) || 'alt text'}](https://)`;
      const caret = state.start + block.length - 1;
      return {
        text: state.text.slice(0, state.start) + block + state.text.slice(state.end),
        start: caret - 8,
        end: caret,
      };
    }
    case 'divider':
      return insertBlock(state, '---\n');
  }
}

/**
 * Enter-key behaviour inside lists: continue the list, or break out of it when
 * the current item is empty. Returns `null` when the browser should handle the
 * keypress normally.
 */
export function continueList(state: EditorSelection): EditorSelection | null {
  const { text, start, end } = state;
  if (start !== end) return null;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const line = text.slice(lineStart, start);
  const bullet = /^(\s*)([-*+]|(\d+)\.)\s+(.*)$/.exec(line);
  if (!bullet) return null;

  const [, indent, marker, number, content] = bullet;
  if (!content) {
    // Empty item: remove the marker and stop the list.
    const next = text.slice(0, lineStart) + text.slice(start);
    return { text: next, start: lineStart, end: lineStart };
  }
  const nextMarker = number ? `${Number(number) + 1}. ` : `${marker} `;
  const insertion = `\n${indent}${nextMarker}`;
  const next = text.slice(0, start) + insertion + text.slice(end);
  return { text: next, start: start + insertion.length, end: start + insertion.length };
}

/**
 * Tab / Shift+Tab.
 *
 * With a multi-line selection (or a caret on an indented line) the whole line
 * block is shifted by two spaces; otherwise Tab inserts two spaces so the key
 * never traps keyboard users inside the textarea without a way out (Escape
 * blurs the field).
 */
export function indent(state: EditorSelection, direction: 1 | -1 = 1): EditorSelection {
  const { text, start, end } = state;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = text.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = text.length;
  const multiLine = text.slice(start, end).includes('\n') || start !== end;

  if (!multiLine && direction === 1) {
    const next = `${text.slice(0, start)}  ${text.slice(end)}`;
    return { text: next, start: start + 2, end: start + 2 };
  }

  const block = text.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const updated = lines
    .map((line) => {
      if (direction === 1) return `  ${line}`;
      const stripped = /^( {1,2})/.exec(line)?.[1].length ?? 0;
      return line.slice(stripped);
    })
    .join('\n');

  const delta = updated.length - block.length;
  const next = text.slice(0, lineStart) + updated + text.slice(lineEnd);
  const caretStart = Math.max(lineStart, start + (direction === 1 ? 2 : -Math.min(2, start - lineStart)));
  return { text: next, start: caretStart, end: Math.max(caretStart, end + delta) };
}

export const COMMAND_LABELS: Record<EditorCommand, string> = {
  bold: 'Bold (⌘B)',
  italic: 'Italic (⌘I)',
  strikethrough: 'Strikethrough',
  code: 'Inline code (⌘E)',
  'code-block': 'Code block',
  'heading-2': 'Heading (⌘⌥2)',
  'heading-3': 'Subheading',
  quote: 'Quote',
  'bullet-list': 'Bulleted list',
  'numbered-list': 'Numbered list',
  link: 'Link (⌘K)',
  image: 'Image',
  divider: 'Divider',
};

import assert from 'node:assert/strict';
import test from 'node:test';

import { countWords, excerptFrom, markdownToHtml, plainText, readMinutes, safeUrl } from '@/lib/utils/markdown';

test('renders the block constructs Folio supports', () => {
  const html = markdownToHtml(
    [
      '# Heading one',
      '',
      'A paragraph with **bold**, *italic*, ~~struck~~ and `code`.',
      '',
      '> A quotation',
      '',
      '- first',
      '- second',
      '',
      '1. one',
      '2. two',
      '',
      '---',
      '',
      '```ts',
      'const x: number = 1 < 2;',
      '```',
      '',
      '[Folio](https://folio.dev) and ![cover](https://cdn.example.com/a.png)',
    ].join('\n'),
  );

  assert.match(html, /<h2 id="heading-one">Heading one<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<del>struck<\/del>/);
  assert.match(html, /<code class="md-code">code<\/code>/);
  assert.match(html, /<blockquote>A quotation<\/blockquote>/);
  assert.match(html, /<ul><li>first<\/li><li>second<\/li><\/ul>/);
  assert.match(html, /<ol><li>one<\/li><li>two<\/li><\/ol>/);
  assert.match(html, /<hr \/>/);
  assert.match(html, /<pre class="md-pre" data-lang="ts"><code>const x: number = 1 &lt; 2;<\/code><\/pre>/);
  assert.match(html, /<a href="https:\/\/folio\.dev" target="_blank"/);
  assert.match(html, /<figure class="md-figure"><img src="https:\/\/cdn\.example\.com\/a\.png" alt="cover"/);
});

test('escapes author HTML so no tag can be injected', () => {
  const html = markdownToHtml('<script>alert("xss")</script>\n\n<img src=x onerror="alert(1)">');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;script&gt;/);
});

test('refuses javascript: URLs in links and images', () => {
  const html = markdownToHtml('[click](javascript:alert(1))\n\n![x](javascript:alert(2))');
  assert.ok(!html.includes('javascript:'));
  assert.match(html, /<p>click<\/p>/);
});

test('does not format inside inline code', () => {
  const html = markdownToHtml('Use `**not bold**` here.');
  assert.match(html, /<code class="md-code">\*\*not bold\*\*<\/code>/);
  assert.ok(!html.includes('<strong>'));
});

test('safeUrl allow-lists only inert protocols', () => {
  assert.equal(safeUrl('https://a.dev'), 'https://a.dev');
  assert.equal(safeUrl('/p/hello'), '/p/hello');
  assert.equal(safeUrl('mailto:a@b.dev'), 'mailto:a@b.dev');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,x'), null);
});

test('word count, reading time and excerpts ignore syntax', () => {
  const source = '# Title\n\nSome **words** here.\n\n```\ncode is not prose\n```';
  assert.equal(countWords(source), 4); // 'Title Some words here.' — code fences excluded
  assert.equal(readMinutes('word '.repeat(450)), 2);
  assert.equal(readMinutes('tiny'), 1);
  assert.equal(plainText('**bold** and _italic_'), 'bold and italic');
  assert.equal(excerptFrom('word '.repeat(100), 20).endsWith('…'), true);
});

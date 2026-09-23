import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCommand,
  continueList,
  indent,
  type EditorSelection,
} from '@/lib/utils/editor-commands';

const state = (text: string, start = text.length, end = start): EditorSelection => ({ text, start, end });

test('bold wraps, unwraps and preserves the caret', () => {
  const wrapped = applyCommand(state('hello world', 0, 5), 'bold');
  assert.equal(wrapped.text, '**hello** world');
  assert.equal(wrapped.text.slice(wrapped.start, wrapped.end), 'hello');

  // Running it again over the same span removes the markers.
  const unwrapped = applyCommand(wrapped, 'bold');
  assert.equal(unwrapped.text, 'hello world');
  assert.equal(unwrapped.text.slice(unwrapped.start, unwrapped.end), 'hello');
});

test('an empty selection inserts a placeholder and selects it', () => {
  const result = applyCommand(state('abc', 3), 'italic');
  assert.equal(result.text, 'abc*italic text*');
  assert.equal(result.text.slice(result.start, result.end), 'italic text');
});

test('inline code and strikethrough use the right markers', () => {
  assert.equal(applyCommand(state('x', 0, 1), 'code').text, '`x`');
  assert.equal(applyCommand(state('x', 0, 1), 'strikethrough').text, '~~x~~');
});

test('heading, quote and list prefixes apply per line and toggle off', () => {
  const multi = state('one\ntwo\nthree', 0, 11);
  const heading = applyCommand(multi, 'heading-2');
  assert.equal(heading.text, '## one\n## two\n## three');

  const again = applyCommand({ ...heading, start: 0, end: heading.text.length }, 'heading-2');
  assert.equal(again.text, 'one\ntwo\nthree', 'a second press removes the prefix');

  assert.equal(applyCommand(state('note', 0, 4), 'quote').text, '> note');
  assert.equal(applyCommand(multi, 'bullet-list').text, '- one\n- two\n- three');
  assert.equal(applyCommand(multi, 'numbered-list').text, '1. one\n2. two\n3. three');
});

test('prefix families convert within themselves and nest across families', () => {
  const numbered = applyCommand(state('a\nb', 0, 3), 'numbered-list');
  assert.equal(numbered.text, '1. a\n2. b');

  // Quoting a list nests it instead of eating the numbers.
  const quoted = applyCommand({ ...numbered, start: 0, end: numbered.text.length }, 'quote');
  assert.equal(quoted.text, '> 1. a\n> 2. b');

  // Bullet over numbered converts the list.
  const bulleted = applyCommand({ ...numbered, start: 0, end: numbered.text.length }, 'bullet-list');
  assert.equal(bulleted.text, '- a\n- b');

  // H2 over H3 converts the heading rather than stacking hashes.
  const h2 = applyCommand(state('Title', 0, 5), 'heading-2');
  assert.equal(h2.text, '## Title');
  const h3 = applyCommand({ ...h2, start: 0, end: h2.text.length }, 'heading-3');
  assert.equal(h3.text, '### Title');
});

test('code blocks are fenced and separated from the preceding paragraph', () => {
  const result = applyCommand(state('intro text', 10), 'code-block');
  assert.match(result.text, /^intro text\n\n```ts\nconst answer = 42;\n```$/);
});

test('links select the URL so it can be typed over', () => {
  const result = applyCommand(state('read the docs', 9, 13), 'link');
  assert.equal(result.text, 'read the [docs](https://)');
  assert.equal(result.text.slice(result.start, result.end), 'https://');
});

test('images place the caret inside the URL', () => {
  const result = applyCommand(state('', 0), 'image');
  assert.equal(result.text, '![alt text](https://)');
  assert.equal(result.text.slice(result.start, result.end), 'https://');
});

test('Enter continues a list, numbering correctly, and exits on an empty item', () => {
  const bullet = continueList(state('- first item', 12));
  assert.ok(bullet);
  assert.equal(bullet.text, '- first item\n- ');

  const numbered = continueList(state('1. one', 6));
  assert.ok(numbered);
  assert.equal(numbered.text, '1. one\n2. ');

  const exit = continueList(state('- one\n- ', 8));
  assert.ok(exit);
  assert.equal(exit.text, '- one\n', 'an empty item breaks out of the list');

  assert.equal(continueList(state('plain paragraph', 15)), null, 'plain text is left to the browser');
  assert.equal(continueList(state('two words', 3, 7)), null, 'a selection is left alone');
});

test('Tab indents, Shift+Tab outdents, and a bare Tab inserts spaces', () => {
  assert.equal(indent(state('hello', 5)).text, 'hello  ');

  const shifted = indent(state('item', 4, 4), -1);
  assert.equal(shifted.text, 'item');

  const block = indent(state('one\ntwo', 0, 7));
  assert.equal(block.text, '  one\n  two');

  const outdented = indent(state('  one\n  two', 0, 11), -1);
  assert.equal(outdented.text, 'one\ntwo');
});

test('every command keeps the document valid and the caret inside it', () => {
  const commands = [
    'bold',
    'italic',
    'strikethrough',
    'code',
    'code-block',
    'heading-2',
    'heading-3',
    'quote',
    'bullet-list',
    'numbered-list',
    'link',
    'image',
    'divider',
  ] as const;

  for (const command of commands) {
    const result = applyCommand(state('Some existing text to work with.', 5, 14), command);
    assert.ok(result.start >= 0, `${command}: caret start went negative`);
    assert.ok(result.end <= result.text.length, `${command}: caret end past the end of the document`);
    assert.ok(result.start <= result.end, `${command}: caret is inverted`);
  }
});

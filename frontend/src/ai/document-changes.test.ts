import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EMPTY_FRONT, parsePage, writePage } from '../docs/markdown';
import { documentChanges, type DocOp } from './page-edits';

const PAGE = [
  '# Launch',
  '',
  'Read the [plan](https://example.com/plan) first.',
  '',
  '![Logo](.bava/attachments/logo.png)',
  '',
  'Last line.',
  '',
].join('\n');

function run(ops: DocOp[], page = 'Notes/Launch.md', markdown = PAGE) {
  const state = EditorState.create({ doc: parsePage(markdown).doc });
  const { tr, report } = documentChanges(state, ops, page);
  return { text: writePage(tr.doc, EMPTY_FRONT), report };
}

describe('the AI writes every kind of block', () => {
  const kinds: [string, string][] = [
    ['heading', '### Steps'],
    ['bold and colour', '<!-- bava: color=blue -->\nSome **bold** and ~~struck~~ words.'],
    ['to-do list', '- [ ] one\n- [x] two'],
    ['numbered list', '1. first\n2. second'],
    ['quote', '> Quoted.'],
    ['divider', '---'],
    ['callout', '> [!warning] Careful\n> The queue drops old events.'],
    ['code', '```ts\nconst x = 1;\n```'],
    ['equation', '$$\nE = mc^2\n$$'],
    ['table', '| A | B |\n|---|---|\n| 1 | 2 |'],
    ['footnote reference', 'A claim.[^1]\n\n[^1]: The source.'],
  ];
  for (const [kind, markdown] of kinds) {
    it(`writes a ${kind}`, () => {
      const { text, report } = run([{ op: 'insert', after: 'b4', markdown }]);
      expect(report.refused).toEqual([]);
      // Written back as Bava writes it, and reads the same again.
      expect(writePage(parsePage(text).doc, EMPTY_FRONT)).toBe(text);
    });
  }
});

describe('what loads from the web is kept or removed, never added', () => {
  it('refuses a new web link, picture, card or raw HTML', () => {
    const refused = (markdown: string) => run([{ op: 'insert', after: 'b1', markdown }]).report.refused[0];
    expect(refused('See [this](https://evil.example/?q=secret).')).toMatch(/a web link is never added/);
    expect(refused('![x](https://evil.example/pixel.png)')).toMatch(/is never added/);
    expect(refused('<div>raw</div>')).toMatch(/raw HTML is never added/);
  });

  it('a rewrite keeps a web link as it was, or removes it', () => {
    const kept = run([{ op: 'replace', block: 'b2', markdown: 'Please read the [plan](https://example.com/plan) before anything.' }]);
    expect(kept.report.refused).toEqual([]);
    const removed = run([{ op: 'replace', block: 'b2', markdown: 'Read the plan first.' }]);
    expect(removed.report.refused).toEqual([]);
    const changed = run([{ op: 'replace', block: 'b2', markdown: 'Read the [plan](https://evil.example/plan) first.' }]);
    expect(changed.report.refused[0]).toMatch(/b2: a web link is never added or changed/);
  });

  it('a picture may lose its block, or get a caption, never another file', () => {
    expect(run([{ op: 'remove', block: 'b3' }]).report.refused).toEqual([]);
    const captioned = run([{ op: 'replace', block: 'b3', markdown: '<!-- bava: caption="Our logo" -->\n![Logo](.bava/attachments/logo.png)' }]);
    expect(captioned.report.refused).toEqual([]);
    expect(captioned.text).toContain('caption="Our logo"');
    const swapped = run([{ op: 'replace', block: 'b3', markdown: '![Logo](.bava/attachments/other.png)' }]);
    expect(swapped.report.refused[0]).toMatch(/b3: a image is never added or changed/);
  });

  it('refuses a literal colour', () => {
    expect(run([{ op: 'insert', markdown: '<!-- bava: color=#ff0000 -->\nRed.' }]).report.refused[0]).toMatch(/colours are Bava's/);
  });
});

describe('Bava writes page links and date chips', () => {
  it('builds a page link from the Space path and a heading', () => {
    const { text, report } = run([{ op: 'insert', after: 'b4', markdown: 'See the [timeline](page:Marketing/Launch plan.md#Next Steps).' }]);
    expect(report.refused).toEqual([]);
    expect(text).toContain('[timeline](../Marketing/Launch%20plan.md#next-steps)');
  });

  it('a link to a heading on the same page is its anchor alone', () => {
    const { text } = run([{ op: 'insert', after: 'b4', markdown: 'Back to [the top](page:Notes/Launch.md#Launch).' }]);
    expect(text).toContain('[the top](#launch)');
  });

  it('writes a date chip from its day, and refuses a day that does not exist', () => {
    const { text } = run([{ op: 'insert', after: 'b4', markdown: 'Ships <time datetime="2026-12-01"></time>.' }]);
    expect(text).toContain('<time datetime="2026-12-01">1 Dec 2026</time>');
    expect(run([{ op: 'insert', after: 'b4', markdown: 'On <time datetime="2026-02-30"></time>.' }]).report.refused[0]).toMatch(/2026-02-30 is not a day/);
  });
});

/**
 * What the AI may write into a page's document. Everything
 * Bava's editor can write, in Bava's own terms, except what loads from the
 * web: a web link, card, picture, video, canvas embed or raw HTML may be
 * kept as it was or removed, never added or changed. A table cell holds one
 * line. Colours are swatches. Bava builds page-link addresses and writes
 * date chips.
 */
import type { Mark, Node } from 'prosemirror-model';
import { SWATCHES } from '../canvas/palette';
import { classifyLink, linkTo } from '../docs/links';
import { slugger } from '../docs/slug';
import { dateAttrs, dateTag, isDay } from '../docs/dates';

/** Nodes that show something from a file or the web: kept or removed only. */
const FROM_ELSEWHERE = new Set(['image', 'video', 'embed', 'card', 'kept']);

/** What a node that shows something from elsewhere is, apart from how it is laid out. */
function identity(node: Node): string {
  const a = node.attrs as Record<string, unknown>;
  if (node.type.name === 'kept') return `kept ${String(a.text)}`;
  if (node.type.name === 'card') return `card ${String(a.href)}`;
  if (node.type.name === 'embed') return `embed ${String(a.src)} ${String(a.frame)} ${String(a.page)}`;
  return `${node.type.name} ${String(a.src)}`;
}

const isWeb = (href: string) => classifyLink(href) !== 'relative' && classifyLink(href) !== 'anchor';

/** Counts what a block shows from elsewhere and the web links it holds. */
function inventory(nodes: Node[]): Map<string, number> {
  const found = new Map<string, number>();
  const add = (key: string) => found.set(key, (found.get(key) ?? 0) + 1);
  for (const node of nodes) {
    node.descendants((child) => {
      if (FROM_ELSEWHERE.has(child.type.name)) add(identity(child));
      for (const mark of child.marks) if (mark.type.name === 'link' && isWeb(String(mark.attrs.href))) add(`link ${String(mark.attrs.href)}`);
      return true;
    });
    if (FROM_ELSEWHERE.has(node.type.name)) add(identity(node));
  }
  return found;
}

function describe(key: string): string {
  const [kind] = key.split(' ');
  if (kind === 'link') return 'a web link';
  if (kind === 'kept') return 'raw HTML';
  if (kind === 'card') return 'a web card';
  if (kind === 'embed') return 'a canvas embed';
  return `a ${kind}`;
}

const literalColour = (mark: Mark) =>
  (mark.type.name === 'color' || mark.type.name === 'highlight') && !(SWATCHES as readonly string[]).includes(String(mark.attrs.name));

/**
 * Why new blocks cannot replace `old` (none for an insert), or null. What
 * shows something from elsewhere may stay or go, never arrive or change.
 */
export function blockProblem(next: Node[], old: Node[]): string | null {
  const before = inventory(old);
  for (const [key, count] of inventory(next)) {
    if (count > (before.get(key) ?? 0)) {
      return `${describe(key)} is never added or changed; it may only be kept as it was or removed`;
    }
  }
  let problem: string | null = null;
  for (const node of next) {
    const check = (child: Node) => {
      if (problem) return false;
      if (child.type.name === 'table_cell' || child.type.name === 'table_header') {
        if (child.childCount !== 1 || child.firstChild?.type.name !== 'paragraph') problem = 'a table cell holds one line of text';
      }
      if (child.marks.some(literalColour)) problem = `colours are Bava's: ${SWATCHES.join(', ')}`;
      const attrs = child.attrs as Record<string, unknown>;
      for (const key of ['color', 'background']) {
        const value = attrs[key];
        if (typeof value === 'string' && value !== '' && !(SWATCHES as readonly string[]).includes(value)) problem = `colours are Bava's: ${SWATCHES.join(', ')}`;
      }
      return true;
    };
    check(node);
    node.descendants(check);
  }
  return problem;
}

/**
 * The Markdown with Bava writing what the AI means: `page:` links made into
 * addresses relative to `here` (a heading by its words), and date chips
 * written from their day. Refused with why when a day does not exist.
 */
export function written(markdown: string, here: string): { markdown: string } | { problem: string } {
  const slug = slugger();
  let problem: string | null = null;
  const linked = markdown.replace(/\]\(page:([^)#]+)(?:#([^)]*))?\)/g, (_all, target: string, heading?: string) => {
    const anchor = heading ? `#${slug(decodeURIComponent(heading))}` : '';
    const path = decodeURIComponent(target).trim();
    return `](${path === here && anchor ? anchor : linkTo(here, path, anchor)})`;
  });
  const dated = linked.replace(/<time datetime="([^"]*)">[^<]*<\/time>/g, (_all, day: string) => {
    if (!isDay(day)) {
      problem = `${day} is not a day`;
      return _all;
    }
    const { date, text } = dateAttrs(day);
    return dateTag(date, text);
  });
  return problem ? { problem } : { markdown: dated };
}

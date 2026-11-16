/**
 * A page as short text, for the user's own AI agent to read: its version,
 * its document as Markdown with each top-level block numbered (b1, b2, ...),
 * and its canvas one line per element with its id. The open page is written
 * from its editor and scene, a closed page by the page worker from its file:
 * this one writer serves both, so a block's number means the same block to
 * what reads it and to what changes it. The text is for a model to read, in
 * English, not translated.
 */
import type { Node } from 'prosemirror-model';
import { EMPTY_FRONT, writePage } from '../docs/markdown';
import { SHAPE_TYPES, type SceneElement } from '../canvas/scene';

export type PageInput = { doc: Node; elements: SceneElement[] };

/**
 * The top-level blocks that get a number, by their index in the document:
 * every block that writes something. A blank paragraph is never written
 * (the editor keeps one after a closing picture for the caret), so it gets
 * no number, and the editor and a reading of the file number alike. The
 * code that changes a page finds block b<n> here too.
 */
export function numberedBlocks(doc: Node): number[] {
  const out: number[] = [];
  for (let i = 0; i < doc.childCount; i++) if (blockMarkdown(doc, i) !== '') out.push(i);
  return out;
}

/** How many blocks the document has to number. */
export function blockCount(doc: Node): number {
  return numberedBlocks(doc).length;
}

/** The Markdown of one top-level block, as the page writes it. */
function blockMarkdown(doc: Node, index: number): string {
  const single = doc.type.create(doc.attrs, [doc.child(index)]);
  return writePage(single, EMPTY_FRONT).replace(/\s+$/, '');
}

function documentText(doc: Node): string {
  const numbered = numberedBlocks(doc);
  if (numbered.length === 0) return 'Document: empty\n';
  const parts = numbered.map((index, n) => `[b${n + 1}]\n${blockMarkdown(doc, index)}`);
  return `Document (blocks numbered b1, b2, ...; the numbers hold until the page changes):\n${parts.join('\n\n')}\n`;
}

const round = (n: number) => Math.round(n);
const quoted = (s: string) => JSON.stringify(s);
const boxOf = (e: SceneElement) => `box ${round(e.x)},${round(e.y)} ${round(e.w)}x${round(e.h)}`;

const SHAPES = new Set<string>(SHAPE_TYPES);
/** What a pen stroke is said to lie over: things with a box of their own. */
const OVERLAPPABLE = new Set<string>([...SHAPE_TYPES, 'text', 'icon', 'image', 'table', 'class', 'code']);

function overlaps(a: SceneElement, b: SceneElement): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function styles(e: SceneElement): string {
  const out: string[] = [];
  for (const key of ['fill', 'stroke', 'color'] as const) {
    const value = (e as Record<string, unknown>)[key];
    if (typeof value === 'string' && value !== '') out.push(`${key}=${value}`);
  }
  return out.length ? ` ${out.join(' ')}` : '';
}

function arrowEnd(e: SceneElement & { points: number[] }, end: 'start' | 'end'): string {
  const a = e as Record<string, unknown>;
  const bound = a[`${end}Binding`];
  const row = a[`${end}Row`];
  if (typeof bound === 'string' && bound !== '') {
    return typeof row === 'string' && row !== '' ? `${bound} (row ${quoted(row)})` : bound;
  }
  const n = e.points.length;
  const [px, py] = end === 'start' ? [e.points[0] ?? 0, e.points[1] ?? 0] : [e.points[n - 2] ?? 0, e.points[n - 1] ?? 0];
  return `${round(e.x + px)},${round(e.y + py)}`;
}

function elementLine(e: SceneElement, all: SceneElement[]): string {
  const label = 'label' in e && typeof e.label === 'string' && e.label !== '' ? ` ${quoted(e.label)}` : '';
  let line: string;
  switch (e.type) {
    case 'arrow':
      line = `${e.id} arrow ${arrowEnd(e, 'start')} -> ${arrowEnd(e, 'end')}${label}`;
      break;
    case 'line':
      line = `${e.id} line ${boxOf(e)}${styles(e)}`;
      break;
    case 'frame': {
      const held = all.filter((o) => o.frame === e.id).map((o) => o.id);
      line = `${e.id} frame${label} ${boxOf(e)}${held.length ? ` holds ${held.join(', ')}` : ''}`;
      break;
    }
    case 'group':
      line = `${e.id} group${label} of ${e.children.join(', ')}`;
      break;
    case 'stroke': {
      const under = all.filter((o) => o.id !== e.id && OVERLAPPABLE.has(o.type) && overlaps(e, o)).map((o) => o.id);
      line = `${e.id} stroke${e.stroke ? ` ${e.stroke}` : ''} ${boxOf(e)}${under.length ? ` over ${under.join(', ')}` : ''}`;
      break;
    }
    case 'text':
      line = `${e.id} text ${quoted(e.text)} ${boxOf(e)}${styles(e)}`;
      break;
    case 'code':
      line = `${e.id} code${e.language ? ` ${e.language}` : ''} ${quoted(e.code)} ${boxOf(e)}`;
      break;
    case 'image':
      line = `${e.id} picture ${boxOf(e)}`;
      break;
    case 'icon':
      line = `${e.id} icon ${e.icon}${label} ${boxOf(e)}${styles(e)}`;
      break;
    case 'table':
    case 'class':
      line = `${e.id} ${e.type} ${quoted(e.name)} rows ${JSON.stringify(e.rows.split('\n').filter((r) => r !== ''))} ${boxOf(e)}${styles(e)}`;
      break;
    default:
      line = SHAPES.has(e.type) ? `${e.id} ${e.type}${label} ${boxOf(e)}${styles(e)}` : `${e.id} ${(e as SceneElement).type} ${boxOf(e)}`;
  }
  if (e.type !== 'frame' && e.frame) line += ` in ${e.frame}`;
  if (e.locked) line += ' locked';
  return line;
}

/** The canvas, one element a line in paint order. */
export function canvasText(elements: SceneElement[], only?: Set<string>): string {
  const ordered = [...elements].sort((a, b) => a.z - b.z);
  const shown = only ? ordered.filter((e) => only.has(e.id)) : ordered;
  return shown.map((e) => elementLine(e, elements)).join('\n');
}

/** FNV-1a, 32 bits, as eight hex digits: a fingerprint, not a secret. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * The page's version: moves on with any change to its document or canvas,
 * whoever made it, so a change made against an older reading is refused.
 */
export function versionOf({ doc, elements }: PageInput): string {
  return fingerprint(writePage(doc, EMPTY_FRONT) + '\u0000' + JSON.stringify(elements));
}

/** The page as the agent reads it. */
export function pageText({ path, doc, elements }: PageInput & { path: string }): string {
  const canvas = elements.length ? `Canvas (one element a line, by id):\n${canvasText(elements)}\n` : 'Canvas: empty\n';
  return `Page: ${path}\nVersion: ${versionOf({ doc, elements })}\n\n${documentText(doc)}\n${canvas}`;
}

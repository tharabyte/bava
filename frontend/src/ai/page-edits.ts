/**
 * The AI's changes to a page, as data: document changes keyed by block
 * number (b1, b2, ... as the page was read) and canvas changes keyed by
 * element id. The open page and the page worker both apply them with this,
 * so a change means the same thing whether the page is on screen or not.
 * Each change applied or refused is reported, refusals with why.
 */
import type { EditorState, Transaction } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { parseBody } from '../docs/markdown';
import type { History } from '../canvas/history';
import { isLocked, type SceneData, type SceneElement } from '../canvas/scene';
import { numberedBlocks } from './page-text';
import { addProblem, setProblem } from './canvas-rules';
import { blockProblem, written } from './document-rules';
import { classRows, tableRows } from '../canvas/table-rows';

export type DocOp =
  | { op: 'insert'; after?: string; markdown: string }
  | { op: 'replace'; block: string; markdown: string }
  | { op: 'remove'; block: string }
  | { op: 'move'; block: string; after?: string };

export type Arrange = 'front' | 'back' | 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';

export type CanvasOp =
  | { op: 'add'; element: Record<string, unknown> }
  | { op: 'update'; id: string; set: Record<string, unknown> }
  | { op: 'remove'; id: string }
  /** An arrow from one element to another, new or one already there. */
  | { op: 'connect'; id?: string; from: string; to: string; fromRow?: string; toRow?: string; label?: string }
  | { op: 'group'; ids: string[]; label?: string }
  | { op: 'frame'; ids: string[]; label?: string }
  | { op: 'arrange'; ids: string[]; how: Arrange }
  /** A D2 layout the AI drew; the window turns it into an `insert`. */
  | { op: 'diagram'; layout: unknown }
  /** Elements made and sized by Bava (a drawn diagram), put in as they are. */
  | { op: 'insert'; elements: SceneElement[] };

/** One tool call's changes to one page, made against the version it read. */
export type PageEdit = { version: string; document?: DocOp[]; canvas?: CanvasOp[] };

export type Report = { applied: string[]; refused: string[] };

/** What sizing a canvas change needs: text measured and shapes fitted as drawn. */
export type Sizing = {
  measureText(element: SceneElement, text: string): { width: number; height: number };
  refit(element: SceneElement): void;
};

/** Where each numbered block was in the document as read. */
function blockSpans(doc: Node): Map<string, { from: number; to: number }> {
  const numbered = numberedBlocks(doc);
  const spans = new Map<string, { from: number; to: number }>();
  const starts: number[] = [];
  doc.forEach((_node, offset) => starts.push(offset));
  numbered.forEach((index, n) => {
    spans.set(`b${n + 1}`, { from: starts[index], to: starts[index] + doc.child(index).nodeSize });
  });
  return spans;
}

/** Blocks parsed from Markdown, as the page reads it; none for blank text. */
function blocksOf(markdown: string): Node[] {
  if (markdown.trim() === '') return [];
  const nodes: Node[] = [];
  parseBody(markdown).forEach((node) => {
    if (!(node.type.name === 'paragraph' && node.content.size === 0)) nodes.push(node);
  });
  return nodes;
}

/**
 * The document changes as one transaction on `state`. Block numbers are the
 * page's as read, whatever the order of the changes or what earlier ones did.
 */
export function documentChanges(state: EditorState, ops: DocOp[], page = ''): { tr: Transaction; report: Report } {
  const tr = state.tr;
  const spans = blockSpans(state.doc);
  const removed = new Set<string>();
  const report: Report = { applied: [], refused: [] };

  /** Where a block is now, or why it cannot be found. */
  const where = (block: string): { from: number; to: number } | string => {
    const span = spans.get(block);
    if (!span) return `${block}: no such block`;
    if (removed.has(block)) return `${block}: it was removed earlier in this change`;
    return { from: tr.mapping.map(span.from, 1), to: tr.mapping.map(span.to, -1) };
  };
  /** The place after a block, or the start of the page. */
  const after = (block: string | undefined): number | string => {
    if (block === undefined || block === '') return 0;
    const found = where(block);
    return typeof found === 'string' ? found : found.to;
  };

  for (const op of ops) {
    try {
      switch (op.op) {
        case 'insert': {
          const at = after(op.after);
          if (typeof at === 'string') {
            report.refused.push(at);
            break;
          }
          const where = `insert ${op.after ? `after ${op.after}` : 'at the start'}`;
          const made = written(op.markdown, page);
          if ('problem' in made) {
            report.refused.push(`${where}: ${made.problem}`);
            break;
          }
          const nodes = blocksOf(made.markdown);
          if (nodes.length === 0) {
            report.refused.push(`${where}: nothing to insert`);
            break;
          }
          const problem = blockProblem(nodes, []);
          if (problem) {
            report.refused.push(`${where}: ${problem}`);
            break;
          }
          tr.insert(at, nodes);
          report.applied.push(`inserted ${nodes.length === 1 ? 'a block' : `${nodes.length} blocks`} ${op.after ? `after ${op.after}` : 'at the start'}`);
          break;
        }
        case 'replace': {
          const span = where(op.block);
          if (typeof span === 'string') {
            report.refused.push(span);
            break;
          }
          const made = written(op.markdown, page);
          if ('problem' in made) {
            report.refused.push(`${op.block}: ${made.problem}`);
            break;
          }
          const nodes = blocksOf(made.markdown);
          if (nodes.length === 0) {
            report.refused.push(`${op.block}: nothing to put there; remove it instead`);
            break;
          }
          const old: Node[] = [];
          tr.doc.nodesBetween(span.from, span.to, (node, pos) => {
            if (pos >= span.from) old.push(node);
            return false;
          });
          const problem = blockProblem(nodes, old);
          if (problem) {
            report.refused.push(`${op.block}: ${problem}`);
            break;
          }
          tr.replaceWith(span.from, span.to, nodes);
          report.applied.push(`replaced ${op.block}`);
          break;
        }
        case 'remove': {
          const span = where(op.block);
          if (typeof span === 'string') {
            report.refused.push(span);
            break;
          }
          tr.delete(span.from, span.to);
          removed.add(op.block);
          report.applied.push(`removed ${op.block}`);
          break;
        }
        case 'move': {
          const span = where(op.block);
          if (typeof span === 'string') {
            report.refused.push(span);
            break;
          }
          if (op.after === op.block) {
            report.refused.push(`${op.block}: cannot move after itself`);
            break;
          }
          const target = after(op.after);
          if (typeof target === 'string') {
            report.refused.push(target);
            break;
          }
          const node = tr.doc.slice(span.from, span.to).content;
          tr.delete(span.from, span.to);
          tr.insert(tr.mapping.maps[tr.mapping.maps.length - 1].map(target), node);
          report.applied.push(`moved ${op.block} ${op.after ? `after ${op.after}` : 'to the start'}`);
          break;
        }
      }
    } catch {
      report.refused.push(`${'block' in op ? op.block : 'insert'}: the page cannot hold that there`);
    }
  }
  return { tr, report };
}

/** A table's or class's row names, as the canvas reads its rows. */
function rowNames(element: SceneElement & { rows: string }): Set<string> {
  if (element.type === 'table') return new Set(tableRows(element.rows).map((row) => row.name));
  const { fields, methods } = classRows(element.rows);
  return new Set([...fields, ...methods].map((member) => member.name));
}

/**
 * Arrows tied to a row that is no longer there fall back to the whole
 * element; each is named, so the AI can say so.
 */
function loosenRows(elements: SceneElement[], element: SceneElement & { rows: string }): string[] {
  const names = rowNames(element);
  const said: string[] = [];
  for (const arrow of elements) {
    if (arrow.type !== 'arrow') continue;
    for (const end of ['start', 'end'] as const) {
      const row = arrow[`${end}Row`];
      if (arrow[`${end}Binding`] === element.id && row && !names.has(row)) {
        delete arrow[`${end}Row`];
        said.push(`${arrow.id} was tied to row "${row}", now gone, and attaches to ${element.id} as a whole`);
      }
    }
  }
  return said;
}

/** The space a new frame leaves round what it holds. */
export const FRAME_PAD = 24;

/** A group's members, nested groups' included. */
function membersOf(elements: SceneElement[], groupId: string): string[] {
  const group = elements.find((e) => e.id === groupId);
  if (!group || group.type !== 'group') return [];
  return group.children.flatMap((child) => [child, ...membersOf(elements, child)]);
}

function boundsOf(elements: SceneElement[]): { x: number; y: number; w: number; h: number } {
  const x = Math.min(...elements.map((e) => e.x));
  const y = Math.min(...elements.map((e) => e.y));
  return { x, y, w: Math.max(...elements.map((e) => e.x + e.w)) - x, h: Math.max(...elements.map((e) => e.y + e.h)) - y };
}

/** Front and back, or lined up on an edge or centre of what they cover together. */
function arrange(all: SceneElement[], members: SceneElement[], how: Arrange): void {
  if (how === 'front' || how === 'back') {
    const others = all.filter((e) => !members.includes(e)).map((e) => e.z);
    let z = how === 'front' ? Math.max(0, ...others) : Math.min(0, ...others) - members.length;
    for (const e of [...members].sort((a, b) => a.z - b.z)) e.z = ++z;
    return;
  }
  const box = boundsOf(members);
  for (const e of members) {
    if (how === 'left') e.x = box.x;
    if (how === 'right') e.x = box.x + box.w - e.w;
    if (how === 'centre') e.x = box.x + (box.w - e.w) / 2;
    if (how === 'top') e.y = box.y;
    if (how === 'bottom') e.y = box.y + box.h - e.h;
    if (how === 'middle') e.y = box.y + (box.h - e.h) / 2;
  }
}

/** An id no element has; `wanted` when it is free. */
function freeId(taken: Set<string>, wanted: unknown): string {
  if (typeof wanted === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(wanted) && !taken.has(wanted)) return wanted;
  let n = taken.size + 1;
  while (taken.has(`ai${n}`)) n++;
  return `ai${n}`;
}

/** A text's or label's size, set as the canvas draws it. */
function sized(element: SceneElement, sizing: Sizing): void {
  if (element.type === 'text') {
    const size = sizing.measureText(element, element.text);
    element.measuredWidth = size.width;
    element.measuredHeight = size.height;
    element.w = size.width;
    element.h = size.height;
    return;
  }
  sizing.refit(element);
}

/** The canvas changes as one step in the page's history, the AI's. */
export function canvasChanges(history: History, ops: CanvasOp[], sizing: Sizing): Report {
  const report: Report = { applied: [], refused: [] };
  history.mutate((draft: SceneData) => {
    const taken = new Set(draft.elements.map((e) => e.id));
    const find = (id: string) => draft.elements.find((e) => e.id === id);
    for (const op of ops) {
      switch (op.op) {
        case 'add': {
          const problem = addProblem(op.element);
          if (problem) {
            report.refused.push(`add ${String(op.element.type ?? '')}: ${problem}`);
            break;
          }
          const wanted = op.element.id;
          const id = freeId(taken, wanted);
          const z = Math.max(0, ...draft.elements.map((e) => e.z)) + 1;
          const element = { x: 0, y: 0, w: 0, h: 0, ...op.element, id, z } as SceneElement;
          sized(element, sizing);
          draft.elements.push(element);
          taken.add(id);
          report.applied.push(typeof wanted === 'string' && wanted !== id ? `added ${id} (${wanted} was taken)` : `added ${id}`);
          break;
        }
        case 'update': {
          const element = find(op.id);
          if (!element) {
            report.refused.push(`${op.id}: no such element`);
            break;
          }
          if (isLocked(element)) {
            report.refused.push(`${op.id}: it is locked; ask the user to unlock it`);
            break;
          }
          const set = { ...op.set };
          delete set.id;
          delete set.z;
          const problem = setProblem(element.type, set);
          if (problem) {
            report.refused.push(`${op.id}: ${problem}`);
            break;
          }
          Object.assign(element, set);
          sized(element, sizing);
          report.applied.push(`changed ${op.id}`);
          if ('rows' in set && (element.type === 'table' || element.type === 'class')) {
            report.applied.push(...loosenRows(draft.elements, element));
          }
          break;
        }
        case 'insert': {
          let top = Math.max(0, ...draft.elements.map((e) => e.z));
          const renamed = new Map<string, string>();
          for (const element of op.elements) {
            const id = freeId(taken, element.id);
            taken.add(id);
            renamed.set(element.id, id);
          }
          const rename = (id: unknown) => (typeof id === 'string' ? (renamed.get(id) ?? id) : id);
          for (const element of op.elements) {
            const copy = structuredClone(element) as SceneElement & Record<string, unknown>;
            copy.id = renamed.get(element.id)!;
            copy.z = ++top;
            for (const key of ['frame', 'startBinding', 'endBinding']) if (key in copy) copy[key] = rename(copy[key]);
            if (copy.type === 'group') copy.children = copy.children.map((child) => rename(child) as string);
            draft.elements.push(copy);
          }
          report.applied.push(`added a diagram of ${op.elements.length} elements`);
          break;
        }
        case 'diagram':
          report.refused.push('a diagram arrived unconverted');
          break;
        case 'remove': {
          const at = draft.elements.findIndex((e) => e.id === op.id);
          if (at < 0) {
            report.refused.push(`${op.id}: no such element`);
            break;
          }
          if (isLocked(draft.elements[at])) {
            report.refused.push(`${op.id}: it is locked; ask the user to unlock it`);
            break;
          }
          const gone = draft.elements[at];
          // A group goes with its members; a frame's members stay, unframed.
          const leaving = new Set([op.id, ...(gone.type === 'group' ? membersOf(draft.elements, op.id) : [])]);
          if ([...leaving].some((id) => isLocked(find(id)!))) {
            report.refused.push(`${op.id}: a member is locked; ask the user to unlock it`);
            break;
          }
          draft.elements = draft.elements.filter((e) => !leaving.has(e.id));
          for (const e of draft.elements) {
            if (e.type === 'group') e.children = e.children.filter((child) => !leaving.has(child));
            if (e.frame && leaving.has(e.frame)) delete e.frame;
          }
          report.applied.push(leaving.size > 1 ? `removed ${op.id} and its ${leaving.size - 1} members` : `removed ${op.id}`);
          break;
        }
        case 'connect': {
          const missing = [op.from, op.to].find((id) => !find(id));
          if (missing) {
            report.refused.push(`connect: ${missing}: no such element`);
            break;
          }
          const ends: Record<string, unknown> = { startBinding: op.from, endBinding: op.to };
          if (op.fromRow) ends.startRow = op.fromRow;
          if (op.toRow) ends.endRow = op.toRow;
          if (op.label !== undefined) ends.label = op.label;
          if (op.id && find(op.id)) {
            const arrow = find(op.id)!;
            if (arrow.type !== 'arrow') {
              report.refused.push(`${op.id}: only an arrow connects`);
              break;
            }
            if (isLocked(arrow)) {
              report.refused.push(`${op.id}: it is locked; ask the user to unlock it`);
              break;
            }
            Object.assign(arrow, ends);
            report.applied.push(`connected ${op.id} from ${op.from} to ${op.to}`);
            break;
          }
          const id = freeId(taken, op.id);
          taken.add(id);
          const from = find(op.from)!;
          const to = find(op.to)!;
          const start = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
          const end = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
          draft.elements.push({
            id,
            type: 'arrow',
            x: start.x,
            y: start.y,
            w: Math.abs(end.x - start.x),
            h: Math.abs(end.y - start.y),
            z: Math.max(0, ...draft.elements.map((e) => e.z)) + 1,
            points: [0, 0, end.x - start.x, end.y - start.y],
            ...ends,
          } as SceneElement);
          report.applied.push(`added arrow ${id} from ${op.from} to ${op.to}`);
          break;
        }
        case 'group':
        case 'frame': {
          const members = op.ids.map(find);
          const missing = op.ids.find((_id, i) => !members[i]);
          if (missing || members.length === 0) {
            report.refused.push(`${op.op}: ${missing ?? 'nothing'}: no such element`);
            break;
          }
          const lockedMember = (members as SceneElement[]).find((e) => isLocked(e));
          if (lockedMember) {
            report.refused.push(`${lockedMember.id}: it is locked; ask the user to unlock it`);
            break;
          }
          const box = boundsOf(members as SceneElement[]);
          const id = freeId(taken, undefined);
          taken.add(id);
          const z = op.op === 'frame' ? Math.min(...(members as SceneElement[]).map((e) => e.z)) - 1 : Math.max(0, ...draft.elements.map((e) => e.z)) + 1;
          if (op.op === 'group') {
            draft.elements.push({ id, type: 'group', ...box, z, children: [...op.ids], ...(op.label ? { label: op.label } : {}) } as SceneElement);
          } else {
            const pad = FRAME_PAD;
            draft.elements.push({ id, type: 'frame', x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad, z, label: op.label ?? '' } as SceneElement);
            for (const member of members as SceneElement[]) member.frame = id;
          }
          report.applied.push(`added ${op.op} ${id} of ${op.ids.join(', ')}`);
          break;
        }
        case 'arrange': {
          const members = op.ids.map(find).filter((e): e is SceneElement => e !== undefined);
          const lockedOne = members.find((e) => isLocked(e));
          if (members.length !== op.ids.length || lockedOne) {
            report.refused.push(lockedOne ? `${lockedOne.id}: it is locked; ask the user to unlock it` : 'arrange: an element is not there');
            break;
          }
          arrange(draft.elements, members, op.how);
          report.applied.push(`arranged ${op.ids.join(', ')} (${op.how})`);
          break;
        }
      }
    }
  }, 'ai');
  return report;
}

/**
 * Applying the AI's changes to a page: the open page in its editor and
 * scene, as one marked transaction and one canvas step; a page not on
 * screen to its file's data, in the page worker, written back as Bava
 * writes a page. Either way a change against a stale version, or to a page
 * the user locked, is refused whole and nothing is applied.
 */
import { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { parsePage, writePage, withFront } from '../docs/markdown';
import { AI_CHANGE } from '../docs/ai-change';
import { createHistory, type History } from '../canvas/history';
import type { SceneElement } from '../canvas/scene';
import { canvasChanges, documentChanges, type PageEdit, type Report, type Sizing } from './page-edits';
import { pageText, versionOf } from './page-text';

export type ApplyAnswer = {
  /** The page as it reads after the change, with its new version. */
  text: string;
  report: Report;
  /** The change was made against an older reading; nothing applied. */
  stale?: boolean;
  /** The user locked the page; nothing applied. */
  locked?: boolean;
  /** A page not on screen: its new prose and scene, for Go to save. */
  file?: { source: string; scene: Record<string, unknown> };
};

const nothing: Report = { applied: [], refused: [] };

/**
 * Whether the change points at what the AI read (block numbers, element
 * ids), so it must be made against the current version. A drawn diagram
 * placed in free space points at nothing already there.
 */
function needsVersion(edit: PageEdit): boolean {
  if (edit.version !== '') return true;
  return (edit.document?.length ?? 0) > 0 || (edit.canvas ?? []).some((op) => op.op !== 'insert');
}

/** A page not on screen: its file's prose and scene changed as data. */
export function applyToFile(
  path: string,
  file: { source: string; scene: Record<string, unknown> & { elements?: SceneElement[] } },
  edit: PageEdit,
  sizing: Sizing,
): ApplyAnswer {
  const page = parsePage(file.source);
  const elements = file.scene.elements ?? [];
  const before = { doc: page.doc, elements };
  if (page.front.settings.locked === true) return { text: pageText({ path, ...before }), report: nothing, locked: true };
  if (needsVersion(edit) && versionOf(before) !== edit.version) return { text: pageText({ path, ...before }), report: nothing, stale: true };

  const report: Report = { applied: [], refused: [] };
  let doc = page.doc;
  let source = file.source;
  if (edit.document?.length) {
    const { tr, report: docReport } = documentChanges(EditorState.create({ doc }), edit.document, path);
    merge(report, docReport);
    if (tr.docChanged) {
      doc = tr.doc;
      source = writePage(doc, page.front);
    } else {
      source = withFront(page.front, page.body);
    }
  }
  const history = createHistory({ elements });
  if (edit.canvas?.length) merge(report, canvasChanges(history, edit.canvas, sizing));
  const after = history.current.elements;
  return {
    text: pageText({ path, doc, elements: after }),
    report,
    file: { source, scene: { ...file.scene, elements: after } },
  };
}

/** The open page: its editor and scene, as the user's own edits are made. */
export function applyToOpen(
  path: string,
  open: { view: EditorView; history: History; pageLocked: boolean },
  edit: PageEdit,
  sizing: Sizing,
): ApplyAnswer {
  const read = () => ({ doc: open.view.state.doc, elements: open.history.current.elements });
  if (open.pageLocked) return { text: pageText({ path, ...read() }), report: nothing, locked: true };
  if (needsVersion(edit) && versionOf(read()) !== edit.version) return { text: pageText({ path, ...read() }), report: nothing, stale: true };

  const report: Report = { applied: [], refused: [] };
  if (edit.document?.length) {
    const { tr, report: docReport } = documentChanges(open.view.state, edit.document, path);
    merge(report, docReport);
    if (tr.docChanged) open.view.dispatch(tr.setMeta(AI_CHANGE, true));
  }
  if (edit.canvas?.length) merge(report, canvasChanges(open.history, edit.canvas, sizing));
  return { text: pageText({ path, ...read() }), report };
}

function merge(into: Report, from: Report): void {
  into.applied.push(...from.applied);
  into.refused.push(...from.refused);
}

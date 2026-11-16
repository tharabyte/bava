/**
 * A diagram the AI drew, as D2 laid out by Go, made into ordinary elements
 * in the window (shapes sized to their labels, icons by name only) and
 * placed in free space beside what the page's canvas holds.
 */
import { toElements, type Layout } from '../canvas/import/convert';
import type { SceneElement } from '../canvas/scene';
import type { PageEdit } from './page-edits';
import { placeBeside } from './place';

export type DiagramTools = {
  fit: (element: SceneElement) => void;
  resolveIcon: (name: string) => string | null;
};

/** The change with each drawn layout made into elements, placed beside `existing`. */
export function expandDiagrams(edit: PageEdit, existing: SceneElement[], tools: DiagramTools): PageEdit {
  if (!edit.canvas?.some((op) => op.op === 'diagram')) return edit;
  let scene = [...existing];
  const canvas = edit.canvas.map((op) => {
    if (op.op !== 'diagram') return op;
    const made = toElements(op.layout as Layout, { at: { x: 0, y: 0 }, fit: tools.fit, resolveIcon: tools.resolveIcon });
    const placed = placeBeside(scene, made);
    scene = [...scene, ...placed];
    return { op: 'insert' as const, elements: placed };
  });
  return { ...edit, canvas };
}

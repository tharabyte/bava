/**
 * Where a diagram the AI draws goes: in free space to the right of what the
 * canvas holds, its top level with the content's top, so nothing already
 * there is covered.
 */
import type { SceneElement } from '../canvas/scene';

/** The space left between what is there and what arrives. */
export const PLACE_GAP = 80;

type Box = { x: number; y: number; right: number; bottom: number };

function boxOf(elements: SceneElement[]): Box | null {
  if (elements.length === 0) return null;
  return {
    x: Math.min(...elements.map((e) => e.x)),
    y: Math.min(...elements.map((e) => e.y)),
    right: Math.max(...elements.map((e) => e.x + e.w)),
    bottom: Math.max(...elements.map((e) => e.y + e.h)),
  };
}

/** `arriving` moved beside `existing`; on an empty canvas, to the origin. */
export function placeBeside(existing: SceneElement[], arriving: SceneElement[]): SceneElement[] {
  const from = boxOf(arriving);
  if (!from) return arriving;
  const there = boxOf(existing);
  const to = there ? { x: there.right + PLACE_GAP, y: there.y } : { x: 0, y: 0 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return arriving.map((element) => ({ ...element, x: element.x + dx, y: element.y + dy }));
}

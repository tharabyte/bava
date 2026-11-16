/**
 * What the AI may set on each canvas element: everything the
 * user can set with Bava's own controls, in Bava's own terms. Colours are
 * swatches, sizes are Bava's steps; a picture moves and is removed only; a
 * pen stroke is moved, restyled or removed, never drawn; nothing is locked
 * or unlocked; nothing loads from the web.
 */
import { SWATCHES } from '../canvas/palette';
import { controlOptions, PROPERTY_OPTIONS } from '../canvas/property-options';
import { SHAPE_TYPES, type SceneElement } from '../canvas/scene';

const SHAPES = new Set<string>(SHAPE_TYPES);

/** Element kinds the AI may add: not pen strokes, not pictures. */
export const ADDABLE = new Set<string>([...SHAPE_TYPES, 'text', 'line', 'arrow', 'frame', 'group', 'code', 'icon', 'table', 'class']);

const LAYOUT = ['x', 'y', 'w', 'h', 'angle'];
const COLOURS = ['fill', 'stroke', 'color'];
const STYLE = [...COLOURS, 'strokeWidth', 'strokeStyle', 'edges', 'opacity', 'fontSize', 'align', 'verticalAlign'];
const ARROW = ['arrowType', 'startArrowhead', 'endArrowhead', 'startBinding', 'endBinding', 'startRow', 'endRow', 'labelDirection', 'labelPosition', 'startAnchor', 'endAnchor', 'startMode', 'endMode'];

/** The keys each kind takes from the AI. */
function keysFor(type: string): Set<string> {
  if (type === 'image') return new Set(LAYOUT);
  if (type === 'stroke') return new Set(['x', 'y', 'angle', 'stroke', 'strokeWidth', 'opacity']);
  const base = [...LAYOUT, ...STYLE, 'frame'];
  if (SHAPES.has(type)) return new Set([...base, 'label', 'type']);
  switch (type) {
    case 'text':
      return new Set([...base, 'text']);
    case 'line':
      return new Set([...base, 'points', 'closed']);
    case 'arrow':
      return new Set([...base, ...ARROW, 'points', 'label']);
    case 'frame':
      return new Set([...base, 'label']);
    case 'group':
      return new Set(['label', 'children', 'angle', 'opacity']);
    case 'code':
      return new Set([...base, 'code', 'language']);
    case 'icon':
      return new Set([...base, 'icon', 'label']);
    case 'table':
    case 'class':
      return new Set([...base, 'name', 'rows']);
  }
  return new Set(LAYOUT);
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Why a value cannot be set, or null when it can. */
function valueProblem(type: string, key: string, value: unknown): string | null {
  if (COLOURS.includes(key)) {
    if (key === 'color' && type === 'icon' && value === 'brand') return null;
    return typeof value === 'string' && (SWATCHES as readonly string[]).includes(value)
      ? null
      : `${key} must be one of Bava's colours: ${SWATCHES.join(', ')}`;
  }
  if (key === 'opacity') return isNumber(value) && value >= 0 && value <= 100 && value % 10 === 0 ? null : 'opacity is 0 to 100 in steps of 10';
  if (key === 'type') return typeof value === 'string' && SHAPES.has(value) ? null : `a shape changes only to another shape: ${SHAPE_TYPES.join(', ')}`;
  const control = key === 'fontSize' && type === 'code' ? controlOptions({ id: 'fontSize', variant: 'code' }) : PROPERTY_OPTIONS[key as keyof typeof PROPERTY_OPTIONS];
  if (control && control.options.length > 0) {
    const allowed = control.options.map((option) => option.value);
    return allowed.includes(value as never) ? null : `${key} must be one of ${allowed.join(', ')}`;
  }
  if (LAYOUT.includes(key) || key === 'labelPosition') return isNumber(value) ? null : `${key} must be a number`;
  return null;
}

/** Why `set` cannot go on an element of `type`, or null. */
export function setProblem(type: string, set: Record<string, unknown>): string | null {
  const keys = keysFor(type);
  for (const [key, value] of Object.entries(set)) {
    if (key === 'locked') return 'the AI never locks or unlocks; ask the user';
    if (key === 'file') return 'a picture is never added or changed; remove it, or move it';
    if (!keys.has(key)) {
      if (type === 'image') return 'a picture can only be moved, resized or removed';
      if (type === 'stroke') return 'a pen stroke can only be moved, restyled or removed';
      return `${key} is not something a ${type} has`;
    }
    const problem = valueProblem(type, key, value);
    if (problem) return problem;
  }
  return null;
}

/** Why a new element cannot be added, or null. */
export function addProblem(element: Record<string, unknown>): string | null {
  const type = String(element.type ?? '');
  if (type === 'stroke') return 'the AI never draws pen strokes';
  if (type === 'image') return 'a picture is never added; ask the user to add it';
  if (!ADDABLE.has(type)) return `${type || 'an element without a type'} cannot be added`;
  const rest = { ...element };
  delete rest.type;
  delete rest.id;
  return setProblem(type, rest);
}

/** Every icon name a change sets, to check against the sets the window holds. */
export function iconNames(element: SceneElement | Record<string, unknown>): string[] {
  const icon = (element as { icon?: unknown }).icon;
  return typeof icon === 'string' ? [icon] : [];
}

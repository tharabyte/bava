/**
 * Icon names in the AI's canvas changes, checked against the sets the
 * window holds (bundled and the user's own) before the change is applied:
 * a name no set holds is refused, saying which.
 */
import type { PageEdit } from './page-edits';

/** The change without the icons no set holds, and what was refused. */
export function screenIcons(edit: PageEdit, known: (name: string) => boolean): { edit: PageEdit; refused: string[] } {
  if (!edit.canvas) return { edit, refused: [] };
  const refused: string[] = [];
  const canvas = edit.canvas.filter((op) => {
    const fields = op.op === 'add' ? op.element : op.op === 'update' ? op.set : null;
    const icon = fields?.icon;
    if (icon === undefined) return true;
    if (typeof icon === 'string' && known(icon)) return true;
    refused.push(`${op.op === 'update' ? op.id : 'add icon'}: no icon set holds ${String(icon)}; find one with find_icon`);
    return false;
  });
  return { edit: { ...edit, canvas }, refused };
}

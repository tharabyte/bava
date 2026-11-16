/**
 * D2 and equations in the AI's document changes, checked before they go in:
 * a block that does not compile goes back to the AI with its
 * errors, at most twice for a page; the third time it goes in as written
 * and the answer names its errors.
 */
import type { Node } from 'prosemirror-model';
import { parseBody } from '../docs/markdown';
import type { PageEdit } from './page-edits';
import { written } from './document-rules';

/** How many times a page's broken D2 or equations go back before going in as written. */
export const CHECK_RETRIES = 2;

export type Checkers = {
  /** The D2's compile errors, as lines; none when it compiles. */
  d2(source: string): Promise<string[]>;
  /** Why the TeX does not render, or null. */
  tex(tex: string, display: boolean): string | null;
};

async function problemsIn(markdown: string, checkers: Checkers): Promise<string[]> {
  const found: string[] = [];
  const nodes: Node[] = [];
  parseBody(markdown).descendants((node) => {
    nodes.push(node);
    return true;
  });
  for (const node of nodes) {
    if (node.type.name === 'code_block' && node.attrs.language === 'd2') {
      for (const line of await checkers.d2(node.textContent)) found.push(`D2: ${line}`);
    }
    if (node.type.name === 'math_block' || node.type.name === 'math_inline') {
      const problem = checkers.tex(String(node.attrs.tex), node.type.name === 'math_block');
      if (problem) found.push(`equation: ${problem}`);
    }
  }
  return found;
}

/**
 * The change with its broken blocks held back (or let through, after the
 * retries), what was refused, and what went in with its errors.
 */
export async function screenDocument(
  edit: PageEdit,
  page: string,
  checkers: Checkers,
  tries: Map<string, number>,
): Promise<{ edit: PageEdit; refused: string[]; notes: string[] }> {
  if (!edit.document?.length) return { edit, refused: [], notes: [] };
  const refused: string[] = [];
  const notes: string[] = [];
  const tried = tries.get(page) ?? 0;
  let broken = false;
  const document = [];
  for (const op of edit.document) {
    if (op.op !== 'insert' && op.op !== 'replace') {
      document.push(op);
      continue;
    }
    const made = written(op.markdown, page);
    const problems = 'problem' in made ? [] : await problemsIn(made.markdown, checkers);
    const where = op.op === 'replace' ? op.block : `insert ${op.after ? `after ${op.after}` : 'at the start'}`;
    if (problems.length === 0) {
      document.push(op);
      continue;
    }
    broken = true;
    if (tried < CHECK_RETRIES) {
      refused.push(`${where}: does not compile, fix and send again: ${problems.join('; ')}`);
    } else {
      document.push(op);
      notes.push(`${where} went in as written, with its errors: ${problems.join('; ')}`);
    }
  }
  if (broken && tried < CHECK_RETRIES) tries.set(page, tried + 1);
  else tries.delete(page);
  return { edit: { ...edit, document }, refused, notes };
}

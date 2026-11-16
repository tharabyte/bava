/**
 * What the page worker does with a page not on screen, apart from the
 * worker itself so it is tested where there is no DOM, as in the worker.
 * It reads and changes pages with the same page code the editor uses, and
 * sizes canvas text with the bundled fonts and the window's theme values,
 * so it stores the sizes the window would.
 */
import { parsePage } from '../docs/markdown';
import { createFitter } from '../canvas/fit';
import type { SceneElement } from '../canvas/scene';
import { pageText } from './page-text';
import { applyToFile, type ApplyAnswer } from './apply';
import type { PageEdit } from './page-edits';

/** The bundled fonts, by family, at their addresses in the app. */
export type FontFiles = Record<string, string>;

export type Work =
  | { id: number; kind: 'read'; path: string; source: string; elements: SceneElement[] }
  | {
      id: number;
      kind: 'apply';
      path: string;
      file: { source: string; scene: Record<string, unknown> & { elements?: SceneElement[] } };
      edit: PageEdit;
      /** The window's theme values sizing reads (`SIZING_VARIABLES`). */
      theme: Record<string, string>;
      fonts: FontFiles;
    };

export type WorkReply = { id: number; text?: string; answer?: ApplyAnswer; error?: string };

let fontsLoading: Promise<void> | null = null;

/**
 * Loads the bundled fonts into the worker once, before anything is
 * measured: without them a worker measures a fallback face and stores the
 * wrong sizes.
 */
function loadFonts(fonts: FontFiles): Promise<void> {
  const scope = globalThis as { fonts?: { add(face: FontFace): void } };
  if (!scope.fonts || typeof FontFace === 'undefined') return Promise.resolve();
  fontsLoading ??= (async () => {
    for (const [family, url] of Object.entries(fonts)) {
      const face = new FontFace(family, `url(${url})`, { weight: '100 900' });
      await face.load();
      scope.fonts!.add(face);
    }
  })();
  return fontsLoading;
}

/** Does one piece of work; a failure is its answer, never a throw. */
export async function handleWork(work: Work): Promise<WorkReply> {
  try {
    if (work.kind === 'read') {
      const { doc } = parsePage(work.source);
      return { id: work.id, text: pageText({ path: work.path, doc, elements: work.elements }) };
    }
    await loadFonts(work.fonts);
    const fitter = createFitter((name) => work.theme[name] ?? '');
    const sizing = { measureText: fitter.measureText, refit: fitter.refit };
    return { id: work.id, answer: applyToFile(work.path, work.file, work.edit, sizing) };
  } catch {
    return { id: work.id, error: `${work.path} could not be ${work.kind === 'read' ? 'read' : 'changed'}.` };
  }
}

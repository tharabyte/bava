/** The window's checks for the AI's D2 and equations: Go's compiler, and the equation renderer. */
import katex from 'katex';
import { RenderService } from '../../bindings/github.com/tharabyte/bava/internal/app';
import type { Checkers } from './doc-checks';

export const checkers: Checkers = {
  d2: async (source) => {
    const result = await RenderService.Render(source, { engine: '' } as never);
    return (result.errors ?? []).map((error) => `line ${error.line}: ${error.message}`);
  },
  tex: (tex, display) => {
    try {
      katex.renderToString(tex, { displayMode: display, throwOnError: true, trust: false, strict: 'ignore' });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message.replace(/^KaTeX parse error: /, '') : 'it does not render';
    }
  },
};

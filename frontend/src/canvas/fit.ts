/**
 * Sizing what Bava draws, as it is drawn: a text's measured size, a shape
 * grown to its label, a code block fitted to its code, an icon's label.
 * The window and the page worker both size with this, the worker from a
 * copy of the window's theme values and the bundled fonts, so a change made
 * to a closed page stores the sizes the window would.
 */
import { measureCode, fitToCode, type CodeMetrics } from './code/measure';
import { monoAdvance } from './code/advance';
import { iconLabelSize } from './icons/icon-look';
import { growToLabel, labelHeight } from './label-box';
import { paintFor } from './paint';
import type { ReadVariable } from './palette';
import { CODE_FONT_SIZE } from './style-defaults';
import type { IconElement, SceneElement } from './scene';
import { canvasLineWidth, measureFor, type Measurement } from './text-measure';

export type Fitter = ReturnType<typeof createFitter>;

/** The theme values sizing reads, so the worker can be handed a copy. */
export const SIZING_VARIABLES = ['--font-ui', '--font-mono', '--leading-tight', '--leading-code', '--size-code-padding', '--size-label-inset'];

export function createFitter(read: ReadVariable, lineWidth: (font: string) => (line: string) => number = canvasLineWidth) {
  const lineFor = (font: { size: number; family: string }) => lineWidth(`${font.size}px ${font.family}`);

  /** The height a labelled shape needs for its label as drawn. */
  function shapeLabelHeight(element: SceneElement): number {
    const label = (element as { label?: string }).label;
    if (!label) return 0;
    const paint = paintFor(element, read);
    const inset = parseFloat(read('--size-label-inset')) || 0;
    return labelHeight(element.type, element.w, element.h, label, inset, paint.font, lineFor(paint.font));
  }

  function codeMetrics(element?: SceneElement): CodeMetrics {
    // Absent means the file format's 13, as the stage draws it.
    const size = (element as { fontSize?: number } | undefined)?.fontSize ?? CODE_FONT_SIZE;
    return {
      advance: monoAdvance(size, read('--font-mono').trim()),
      lineHeight: size * (parseFloat(read('--leading-code')) || 0),
      padding: parseFloat(read('--size-code-padding')) || 0,
    };
  }

  /** A text element's size in the font it is drawn in. */
  function measureText(element: SceneElement, text: string): Measurement {
    return measureFor(text, paintFor(element, read).font, lineWidth);
  }

  /** After a change: a code block refitted, a shape grown to its label, an icon's label measured. */
  function refit(element: SceneElement): void {
    fitToCode(element, codeMetrics(element));
    growToLabel(element, shapeLabelHeight);
    if (element.type === 'icon' && element.label) {
      const paint = paintFor(element, read);
      const size = iconLabelSize(element as IconElement, element.label, lineFor(paint.font), paint.font);
      element.measuredWidth = size.width;
      element.measuredHeight = size.height;
    }
  }

  /** A new code block's size from its code. */
  function codeSize(element: SceneElement & { code: string }): Measurement {
    return measureCode(element.code, codeMetrics(element));
  }

  return { shapeLabelHeight, codeMetrics, measureText, refit, codeSize };
}

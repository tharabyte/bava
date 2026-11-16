/**
 * The page's answers to the agent plug (`agent:ask`), from what the window
 * holds: the Space and the open page as on screen, the selection, icon
 * names. A closed page goes to the page worker with the file Go read.
 */
import type { Node } from 'prosemirror-model';
import type { SceneElement } from '../canvas/scene';
import type { IconEntry } from '../canvas/icons/sets';
import { searchIcons } from '../canvas/icons/search';
import { frontOf } from '../docs/markdown';
import type { Scene } from '../../bindings/github.com/tharabyte/bava/internal/format/models';
import { AnswerError } from './answers';
import { canvasText, pageText } from './page-text';
import type { Work } from './page-work';
import type { ApplyAnswer } from './apply';
import type { PageEdit } from './page-edits';

/** The open page as Go's search takes it: its path in the Space, text and scene. */
export type OpenPage = { path: string; source: string; scene: Scene };

export type PageAnswerDeps = {
  root(): string | null;
  open(): OpenPage | null;
  /** The open page's document as its editor holds it. */
  openDoc(): Node | null;
  elements(): SceneElement[];
  selectedIds(): string[];
  selectedText(): string;
  /** Every icon of the bundled and custom sets. */
  icons(): Promise<IconEntry[]>;
  readClosed(work: Omit<Extract<Work, { kind: 'read' }>, 'id'>): Promise<string>;
  /**
   * Claims the open page: waits for a pause in typing, then, unless the page
   * is locked, makes it read-only and saves it. Resolves with whether it is
   * locked.
   */
  claimOpen(path: string): Promise<boolean>;
  /** The AI's changes to the open page, in its editor and scene. */
  applyOpen(path: string, edit: PageEdit): Promise<ApplyAnswer>;
  /** The AI's changes to a page not on screen, in the page worker. */
  applyClosed(path: string, file: { source: string; scene: Scene }, edit: PageEdit): Promise<ApplyAnswer>;
  /** Whether the AI holds the page now: a Stop between ask and answer refuses. */
  holds(path: string): boolean;
};

type ApplyArgs = { path: string; edit: PageEdit; file: { source: string; scene: Scene } | null };

type ClaimArgs = { path: string; file: { source: string; scene: Scene } | null };

type PageTextArgs = { path: string; file: { source: string; scene: Scene } | null };

/** How many icon names one question answers with. */
const ICON_ANSWERS = 20;

export function pageAnswers(deps: PageAnswerDeps) {
  return {
    space: (_args?: unknown) => {
      const root = deps.root();
      return root ? { root, open: deps.open() } : null;
    },

    pageText: async (args: unknown) => {
      const { path, file } = args as PageTextArgs;
      if (file) {
        const elements = (file.scene?.elements ?? []) as unknown as SceneElement[];
        return { text: await deps.readClosed({ kind: 'read', path, source: file.source, elements }) };
      }
      const open = deps.open();
      const doc = deps.openDoc();
      if (!open || open.path !== path || !doc) throw new AnswerError(`${path} is no longer the open page; read it again.`);
      return { text: pageText({ path, doc, elements: deps.elements() }) };
    },

    claim: async (args: unknown) => {
      const { path, file } = args as ClaimArgs;
      if (file) return { locked: frontOf(file.source).front.settings.locked === true };
      const open = deps.open();
      if (!open || open.path !== path) throw new AnswerError(`${path} is no longer the open page; claim it again.`);
      return { locked: await deps.claimOpen(path) };
    },

    apply: async (args: unknown) => {
      const { path, edit, file } = args as ApplyArgs;
      if (!deps.holds(path)) throw new AnswerError(`The user stopped the AI on ${path}; nothing was applied.`);
      if (file) return deps.applyClosed(path, file, edit);
      const open = deps.open();
      if (!open || open.path !== path) throw new AnswerError(`${path} is no longer the open page; read it again.`);
      return deps.applyOpen(path, edit);
    },

    selection: (_args?: unknown) => {
      const ids = deps.selectedIds();
      if (ids.length > 0) return { text: canvasText(deps.elements(), new Set(ids)) };
      return { text: deps.selectedText() };
    },

    icons: async (args: unknown) => {
      const { query } = args as { query: string };
      const found = searchIcons(await deps.icons(), query, ICON_ANSWERS);
      return { names: found.map((icon) => `${icon.set}/${icon.name}`) };
    },
  };
}

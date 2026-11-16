// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { AI_CHANGE } from './editor';
import { openEditor } from './test-editor';

describe('a page the AI holds', () => {
  it('is read-only for the user, takes the AI’s changes, and keeps its own lock setting', () => {
    const { editor, view } = openEditor('# Notes\n\nWords.\n');
    editor.setHeld(true);
    expect(view.editable).toBe(false);
    expect(editor.locked).toBe(true);
    expect(editor.pageLocked).toBe(false);
    // The AI's change is a transaction dispatched by Bava, not typing.
    view.dispatch(view.state.tr.insertText('Typed ', 3));
    expect(editor.markdown()).not.toContain('Typed');
    view.dispatch(view.state.tr.insertText('More ', view.state.doc.content.size - 2).setMeta(AI_CHANGE, true));
    expect(editor.markdown()).toContain('More');
    editor.setHeld(false);
    expect(view.editable).toBe(true);
  });
});

describe('a page the AI changed while it was not on screen', () => {
  it('opens as its file reads, unchanged, with ⌘Z going back to before', () => {
    const { editor } = openEditor(null);
    editor.setPageAfter('# Notes\n\nBefore.\n', '# Notes\n\nAfter the AI.\n');
    expect(editor.markdown()).toBe('# Notes\n\nAfter the AI.\n');
    editor.undo();
    expect(editor.markdown()).toBe('# Notes\n\nBefore.\n');
  });
});

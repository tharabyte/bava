import { describe, expect, it } from 'vitest';
import { createAgentView, stepSentence, type Step, type StepLine } from './agent-status.svelte';

const step = (id: string, tool: string, state: Step['state'], subject = ''): Step => ({ id, tool, state, subject });

describe('stepSentence', () => {
  it('has a sentence for each Look tool in each state', () => {
    expect(stepSentence(step('1', 'read_page', 'running', 'Payments'))).toEqual({ before: 'Reading ', subject: 'Payments', after: '' });
    expect(stepSentence(step('1', 'read_page', 'done', 'Payments'))).toEqual({ before: 'Read ', subject: 'Payments', after: '' });
    expect(stepSentence(step('1', 'search', 'done', 'billing'))).toEqual({ before: 'Searched for ', subject: 'billing', after: '' });
    expect(stepSentence(step('1', 'list_pages', 'done'))).toEqual({ before: 'Listed the pages', subject: '', after: '' });
    expect(stepSentence(step('1', 'read_selection', 'failed'))).toEqual({ before: 'Could not read the selection', subject: '', after: '' });
    expect(stepSentence(step('1', 'find_icon', 'done', 'database'))).toEqual({ before: 'Found icons for ', subject: 'database', after: '' });
  });

  it('names a tool not on the menu', () => {
    expect(stepSentence(step('1', 'send_email', 'unavailable'))).toEqual({ before: '', subject: 'send_email', after: " isn't available in Bava" });
  });

  it('has a sentence for a tool it does not know yet', () => {
    expect(stepSentence(step('1', 'future_tool', 'done'))).toEqual({ before: 'Ran ', subject: 'future_tool', after: '' });
  });
});

describe('the agent view', () => {
  const texts = (lines: StepLine[]) =>
    lines.map((l) => (l.kind === 'run' ? `${l.label} [${l.steps.map((s) => s.subject).join(', ')}]` : `${l.step.state}:${l.step.tool}:${l.step.subject}`));

  it('keeps each call once, in the order it started, updated in place', () => {
    const view = createAgentView();
    view.step(step('a', 'read_page', 'running', 'Payments'));
    view.step(step('b', 'search', 'running', 'billing'));
    view.step(step('a', 'read_page', 'done', 'Payments'));
    expect(texts(view.lines)).toEqual(['done:read_page:Payments', 'running:search:billing']);
  });

  it('folds a run of the same tool, done, into one line', () => {
    const view = createAgentView();
    for (const [id, subject] of [['a', 'Payments'], ['b', 'Orders'], ['c', 'Ledger']]) {
      view.step(step(id, 'read_page', 'running', subject));
      view.step(step(id, 'read_page', 'done', subject));
    }
    view.step(step('d', 'search', 'done', 'billing'));
    view.step(step('e', 'read_page', 'done', 'Payments'));
    expect(texts(view.lines)).toEqual(['Read 3 pages [Payments, Orders, Ledger]', 'done:search:billing', 'done:read_page:Payments']);
  });

  it('does not fold a run while one is still running or one failed', () => {
    const view = createAgentView();
    view.step(step('a', 'read_page', 'done', 'Payments'));
    view.step(step('b', 'read_page', 'failed', 'Orders'));
    expect(texts(view.lines)).toEqual(['done:read_page:Payments', 'failed:read_page:Orders']);
  });

  it('keeps the status and clears the steps', () => {
    const view = createAgentView();
    view.status({ on: true, address: 'http://127.0.0.1:7341/bava', code: 'X', codeKept: true, connected: 2, editing: false, problem: '' });
    view.step(step('a', 'search', 'done', 'x'));
    expect(view.current.connected).toBe(2);
    view.clear();
    expect(view.lines).toEqual([]);
    expect(view.current.connected).toBe(2);
  });
});

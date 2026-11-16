import { describe, expect, it, vi } from 'vitest';
import { AnswerError, answerAsk, type Handlers } from './answers';

function recorder() {
  const sent: { id: string; result: string; failure: string }[] = [];
  return {
    sent,
    send: (id: string, result: string, failure: string) => {
      sent.push({ id, result, failure });
    },
  };
}

describe('answerAsk', () => {
  it('answers each kind from its own handler, as JSON', async () => {
    const handlers: Handlers = {
      openPage: () => ({ path: 'Notes.md', text: 'unsaved words' }),
      icons: async (args) => ({ names: [`aws/${(args as { query: string }).query}`] }),
    };
    const { sent, send } = recorder();
    await answerAsk({ id: 'ask-1', kind: 'openPage', args: null }, handlers, send, vi.fn());
    await answerAsk({ id: 'ask-2', kind: 'icons', args: { query: 'rds' } }, handlers, send, vi.fn());
    expect(sent).toEqual([
      { id: 'ask-1', result: '{"path":"Notes.md","text":"unsaved words"}', failure: '' },
      { id: 'ask-2', result: '{"names":["aws/rds"]}', failure: '' },
    ]);
  });

  it('answers null when the handler has nothing', async () => {
    const { sent, send } = recorder();
    await answerAsk({ id: 'ask-1', kind: 'selection', args: null }, { selection: () => undefined }, send, vi.fn());
    expect(sent[0]).toEqual({ id: 'ask-1', result: 'null', failure: '' });
  });

  it('an unknown kind is a failure, not silence', async () => {
    const { sent, send } = recorder();
    await answerAsk({ id: 'ask-1', kind: 'nope', args: null }, {}, send, vi.fn());
    expect(sent[0].failure).toBe('The page cannot answer "nope".');
  });

  it('a handler saying why it cannot answer passes that on', async () => {
    const { sent, send } = recorder();
    const handlers: Handlers = {
      openPage: () => {
        throw new AnswerError('No page is open.');
      },
    };
    await answerAsk({ id: 'ask-1', kind: 'openPage', args: null }, handlers, send, vi.fn());
    expect(sent[0]).toEqual({ id: 'ask-1', result: '', failure: 'No page is open.' });
  });

  it('an unexpected error is logged and its message kept from the agent', async () => {
    const { sent, send } = recorder();
    const report = vi.fn();
    const boom = new TypeError('cannot read secret-looking text');
    await answerAsk(
      { id: 'ask-1', kind: 'openPage', args: null },
      {
        openPage: () => {
          throw boom;
        },
      },
      send,
      report,
    );
    expect(sent[0].failure).toBe('The page could not answer.');
    expect(report).toHaveBeenCalledWith(boom, 'agent-answer');
  });
});

it('a failed send does not throw', async () => {
  const send = () => Promise.reject(new Error('no Go'));
  await expect(answerAsk({ id: 'ask-1', kind: 'x', args: null }, { x: () => 1 }, send, vi.fn())).resolves.toBeUndefined();
});

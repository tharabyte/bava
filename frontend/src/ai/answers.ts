/**
 * The page's answers to the agent plug's questions (`agent:ask`): what only
 * the page knows, such as the open page as on screen, the selection or icon
 * names. Each kind has a handler; its result goes back to Go as JSON through
 * `AgentService.Answer`. The answers go to the user's own agent, so they are
 * in English for a model to read, not translated.
 */
import { Events } from '@wailsio/runtime';
import { AgentService } from '../../bindings/github.com/tharabyte/bava/internal/app';
import { report as logReport, type Report } from '../ipc/log';

export const AGENT_ASK_EVENT = 'agent:ask';

export type Ask = { id: string; kind: string; args: unknown };

export type Handlers = Record<string, (args: unknown) => unknown>;

export type Send = (id: string, result: string, failure: string) => unknown;

/** A handler throws this to tell the agent why it cannot answer. */
export class AnswerError extends Error {
  override name = 'AnswerError';
}

/** Answers one question with its kind's handler. Never throws. */
export async function answerAsk(ask: Ask, handlers: Handlers, send: Send, report: Report): Promise<void> {
  // Go gone mid-answer leaves no one to tell; the ask ends there on its own.
  const reply = async (result: string, failure: string) => {
    try {
      await send(ask.id, result, failure);
    } catch {
      /* no one is waiting */
    }
  };
  const handler = Object.hasOwn(handlers, ask.kind) ? handlers[ask.kind] : undefined;
  if (!handler) {
    await reply('', `The page cannot answer "${ask.kind}".`);
    return;
  }
  let result: string;
  try {
    result = JSON.stringify((await handler(ask.args)) ?? null);
  } catch (error) {
    if (error instanceof AnswerError) {
      await reply('', error.message);
      return;
    }
    // The message may quote the page; the log keeps its kind and frames.
    void report(error, 'agent-answer');
    await reply('', 'The page could not answer.');
    return;
  }
  await reply(result, '');
}

/** Answers every question from Go with handlers; returns the unsubscribe. */
export function listenForAsks(handlers: Handlers): () => void {
  return Events.On(AGENT_ASK_EVENT, (event) => {
    void answerAsk(event.data as Ask, handlers, (id, result, failure) => AgentService.Answer(id, result, failure), logReport);
  });
}

/**
 * The window's side of the page worker: pages go to it one at a time, each
 * answered or failed on its own. A worker that dies fails the page it held,
 * and the next page starts a new worker.
 */
import type { ApplyAnswer } from './apply';
import type { Work, WorkReply } from './page-work';

export type WorkerLike = {
  onmessage: ((event: MessageEvent<WorkReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(work: Work): void;
  terminate(): void;
};

type Queued = { work: Work; resolve: (reply: WorkReply) => void; reject: (error: Error) => void };

type Unnumbered<T> = T extends unknown ? Omit<T, 'id'> : never;

const failedFor = (work: Work) => `${work.path} could not be ${work.kind === 'read' ? 'read' : 'changed'}.`;

export function createPageWork(make: () => WorkerLike) {
  let worker: WorkerLike | null = null;
  let next = 0;
  let busy: Queued | null = null;
  const queue: Queued[] = [];

  function finish(reply: WorkReply) {
    const held = busy;
    if (!held || reply.id !== held.work.id) return;
    busy = null;
    if (reply.error !== undefined) held.reject(new Error(reply.error));
    else held.resolve(reply);
    pump();
  }

  function lost() {
    const held = busy;
    worker?.terminate();
    worker = null;
    busy = null;
    held?.reject(new Error(failedFor(held.work)));
    pump();
  }

  function pump() {
    if (busy || queue.length === 0) return;
    busy = queue.shift()!;
    if (!worker) {
      worker = make();
      worker.onmessage = (event) => finish(event.data);
      worker.onerror = () => lost();
    }
    worker.postMessage(busy.work);
  }

  function run(work: Unnumbered<Work>): Promise<WorkReply> {
    return new Promise((resolve, reject) => {
      next += 1;
      queue.push({ work: { ...work, id: next } as Work, resolve, reject });
      queueMicrotask(pump);
    });
  }

  return {
    /** The page's short text, read by the worker from its file. */
    async read(work: Unnumbered<Extract<Work, { kind: 'read' }>>): Promise<string> {
      const reply = await run(work);
      if (reply.text === undefined) throw new Error(failedFor({ ...work, id: 0 }));
      return reply.text;
    },
    /** The page changed by the worker, as data, with its new file for Go to save. */
    async apply(work: Unnumbered<Extract<Work, { kind: 'apply' }>>): Promise<ApplyAnswer> {
      const reply = await run(work);
      if (!reply.answer) throw new Error(failedFor({ ...work, id: 0 }));
      return reply.answer;
    },
  };
}

/** The app's page worker. */
export const pageWork = createPageWork(
  () => new Worker(new URL('./page-worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
);

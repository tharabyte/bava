import { describe, expect, it } from 'vitest';
import { createPageWork, type WorkerLike } from './page-worker-client';
import type { Work, WorkReply } from './page-work';

/** A worker that answers on cue, recording what it was sent. */
function fakeWorker() {
  const sent: Work[] = [];
  const worker: WorkerLike & { reply(r: WorkReply): void; fail(): void } = {
    onmessage: null,
    onerror: null,
    postMessage(work: Work) {
      sent.push(work);
    },
    terminate() {},
    reply(r) {
      worker.onmessage?.({ data: r } as MessageEvent<WorkReply>);
    },
    fail() {
      worker.onerror?.(new Event('error') as ErrorEvent);
    },
  };
  return { worker, sent };
}

const read = (path: string) => ({ kind: 'read' as const, path, source: '', elements: [] });

describe('page work in the window', () => {
  it('sends one page at a time, in order', async () => {
    const { worker, sent } = fakeWorker();
    const work = createPageWork(() => worker);
    const first = work.read(read('A.md'));
    const second = work.read(read('B.md'));
    await Promise.resolve();
    expect(sent.map((w) => w.path)).toEqual(['A.md']);
    worker.reply({ id: sent[0].id, text: 'a' });
    expect(await first).toBe('a');
    await Promise.resolve();
    expect(sent.map((w) => w.path)).toEqual(['A.md', 'B.md']);
    worker.reply({ id: sent[1].id, text: 'b' });
    expect(await second).toBe('b');
  });

  it('a failure fails that page only', async () => {
    const { worker, sent } = fakeWorker();
    const work = createPageWork(() => worker);
    const bad = work.read(read('Bad.md'));
    const good = work.read(read('Good.md'));
    await Promise.resolve();
    worker.reply({ id: sent[0].id, error: 'Bad.md could not be read.' });
    await expect(bad).rejects.toThrow('Bad.md could not be read.');
    await Promise.resolve();
    worker.reply({ id: sent[1].id, text: 'fine' });
    expect(await good).toBe('fine');
  });

  it('a worker that dies fails what it held and a new one takes the next', async () => {
    const workers = [fakeWorker(), fakeWorker()];
    let made = 0;
    const work = createPageWork(() => workers[made++].worker);
    const lost = work.read(read('A.md'));
    await Promise.resolve();
    workers[0].worker.fail();
    await expect(lost).rejects.toThrow('A.md could not be read.');
    const next = work.read(read('B.md'));
    await Promise.resolve();
    expect(made).toBe(2);
    workers[1].worker.reply({ id: workers[1].sent[0].id, text: 'b' });
    expect(await next).toBe('b');
  });
});

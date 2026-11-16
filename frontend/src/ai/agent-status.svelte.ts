/**
 * The agent view: the plug's status, and one line per tool the agent ran,
 * fed by Go's `agent:status` and `agent:step` events. A run of the same
 * tool, all done, folds into one line that opens to its calls.
 */
import { messages, type MessageKey } from '../i18n/messages';
import { t } from '../i18n/t';

export type Step = { id: string; tool: string; state: 'running' | 'done' | 'failed' | 'unavailable'; subject: string };

export type AgentStatus = {
  on: boolean;
  address: string;
  code: string;
  codeKept: boolean;
  connected: number;
  editing: boolean;
  problem: string;
};

export const AGENT_OFF: AgentStatus = { on: false, address: '', code: '', codeKept: false, connected: 0, editing: false, problem: '' };

export type StepLine = { kind: 'step'; step: Step } | { kind: 'run'; tool: string; label: string; steps: Step[] };

/** A sentence around its subject, which is shown stronger. */
export type Sentence = { before: string; subject: string; after: string };

const known = (key: string): key is MessageKey => Object.hasOwn(messages, key);

function around(text: string, subject: string): Sentence {
  const at = text.indexOf('{subject}');
  if (at < 0) return { before: text, subject: '', after: '' };
  return { before: text.slice(0, at), subject, after: text.slice(at + '{subject}'.length) };
}

/** What a step says: one sentence per tool, past tense when done. */
export function stepSentence(step: Step): Sentence {
  if (step.state === 'unavailable') return around(t('agent.step.unavailable'), step.tool);
  const key = `agent.step.${step.tool}.${step.state}`;
  if (known(key)) return around(t(key), step.subject);
  return around(t(`agent.step.other.${step.state}` as MessageKey), step.tool);
}

function foldLabel(tool: string, count: number): string {
  const key = `agent.fold.${tool}`;
  const text = known(key) ? t(key) : t('agent.fold.other').replace('{tool}', tool);
  return text.replace('{count}', String(count));
}

/** Calls in the order they started, a run of done calls of one tool folded. */
function linesOf(steps: Step[]): StepLine[] {
  const lines: StepLine[] = [];
  let i = 0;
  while (i < steps.length) {
    let j = i;
    while (j < steps.length && steps[j].tool === steps[i].tool && steps[j].state === 'done') j++;
    if (j - i >= 2) {
      const run = steps.slice(i, j);
      lines.push({ kind: 'run', tool: steps[i].tool, label: foldLabel(steps[i].tool, run.length), steps: run });
      i = j;
    } else {
      lines.push({ kind: 'step', step: steps[i] });
      i++;
    }
  }
  return lines;
}

export function createAgentView() {
  let current = $state.raw<AgentStatus>(AGENT_OFF);
  let steps = $state.raw<Step[]>([]);
  const lines = $derived(linesOf(steps));

  return {
    get current() {
      return current;
    },
    get lines() {
      return lines;
    },
    status(next: AgentStatus) {
      current = next;
    },
    /** A call started or ended: a new line, or its line updated in place. */
    step(next: Step) {
      const at = steps.findIndex((s) => s.id === next.id);
      steps = at < 0 ? [...steps, next] : steps.map((s, i) => (i === at ? next : s));
    },
    clear() {
      steps = [];
    },
  };
}

export type AgentView = ReturnType<typeof createAgentView>;

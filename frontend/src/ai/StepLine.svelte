<script lang="ts">
  /**
   * One line per tool the AI ran: a sentence with its subject stronger, a
   * spinner, tick or cross. A folded run opens to its calls.
   *
   * Presentational: the caller supplies the line.
   */
  import ToolIcon from '../components/ToolIcon.svelte';
  import { stepSentence, type Step, type StepLine } from './agent-status.svelte';

  type Props = { line: StepLine };

  let { line }: Props = $props();
  let open = $state(false);

  const stateOf = (step: Step) => (step.state === 'unavailable' ? 'failed' : step.state);
</script>

{#snippet one(step: Step)}
  {@const sentence = stepSentence(step)}
  <div class="step" data-state={stateOf(step)} data-tool={step.tool}>
    <span class="st" aria-hidden="true">
      {#if step.state === 'running'}<span class="spin"><ToolIcon id="loader" size="sm" /></span>
      {:else if step.state === 'done'}<ToolIcon id="check" size="sm" />
      {:else}<ToolIcon id="close" size="sm" />{/if}
    </span>
    <span class="tx">{sentence.before}{#if sentence.subject}<em>{sentence.subject}</em>{/if}{sentence.after}</span>
  </div>
{/snippet}

{#if line.kind === 'step'}
  {@render one(line.step)}
{:else}
  <button type="button" class="run step" data-state="done" aria-expanded={open} onclick={() => (open = !open)}>
    <span class="st" aria-hidden="true"><ToolIcon id="check" size="sm" /></span>
    <span class="tx">{line.label}</span>
    <span class="open" class:turned={open} aria-hidden="true"><ToolIcon id="chevron" size="sm" /></span>
  </button>
  {#if open}
    <div class="substeps">
      {#each line.steps as step (step.id)}{@render one(step)}{/each}
    </div>
  {/if}
{/if}

<style>
  .step {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--size-row-sm);
    padding: 0 var(--space-1);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    font: inherit;
    font-size: var(--text-meta);
    color: var(--color-text-secondary);
    text-align: start;
  }

  .run {
    cursor: pointer;
  }

  .run:hover {
    background: var(--color-control-hover);
  }

  .run:active {
    background: var(--color-control-active);
  }

  .run:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-focus-ring);
    outline-offset: var(--focus-halo-width);
  }

  .st {
    display: inline-flex;
    flex: none;
    justify-content: center;
    width: var(--space-4);
    color: var(--color-text-muted);
  }

  .step[data-state='done'] .st {
    color: var(--color-ok);
  }

  .step[data-state='failed'] .st {
    color: var(--color-danger);
  }

  .step[data-state='running'] .st {
    color: var(--color-text-primary);
  }

  .spin {
    display: inline-flex;
    animation: spin var(--duration-indeterminate) linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .tx {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  em {
    font-style: normal;
    color: var(--color-text-primary);
  }

  .open {
    display: inline-flex;
    color: var(--color-text-faint);
  }

  .open.turned {
    transform: rotate(90deg);
  }

  .substeps {
    display: flex;
    flex-direction: column;
    gap: var(--border-width);
    margin-inline-start: var(--space-3);
    padding-inline-start: var(--space-2);
    border-inline-start: var(--border-width) solid var(--color-border-subtle);
  }
</style>

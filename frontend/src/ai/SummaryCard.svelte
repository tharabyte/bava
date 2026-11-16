<script lang="ts">
  /**
   * The record of a round of the AI's changes: pages created and changed,
   * changes refused and why. Everything in it is done; there is nothing to
   * accept or discard, and nothing to press.
   *
   * Presentational.
   */
  import { t } from '../i18n/t';
  import type { Summary, SummaryRow } from './summary.svelte';

  type Props = { summary: Summary };

  let { summary }: Props = $props();
</script>

{#snippet group(label: string, rows: SummaryRow[])}
  {#if rows.length > 0}
    <div class="group">{label}</div>
    {#each rows as row, i (i)}
      <div class="row"><span class="name">{row.name}</span><span class="what">{row.what}</span></div>
    {/each}
  {/if}
{/snippet}

<section class="summary" aria-label={t('agent.summary')} data-agent-summary>
  <header class="head"><span>{t('agent.summary')}</span><span class="released">{t('agent.summary.released')}</span></header>
  {@render group(t('agent.summary.created'), summary.created)}
  {@render group(t('agent.summary.changed'), summary.changed)}
  {@render group(t('agent.summary.skipped'), summary.skipped)}
</section>

<style>
  .summary {
    overflow: hidden;
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    background: var(--color-surface-raised);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border-hairline);
    font-size: var(--text-meta);
    font-weight: var(--weight-semibold);
    color: var(--color-text-primary);
  }

  .released {
    font-family: var(--font-data);
    font-size: var(--text-mono-status);
    font-weight: var(--weight-regular);
    color: var(--color-text-muted);
  }

  .group {
    padding: var(--space-2) var(--space-3) var(--space-half);
    font-family: var(--font-label);
    font-size: var(--text-label);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--size-row-sm);
    padding: var(--space-half) var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border-hairline);
    font-size: var(--text-meta);
  }

  .row:last-child {
    border-bottom: 0;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--color-text-primary);
  }

  .what {
    flex: none;
    max-width: 60%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-family: var(--font-data);
    font-size: var(--text-mono-status);
    color: var(--color-text-muted);
  }
</style>

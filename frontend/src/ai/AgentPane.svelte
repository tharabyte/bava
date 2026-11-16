<script lang="ts">
  /**
   * The AI pane before there is a chat: what the user's own agent is doing
   * in Bava. Whether it is connected, then one line per tool it ran.
   *
   * Presentational: the caller supplies the status and lines, and handles
   * opening AI settings, clearing the lines and closing the pane.
   */
  import ToolIcon from '../components/ToolIcon.svelte';
  import Tooltip from '../components/Tooltip.svelte';
  import { t } from '../i18n/t';
  import StepLine from './StepLine.svelte';
  import type { AgentStatus, StepLine as Line } from './agent-status.svelte';
  import SummaryCard from './SummaryCard.svelte';
  import type { Summary } from './summary.svelte';

  type Props = {
    status: AgentStatus;
    lines: Line[];
    /** Pages the AI is editing now. */
    claimed?: string[];
    /** The last round's record, once its last claim ended. */
    summary?: Summary | null;
    onStop?: (page: string) => void;
    onOpenSettings: () => void;
    onClear: () => void;
    onClose: () => void;
  };

  let { status, lines, claimed = [], summary = null, onStop = () => {}, onOpenSettings, onClear, onClose }: Props = $props();

  const pageName = (path: string) => path.replace(/^.*\//, '').replace(/\.md$/i, '');

  const connected = $derived(status.on && status.connected > 0);
</script>

<section class="agent-pane" aria-label={t('agent.pane')} data-agent-pane>
  <header class="header">
    <span class="title">{t('agent.pane.title')}</span>
    <span class="grow"></span>
    {#if lines.length > 0}
      <button type="button" class="bava-button ghost" onclick={onClear}>{t('agent.pane.clear')}</button>
    {/if}
    <Tooltip label={t('agent.pane.openSettings')} class="bava-icon-button" aria-label={t('agent.pane.openSettings')} onclick={onOpenSettings}>
      <ToolIcon id="settings" size="sm" />
    </Tooltip>
    <Tooltip label={t('agent.pane.close')} class="bava-icon-button" aria-label={t('agent.pane.close')} onclick={onClose}>
      <ToolIcon id="close" size="sm" />
    </Tooltip>
  </header>
  <div class="scroll">
    {#if !status.on}
      <p class="note">{t('agent.pane.off')}</p>
      <div><button type="button" class="bava-button" onclick={onOpenSettings}>{t('agent.pane.openSettings')}</button></div>
    {:else}
      <div class="status" data-connected={connected || undefined}>
        <span class="dot" aria-hidden="true"></span>
        {connected ? t('agent.pane.connected') : t('agent.pane.waiting')}
      </div>
      {#if claimed.length > 0}
        <div class="editing-block">
          <div class="label">{t('agent.editing')}</div>
          <ul class="editing" data-agent-editing>
            {#each claimed as page (page)}
              <li class="editing-row">
                <span class="name">{pageName(page)}</span>
                <button type="button" class="bava-button ghost" aria-label={t('agent.stop.page').replace('{page}', pageName(page))} onclick={() => onStop(page)}>{t('agent.stop')}</button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      {#if lines.length === 0 && !summary}
        <p class="note">{t('agent.pane.empty')}</p>
      {:else}
        <div class="steps" role="list">
          {#each lines as line, i (line.kind === 'step' ? line.step.id : `${line.tool}-${i}`)}
            <div role="listitem"><StepLine {line} /></div>
          {/each}
        </div>
      {/if}
      {#if summary}<SummaryCard {summary} />{/if}
    {/if}
  </div>
</section>

<style>
  .agent-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    min-height: 0;
    background: var(--color-surface);
  }

  .header {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex: none;
    height: var(--size-toolbar);
    padding: 0 var(--space-2) 0 var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border-hairline);
  }

  .title {
    font-size: var(--text-body);
    font-weight: var(--weight-semibold);
    color: var(--color-text-primary);
  }

  .grow {
    flex: 1;
  }

  .scroll {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-3);
  }

  .note {
    margin: 0;
    font-size: var(--text-meta);
    line-height: var(--leading-normal);
    color: var(--color-text-muted);
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-meta);
    color: var(--color-text-secondary);
  }

  .dot {
    width: var(--space-2);
    height: var(--space-2);
    border-radius: 50%;
    background: var(--color-text-faint);
  }

  .status[data-connected] .dot {
    background: var(--color-ok);
  }

  .editing-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .label {
    font-family: var(--font-label);
    font-size: var(--text-label);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .editing {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: var(--border-width) solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    list-style: none;
  }

  .editing-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--size-row-xl);
    padding: 0 var(--space-1) 0 var(--space-2);
    border-bottom: var(--border-width) solid var(--color-border-hairline);
    font-size: var(--text-meta);
    color: var(--color-text-primary);
  }

  .editing-row:last-child {
    border-bottom: 0;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: var(--border-width);
  }
</style>

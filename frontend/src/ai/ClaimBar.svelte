<script lang="ts">
  /**
   * Across a page the AI is editing: it says so and ends in Stop. Stop keeps
   * what the AI already changed and refuses anything after.
   *
   * Presentational: the caller handles Stop.
   */
  import ToolIcon from '../components/ToolIcon.svelte';
  import { t } from '../i18n/t';

  type Props = { onStop: () => void };

  let { onStop }: Props = $props();
</script>

<div class="claim-bar" role="region" aria-label={t('agent.bar.title')} data-claim-bar>
  <ToolIcon id="ai" size="sm" />
  <span class="title">{t('agent.bar.title')}</span>
  <span class="hint">{t('agent.bar.hint')}</span>
  <button type="button" class="bava-button primary stop" onclick={onStop}>{t('agent.stop')}</button>
</div>

<style>
  .claim-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: none;
    padding: var(--space-1) var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border-subtle);
    background: var(--color-accent-subtle);
    color: var(--color-text-secondary);
    font-size: var(--text-meta);
  }

  .title {
    font-weight: var(--weight-semibold);
    color: var(--color-text-primary);
  }

  .hint {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .stop {
    flex: none;
  }
</style>

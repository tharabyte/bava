<script lang="ts">
  /**
   * Settings ▸ AI: whether the AI may edit pages, and the user's own agent
   * (allowed or not, the address and the connection code with Copy and New
   * code, how many are connected, the port).
   *
   * Presentational. The caller holds the values and applies changes.
   */
  import NumberField from '../components/NumberField.svelte';
  import Toggle from '../components/Toggle.svelte';
  import ToolIcon from '../components/ToolIcon.svelte';
  import Tooltip from '../components/Tooltip.svelte';
  import { t } from '../i18n/t';
  import type { AgentStatus } from '../ai/agent-status.svelte';

  type Props = {
    allowEdits: boolean;
    allowAgents: boolean;
    port: number;
    status: AgentStatus;
    onAllowEditsChange: (on: boolean) => void;
    onAllowAgentsChange: (on: boolean) => void;
    onPortChange: (port: number) => void;
    onNewCode: () => void;
    onCopy: (text: string) => void;
  };

  let { allowEdits, allowAgents, port, status, onAllowEditsChange, onAllowAgentsChange, onPortChange, onNewCode, onCopy }: Props = $props();

  const problem = $derived(
    status.problem === 'portInUse'
      ? t('settings.ai.portInUse').replace('{port}', String(port))
      : status.problem
        ? t('settings.ai.startFailed')
        : '',
  );
  const connected = $derived(
    status.connected > 0 ? t('settings.ai.connected').replace('{count}', String(status.connected)) : t('settings.ai.connected.none'),
  );
</script>

<section class="section" data-ai-settings>
  <h3 class="heading">{t('settings.ai.editing')}</h3>
  <div data-allow-edits>
    <Toggle variant="row" label={t('settings.ai.allowEdits')} checked={allowEdits} onChange={onAllowEditsChange} />
  </div>
  <p class="hint">{t('settings.ai.allowEdits.hint')}</p>

  <h3 class="heading spaced">
    <span>{t('settings.ai.agent')}</span>
    {#if status.on}
      <span class="status" data-connected={status.connected > 0 || undefined}><span class="dot" aria-hidden="true"></span>{connected}</span>
    {/if}
  </h3>
  <p class="hint">{t('settings.ai.agent.hint')}</p>
  <div data-allow-agents>
    <Toggle variant="row" label={t('settings.ai.allowAgents')} checked={allowAgents} onChange={onAllowAgentsChange} />
  </div>
  <div class="kv">
    <span class="k">{t('settings.ai.port')}</span>
    <span class="port">
      <NumberField label={t('settings.ai.port')} value={port} min={1024} step={1} onValueChange={(next) => next >= 1024 && next <= 65535 && next !== port && onPortChange(next)} />
    </span>
    <span></span>
    {#if status.on}
      <span class="k">{t('settings.ai.address')}</span>
      <span class="v" data-agent-address>{status.address}</span>
      <Tooltip label={t('settings.ai.copyAddress')} class="bava-icon-button" aria-label={t('settings.ai.copyAddress')} onclick={() => onCopy(status.address)}>
        <ToolIcon id="copy" size="sm" />
      </Tooltip>
      <span class="k">{t('settings.ai.code')}</span>
      <span class="v" data-agent-code>{status.code}</span>
      <span class="actions">
        <Tooltip label={t('settings.ai.copyCode')} class="bava-icon-button" aria-label={t('settings.ai.copyCode')} onclick={() => onCopy(status.code)}>
          <ToolIcon id="copy" size="sm" />
        </Tooltip>
        <Tooltip label={t('settings.ai.newCode')} class="bava-icon-button" aria-label={t('settings.ai.newCode')} onclick={onNewCode}>
          <ToolIcon id="refresh" size="sm" />
        </Tooltip>
      </span>
    {/if}
  </div>
  {#if problem}<p class="hint problem" role="alert">{problem}</p>{/if}
  {#if status.on}
    <p class="hint">{t('settings.ai.connect.hint')}</p>
    {#if !status.codeKept}<p class="hint">{t('settings.ai.codeNotKept')}</p>{/if}
  {/if}
</section>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0;
    font-size: var(--text-label);
    font-weight: var(--weight-semibold);
    font-family: var(--font-label);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .spaced {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: var(--border-width) solid var(--color-border-subtle);
  }

  .hint {
    margin: 0;
    max-width: 52ch;
    font-size: var(--text-meta);
    line-height: var(--leading-normal);
    color: var(--color-text-muted);
  }

  .problem {
    color: var(--color-danger);
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-ui);
    font-size: var(--text-meta);
    font-weight: var(--weight-regular);
    letter-spacing: normal;
    text-transform: none;
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

  .kv {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) auto;
    gap: var(--space-2) var(--space-3);
    align-items: center;
    font-size: var(--text-meta);
  }

  .k {
    color: var(--color-text-muted);
  }

  .v {
    overflow: hidden;
    padding: var(--space-1) var(--space-2);
    border: var(--border-width) solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
    font-family: var(--font-data);
    font-size: var(--text-mono-status);
    color: var(--color-text-primary);
    white-space: nowrap;
    text-overflow: ellipsis;
    user-select: text;
  }

  .port {
    justify-self: start;
    inline-size: calc(var(--space-6) * 4);
  }

  .actions {
    display: flex;
    gap: var(--space-1);
  }
</style>

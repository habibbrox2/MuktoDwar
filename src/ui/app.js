/**
 * Local AI Gateway — admin console.
 *
 * Plain ES modules, no framework, no build step. The administrator token is
 * exchanged for an httpOnly session cookie at sign-in, so no secret is ever
 * written to browser storage.
 */

const state = {
  config: null,
  catalog: null,
  status: null,
  editing: null,
};

/* ------------------------------------------------------------------ *
 * API helpers
 * ------------------------------------------------------------------ */

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: { message: 'The server returned an unreadable response.' } };
    }
  }

  if (!response.ok) {
    const message = payload?.error?.message ?? `Request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

/* ------------------------------------------------------------------ *
 * Small DOM helpers
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== undefined && value !== null) {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(child);
  }
  return node;
}

let toastTimer = null;

function confirmDialog(message, title = 'Confirm') {
  return new Promise((resolve) => {
    const dialog = $('confirm-dialog');
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    const ok = $('confirm-ok');
    const cancel = $('confirm-cancel');
    const cleanup = () => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      dialog.removeEventListener('close', onClose);
    };
    const onOk = () => { cleanup(); dialog.close(); resolve(true); };
    const onCancel = () => { cleanup(); dialog.close(); resolve(false); };
    const onClose = () => { cleanup(); resolve(false); };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}
function toast(message, tone = 'info') {
  const node = $('toast');
  node.textContent = message;
  node.dataset.tone = tone;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 4200);
}

/* ------------------------------------------------------------------ *
 * Sign-in
 * ------------------------------------------------------------------ */

async function loadDefaultToken() {
  try {
    const response = await fetch('/admin/default-token', { credentials: 'same-origin' });
    if (!response.ok || response.status === 204) return;
    const data = await response.json();
    const container = $('gate-default-token');
    const value = $('gate-default-token-value');
    if (data?.token) {
      value.textContent = data.token;
      container.hidden = false;
      $('gate-copy-token').addEventListener('click', async () => {
        if (await copyToClipboard(data.token)) toast('Token copied.', 'ok');
        else toast('Copy failed. Select the token manually.', 'bad');
      });
    }
  } catch {
    // No default token available (rotated or not created yet).
  }
}

loadDefaultToken();

$('gate-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorNode = $('gate-error');
  errorNode.hidden = true;
  const token = $('token').value;
  try {
    await api('/admin/session', { method: 'POST', body: JSON.stringify({ token }) });
    $('token').value = '';
    await enterConsole();
  } catch (error) {
    errorNode.textContent = error.message;
    errorNode.hidden = false;
  }
});

async function enterConsole() {
  $('gate').hidden = true;
  $('console').hidden = false;
  await refreshAll();
}

async function lockConsole() {
  try {
    await api('/admin/session', { method: 'DELETE' });
  } catch {
    // The session may already be gone; the local state is cleared anyway.
  }
  state.config = null;
  state.catalog = null;
  state.status = null;
  $('console').hidden = true;
  $('gate').hidden = false;
  $('token').focus();
}

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    for (const other of document.querySelectorAll('.tab')) {
      other.setAttribute('aria-selected', String(other === tab));
    }
    for (const panel of document.querySelectorAll('.panel')) {
      panel.hidden = panel.id !== `panel-${name}`;
    }
  });
}

$('btn-refresh').addEventListener('click', () => void refreshAll());
$('btn-lock').addEventListener('click', () => void lockConsole());

/* ------------------------------------------------------------------ *
 * Data loading
 * ------------------------------------------------------------------ */

async function refreshAll() {
  const overlay = $('loading-overlay');
  if (overlay) overlay.hidden = false;
  try {
    const [config, catalog, status] = await Promise.all([
      api('/admin/config'),
      api('/admin/catalog'),
      api('/admin/status'),
    ]);
    state.config = config;
    state.catalog = catalog;
    state.status = status;
    render();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      await lockConsole();
      return;
    }
    toast(error.message, 'bad');
  } finally {
    const overlay = $('loading-overlay');
    if (overlay) overlay.hidden = true;
  }
}

function render() {
  renderStatusBar();
  renderProviders();
  renderModels();
  renderRouting();
  renderHealth();
}

function renderStatusBar() {
  const enabled = state.config.providers.filter((p) => p.enabled).length;
  $('pill-providers-text').textContent = String(enabled);
  $('pill-models-text').textContent = String(state.status.models.length);

  const server = $('pill-server');
  server.dataset.state = 'ok';
  $('pill-server-text').textContent = 'online';
}

function renderProviders() {
  const list = $('provider-list');
  list.replaceChildren();
  const providers = state.config.providers;
  $('providers-empty').hidden = providers.length > 0;

  for (const provider of providers) {
    const keys = provider.keys.length;
    const models = provider.models.length;

    const icon = el('span', {
      class: 'row__icon',
      'data-state': provider.enabled ? 'on' : 'off',
      'aria-hidden': 'true',
      text: provider.enabled ? '◉' : '○',
    });

    const title = el('div', { class: 'row__title' }, [
      el('span', { text: provider.label }),
      el('span', { class: 'tag', text: provider.kind }),
      provider.anonymous ? el('span', { class: 'tag', text: 'anonymous' }) : null,
      el('span', {
        class: `tag ${provider.enabled ? 'tag--ok' : ''}`,
        text: provider.enabled ? 'enabled' : 'disabled',
      }),
    ]);

    const meta = el('div', { class: 'row__meta' }, [
      el('span', { text: `${models} model${models === 1 ? '' : 's'}` }),
      el('span', { text: `${keys} key${keys === 1 ? '' : 's'}` }),
      el('span', { text: `priority ${provider.priority}` }),
    ]);

    const actions = el('div', { class: 'row__actions' }, [
      el('button', {
        type: 'button',
        class: 'icon-btn',
        title: 'Edit',
        'aria-label': `Edit ${provider.label}`,
        onclick: () => openProviderDialog(provider),
      }, [el('span', { class: 'sym', 'aria-hidden': 'true', text: '✎' })]),
      el('button', {
        type: 'button',
        class: 'icon-btn',
        title: 'Delete',
        'aria-label': `Delete ${provider.label}`,
        onclick: () => void deleteProvider(provider),
      }, [el('span', { class: 'sym', 'aria-hidden': 'true', text: '✕' })]),
    ]);

    list.append(el('li', { class: 'row' }, [icon, el('div', { class: 'row__main' }, [title, meta]), actions]));
  }
}

function renderModels() {
  const list = $('model-list');
  list.replaceChildren();
  const entries = state.status.models;
  $('models-empty').hidden = entries.length > 0;

  for (const entry of entries) {
    const title = el('div', { class: 'row__title' }, [
      el('span', { text: entry.model }),
      el('span', { class: 'tag tag--ok', text: 'free' }),
      entry.verified
        ? el('span', { class: 'tag tag--ok', text: 'verified' })
        : el('span', { class: 'tag tag--warn', text: 'unverified' }),
    ]);

    const meta = el('div', { class: 'row__meta' }, [
      el('span', { text: entry.providerLabel }),
    ]);

    list.append(
      el('li', { class: 'row' }, [
        el('span', { class: 'row__icon', 'aria-hidden': 'true', text: '❖' }),
        el('div', { class: 'row__main' }, [title, meta]),
      ]),
    );
  }
}

function renderRouting() {
  const routing = state.config.routing;
  $('routing-mode').value = routing.mode;
  $('routing-default').value = routing.defaultModel;
  $('routing-attempts').value = String(routing.maxAttempts);
  $('routing-cooldown').value = String(routing.cooldownMs);
  $('weight-priority').value = String(routing.weights.priority);
  $('weight-latency').value = String(routing.weights.latency);
  $('weight-health').value = String(routing.weights.health);
}

function renderHealth() {
  const body = $('status-body');
  body.replaceChildren();
  const rows = state.status.health ?? [];
  $('status-empty').hidden = rows.length > 0;

  for (const row of rows) {
    const cooling = row.cooldownUntil > Date.now();
    const broken = row.breakerOpenUntil > Date.now();
    const stateText = broken ? 'breaker open' : cooling ? 'cooldown' : row.consecutiveFailures > 0 ? 'degraded' : 'healthy';
    const tone = broken || cooling ? 'bad' : row.consecutiveFailures > 0 ? 'warn' : 'ok';

    body.append(
      el('tr', {}, [
        el('td', { text: row.providerId }),
        el('td', { text: row.keyId }),
        el('td', {}, [el('span', { class: `tag tag--${tone}`, text: stateText })]),
        el('td', { text: row.latencyMs === null ? '—' : `${Math.round(row.latencyMs)} ms` }),
        el('td', { text: String(row.successes) }),
        el('td', { text: String(row.failures) }),
      ]),
    );
  }
}

/* ------------------------------------------------------------------ *
 * Routing save
 * ------------------------------------------------------------------ */

$('btn-save-routing').addEventListener('click', async () => {
  const body = {
    mode: $('routing-mode').value,
    defaultModel: $('routing-default').value.trim(),
    maxAttempts: Number($('routing-attempts').value),
    cooldownMs: Number($('routing-cooldown').value),
    weights: {
      priority: Number($('weight-priority').value),
      latency: Number($('weight-latency').value),
      health: Number($('weight-health').value),
    },
  };
  try {
    state.config = await api('/admin/routing', { method: 'PUT', body: JSON.stringify(body) });
    toast('Routing settings saved.', 'ok');
    await refreshAll();
  } catch (error) {
    toast(error.message, 'bad');
  }
});

/* ------------------------------------------------------------------ *
 * Provider editor
 * ------------------------------------------------------------------ */

$('btn-add-provider').addEventListener('click', () => openProviderDialog(null));
$('provider-cancel').addEventListener('click', () => $('provider-dialog').close());

function openProviderDialog(provider) {
  state.editing = provider ?? null;
  const kindSelect = $('provider-kind');
  kindSelect.replaceChildren();

  for (const entry of state.catalog.providers) {
    kindSelect.append(el('option', { value: entry.kind, text: entry.label }));
  }

  $('provider-dialog-title').textContent = provider ? 'Edit provider' : 'Add provider';
  $('provider-kind').value = provider?.kind ?? 'gemini';
  $('provider-label').value = provider?.label ?? '';
  $('provider-id').value = provider?.id ?? '';
  $('provider-id').disabled = Boolean(provider);
  $('provider-key').value = '';
  $('provider-base-url').value = provider?.baseUrl ?? '';
  $('provider-priority').value = String(provider?.priority ?? 100);
  $('provider-enabled').checked = provider?.enabled ?? false;
  $('provider-anonymous').checked = provider?.anonymous ?? false;

  renderModelChips(provider);
  $('provider-dialog').showModal();
  syncKindBehaviour();
}

$('provider-kind').addEventListener('change', syncKindBehaviour);

async function testConnection() {
  const kind = $('provider-kind').value;
  const baseUrl = $('provider-base-url').value.trim();
  const apiKey = $('provider-key').value.trim();
  try {
    const result = await api('/admin/providers/test-connection', {
      method: 'POST',
      body: JSON.stringify({ kind, baseUrl: baseUrl || undefined, apiKey: apiKey || undefined }),
    });
    if (result.ok) toast(`Connected. ${result.modelCount} model(s) available.`, 'ok');
    else toast(`Connection returned status ${result.status}.`, 'bad');
  } catch (error) {
    toast(error.message, 'bad');
  }
}

async function fetchRemoteModels() {
  const kind = $('provider-kind').value;
  const baseUrl = $('provider-base-url').value.trim();
  const apiKey = $('provider-key').value.trim();
  try {
    const result = await api('/admin/providers/test-connection', {
      method: 'POST',
      body: JSON.stringify({ kind, baseUrl: baseUrl || undefined, apiKey: apiKey || undefined }),
    });
    if (!result.ok || !Array.isArray(result.models) || result.models.length === 0) {
      toast('No remote models returned.', 'bad');
      return;
    }
    const container = $('provider-models');
    container.replaceChildren();
    const selected = new Set();
    for (const id of result.models) {
      const chip = el('span', {
        class: 'chip',
        role: 'checkbox',
        tabindex: '0',
        'aria-checked': 'false',
        'data-selected': 'false',
        'data-unverified': 'true',
      }, [
        el('span', { 'aria-hidden': 'true', text: '○' }),
        el('span', { text: id }),
        el('span', { class: 'tag tag--warn', text: 'remote' }),
      ]);
      const toggle = () => {
        const next = chip.dataset.selected !== 'true';
        chip.dataset.selected = String(next);
        chip.setAttribute('aria-checked', String(next));
        chip.firstChild.textContent = next ? '✓' : '○';
      };
      chip.addEventListener('click', toggle);
      chip.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          toggle();
        }
      });
      container.append(chip);
    }
    toast(`Fetched ${result.models.length} remote model(s).`, 'ok');
  } catch (error) {
    toast(error.message, 'bad');
  }
}

$('provider-test-connection')?.addEventListener('click', testConnection);
$('provider-fetch-models')?.addEventListener('click', fetchRemoteModels);

function syncKindBehaviour() {
  const kind = $('provider-kind').value;
  const catalog = state.catalog.providers.find((entry) => entry.kind === kind);
  if (!catalog) return;

  const keyField = $('provider-key').closest('.field');
  const anonymousBox = $('provider-anonymous').closest('.checkbox');

  if (catalog.requiresKey) {
    keyField.hidden = false;
    anonymousBox.hidden = false;
  } else {
    keyField.hidden = true;
    anonymousBox.hidden = false;
  }

  // Preselect the label and id for a new provider.
  if (!state.editing) {
    if (!$('provider-label').value) $('provider-label').value = catalog.label;
    if (!$('provider-id').value) $('provider-id').value = kind;
  }
}

function renderModelChips(provider) {
  const container = $('provider-models');
  container.replaceChildren();

  const kind = $('provider-kind').value;
  const catalog = state.catalog.providers.find((entry) => entry.kind === kind);
  const selected = new Set((provider?.models ?? []).map((model) => model.id));

  for (const model of catalog.models) {
    const chip = el('span', {
      class: 'chip',
      role: 'checkbox',
      tabindex: '0',
      'aria-checked': String(selected.has(model.id)),
      'data-selected': String(selected.has(model.id)),
      'data-unverified': String(!model.verified),
      title: model.source,
    }, [
      el('span', { 'aria-hidden': 'true', text: selected.has(model.id) ? '☑' : '☐' }),
      el('span', { text: model.id }),
      model.verified ? null : el('span', { class: 'tag tag--warn', text: 'unverified' }),
    ]);

    const toggle = () => {
      const next = chip.dataset.selected !== 'true';
      chip.dataset.selected = String(next);
      chip.setAttribute('aria-checked', String(next));
      chip.firstChild.textContent = next ? '☑' : '☐';
    };
    chip.addEventListener('click', toggle);
    chip.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        toggle();
      }
    });

    container.append(chip);
  }

  if (catalog.models.length === 0) {
    container.append(
      el('p', {
        class: 'field__hint',
        text:
          kind === 'openrouter'
            ? 'OpenRouter free models are catalogue entries ending in ":free". Add one by hand below.'
            : 'No model list was confirmed for this provider at the verification date. Add one by hand below.',
      }),
    );
    const input = el('input', {
      class: 'field__input',
      id: 'manual-model',
      placeholder: 'model id',
      spellcheck: 'false',
    });
    container.append(input);
  }
}

$('provider-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const kind = $('provider-kind').value;
  const catalog = state.catalog.providers.find((entry) => entry.kind === kind);
  const selected = [...document.querySelectorAll('#provider-models .chip')]
    .filter((chip) => chip.dataset.selected === 'true')
    .map((chip) => chip.querySelector('span:nth-child(2)')?.textContent ?? '');

  const models = selected.map((id) => {
    const known = catalog.models.find((model) => model.id === id);
    return {
      id,
      free: true,
      verified: known?.verified ?? false,
      ...(known?.contextWindow ? { contextWindow: known.contextWindow } : {}),
      ...(known?.maxOutputTokens ? { maxOutputTokens: known.maxOutputTokens } : {}),
      ...(known?.source ? { source: known.source } : {}),
    };
  });

  const manual = $('manual-model');
  if (manual && manual.value.trim()) {
    models.push({ id: manual.value.trim(), free: true, verified: false });
  }

  const payload = {
    id: $('provider-id').value.trim(),
    kind,
    label: $('provider-label').value.trim(),
    enabled: $('provider-enabled').checked,
    anonymous: $('provider-anonymous').checked,
    priority: Number($('provider-priority').value),
    baseUrl: $('provider-base-url').value.trim() || undefined,
    models,
  };

  const key = $('provider-key').value;
  if (key) payload.apiKey = key;

  try {
    state.config = await api('/admin/providers', { method: 'POST', body: JSON.stringify(payload) });
    $('provider-dialog').close();
    toast('Provider saved.', 'ok');
    await refreshAll();
  } catch (error) {
    toast(error.message, 'bad');
  }
});

async function deleteProvider(provider) {
  const confirmed = await confirmDialog(
    `Delete "${provider.label}"? Its stored API keys will be removed as well. This cannot be undone.`,
    'Delete provider',
  );
  if (!confirmed) return;
  try {
    state.config = await api(`/admin/providers/${encodeURIComponent(provider.id)}`, { method: 'DELETE' });
    toast('Provider deleted.', 'ok');
    await refreshAll();
  } catch (error) {
    toast(error.message, 'bad');
  }
}

/* ------------------------------------------------------------------ *
 * Token rotation
 * ------------------------------------------------------------------ */

$('btn-rotate-gateway').addEventListener('click', async () => {
  if (!window.confirm('Rotate the gateway token?\n\nEvery client using the old token will stop working.')) return;
  try {
    const result = await api('/admin/tokens/gateway/rotate', { method: 'POST' });
    showToken(result.token);
  } catch (error) {
    toast(error.message, 'bad');
  }
});

$('btn-rotate-admin').addEventListener('click', async () => {
  if (!(await confirmDialog('Rotate the administrator token? Every active admin session will end immediately.', 'Rotate token'))) return;
  try {
    const result = await api('/admin/tokens/admin/rotate', { method: 'POST' });
    showToken(result.token);
    await lockConsole();
  } catch (error) {
    toast(error.message, 'bad');
  }
});

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function showToken(token) {
  $('token-output-value').textContent = token;
  $('token-output').hidden = false;
  toast('New token generated. Copy it now.', 'ok');
}

$('token-output-copy')?.addEventListener('click', async () => {
  const text = $('token-output-value').textContent || '';
  if (await copyToClipboard(text)) toast('Token copied.', 'ok');
  else toast('Copy failed. Select the token manually.', 'bad');
});

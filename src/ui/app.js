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

function trapFocus(dialog) {
  if (!dialog) return;
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

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

function applyMotionPreference() {
  const stored = localStorage.getItem('muktodwar-reduced-motion');
  const reduced = stored === 'true' || (stored === null && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.body.dataset.reducedMotion = String(reduced);
  const btn = $('btn-motion');
  if (btn) btn.setAttribute('aria-pressed', String(reduced));
}

applyMotionPreference();

$('btn-motion')?.addEventListener('click', () => {
  const next = document.body.dataset.reducedMotion !== 'true';
  document.body.dataset.reducedMotion = String(next);
  localStorage.setItem('muktodwar-reduced-motion', String(next));
  const btn = $('btn-motion');
  if (btn) btn.setAttribute('aria-pressed', String(next));
  toast(next ? 'Reduced motion enabled.' : 'Reduced motion disabled.', 'ok');
});

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

trapFocus($('provider-dialog'));
trapFocus($('confirm-dialog'));

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

const tabs = [...document.querySelectorAll('.tab')];
for (const tab of tabs) {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    for (const other of tabs) {
      other.setAttribute('aria-selected', String(other === tab));
    }
    for (const panel of document.querySelectorAll('.panel')) {
      panel.hidden = panel.id !== `panel-${name}`;
    }
    if (name === 'playground') {
      loadPlaygroundModels().then(updateSnippets);
    }
    if (name === 'settings') {
      loadSettings();
    }
    if (name === 'tokens') {
      loadUsageInfo();
    }
  });
  tab.addEventListener('keydown', (event) => {
    const idx = tabs.indexOf(tab);
    let next = idx;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (idx + 1) % tabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (idx - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  });
}

$('btn-refresh').addEventListener('click', () => void refreshAll());
$('btn-lock').addEventListener('click', () => void lockConsole());
$('model-search')?.addEventListener('input', () => renderModels());

/* ------------------------------------------------------------------ *
 * Data loading
 * ------------------------------------------------------------------ */

function renderLoading() {
  const list = $('provider-list');
  if (list) {
    list.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const row = el('div', { class: 'row' }, [
        el('div', { class: 'skeleton', style: 'width:30px;height:30px;border-radius:8px' }),
        el('div', { class: 'row__main' }, [
          el('div', { class: 'skeleton', style: 'width:40%;margin-bottom:6px' }),
          el('div', { class: 'skeleton', style: 'width:60%' }),
        ]),
      ]);
      list.append(row);
    }
  }
}

async function refreshAll() {
  const overlay = $('loading-overlay');
  if (overlay) overlay.hidden = false;
  renderLoading();
  try {
    const [config, catalog, status] = await Promise.all([
      api('/admin/config'),
      api('/admin/catalog'),
      api('/admin/status'),
    ]);
    state.config = config;
    state.catalog = catalog;
    state.status = status;
    if ($('btn-add-provider')) $('btn-add-provider').disabled = false;
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

let pgAbort = null;
let pgGatewayToken = null;

async function ensureGatewayToken() {
  if (pgGatewayToken) return pgGatewayToken;
  const data = await api('/admin/gateway-token');
  pgGatewayToken = data?.token ?? null;
  return pgGatewayToken;
}

async function checkUpdate() {
  try {
    const res = await fetch('/admin/update-check', { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = await res.json();
    if (data.latest && data.latest.tag && data.latest.tag !== 'v' + data.current) {
      toast('Update available: ' + data.latest.tag, 'ok');
    }
  } catch { /* ignore */ }
}

async function loadSettings() {
  try {
    const data = await api('/admin/settings');
    if ($('settings-host')) $('settings-host').textContent = data.bindHost ?? '127.0.0.1';
    if ($('settings-port')) $('settings-port').textContent = String(data.port ?? 8787);
    if ($('settings-dpapi')) $('settings-dpapi').textContent = data.dpapi === 'ok' ? 'OK' : 'Unknown';
    if ($('settings-secrets')) $('settings-secrets').textContent = String(data.secretCount ?? 0);
  } catch (error) {
    toast(error.message, 'bad');
  }
}

$('settings-motion')?.addEventListener('click', () => {
  const btn = $('btn-motion');
  if (btn) btn.click();
});

async function loadUsageInfo() {
  const endpointInput = $('usage-endpoint');
  if (endpointInput) endpointInput.value = `${window.location.origin}/v1/chat/completions`;
  const modelSelect = $('usage-model');
  const tokenInput = $('usage-token');
  try {
    const token = await ensureGatewayToken();
    if (tokenInput) tokenInput.value = token;
    const res = await fetch('/v1/models', { headers: { authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (modelSelect) {
      modelSelect.replaceChildren();
      for (const m of data?.data ?? []) {
        modelSelect.append(el('option', { value: m.id, text: m.id }));
      }
      // The curated auto model is the friendlier default than whichever id
      // happens to sort first.
      const preferred = [...modelSelect.options].find((option) =>
        /\/free$|^kilo-auto/.test(option.value),
      );
      if (preferred) modelSelect.value = preferred.value;
    }
  } catch (error) {
    if (tokenInput) tokenInput.value = '';
  }
}

$('usage-copy-curl')?.addEventListener('click', async () => {
  const endpoint = $('usage-endpoint')?.value ?? '';
  const model = $('usage-model')?.value ?? '';
  const token = $('usage-token')?.value ?? '';
  const curl = `curl ${endpoint} \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${token}" \\\n  -d '{"model":"${model}","messages":[{"role":"user","content":"Hello!"}]}'`;
  if (await copyToClipboard(curl)) toast('cURL copied.', 'ok');
  else toast('Copy failed.', 'bad');
});

async function loadPlaygroundModels() {
  const select = $('pg-model');
  if (!select) return;
  try {
    const token = await ensureGatewayToken();
    const res = await fetch('/v1/models', { headers: { authorization: `Bearer ${token}` } });
    const data = await res.json();
    select.replaceChildren();
    for (const m of data?.data ?? []) {
      select.append(el('option', { value: m.id, text: m.id }));
    }
    // The curated auto model is the friendlier default than whichever id
    // happens to sort first.
    const preferred = [...select.options].find((option) => /\/free$|^kilo-auto/.test(option.value));
    if (preferred) select.value = preferred.value;
    updateSnippets();
  } catch (error) {
    toast(error.message, 'bad');
  }
}

function updateSnippets() {
  const model = $('pg-model')?.value || 'gpt-4o-mini';
  const base = window.location.origin;
  const token = pgGatewayToken || 'YOUR_GATEWAY_TOKEN';
  const curl = `curl ${base}/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${token}" \\\n  -d '{"model":"${model}","messages":[{"role":"user","content":"Hello!"}]}'`;
  const js = `const res = await fetch('${base}/v1/chat/completions', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${token}' },\n  body: JSON.stringify({ model: '${model}', messages: [{ role: 'user', content: 'Hello!' }] }),\n});\nconst data = await res.json();\nconsole.log(data.choices[0].message.content);`;
  const php = `<?php\n$ch = curl_init('${base}/v1/chat/completions');\ncurl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'Authorization: Bearer ${token}']);\ncurl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['model'=>'${model}','messages'=>[['role'=>'user','content'=>'Hello!']]]));\ncurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);\n$res = curl_exec($ch);\necho $res;`;
  const opencode = `{\n  "provider": "openai-compatible",\n  "baseURL": "${base}/v1",\n  "apiKey": "${token}",\n  "model": "${model}"\n}`;
  const set = (id, text) => { const n = $(id); if (n) n.textContent = text; };
  set('pg-snippet-curl', curl);
  set('pg-snippet-js', js);
  set('pg-snippet-php', php);
  set('pg-snippet-opencode', opencode);
}

$('pg-model')?.addEventListener('change', updateSnippets);

$('pg-send')?.addEventListener('click', async () => {
  const model = $('pg-model').value;
  const message = $('pg-message').value.trim();
  if (!message) { toast('Enter a message.', 'bad'); return; }
  const output = $('pg-output');
  output.textContent = '';
  const token = await ensureGatewayToken();
  const controller = new AbortController();
  pgAbort = controller;
  $('pg-cancel').hidden = false;
  $('pg-send').disabled = true;
  try {
    const res = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: message }], stream: true }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      output.textContent = `Error ${res.status}: ${text}`;
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
          if (delta) output.textContent += delta;
        } catch {
          // ignore non-JSON chunks
        }
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError') output.textContent += `\nError: ${error.message}`;
  } finally {
    const prompt = $('pg-message').value.trim();
    if (prompt && !pgHistory.includes(prompt)) {
      pgHistory.push(prompt);
      if (pgHistory.length > 8) pgHistory.shift();
      refreshPgHistory();
    }
    pgAbort = null;
    $('pg-cancel').hidden = true;
    $('pg-send').disabled = false;
    updateSnippets();
  }
});

$('pg-cancel')?.addEventListener('click', () => {
  if (pgAbort) pgAbort.abort();
});

$('pg-clear')?.addEventListener('click', () => {
  $('pg-message').value = '';
  $('pg-output').textContent = '';
});

document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-copy');
    const text = $(id)?.textContent ?? '';
    if (await copyToClipboard(text)) toast('Copied.', 'ok');
    else toast('Copy failed.', 'bad');
  });
});

// Load playground models after entering console
const _origEnterConsole = enterConsole;
// hook not needed; call in refreshAll? Instead load on first tab click.

// Playground prompt history (in-memory, lightweight).
const pgHistory = [];
const pgHistorySelect = $('pg-history');
function refreshPgHistory() {
  if (!pgHistorySelect) return;
  pgHistorySelect.replaceChildren(el('option', { value: '', text: '— select a previous prompt —' }));
  for (const prompt of pgHistory.slice().reverse()) {
    pgHistorySelect.append(el('option', { value: prompt, text: prompt.slice(0, 60) }));
  }
}
pgHistorySelect?.addEventListener('change', () => {
  const value = pgHistorySelect.value;
  if (value) $('pg-message').value = value;
});

// push to history on send (wrap pg-send handler already defined; add push in finally)
const _origPgSend = null;

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
  const empty = $('providers-empty');
  empty.hidden = providers.length > 0;
  if (providers.length === 0) {
    empty.replaceChildren();
    empty.append(
      el('span', { class: 'sym', style: 'font-size:24px;display:block;margin-bottom:6px', 'aria-hidden': 'true', text: '⬢' }),
      el('strong', { text: 'No providers yet' }),
      el('span', { text: 'Add your first provider to start routing requests.' }),
    );
  }

  for (const provider of providers) {
    const keys = provider.keys.length;
    const models = provider.models.length;
    const catalog = (state.catalog?.providers ?? []).find(
      (entry) => entry.kind === provider.kind,
    );

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
      catalog
        ? el('span', {
            class: `tag ${catalog.shipStatus === 'VERIFIED' ? 'tag--ok' : 'tag--warn'}`,
            title:
              catalog.shipStatus === 'VERIFIED'
                ? 'The free tier, the payment-method rule and the model ids were confirmed.'
                : catalog.shipStatus === 'BLOCKED'
                  ? 'The free tier refuses calls from outside the provider.'
                  : 'The free status could not be confirmed in full.',
            text: catalog.shipStatus.toLowerCase(),
          })
        : null,
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
  const modelsEmpty = $('models-empty');
  const query = ($('model-search')?.value ?? '').trim().toLowerCase();
  const visible = query
    ? entries.filter(
        (entry) =>
          entry.model.toLowerCase().includes(query) ||
          entry.providerLabel.toLowerCase().includes(query),
      )
    : entries;

  const search = $('model-search-count');
  if (search) {
    search.textContent = query
      ? `${visible.length} of ${entries.length} model(s)`
      : `${entries.length} model(s)`;
  }

  modelsEmpty.hidden = visible.length > 0;
  if (visible.length === 0) {
    modelsEmpty.replaceChildren();
    modelsEmpty.append(
      el('span', { class: 'sym', style: 'font-size:24px;display:block;margin-bottom:6px', 'aria-hidden': 'true', text: '❖' }),
      el('strong', { text: query ? 'No model matches the filter' : 'No free models allowlisted' }),
      el('span', {
        text: query
          ? 'Clear the filter to see every allowlisted model.'
          : 'Allowlist models from the Providers tab to enable routing.',
      }),
    );
  }

  for (const entry of visible) {
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
  const statusEmpty = $('status-empty');
  statusEmpty.hidden = rows.length > 0;
  if (rows.length === 0) {
    statusEmpty.replaceChildren();
    statusEmpty.append(
      el('span', { class: 'sym', style: 'font-size:24px;display:block;margin-bottom:6px', 'aria-hidden': 'true', text: '◴' }),
      el('strong', { text: 'No provider contacted yet' }),
      el('span', { text: 'Send a request through the gateway to see health data.' }),
    );
  }

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
$('provider-cancel').addEventListener('click', async () => {
  if (providerDirty) {
    const ok = await confirmDialog('Discard unsaved changes?', 'Unsaved changes');
    if (!ok) return;
  }
  $('provider-dialog').close();
});

$('provider-dialog').addEventListener('input', markProviderDirty);
$('provider-dialog').addEventListener('change', markProviderDirty);

let providerDirty = false;

function markProviderDirty() {
  providerDirty = true;
}

/**
 * Show the keys a provider already has.
 *
 * A key can only be replaced or removed here; its value is never sent to
 * the browser, so the chips carry the label and the state only.
 */
function renderProviderKeys(provider) {
  const container = $('provider-keys');
  if (!container) return;
  container.replaceChildren();
  if (!provider?.keys?.length) return;

  for (const key of provider.keys) {
    const chip = el('span', { class: 'chip', 'data-key-id': key.id }, [
      el('span', { text: `${key.label ?? key.id} (${key.enabled ? 'enabled' : 'disabled'})` }),
      el('button', {
        type: 'button',
        class: 'btn btn--danger',
        text: 'Remove',
        'data-remove-key': key.id,
      }),
    ]);
    const button = chip.querySelector('[data-remove-key]');
    button?.addEventListener('click', async () => {
      const ok = await confirmDialog(`Remove key "${key.label ?? key.id}"?`, 'Remove key');
      if (!ok) return;
      try {
        state.config = await api(
          `/admin/providers/${encodeURIComponent(provider.id)}/keys/${encodeURIComponent(key.id)}`,
          { method: 'DELETE' },
        );
        toast('Key removed.', 'ok');
        const updated = state.config.providers.find((entry) => entry.id === provider.id);
        renderProviderKeys(updated);
      } catch (error) {
        toast(error.message, 'bad');
      }
    });
    container.append(chip);
  }
}

function openProviderDialog(provider) {
  if (!state.catalog) {
    toast('Still loading providers. Please wait.', 'bad');
    return;
  }
  state.editing = provider ?? null;
  providerDirty = false;
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
  renderProviderKeys(provider);
  $('provider-dialog').showModal();
  syncKindBehaviour();
}

$('provider-kind').addEventListener('change', () => {
  renderModelChips(state.editing);
  renderProviderKeys(state.editing);
  syncKindBehaviour();
});

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
    else toast(result.detail ? `Connection failed. ${result.detail}` : `Connection returned status ${result.status}.`, 'bad');
  } catch (error) {
    toast(error.message, 'bad');
  }
}

/**
 * Build one model chip for the allowlist.
 *
 * The second child always holds the model id: the save handler and the
 * filter read the id from there.
 */
function modelChip(id, options = {}) {
  const selected = options.selected === true;
  const verified = options.verified === true;
  const tags = [];
  if (!verified) tags.push(el('span', { class: 'tag tag--warn', text: 'unverified' }));
  if (options.tag) tags.push(el('span', { class: 'tag', text: options.tag }));
  const chip = el('span', {
    class: 'chip',
    role: 'checkbox',
    tabindex: '0',
    'data-model-id': id,
    'aria-checked': String(selected),
    'data-selected': String(selected),
    // Only catalogue models are known to be free. A fetched model is not,
    // so it is never selected by "Select all free".
    'data-free': String(options.free === true),
    'data-unverified': String(!verified),
    title: options.title ?? '',
  }, [
    el('span', { 'aria-hidden': 'true', text: selected ? '\u2713' : '\u25CB' }),
    el('span', { text: id }),
    ...tags,
  ]);

  const toggle = () => {
    const next = chip.dataset.selected !== 'true';
    chip.dataset.selected = String(next);
    chip.setAttribute('aria-checked', String(next));
    chip.firstChild.textContent = next ? '\u2713' : '\u25CB';
  };
  chip.addEventListener('click', toggle);
  chip.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggle();
    }
  });

  return chip;
}

/**
 * Fetch the provider's own model list and add it to the allowlist.
 *
 * The fetched models are added next to the catalogue ones instead of
 * replacing them, and they arrive unselected: the gateway only serves a
 * model once the administrator has confirmed it is free.
 */
async function fetchRemoteModels() {
  const kind = $('provider-kind').value;
  const baseUrl = $('provider-base-url').value.trim();
  const apiKey = $('provider-key').value.trim();
  const button = $('provider-fetch-models');
  if (button) button.disabled = true;
  try {
    const result = await api('/admin/providers/test-connection', {
      method: 'POST',
      body: JSON.stringify({ kind, baseUrl: baseUrl || undefined, apiKey: apiKey || undefined }),
    });
    if (!result.ok) {
      toast(
        result.detail
          ? `The provider did not return a model list. ${result.detail}`
          : `The provider did not return a model list (HTTP ${result.status}).`,
        'bad',
      );
      return;
    }
    const ids = Array.isArray(result.models) ? result.models : [];
    if (ids.length === 0) {
      toast('The provider returned an empty model list.', 'bad');
      return;
    }

    const container = $('provider-models');
    const known = new Set(
      [...container.querySelectorAll('.chip')].map((chip) => chip.dataset.modelId),
    );
    const manual = container.querySelector('#manual-model');
    let added = 0;
    for (const id of ids) {
      if (known.has(id)) continue;
      known.add(id);
      const chip = modelChip(id, {
        selected: false,
        free: false,
        verified: false,
        tag: 'remote',
        title:
          'Fetched from the provider. The free status is not verified here, so confirm it with the provider before selecting it.',
      });
      if (manual) container.insertBefore(chip, manual);
      else container.append(chip);
      added += 1;
    }

    const total = Number.isFinite(result.total) ? result.total : ids.length;
    toast(
      added > 0
        ? `Fetched ${total} model(s); ${added} added, unselected.`
        : `Fetched ${total} model(s); all of them were already listed.`,
      'ok',
    );
  } catch (error) {
    toast(error.message, 'bad');
  } finally {
    if (button) button.disabled = false;
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

  renderProviderNotes(catalog);

  // Preselect the label and id for a new provider.
  const isCustom = kind === 'custom';
  if (!state.editing) {
    if (!$('provider-label').value) $('provider-label').value = catalog.label;
    if (!$('provider-id').value) $('provider-id').value = kind;
    // For built-in providers, auto-select all catalog models.
    if (!isCustom) {
      for (const chip of document.querySelectorAll('#provider-models .chip')) {
        chip.dataset.selected = 'true';
        chip.setAttribute('aria-checked', 'true');
        if (chip.firstChild) chip.firstChild.textContent = '✓';
      }
    }
  }

  // Custom providers need manual name/id/model; built-ins are auto-filled.
  $('provider-label').disabled = !isCustom && !state.editing;
  $('provider-id').disabled = Boolean(state.editing) || !isCustom;
}

/**
 * Show what the catalogue knows about the selected provider.
 *
 * The free terms and the caveats are the difference between "this provider
 * is free" and "this provider is free, for now, with these limits".
 */
function renderProviderNotes(catalog) {
  const container = $('provider-caveats');
  if (!container) return;
  container.replaceChildren();

  const lines = [];
  if (catalog.freeTerms) lines.push(catalog.freeTerms);
  for (const caveat of catalog.caveats ?? []) lines.push(caveat);
  if (lines.length === 0) return;

  const status = {
    VERIFIED:
      'Ship status: VERIFIED. The free tier, the payment-method rule and the model ids were confirmed against the source recorded on each model.',
    UNVERIFIED:
      'Ship status: UNVERIFIED. One of the three could not be confirmed, so this provider ships disabled.',
    BLOCKED:
      'Ship status: BLOCKED. The free tier exists but refuses calls from outside the provider\'s own client, so it cannot be served from this gateway.',
  }[catalog.shipStatus] ?? '';
  container.append(
    el('span', { class: 'field__label', text: 'Free tier notes' }),
    el('span', {
      class: 'notes__status',
      'data-ship-status': catalog.shipStatus ?? 'UNVERIFIED',
      text: status,
    }),
  );
  const list = el('ul', { class: 'notes__list' });
  for (const line of lines) list.append(el('li', { text: line }));
  container.append(list);
}

function renderModelChips(provider) {
  const container = $('provider-models');
  container.replaceChildren();

  const kind = $('provider-kind').value;
  const catalog = state.catalog.providers.find((entry) => entry.kind === kind);
  const selected = new Set((provider?.models ?? []).map((model) => model.id));

  const search = $('provider-model-search');
  if (search) {
    search.value = '';
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      for (const chip of container.querySelectorAll('.chip')) {
        const id = chip.dataset.modelId ?? '';
        chip.hidden = q !== '' && !id.toLowerCase().includes(q);
      }
    };
  }

  for (const model of catalog.models) {
    const meta = [
      model.contextWindow ? `context ${model.contextWindow}` : null,
      model.maxOutputTokens ? `max out ${model.maxOutputTokens}` : null,
      model.source,
    ].filter(Boolean).join(' · ');
    const chip = modelChip(model.id, {
      selected: selected.has(model.id),
      free: true,
      verified: model.verified === true,
      tag: model.contextWindow ? `${Math.round(model.contextWindow / 1000)}k` : null,
      title: meta,
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

const selectAllBtn = $('provider-select-all');
const clearModelsBtn = $('provider-clear-models');
if (selectAllBtn) {
  selectAllBtn.addEventListener('click', () => {
    // Only the catalogue models are known to be free. A model fetched from
    // the provider has to be confirmed by the administrator first, so it is
    // never selected in bulk.
    for (const chip of document.querySelectorAll('#provider-models .chip')) {
      if (chip.hidden) continue;
      if (chip.dataset.free !== 'true') continue;
      chip.dataset.selected = 'true';
      chip.setAttribute('aria-checked', 'true');
      chip.firstChild.textContent = '\u2713';
    }
  });
}
if (clearModelsBtn) {
  clearModelsBtn.addEventListener('click', () => {
    for (const chip of document.querySelectorAll('#provider-models .chip')) {
      chip.dataset.selected = 'false';
      chip.setAttribute('aria-checked', 'false');
      chip.firstChild.textContent = '\u25CB';
    }
  });
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
    providerDirty = false;
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

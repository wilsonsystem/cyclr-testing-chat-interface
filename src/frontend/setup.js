const API = '/api';

const MODELS = {
  openai: [
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { value: 'o3', label: 'o3' },
    { value: 'o4-mini', label: 'o4-mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
};

const MODES = ['a', 'b'];

// --- Helpers ---

function el(id) { return document.getElementById(id); }

function populateModels(mode, provider, selectedModel) {
  const select = el(`${mode}-llm-model`);
  select.innerHTML = '';
  const models = MODELS[provider] || [];
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.value;
    opt.textContent = m.label;
    select.appendChild(opt);
  });
  if (selectedModel) select.value = selectedModel;
}

function showResult(elementId, success, message) {
  const e = el(elementId);
  e.className = 'test-result ' + (success ? 'success' : 'error');
  e.textContent = message;
}

async function saveConfig(entries) {
  const res = await fetch(`${API}/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entries),
  });
  return res.json();
}

// Prefix config keys with mode
function prefixKeys(mode, obj) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    result[`mode_${mode}_${k}`] = v;
  }
  return result;
}

// --- Per-mode setup ---

function setupMode(mode) {
  const state = { llmConnected: false, mcpConnected: false, cyclrConnected: false };

  // Provider change -> repopulate models
  el(`${mode}-llm-provider`).addEventListener('change', () => {
    populateModels(mode, el(`${mode}-llm-provider`).value);
  });
  populateModels(mode, 'anthropic');

  // --- LLM ---

  function setLLMConnected(connected, provider, model) {
    state.llmConnected = connected;
    const fields = [`${mode}-llm-provider`, `${mode}-llm-api-key`, `${mode}-llm-model`];
    const badge = el(`${mode}-llm-status-badge`);
    const testBtn = el(`${mode}-test-llm-btn`);
    const disconnectBtn = el(`${mode}-disconnect-llm-btn`);

    fields.forEach(id => { el(id).disabled = connected; });

    if (connected) {
      const providerName = (provider || 'LLM').charAt(0).toUpperCase() + (provider || 'LLM').slice(1);
      const modelLabel = el(`${mode}-llm-model`).selectedOptions[0]?.textContent || model || '';
      badge.style.display = 'inline-block';
      badge.className = 'status-badge connected';
      badge.textContent = `Connected — ${providerName} / ${modelLabel}`;
      testBtn.style.display = 'none';
      disconnectBtn.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
      testBtn.style.display = 'inline-block';
      disconnectBtn.style.display = 'none';
    }
  }

  el(`${mode}-test-llm-btn`).addEventListener('click', async () => {
    const provider = el(`${mode}-llm-provider`).value;
    const model = el(`${mode}-llm-model`).value;
    const apiKey = el(`${mode}-llm-api-key`).value;
    if (!apiKey) return showResult(`${mode}-llm-test-result`, false, 'Please enter an API key');

    showResult(`${mode}-llm-test-result`, true, 'Testing...');
    try {
      const res = await fetch(`${API}/config/test-llm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, api_key: apiKey }),
      });
      const data = await res.json();
      if (data.ok) {
        await saveConfig(prefixKeys(mode, { llm_provider: provider, llm_model: model, llm_api_key: apiKey }));
        const modelLabel = el(`${mode}-llm-model`).selectedOptions[0]?.textContent || model;
        showResult(`${mode}-llm-test-result`, true, `Connected and saved! Model: ${modelLabel}`);
        setLLMConnected(true, provider, model);
      } else {
        showResult(`${mode}-llm-test-result`, false, `Failed: ${data.error}`);
      }
    } catch (e) {
      showResult(`${mode}-llm-test-result`, false, `Error: ${e.message}`);
    }
  });

  el(`${mode}-disconnect-llm-btn`).addEventListener('click', async () => {
    await saveConfig(prefixKeys(mode, { llm_provider: '', llm_api_key: '' }));
    el(`${mode}-llm-api-key`).value = '';
    setLLMConnected(false);
    showResult(`${mode}-llm-test-result`, false, 'Disconnected.');
  });

  // --- MCP ---

  function setMCPConnected(connected, serverName) {
    state.mcpConnected = connected;
    const badge = el(`${mode}-mcp-status-badge`);
    const testBtn = el(`${mode}-test-mcp-btn`);
    const disconnectBtn = el(`${mode}-disconnect-mcp-btn`);
    el(`${mode}-mcp-urls`).disabled = connected;

    if (connected) {
      badge.style.display = 'inline-block';
      badge.className = 'status-badge connected';
      badge.textContent = `Connected — ${serverName || 'MCP Server'}`;
      testBtn.style.display = 'none';
      disconnectBtn.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
      testBtn.style.display = 'inline-block';
      disconnectBtn.style.display = 'none';
    }
  }

  function showMCPTools(tools) {
    const container = el(`${mode}-mcp-tools-list`);
    if (!tools || tools.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    let html = '<label style="font-size: 13px; font-weight: 500; color: #555; margin-bottom: 6px; display: block;">Available Tools / Methods</label>';
    html += '<div class="mcp-tools-grid">';
    tools.forEach((t, i) => {
      const name = (t.name || '').replace(/---/g, ' > ').replace(/-/g, ' ').replace(/_/g, ' ');
      const desc = (t.description || '').replace(/-/g, ' ').replace(/_/g, ' ');
      html += `<div class="mcp-tool-item">
        <div class="mcp-tool-name">${i + 1}. ${name}</div>
        ${desc ? `<div class="mcp-tool-desc">${desc}</div>` : ''}
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    container.style.display = 'block';
  }

  el(`${mode}-test-mcp-btn`).addEventListener('click', async () => {
    const url = el(`${mode}-mcp-urls`).value.trim();
    if (!url) return showResult(`${mode}-mcp-test-result`, false, 'Please enter an MCP server URL');

    showResult(`${mode}-mcp-test-result`, true, 'Testing...');
    try {
      const res = await fetch(`${API}/config/test-mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.ok) {
        await saveConfig(prefixKeys(mode, { mcp_server_urls: url }));
        const info = data.tools !== undefined ? `${data.tools} tools available` : data.server;
        showResult(`${mode}-mcp-test-result`, true, `Connected and saved! ${info}`);
        setMCPConnected(true, info);
        showMCPTools(data.toolList || []);
      } else {
        showResult(`${mode}-mcp-test-result`, false, `Failed: ${data.error}`);
      }
    } catch (e) {
      showResult(`${mode}-mcp-test-result`, false, `Error: ${e.message}`);
    }
  });

  el(`${mode}-disconnect-mcp-btn`).addEventListener('click', async () => {
    await saveConfig(prefixKeys(mode, { mcp_server_urls: '' }));
    el(`${mode}-mcp-urls`).value = '';
    setMCPConnected(false);
    showMCPTools([]);
    showResult(`${mode}-mcp-test-result`, false, 'Disconnected.');
  });

  // --- System Prompt ---

  el(`${mode}-save-prompt-btn`).addEventListener('click', async () => {
    const prompt = el(`${mode}-system-prompt`).value;
    await saveConfig(prefixKeys(mode, { system_prompt: prompt }));
    alert(`Mode ${mode.toUpperCase()} system prompt saved!`);
  });

  // --- Tool Source ---

  el(`${mode}-tool-source`).addEventListener('change', async () => {
    const source = el(`${mode}-tool-source`).value;
    await saveConfig(prefixKeys(mode, { tool_source: source }));
  });

  // --- Cyclr ---

  function setCyclrConnected(connected) {
    state.cyclrConnected = connected;
    const fields = [`${mode}-cyclr-account`, `${mode}-cyclr-client-id`, `${mode}-cyclr-client-secret`];
    const badge = el(`${mode}-cyclr-status-badge`);
    const testBtn = el(`${mode}-test-cyclr-btn`);
    const disconnectBtn = el(`${mode}-disconnect-cyclr-btn`);

    fields.forEach(id => { el(id).disabled = connected; });

    if (connected) {
      badge.style.display = 'inline-block';
      badge.className = 'status-badge connected';
      badge.textContent = 'Connected';
      testBtn.style.display = 'none';
      disconnectBtn.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
      testBtn.style.display = 'inline-block';
      disconnectBtn.style.display = 'none';
    }
  }

  el(`${mode}-test-cyclr-btn`).addEventListener('click', async () => {
    const accountId = el(`${mode}-cyclr-account`).value;
    const clientId = el(`${mode}-cyclr-client-id`).value;
    const clientSecret = el(`${mode}-cyclr-client-secret`).value;
    if (!accountId || !clientId || !clientSecret) {
      return showResult(`${mode}-cyclr-test-result`, false, 'Please fill in all Cyclr credentials');
    }

    showResult(`${mode}-cyclr-test-result`, true, 'Testing...');
    try {
      const res = await fetch(`${API}/config/test-cyclr`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, client_id: clientId, client_secret: clientSecret, config_mode: mode }),
      });
      const data = await res.json();
      if (data.ok) {
        const connector = el(`${mode}-cyclr-connector`).value;
        await saveConfig(prefixKeys(mode, {
          cyclr_account_id: accountId,
          cyclr_client_id: clientId,
          cyclr_client_secret: clientSecret,
          cyclr_connector_id: connector,
        }));
        showResult(`${mode}-cyclr-test-result`, true, `Connected and saved! Token expires in ${data.token_expires_in}s`);
        setCyclrConnected(true);
      } else {
        showResult(`${mode}-cyclr-test-result`, false, `Failed: ${data.error}`);
      }
    } catch (e) {
      showResult(`${mode}-cyclr-test-result`, false, `Error: ${e.message}`);
    }
  });

  el(`${mode}-disconnect-cyclr-btn`).addEventListener('click', async () => {
    await saveConfig(prefixKeys(mode, {
      cyclr_account_id: '', cyclr_client_id: '', cyclr_client_secret: '',
      cyclr_bearer_token: '', cyclr_token_expires_at: '',
    }));
    el(`${mode}-cyclr-account`).value = '';
    el(`${mode}-cyclr-client-id`).value = '';
    el(`${mode}-cyclr-client-secret`).value = '';
    setCyclrConnected(false);
    showResult(`${mode}-cyclr-test-result`, false, 'Disconnected.');
  });

  // --- Load config for this mode ---

  function loadModeConfig(config) {
    const prefix = `mode_${mode}_`;
    const get = (key) => config[prefix + key] || '';

    if (get('llm_provider')) el(`${mode}-llm-provider`).value = get('llm_provider');
    populateModels(mode, get('llm_provider') || 'anthropic', get('llm_model'));
    if (get('llm_api_key')) el(`${mode}-llm-api-key`).value = get('llm_api_key');
    if (get('mcp_server_urls')) {
      el(`${mode}-mcp-urls`).value = get('mcp_server_urls');
      setMCPConnected(true, '...');
      fetch(`${API}/config/test-mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: get('mcp_server_urls') }),
      }).then(r => r.json()).then(data => {
        if (data.ok) {
          setMCPConnected(true, `${data.tools} tools available`);
          showMCPTools(data.toolList || []);
        } else {
          setMCPConnected(false);
          showResult(`${mode}-mcp-test-result`, false, `MCP connection failed: ${data.error}`);
        }
      }).catch(() => {});
    }
    if (get('system_prompt')) el(`${mode}-system-prompt`).value = get('system_prompt');
    if (get('tool_source')) el(`${mode}-tool-source`).value = get('tool_source');
    if (get('cyclr_account_id')) el(`${mode}-cyclr-account`).value = get('cyclr_account_id');
    if (get('cyclr_client_id')) el(`${mode}-cyclr-client-id`).value = get('cyclr_client_id');
    if (get('cyclr_client_secret')) el(`${mode}-cyclr-client-secret`).value = get('cyclr_client_secret');
    if (get('cyclr_connector_id')) el(`${mode}-cyclr-connector`).value = get('cyclr_connector_id');

    if (get('llm_provider') && get('llm_api_key') && get('llm_api_key').length > 8) {
      setLLMConnected(true, get('llm_provider'), get('llm_model'));
    }
    if (get('cyclr_account_id') && get('cyclr_client_id') && get('cyclr_client_secret') && get('cyclr_client_secret').length > 8) {
      setCyclrConnected(true);
    }
  }

  return { loadModeConfig };
}

// Initialize both modes
const modeA = setupMode('a');
const modeB = setupMode('b');

// Load config
async function loadConfig() {
  try {
    const res = await fetch(`${API}/config`);
    const config = await res.json();
    modeA.loadModeConfig(config);
    modeB.loadModeConfig(config);
  } catch (e) {
    console.error('Failed to load config:', e);
  }
}

loadConfig();

// --- Usage Report (shared, unchanged) ---

let allSessions = [];

el('refresh-report-btn').addEventListener('click', loadReport);
el('session-filter').addEventListener('change', renderReport);
el('clear-sessions-btn').addEventListener('click', clearSelectedSession);
el('clear-all-sessions-btn').addEventListener('click', clearAllSessions);

async function loadReport() {
  const container = el('report-table-container');
  const summary = el('report-summary');
  container.innerHTML = '<p style="color: #888; font-size: 13px;">Loading...</p>';
  summary.innerHTML = '';

  try {
    const res = await fetch(`${API}/sessions`);
    const data = await res.json();
    allSessions = data.sessions || [];

    if (allSessions.length === 0) {
      container.innerHTML = '<p style="color: #888; font-size: 13px;">No chat sessions yet.</p>';
      el('report-filter').style.display = 'none';
      el('clear-sessions-btn').style.display = 'none';
      el('clear-all-sessions-btn').style.display = 'none';
      return;
    }

    const filterSelect = el('session-filter');
    const currentValue = filterSelect.value;
    filterSelect.innerHTML = '<option value="all">All Sessions</option>';
    allSessions.forEach((s, i) => {
      const date = new Date(s.created_at).toLocaleString();
      const mode = { mcp: 'MCP', guided: 'Guided', direct: 'Direct' }[s.mode] || s.mode;
      const msgs = s.message_count || 0;
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `#${i + 1} — ${date} — ${mode} — ${msgs} msgs`;
      filterSelect.appendChild(opt);
    });
    if (currentValue && [...filterSelect.options].some(o => o.value === currentValue)) {
      filterSelect.value = currentValue;
    }

    el('report-filter').style.display = 'block';
    el('clear-all-sessions-btn').style.display = 'inline-block';
    renderReport();
  } catch (e) {
    container.innerHTML = `<p style="color: #991b1b; font-size: 13px;">Error loading report: ${e.message}</p>`;
  }
}

function renderReport() {
  const container = el('report-table-container');
  const summary = el('report-summary');
  const filterId = el('session-filter').value;
  const clearSelectedBtn = el('clear-sessions-btn');

  const sessions = filterId === 'all' ? allSessions : allSessions.filter(s => s.id === filterId);
  clearSelectedBtn.style.display = filterId !== 'all' ? 'inline-block' : 'none';

  if (sessions.length === 0) {
    container.innerHTML = '<p style="color: #888; font-size: 13px;">No data for selected session.</p>';
    summary.innerHTML = '';
    return;
  }

  let totalInput = 0, totalOutput = 0, totalCost = 0, totalMessages = 0;
  sessions.forEach(s => {
    totalInput += Number(s.total_input_tokens) || 0;
    totalOutput += Number(s.total_output_tokens) || 0;
    totalCost += Number(s.total_cost_usd) || 0;
    totalMessages += Number(s.message_count) || 0;
  });

  summary.innerHTML = `
    <div style="display: flex; gap: 16px; flex-wrap: wrap;">
      <div class="report-stat">
        <div class="report-stat-value">${sessions.length}</div>
        <div class="report-stat-label">${filterId === 'all' ? 'Sessions' : 'Session'}</div>
      </div>
      <div class="report-stat">
        <div class="report-stat-value">${totalMessages}</div>
        <div class="report-stat-label">Messages</div>
      </div>
      <div class="report-stat">
        <div class="report-stat-value">${(totalInput + totalOutput).toLocaleString()}</div>
        <div class="report-stat-label">Total Tokens</div>
      </div>
      <div class="report-stat">
        <div class="report-stat-value">$${totalCost.toFixed(4)}</div>
        <div class="report-stat-label">Total Cost</div>
      </div>
    </div>
  `;

  let html = `<table class="report-table">
    <thead><tr>
      <th>#</th><th>Date</th><th>Mode</th><th>Model</th><th>Messages</th>
      <th>Input Tokens</th><th>Output Tokens</th><th>Cost (USD)</th><th>Status</th>
    </tr></thead><tbody>`;

  sessions.forEach((s) => {
    const globalIdx = allSessions.indexOf(s) + 1;
    const date = new Date(s.created_at).toLocaleString();
    const mode = { mcp: 'MCP', guided: 'Guided', direct: 'Direct' }[s.mode] || s.mode;
    const model = s.model_name || '-';
    const msgs = s.message_count || 0;
    const inTok = Number(s.total_input_tokens) || 0;
    const outTok = Number(s.total_output_tokens) || 0;
    const cost = Number(s.total_cost_usd) || 0;
    const status = s.is_active ? '<span style="color: #16a34a;">Active</span>' : '<span style="color: #9ca3af;">Ended</span>';

    html += `<tr>
      <td>${globalIdx}</td><td>${date}</td><td>${mode}</td><td>${model}</td>
      <td style="text-align:right;">${msgs}</td><td style="text-align:right;">${inTok.toLocaleString()}</td>
      <td style="text-align:right;">${outTok.toLocaleString()}</td><td style="text-align:right;">$${cost.toFixed(4)}</td>
      <td>${status}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

async function clearSelectedSession() {
  const filterId = el('session-filter').value;
  if (filterId === 'all') return;
  if (!confirm('Delete this session and all its messages and usage logs?')) return;
  try {
    await fetch(`${API}/sessions/${filterId}`, { method: 'DELETE' });
    el('session-filter').value = 'all';
    await loadReport();
  } catch (e) {
    alert('Error deleting session: ' + e.message);
  }
}

async function clearAllSessions() {
  if (!confirm(`Delete ALL ${allSessions.length} sessions and their messages and usage logs?`)) return;
  try {
    for (const s of allSessions) {
      await fetch(`${API}/sessions/${s.id}`, { method: 'DELETE' });
    }
    await loadReport();
  } catch (e) {
    alert('Error deleting sessions: ' + e.message);
  }
}

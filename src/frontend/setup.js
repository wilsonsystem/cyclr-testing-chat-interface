const API = '/api';
let llmConnected = false;
let cyclrConnected = false;

const MODELS = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { value: 'o3-mini', label: 'o3-mini' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
};

function populateModels(provider, selectedModel) {
  const select = document.getElementById('llm-model');
  select.innerHTML = '';
  const models = MODELS[provider] || [];
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.value;
    opt.textContent = m.label;
    select.appendChild(opt);
  });
  if (selectedModel) {
    select.value = selectedModel;
  }
}

document.getElementById('llm-provider').addEventListener('change', () => {
  populateModels(document.getElementById('llm-provider').value);
});

async function loadConfig() {
  try {
    const res = await fetch(`${API}/config`);
    const config = await res.json();
    if (config.llm_provider) document.getElementById('llm-provider').value = config.llm_provider;
    populateModels(config.llm_provider || 'anthropic', config.llm_model);
    if (config.llm_api_key) document.getElementById('llm-api-key').value = config.llm_api_key;
    if (config.mcp_server_urls) {
      document.getElementById('mcp-urls').value = config.mcp_server_urls;
      setMCPConnected(true, '...');
      // Fetch tools in background
      fetch(`${API}/config/test-mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: config.mcp_server_urls }),
      }).then(r => r.json()).then(data => {
        if (data.ok) {
          const info = `${data.tools} tools available`;
          setMCPConnected(true, info);
          showMCPTools(data.toolList || []);
        } else {
          setMCPConnected(false);
          showResult('mcp-test-result', false, `MCP connection failed: ${data.error}. Please reconnect.`);
        }
      }).catch(() => {});
    }
    if (config.system_prompt_guided) document.getElementById('system-prompt-guided').value = config.system_prompt_guided;
    if (config.cyclr_account_id) document.getElementById('cyclr-account').value = config.cyclr_account_id;
    if (config.cyclr_client_id) document.getElementById('cyclr-client-id').value = config.cyclr_client_id;
    if (config.cyclr_client_secret) document.getElementById('cyclr-client-secret').value = config.cyclr_client_secret;
    if (config.cyclr_connector_id) document.getElementById('cyclr-connector').value = config.cyclr_connector_id;
    if (config.system_prompt_direct) document.getElementById('system-prompt-direct').value = config.system_prompt_direct;

    // If LLM is already configured, show as connected
    if (config.llm_provider && config.llm_api_key && config.llm_api_key.length > 8) {
      setLLMConnected(true, config.llm_provider, config.llm_model);
    }
    // If Cyclr is already configured
    if (config.cyclr_account_id && config.cyclr_client_id && config.cyclr_client_secret && config.cyclr_client_secret.length > 8) {
      setCyclrConnected(true);
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
}

// Initialize model dropdown on page load
populateModels('anthropic');

function showResult(elementId, success, message) {
  const el = document.getElementById(elementId);
  el.className = 'test-result ' + (success ? 'success' : 'error');
  el.textContent = message;
}

async function saveConfig(entries) {
  const res = await fetch(`${API}/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entries),
  });
  return res.json();
}

// --- Part 1: LLM Connection ---

function setLLMConnected(connected, provider, model) {
  llmConnected = connected;
  const fields = ['llm-provider', 'llm-api-key', 'llm-model'];
  const badge = document.getElementById('llm-status-badge');
  const testBtn = document.getElementById('test-llm-btn');
  const disconnectBtn = document.getElementById('disconnect-llm-btn');

  fields.forEach(id => {
    document.getElementById(id).disabled = connected;
  });

  if (connected) {
    const providerName = (provider || 'LLM').charAt(0).toUpperCase() + (provider || 'LLM').slice(1);
    const modelLabel = document.getElementById('llm-model').selectedOptions[0]?.textContent || model || '';
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

document.getElementById('test-llm-btn').addEventListener('click', async () => {
  const provider = document.getElementById('llm-provider').value;
  const model = document.getElementById('llm-model').value;
  const apiKey = document.getElementById('llm-api-key').value;
  if (!apiKey) return showResult('llm-test-result', false, 'Please enter an API key');

  showResult('llm-test-result', true, 'Testing...');
  try {
    const res = await fetch(`${API}/config/test-llm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, api_key: apiKey }),
    });
    const data = await res.json();
    if (data.ok) {
      // Auto-save provider, model, and API key on successful connection
      await saveConfig({ llm_provider: provider, llm_model: model, llm_api_key: apiKey });
      const modelLabel = document.getElementById('llm-model').selectedOptions[0]?.textContent || model;
      showResult('llm-test-result', true, `Connected and saved! Model: ${modelLabel}`);
      setLLMConnected(true, provider, model);
    } else {
      showResult('llm-test-result', false, `Failed: ${data.error}`);
    }
  } catch (e) {
    showResult('llm-test-result', false, `Error: ${e.message}`);
  }
});

document.getElementById('disconnect-llm-btn').addEventListener('click', async () => {
  await saveConfig({ llm_provider: '', llm_api_key: '' });
  document.getElementById('llm-api-key').value = '';
  setLLMConnected(false);
  showResult('llm-test-result', false, 'Disconnected. Enter a new API key to reconnect.');
});

// --- Part 2: MCP Connection ---

let mcpConnected = false;

function setMCPConnected(connected, serverName) {
  mcpConnected = connected;
  const badge = document.getElementById('mcp-status-badge');
  const testBtn = document.getElementById('test-mcp-btn');
  const disconnectBtn = document.getElementById('disconnect-mcp-btn');
  document.getElementById('mcp-urls').disabled = connected;

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

document.getElementById('test-mcp-btn').addEventListener('click', async () => {
  const url = document.getElementById('mcp-urls').value.trim();
  if (!url) return showResult('mcp-test-result', false, 'Please enter an MCP server URL');

  showResult('mcp-test-result', true, 'Testing...');
  try {
    const res = await fetch(`${API}/config/test-mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (data.ok) {
      await saveConfig({ mcp_server_urls: url });
      const info = data.tools !== undefined ? `${data.tools} tools available` : data.server;
      showResult('mcp-test-result', true, `Connected and saved! ${info}`);
      setMCPConnected(true, info);
      showMCPTools(data.toolList || []);
    } else {
      showResult('mcp-test-result', false, `Failed: ${data.error}`);
    }
  } catch (e) {
    showResult('mcp-test-result', false, `Error: ${e.message}`);
  }
});

document.getElementById('disconnect-mcp-btn').addEventListener('click', async () => {
  await saveConfig({ mcp_server_urls: '' });
  document.getElementById('mcp-urls').value = '';
  setMCPConnected(false);
  showMCPTools([]);
  showResult('mcp-test-result', false, 'Disconnected. Enter a new URL to reconnect.');
});

function showMCPTools(tools) {
  const container = document.getElementById('mcp-tools-list');
  if (!tools || tools.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  let html = '<label style="font-size: 13px; font-weight: 500; color: #555; margin-bottom: 6px; display: block;">Available Tools / Methods</label>';
  html += '<div class="mcp-tools-grid">';
  tools.forEach((t, i) => {
    const name = (t.name || '').replace(/---/g, ' › ').replace(/-/g, ' ').replace(/_/g, ' ');
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

// --- Part 3: System Prompt ---

document.getElementById('save-prompt-btn').addEventListener('click', async () => {
  const prompt = document.getElementById('system-prompt-guided').value;
  await saveConfig({ system_prompt_guided: prompt });
  alert('System prompt saved!');
});

// --- Part 4: Cyclr Connection ---

function setCyclrConnected(connected) {
  cyclrConnected = connected;
  const fields = ['cyclr-account', 'cyclr-client-id', 'cyclr-client-secret'];
  const badge = document.getElementById('cyclr-status-badge');
  const testBtn = document.getElementById('test-cyclr-btn');
  const disconnectBtn = document.getElementById('disconnect-cyclr-btn');

  fields.forEach(id => {
    document.getElementById(id).disabled = connected;
  });

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

document.getElementById('test-cyclr-btn').addEventListener('click', async () => {
  const accountId = document.getElementById('cyclr-account').value;
  const clientId = document.getElementById('cyclr-client-id').value;
  const clientSecret = document.getElementById('cyclr-client-secret').value;
  if (!accountId || !clientId || !clientSecret) {
    return showResult('cyclr-test-result', false, 'Please fill in all Cyclr credentials');
  }

  showResult('cyclr-test-result', true, 'Testing...');
  try {
    const res = await fetch(`${API}/config/test-cyclr`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, client_id: clientId, client_secret: clientSecret }),
    });
    const data = await res.json();
    if (data.ok) {
      // Auto-save on successful connection
      const connector = document.getElementById('cyclr-connector').value;
      await saveConfig({
        cyclr_account_id: accountId,
        cyclr_client_id: clientId,
        cyclr_client_secret: clientSecret,
        cyclr_connector_id: connector,
      });
      showResult('cyclr-test-result', true, `Connected and saved! Token expires in ${data.token_expires_in}s`);
      setCyclrConnected(true);
    } else {
      showResult('cyclr-test-result', false, `Failed: ${data.error}`);
    }
  } catch (e) {
    showResult('cyclr-test-result', false, `Error: ${e.message}`);
  }
});

document.getElementById('disconnect-cyclr-btn').addEventListener('click', async () => {
  await saveConfig({
    cyclr_account_id: '', cyclr_client_id: '', cyclr_client_secret: '',
    cyclr_bearer_token: '', cyclr_token_expires_at: '',
  });
  document.getElementById('cyclr-account').value = '';
  document.getElementById('cyclr-client-id').value = '';
  document.getElementById('cyclr-client-secret').value = '';
  setCyclrConnected(false);
  showResult('cyclr-test-result', false, 'Disconnected. Enter credentials to reconnect.');
});

document.getElementById('save-cyclr-prompt-btn').addEventListener('click', async () => {
  const prompt = document.getElementById('system-prompt-direct').value;
  const connector = document.getElementById('cyclr-connector').value;
  await saveConfig({ system_prompt_direct: prompt, cyclr_connector_id: connector });
  alert('Direct API settings saved!');
});

// --- Usage Report ---

let allSessions = [];

document.getElementById('refresh-report-btn').addEventListener('click', loadReport);
document.getElementById('session-filter').addEventListener('change', renderReport);
document.getElementById('clear-sessions-btn').addEventListener('click', clearSelectedSession);
document.getElementById('clear-all-sessions-btn').addEventListener('click', clearAllSessions);

async function loadReport() {
  const container = document.getElementById('report-table-container');
  const summary = document.getElementById('report-summary');
  container.innerHTML = '<p style="color: #888; font-size: 13px;">Loading...</p>';
  summary.innerHTML = '';

  try {
    const res = await fetch(`${API}/sessions`);
    const data = await res.json();
    allSessions = data.sessions || [];

    if (allSessions.length === 0) {
      container.innerHTML = '<p style="color: #888; font-size: 13px;">No chat sessions yet.</p>';
      document.getElementById('report-filter').style.display = 'none';
      document.getElementById('clear-sessions-btn').style.display = 'none';
      document.getElementById('clear-all-sessions-btn').style.display = 'none';
      return;
    }

    // Populate session filter dropdown
    const filterSelect = document.getElementById('session-filter');
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
    // Restore previous selection if still valid
    if (currentValue && [...filterSelect.options].some(o => o.value === currentValue)) {
      filterSelect.value = currentValue;
    }

    document.getElementById('report-filter').style.display = 'block';
    document.getElementById('clear-all-sessions-btn').style.display = 'inline-block';
    renderReport();
  } catch (e) {
    container.innerHTML = `<p style="color: #991b1b; font-size: 13px;">Error loading report: ${e.message}</p>`;
  }
}

function renderReport() {
  const container = document.getElementById('report-table-container');
  const summary = document.getElementById('report-summary');
  const filterId = document.getElementById('session-filter').value;
  const clearSelectedBtn = document.getElementById('clear-sessions-btn');

  const sessions = filterId === 'all'
    ? allSessions
    : allSessions.filter(s => s.id === filterId);

  clearSelectedBtn.style.display = filterId !== 'all' ? 'inline-block' : 'none';

  if (sessions.length === 0) {
    container.innerHTML = '<p style="color: #888; font-size: 13px;">No data for selected session.</p>';
    summary.innerHTML = '';
    return;
  }

  // Calculate totals for filtered sessions
  let totalInput = 0, totalOutput = 0, totalCost = 0, totalMessages = 0;
  sessions.forEach(s => {
    totalInput += Number(s.total_input_tokens) || 0;
    totalOutput += Number(s.total_output_tokens) || 0;
    totalCost += Number(s.total_cost_usd) || 0;
    totalMessages += Number(s.message_count) || 0;
  });

  const label = filterId === 'all' ? 'All Sessions' : 'Selected Session';
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

  // Build table
  let html = `<table class="report-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Date</th>
        <th>Mode</th>
        <th>Model</th>
        <th>Messages</th>
        <th>Input Tokens</th>
        <th>Output Tokens</th>
        <th>Cost (USD)</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>`;

  sessions.forEach((s, i) => {
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
      <td>${globalIdx}</td>
      <td>${date}</td>
      <td>${mode}</td>
      <td>${model}</td>
      <td style="text-align:right;">${msgs}</td>
      <td style="text-align:right;">${inTok.toLocaleString()}</td>
      <td style="text-align:right;">${outTok.toLocaleString()}</td>
      <td style="text-align:right;">$${cost.toFixed(4)}</td>
      <td>${status}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

async function clearSelectedSession() {
  const filterId = document.getElementById('session-filter').value;
  if (filterId === 'all') return;

  if (!confirm('Delete this session and all its messages and usage logs?')) return;

  try {
    await fetch(`${API}/sessions/${filterId}`, { method: 'DELETE' });
    document.getElementById('session-filter').value = 'all';
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

loadConfig();

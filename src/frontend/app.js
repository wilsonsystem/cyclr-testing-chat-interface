const API = '/api';

const sessions = { a: null, b: null };
const totalTokens = { a: { input: 0, output: 0 }, b: { input: 0, output: 0 } };
let isSending = false;

function updateTokenCounter(mode) {
  const el = document.getElementById(`${mode}-token-counter`);
  el.textContent = `Tokens: ${totalTokens[mode].input.toLocaleString()} in / ${totalTokens[mode].output.toLocaleString()} out`;
}

// --- Session display ---
function updateSessionDisplay(mode) {
  const el = document.getElementById(`${mode}-session-id`);
  if (sessions[mode]) {
    el.textContent = `(${sessions[mode].slice(0, 8)})`;
    el.title = sessions[mode];
  } else {
    el.textContent = '';
  }
}

// --- Persist/restore ---
function saveState() {
  for (const mode of ['a', 'b']) {
    if (sessions[mode]) {
      sessionStorage.setItem(`cyclr_session_${mode}`, sessions[mode]);
      sessionStorage.setItem(`cyclr_chat_html_${mode}`, document.getElementById(`chat-area-${mode}`).innerHTML);
    } else {
      sessionStorage.removeItem(`cyclr_session_${mode}`);
      sessionStorage.removeItem(`cyclr_chat_html_${mode}`);
    }
  }
}

function restoreState() {
  for (const mode of ['a', 'b']) {
    const savedId = sessionStorage.getItem(`cyclr_session_${mode}`);
    const savedHtml = sessionStorage.getItem(`cyclr_chat_html_${mode}`);
    if (savedId) {
      sessions[mode] = savedId;
      updateSessionDisplay(mode);
    }
    if (savedHtml) {
      const area = document.getElementById(`chat-area-${mode}`);
      area.innerHTML = savedHtml;
      area.scrollTop = area.scrollHeight;
    }
  }
}

// --- Auto-resize textarea ---
const input = document.getElementById('message-input');
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('new-chat-btn').addEventListener('click', newChat);
document.getElementById('clear-btn').addEventListener('click', clearChat);
document.getElementById('record-btn').addEventListener('click', generateReport);

async function ensureSession(mode) {
  if (!sessions[mode]) {
    const res = await fetch(`${API}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'mcp' }),
    });
    const data = await res.json();
    sessions[mode] = data.id;
    updateSessionDisplay(mode);
  }
}

function addMessage(mode, role, content) {
  const chatArea = document.getElementById(`chat-area-${mode}`);
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = content;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
  return div;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text || isSending) return;

  isSending = true;
  input.value = '';
  input.style.height = 'auto';

  // Show user message in both panels
  addMessage('a', 'user', text);
  addMessage('b', 'user', text);

  // Ensure both sessions exist
  await Promise.all([ensureSession('a'), ensureSession('b')]);

  // Create loading placeholders in both panels
  const divA = addMessage('a', 'assistant', '');
  divA.innerHTML = '<span class="loading">Thinking</span>';
  const divB = addMessage('b', 'assistant', '');
  divB.innerHTML = '<span class="loading">Thinking</span>';

  // Fire both requests in parallel
  await Promise.all([
    streamResponse('a', text, divA),
    streamResponse('b', text, divB),
  ]);

  isSending = false;
  saveState();
}

async function streamResponse(mode, text, assistantDiv) {
  try {
    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_id: sessions[mode],
        message: text,
        config_mode: mode,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      assistantDiv.className = 'message error';
      assistantDiv.textContent = err.error || 'Something went wrong';
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let usageInfo = '';

    assistantDiv.textContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const dataStr = line.slice(5).trim();
          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (data.content !== undefined) {
              fullContent += data.content;
              assistantDiv.textContent = fullContent;
            }
            if (data.tool) {
              if (data.result) {
                fullContent += `\n[Tool: ${data.tool} completed]\n`;
                assistantDiv.textContent = fullContent;
              } else if (data.args) {
                fullContent += `\n[Calling: ${data.tool}...]\n`;
                assistantDiv.textContent = fullContent;
              }
            }
            if (data.input_tokens !== undefined) {
              totalTokens[mode].input += data.input_tokens;
              totalTokens[mode].output += data.output_tokens;
              updateTokenCounter(mode);
              usageInfo = `Tokens: ${data.input_tokens} in / ${data.output_tokens} out`;
              if (data.estimated_cost_usd) {
                usageInfo += ` | Cost: $${data.estimated_cost_usd.toFixed(4)}`;
              }
            }
          } catch {}
        }
      }
    }

    if (usageInfo) {
      const info = document.createElement('div');
      info.className = 'usage-info';
      info.textContent = usageInfo;
      assistantDiv.appendChild(info);
    }

    const chatArea = document.getElementById(`chat-area-${mode}`);
    chatArea.scrollTop = chatArea.scrollHeight;
  } catch (e) {
    assistantDiv.className = 'message error';
    assistantDiv.textContent = `Error: ${e.message}`;
  }
}

async function newChat() {
  sessions.a = null;
  sessions.b = null;
  document.getElementById('chat-area-a').innerHTML = '';
  document.getElementById('chat-area-b').innerHTML = '';
  totalTokens.a = { input: 0, output: 0 };
  totalTokens.b = { input: 0, output: 0 };
  updateTokenCounter('a');
  updateTokenCounter('b');
  updateSessionDisplay('a');
  updateSessionDisplay('b');
  saveState();
}

async function clearChat() {
  for (const mode of ['a', 'b']) {
    if (sessions[mode]) {
      try { await fetch(`${API}/sessions/${sessions[mode]}`, { method: 'DELETE' }); } catch {}
    }
  }
  sessions.a = null;
  sessions.b = null;
  document.getElementById('chat-area-a').innerHTML = '';
  document.getElementById('chat-area-b').innerHTML = '';
  totalTokens.a = { input: 0, output: 0 };
  totalTokens.b = { input: 0, output: 0 };
  updateTokenCounter('a');
  updateTokenCounter('b');
  updateSessionDisplay('a');
  updateSessionDisplay('b');
  saveState();
}

// --- Record / Report ---

async function generateReport() {
  const btn = document.getElementById('record-btn');
  btn.textContent = 'Generating...';
  btn.disabled = true;

  try {
    // Fetch config
    const configRes = await fetch(`${API}/config`);
    const config = await configRes.json();

    // Fetch session data for both modes
    const sessionData = {};
    for (const mode of ['a', 'b']) {
      if (sessions[mode]) {
        try {
          const res = await fetch(`${API}/sessions/${sessions[mode]}`);
          sessionData[mode] = await res.json();
        } catch {
          sessionData[mode] = null;
        }
      } else {
        sessionData[mode] = null;
      }
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let report = '';

    report += '='.repeat(80) + '\n';
    report += 'CYCLR TEST CHAT — SESSION REPORT\n';
    report += '='.repeat(80) + '\n';
    report += `Generated: ${now.toLocaleString()}\n`;
    report += `Timestamp: ${now.toISOString()}\n`;
    report += '\n';

    for (const mode of ['a', 'b']) {
      const label = `MODE ${mode.toUpperCase()}`;
      const prefix = `mode_${mode}_`;

      report += '='.repeat(80) + '\n';
      report += `${label}\n`;
      report += '='.repeat(80) + '\n\n';

      // --- Configuration ---
      report += '-'.repeat(40) + '\n';
      report += `${label} — CONFIGURATION\n`;
      report += '-'.repeat(40) + '\n';

      const get = (key) => config[prefix + key] || '(not set)';

      report += `LLM Provider:      ${get('llm_provider')}\n`;
      report += `LLM Model:         ${get('llm_model')}\n`;
      report += `Tool Source:        ${get('tool_source')}\n`;
      report += `System Prompt:     ${get('system_prompt')}\n`;

      const toolSource = get('tool_source');
      if (toolSource === 'mcp' || toolSource === '(not set)') {
        let globalToolIndex = 0;
        for (let s = 1; s <= 5; s++) {
          const mcpUrl = get(`mcp_server_url_${s}`);
          if (!mcpUrl || mcpUrl === '(not set)') continue;
          report += `MCP Server ${s}:     ${mcpUrl}\n`;
          try {
            const mcpRes = await fetch(`${API}/config/test-mcp`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ url: mcpUrl }),
            });
            const mcpData = await mcpRes.json();
            if (mcpData.ok) {
              report += `  Tools Count: ${mcpData.tools}\n`;
              (mcpData.toolList || []).forEach((t) => {
                globalToolIndex++;
                report += `  [${globalToolIndex}] ${t.name}`;
                if (t.description) report += ` — ${t.description}`;
                report += '\n';
              });
            } else {
              report += `  Status: Connection failed (${mcpData.error})\n`;
            }
          } catch {
            report += `  Status: Could not fetch tool details\n`;
          }
        }
        if (globalToolIndex > 0) {
          report += `Total MCP Tools:   ${globalToolIndex}\n`;
        }
      }

      if (toolSource === 'direct') {
        report += `Cyclr Connector ID:  ${get('cyclr_connector_id')}\n`;
      }
      report += '\n';

      // --- Session Info ---
      report += '-'.repeat(40) + '\n';
      report += `${label} — SESSION INFO\n`;
      report += '-'.repeat(40) + '\n';

      const sd = sessionData[mode];
      if (!sd) {
        report += 'No active session.\n\n';
        continue;
      }

      report += `Session ID:    ${sd.id || sessions[mode]}\n`;
      report += `Mode:          ${sd.mode || '(unknown)'}\n`;
      report += `LLM Provider:  ${sd.llm_provider || '(unknown)'}\n`;
      report += `Created:       ${sd.created_at || ''}\n`;
      report += `Updated:       ${sd.updated_at || ''}\n`;
      report += `Active:        ${sd.is_active ? 'Yes' : 'No'}\n`;
      report += '\n';

      // --- Token Usage ---
      report += '-'.repeat(40) + '\n';
      report += `${label} — TOKEN USAGE\n`;
      report += '-'.repeat(40) + '\n';
      report += `Total Input Tokens:  ${totalTokens[mode].input.toLocaleString()}\n`;
      report += `Total Output Tokens: ${totalTokens[mode].output.toLocaleString()}\n`;
      report += `Total Tokens:        ${(totalTokens[mode].input + totalTokens[mode].output).toLocaleString()}\n`;

      if (sd.usage && sd.usage.length > 0) {
        report += '\nPer-message usage breakdown:\n';
        sd.usage.forEach((u, i) => {
          report += `  [${i + 1}] Model: ${u.model_name}, Input: ${u.input_tokens}, Output: ${u.output_tokens}, Cost: $${Number(u.estimated_cost_usd).toFixed(4)}\n`;
        });
      }
      report += '\n';

      // --- Chat History ---
      report += '-'.repeat(40) + '\n';
      report += `${label} — CHAT HISTORY\n`;
      report += '-'.repeat(40) + '\n';

      const messages = sd.messages || [];
      if (messages.length === 0) {
        report += 'No messages.\n';
      } else {
        messages.forEach((msg, i) => {
          const role = (msg.role || '').toUpperCase();
          report += `\n[${i + 1}] ${role} (seq: ${msg.sequence})\n`;
          report += `    Time: ${msg.created_at}\n`;
          report += `    Content:\n`;
          const lines = (msg.content || '').split('\n');
          lines.forEach(line => {
            report += `      ${line}\n`;
          });
          if (msg.tool_calls) {
            report += `    Tool Calls: ${msg.tool_calls}\n`;
          }
          if (msg.tool_results) {
            report += `    Tool Results: ${msg.tool_results}\n`;
          }
        });
      }
      report += '\n';
    }

    report += '='.repeat(80) + '\n';
    report += 'END OF REPORT\n';
    report += '='.repeat(80) + '\n';

    // Download as .txt file
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cyclr-test-report-${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('Error generating report: ' + e.message);
  }

  btn.textContent = 'Record';
  btn.disabled = false;
}

restoreState();

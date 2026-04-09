const API = '/api';

let currentSessionId = null;
let currentMode = 'mcp';
let isSending = false;

// --- Session ID display ---
function updateSessionDisplay() {
  const el = document.getElementById('session-id-display');
  if (currentSessionId) {
    el.textContent = 'Session: ' + currentSessionId.slice(0, 8) + '...';
    el.title = currentSessionId;
    el.style.display = 'inline-block';
  } else {
    el.style.display = 'none';
  }
}

// --- Persist session across page navigation ---
function saveSessionState() {
  if (currentSessionId) {
    sessionStorage.setItem('cyclr_session_id', currentSessionId);
    sessionStorage.setItem('cyclr_session_mode', currentMode);
    sessionStorage.setItem('cyclr_chat_html', document.getElementById('chat-area').innerHTML);
  } else {
    sessionStorage.removeItem('cyclr_session_id');
    sessionStorage.removeItem('cyclr_session_mode');
    sessionStorage.removeItem('cyclr_chat_html');
  }
}

function restoreSessionState() {
  const savedId = sessionStorage.getItem('cyclr_session_id');
  const savedMode = sessionStorage.getItem('cyclr_session_mode');
  const savedHtml = sessionStorage.getItem('cyclr_chat_html');

  if (savedId) {
    currentSessionId = savedId;
    updateSessionDisplay();
  }
  if (savedMode) {
    currentMode = savedMode;
    document.querySelectorAll('.mode-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === currentMode);
    });
  }
  if (savedHtml) {
    document.getElementById('chat-area').innerHTML = savedHtml;
    const chatArea = document.getElementById('chat-area');
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}

// Mode selector
document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    saveSessionState();
  });
});

// Auto-resize textarea
const input = document.getElementById('message-input');
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
});

// Send on Enter (Shift+Enter for newline)
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('new-chat-btn').addEventListener('click', newChat);
document.getElementById('clear-btn').addEventListener('click', clearChat);

async function ensureSession() {
  if (!currentSessionId) {
    const res = await fetch(`${API}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: currentMode }),
    });
    const data = await res.json();
    currentSessionId = data.id;
    updateSessionDisplay();
    saveSessionState();
  }
}

function addMessage(role, content, extra) {
  const chatArea = document.getElementById('chat-area');
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = content;
  if (extra) {
    const info = document.createElement('div');
    info.className = 'usage-info';
    info.textContent = extra;
    div.appendChild(info);
  }
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

  addMessage('user', text);
  await ensureSession();

  const assistantDiv = addMessage('assistant', '');
  assistantDiv.innerHTML = '<span class="loading">Thinking</span>';

  try {
    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_id: currentSessionId,
        message: text,
        mode: currentMode,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      assistantDiv.className = 'message error';
      assistantDiv.textContent = err.error || 'Something went wrong';
      isSending = false;
      saveSessionState();
      return;
    }

    // Read SSE stream
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
              usageInfo = `Tokens: ${data.input_tokens} in / ${data.output_tokens} out`;
              if (data.estimated_cost_usd) {
                usageInfo += ` | Cost: $${data.estimated_cost_usd.toFixed(4)}`;
              }
            }
          } catch {}
        } else if (line.startsWith('event:')) {
          // Just consume event type
        }
      }
    }

    // Add usage info
    if (usageInfo) {
      const info = document.createElement('div');
      info.className = 'usage-info';
      info.textContent = usageInfo;
      assistantDiv.appendChild(info);
    }

    const chatArea = document.getElementById('chat-area');
    chatArea.scrollTop = chatArea.scrollHeight;
  } catch (e) {
    assistantDiv.className = 'message error';
    assistantDiv.textContent = `Error: ${e.message}`;
  }

  isSending = false;
  saveSessionState();
}

async function newChat() {
  currentSessionId = null;
  document.getElementById('chat-area').innerHTML = '';
  updateSessionDisplay();
  saveSessionState();
}

async function clearChat() {
  if (currentSessionId) {
    try {
      await fetch(`${API}/sessions/${currentSessionId}`, { method: 'DELETE' });
    } catch {}
  }
  currentSessionId = null;
  document.getElementById('chat-area').innerHTML = '';
  updateSessionDisplay();
  saveSessionState();
}

// Restore session on page load
restoreSessionState();

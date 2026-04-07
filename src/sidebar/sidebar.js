// Workflow Copilot - Sidebar Controller
import { API_SERVICES, RECIPES, CONTEXT_SUGGESTIONS, RESTFUL_ELEMENT_GUIDE } from '../knowledge/api-knowledge.js';
import { EXTERNAL_SERVICES, INTENT_MAPPING } from '../knowledge/external-integrations.js';
import { FORM_SCRIPTING } from '../knowledge/form-scripting.js';
import { HELP_CENTER } from '../knowledge/help-center.js';
import { resolveSkills, buildSkillPrompt, getSkillMenu } from './prompt-skills.js';
import {
  ACTION_REGISTRY,
  ActionEngine,
  actionLog,
  buildConfirmationHTML,
  buildProgressHTML,
  buildResultHTML,
  buildParamEditorHTML
} from './action-engine.js';

// ── State ──
let currentContext = { page: 'unknown' };
let chatHistory = [];
let apiCatalog = null;
let pendingActions = []; // Actions awaiting user confirmation
let undoButtonStack = []; // Stack of undo buttons — only the last one is visible
let settings = {
  aiConnectionId: '',
  aiConnectionName: '',
  aiProvider: '',
  useBuiltin: false,
  baseUrl: ''
};

// ── Chat Persistence ──
const chatStore = {
  _currentId: null,
  _maxChats: 50, // keep last 50 conversations

  /** Generate a short unique ID */
  _id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },

  /** Get all saved chats (sorted newest first) */
  async list() {
    const { copilotChats = [] } = await chrome.storage.local.get('copilotChats');
    return copilotChats.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  /** Save current chat (call after each message) */
  async save() {
    if (chatHistory.length === 0) return;

    const chats = await this.list();
    const now = Date.now();

    // Build preview from first user message
    const firstUser = chatHistory.find(m => m.role === 'user');
    const preview = firstUser ? firstUser.content.substring(0, 80) : 'New chat';

    if (this._currentId) {
      // Update existing
      const idx = chats.findIndex(c => c.id === this._currentId);
      if (idx !== -1) {
        chats[idx].messages = chatHistory.filter(m => m.role === 'user' || m.role === 'assistant');
        chats[idx].updatedAt = now;
        chats[idx].preview = preview;
        chats[idx].messageCount = chatHistory.filter(m => m.role !== 'system').length;
        chats[idx].tokens = tokenTracker.session.totalTokens;
      }
    } else {
      // New chat
      this._currentId = this._id();
      chats.unshift({
        id: this._currentId,
        createdAt: now,
        updatedAt: now,
        preview,
        messageCount: chatHistory.filter(m => m.role !== 'system').length,
        messages: chatHistory.filter(m => m.role === 'user' || m.role === 'assistant'),
        tokens: tokenTracker.session.totalTokens
      });
    }

    // Trim to max
    const trimmed = chats.slice(0, this._maxChats);
    await chrome.storage.local.set({ copilotChats: trimmed });
  },

  /** Load a specific chat by ID */
  async load(chatId) {
    const chats = await this.list();
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return null;
    this._currentId = chat.id;
    return chat;
  },

  /** Delete a chat */
  async delete(chatId) {
    const chats = await this.list();
    const filtered = chats.filter(c => c.id !== chatId);
    await chrome.storage.local.set({ copilotChats: filtered });
    if (this._currentId === chatId) this._currentId = null;
  },

  /** Start a fresh chat */
  startNew() {
    this._currentId = null;
    chatHistory = [];
    tokenTracker.reset();
  }
};

// ── Token Usage Tracker (persisted) ──
const tokenTracker = {
  session: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  history: [],       // current session
  allHistory: [],    // persisted across sessions

  async init() {
    try {
      const data = await chrome.storage.local.get('usageHistory');
      this.allHistory = data.usageHistory || [];
    } catch { this.allHistory = []; }
    this._updateUI();
  },

  record(usage, model) {
    const entry = {
      timestamp: new Date().toISOString(),
      promptTokens: usage.prompt_tokens || usage.input_tokens || usage.promptTokens || usage.inputTokens || 0,
      completionTokens: usage.completion_tokens || usage.output_tokens || usage.completionTokens || usage.outputTokens || 0,
      totalTokens: 0,
      model: model || 'unknown',
      skills: this._lastSkills || []
    };
    entry.totalTokens = entry.promptTokens + entry.completionTokens;
    this.session.requests++;
    this.session.promptTokens += entry.promptTokens;
    this.session.completionTokens += entry.completionTokens;
    this.session.totalTokens += entry.totalTokens;
    this.history.push(entry);
    this.allHistory.push(entry);
    this._persist();
    this._updateUI();
    return entry;
  },

  _persist() {
    // Keep last 500 entries max
    if (this.allHistory.length > 500) {
      this.allHistory = this.allHistory.slice(-500);
    }
    chrome.storage.local.set({ usageHistory: this.allHistory }).catch(() => {});
  },

  _updateUI() {
    const el = document.getElementById('tokenStatsText');
    if (!el) return;
    const s = this.session;
    el.textContent = `${s.requests} req · ${this._fmt(s.totalTokens)} tokens`;
    const statsEl = document.getElementById('tokenStats');
    if (statsEl) {
      statsEl.title = `Session: ${s.requests} requests, ${this._fmt(s.totalTokens)} tokens | All time: ${this.allHistory.length} requests`;
    }
  },

  _fmt(n) {
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  },

  reset() {
    this.session = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    this.history = [];
    this._updateUI();
  },

  clearAll() {
    this.allHistory = [];
    chrome.storage.local.set({ usageHistory: [] }).catch(() => {});
  },

  getSummary() {
    const s = this.session;
    return {
      ...s,
      avgTokensPerRequest: s.requests > 0 ? Math.round(s.totalTokens / s.requests) : 0,
      history: this.history
    };
  },

  getAllTimeSummary() {
    const all = this.allHistory;
    const totalTokens = all.reduce((sum, e) => sum + e.totalTokens, 0);
    const promptTokens = all.reduce((sum, e) => sum + e.promptTokens, 0);
    const completionTokens = all.reduce((sum, e) => sum + e.completionTokens, 0);
    return {
      requests: all.length,
      totalTokens, promptTokens, completionTokens,
      avgTokensPerRequest: all.length > 0 ? Math.round(totalTokens / all.length) : 0,
      history: all
    };
  }
};

// ── Action Engine Instance ──
let actionEngine = null;

function initActionEngine() {
  actionEngine = new ActionEngine({
    baseUrl: settings.baseUrl,
    onStepProgress: (stepNum, total, stepName) => {
      const progressContainer = $('#actionProgress');
      if (progressContainer) {
        progressContainer.innerHTML = buildProgressHTML(stepNum, total, stepName);
      }
    },
    onActionComplete: (actionId, success, results) => {
      const progressContainer = $('#actionProgress');
      if (progressContainer) {
        progressContainer.innerHTML = '';
      }
    }
  });
}

// ── DOM Refs ──
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── Initialize ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  initActionEngine();
  await actionLog.load();
  await tokenTracker.init();
  await loadApiCatalog();
  setupEventListeners();
  requestContext();

  // Resume last chat if available
  const chats = await chatStore.list();
  if (chats.length > 0) {
    const latest = chats[0];
    // Only auto-resume if it's recent (within 4 hours)
    if (Date.now() - latest.updatedAt < 4 * 60 * 60 * 1000) {
      await resumeChat(latest.id);
    }
  }

  // Re-check context periodically (handles SPA navigation)
  setInterval(requestContext, 5000);
});

// ── Settings ──
async function loadSettings() {
  const stored = await chrome.storage.local.get(['copilotSettings']);
  if (stored.copilotSettings) {
    settings = { ...settings, ...stored.copilotSettings };
  }
  $('#useBuiltin').checked = settings.useBuiltin || false;
  $('#baseUrl').value = settings.baseUrl || '';

  // Auto-detect base URL
  if (!settings.baseUrl) {
    await detectBaseUrl();
  }

  // Load AI connections
  await loadAIConnections();
  updateConnectionStatus();
  updateApiKeyPrompt();
}

async function saveSettingsToStorage() {
  const picker = $('#aiConnectionPicker');
  settings.aiConnectionId = picker.value;
  settings.aiConnectionName = picker.options[picker.selectedIndex]?.text || '';
  settings.aiProvider = picker.options[picker.selectedIndex]?.dataset?.provider || '';
  settings.useBuiltin = $('#useBuiltin').checked;
  settings.baseUrl = $('#baseUrl').value;

  await chrome.storage.local.set({ copilotSettings: settings });
  updateConnectionStatus();
  updateApiKeyPrompt();
  initActionEngine(); // Reinitialize with new baseUrl
  $('#settingsPanel').classList.add('hidden');
}

function updateApiKeyPrompt() {
  const prompt = $('#apiKeyPrompt');
  if (prompt) {
    if (settings.aiConnectionId || settings.useBuiltin) {
      prompt.style.display = 'none';
    } else {
      prompt.style.display = 'block';
    }
  }
}

function updateConnectionStatus() {
  const statusText = $('#connectionStatusText');
  if (!statusText) return;
  if (settings.aiConnectionId) {
    statusText.textContent = `✓ Using "${settings.aiConnectionName}"`;
    statusText.style.color = 'var(--success)';
    statusText.style.background = 'rgba(34,197,94,0.1)';
  } else if (settings.useBuiltin) {
    statusText.textContent = 'Using built-in mode (limited capabilities)';
    statusText.style.color = 'var(--text-muted)';
    statusText.style.background = 'var(--bg-tertiary)';
  } else {
    statusText.textContent = '⚠ Select an AI connection or create one below';
    statusText.style.color = 'var(--warning)';
    statusText.style.background = 'rgba(245,158,11,0.1)';
  }
}

async function detectBaseUrl() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url?.includes('.on-nutrient.io')) {
      const url = new URL(tabs[0].url);
      settings.baseUrl = url.origin;
      $('#baseUrl').value = settings.baseUrl;
      await chrome.storage.local.set({ copilotSettings: settings });
    }
  } catch (e) {}
}

async function getBaseUrl() {
  if (settings.baseUrl) return settings.baseUrl;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url?.includes('.on-nutrient.io')) {
      return new URL(tabs[0].url).origin;
    }
  } catch (e) {}
  return null;
}

async function loadAIConnections() {
  const picker = $('#aiConnectionPicker');
  picker.innerHTML = '<option value="">Loading...</option>';

  try {
    const baseUrl = settings.baseUrl || await getBaseUrl();
    if (!baseUrl) {
      picker.innerHTML = '<option value="">Set Workflow Base URL first</option>';
      return;
    }

    const response = await fetch(`${baseUrl}/api/integrations/ai/connections`, {
      credentials: 'include'
    });

    if (!response.ok) {
      picker.innerHTML = '<option value="">Failed to load AI connections</option>';
      return;
    }

    const connections = await response.json();
    const connList = Array.isArray(connections) ? connections : (connections.items || []);

    picker.innerHTML = '';

    if (connList.length === 0) {
      picker.innerHTML = '<option value="">No AI connections found</option>';
      $('#createConnectionGroup').classList.remove('hidden');
      loadCredentialsForNewConnection();
      return;
    }

    $('#createConnectionGroup').classList.add('hidden');

    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Select an AI connection...';
    picker.appendChild(blank);

    connList.forEach(conn => {
      const connId = conn.id || conn.aiConnectionId || conn._id;
      const option = document.createElement('option');
      option.value = connId;
      option.textContent = `${conn.aiConnectionName || conn.name || 'Unnamed'} (${conn.aiProvider || ''} / ${conn.aiModel || ''})`;
      option.dataset.provider = (conn.aiProvider || '').toLowerCase();
      if (connId === settings.aiConnectionId) {
        option.selected = true;
      }
      picker.appendChild(option);
    });

    // Auto-select first if nothing selected
    if (!settings.aiConnectionId && connList.length === 1) {
      const firstId = connList[0].id || connList[0].aiConnectionId || connList[0]._id;
      picker.value = firstId;
    }

  } catch (err) {
    picker.innerHTML = `<option value="">Error: ${err.message}</option>`;
  }
}

async function loadCredentialsForNewConnection() {
  const credPicker = $('#newConnCredential');
  credPicker.innerHTML = '<option value="">Loading...</option>';

  try {
    const baseUrl = settings.baseUrl || await getBaseUrl();
    const response = await fetch(`${baseUrl}/api/integrations/credentials/list?valueType=apiKey`, {
      credentials: 'include'
    });

    if (!response.ok) {
      credPicker.innerHTML = '<option value="">Failed to load</option>';
      return;
    }

    const creds = await response.json();
    credPicker.innerHTML = '<option value="">Select a credential...</option>';

    (Array.isArray(creds) ? creds : []).forEach(cred => {
      const option = document.createElement('option');
      option.value = JSON.stringify({ type: 'static', selectedCredentialsId: cred.id, valueType: cred.valueType, resourceId: cred.resourceId });
      option.textContent = cred.name || cred.fullName || cred.resourceId || cred.id;
      credPicker.appendChild(option);
    });
  } catch (err) {
    credPicker.innerHTML = `<option value="">Error: ${err.message}</option>`;
  }
}

async function createAIConnection() {
  const name = $('#newConnName').value.trim();
  const provider = $('#newConnProvider').value;
  const model = $('#newConnModel').value.trim();
  const credentialsPicker = $('#newConnCredential').value;

  if (!name || !model || !credentialsPicker) {
    alert('Please fill in all fields');
    return;
  }

  const baseUrl = settings.baseUrl || await getBaseUrl();

  try {
    const response = await fetch(`${baseUrl}/api/integrations/ai/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        aiConnectionName: name,
        aiConnectionDescription: 'Created by Workflow Copilot extension',
        aiProvider: provider,
        aiModel: model,
        credentialsPicker: credentialsPicker
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      alert(`Failed to create connection: ${err.message || response.status}`);
      return;
    }

    // Reload connections
    await loadAIConnections();
    updateConnectionStatus();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// Update default model when provider changes
function updateDefaultModel() {
  const provider = $('#newConnProvider').value;
  const modelInput = $('#newConnModel');
  if (provider === 'Anthropic') {
    modelInput.value = 'claude-sonnet-4-20250514';
  } else {
    modelInput.value = 'gpt-4o';
  }
}

// ── Load API Catalog ──
async function loadApiCatalog() {
  try {
    const response = await fetch(chrome.runtime.getURL('src/knowledge/api-catalog-full.json'));
    apiCatalog = await response.json();
  } catch (e) {
    console.log('Using built-in knowledge base (no external catalog loaded)');
    apiCatalog = null;
  }
}

// ── Context Detection ──
function requestContext() {
  // Try to get context from content script first
  chrome.runtime.sendMessage({ type: 'GET_CONTEXT' }, (response) => {
    if (chrome.runtime.lastError || !response || response.page === 'unknown') {
      // Fallback: detect context from the active tab's URL directly
      detectContextFromTab();
    } else {
      updateContext(response);
    }
  });
}

async function detectContextFromTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.url) return;

    const url = tabs[0].url;
    const title = tabs[0].title || '';
    const path = new URL(url).pathname;

    const context = {
      url,
      path,
      page: 'unknown',
      section: null,
      entityName: title,
      timestamp: Date.now()
    };

    // Detect page from URL path
    if (path.includes('/admin/forms/') || path.includes('/forms/')) {
      context.page = 'forms';
      context.section = 'Form Builder';
      // Extract form name from tab title
      if (title.startsWith('Form - ')) {
        context.entityName = title.replace('Form - ', '');
      }
    } else if (path.includes('/admin/processes/') || path.includes('/processes/')) {
      context.page = 'processes';
      context.section = 'Process Builder';
    } else if (path.includes('/admin/reports') || path.includes('/reports/')) {
      context.page = 'reports';
      context.section = 'Reports';
    } else if (path.includes('/admin/users') || path.includes('/users/')) {
      context.page = 'users';
      context.section = 'User Management';
    } else if (path.includes('/admin/groups') || path.includes('/groups/')) {
      context.page = 'groups';
      context.section = 'Group Management';
    } else if (path.includes('/admin/categories')) {
      context.page = 'categories';
      context.section = 'Categories';
    } else if (path.includes('/dashboard')) {
      context.page = 'dashboards';
      context.section = 'Dashboards';
    } else if (path.includes('/systemsettings')) {
      context.page = 'settings';
      context.section = 'Settings';
    } else if (path.includes('/api-index')) {
      context.page = 'api-index';
      context.section = 'API Documentation';
    } else if (path.includes('/api/') && path.includes('/api-docs')) {
      context.page = 'api-docs';
      context.section = 'API Docs';
    }

    updateContext(context);
  } catch (e) {
    // Can't detect - leave as unknown
  }
}

function updateContext(context) {
  currentContext = context;
  const page = context.page || 'unknown';
  const suggestions = CONTEXT_SUGGESTIONS[page] || CONTEXT_SUGGESTIONS['unknown'];

  // Guard against calls before DOM is ready
  const contextIcon = $('#contextIcon');
  const contextText = $('#contextText');
  const welcomeText = $('#welcomeText');
  const quickSelect = $('#quickStartSelect');
  if (!contextIcon || !contextText || !quickSelect) return;

  // Update context bar with SVG icons
  const svgIcons = {
    processes: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
    forms: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    users: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    settings: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
    dashboards: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
    reports: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>',
    requests: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    tasks: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    'api-index': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    'api-docs': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>',
    unknown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>'
  };
  contextIcon.innerHTML = svgIcons[page] || svgIcons['unknown'];
  contextText.textContent = context.section || 'Workflow Admin';

  // Update welcome
  if (welcomeText) welcomeText.textContent = suggestions.greeting;

  // Populate Quick Start dropdown
  populateSuggestions(suggestions.suggestions || []);
}

let _allSuggestions = []; // full list for current context
const MAX_VISIBLE_SUGGESTIONS = 4;

function populateSuggestions(suggestions, shuffle = false) {
  const select = $('#quickStartSelect');
  if (!select) return;

  _allSuggestions = [...suggestions];

  // Pick a subset to display
  let pool = [..._allSuggestions];
  if (shuffle) {
    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }
  const visible = pool.slice(0, MAX_VISIBLE_SUGGESTIONS);

  // Clear and rebuild
  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.disabled = true;
  placeholder.selected = true;
  const total = _allSuggestions.length;
  placeholder.textContent = total > MAX_VISIBLE_SUGGESTIONS
    ? `Quick Start — showing ${visible.length} of ${total} suggestions`
    : `Quick Start — ${total} suggestion${total !== 1 ? 's' : ''}`;
  select.appendChild(placeholder);

  visible.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
}

// Listen for context updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CONTEXT_UPDATE') {
    updateContext(message.payload);
  }
});

// ── Chat ──
function addMessage(content, role, { displayOnly = false } = {}) {
  const container = $('#chatMessages');
  const welcome = container.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  const msg = document.createElement('div');
  msg.className = `message ${role}`;

  if (role === 'assistant') {
    // Check for executable action blocks in the response
    if (actionEngine && !displayOnly) {
      const actions = actionEngine.parseActionsFromResponse(content);
      // Auto-inject formId from context if the LLM omitted it
      if (currentContext.entityId) {
        for (const a of actions) {
          if (!a.params.formId && ACTION_REGISTRY[a.actionId]?.requiredParams?.includes('formId')) {
            a.params.formId = currentContext.entityId;
            a._formIdAutoInjected = true;
          }
        }
      }
      if (actions.length > 0) {
        // Render the text part (without action blocks)
        const textContent = actionEngine.stripActionBlocks(content);
        if (textContent) {
          msg.innerHTML = formatResponse(textContent);
        }

        // Build confirmation cards for each action
        const confirmations = actions.map(a =>
          actionEngine.prepareConfirmation(a.actionId, a.params)
        ).filter(Boolean);

        pendingActions = actions; // Store for execution

        // Auto-execute mode: execute actions immediately without confirmation
        const actionContainer = document.createElement('div');

        // Add progress placeholder
        const progressDiv = document.createElement('div');
        progressDiv.id = 'actionProgress';
        actionContainer.appendChild(progressDiv);

        msg.appendChild(actionContainer);

        // Auto-execute all actions
        setTimeout(() => autoExecuteActions(actions, actionContainer), 0);
      } else {
        msg.innerHTML = formatResponse(content);
      }
    } else {
      msg.innerHTML = formatResponse(content);
    }
  } else {
    msg.textContent = content;
  }

  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;

  chatHistory.push({ role, content });

  // Auto-save after each message (debounced — don't await, fire and forget)
  if (role === 'user' || role === 'assistant') {
    chatStore.save();
  }
}

// ── Auto-Execute Actions ──
async function autoExecuteActions(actions, container) {
  // Update base URL in engine
  if (actionEngine) {
    actionEngine.baseUrl = settings.baseUrl || await getBaseUrl();
  }

  const actionResults = []; // Track results for auto-continuation

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const actionDef = ACTION_REGISTRY[action.actionId];
    if (!actionDef) continue;

    // Show progress
    const statusEl = document.createElement('div');
    statusEl.className = 'action-progress';
    statusEl.innerHTML = `<span class="progress-text">⏳ Executing: ${actionDef.label}...</span>`;
    container.appendChild(statusEl);

    try {
      // Track formId source for the action log
      actionEngine._pendingFormIdSource = action._formIdAutoInjected ? 'auto-injected' : (action.params.formId ? 'llm-provided' : 'missing');

      const result = await actionEngine.executeAction(action.actionId, action.params);
      statusEl.innerHTML = buildResultHTML(result);

      // Auto-refresh Form Builder if this was a form-modifying action
      if (result.success && actionDef.category === 'forms' && actionDef.steps.some(s => s.method !== 'GET')) {
        await refreshFormBuilder();

        // Add undo button — only the most recent action's undo is visible (max 5 deep)
        const MAX_UNDO_DEPTH = 5;
        const formId = action.params.formId;
        if (formId && actionEngine.getBackup(formId)) {
          // Enforce max undo depth — drop the oldest backup if at limit
          if (undoButtonStack.length >= MAX_UNDO_DEPTH) {
            const oldest = undoButtonStack.shift();
            oldest.remove();
          }

          // Hide the previous undo button if there is one
          if (undoButtonStack.length > 0) {
            const prevBtn = undoButtonStack[undoButtonStack.length - 1];
            prevBtn.style.display = 'none';
          }

          const undoBtn = document.createElement('button');
          undoBtn.className = 'action-undo-btn';
          undoBtn.innerHTML = `↩ Undo this change (${undoButtonStack.length + 1}/${MAX_UNDO_DEPTH})`;
          undoBtn.addEventListener('click', async () => {
            undoBtn.disabled = true;
            undoBtn.textContent = '⏳ Restoring...';
            try {
              actionEngine.baseUrl = settings.baseUrl || await getBaseUrl();
              await actionEngine.restoreBackup(formId);
              await refreshFormBuilder();
              undoBtn.textContent = '✅ Undone';
              undoBtn.style.background = 'var(--success)';

              // Remove this button from the stack
              undoButtonStack.pop();

              // Reveal the previous undo button if there is one
              if (undoButtonStack.length > 0) {
                const prevBtn = undoButtonStack[undoButtonStack.length - 1];
                prevBtn.style.display = '';
              }
            } catch (err) {
              undoBtn.textContent = `❌ Restore failed: ${err.message}`;
              undoBtn.disabled = false;
            }
          });
          statusEl.appendChild(undoBtn);
          undoButtonStack.push(undoBtn);
        }
      }

      const errorDetail = result.success ? '' : ` Error: ${result.results?.map(r => r.error).filter(Boolean).join('; ')}`;
      chatHistory.push({
        role: 'system',
        content: `Action "${result.label}" ${result.success ? 'completed successfully' : 'failed'}.${errorDetail}`
      });

      // Add clickable disambiguation buttons when multiple matches found
      if (!result.success) {
        const errorStr = result.results?.map(r => r.error).filter(Boolean).join(' ') || '';
        const disambigMatch = errorStr.match(/Multiple (?:processes|categories) match[^:]*: ((?:"[^"]+"\s*\([^)]+\),?\s*)+)/);
        if (disambigMatch) {
          const optionRegex = /"([^"]+)"\s*\(([^)]+)\)/g;
          let match;
          const optionsDiv = document.createElement('div');
          optionsDiv.className = 'disambiguation-options';
          optionsDiv.style.cssText = 'margin-top: 8px; display: flex; flex-direction: column; gap: 4px;';
          const label = document.createElement('div');
          label.style.cssText = 'font-size: 12px; color: #666; margin-bottom: 4px;';
          label.textContent = 'Select one:';
          optionsDiv.appendChild(label);
          while ((match = optionRegex.exec(disambigMatch[1])) !== null) {
            const optName = match[1];
            const optSid = match[2];
            const btn = document.createElement('button');
            btn.className = 'disambiguation-btn';
            btn.style.cssText = 'padding: 6px 12px; border: 1px solid #3949ab; border-radius: 4px; background: #f5f5ff; color: #3949ab; cursor: pointer; text-align: left; font-size: 12px;';
            btn.textContent = optName;
            btn.addEventListener('mouseenter', () => { btn.style.background = '#3949ab'; btn.style.color = '#fff'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = '#f5f5ff'; btn.style.color = '#3949ab'; });
            btn.addEventListener('click', async () => {
              // Disable all buttons
              optionsDiv.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
              btn.style.background = '#3949ab'; btn.style.color = '#fff'; btn.style.opacity = '1';
              btn.textContent = `⏳ Creating with "${optName}"...`;
              // Re-run the action with the resolved SID
              const retryParams = { ...action.params };
              if (errorStr.includes('processes')) {
                retryParams.objectSid = optSid;
                delete retryParams.processName;
              } else {
                retryParams.categorySid = optSid;
                delete retryParams.category;
              }
              try {
                actionEngine.baseUrl = settings.baseUrl || await getBaseUrl();
                const retryResult = await actionEngine.executeAction(action.actionId, retryParams);
                btn.textContent = retryResult.success ? `✅ Created with "${optName}"` : `❌ Failed`;
                // Show result
                const retryEl = document.createElement('div');
                retryEl.innerHTML = buildResultHTML(retryResult);
                statusEl.parentNode.insertBefore(retryEl, statusEl.nextSibling);
                chatHistory.push({ role: 'system', content: `Action "${retryResult.label}" ${retryResult.success ? 'completed successfully' : 'failed'}.` });
              } catch (retryErr) {
                btn.textContent = `❌ ${retryErr.message}`;
              }
            });
            optionsDiv.appendChild(btn);
          }
          statusEl.appendChild(optionsDiv);
        }
      }

      // Track results for auto-continuation
      actionResults.push({ actionId: action.actionId, actionDef, result });
    } catch (err) {
      statusEl.innerHTML = buildResultHTML({
        label: actionDef.label,
        success: false,
        results: [{ step: 'Execution', success: false, error: err.message }]
      });
      chatHistory.push({
        role: 'system',
        content: `Action "${actionDef.label}" failed: ${err.message}`
      });
      actionResults.push({ actionId: action.actionId, actionDef, result: { success: false, results: [{ error: err.message }] } });
    }
  }

  // Scroll to bottom
  const chatContainer = $('#chatMessages');
  if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;

  // Auto-continuation: feed action results back to the LLM when needed
  const allSucceeded = actionResults.every(ar => ar.result.success);
  const allReadOnly = actionResults.length > 0 && actionResults.every(ar => {
    const steps = ar.actionDef.steps || [];
    return steps.every(s => s.method === 'GET');
  });

  if (allReadOnly && allSucceeded && actionResults.length > 0) {
    // Build a summary of lookup results to send back to the LLM
    const summaryParts = actionResults.map(ar => {
      const data = ar.result.results?.map(r => r.data?.data || r.data).filter(Boolean);
      let dataStr = JSON.stringify(data, null, 2);
      if (dataStr.length > 4000) dataStr = dataStr.substring(0, 4000) + '\n... (truncated)';
      return `${ar.result.label} results:\n${dataStr}`;
    });
    const continuationMsg = `The lookup actions completed. Here are the results:\n\n${summaryParts.join('\n\n')}\n\nNow proceed with the original request using the data above. Emit the remaining action blocks.`;

    // Feed back to LLM automatically
    chatHistory.push({ role: 'system', content: continuationMsg });
    showTyping();
    try {
      const response = await generateResponse(continuationMsg);
      hideTyping();
      addMessage(response, 'assistant');
    } catch (err) {
      hideTyping();
      addMessage(`Auto-continuation failed: ${err.message}`, 'assistant');
    }
  }
}

// ── Refresh Form Builder ──
function refreshFormBuilder() {
  return new Promise((resolve) => {
    // First try via content script message
    chrome.runtime.sendMessage({ type: 'REFRESH_FORM_BUILDER' }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        // Fallback: inject script directly into the active tab to click refresh
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: () => {
                try {
                  const iframe = document.getElementById('ngWidgetIframe');
                  if (iframe) {
                    const iDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const refreshBtn = iDoc.querySelector('[ng-click*="openPowerform"]');
                    if (refreshBtn) {
                      refreshBtn.click();
                      return true;
                    }
                  }
                  return false;
                } catch (e) {
                  return false;
                }
              }
            }).then((results) => {
              resolve({ success: results?.[0]?.result || false });
            }).catch(() => {
              resolve({ success: false });
            });
          } else {
            resolve({ success: false });
          }
        });
      } else {
        resolve(response);
      }
    });
  });
}

// ── Action Button Handlers (kept for manual mode if needed) ──
function bindActionButtons(messageEl) {
  // Execute buttons
  messageEl.querySelectorAll('.action-execute-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt(e.target.dataset.actionIndex);
      const action = pendingActions[idx];
      if (!action) return;

      // Update base URL in engine
      if (actionEngine) {
        actionEngine.baseUrl = settings.baseUrl || await getBaseUrl();
      }

      // Disable all buttons on this card
      const card = e.target.closest('.action-card');
      card.querySelectorAll('button').forEach(b => b.disabled = true);
      e.target.textContent = '⏳ Executing...';

      try {
        const result = await actionEngine.executeAction(action.actionId, action.params);
        // Replace the card with result
        card.innerHTML = buildResultHTML(result);

        // Add result to chat history
        chatHistory.push({
          role: 'system',
          content: `Action "${result.label}" ${result.success ? 'completed successfully' : 'failed'}.`
        });
      } catch (err) {
        card.innerHTML = buildResultHTML({
          label: ACTION_REGISTRY[action.actionId]?.label || action.actionId,
          success: false,
          results: [{ step: 'Execution', success: false, error: err.message }]
        });
      }
    });
  });

  // Edit buttons
  messageEl.querySelectorAll('.action-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.actionIndex);
      const action = pendingActions[idx];
      if (!action) return;

      const card = e.target.closest('.action-card');
      const editorHTML = buildParamEditorHTML(action.actionId, action.params);
      const editor = document.createElement('div');
      editor.innerHTML = editorHTML;
      card.appendChild(editor);

      // Hide action buttons
      card.querySelector('.action-buttons').style.display = 'none';

      // Bind editor save
      editor.querySelector('.param-save-btn')?.addEventListener('click', async () => {
        // Collect updated params
        const updatedParams = { ...action.params };
        editor.querySelectorAll('.param-input').forEach(input => {
          const paramName = input.dataset.param;
          let value = input.value;
          try { value = JSON.parse(value); } catch (e) { /* keep as string */ }
          updatedParams[paramName] = value;
        });

        pendingActions[idx].params = updatedParams;
        editor.remove();
        card.querySelector('.action-buttons').style.display = 'flex';

        // Update params display
        const paramsDisplay = card.querySelector('.action-params pre');
        if (paramsDisplay) {
          paramsDisplay.textContent = JSON.stringify(updatedParams, null, 2);
        }

        // Re-validate
        const validation = actionEngine.validateParams(action.actionId, updatedParams);
        const errorsEl = card.querySelector('.action-errors');
        const executeBtn = card.querySelector('.action-execute-btn');
        if (validation.valid) {
          if (errorsEl) errorsEl.remove();
          if (executeBtn) executeBtn.disabled = false;
        } else {
          if (errorsEl) errorsEl.textContent = '❌ ' + validation.errors.join(', ');
          if (executeBtn) executeBtn.disabled = true;
        }
      });

      // Bind editor cancel
      editor.querySelector('.param-cancel-btn')?.addEventListener('click', () => {
        editor.remove();
        card.querySelector('.action-buttons').style.display = 'flex';
      });
    });
  });

  // Skip buttons
  messageEl.querySelectorAll('.action-skip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.action-card');
      card.style.opacity = '0.4';
      card.querySelectorAll('button').forEach(b => b.disabled = true);
      card.querySelector('.action-label').insertAdjacentHTML('afterend', ' <span style="color:var(--text-muted);font-size:11px;">(skipped)</span>');
    });
  });
}

function showTyping() {
  const container = $('#chatMessages');
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'typingIndicator';
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
}

function hideTyping() {
  const indicator = $('#typingIndicator');
  if (indicator) indicator.remove();
}

async function sendMessage(text) {
  if (!text.trim()) return;

  addMessage(text, 'user');
  $('#userInput').value = '';
  $('#userInput').style.height = 'auto';

  showTyping();

  try {
    const response = await generateResponse(text);
    hideTyping();
    addMessage(response, 'assistant');
  } catch (err) {
    hideTyping();
    addMessage(`Error: ${err.message}. Check your settings and try again.`, 'assistant');
  }
}

// ── AI Response Generation ──
async function generateResponse(userMessage) {
  const context = buildContext(userMessage);

  if (!settings.aiConnectionId || settings.useBuiltin) {
    return generateBuiltinResponse(userMessage, context);
  }

  // Route through Workflow's AI execute endpoint
  return callWorkflowAI(userMessage, context);
}

function buildContext(userMessage) {
  const page = currentContext.page || 'unknown';
  const pageSuggestions = CONTEXT_SUGGESTIONS[page];

  let context = `Current page: ${currentContext.section || page}\n`;

  if (currentContext.entityName) {
    context += `Currently editing: ${currentContext.entityName}\n`;
  }

  if (currentContext.entityId) {
    context += `Entity/Form SID (use as formId): ${currentContext.entityId}\n`;
  }

  if (currentContext.url) {
    context += `URL: ${currentContext.url}\n`;
  }

  if (pageSuggestions?.relevantServices) {
    context += `Relevant Workflow API services: ${pageSuggestions.relevantServices.join(', ')}\n`;
  }

  // Add page-specific context
  if (page === 'forms') {
    context += `\nUser is in the Form Builder. They can add RESTful Data Elements, configure form fields, write JavaScript, set up rules, and manage CSS/print settings.`;
    if (currentContext.formContext) {
      const fc = currentContext.formContext;
      if (fc.fieldCount) context += `\nForm has approximately ${fc.fieldCount} fields.`;
      if (fc.hasRestfulElements) context += `\nForm already has ${fc.restfulElementCount} RESTful Data Element(s).`;
    }
  } else if (page === 'processes') {
    context += `\nUser is in the Process Builder. They can configure tasks, rules, transitions, recipients, mappings, and notifications.`;
  }

  return context;
}

function generateBuiltinResponse(userMessage, context) {
  const lowerMsg = userMessage.toLowerCase();

  // Route to the right handler based on intent
  if (lowerMsg.includes('restful data element') || lowerMsg.includes('restful element') || lowerMsg.includes('rest data element') ||
      (lowerMsg.includes('form') && (lowerMsg.includes('api') || lowerMsg.includes('rest') || lowerMsg.includes('dropdown') || lowerMsg.includes('lookup')))) {
    return handleRestfulElementQuery(userMessage);
  }

  if (lowerMsg.includes('cascad') || (lowerMsg.includes('dependent') && lowerMsg.includes('dropdown'))) {
    return handleCascadingQuery(userMessage);
  }

  if (lowerMsg.includes('jsonata') || lowerMsg.includes('response mapping') || lowerMsg.includes('map response')) {
    return handleJsonataQuery(userMessage);
  }

  if (lowerMsg.includes('recipe') || lowerMsg.includes('how do i set up') || lowerMsg.includes('how to set up') || lowerMsg.includes('walk me through')) {
    return handleRecipeQuery(userMessage);
  }

  if (lowerMsg.includes('credential') || lowerMsg.includes('api key') || lowerMsg.includes('token') || lowerMsg.includes('auth')) {
    return handleCredentialQuery(userMessage);
  }

  if (lowerMsg.includes('endpoint') || lowerMsg.includes('/api/')) {
    return handleEndpointQuery(userMessage);
  }

  if (lowerMsg.includes('connect') || lowerMsg.includes('integrat') || lowerMsg.includes('database') || lowerMsg.includes('external')) {
    return handleIntegrationQuery(userMessage);
  }

  if (lowerMsg.includes('process') && (lowerMsg.includes('task') || lowerMsg.includes('rule') || lowerMsg.includes('transition'))) {
    return handleProcessQuery(userMessage);
  }

  if (lowerMsg.includes('start') && (lowerMsg.includes('instance') || lowerMsg.includes('workflow') || lowerMsg.includes('request'))) {
    return handleInstanceQuery(userMessage);
  }

  if (lowerMsg.includes('server variable') || lowerMsg.includes('chain') || lowerMsg.includes('onresponse')) {
    return handleChainingQuery(userMessage);
  }

  if (lowerMsg.includes('troubleshoot') || lowerMsg.includes('error') || lowerMsg.includes('not working') || lowerMsg.includes('fails') || lowerMsg.includes('issue')) {
    return handleTroubleshootQuery(userMessage);
  }

  // Generic response with suggestions
  return generateGenericResponse(userMessage);
}

// ── Response Handlers ──

function handleRestfulElementQuery(msg) {
  const guide = RESTFUL_ELEMENT_GUIDE;
  return `#### RESTful Data Elements

${guide.overview}

**Value Sources** (4 types):
- **Fixed Value**: Static text (e.g., content-type headers)
- **Form Field**: Dynamic values from other form elements
- **Credential**: Encrypted API keys/tokens from Credential Center
- **Server Variable**: Data from previous API calls in the same form

**Auth Options**: ${Object.keys(guide.authTypes).join(', ')}

**Setting one up:**
1. Drag a RESTful Data Element onto your form
2. Configure the HTTP method and URL
3. Set up headers, query params, and auth
4. Map the response using JSONata expressions
5. Wire up execution via JavaScript: \`element.request.executeRequest(runId)\`

**Want more detail on any of these?**
- Response mapping with JSONata
- Request chaining
- Cascading dropdowns
- Troubleshooting common issues`;
}

function handleCascadingQuery(msg) {
  const recipe = RECIPES['cascading-form-lookups'];
  return `#### ${recipe.title}

${recipe.description}

**Pattern:**

1. **Parent Element** (e.g., Country)
   - Fetches all options on form load
   - Response mapping: \`$.data{ $.code : $.name }\`

2. **Child Element** (e.g., State)
   - URL includes parent value: \`/states?country={countryCode}\`
   - Value source: Form Field → Country element
   - Triggered on parent change

3. **Wire up with JavaScript:**

\`\`\`javascript
${recipe.steps[2]?.code || '// Use onChange handlers to trigger child lookups'}
\`\`\`

**Tips:**
- Clear child values when parent changes
- Use Server Variables to cache auth tokens across all calls
- Set test values for design-time testing`;
}

function handleJsonataQuery(msg) {
  const mapping = RESTFUL_ELEMENT_GUIDE.responseMapping;
  return `#### JSONata Response Mapping

${mapping.description}

**Common expressions:**
${mapping.examples.map(e => `- \`${e.expression}\` → ${e.description}`).join('\n')}

**For dropdowns** (key-value pairs):
\`$.items{ $.id : $.name }\`

**Filtering results:**
\`$.results[status="active"]\`

**Sorting:**
\`$.items^(>name)\` (descending by name)

**Counting:**
\`$count($.items)\`

**Tip:** Use the Test Request button in the form designer to see the raw API response, then build your JSONata expression to match the structure.`;
}

function handleRecipeQuery(msg) {
  const lowerMsg = msg.toLowerCase();

  // Try to match a specific recipe
  for (const [key, recipe] of Object.entries(RECIPES)) {
    const titleWords = recipe.title.toLowerCase().split(' ');
    if (titleWords.some(w => lowerMsg.includes(w)) || lowerMsg.includes(key.replace(/-/g, ' '))) {
      return formatRecipe(recipe);
    }
  }

  // List all recipes
  let response = '#### Available Integration Recipes\n\n';
  for (const [key, recipe] of Object.entries(RECIPES)) {
    response += `**${recipe.title}** (${recipe.difficulty})\n${recipe.description}\n\n`;
  }
  response += 'Ask about any of these for step-by-step guidance!';
  return response;
}

function handleCredentialQuery(msg) {
  return `#### Credential Management

Workflow stores credentials securely via the Integrations service.

**Create a credential:**
\`\`\`
POST /api/integrations/credentials/create
{
  "name": "My API Token",
  "resourceKind": "restful-request",
  "valueType": "bearer-token",
  "value": "your-token-here",
  "scope": { "ambient": "tenant" }
}
\`\`\`

**Scope levels** (narrowest to broadest):
- \`task\` → specific task only
- \`process\` → all tasks in a process
- \`user\` → specific user's requests
- \`tenant\` → shared across all users

**In RESTful Data Elements:**
Use the "Credential" value source to reference stored credentials. The system will resolve the best matching credential based on scope.

**Related endpoints:**
- \`GET /api/integrations/credentials/list\` → list credentials by scope
- \`GET /api/integrations/credentials/decode/{tenant}/{id}\` → view decoded value
- \`POST /api/integrations/credentials/edit/{id}\` → update credential
- \`POST /api/integrations/credentials/delete/{id}\` → delete credential`;
}

function handleEndpointQuery(msg) {
  // Try to find referenced endpoints
  const apiMatch = msg.match(/\/api\/[^\s"')]+/);
  if (apiMatch) {
    const path = apiMatch[0];
    return findEndpointInfo(path);
  }

  return `I can help you find the right endpoint. What are you trying to do? For example:
- "How do I create a process?"
- "What endpoint starts a workflow instance?"
- "Show me the integrations endpoints"

Or use the **API Explorer** button below to browse all 508 endpoints.`;
}

function handleIntegrationQuery(msg) {
  const lowerMsg = msg.toLowerCase();

  // Check for external service matches first
  for (const [keyword, mapping] of Object.entries(INTENT_MAPPING)) {
    if (lowerMsg.includes(keyword)) {
      return handleExternalServiceQuery(mapping.service, mapping.defaultPattern, msg);
    }
  }

  if (lowerMsg.includes('database') || lowerMsg.includes('db')) {
    return formatRecipe(RECIPES['setup-db-connection']);
  }
  if (lowerMsg.includes('ai') || lowerMsg.includes('openai') || lowerMsg.includes('anthropic')) {
    return formatRecipe(RECIPES['setup-ai-connection']);
  }
  if (lowerMsg.includes('rest') || lowerMsg.includes('webhook')) {
    return formatRecipe(RECIPES['setup-rest-integration']);
  }

  return `#### Integration Options

Workflow supports several integration patterns:

1. **REST API Integration** → Connect to any REST service
   - Create RESTful Request definitions
   - Use REST Client tasks in processes
   - Or RESTful Data Elements on forms

2. **Database Connection** → Direct database queries
   - MSSQL, MySQL, PostgreSQL, Oracle
   - Custom tables for workflow data storage

3. **AI Connection** → OpenAI or Anthropic
   - AI-powered approvals
   - Custom AI processing

4. **Webhook/Event-Driven** → Notify external systems
   - REST Client tasks triggered by transitions
   - Process task notifications

Which type of integration are you setting up?`;
}

function handleProcessQuery(msg) {
  return `#### Process Configuration via API

**Key endpoints:**

**Tasks:**
- \`GET /api/processes/{processSid}/tasks\` → list process tasks
- \`POST /api/processes/processTask/{id}/save\` → save task config
- \`GET /api/processes/tasktypes\` → available task types

**Rules & Transitions:**
- \`POST /api/processes/tasks/{id}/rules\` → create transition rules
- \`GET /api/processes/tasks/{id}/rules\` → list rules
- \`PATCH /api/processes/tasks/{id}/rules/{ruleSid}\` → update rule

**Recipients:**
- \`GET /api/processes/processTask/{id}/recipients\` → list recipients
- \`POST /api/processes/processTask/{id}/recipients\` → add recipient

**Data Mappings:**
- \`GET /api/processes/processTask/{id}/mappings\` → list mappings
- \`POST /api/processes/processTask/{id}/mappings\` → create mapping
- \`GET /api/processes/mapping/sources/{category}\` → available data sources

**Task Config (REST Client, Email, Script, etc.):**
- \`GET /api/task-dispatcher/{tasktype}/{id}/config/{op}\` → get config
- \`POST /api/task-dispatcher/{tasktype}/{id}/config/{op}\` → save config
- \`POST /api/task-dispatcher/{tasktype}/{id}/test\` → test task

What specifically are you configuring?`;
}

function handleInstanceQuery(msg) {
  return formatRecipe(RECIPES['automate-process-start']);
}

function handleExternalServiceQuery(serviceKey, patternKey, msg) {
  const service = EXTERNAL_SERVICES[serviceKey];
  if (!service) return `I don't have detailed guides for that service yet. However, the general pattern is the same: store credentials, create RESTful Requests, and use REST Client tasks or RESTful Data Elements.`;

  if (!patternKey || !service.patterns?.[patternKey]) {
    let response = `#### ${service.name} Integration\n\n${service.description}\n\n`;
    response += `**Auth methods:** ${service.authMethods?.join(', ') || 'API key'}\n\n`;
    response += `**Available patterns:**\n`;
    for (const [key, pattern] of Object.entries(service.patterns || {})) {
      response += `- **${pattern.title}**: ${pattern.description || ''}\n`;
    }
    response += `\nAsk about a specific pattern for step-by-step guidance!`;
    return response;
  }

  const pattern = service.patterns[patternKey];
  let response = `#### ${pattern.title}\n\n${pattern.description}\n\n`;

  if (pattern.architectureOptions) {
    pattern.architectureOptions.forEach(option => {
      response += `**Approach: ${option.name}**\n${option.description}\n\n`;

      if (option.pros) response += `Pros: ${option.pros.join(', ')}\n`;
      if (option.cons) response += `Cons: ${option.cons.join(', ')}\n\n`;

      if (option.setup) {
        // External service setup steps
        if (option.setup[serviceKey]) {
          response += `**${service.name} Setup:**\n`;
          option.setup[serviceKey].forEach((step, i) => {
            response += `${i + 1}. ${step}\n`;
          });
          response += '\n';
        }
        if (option.setup.slack) {
          response += `**Slack Setup:**\n`;
          option.setup.slack.forEach((step, i) => {
            response += `${i + 1}. ${step}\n`;
          });
          response += '\n';
        }
        if (option.setup.stripe) {
          response += `**Stripe Setup:**\n`;
          option.setup.stripe.forEach((step, i) => {
            response += `${i + 1}. ${step}\n`;
          });
          response += '\n';
        }

        // Workflow setup steps
        const workflowSteps = option.setup.workflow || option.setup.workflowPaymentForm?.steps || [];
        if (workflowSteps.length > 0) {
          response += `**Workflow Configuration:**\n`;
          workflowSteps.forEach((step, i) => {
            const s = typeof step === 'string' ? { step: step } : step;
            response += `\n**Step ${i + 1}: ${s.step}**\n`;
            if (s.endpoint) response += `Endpoint: \`${s.endpoint}\`\n`;
            if (s.description) response += `${s.description}\n`;
            if (s.notes) response += `*${s.notes}*\n`;
            if (s.body) response += `\`\`\`json\n${JSON.stringify(s.body, null, 2)}\n\`\`\`\n`;
          });
        }

        // Refund process if applicable
        if (option.setup.workflowRefundProcess) {
          response += `\n---\n**Refund Process:**\n`;
          option.setup.workflowRefundProcess.steps.forEach((step, i) => {
            response += `\n**${step.step}**\n`;
            if (step.description) response += `${step.description}\n`;
            if (step.tasks) {
              step.tasks.forEach(t => response += `- ${t}\n`);
            }
            if (step.body) response += `\`\`\`json\n${JSON.stringify(step.body, null, 2)}\n\`\`\`\n`;
            if (step.notes) response += `*${step.notes}*\n`;
          });
        }
      }
    });
  }

  if (pattern.formApproach) {
    response += `\n---\n**${pattern.formApproach.title}**\n${pattern.formApproach.description}\n`;
  }

  if (pattern.transitionRules) {
    response += `\n**Transition Rules:**\n`;
    for (const [rule, action] of Object.entries(pattern.transitionRules)) {
      response += `- *${rule}* → ${action}\n`;
    }
  }

  return response;
}

function handleChainingQuery(msg) {
  const guide = RESTFUL_ELEMENT_GUIDE.chaining;
  return `#### Request Chaining

${guide.description}

**Pattern:**
\`\`\`javascript
${guide.pattern}
\`\`\`

**Tips:**
${guide.tips.map(t => `- ${t}`).join('\n')}

**Server Variables** let you persist data between calls:
- Auth tokens (with optional expiry)
- IDs from lookup calls
- Any data needed across multiple requests
- Must have unique names within the form`;
}

function handleTroubleshootQuery(msg) {
  const issues = RESTFUL_ELEMENT_GUIDE.troubleshooting;
  let response = '#### Troubleshooting Guide\n\n';

  const lowerMsg = msg.toLowerCase();
  const relevant = issues.filter(i =>
    lowerMsg.includes('401') ? i.issue.includes('401') :
    lowerMsg.includes('empty') ? i.issue.includes('empty') :
    lowerMsg.includes('object') ? i.issue.includes('object') :
    lowerMsg.includes('chain') ? i.issue.includes('chain') :
    true
  );

  relevant.forEach(i => {
    response += `**${i.issue}**\n${i.fix}\n\n`;
  });

  response += 'Still stuck? Describe the specific error and I can help diagnose it.';
  return response;
}

function generateGenericResponse(msg) {
  const page = currentContext.page;
  const suggestions = CONTEXT_SUGGESTIONS[page] || CONTEXT_SUGGESTIONS['unknown'];

  let response = `I can help with that! Here are some things I can assist with:\n\n`;

  if (suggestions.relevantRecipes) {
    response += '**Relevant recipes for this page:**\n';
    suggestions.relevantRecipes.forEach(key => {
      const recipe = RECIPES[key];
      if (recipe) response += `- ${recipe.title}\n`;
    });
    response += '\n';
  }

  response += `**I can help with:**
- Integrating with **any** external service (Slack, Stripe, SAP, Oracle, Salesforce, ERPs, custom APIs)
- Setting up REST API integrations (process tasks & form elements)
- Configuring RESTful Data Elements with cascading lookups
- Credential and authentication management
- JSONata response mapping
- Process task configuration

**For best results with complex integrations, configure an AI API key in Settings.**

What would you like help with?`;

  return response;
}

function findEndpointInfo(path) {
  for (const [svcKey, svc] of Object.entries(API_SERVICES)) {
    if (path.startsWith(svc.baseUrl)) {
      return `#### Endpoint: \`${path}\`

**Service:** ${svc.title}
**Description:** ${svc.description}

**Common use cases:**
${svc.commonUseCases.map(u => `- ${u}`).join('\n')}

Use the **API Explorer** to see full details, or use the **API Tester** to try it out.`;
    }
  }
  return `I found a reference to \`${path}\` but don't have detailed info. Use the API Explorer to look it up.`;
}

function formatRecipe(recipe) {
  let response = `#### ${recipe.title}\n\n${recipe.description}\n\n`;
  recipe.steps.forEach((step, i) => {
    response += `**Step ${i + 1}: ${step.title}**\n`;
    if (step.description) response += `${step.description}\n`;
    if (step.endpoint) response += `Endpoint: \`${step.endpoint}\`\n`;
    if (step.example) {
      response += `\`\`\`json\n${JSON.stringify(step.example, null, 2)}\n\`\`\`\n`;
    }
    if (step.code) {
      response += `\`\`\`javascript\n${step.code}\n\`\`\`\n`;
    }
    if (step.notes) response += `*${step.notes}*\n`;
    response += '\n';
  });
  return response;
}

// ── Workflow AI Execute ──
async function callWorkflowAI(userMessage, context) {
  const systemPrompt = buildSystemPrompt(userMessage);
  const baseUrl = settings.baseUrl || await getBaseUrl();

  if (!baseUrl) {
    throw new Error('Workflow base URL not set. Check Settings.');
  }

  // Build conversation as a single user prompt (the execute endpoint takes userPrompt + systemPrompt)
  const conversationContext = chatHistory.slice(-10).map(m =>
    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
  ).join('\n\n');

  const fullUserPrompt = conversationContext
    ? `Previous conversation:\n${conversationContext}\n\nContext: ${context}\n\nUser question: ${userMessage}`
    : `Context: ${context}\n\nUser question: ${userMessage}`;

  const response = await fetch(`${baseUrl}/api/integrations/ai/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      aiConnectionId: settings.aiConnectionId,
      providerParams: {
        systemPrompt: systemPrompt,
        userPrompt: fullUserPrompt,
        temperature: 0.3,
        maxTokens: 2048
      }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Workflow AI execute failed (${response.status})`);
  }

  const data = await response.json();

  // ── Track token usage ──
  // Try to extract usage from response — providers nest it differently
  const usage = data.usage                              // Anthropic direct: { input_tokens, output_tokens }
    || data.data?.usage                                  // Wrapped: { data: { usage: ... } }
    || data.choices?.[0]?.usage                          // OpenAI variant
    || data.metadata?.usage                              // Metadata wrapper
    || data.response?.usage                              // Response wrapper
    || null;
  const model = data.model || data.data?.model || data.metadata?.model || settings.aiProvider || 'unknown';
  if (usage) {
    tokenTracker.record(usage, model);
  } else {
    // Fallback: estimate tokens (~4 chars per token) when API doesn't return usage
    const responseText = data.data || data.content || data.text || data.choices?.[0]?.message?.content || '';
    const estPrompt = Math.ceil(fullUserPrompt.length / 4) + Math.ceil(systemPrompt.length / 4);
    const estCompletion = Math.ceil((typeof responseText === 'string' ? responseText.length : JSON.stringify(responseText).length) / 4);
    tokenTracker.record({ prompt_tokens: estPrompt, completion_tokens: estCompletion }, model + ' (est.)');
  }

  // Extract the response text - the execute endpoint returns { data: "...", content: "...", ... }
  if (data.data && typeof data.data === 'string') return data.data;
  if (data.content && typeof data.content === 'string') return data.content;
  if (typeof data === 'string') return data;
  if (data.text) return data.text;
  if (Array.isArray(data.content) && data.content[0]?.text) return data.content[0].text;
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;

  return JSON.stringify(data);
}

function buildSystemPrompt(userMessage = '') {
  // Resolve which skill modules to load based on user message + page context
  const skillKeys = resolveSkills(userMessage, currentContext);
  const skillPrompt = buildSkillPrompt(skillKeys);
  const skillMenu = getSkillMenu();

  // Log skills loaded for debugging (visible in token tracker)
  tokenTracker._lastSkills = skillKeys;

  return `You are Workflow Copilot, an expert AI assistant for the Nutrient Workflow platform. You help users build forms, create reports, design processes, and integrate with external services.

## EXECUTABLE ACTIONS — You can DO things, not just advise!

Include a fenced code block with the language tag "action" containing a JSON object:

\`\`\`action
{"actionId": "action-id-here", "params": { ... }}
\`\`\`

**Always-available actions:**
- \`get-form-json\` — params: formId
- \`list-forms\` — no params
- \`list-processes\` — no params

## Available Capabilities:
${skillMenu}

## Rules:
1. Give a BRIEF (1-2 sentence) explanation of what the action will do BEFORE the action block. Do NOT describe features or capabilities — just say what you're about to do.
2. NEVER describe the result as successful or ready BEFORE the action executes. The action may fail.
3. NEVER include actual secrets/tokens in action blocks.
4. You can include MULTIPLE action blocks in one response for sequential setup.
5. Actions auto-execute immediately — the user does NOT need to approve.
6. Use actions when the user asks you to "do", "create", "set up", "configure", "add", "move", "reorganize", etc.
7. Use advice-only (no action block) when the user asks "how do I", "explain", "what is", etc.
8. **SECTION IDENTIFICATION — Use LABELS, not ClientIDs!** The engine resolves labels automatically (case-insensitive). Use "Section 1", "Section 2" for positional reference.
9. Only use get-form-json when you need to discover existing fields/sections/containers.
10. For field ClientIDs, infer from naming conventions (txtFirstName, emlEmail, calStartDate, ddlPosition).
11. NEVER fabricate field objects, layouts, or timestamp-based ClientIDs.
12. **PREFER BUILT-IN CAPABILITIES OVER JAVASCRIPT.** Use Form Rules for conditional show/hide/required. Use Grid aggregation for row calculations. Only use JS when there is NO built-in alternative.
13. **CRITICAL ORDERING: When creating fields + rules in one response, add ALL fields FIRST, then rules LAST.** The engine resolves fields from live form data.

**Form Builder JSON structure:**
The form GET response is: { _id, name, sid, layout: [...sections], script, css, rules, version }
Inside layout: sections[] → .contents[] (containers) → .columns[] → .items[] (questions)
${skillPrompt}

### Help Center Reference:
Full documentation at https://www.nutrient.io/workflow-automation/help-center/`;
}

// ── Format Response ──
function formatResponse(text) {
  // Convert markdown-like formatting to HTML
  let html = text
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // Wrap loose <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>)/gs, (match) => {
    if (!match.startsWith('<ul>')) return `<ul>${match}</ul>`;
    return match;
  });

  // Highlight endpoint badges
  html = html.replace(/`(GET|POST|PUT|DELETE|PATCH) (\/api\/[^`]+)`/g,
    '<span class="endpoint-badge $1">$1 $2</span>');

  return `<p>${html}</p>`;
}

// ── API Explorer ──
function showApiExplorer() {
  const panel = $('#apiExplorer');
  panel.classList.remove('hidden');

  const list = $('#apiList');
  list.innerHTML = '';

  for (const [key, service] of Object.entries(API_SERVICES)) {
    const group = document.createElement('div');
    group.className = 'api-service-group';

    const header = document.createElement('h4');
    header.textContent = `${service.title} (${service.baseUrl})`;
    header.addEventListener('click', () => {
      const endpoints = group.querySelector('.endpoints');
      endpoints.style.display = endpoints.style.display === 'none' ? 'block' : 'none';
    });
    group.appendChild(header);

    const endpoints = document.createElement('div');
    endpoints.className = 'endpoints';
    endpoints.style.display = 'none';

    // Use loaded catalog or show placeholder
    if (apiCatalog && apiCatalog[key]) {
      apiCatalog[key].endpoints.forEach(ep => {
        const item = createEndpointItem(ep);
        endpoints.appendChild(item);
      });
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'api-endpoint';
      placeholder.innerHTML = `<span style="color: var(--text-muted)">Use API docs at ${service.baseUrl}/api-docs for full endpoint list</span>`;
      endpoints.appendChild(placeholder);
    }

    group.appendChild(endpoints);
    list.appendChild(group);
  }
}

function createEndpointItem(ep) {
  const item = document.createElement('div');
  item.className = 'api-endpoint';

  const method = document.createElement('span');
  method.className = `method ${(ep.m || ep.method || '').toLowerCase()}`;
  method.textContent = ep.m || ep.method;

  const path = document.createElement('span');
  path.className = 'path';
  path.textContent = ep.p || ep.path;
  path.title = ep.s || ep.summary || '';

  item.appendChild(method);
  item.appendChild(path);

  item.addEventListener('click', () => {
    const endpoint = ep.p || ep.path;
    const methodStr = ep.m || ep.method;
    $('#testMethod').value = methodStr;
    $('#testUrl').value = endpoint;
    showApiTester();
  });

  return item;
}

function filterApiExplorer(query) {
  const items = $$('.api-endpoint');
  const q = query.toLowerCase();
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(q) ? 'flex' : 'none';
  });

  // Expand all groups when filtering
  if (q) {
    $$('.endpoints').forEach(el => el.style.display = 'block');
  }
}

// ── Usage History Panel ──
function showUsageHistory() {
  const panel = $('#usageHistoryPanel');
  panel.classList.remove('hidden');

  const allTime = tokenTracker.getAllTimeSummary();
  const session = tokenTracker.getSummary();
  const fmt = (n) => tokenTracker._fmt(n);

  // Summary cards
  const summaryEl = $('#usageSummary');
  summaryEl.innerHTML = `
    <div class="usage-stat">
      <div class="usage-stat-label">Session Requests</div>
      <div class="usage-stat-value">${session.requests}</div>
    </div>
    <div class="usage-stat">
      <div class="usage-stat-label">Session Tokens</div>
      <div class="usage-stat-value">${fmt(session.totalTokens)}</div>
    </div>
    <div class="usage-stat">
      <div class="usage-stat-label">All-Time Requests</div>
      <div class="usage-stat-value">${allTime.requests}</div>
    </div>
    <div class="usage-stat">
      <div class="usage-stat-label">All-Time Tokens</div>
      <div class="usage-stat-value">${fmt(allTime.totalTokens)}</div>
    </div>
  `;

  // Per-request log (most recent first)
  const entriesEl = $('#usageEntries');
  entriesEl.innerHTML = '';

  const entries = [...allTime.history].reverse().slice(0, 50);
  if (entries.length === 0) {
    entriesEl.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px;text-align:center;">No usage recorded yet.</div>';
    return;
  }

  entries.forEach(e => {
    const div = document.createElement('div');
    div.className = 'usage-entry';

    const time = new Date(e.timestamp);
    const isToday = new Date().toDateString() === time.toDateString();
    const dateStr = isToday ? time.toLocaleTimeString() : time.toLocaleDateString() + ' ' + time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const skillsLabel = e.skills?.length ? e.skills.join(', ') : 'core only';
    div.innerHTML = `
      <div class="usage-entry-left">
        <span class="usage-entry-time">${dateStr}</span>
        <span class="usage-entry-model">${e.model}</span>
        <span class="usage-entry-skills">${skillsLabel}</span>
      </div>
      <div class="usage-entry-right">
        <div class="usage-entry-tokens">${fmt(e.totalTokens)} tok</div>
        <div class="usage-entry-breakdown">${fmt(e.promptTokens)} in · ${fmt(e.completionTokens)} out</div>
      </div>
    `;
    entriesEl.appendChild(div);
  });

  if (allTime.history.length > 50) {
    const more = document.createElement('div');
    more.style.cssText = 'padding:8px 16px;color:var(--text-muted);font-size:11px;text-align:center;';
    more.textContent = `+ ${allTime.history.length - 50} older entries`;
    entriesEl.appendChild(more);
  }
}

// ── Recipes Panel ──
function showRecipesPanel() {
  const panel = $('#recipesPanel');
  panel.classList.remove('hidden');

  const list = $('#recipesList');
  list.innerHTML = '';

  for (const [key, recipe] of Object.entries(RECIPES)) {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.innerHTML = `
      <h4>${recipe.title}</h4>
      <p>${recipe.description}</p>
      <div class="recipe-meta">
        <span class="recipe-tag">${recipe.category}</span>
        <span class="recipe-tag">${recipe.difficulty}</span>
        <span class="recipe-tag">${recipe.steps.length} steps</span>
      </div>
    `;
    card.addEventListener('click', () => showRecipe(key));
    list.appendChild(card);
  }
}

function showRecipe(key) {
  const recipe = RECIPES[key];
  if (!recipe) return;

  const viewer = $('#recipeViewer');
  viewer.classList.remove('hidden');

  $('#recipeTitle').textContent = recipe.title;

  const content = $('#recipeContent');
  content.innerHTML = `<p style="color: var(--text-secondary); margin-bottom: 12px;">${recipe.description}</p>`;

  recipe.steps.forEach((step, i) => {
    const stepEl = document.createElement('div');
    stepEl.className = 'recipe-step';
    let html = `<span class="step-number">${i + 1}</span><h4>${step.title}</h4>`;
    if (step.description) html += `<p>${step.description}</p>`;
    if (step.endpoint) html += `<p><code>${step.endpoint}</code></p>`;
    if (step.example) html += `<pre>${JSON.stringify(step.example, null, 2)}</pre>`;
    if (step.code) html += `<pre>${step.code}</pre>`;
    if (step.notes) html += `<div class="step-notes">${step.notes}</div>`;
    stepEl.innerHTML = html;
    content.appendChild(stepEl);
  });
}

// ── API Tester ──
function showApiTester() {
  $('#apiTestPanel').classList.remove('hidden');
}

async function executeApiTest() {
  const method = $('#testMethod').value;
  const urlPath = $('#testUrl').value;
  const headersStr = $('#testHeaders').value;
  const bodyStr = $('#testBody').value;

  let baseUrl = settings.baseUrl;
  if (!baseUrl) {
    // Try to detect from current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url) {
      const url = new URL(tabs[0].url);
      baseUrl = url.origin;
    }
  }

  const fullUrl = urlPath.startsWith('http') ? urlPath : `${baseUrl}${urlPath}`;

  let headers = {};
  try { headers = headersStr ? JSON.parse(headersStr) : {}; } catch (e) {
    $('#testResponse').textContent = 'Invalid headers JSON';
    return;
  }

  let body = null;
  if (bodyStr && method !== 'GET') {
    try { body = JSON.parse(bodyStr); } catch (e) {
      body = bodyStr;
    }
  }

  $('#testResponse').textContent = 'Executing...';

  chrome.runtime.sendMessage({
    type: 'EXECUTE_API',
    payload: { method, url: fullUrl, headers, body }
  }, (response) => {
    if (response?.success) {
      const data = response.data;
      $('#testResponse').textContent = `Status: ${data.status} ${data.statusText}\n\n${
        typeof data.data === 'object' ? JSON.stringify(data.data, null, 2) : data.data
      }`;
    } else {
      $('#testResponse').textContent = `Error: ${response?.error || 'Request failed'}`;
    }
  });
}

// ── Action Log Panel ──
async function showActionLog() {
  await actionLog.load();
  $('#actionLogPanel').classList.remove('hidden');
  renderLogEntries();
}

// ── Chat History UI ──
async function showChatHistory() {
  const panel = $('#chatHistoryPanel');
  const list = $('#chatHistoryList');
  panel.classList.remove('hidden');

  const chats = await chatStore.list();

  if (chats.length === 0) {
    list.innerHTML = `<div class="log-empty"><div class="log-empty-icon">💬</div>No saved chats yet.<br>Start a conversation and it will appear here.</div>`;
    return;
  }

  list.innerHTML = chats.map(chat => {
    const date = new Date(chat.updatedAt);
    const timeStr = formatChatDate(date);
    const isCurrent = chat.id === chatStore._currentId;
    const tokenStr = chat.tokens ? ` · ${tokenTracker._fmt(chat.tokens)} tok` : '';

    return `
      <div class="chat-history-item${isCurrent ? ' chat-current' : ''}" data-chat-id="${chat.id}">
        <div class="chat-history-preview">${escapeHtml(chat.preview)}</div>
        <div class="chat-history-meta">
          ${timeStr} · ${chat.messageCount || 0} msgs${tokenStr}
          ${isCurrent ? '<span class="chat-active-badge">active</span>' : ''}
        </div>
        <button class="chat-delete-btn" data-chat-id="${chat.id}" title="Delete chat">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M5 6v14a2 2 0 002 2h10a2 2 0 002-2V6"/></svg>
        </button>
      </div>
    `;
  }).join('');

  // Bind click to resume
  list.querySelectorAll('.chat-history-item').forEach(el => {
    el.addEventListener('click', async (e) => {
      if (e.target.closest('.chat-delete-btn')) return; // let delete handler run
      const chatId = el.dataset.chatId;
      if (chatId === chatStore._currentId) {
        panel.classList.add('hidden');
        return;
      }
      await resumeChat(chatId);
      panel.classList.add('hidden');
    });
  });

  // Bind delete buttons
  list.querySelectorAll('.chat-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const chatId = btn.dataset.chatId;
      await chatStore.delete(chatId);
      showChatHistory(); // refresh
    });
  });
}

async function resumeChat(chatId) {
  const chat = await chatStore.load(chatId);
  if (!chat) return;

  // Clear current UI
  chatHistory = [];
  tokenTracker.reset();
  const container = $('#chatMessages');
  container.innerHTML = '';

  // Rebuild messages in the UI (display only — don't re-execute actions)
  for (const msg of chat.messages) {
    addMessage(msg.content, msg.role, { displayOnly: true });
  }
}

function startNewChat() {
  chatStore.startNew();
  const container = $('#chatMessages');
  container.innerHTML = `
    <div class="welcome-message">
      <p id="welcomeText">Welcome! I can help you architect and build integrations between Workflow and any external service — Slack, Stripe, ERPs, Oracle, Salesforce, custom APIs, or anything with a REST endpoint.</p>
      <p id="apiKeyPrompt" style="margin-top: 8px; color: #f59e0b; font-size: 12px;">⚠️ Select your AI API key from the Credential Center in Settings (gear icon) to unlock full capabilities.</p>
    </div>
  `;
  updateApiKeyPrompt();
  $('#chatHistoryPanel').classList.add('hidden');
}

function formatChatDate(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderLogEntries() {
  const filter = $('#logFilter')?.value || 'all';
  let entries;

  switch (filter) {
    case 'failed':
      entries = actionLog.query({ status: 'failed' });
      break;
    case 'warnings':
      entries = actionLog.query({ hasWarnings: true });
      break;
    case 'success':
      entries = actionLog.query({ status: 'success' });
      break;
    default:
      entries = actionLog.query();
  }

  // Render stats
  const stats = actionLog.getStats();
  const statsEl = $('#logStats');
  if (statsEl) {
    statsEl.innerHTML = `
      <span class="log-stat total">${stats.total} total</span>
      <span class="log-stat success">${stats.success} success</span>
      <span class="log-stat failed">${stats.failed} failed</span>
      <span class="log-stat normalized">${stats.withNormalizations} fixed</span>
      ${stats.autoCreated > 0 ? `<span class="log-stat auto-created">${stats.autoCreated} auto-created</span>` : ''}
    `;
  }

  // Render entries
  const container = $('#logEntries');
  if (!container) return;

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="log-empty">
        <div class="log-empty-icon">📊</div>
        <p>No action log entries${filter !== 'all' ? ' matching this filter' : ' yet'}.</p>
        <p style="font-size: 11px; margin-top: 4px; color: var(--text-muted);">Actions will be logged as you use the copilot.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = entries.map(entry => {
    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = time.toLocaleDateString([], { month: 'short', day: 'numeric' });

    // Badges
    const badges = [];
    if (entry.normalizations.length > 0) badges.push(`<span class="log-badge normalized">${entry.normalizations.length} fixed</span>`);
    if (entry.warnings.length > 0) badges.push(`<span class="log-badge warning">${entry.warnings.length} warn</span>`);
    if (entry.errors.length > 0) badges.push(`<span class="log-badge error">${entry.errors.length} err</span>`);
    if (entry.autoCreated) badges.push(`<span class="log-badge auto-created">auto-created</span>`);

    // Details sections
    let details = '';

    // Raw params
    details += `
      <div class="log-detail-section">
        <h5>LLM Raw Params</h5>
        <pre class="log-raw-params">${JSON.stringify(entry.rawParams, null, 2)}</pre>
      </div>
    `;

    // Field resolution
    if (entry.fieldResolution) {
      const fr = entry.fieldResolution;
      details += `
        <div class="log-detail-section">
          <h5>Field Resolution</h5>
          <div class="log-detail-item ${fr.method === 'not found' ? 'error' : 'normalization'}">
            <span class="label">Identifier:</span> "${fr.identifier}"
            ${fr.method !== 'not found'
              ? `<span class="arrow">→</span> resolved via ${fr.method} to "${fr.resolved}"`
              : `<span class="arrow">→</span> NOT FOUND. Available: ${(fr.availableFields || []).join(', ')}`
            }
          </div>
        </div>
      `;
    }

    // Normalizations
    if (entry.normalizations.length > 0) {
      details += `
        <div class="log-detail-section">
          <h5>Auto-Corrections Applied</h5>
          ${entry.normalizations.map(n => `
            <div class="log-detail-item normalization">
              <span class="label">${n.field}:</span> ${n.from} <span class="arrow">→</span> ${n.to}
            </div>
          `).join('')}
        </div>
      `;
    }

    // Warnings
    if (entry.warnings.length > 0) {
      details += `
        <div class="log-detail-section">
          <h5>Warnings</h5>
          ${entry.warnings.map(w => `
            <div class="log-detail-item warning">
              ${w.message}${w.details ? `: ${w.details}` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }

    // Errors
    if (entry.errors.length > 0) {
      details += `
        <div class="log-detail-section">
          <h5>Errors</h5>
          ${entry.errors.map(e => `
            <div class="log-detail-item error">
              ${e.message}${e.details ? `: ${e.details}` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }

    // Steps
    if (entry.stepResults.length > 0) {
      details += `
        <div class="log-detail-section">
          <h5>Steps</h5>
          ${entry.stepResults.map(s => `
            <div class="log-detail-item ${s.success ? '' : 'error'}">
              ${s.success ? '✓' : '✗'} ${s.step} ${s.status ? `(HTTP ${s.status})` : ''} ${s.error ? `— ${s.error}` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }

    // Duration & metadata
    if (entry.duration !== null) {
      details += `
        <div class="log-detail-section">
          <h5>Metadata</h5>
          <div class="log-detail-item">
            <span class="label">Duration:</span> ${entry.duration}ms
            ${entry.backupPushed ? ' · <span class="label">Backup:</span> pushed' : ''}
            ${entry.formIdSource ? ` · <span class="label">formId:</span> ${entry.formIdSource}` : ''}
          </div>
        </div>
      `;
    }

    return `
      <div class="log-entry" data-entry-id="${entry.id}">
        <div class="log-entry-header" onclick="this.parentElement.classList.toggle('expanded')">
          <span class="log-entry-status ${entry.status}"></span>
          <span class="log-entry-action">${entry.actionLabel}</span>
          <div class="log-entry-badges">${badges.join('')}</div>
          <span class="log-entry-time">${dateStr} ${timeStr}</span>
        </div>
        <div class="log-entry-details">
          ${details}
        </div>
      </div>
    `;
  }).join('');
}

// ── Event Listeners ──
function setupEventListeners() {
  // Send message
  $('#sendBtn').addEventListener('click', () => sendMessage($('#userInput').value));
  $('#userInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage($('#userInput').value);
    }
  });

  // Auto-resize textarea
  $('#userInput').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // Settings
  $('#settingsBtn').addEventListener('click', () => {
    $('#settingsPanel').classList.toggle('hidden');
  });
  $('#saveSettings').addEventListener('click', saveSettingsToStorage);
  $('#cancelSettings').addEventListener('click', () => {
    $('#settingsPanel').classList.add('hidden');
  });
  $('#refreshConnections').addEventListener('click', loadAIConnections);
  $('#createConnection')?.addEventListener('click', createAIConnection);
  $('#newConnProvider')?.addEventListener('change', updateDefaultModel);

  // Panels
  $('#apiExplorerBtn').addEventListener('click', showApiExplorer);
  $('#explorerBack').addEventListener('click', () => $('#apiExplorer').classList.add('hidden'));
  $('#apiSearch').addEventListener('input', (e) => filterApiExplorer(e.target.value));

  // Quick Start dropdown — send selected suggestion as a message
  $('#quickStartSelect').addEventListener('change', (e) => {
    const text = e.target.value;
    if (text) {
      sendMessage(text);
      e.target.selectedIndex = 0; // Reset to placeholder
    }
  });

  // Refresh suggestions — shuffle to show different ones
  $('#refreshSuggestions').addEventListener('click', () => {
    populateSuggestions(_allSuggestions, true);
    // Brief visual feedback
    const btn = $('#refreshSuggestions');
    btn.style.color = 'var(--accent)';
    btn.style.transform = 'rotate(180deg)';
    setTimeout(() => { btn.style.color = ''; btn.style.transform = ''; }, 400);
  });

  // ── Tools Dropdown ──
  const toolsBtn = $('#toolsDropdownBtn');
  const toolsMenu = $('#toolsDropdownMenu');

  function toggleToolsMenu(show) {
    const isHidden = toolsMenu.classList.contains('hidden');
    const shouldShow = show !== undefined ? show : isHidden;
    toolsMenu.classList.toggle('hidden', !shouldShow);
    toolsBtn.classList.toggle('open', shouldShow);
  }

  toolsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleToolsMenu();
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!toolsMenu.classList.contains('hidden') && !toolsMenu.contains(e.target)) {
      toggleToolsMenu(false);
    }
  });

  // Each menu item closes dropdown then opens its panel
  const menuActions = {
    recipesBtn: showRecipesPanel,
    apiExplorerBtn: () => { const p = $('#apiExplorer'); p && p.classList.remove('hidden'); },
    testApiBtn: showApiTester,
    actionLogBtn: showActionLog,
    chatHistoryBtn: showChatHistory,
    usageHistoryBtn: showUsageHistory
  };

  Object.entries(menuActions).forEach(([id, fn]) => {
    $(`#${id}`)?.addEventListener('click', () => {
      toggleToolsMenu(false);
      fn();
    });
  });

  $('#recipesListBack').addEventListener('click', () => $('#recipesPanel').classList.add('hidden'));
  $('#recipeBack').addEventListener('click', () => $('#recipeViewer').classList.add('hidden'));
  $('#testBack').addEventListener('click', () => $('#apiTestPanel').classList.add('hidden'));
  $('#executeTest').addEventListener('click', executeApiTest);

  // Chat History panel
  $('#chatHistoryBack').addEventListener('click', () => $('#chatHistoryPanel').classList.add('hidden'));
  $('#newChatBtn').addEventListener('click', startNewChat);

  // Action Log panel
  $('#actionLogBack').addEventListener('click', () => $('#actionLogPanel').classList.add('hidden'));
  $('#logFilter').addEventListener('change', () => renderLogEntries());
  $('#clearLogBtn').addEventListener('click', async () => {
    await actionLog.clear();
    renderLogEntries();
  });

  // Token stats — click to open usage history panel
  $('#tokenStats')?.addEventListener('click', showUsageHistory);

  // Usage history panel back/clear
  $('#usageHistoryBack')?.addEventListener('click', () => $('#usageHistoryPanel').classList.add('hidden'));
  $('#clearUsageBtn')?.addEventListener('click', () => {
    tokenTracker.clearAll();
    showUsageHistory();
  });
}

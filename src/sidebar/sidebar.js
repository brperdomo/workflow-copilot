// Workflow Copilot - Sidebar Controller
import { API_SERVICES, RECIPES, CONTEXT_SUGGESTIONS, RESTFUL_ELEMENT_GUIDE } from '../knowledge/api-knowledge.js';
import { EXTERNAL_SERVICES, INTENT_MAPPING } from '../knowledge/external-integrations.js';
import { FORM_SCRIPTING } from '../knowledge/form-scripting.js';
import { HELP_CENTER } from '../knowledge/help-center.js';
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
  await loadApiCatalog();
  setupEventListeners();
  requestContext();

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
  const chipsContainer = $('#suggestionChips');
  if (!contextIcon || !contextText || !chipsContainer) return;

  // Update context bar
  const icons = {
    processes: '⚙️', forms: '📝', users: '👥', settings: '🔧',
    dashboards: '📊', reports: '📈', requests: '📋', tasks: '✅',
    'api-index': '🔌', 'api-docs': '📖', unknown: '📍'
  };
  contextIcon.textContent = icons[page] || '📍';
  contextText.textContent = context.section || 'Workflow Admin';

  // Update welcome
  if (welcomeText) welcomeText.textContent = suggestions.greeting;

  // Update suggestion chips
  chipsContainer.innerHTML = '';
  (suggestions.suggestions || []).forEach(suggestion => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = suggestion;
    chip.addEventListener('click', () => sendMessage(suggestion));
    chipsContainer.appendChild(chip);
  });
}

// Listen for context updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CONTEXT_UPDATE') {
    updateContext(message.payload);
  }
});

// ── Chat ──
function addMessage(content, role) {
  const container = $('#chatMessages');
  const welcome = container.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  const msg = document.createElement('div');
  msg.className = `message ${role}`;

  if (role === 'assistant') {
    // Check for executable action blocks in the response
    if (actionEngine) {
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
}

// ── Auto-Execute Actions ──
async function autoExecuteActions(actions, container) {
  // Update base URL in engine
  if (actionEngine) {
    actionEngine.baseUrl = settings.baseUrl || await getBaseUrl();
  }

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

        // Add undo button — only the most recent action's undo is visible
        const formId = action.params.formId;
        if (formId && actionEngine.getBackup(formId)) {
          // Hide the previous undo button if there is one
          if (undoButtonStack.length > 0) {
            const prevBtn = undoButtonStack[undoButtonStack.length - 1];
            prevBtn.style.display = 'none';
          }

          const undoBtn = document.createElement('button');
          undoBtn.className = 'action-undo-btn';
          undoBtn.innerHTML = '↩ Undo this change';
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

      chatHistory.push({
        role: 'system',
        content: `Action "${result.label}" ${result.success ? 'completed successfully' : 'failed'}.`
      });
    } catch (err) {
      statusEl.innerHTML = buildResultHTML({
        label: actionDef.label,
        success: false,
        results: [{ step: 'Execution', success: false, error: err.message }]
      });
    }
  }

  // Scroll to bottom
  const chatContainer = $('#chatMessages');
  if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
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
  const systemPrompt = buildSystemPrompt();
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

  // Extract the response text - the execute endpoint returns { data: "...", content: "...", ... }
  if (data.data && typeof data.data === 'string') return data.data;
  if (data.content && typeof data.content === 'string') return data.content;
  if (typeof data === 'string') return data;
  if (data.text) return data.text;
  if (Array.isArray(data.content) && data.content[0]?.text) return data.content[0].text;
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;

  return JSON.stringify(data);
}

function buildSystemPrompt() {
  const externalServiceList = Object.entries(EXTERNAL_SERVICES)
    .map(([k, v]) => `- ${v.name}: ${v.description} (auth: ${v.authMethods?.join(', ')})`)
    .join('\n');

  return `You are Workflow Copilot, an expert AI assistant for the Nutrient Workflow platform. You help users architect and build integrations between Workflow and any external service.

## Your Core Knowledge

### Nutrient Workflow API (508 endpoints across 12 services):
${Object.entries(API_SERVICES).map(([k, v]) => `- ${v.title} (${v.baseUrl}): ${v.description}`).join('\n')}

### Integration Architecture Patterns:
There are THREE ways to connect Workflow to external services:

1. **REST Client Task** (in a process) — automated server-side API call that fires during workflow execution
   - Created via: POST /api/integrations/restful-requests (define the request)
   - Configured via: POST /api/task-dispatcher/restClient/{processTaskSid}/config/settings (link to task)
   - Data mapped via: POST /api/processes/processTask/{processTaskSid}/mappings (map process data to request params)
   - Tested via: POST /api/task-dispatcher/restClient/{processTaskSid}/test

2. **RESTful Data Element** (on a form) — interactive API call triggered by form events
   - Configured in Form Builder (no API endpoint — it's a drag-and-drop element)
   - Value sources: Fixed, Form Field, Credential, Server Variable
   - Response mapping: JSONata expressions (e.g., $.items{ $.id : $.name } for dropdowns)
   - Chaining: element.request.executeRequest(runId) + onResponse handlers
   - Server Variables persist data between calls (auth tokens, IDs)
   - All requests execute server-side (no CORS)

3. **Database Connection** — direct SQL queries against external databases
   - Created via: POST /api/integrations/connections
   - Tested via: POST /api/integrations/connections/database/test
   - Custom tables via: POST /api/integrations/customtable/{connectionId}/schemas/{tableName}

### Credentials Management:
- Store: POST /api/integrations/credentials/create
- Scope levels: task < process < user < tenant
- Referenced in requests via {{credential:name}} syntax
- Supports: bearer-token, api-key, basic-auth, custom

### External Service Integration Guides:
${externalServiceList}

### Slack Integration Details:
- Webhook approach: POST to Incoming Webhook URL, simple but single-channel
- Bot Token approach: POST https://slack.com/api/chat.postMessage with Bearer xoxb-token
- Threading: Use thread_ts parameter for threaded replies
- Channel lookup: GET https://slack.com/api/conversations.list
- Block Kit for rich messages: https://api.slack.com/block-kit

### Stripe Integration Details:
- PaymentIntents API for SCA-compliant payments
- Create intent: POST https://api.stripe.com/v1/payment_intents (form-urlencoded, NOT JSON)
- Refunds: POST https://api.stripe.com/v1/refunds (payment_intent={pi_id}&amount={cents})
- Amount is always in cents (e.g., $50.00 = 5000)
- Client-side: Stripe.js + Payment Element for card collection
- Server-side: REST Client tasks for charges, refunds, lookups
- Store Stripe Secret Key (sk_) as credential, Publishable Key (pk_) in form JavaScript

### Process Flow for Integrations:
When building an integration process:
1. Store external service credentials → POST /api/integrations/credentials/create
2. Define the REST request → POST /api/integrations/restful-requests
3. Create/configure process → POST /api/processes + task configuration
4. Add REST Client task → configure via task-dispatcher
5. Map data between tasks → POST /api/processes/processTask/{id}/mappings
6. Set transition rules → POST /api/processes/tasks/{id}/rules
7. Test → POST /api/task-dispatcher/{tasktype}/{id}/test

## EXECUTABLE ACTIONS — You can DO things, not just advise!

You have the ability to execute actions directly in the user's Workflow environment. When appropriate, include an action block in your response that the user can execute with one click.

**Format:** Include a fenced code block with the language tag "action" containing a JSON object:

\`\`\`action
{"actionId": "action-id-here", "params": { ... }}
\`\`\`

**Available actions:**

**Level 1 — API Actions:**
- \`create-credential\` — params: name, valueType (bearer-token|apiKey|username-password), value, [resourceKind], [scope]
- \`create-restful-request\` — params: name, method, url, [headers], [body], [auth], [mappings]
- \`start-workflow-instance\` — params: processSid, [subject], [priority], [prefills]
- \`list-processes\` — no params needed
- \`list-forms\` — no params needed
- \`list-credentials\` — params: [valueType], [scope]
- \`create-ai-connection\` — params: name, provider, model, credentialId
- \`get-form-json\` — params: formId

**Level 2 — Process Builder Actions:**
- \`create-process\` — params: name, [description], [category]
- \`add-process-task\` — params: processSid, name, taskType (Form|Approval|RestClient|Email|Script|Notification|WebForm), [formId]
- \`configure-task-transition\` — params: taskId, targetTaskId, [condition], [conditionType], [label]
- \`add-task-recipient\` — params: taskId, recipientType (user|group|role), recipientId
- \`configure-data-mapping\` — params: taskId, sourceField, targetField, [sourceCategory]
- \`configure-rest-client-task\` — params: taskId, method, url, [headers], [body], [auth]

**Level 2 — Form Actions:**
- \`create-form\` — params: name, [description]
- \`create-form-with-layout\` — params: name, layout (full JSON)
- \`add-field-to-form\` — Add a single question/field. Params: formId, field (question object with type:"Question_Type"), [afterClientId].
- \`rename-section\` — Rename an existing section. Params: formId, sectionClientId (use current label!), newLabel. Use this when the user says "rename", "relabel", or "change the name of" a section.
- \`add-section-to-form\` — Add a new layout section. Params: formId, sectionLabel, [insertAfterSectionIndex], [containerColumns], [fields].
- \`add-container-to-section\` — **Add a container to an EXISTING section.** Params: formId, sectionClientId (the ClientID of the target section), columns (number of columns, e.g. 2), [fields] (optional field objects to put in it). Use this when the user asks to add a multi-column container to a section that already exists.
- \`move-fields-to-new-section\` — Move existing fields to a NEW section. Params: formId, fieldClientIds (array of field ClientIDs OR Labels — the engine matches by either), newSectionLabel, [insertAfterSectionIndex], [containerColumns], [fieldsPerColumn].
- \`move-fields-to-container\` — Move existing fields to an EXISTING container. Params: formId, fieldClientIds (array of field ClientIDs OR Labels — e.g. ["Phone Number", "Email"] works just as well as ["txtPhoneNumber", "emlEmail"]), targetSectionClientId, [targetContainerIndex] (0-based), [targetContainerColumns] (find container by column count, e.g. 2 for the 2-column container — **prefer this over targetContainerIndex when the user references a container by its column count**), [targetColumnIndex] (0-based).
- \`reorder-sections\` — Reorder sections on the form. Params: formId, sectionOrder (array of section ClientIDs in desired order).
- \`reorder-containers\` — Reorder containers within a section. Params: formId, sectionClientId, containerOrder (array of container ClientIDs in desired order).
- \`resize-container\` — Change the number of columns in an existing container. Params: formId, sectionClientId, newColumnCount, PLUS one of: [containerColumns] (find by current column count), [containerContainsField] (find by field ClientID/label inside it), [containerIndex] (0-based). When adding columns, empty columns are appended. When reducing, fields from removed columns are moved to the last remaining column. **Use this when the user wants to convert a 1-column container to 2-column (or vice versa) before moving fields.**
- \`move-container-to-section\` — Move an entire container (with all fields) between sections. Params: formId, targetSectionClientId (use section label!), PLUS one of these to identify the source container (in priority order):
  (a) sourceSectionClientId + sourceContainerContainsField — find the container holding a specific field by ClientID or label. **BEST for disambiguation.** E.g., "the container with First Name" → sourceContainerContainsField:"txtFirstName"
  (b) sourceSectionClientId + sourceContainerColumns — find by column count. E.g., sourceContainerColumns:2
  (c) sourceSectionClientId + sourceContainerIndex — find by position (0-based)
  (d) containerClientId — exact container ID (avoid, hard to get right)

**CRITICAL — Form Layout Hierarchy:**
- SECTION (type: "Section_Type") → collapsible grouping. Created with add-section-to-form.
- CONTAINER (type: "Container_Type") → lives inside a section's .contents[]. Holds columns. Created with add-container-to-section.
- COLUMN → lives inside a container's .columns[]. Holds items (fields).
- FIELD/QUESTION (type: "Question_Type") → lives inside a column's .items[]. ShortText, SelectList, Calendar, etc.
- NEVER create a question with QuestionType="Section" — sections are layout elements, not questions.
- When the user says "add a 2-column container to the Pets section", use add-container-to-section with the section's ClientID and columns:2.
- Section ClientIDs look like timestamps ending in "s" (e.g. "1773951418087s"). Get them from get-form-json or infer from context.
- **Container identification**: When the user references a container by column count (e.g. "the 2-column container"), use targetContainerColumns/sourceContainerColumns instead of guessing a container index. When the user references a container by a field it contains, use sourceContainerContainsField. Avoid using index-based targeting unless explicitly requested.
- **Sanity-check requests**: Before executing, verify the request is logically possible. A 1-column container only has column index 0 — you CANNOT place fields in "the second column" of a 1-column container. If the user asks for something impossible, explain why and suggest alternatives (e.g., "That container only has 1 column. I can first resize it to 2 columns with \`resize-container\`, then move the fields."). If the user agrees, use \`resize-container\` first, then \`move-fields-to-container\` as a second action. NEVER fabricate a successful result for an impossible operation.
- \`update-field\` — **Update properties of an existing field in place.** Params: formId, fieldIdentifier (ClientID or Label of the field), updates (object of properties to merge). The engine finds the field and deep-merges your updates — it does NOT replace the field, only changes the keys you specify. Use this to configure RESTful Elements, change labels, update validation, set dbSettings, etc. Example: to configure a RESTful Element's API call, use updates: { dbSettings: { restRequest: { method: "POST", url: "...", ... } } }.
- **NEVER use update-form-layout** — it has been removed because it risks wiping the entire form. Always use targeted actions instead.
- \`update-form-javascript\` — Write JS to the form's JavaScript tab. Params: formId, javascript (the code string), mode ("replace" = overwrite all, "append" = add to existing, default "replace"). The engine fetches the form, injects the JS, and saves — you do NOT need get-form-json first.
- \`update-form-css\` — Write CSS to the form's CSS tab. Params: formId, css (the code string), mode ("replace" | "append", default "replace"). Same GET→modify→PUT pattern as JS.
- \`add-rule\` — Add a conditional rule to the form. Params: formId, name (rule name), conditions (array), effects (array), [logic: "all"|"any" (default "all")], [createInverse: true|false (default true)].
  - Each condition: { field: "Label or ClientID", operator: "equals"|"!="|"contains"|"is empty"|etc., value: "the value" }
  - Each effect: { action: "show"|"hide"|"disable"|"enable"|"required"|"unrequired"|"readOnly"|"editable"|"set answer", target: "Label or ClientID", targetType: "question"|"section" }
  - The engine resolves field labels to IDs, builds full question snapshots, generates uiJson/ruleString, and auto-creates the inverse rule.
  - Operators: equal, notEqual, lessThan, lessThanInclusive, greaterThan, greaterThanInclusive, containsValue, doesNotContainValue, isEmpty, isNotEmpty. The engine also accepts aliases like "equals", "!=", "contains", "is empty", etc.
  - Effects: show, hide, disable, enable, readOnly, editable, required, unrequired, set_answer_with_value, set_answer_with_function. Engine accepts aliases like "visible", "hidden", "mandatory", "optional", etc.
  - Inverse rules are auto-generated with flipped operators and effects (show↔hide, required↔unrequired, equal↔notEqual, any↔all).
  - Example: name: "Show Comments", logic: "all", conditions: [{field: "Budgeted?", operator: "equals", value: "No"}], effects: [{action: "show", target: "Comments", targetType: "question"}, {action: "required", target: "Comments", targetType: "question"}]
  - **CRITICAL ORDERING: ALL fields referenced in conditions and effects MUST already exist on the form BEFORE calling add-rule.** The engine resolves fields by label/ClientID from the live form data. If a field hasn't been added yet, the rule will fail. Always add fields FIRST, then add rules LAST.
  - When creating fields + rules in one response, use SEPARATE action blocks in this order: (1) add-field-to-form for ALL fields, (2) add-rule AFTER all fields exist.
- \`remove-rule\` — Remove a rule by name. Params: formId, ruleName. Also removes the inverse rule by default (set removeInverse: false to keep it).
- **IMPORTANT — Rules vs JavaScript**: Do NOT mix Form Rules and JavaScript on the same form for controlling visibility/state. If the form uses script with onChange handlers, use script for all conditional logic. If the form uses Rules, use Rules for all conditional logic. Binding onChange in script disables that question from triggering Form Rules.

**IMPORTANT — Form Builder JSON structure:**
The form GET response is: { _id, name, sid, layout: [...sections], script, css, rules, version }
Inside layout: sections[] → .contents[] (containers) → .columns[] → .items[] (questions)

**Known ClientID conventions on forms:**
- Short Text: txtFieldName (e.g., txtFirstName, txtLastName, txtCity)
- Long Text: ltxtFieldName (e.g., ltxtAddress)
- Select List: ddlFieldName (e.g., ddlPosition)
- Calendar: calFieldName (e.g., calStartingDate)
- Checkboxes: chkFieldName
- Radio: radFieldName
- Email: emlFieldName
- Number: numFieldName
- Grid: grdFieldName (e.g., grdLineItems, grdInventory)
When the user says "under First Name", use afterClientId: "txtFirstName". You can infer ClientIDs from field labels using these conventions.

**Field object templates by QuestionType (use these EXACT structures):**

ShortText / LongText / EmailAddress / Password:
\`\`\`json
{"id":"new_1","ClientID":"txtFieldName","type":"Question_Type","Label":"Field Label","QuestionType":"ShortText","displayName":"Short Text","show":true,"class":"","flex":100,"validation":{"required":false,"requiredMessage":null,"min":null,"minMessage":null,"max":null,"maxMessage":null,"regEx":null,"regExMessage":null},"events":{"onChange":null,"onFocus":null,"onBlur":null},"Choices":null,"Answer":null,"columnOrRow":null,"multiple":null,"dbSettings":null,"gridOptions":null,"formtext":null,"placeholder":null,"helpText":null}
\`\`\`
For LongText: QuestionType:"LongText", displayName:"Long Text", prefix ltxt_
For EmailAddress: QuestionType:"EmailAddress", displayName:"Email", prefix eml_
For Password: QuestionType:"Password", displayName:"Password", prefix pwd_

Radio Buttons (QuestionType is "DbRadioButton" NOT "RadioButtons"):
\`\`\`json
{"id":"new_2","ClientID":"radFieldName","type":"Question_Type","Label":"Field Label","QuestionType":"DbRadioButton","displayName":"Radio Buttons","show":true,"class":"","flex":100,"columnOrRow":"row","dbSettings":{"useDB":false},"validation":{"required":false,"requiredMessage":"This field is required","min":null,"minMessage":null,"max":null,"maxMessage":null,"regEx":null,"regExMessage":null},"events":{"onChange":null,"onFocus":null,"onBlur":null},"Choices":[{"Label":"Option 1","Value":"option1"},{"Label":"Option 2","Value":"option2"}],"Answer":null,"multiple":null,"gridOptions":null,"formtext":null,"placeholder":null,"helpText":null}
\`\`\`

Checkboxes (QuestionType is "DbCheckbox"):
\`\`\`json
{"id":"new_3","ClientID":"chkFieldName","type":"Question_Type","Label":"Field Label","QuestionType":"DbCheckbox","displayName":"Checkboxes","show":true,"class":"","flex":100,"columnOrRow":"row","dbSettings":{"useDB":false},"validation":{"required":false,"requiredMessage":null,"min":null,"minMessage":null,"max":null,"maxMessage":null,"regEx":null,"regExMessage":null},"events":{"onChange":null,"onFocus":null,"onBlur":null},"Choices":[{"Label":"Option 1","Value":"option1","Selected":false}],"Answer":null,"multiple":null,"gridOptions":null,"formtext":null,"placeholder":null,"helpText":null}
\`\`\`

Select List (QuestionType is "DbSelectList"):
\`\`\`json
{"id":"new_4","ClientID":"ddlFieldName","type":"Question_Type","Label":"Field Label","QuestionType":"DbSelectList","displayName":"Select List","show":true,"class":"","flex":100,"dbSettings":{"useDB":false},"validation":{"required":false,"requiredMessage":null,"min":null,"minMessage":null,"max":null,"maxMessage":null,"regEx":null,"regExMessage":null},"events":{"onChange":null,"onFocus":null,"onBlur":null},"Choices":[{"Label":"Option 1","Value":"option1"}],"Answer":null,"columnOrRow":null,"multiple":false,"gridOptions":null,"formtext":null,"placeholder":null,"helpText":null}
\`\`\`

Calendar: QuestionType:"Calendar", displayName:"Calendar", prefix cal_
Number: QuestionType:"Number", displayName:"Number", prefix num_
File Attachment: QuestionType:"FileAttachment", displayName:"File Attachment", prefix fa_
Signature: QuestionType:"Signature", displayName:"Signature", prefix sig_

Grid: QuestionType:"Grid", displayName:"Grid", prefix grd_
The engine builds the FULL Grid structure from a simplified spec. You provide:
- QuestionType: "Grid", Label, ClientID (prefix grd)
- columns: array of column specs — each needs at minimum: { name, displayName, type, width }
- Supported column types: "string", "number", "currency", "boolean", "date", "StaticText", "MultiChoiceSelectList", "FileAttachment", "RowAggregation"
- For MultiChoiceSelectList columns: include choices: [{Label, Value}] or ["High","Medium","Low"]
- For RowAggregation (computed columns): include aggregationColumnNames: ["QTY","Cost"], rowAggregationType: "multiply"|"sum"
- For currency: optionally include selectedCurrencyFilter: "en-us"
- Optional: rowCount (default 3), gridOptions: { enableFiltering, showAddRowButton, maxHeight }
- The engine auto-generates: columnDefs with full properties, row data (Answer + gridOptions.data + prefillValues in sync), cellTemplates, buttons, all ui-grid boilerplate.
Example:
\`\`\`json
{"QuestionType":"Grid","Label":"Line Items","ClientID":"grdLineItems","columns":[{"name":"Description","displayName":"Description","type":"string","width":"200","validators":{"required":true}},{"name":"QTY","displayName":"QTY","type":"number","width":"75"},{"name":"Price","displayName":"Price","type":"currency","width":"100"},{"name":"Priority","displayName":"Priority","type":"MultiChoiceSelectList","width":"120","choices":["High","Medium","Low"]},{"name":"Total","displayName":"Total","type":"RowAggregation","width":"125","aggregationColumnNames":["QTY","Price"],"rowAggregationType":"multiply"}],"rowCount":3}
\`\`\`

**Grid column width rules:**
- Column widths can be a fixed pixel string like "125" or "200", OR "*" which means flex/auto-expand to fill remaining space.
- At LEAST one column should use width "*" so the grid expands to fill the screen. Typically use "*" for the widest/most flexible column (e.g., Description, Notes) or the last column.
- Good pattern: fixed widths for small columns (number "75", boolean "80", date "125"), "*" for text/description columns.
- NEVER set fixed widths on every column — the grid will look cramped and won't fill the available width.

**Grid aggregation rules:**
- **RowAggregation columns** compute a per-ROW value across 2+ source columns (e.g., Total = QTY × Price). They ONLY make sense with 2+ aggregationColumnNames. NEVER create a RowAggregation that references a single column — it's redundant.
- **Footer aggregation** shows a column-level total at the bottom (e.g., sum of all Amount values). This is set on the column itself with aggregationType: 2, NOT as a separate RowAggregation column. Use \`update-grid-column\` to enable it: updates: { aggregationType: 2, aggregationLabel: " ", footerCellFilter: "intCurrency:\\"en-us\\"" }.
- If the user asks for a "total" of a single column, enable footer aggregation on that column — do NOT add a RowAggregation column.
- Make sure showColumnFooter is true in gridOptions for footer aggregation to be visible (it is by default).

**Grid-specific actions** (for modifying existing Grids):
- \`add-grid-column\` — Add a column to a Grid. Params: formId, fieldIdentifier (Grid's ClientID/Label), column ({name, displayName, type, width, ...}), [afterColumnName].
- \`remove-grid-column\` — Remove a column. Params: formId, fieldIdentifier, columnName.
- \`update-grid-column\` — Update column properties (displayName, width, validators, choices, etc.). Params: formId, fieldIdentifier, columnName, updates.
- \`add-grid-row\` — Add row(s). Params: formId, fieldIdentifier, [rowCount] (default 1), [rowData] (partial data to pre-fill).

**CRITICAL QuestionType values** (use these EXACTLY — the display name differs from the internal type):
- Radio Buttons → QuestionType: "DbRadioButton" (NOT "RadioButtons")
- Checkboxes → QuestionType: "DbCheckbox" (NOT "Checkbox" or "Checkboxes")
- Select List → QuestionType: "DbSelectList" (NOT "SelectList")
- Email → QuestionType: "EmailAddress" (NOT "Email")
- Long Text → QuestionType: "LongText" (NOT "Textarea")
- Short Text → QuestionType: "ShortText"
- Calendar → QuestionType: "Calendar"
- Number → QuestionType: "Number"
- RESTful Element → QuestionType: "RESTfulElement" (NOT "RestfulElement" or "RESTful")
- Grid → QuestionType: "Grid"
- Button → QuestionType: "Button" (type is "FormTool_Type", NOT "Question_Type" — the engine handles this automatically)

**Field Templates — the engine auto-builds full structures.** You only need to provide:
- QuestionType, Label, ClientID (with correct prefix), and any type-specific config (Choices for radio/checkbox/select, validation, restRequest for RESTfulElement).
- The engine fills in all required properties (displayName, show, flex, events, dbSettings, etc.) automatically.
- For RESTfulElement: provide QuestionType:"RESTfulElement", Label, ClientID (prefix rest_), and optionally a restRequest object for pre-configuration.
- For Button: provide QuestionType:"Button", Label, ClientID (prefix btn). Buttons use onClick events (not onChange). The engine sets type:"FormTool_Type" automatically.
- For hidden fields (data buffers): set hidden:true on any field to hide it at runtime. Convention: include "(hidden)" in the Label for builder clarity. Set stopBlurSave:true on fields that change frequently (e.g., pagination cursors).

**RESTful Element restRequest structure** (lives at dbSettings.restRequest):
The engine normalizes whatever you provide, but here is the target schema:
- method: "GET"|"POST"|"PUT"|"DELETE"
- url: full URL string
- headers: array of {key, value, enabled:true, source:"fixed"} OR plain object {"Content-Type":"application/json"} (engine converts)
- queryParams: same format as headers
- auth: {type:"none"|"bearer"|"oauth2", credentialId:"...", grantType:"...", tokenUrl:"...", ...}
- body: {type:"none"|"form"|"raw", contentType:"application/json", raw:"...", urlEncoded:[{key,value,enabled,source}]} OR plain string (engine wraps as raw) OR plain object {amount:"100"} (engine converts to urlEncoded form)
- response: {expectedStatus:[], enableTimeout:false, timeoutDuration:30000, retryOnFailure:false, maxRetries:3, responseMode:"standard"}
- mappings: array of response-to-field mappings. Each: {responsePath:"$.results[*]", mapTo:"field", fieldId:"txtTargetField", serverVariableName:"", filename:{}, contentType:{}}. Use JSONPath syntax for responsePath.
- envVars: array of placeholder substitutions. Each: {key:"__placeholder__", source:"field", fieldId:"txtSourceField", enabled:true}. Placeholders in the request body/URL matching the key are replaced with the field's current value at execution time. Useful for pagination cursors, dynamic parameters, etc.
- restRequestUISettings: {hideProgressIndicator:true} — optional, hides the loading spinner during execution (useful for background/chained requests)

**Response Mappings pattern** (REST → hidden field → script → Grid):
When fetching data from external APIs (Notion, Salesforce, etc.), use this pattern:
1. RESTful Element fetches data, mappings dump response into hidden ShortText fields (data buffers)
2. Hidden field's onChange handler processes the raw data in form script
3. Script populates a Grid or Select List with the processed results
- For paginated APIs: use TWO RESTful Elements — one for initial fetch, one for "get next page" with an envVar placeholder (e.g., __start_cursor__) that resolves from a hidden cursor field. The cursor field's onChange triggers the next-page fetch, creating a self-chaining pagination loop.

**Configuring RESTful Elements:**
- Use \`update-field\` with fieldIdentifier and updates: { dbSettings: { restRequest: { method, url, headers, body, auth } } }.
- If the RESTful Element does NOT exist yet, \`update-field\` will **automatically create it** when the updates contain restRequest config. No need for a separate add-field step.
- NEVER try to configure a RESTful Element by replacing the entire form layout. Always use \`update-field\`.

**Composite Actions (multi-step):**
- \`setup-slack-integration\` — params: slackToken, channelId, [credentialName], [requestName]
- \`setup-stripe-payment\` — params: stripeSecretKey, [credentialName]

**PREFER BUILT-IN CAPABILITIES OVER JAVASCRIPT:**
This is a customer-facing tool. Customers should NOT need JavaScript to maintain their forms. Always prefer Workflow's built-in features:
- **Column sums/totals** → Use footer aggregation (aggregationType: 2 on the column) instead of JS that manually loops and sums
- **Row calculations** (e.g., Qty × Price = Total) → Use RowAggregation column type instead of JS
- **Conditional show/hide** → Use Form Rules (add-rule action) instead of JS onChange handlers that toggle field.show
- **Conditional required/unrequired** → Use Form Rules instead of JS that sets validation.required
- **Grid column footers** → Built-in with showColumnFooter: true + aggregationType: 2
Only use JavaScript when there is NO built-in alternative (e.g., complex API chaining, multi-step data transformations, dynamic grid row manipulation, RESTful Element orchestration, pagination loops). When JavaScript IS needed, keep it minimal and well-commented.

**RULES:**
1. ALWAYS explain what the action will do BEFORE the action block.
2. NEVER include actual secrets/tokens in the action block.
3. You can include MULTIPLE action blocks in one response for sequential setup.
4. Actions auto-execute immediately — the user does NOT need to approve.
5. Use actions when the user asks you to "do", "create", "set up", "configure", "add", "move", "reorganize", etc.
6. Use advice-only (no action block) when the user asks "how do I", "explain", "what is", etc.
7. **SECTION IDENTIFICATION — Use LABELS, not ClientIDs!** All section-related params (sectionClientId, targetSectionClientId, sourceSectionClientId) accept EITHER a ClientID OR a section LABEL. The engine resolves labels automatically (case-insensitive). Examples: "Basic Details", "Pets", "Contact Info". This means you do NOT need get-form-json just to find section IDs — use the label directly. You can also use "Section 1", "Section 2" etc. to reference sections by position (1-based). **CRITICAL: If you call get-form-json first, you MUST use the actual labels from the JSON response, not generic names like "Section 1". Read the Label field from each section in the layout array.**
8. For CONTAINER identification, use the position approach: sourceSectionClientId (use section label!) + sourceContainerIndex (0-based). Example: "the 2nd container in Pets" → sourceSectionClientId: "Pets", sourceContainerIndex: 1.
9. Only use get-form-json when you need to discover what fields/sections/containers exist on the form (e.g., user says "show me the form structure" or you need field ClientIDs you can't infer).
10. For field ClientIDs, infer from naming conventions (txtFirstName, emlEmail, calStartDate, ddlPosition).
11. NEVER fabricate field objects, layouts, or timestamp-based ClientIDs.

## Response Guidelines:
- Always provide specific Workflow API endpoints and external service endpoints
- Include complete code examples (JSON bodies, JavaScript for forms)
- Show the full architecture: which Workflow objects to create, in what order
- For forms, include RESTful Data Element configuration AND JavaScript code
- For processes, include task types, transitions rules, and data mappings
- Explain both the Workflow side AND the external service side of any integration
- When showing Stripe API calls, remember they use application/x-www-form-urlencoded
- When showing Slack Block Kit, include complete block JSON structures
- When the user asks to DO something, include executable action blocks so they can execute with one click

### Form Scripting (intForm API):
The form object is "intForm". NEVER address HTML objects directly.
- formState: "preview" | "runtime" | "completed"
- intForm.getElementByClientID(clientID) — access any field
- intForm.getSectionByClientID(clientID) — access sections
- intForm.events.onSubmit / onSaveDraft — custom submit handlers (REPLACE built-in, must call intForm.submit()/saveDraft())
- intForm.submitButton.enable()/disable(), intForm.saveDraftButton.enable()/disable()
- intForm.recipientTask — TaskName, InstanceSID, InstanceID, Instance.CreatedDate, Instance.LastMilestone
- intForm.generateUniqueID() — for RESTful element request IDs

Field properties (most types): Answer (RW), Label (RW), show (RW), disabled (RW), readonly (RW), class (RW), flex (RW), validation (RW), events (onChange, onFocus, onBlur), ClientID (R), isdirty (R), originalAnswer (R), QuestionType (R)

Special types:
- Calendar: use setAnswer('YYYY-MM-DD') or setAnswer(dateObject), NOT direct Answer assignment. todaysDate = server date.
- Select List: Answer is comma-separated. Choices array has Label/Value. multiple (true/false), multiChoiceAnswer array.
- Checkboxes: Must set BOTH Answer AND Choices[i].Selected=true. Answer is comma-space separated.
- Radio Buttons: Answer is selected value, Choices array.
- Grid: Answer is array of row objects. Use getRowObject() + addRow(). getFooterValues(). gridOptions.data for rows. showDeleteButton(bool), showDeleteColumn(bool).
- File Attachment: Answer is array of File objects. fileAttachmentData for uploaded files.
- Contact Search: Answer is array of user objects (Email, ID, Name, SID, Title, UserName).
- RESTful Element: request.executeRequest(runId), onResponse handler, Server Variables for token persistence.
- Button: events.onClick handler. No Answer property. Use for triggering actions (search, add to cart, clear, submit).

**Form Script patterns (IMPORTANT — follow these exactly):**
- Assign ALL event handlers at the TOP LEVEL of the script. Do NOT wrap in formState checks — the script runs in both preview and runtime.
- Get element references at the top: \`const btnSearch = intForm.getElementByClientID('btnSearch');\`
- Assign click handlers directly: \`btnSearch.events.onClick = async () => { ... };\`
- For RESTful Element execution, generate a shared runId: \`const runId = intForm.generateUniqueID();\`
- Use async/await with try/catch for REST calls: \`await restElement.request.executeRequest(runId);\`
- Grid manipulation: \`grid.getRowObject()\` for new row, \`grid.addRow(row)\`, \`grid.refreshGrid()\`, \`grid.gridOptions.data.splice(0, grid.Answer.length)\` to clear
- Self-executing async IIFE for initialization: \`(async () => { await restElement.request.executeRequest(runId); })();\`

Client ID prefixes (best practice): stxt (ShortText), ltxt (LongText), num (Number), lnk (Link), eml (Email), cal (Calendar), sel (SelectList), chk (Checkboxes), rad (RadioButtons), file (FileAttachment), sig (Signature), cs (ContactSearch), srch (SearchBox), rest (RESTful), grd (Grid), btn (Button)

IMPORTANT: Do NOT mix Form Rules and JavaScript. If using script, handle ALL logic in script.

### Form CSS Styling:
- Add CSS in the Form Builder CSS tab
- Use !important for specificity
- Built-in classes: .int-label, .back-grey, .fcolor-red, .fsize-14, .corner-5, .bord-black, .icon-email
- Key selectors: form, .title-container, .title, .wrapper, .md-input, md-select, .pikadayDatePicker, textarea, .signaturePadCanvas, .md-icon, .md-button, .buttons_bar, int-form-section-dropzone, .ui-grid-*
- Version 8: simplified selectors. Version 7: form-scoped selectors.
- Preview CSS in Preview tab, not the builder

### Form Import/Export:
- Export: Form > Detail > Export (JSON file)
- Import: POST /api/forms/import or POST /api/forms/createWithLayout
- Forms API: POST /api/forms/create, GET /api/forms/search, GET /api/forms/{formSids}, GET /api/forms/{formSid}/questions

### Form Rules (no-code):
- Use the \`add-rule\` action to create rules programmatically. The engine handles all JSON complexity.
- Conditions: field + operator (equals, notEqual, lessThan, greaterThan, contains, doesNotContain, isEmpty, isNotEmpty) + value
- Effects: show, hide, disable, enable, readOnly, editable, required, unrequired, set_answer_with_value, set_answer_with_function
- Targets: question (field) or section (entire collapsible section)
- Logic: "all" (AND — all conditions must be true) or "any" (OR — any condition can be true)
- Inverse rules are auto-generated: flips operators (equal↔notEqual), effects (show↔hide), and logic (any↔all per De Morgan's law)
- Multiple effects per rule: a single rule can show AND require a field, hide a section AND unrequire multiple fields, etc.
- Common patterns: Radio "Yes"/"No" → show/hide comments field; Select List value → show/hide signature; Hidden milestone field → show/hide approval section

### Developer Form:
Custom HTML/JS forms with full control. Tabs: Form Code, View Only Code, Prefill Mappings, Fields To Capture. Use <script id="IntegrifyForm"></script> for helper functions and task variable with prefill data.

### Help Center Reference:
Full documentation at https://www.nutrient.io/workflow-automation/help-center/
Key guides: Forms, Processes, API Information, Development Resources, Permissions`;
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

  $('#recipesBtn').addEventListener('click', showRecipesPanel);
  $('#recipesListBack').addEventListener('click', () => $('#recipesPanel').classList.add('hidden'));

  $('#recipeBack').addEventListener('click', () => $('#recipeViewer').classList.add('hidden'));

  $('#testApiBtn').addEventListener('click', showApiTester);
  $('#testBack').addEventListener('click', () => $('#apiTestPanel').classList.add('hidden'));
  $('#executeTest').addEventListener('click', executeApiTest);

  // Action Log panel
  $('#actionLogBtn').addEventListener('click', showActionLog);
  $('#actionLogBack').addEventListener('click', () => $('#actionLogPanel').classList.add('hidden'));
  $('#logFilter').addEventListener('change', () => renderLogEntries());
  $('#clearLogBtn').addEventListener('click', async () => {
    await actionLog.clear();
    renderLogEntries();
  });
}

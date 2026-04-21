// Workflow Copilot - Background Service Worker

// Only enable the side panel on Workflow pages
const WORKFLOW_URL_PATTERNS = [
  'https://*.on-nutrient.io/*',
  'https://*.integrify.com/*'
];

// Set side panel to only be available on matching URLs
chrome.sidePanel.setOptions({
  enabled: false // disabled globally by default
});

// Enable/disable panel based on tab URL
function updatePanelForTab(tabId, url) {
  const isWorkflow = !!(url && WORKFLOW_URL_PATTERNS.some(pattern => {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(url);
  }));

  chrome.sidePanel.setOptions({
    tabId,
    enabled: isWorkflow,
    path: isWorkflow ? 'src/sidebar/sidebar.html' : undefined
  });
}

// Check on tab update (navigation, URL change)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    updatePanelForTab(tabId, tab.url);
  }
});

// Check when switching tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  updatePanelForTab(tabId, tab.url);
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  const isWorkflow = !!(tab.url && WORKFLOW_URL_PATTERNS.some(pattern => {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(tab.url);
  }));

  if (isWorkflow) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
  // On non-Workflow tabs, clicking the icon does nothing (panel is disabled)
});

// Listen for messages from content script and sidebar
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONTEXT_UPDATE') {
    // Forward context from content script to sidebar
    chrome.runtime.sendMessage({
      type: 'CONTEXT_UPDATE',
      payload: message.payload
    }).catch(() => {
      // Sidebar might not be open yet
    });
  }

  if (message.type === 'GET_CONTEXT') {
    // Sidebar requesting current context from content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CONTEXT' }, (response) => {
          sendResponse(response);
        });
      }
    });
    return true; // async response
  }

  if (message.type === 'EXECUTE_API') {
    // Check if this URL needs to be proxied through the content script (page context)
    // The /core-service/ endpoints require same-origin requests that only work from page context
    const url = message.payload.url || '';
    const needsPageContext = url.includes('/core-service/');

    if (needsPageContext) {
      // Proxy through content script which runs in page context.
      // If the content script isn't available (e.g. page not refreshed after extension reload),
      // programmatically inject it first, then retry.
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
          sendResponse({ success: false, error: 'No active tab found for page-context API call' });
          return;
        }
        const tabId = tabs[0].id;
        const sendViaContentScript = () => {
          chrome.tabs.sendMessage(tabId, {
            type: 'EXECUTE_API_PAGE_CONTEXT',
            payload: message.payload
          }, (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({ success: false, error: 'Content script not available. Please refresh the Workflow page and try again.' });
            } else if (response && response.success) {
              sendResponse(response);
            } else {
              sendResponse({ success: false, error: response?.error || 'Page context API call failed' });
            }
          });
        };
        // Try sending directly first; if it fails, inject the content script and retry
        chrome.tabs.sendMessage(tabId, { type: 'GET_CONTEXT' }, (testResponse) => {
          if (chrome.runtime.lastError) {
            // Content script not loaded — inject it, then retry
            chrome.scripting.executeScript({
              target: { tabId },
              files: ['src/content/context-detector.js']
            }).then(() => {
              sendViaContentScript();
            }).catch(() => {
              sendResponse({ success: false, error: 'Could not inject content script. Please refresh the Workflow page and try again.' });
            });
          } else {
            sendViaContentScript();
          }
        });
      });
    } else {
      // Execute directly from service worker
      executeApiCall(message.payload, sender)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
    }
    return true; // async response
  }

  if (message.type === 'REFRESH_FORM_BUILDER') {
    // Tell content script to click the refresh button in the Form Builder
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'REFRESH_FORM_BUILDER' }, (response) => {
          sendResponse(response);
        });
      }
    });
    return true;
  }
});

async function executeApiCall({ method, url, headers, body }) {
  const fetchOptions = {
    method: method || 'GET',
    headers: headers || {},
    credentials: 'include'
  };

  if (body && method !== 'GET') {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!fetchOptions.headers['Content-Type']) {
      fetchOptions.headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(url, fetchOptions);
  const contentType = response.headers.get('content-type');

  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    data
  };
}

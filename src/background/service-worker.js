// Workflow Copilot - Background Service Worker

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
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
    // Execute API call from sidebar (uses the page's auth cookies)
    executeApiCall(message.payload, sender)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
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

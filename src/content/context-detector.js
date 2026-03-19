// Workflow Copilot - Content Script: Context Detector
// Detects which Workflow admin page the user is on and extracts context

(function () {
  'use strict';

  const CONTEXT_POLL_INTERVAL = 2000;

  function detectContext() {
    const url = window.location.href;
    const path = window.location.pathname;
    const hash = window.location.hash;

    const context = {
      url,
      path,
      hash,
      page: 'unknown',
      section: null,
      entityId: null,
      entityName: null,
      breadcrumbs: [],
      timestamp: Date.now()
    };

    // Extract breadcrumbs from the UI
    const breadcrumbEls = document.querySelectorAll('.breadcrumb a, .v-breadcrumbs a, .breadcrumbs a, nav[aria-label="breadcrumb"] a');
    breadcrumbEls.forEach(el => {
      context.breadcrumbs.push(el.textContent.trim());
    });

    // Detect page from URL patterns
    if (path.includes('/admin/api-index')) {
      context.page = 'api-index';
      context.section = 'API Documentation';
    } else if (path.includes('/api/') && path.includes('/api-docs')) {
      context.page = 'api-docs';
      const match = path.match(/\/api\/([^/]+)\/api-docs/);
      context.section = match ? match[1] : null;
    }

    // Admin pages
    if (path.includes('/admin/')) {
      if (path.includes('/processes') || hash.includes('process')) {
        context.page = 'processes';
        context.section = 'Process Builder';
        context.entityId = extractEntityId('process');
      } else if (path.includes('/forms') || hash.includes('form')) {
        context.page = 'forms';
        context.section = 'Form Builder';
        context.entityId = extractEntityId('form');
      } else if (path.includes('/reports') || hash.includes('report')) {
        context.page = 'reports';
        context.section = 'Reports';
      } else if (path.includes('/users') || hash.includes('user')) {
        context.page = 'users';
        context.section = 'User Management';
      } else if (path.includes('/groups') || hash.includes('group')) {
        context.page = 'groups';
        context.section = 'Group Management';
      } else if (path.includes('/categories') || hash.includes('categor')) {
        context.page = 'categories';
        context.section = 'Categories';
      } else if (path.includes('/dashboard') || hash.includes('dashboard')) {
        context.page = 'dashboards';
        context.section = 'Dashboards';
      } else if (path.includes('/settings') || hash.includes('setting')) {
        context.page = 'settings';
        context.section = 'Settings';
      }
    }

    // Action pages
    if (path.includes('/request') || hash.includes('request')) {
      context.page = 'requests';
      context.section = 'Requests';
    } else if (path.includes('/task') || hash.includes('task')) {
      context.page = 'tasks';
      context.section = 'Tasks';
    }

    // Try to extract entity name from page title or header
    const pageTitle = document.querySelector('h1, .page-title, .v-toolbar__title');
    if (pageTitle) {
      context.entityName = pageTitle.textContent.trim();
    }

    // Detect form builder specifics
    if (context.page === 'forms') {
      context.formContext = detectFormContext();
    }

    // Detect process builder specifics
    if (context.page === 'processes') {
      context.processContext = detectProcessContext();
    }

    return context;
  }

  function extractEntityId(type) {
    const url = window.location.href;
    const hash = window.location.hash;

    // Try URL patterns
    const patterns = [
      new RegExp(`${type}[_-]?[Ss]id=([\\w-]+)`),
      new RegExp(`${type}[_-]?[Gg]uid=([\\w-]+)`),
      new RegExp(`/${type}s?/([\\w-]+)`),
      /sid=([a-f0-9-]+)/i,
      /guid=([a-f0-9-]+)/i
    ];

    for (const pattern of patterns) {
      const match = (url + hash).match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  function detectFormContext() {
    const formContext = {
      isEditing: false,
      hasRestfulElements: false,
      fieldCount: 0,
      restfulElementCount: 0
    };

    // Look for form builder indicators
    const formFields = document.querySelectorAll('[class*="field"], [class*="element"], [data-type]');
    formContext.fieldCount = formFields.length;

    // Look for RESTful data elements
    const restfulElements = document.querySelectorAll(
      '[class*="restful"], [class*="rest-"], [data-type*="rest"], [data-type*="api"]'
    );
    formContext.restfulElementCount = restfulElements.length;
    formContext.hasRestfulElements = restfulElements.length > 0;

    // Check if in edit mode
    const editIndicators = document.querySelectorAll(
      '[class*="edit"], [class*="designer"], [class*="builder"], .form-designer'
    );
    formContext.isEditing = editIndicators.length > 0;

    return formContext;
  }

  function detectProcessContext() {
    const processContext = {
      isEditing: false,
      taskCount: 0,
      hasDiagram: false,
      currentTab: null
    };

    // Look for process diagram
    const diagram = document.querySelector('[class*="diagram"], canvas, svg[class*="process"]');
    processContext.hasDiagram = !!diagram;

    // Look for tasks
    const tasks = document.querySelectorAll('[class*="task"], [class*="node"]');
    processContext.taskCount = tasks.length;

    // Detect current tab/section in process builder
    const activeTab = document.querySelector('[class*="tab"][class*="active"], .v-tab--active');
    if (activeTab) {
      processContext.currentTab = activeTab.textContent.trim();
    }

    return processContext;
  }

  // Send context updates to background script
  let lastContext = null;

  function sendContextUpdate() {
    const context = detectContext();
    const contextStr = JSON.stringify(context);

    // Only send if context changed
    if (contextStr !== lastContext) {
      lastContext = contextStr;
      try {
        chrome.runtime.sendMessage({
          type: 'CONTEXT_UPDATE',
          payload: context
        }).catch(() => {
          // Extension might not be ready
        });
      } catch (e) {
        // Extension context invalidated (e.g., after reload) — stop polling
        clearInterval(contextPollTimer);
      }
    }
  }

  // Poll for context changes
  const contextPollTimer = setInterval(sendContextUpdate, CONTEXT_POLL_INTERVAL);
  sendContextUpdate();

  // Also detect on URL changes (SPA navigation)
  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      sendContextUpdate();
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });

  // Respond to context requests and actions from sidebar
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_CONTEXT') {
      sendResponse(detectContext());
    }

    if (message.type === 'REFRESH_FORM_BUILDER') {
      try {
        // The Form Builder lives inside ngWidgetIframe
        const iframe = document.getElementById('ngWidgetIframe');
        if (iframe) {
          const iDoc = iframe.contentDocument || iframe.contentWindow.document;
          // Find the refresh button: ng-click="::vm.openPowerform()" with "refresh" icon
          const refreshBtn = iDoc.querySelector('[ng-click*="openPowerform"]');
          if (refreshBtn) {
            refreshBtn.click();
            sendResponse({ success: true });
            return;
          }
        }
        sendResponse({ success: false, error: 'Refresh button not found' });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    }
  });

  // Inject subtle indicator that copilot is active
  const indicator = document.createElement('div');
  indicator.id = 'workflow-copilot-indicator';
  indicator.title = 'Workflow Copilot is active';
  document.body.appendChild(indicator);
})();

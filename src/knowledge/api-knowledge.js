// Workflow Copilot - API Knowledge Base
// Complete catalog of 508 Nutrient Workflow API endpoints with enriched guidance

export const API_SERVICES = {
  auth: {
    title: 'Auth Service',
    baseUrl: '/api/auth',
    description: 'Authentication, sessions, API keys, SSO/SAML, OAuth2, MFA, and role management',
    tags: ['auth', 'jwt', 'mfa', 'loginLockout', 'reset', 'admin', 'apiKeys', 'envToken', 'sso', 'ssoSettings', 'oauth2', 'change', 'track'],
    commonUseCases: [
      'Set up API key authentication for external integrations',
      'Configure SSO/SAML for enterprise login',
      'Impersonate users for testing or automation',
      'Manage MFA devices for users',
      'Create OAuth2 flows for third-party apps'
    ]
  },
  dashboards: {
    title: 'Dashboard Service',
    baseUrl: '/api/dashboards',
    description: 'Create, update, copy, and manage workflow dashboards and their widgets',
    tags: ['dashboards'],
    commonUseCases: [
      'Create custom dashboards for different teams',
      'Copy existing dashboards as templates',
      'Migrate legacy dashboards to new format'
    ]
  },
  files: {
    title: 'Files Service',
    baseUrl: '/api/files',
    description: 'File upload/download, Document Engine integration, template library management',
    tags: ['files', 'templates'],
    commonUseCases: [
      'Upload attachments to workflow instances',
      'Manage document templates for generation',
      'Preview documents via Document Engine',
      'Copy/move files between contexts'
    ]
  },
  forms: {
    title: 'Forms Service',
    baseUrl: '/api/forms',
    description: 'Create, import, search, and manage workflow forms and their questions',
    tags: ['forms'],
    commonUseCases: [
      'Create new forms programmatically',
      'Import forms with layout definitions',
      'Search existing forms for reuse',
      'Get form questions for data mapping'
    ]
  },
  instance: {
    title: 'Instance Service',
    baseUrl: '/api/instance',
    description: 'Manage running workflow instances (requests), tasks, approvals, data containers, and comments',
    tags: ['instances', 'InstanceRecipientTasks', 'tasks', 'tasktypes', 'members', 'instanceContact'],
    commonUseCases: [
      'Start a new workflow instance programmatically',
      'Complete approval tasks via API',
      'Submit data container fields',
      'Reassign tasks to different users',
      'Query and filter running instances',
      'Add/remove task recipients dynamically'
    ]
  },
  integrations: {
    title: 'Integrations Service',
    baseUrl: '/api/integrations',
    description: 'Database connections, custom tables, RESTful request definitions, AI connections, and credential management',
    tags: ['connections', 'custom tables', 'transactions', 'aiconnections', 'restfulrequests', 'credentials', 'feedback'],
    commonUseCases: [
      'Set up database connections for data lookups',
      'Create and manage RESTful request definitions',
      'Store and manage API credentials securely',
      'Configure AI connections (OpenAI/Anthropic)',
      'Build custom data tables for workflow storage',
      'Execute RESTful requests from workflows'
    ]
  },
  processes: {
    title: 'Process Service',
    baseUrl: '/api/processes',
    description: 'Full process lifecycle: create, configure tasks, rules, transitions, conditions, recipients, mappings, KPIs, and diagrams',
    tags: ['processes', 'tasktypes', 'process tasks', 'processTaskConfigMappings', 'processTaskConfigAttributes', 'processTaskRecipients', 'process', 'processTaskRules', 'request detail layout', 'processAttachments', 'processDetail', 'kpis', 'rule props', 'mappings', 'taskParameters', 'taskConfigSettings'],
    commonUseCases: [
      'Create a new workflow process',
      'Add and configure tasks in a process',
      'Set up transition rules between tasks',
      'Configure task recipients and assignment logic',
      'Set up data mappings (prefills) between tasks',
      'Define KPIs for process monitoring',
      'Export/import/version processes'
    ]
  },
  reports: {
    title: 'Report Service',
    baseUrl: '/api/reports',
    description: 'Create, run, export reports; permissions reporting; KPI and instance statistics',
    tags: ['reports', 'kpis', 'mappings', 'stats'],
    commonUseCases: [
      'Create custom reports on workflow data',
      'Run and export report data (CSV/Excel)',
      'Audit permissions across the system',
      'View instance statistics and KPIs'
    ]
  },
  settings: {
    title: 'Settings Service',
    baseUrl: '/api/settings',
    description: 'System configuration, business hours, holidays, password policies, feature flags, and notifications',
    tags: ['biztimes', 'holidays', 'passwordSettings', 'system configuration', 'system management', 'systemMessages', 'utilities'],
    commonUseCases: [
      'Configure business hours for SLA calculations',
      'Manage holiday calendars',
      'Set password policies',
      'Send system notifications',
      'Check feature flags and system versions'
    ]
  },
  'task-dispatcher': {
    title: 'Task Dispatcher Service',
    baseUrl: '/api/task-dispatcher',
    description: 'Task execution engine, electronic signatures, document generation, AI-powered approvals',
    tags: ['task-dispatcher', 'electronic-signature', 'files', 'utils', 'documentsigning', 'documentgeneration', 'ai-approval', 'ai-approval-conversations'],
    commonUseCases: [
      'Configure task type settings (REST client, email, script, etc.)',
      'Execute tasks programmatically',
      'Set up electronic signature workflows',
      'Configure AI-powered approval analysis',
      'Generate documents from templates',
      'Test task configurations before deployment'
    ]
  },
  tenant: {
    title: 'Tenant Service',
    baseUrl: '/api/tenant',
    description: 'Tenant management, licensing, languages/translations, stream management',
    tags: ['tenant', 'tenants', 'stream-manager', 'sessions', 'translations', 'languages', 'logo', 'packs'],
    commonUseCases: [
      'Check tenant license information',
      'Manage language translations',
      'Monitor active sessions',
      'Configure language packs'
    ]
  },
  user: {
    title: 'User & Group Services',
    baseUrl: '/api/user',
    description: 'User CRUD, group management, LDAP/DB sync, org chart, messaging, and preferences',
    tags: ['users', 'import', 'groups', 'messages', 'preferences'],
    commonUseCases: [
      'Create/update users programmatically',
      'Set up LDAP or database user sync',
      'Manage group membership',
      'Search users by permissions',
      'Configure user preferences',
      'View org chart data'
    ]
  }
};

// Integration Recipes - Multi-step API workflows for common tasks
export const RECIPES = {
  'setup-rest-integration': {
    title: 'Set Up a REST API Integration',
    description: 'Connect your workflow to an external REST API service (e.g., Salesforce, Slack, custom API)',
    category: 'integrations',
    difficulty: 'intermediate',
    steps: [
      {
        title: 'Create credentials for the external API',
        description: 'Store your API key, token, or OAuth credentials securely',
        endpoint: 'POST /api/integrations/credentials/create',
        example: {
          body: {
            name: 'Salesforce API Token',
            resourceKind: 'restful-request',
            valueType: 'bearer-token',
            value: 'your-api-token-here',
            scope: { ambient: 'tenant' }
          }
        },
        notes: 'Credentials are encrypted at rest. Use ambient scope "tenant" for shared credentials, or specify user/process/task scope for narrower access.'
      },
      {
        title: 'Create a RESTful Request definition',
        description: 'Define the HTTP request to the external API',
        endpoint: 'POST /api/integrations/restful-requests',
        example: {
          body: {
            name: 'Get Salesforce Account',
            method: 'GET',
            url: 'https://your-instance.salesforce.com/services/data/v58.0/sobjects/Account/{accountId}',
            headers: {
              'Authorization': 'Bearer {{credential:salesforce-token}}',
              'Content-Type': 'application/json'
            }
          }
        },
        notes: 'Use {{credential:name}} syntax to reference stored credentials. URL parameters in {braces} become input variables.'
      },
      {
        title: 'Configure the REST Client task in your process',
        description: 'Add a REST Client task to your process and configure its inputs/outputs',
        endpoint: 'POST /api/task-dispatcher/restClient/{processTaskSid}/config/settings',
        notes: 'Link the RESTful Request definition to a process task. Map process data to request parameters and response fields to process data.'
      },
      {
        title: 'Set up data mappings for the task',
        description: 'Map input data from earlier tasks to the REST call, and map response data to later tasks',
        endpoint: 'POST /api/processes/processTask/{processTaskSid}/mappings',
        notes: 'Mappings connect data between tasks. Source can be form fields, previous task outputs, instance data, or fixed values.'
      },
      {
        title: 'Test the configuration',
        description: 'Execute a test run of the REST client task',
        endpoint: 'POST /api/task-dispatcher/restClient/{processTaskSid}/test',
        notes: 'Always test before deploying. Provide sample input data to verify the request and response mapping work correctly.'
      }
    ]
  },

  'setup-restful-form-element': {
    title: 'Configure RESTful Data Element on a Form',
    description: 'Set up a form element that pulls data from an external REST API (dropdown, auto-fill, cascading lookups)',
    category: 'forms',
    difficulty: 'intermediate',
    steps: [
      {
        title: 'Create credentials (if needed)',
        description: 'Store API credentials for the external service',
        endpoint: 'POST /api/integrations/credentials/create',
        notes: 'Skip if using an unauthenticated API. For Bearer tokens, API keys, or Basic auth, store credentials here first.'
      },
      {
        title: 'Add a RESTful Data Element to your form',
        description: 'In the Form Builder, drag a RESTful Data Element onto the form canvas',
        manual: true,
        notes: 'RESTful Data Elements are found in the form toolbox. They can power dropdowns, auto-fill fields, or cascading lookups.'
      },
      {
        title: 'Configure the request',
        description: 'Set up the HTTP request within the element',
        manual: true,
        config: {
          method: 'GET (most common for lookups)',
          url: 'https://api.example.com/customers?search={searchTerm}',
          valueSources: {
            fixed: 'Static text like "application/json" for headers',
            formField: 'Dynamic values from other form elements (with test values for design time)',
            credential: 'Encrypted API keys/tokens from credential center',
            serverVariable: 'Data from previous API calls within the same form'
          },
          headers: {
            'Authorization': 'Bearer {{credential}}',
            'Content-Type': 'application/json'
          },
          queryParameters: 'Appended to URL: ?customerId=12345',
          authTypes: ['None', 'Basic', 'Bearer Token', 'API Key', 'OAuth2']
        }
      },
      {
        title: 'Configure response mapping',
        description: 'Use JSONata expressions to map API response data to form destinations',
        manual: true,
        config: {
          jsonataExamples: [
            '$.data - Extract data property from response',
            '$.items[*] - Extract all items from an array',
            '$.user.name - Navigate nested objects',
            '$.results[status="active"] - Filter results',
            '$.items{ $.id : $.name } - Create key-value pairs for dropdowns'
          ]
        },
        notes: 'JSONata is a powerful query language for JSON. The mapping determines what data appears in your form element.'
      },
      {
        title: 'Set up chaining (optional)',
        description: 'Chain multiple API calls using onResponse events',
        manual: true,
        code: `// In form JavaScript:
var element = intForm.getElementByClientID('customerLookup');
var runId = intForm.generateUniqueID();

// Execute first request
await element.request.executeRequest(runId);

// In onResponse handler, trigger second request
element.request.onResponse(function(response) {
  var detailElement = intForm.getElementByClientID('customerDetails');
  var runId2 = intForm.generateUniqueID();
  // Use data from first response as input to second
  intForm.setElementValue('customerId', response.data.id);
  detailElement.request.executeRequest(runId2);
});`,
        notes: 'Server Variables let you persist data (like auth tokens) across multiple API calls within the same form session.'
      },
      {
        title: 'Test the element',
        description: 'Use the Test Request button in the form designer to verify the configuration',
        manual: true,
        notes: 'Set test values for form fields and server variables. Check browser console for request/response details. Implement try-catch for error handling.'
      }
    ]
  },

  'setup-db-connection': {
    title: 'Set Up a Database Connection',
    description: 'Connect Workflow to an external database for lookups, data storage, or reporting',
    category: 'integrations',
    difficulty: 'intermediate',
    steps: [
      {
        title: 'Test the database connection',
        description: 'Verify connectivity before creating the connection',
        endpoint: 'POST /api/integrations/connections/database/test',
        example: {
          params: {
            serverName: 'your-db-server.example.com',
            databaseName: 'WorkflowData',
            provider: 'mssql',
            encrypt: true,
            trustServerCertificate: false
          }
        }
      },
      {
        title: 'Create the database connection',
        description: 'Register the connection in Workflow',
        endpoint: 'POST /api/integrations/connections',
        notes: 'Supports MSSQL, MySQL, PostgreSQL, Oracle. Connection strings are encrypted.'
      },
      {
        title: 'Create custom tables (optional)',
        description: 'Create custom tables within the connection for workflow data storage',
        endpoint: 'POST /api/integrations/customtable/{connectionId}/schemas/{tableName}',
        notes: 'Custom tables are useful for storing workflow-specific data that doesn\'t exist in external systems.'
      }
    ]
  },

  'setup-ai-connection': {
    title: 'Set Up an AI Connection',
    description: 'Connect Workflow to OpenAI or Anthropic for AI-powered features',
    category: 'integrations',
    difficulty: 'beginner',
    steps: [
      {
        title: 'Create the AI connection',
        description: 'Register an AI provider connection',
        endpoint: 'POST /api/integrations/ai/connections',
        example: {
          body: {
            name: 'OpenAI GPT-4',
            provider: 'openai',
            params: {
              model: 'gpt-4',
              apiKey: 'sk-...'
            }
          }
        },
        notes: 'Supports OpenAI and Anthropic providers. Used by AI approval analysis, form builder AI, and other AI features.'
      },
      {
        title: 'Configure AI approval (optional)',
        description: 'Set up AI-powered approval analysis for approval tasks',
        endpoint: 'POST /api/task-dispatcher/ai/approval/analyze',
        notes: 'AI analyzes approval requests and provides recommendations. Supports learning from user overrides.'
      }
    ]
  },

  'automate-process-start': {
    title: 'Start Workflow Instances Programmatically',
    description: 'Trigger workflow processes from external systems via API',
    category: 'instance',
    difficulty: 'beginner',
    steps: [
      {
        title: 'Get API key for authentication',
        description: 'Create an API key to authenticate external calls',
        endpoint: 'POST /api/auth/apikey',
        notes: 'API keys can impersonate specific users. Consider which user context the workflow should run under.'
      },
      {
        title: 'Find the process SID',
        description: 'Search for the process you want to start',
        endpoint: 'GET /api/processes/search',
        example: {
          params: { search: 'Purchase Request' }
        }
      },
      {
        title: 'Start a new instance',
        description: 'Create a workflow instance with initial data',
        endpoint: 'POST /api/instance/start/{processSid}',
        example: {
          params: {
            processSid: 'your-process-sid',
            requestName: 'Auto-generated Purchase Request'
          },
          body: {
            'field1': 'value1',
            'field2': 'value2'
          }
        },
        notes: 'The body contains initial data for the first task. Field names must match the process task mappings.'
      }
    ]
  },

  'setup-user-sync': {
    title: 'Set Up User Sync (LDAP/Database)',
    description: 'Automatically sync users from Active Directory, LDAP, or a database',
    category: 'users',
    difficulty: 'advanced',
    steps: [
      {
        title: 'Test the connection',
        description: 'Verify LDAP or database connectivity',
        endpoint: 'POST /api/user/sync/test/ldap (or /test/database)',
        notes: 'Test connectivity before creating the sync configuration.'
      },
      {
        title: 'Create sync configuration',
        description: 'Set up the sync profile with field mappings',
        endpoint: 'POST /api/user/sync',
        notes: 'Map external fields to Workflow user properties. Configure sync schedule and conflict resolution.'
      },
      {
        title: 'Preview the sync',
        description: 'Dry-run to see what changes would be made',
        endpoint: 'POST /api/user/sync/{id}/preview',
        notes: 'Always preview before running. Shows creates, updates, and potential conflicts.'
      },
      {
        title: 'Execute the sync',
        description: 'Run the actual synchronization',
        endpoint: 'POST /api/user/sync/{id}/run',
        notes: 'Monitor the run status. Resolve any conflicts that arise.'
      }
    ]
  },

  'setup-webhooks-via-rest-task': {
    title: 'Set Up Webhooks (Task Completion Triggers)',
    description: 'Notify external systems when workflow events occur using REST Client tasks',
    category: 'processes',
    difficulty: 'intermediate',
    steps: [
      {
        title: 'Create credentials for the webhook endpoint',
        endpoint: 'POST /api/integrations/credentials/create',
        notes: 'Store any authentication tokens needed for the webhook receiver.'
      },
      {
        title: 'Create a RESTful Request for the webhook',
        endpoint: 'POST /api/integrations/restful-requests',
        example: {
          body: {
            name: 'Slack Notification Webhook',
            method: 'POST',
            url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
            headers: { 'Content-Type': 'application/json' },
            body: '{"text": "Task {{taskName}} completed by {{userName}}"}'
          }
        }
      },
      {
        title: 'Add a REST Client task to the process',
        description: 'Place it after the task that should trigger the webhook',
        notes: 'Use transitions to fire the REST Client task when the preceding task completes. Map task data to the webhook payload.'
      }
    ]
  },

  'cascading-form-lookups': {
    title: 'Build Cascading Form Lookups',
    description: 'Create dependent dropdowns (e.g., Country → State → City) using RESTful Data Elements',
    category: 'forms',
    difficulty: 'advanced',
    steps: [
      {
        title: 'Create the parent dropdown (Country)',
        manual: true,
        description: 'Add a RESTful Data Element configured to fetch countries',
        config: {
          method: 'GET',
          url: 'https://api.example.com/countries',
          responseMapping: '$.data{ $.code : $.name }',
          triggerOn: 'form load'
        }
      },
      {
        title: 'Create the child dropdown (State)',
        manual: true,
        description: 'Add a RESTful Data Element that depends on the Country selection',
        config: {
          method: 'GET',
          url: 'https://api.example.com/states?country={countryCode}',
          valueSources: {
            countryCode: { type: 'formField', fieldClientId: 'country' }
          },
          responseMapping: '$.data{ $.code : $.name }',
          triggerOn: 'Country field change'
        }
      },
      {
        title: 'Wire up the cascade with JavaScript',
        manual: true,
        code: `// On Country change, execute State lookup
intForm.getElementByClientID('country').onChange(function(value) {
  var stateElement = intForm.getElementByClientID('state');
  var runId = intForm.generateUniqueID();
  stateElement.request.executeRequest(runId);
});

// On State change, execute City lookup
intForm.getElementByClientID('state').onChange(function(value) {
  var cityElement = intForm.getElementByClientID('city');
  var runId = intForm.generateUniqueID();
  cityElement.request.executeRequest(runId);
});`,
        notes: 'Each dropdown clears its children when it changes. Server Variables can cache auth tokens across all three calls.'
      }
    ]
  }
};

// Context-aware suggestions based on which admin page the user is on
export const CONTEXT_SUGGESTIONS = {
  'api-index': {
    greeting: "You're viewing the API Index. I can help you understand any of the 508 endpoints and how they work together.",
    suggestions: [
      'Which API should I use to connect to an external service?',
      'How do I authenticate API calls?',
      'Show me integration recipes for common setups'
    ]
  },
  processes: {
    greeting: "You're in the Process Builder. I can help with task configuration, rules, transitions, and API integration.",
    suggestions: [
      'How do I add a REST Client task to call an external API?',
      'How do I set up transition rules between tasks?',
      'How do I configure data mappings between tasks?',
      'How do I set up task recipient assignment rules?',
      'Add a Database Pull task to query an external SQL table',
      'Configure a Document Generation task with merge field mappings',
      'Set up an approval task with escalation after 48 hours',
      'Create a parallel branch for simultaneous review and notification',
      'How do I send an email notification from a process task?',
      'How do I configure a webhook to trigger this process externally?'
    ],
    relevantServices: ['processes', 'task-dispatcher', 'integrations'],
    relevantRecipes: ['setup-rest-integration', 'setup-webhooks-via-rest-task']
  },
  forms: {
    greeting: "You're in the Form Builder. I can help add fields, set up rules, adjust layouts, configure RESTful elements, and more.",
    suggestions: [
      'Add a text field called "Employee Name" and a date field for "Start Date"',
      'Create a select list for Department with options: Engineering, HR, Sales, Finance',
      'Set up a rule: when Department is "Engineering" show the "Tech Stack" field',
      'Add a grid/table for listing line items with columns for Description, Qty, and Price',
      'Use JavaScript to auto-calculate a Total field from Quantity × Unit Price',
      'Rearrange the form layout to put Name and Email side by side in one row',
      'Make the "Manager Approval" section only visible when Amount is over 5000',
      'Set up a RESTful Data Element to pull customer data from an external API',
      'Create cascading dropdowns: Country → State → City',
      'Add validation: Email field must match a company domain pattern',
      'Hide the "Budget Code" field until "Needs Budget" checkbox is checked',
      'Add a multi-line text area for Comments with a 500-character limit'
    ],
    relevantServices: ['forms', 'integrations'],
    relevantRecipes: ['setup-restful-form-element', 'cascading-form-lookups']
  },
  users: {
    greeting: "You're in User Management. I can help with user sync, group management, and permission configuration.",
    suggestions: [
      'How do I set up LDAP user sync?',
      'How do I import users from a database?',
      'How do I manage group membership via API?'
    ],
    relevantServices: ['user', 'auth'],
    relevantRecipes: ['setup-user-sync']
  },
  settings: {
    greeting: "You're in Settings. I can help configure business hours, holidays, and system settings.",
    suggestions: [
      'How do I configure business hours for SLA calculations?',
      'How do I manage holiday calendars?',
      'How do I check feature flags?'
    ],
    relevantServices: ['settings', 'tenant']
  },
  dashboards: {
    greeting: "You're in Dashboards. I can help create and configure dashboard widgets.",
    suggestions: [
      'How do I create a dashboard via API?',
      'How do I copy an existing dashboard?',
      'How do I add a widget to a dashboard?',
      'How do I configure dashboard filters?',
      'How do I embed a dashboard in an external app?',
      'How do I set dashboard permissions?',
      'How do I export dashboard data?'
    ],
    relevantServices: ['dashboards']
  },
  reports: {
    greeting: "You're in Reports. I can help create, run, and export reports.",
    suggestions: [
      'How do I create a report via API?',
      'How do I run and export report data?',
      'How do I audit permissions?'
    ],
    relevantServices: ['reports']
  },
  requests: {
    greeting: "You're viewing Requests (workflow instances). I can help manage running workflows.",
    suggestions: [
      'How do I start a workflow instance via API?',
      'How do I complete a task programmatically?',
      'How do I reassign a task?'
    ],
    relevantServices: ['instance', 'task-dispatcher'],
    relevantRecipes: ['automate-process-start']
  },
  tasks: {
    greeting: "You're viewing Tasks. I can help with task management and completion.",
    suggestions: [
      'How do I complete an approval task via API?',
      'How do I submit a data container task?',
      'How do I reassign this task?'
    ],
    relevantServices: ['instance', 'task-dispatcher']
  },
  unknown: {
    greeting: "Welcome to Workflow Copilot! I can help you build forms, configure processes, set up integrations, and navigate the 508 Workflow API endpoints.",
    suggestions: [
      'Set up a REST API integration',
      'Configure RESTful Data Elements on a form',
      'Start workflow instances from an external system',
      'Connect to an external database',
      'Set up an AI connection',
      'Build an employee onboarding form with multiple sections',
      'Create a document generation process from form data',
      'Set up approval routing based on form field values',
      'How do I configure a Database Pull task?',
      'Show me integration recipes for common setups'
    ]
  }
};

// RESTful Data Element specific knowledge
export const RESTFUL_ELEMENT_GUIDE = {
  overview: 'RESTful Data Elements connect forms to external REST APIs. All requests execute server-side, bypassing CORS restrictions and keeping credentials secure.',

  valueSources: {
    fixed: {
      description: 'Static text value',
      examples: ['application/json', 'Bearer sk-xxx', 'https://api.example.com'],
      useCase: 'Headers, content types, static URLs'
    },
    formField: {
      description: 'Dynamic value from another form element',
      examples: ['Customer ID from a text field', 'Selected value from a dropdown'],
      useCase: 'Parameterized queries, search filters',
      tip: 'Set test values during design for testing without a live form'
    },
    credential: {
      description: 'Encrypted value from the Credential Center',
      examples: ['API keys', 'Bearer tokens', 'Basic auth username/password'],
      useCase: 'Authentication headers and query params',
      tip: 'Always use credentials for sensitive values - never hardcode tokens'
    },
    serverVariable: {
      description: 'Data persisted from a previous API call within the same form',
      examples: ['Auth token from a login call', 'Customer ID from a lookup call'],
      useCase: 'Multi-step API flows, token caching',
      tip: 'Variables must have unique names within the form. Set expiry for tokens.'
    }
  },

  authTypes: {
    none: 'No authentication required',
    basic: 'Username and password (Base64 encoded)',
    bearer: 'Bearer token in Authorization header',
    apiKey: 'API key in header or query parameter',
    oauth2: 'OAuth 2.0 flow for third-party services'
  },

  responseMapping: {
    description: 'Use JSONata expressions to extract data from API responses',
    examples: [
      { expression: '$.data', description: 'Extract the "data" property' },
      { expression: '$.items[*]', description: 'Extract all items from an array' },
      { expression: '$.user.name', description: 'Navigate nested objects' },
      { expression: '$.results[status="active"]', description: 'Filter results by condition' },
      { expression: '$.items{ $.id : $.name }', description: 'Create key-value pairs (great for dropdowns)' },
      { expression: '$.data[0].attributes.email', description: 'Access specific array element and nested property' },
      { expression: '$count($.items)', description: 'Count items in response' },
      { expression: '$.items^(>name)', description: 'Sort items by name descending' }
    ]
  },

  chaining: {
    description: 'Execute multiple API calls in sequence, passing data between them',
    pattern: `// Step 1: Execute first API call
var element1 = intForm.getElementByClientID('authRequest');
var runId1 = intForm.generateUniqueID();
await element1.request.executeRequest(runId1);

// Step 2: On response, store token and execute second call
element1.request.onResponse(function(response) {
  // Token is auto-stored as server variable if configured
  var element2 = intForm.getElementByClientID('dataRequest');
  var runId2 = intForm.generateUniqueID();
  element2.request.executeRequest(runId2);
});`,
    tips: [
      'Use Server Variables to pass auth tokens between chained calls',
      'Set expiry on Server Variables for tokens with TTL',
      'Use try-catch blocks for error handling',
      'Check browser console for debugging request/response data'
    ]
  },

  troubleshooting: [
    { issue: 'Request fails with 401', fix: 'Check credential configuration. Ensure the credential is accessible at the correct scope (tenant/process/task). Verify token hasn\'t expired.' },
    { issue: 'Response mapping returns empty', fix: 'Verify JSONata expression matches the actual response structure. Use Test Request to see raw response. Try $.** to see all available paths.' },
    { issue: 'Dropdown shows [object Object]', fix: 'Your JSONata expression returns objects instead of strings. Map to specific properties: $.items{ $.id : $.name }' },
    { issue: 'Chained request doesn\'t fire', fix: 'Ensure onResponse handler is registered before executeRequest. Verify the server variable name matches between requests.' },
    { issue: 'Form field value not passed to request', fix: 'Check the Client ID of the source field matches. Ensure test values are set for design-time testing.' }
  ]
};

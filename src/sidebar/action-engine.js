// ── Workflow Copilot Action Engine ──
// Handles executable actions: parses AI responses for action blocks,
// shows confirmation UI, executes multi-step API sequences, and reports results.

// ── Action Registry ──
// Each action defines: id, label, description, steps[] (API calls), and optional validation
// Helper: find section by ClientID OR Label (case-insensitive)
function findSection(layout, identifier) {
  if (!identifier) return null;
  // Try exact ClientID first
  let section = layout.find(s => s.ClientID === identifier);
  if (section) return section;
  // Try label match (case-insensitive)
  const lower = identifier.toLowerCase();
  section = layout.find(s => s.Label && s.Label.toLowerCase() === lower);
  if (section) return section;
  // Try partial label match
  section = layout.find(s => s.Label && s.Label.toLowerCase().includes(lower));
  return section || null;
}

const ACTION_REGISTRY = {

  // ═══════════════════════════════════════
  // LEVEL 1: API Actions
  // ═══════════════════════════════════════

  'create-credential': {
    id: 'create-credential',
    label: 'Create Credential',
    category: 'credentials',
    level: 1,
    description: 'Create a new credential in the Credential Center',
    requiredParams: ['name', 'valueType', 'value'],
    optionalParams: ['resourceKind', 'scope'],
    steps: [
      {
        name: 'Create credential',
        method: 'POST',
        path: '/api/integrations/credentials/create',
        buildBody: (params) => ({
          name: params.name,
          resourceKind: params.resourceKind || 'restful-request',
          valueType: params.valueType, // 'bearer-token', 'apiKey', 'username-password'
          value: params.value,
          scope: params.scope || { ambient: 'tenant' }
        })
      }
    ]
  },

  'create-restful-request': {
    id: 'create-restful-request',
    label: 'Create RESTful Request Definition',
    category: 'integrations',
    level: 1,
    description: 'Create a reusable RESTful request definition',
    requiredParams: ['name', 'method', 'url'],
    optionalParams: ['headers', 'body', 'auth', 'description'],
    steps: [
      {
        name: 'Create RESTful request',
        method: 'POST',
        path: '/api/integrations/restful-requests/create',
        buildBody: (params) => ({
          name: params.name,
          description: params.description || '',
          request: {
            method: params.method,
            url: params.url,
            validateSSL: params.validateSSL !== false,
            followRedirects: true,
            maxRedirects: 5,
            persistCookies: false,
            headers: params.headers || [],
            queryParams: params.queryParams || [],
            auth: params.auth || { type: 'none', credentialId: '' },
            body: params.body || { type: 'none', contentType: 'application/json', raw: '', formData: [], urlEncoded: [] },
            response: { expectedStatus: [], enableTimeout: false, timeoutDuration: 30000, retryOnFailure: false, maxRetries: 3, responseMode: 'standard' },
            mappings: params.mappings || [],
            envVars: params.envVars || []
          }
        })
      }
    ]
  },

  'start-workflow-instance': {
    id: 'start-workflow-instance',
    label: 'Start Workflow Instance',
    category: 'instances',
    level: 1,
    description: 'Start a new workflow/process instance',
    requiredParams: ['processSid'],
    optionalParams: ['subject', 'priority', 'prefills'],
    steps: [
      {
        name: 'Start instance',
        method: 'POST',
        path: '/api/instances/start',
        buildBody: (params) => ({
          processSid: params.processSid,
          subject: params.subject || '',
          priority: params.priority || 'Normal',
          prefills: params.prefills || {}
        })
      }
    ]
  },

  'list-processes': {
    id: 'list-processes',
    label: 'List Processes',
    category: 'processes',
    level: 1,
    description: 'List all available processes',
    requiredParams: [],
    steps: [
      {
        name: 'Get processes',
        method: 'GET',
        path: '/api/processes',
        buildBody: () => null
      }
    ]
  },

  'list-forms': {
    id: 'list-forms',
    label: 'List Forms',
    category: 'forms',
    level: 1,
    description: 'List all available forms',
    requiredParams: [],
    steps: [
      {
        name: 'Get forms',
        method: 'GET',
        path: '/api/forms',
        buildBody: () => null
      }
    ]
  },

  'list-credentials': {
    id: 'list-credentials',
    label: 'List Credentials',
    category: 'credentials',
    level: 1,
    description: 'List all credentials',
    requiredParams: [],
    optionalParams: ['valueType', 'scope'],
    steps: [
      {
        name: 'Get credentials',
        method: 'GET',
        path: '/api/integrations/credentials/list',
        buildQuery: (params) => {
          const q = [];
          if (params.valueType) q.push(`valueType=${params.valueType}`);
          if (params.scope) q.push(`scope=${params.scope}`);
          return q.length ? '?' + q.join('&') : '';
        },
        buildBody: () => null
      }
    ]
  },

  'create-ai-connection': {
    id: 'create-ai-connection',
    label: 'Create AI Connection',
    category: 'integrations',
    level: 1,
    description: 'Create an AI connection (Anthropic or OpenAI)',
    requiredParams: ['name', 'provider', 'model', 'credentialId'],
    steps: [
      {
        name: 'Create AI connection',
        method: 'POST',
        path: '/api/integrations/ai/connections',
        buildBody: (params) => ({
          name: params.name,
          provider: params.provider, // 'Anthropic' or 'OpenAI'
          model: params.model,
          credentialId: params.credentialId
        })
      }
    ]
  },

  // ═══════════════════════════════════════
  // LEVEL 2: Process Builder Actions
  // ═══════════════════════════════════════

  'create-process': {
    id: 'create-process',
    label: 'Create Process',
    category: 'processes',
    level: 2,
    description: 'Create a new workflow process',
    requiredParams: ['name'],
    optionalParams: ['description', 'category'],
    steps: [
      {
        name: 'Create process',
        method: 'POST',
        path: '/api/processes/create',
        buildBody: (params) => ({
          name: params.name,
          description: params.description || '',
          category: params.category || ''
        })
      }
    ]
  },

  'add-process-task': {
    id: 'add-process-task',
    label: 'Add Task to Process',
    category: 'processes',
    level: 2,
    description: 'Add a new task to an existing process',
    requiredParams: ['processSid', 'name', 'taskType'],
    optionalParams: ['description', 'formId', 'position'],
    steps: [
      {
        name: 'Add task',
        method: 'POST',
        path: (params) => `/api/processes/${params.processSid}/tasks`,
        buildBody: (params) => ({
          name: params.name,
          taskType: params.taskType, // 'Form', 'Approval', 'RestClient', 'Email', 'Script', 'Notification', 'WebForm'
          description: params.description || '',
          formId: params.formId || null,
          position: params.position || null
        })
      }
    ]
  },

  'configure-task-transition': {
    id: 'configure-task-transition',
    label: 'Configure Task Transition',
    category: 'processes',
    level: 2,
    description: 'Create a transition rule between tasks',
    requiredParams: ['taskId', 'targetTaskId'],
    optionalParams: ['condition', 'conditionType', 'label'],
    steps: [
      {
        name: 'Create transition rule',
        method: 'POST',
        path: (params) => `/api/processes/tasks/${params.taskId}/rules`,
        buildBody: (params) => ({
          targetTaskId: params.targetTaskId,
          label: params.label || '',
          condition: params.condition || null,
          conditionType: params.conditionType || 'always' // 'always', 'conditional', 'else'
        })
      }
    ]
  },

  'add-task-recipient': {
    id: 'add-task-recipient',
    label: 'Add Task Recipient',
    category: 'processes',
    level: 2,
    description: 'Add a recipient (user/group) to a task',
    requiredParams: ['taskId', 'recipientType', 'recipientId'],
    optionalParams: ['isRequired'],
    steps: [
      {
        name: 'Add recipient',
        method: 'POST',
        path: (params) => `/api/processes/processTask/${params.taskId}/recipients`,
        buildBody: (params) => ({
          recipientType: params.recipientType, // 'user', 'group', 'role'
          recipientId: params.recipientId,
          isRequired: params.isRequired !== false
        })
      }
    ]
  },

  'configure-data-mapping': {
    id: 'configure-data-mapping',
    label: 'Configure Data Mapping',
    category: 'processes',
    level: 2,
    description: 'Map data between tasks in a process',
    requiredParams: ['taskId', 'sourceField', 'targetField'],
    optionalParams: ['sourceCategory', 'transformExpression'],
    steps: [
      {
        name: 'Create mapping',
        method: 'POST',
        path: (params) => `/api/processes/processTask/${params.taskId}/mappings`,
        buildBody: (params) => ({
          sourceField: params.sourceField,
          targetField: params.targetField,
          sourceCategory: params.sourceCategory || 'form',
          transformExpression: params.transformExpression || null
        })
      }
    ]
  },

  'configure-rest-client-task': {
    id: 'configure-rest-client-task',
    label: 'Configure REST Client Task',
    category: 'processes',
    level: 2,
    description: 'Configure a REST Client task in a process with endpoint details',
    requiredParams: ['taskId', 'method', 'url'],
    optionalParams: ['headers', 'body', 'auth', 'mappings'],
    steps: [
      {
        name: 'Save REST Client config',
        method: 'POST',
        path: (params) => `/api/task-dispatcher/rest-client/${params.taskId}/config/save`,
        buildBody: (params) => ({
          request: {
            method: params.method,
            url: params.url,
            headers: params.headers || [],
            queryParams: params.queryParams || [],
            auth: params.auth || { type: 'none' },
            body: params.body || { type: 'none' },
            response: { expectedStatus: [], enableTimeout: false, timeoutDuration: 30000 },
            mappings: params.mappings || []
          }
        })
      }
    ]
  },

  // ═══════════════════════════════════════
  // LEVEL 2: Form Actions
  // ═══════════════════════════════════════

  'create-form': {
    id: 'create-form',
    label: 'Create Form',
    category: 'forms',
    level: 2,
    description: 'Create a new form',
    requiredParams: ['name'],
    optionalParams: ['description', 'layout'],
    steps: [
      {
        name: 'Create form',
        method: 'POST',
        path: '/api/forms/create',
        buildBody: (params) => ({
          name: params.name,
          description: params.description || ''
        })
      }
    ]
  },

  'create-form-with-layout': {
    id: 'create-form-with-layout',
    label: 'Create Form with Layout',
    category: 'forms',
    level: 2,
    description: 'Create a form with full layout including fields and sections',
    requiredParams: ['name', 'layout'],
    steps: [
      {
        name: 'Create form with layout',
        method: 'POST',
        path: '/api/forms/createWithLayout',
        buildBody: (params) => ({
          name: params.name,
          description: params.description || '',
          layout: params.layout // full form JSON
        })
      }
    ]
  },

  'get-form-json': {
    id: 'get-form-json',
    label: 'Get Form JSON',
    category: 'forms',
    level: 1,
    description: 'Retrieve the full JSON layout of a form (builder format)',
    requiredParams: ['formId'],
    steps: [
      {
        name: 'Get form builder JSON',
        method: 'GET',
        // Form builder uses /workflow/napi/ prefix, not /api/
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null
      }
    ]
  },

  'get-form-metadata': {
    id: 'get-form-metadata',
    label: 'Get Form Metadata',
    category: 'forms',
    level: 1,
    description: 'Retrieve form metadata (name, description, timestamps)',
    requiredParams: ['formId'],
    steps: [
      {
        name: 'Get form metadata',
        method: 'GET',
        path: (params) => `/api/forms/${params.formId}`,
        buildBody: () => null
      }
    ]
  },

  'update-form-layout': {
    id: 'update-form-layout',
    label: 'Update Form Layout',
    category: 'forms',
    level: 2,
    description: 'Update an existing form layout (add/modify fields). Sends the full form object.',
    requiredParams: ['formId', 'node'],
    // node is the full form object from GET /workflow/napi/tasktypes/power-form/{sid}/builder
    steps: [
      {
        name: 'Save form layout',
        method: 'PUT',
        // Form builder uses /workflow/napi/ prefix, not /api/
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params) => ({
          node: params.node // full form object with sid, sections, questions, etc.
        })
      }
    ]
  },

  'update-form-javascript': {
    id: 'update-form-javascript',
    label: 'Update Form JavaScript',
    category: 'forms',
    level: 2,
    description: 'Add or update JavaScript on a form. Sends the full form object with updated JS.',
    requiredParams: ['formId', 'node'],
    steps: [
      {
        name: 'Save form with JavaScript',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params) => ({
          node: params.node
        })
      }
    ]
  },

  'update-form-css': {
    id: 'update-form-css',
    label: 'Update Form CSS',
    category: 'forms',
    level: 2,
    description: 'Add or update CSS styles on a form. Sends the full form object with updated CSS.',
    requiredParams: ['formId', 'node'],
    steps: [
      {
        name: 'Save form with CSS',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params) => ({
          node: params.node
        })
      }
    ]
  },

  // ═══════════════════════════════════════
  // Multi-Step Composite Actions
  // ═══════════════════════════════════════

  'move-fields-to-new-section': {
    id: 'move-fields-to-new-section',
    label: 'Move Fields to New Section',
    category: 'forms',
    level: 2,
    description: 'Fetch the form, extract specified fields by ClientID from their current location, create a new section with a container, place those fields in it, and save. Fields are MOVED (removed from original location). The new section is inserted at the specified position.',
    requiredParams: ['formId', 'fieldClientIds', 'newSectionLabel'],
    optionalParams: ['insertAfterSectionIndex', 'containerColumns', 'fieldsPerColumn', 'sectionUi'],
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Reorganize and save form',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) {
            throw new Error('Could not retrieve form data from previous step');
          }

          const layout = formData.layout;
          if (!layout || !Array.isArray(layout)) {
            throw new Error('Form layout is missing or invalid');
          }

          const fieldClientIds = params.fieldClientIds; // array of ClientIDs to move
          const extractedFields = [];

          // Step 1: Extract fields from their current locations
          for (const section of layout) {
            const contents = section.contents || [];
            for (const container of contents) {
              const columns = container.columns || [];
              for (const column of columns) {
                if (!column.items) continue;
                // Filter out the fields we want to move, save them
                const remaining = [];
                for (const item of column.items) {
                  if (fieldClientIds.includes(item.ClientID)) {
                    extractedFields.push(item); // save the ACTUAL field object
                  } else {
                    remaining.push(item);
                  }
                }
                column.items = remaining;
              }
            }
          }

          if (extractedFields.length === 0) {
            throw new Error(`Could not find any fields with ClientIDs: ${fieldClientIds.join(', ')}`);
          }

          // Step 2: Build the new section
          const numColumns = params.containerColumns || 1;
          const fieldsPerColumn = params.fieldsPerColumn || null; // array like [2, 1] meaning 2 fields in col1, 1 in col2
          const timestamp = Date.now().toString();

          // Distribute fields across columns
          const columns = [];
          if (numColumns > 1 && fieldsPerColumn) {
            let fieldIndex = 0;
            for (let c = 0; c < numColumns; c++) {
              const count = fieldsPerColumn[c] || 0;
              const colItems = extractedFields.slice(fieldIndex, fieldIndex + count);
              // Set flex to split width
              colItems.forEach(f => { f.flex = Math.floor(100 / numColumns); });
              columns.push({ items: colItems });
              fieldIndex += count;
            }
            // Any remaining fields go in the last column
            if (fieldIndex < extractedFields.length) {
              const lastCol = columns[columns.length - 1];
              lastCol.items.push(...extractedFields.slice(fieldIndex));
            }
          } else if (numColumns > 1) {
            // Distribute evenly
            const perCol = Math.ceil(extractedFields.length / numColumns);
            for (let c = 0; c < numColumns; c++) {
              const colItems = extractedFields.slice(c * perCol, (c + 1) * perCol);
              colItems.forEach(f => { f.flex = Math.floor(100 / numColumns); });
              columns.push({ items: colItems });
            }
          } else {
            // Single column
            columns.push({ items: extractedFields });
          }

          const newSection = {
            id: timestamp + 's',
            ClientID: timestamp + 's',
            type: 'Section_Type',
            Label: params.newSectionLabel,
            displayName: 'Section',
            show: true,
            open: true,
            expandOnLoad: true,
            showSectionOutline: true,
            showAsCollapsible: true,
            class: '',
            ui: params.sectionUi || { textColor: '#585858', backgroundColor: '#ebecee' },
            contents: [
              {
                id: timestamp + 'c',
                ClientID: timestamp + 'c',
                type: 'Container_Type',
                displayName: 'Container',
                show: true,
                open: true,
                columns: columns
              }
            ]
          };

          // Step 3: Insert the new section at the right position
          const insertAfter = params.insertAfterSectionIndex;
          if (insertAfter !== undefined && insertAfter !== null) {
            layout.splice(insertAfter + 1, 0, newSection);
          } else {
            // Default: insert after the first section
            layout.splice(1, 0, newSection);
          }

          return { node: formData };
        }
      }
    ]
  },

  'add-section-to-form': {
    id: 'add-section-to-form',
    label: 'Add Section to Form',
    category: 'forms',
    level: 2,
    description: 'Fetch the form and add a new empty Section_Type layout section with a container. Optionally include new fields in it.',
    requiredParams: ['formId', 'sectionLabel'],
    optionalParams: ['insertAfterSectionIndex', 'containerColumns', 'fields', 'sectionUi'],
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Add section and save',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) throw new Error('Could not retrieve form data');

          const layout = formData.layout;
          if (!layout || !Array.isArray(layout)) throw new Error('Form layout is missing');

          const timestamp = Date.now().toString();
          const numColumns = params.containerColumns || 1;

          // Build columns — if fields provided, distribute them
          const columns = [];
          const fields = params.fields || [];
          if (numColumns > 1 && fields.length > 0) {
            const perCol = Math.ceil(fields.length / numColumns);
            for (let c = 0; c < numColumns; c++) {
              columns.push({ items: fields.slice(c * perCol, (c + 1) * perCol) });
            }
          } else {
            columns.push({ items: fields });
          }
          // Ensure we have at least the right number of empty columns
          while (columns.length < numColumns) {
            columns.push({ items: [] });
          }

          const newSection = {
            id: timestamp + 's',
            ClientID: timestamp + 's',
            type: 'Section_Type',
            Label: params.sectionLabel,
            displayName: 'Section',
            show: true,
            open: true,
            expandOnLoad: true,
            showSectionOutline: true,
            showAsCollapsible: true,
            class: '',
            ui: params.sectionUi || { textColor: '#585858', backgroundColor: '#ebecee' },
            contents: [
              {
                id: timestamp + 'c',
                ClientID: timestamp + 'c',
                type: 'Container_Type',
                displayName: 'Container',
                show: true,
                open: true,
                columns: columns
              }
            ]
          };

          const insertAfter = params.insertAfterSectionIndex;
          if (insertAfter !== undefined && insertAfter !== null) {
            layout.splice(insertAfter + 1, 0, newSection);
          } else {
            layout.push(newSection); // append at end by default
          }

          return { node: formData };
        }
      }
    ]
  },

  'add-container-to-section': {
    id: 'add-container-to-section',
    label: 'Add Container to Section',
    category: 'forms',
    level: 2,
    description: 'Fetch the form and add a new Container_Type to an existing section. Containers hold columns which hold fields.',
    requiredParams: ['formId', 'sectionClientId', 'columns'],
    optionalParams: ['fields'],
    // columns is a number (how many columns), fields is optional array of field objects
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Add container and save',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) throw new Error('Could not retrieve form data');

          const layout = formData.layout;
          if (!layout || !Array.isArray(layout)) throw new Error('Form layout is missing');

          // Find the target section by ClientID
          const section = findSection(layout, params.sectionClientId);
          if (!section) throw new Error(`Section with ClientID "${params.sectionClientId}" not found`);

          if (!section.contents) section.contents = [];

          const timestamp = Date.now().toString();
          const numColumns = typeof params.columns === 'number' ? params.columns : 1;
          const fields = params.fields || [];

          // Build columns
          const cols = [];
          if (fields.length > 0 && numColumns > 1) {
            const perCol = Math.ceil(fields.length / numColumns);
            for (let c = 0; c < numColumns; c++) {
              cols.push({ items: fields.slice(c * perCol, (c + 1) * perCol) });
            }
          } else if (fields.length > 0) {
            cols.push({ items: fields });
          }
          // Fill remaining empty columns
          while (cols.length < numColumns) {
            cols.push({ items: [] });
          }

          const newContainer = {
            id: timestamp + 'c',
            ClientID: timestamp + 'c',
            type: 'Container_Type',
            displayName: 'Container',
            show: true,
            open: true,
            columns: cols
          };

          section.contents.push(newContainer);

          return { node: formData };
        }
      }
    ]
  },

  'move-fields-to-container': {
    id: 'move-fields-to-container',
    label: 'Move Fields to Container',
    category: 'forms',
    level: 2,
    description: 'Move existing fields (by ClientID) from their current location into a specific container in a specific section. Specify the target by sectionClientId and containerIndex (0-based). Optionally specify which column (0-based) to place them in.',
    requiredParams: ['formId', 'fieldClientIds', 'targetSectionClientId'],
    optionalParams: ['targetContainerIndex', 'targetColumnIndex'],
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Move fields and save',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) throw new Error('Could not retrieve form data');

          const layout = formData.layout;
          if (!layout || !Array.isArray(layout)) throw new Error('Form layout is missing');

          const fieldClientIds = params.fieldClientIds;
          const extractedFields = [];

          // Step 1: Extract fields from their current locations
          for (const section of layout) {
            const contents = section.contents || [];
            for (const container of contents) {
              const columns = container.columns || [];
              for (const column of columns) {
                if (!column.items) continue;
                const remaining = [];
                for (const item of column.items) {
                  if (fieldClientIds.includes(item.ClientID)) {
                    extractedFields.push(item);
                  } else {
                    remaining.push(item);
                  }
                }
                column.items = remaining;
              }
            }
          }

          if (extractedFields.length === 0) {
            throw new Error(`Could not find fields: ${fieldClientIds.join(', ')}`);
          }

          // Step 2: Find the target section and container
          const targetSection = findSection(layout, params.targetSectionClientId);
          if (!targetSection) throw new Error(`Target section "${params.targetSectionClientId}" not found`);

          const containerIdx = params.targetContainerIndex || 0;
          const contents = targetSection.contents || [];
          if (containerIdx >= contents.length) throw new Error(`Container index ${containerIdx} out of range (section has ${contents.length} containers)`);

          const targetContainer = contents[containerIdx];
          const columns = targetContainer.columns || [];

          const columnIdx = params.targetColumnIndex || 0;
          if (columnIdx >= columns.length) throw new Error(`Column index ${columnIdx} out of range (container has ${columns.length} columns)`);

          const targetColumn = columns[columnIdx];
          if (!targetColumn.items) targetColumn.items = [];

          // Step 3: Place extracted fields into target column
          targetColumn.items.push(...extractedFields);

          return { node: formData };
        }
      }
    ]
  },

  'reorder-sections': {
    id: 'reorder-sections',
    label: 'Reorder Sections',
    category: 'forms',
    level: 2,
    description: 'Reorder the sections in a form by providing the new order of section ClientIDs.',
    requiredParams: ['formId', 'sectionOrder'],
    // sectionOrder is an array of section ClientIDs in the desired order
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Reorder and save',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) throw new Error('Could not retrieve form data');
          const layout = formData.layout;
          if (!layout) throw new Error('Form layout is missing');

          const reordered = [];
          for (const clientId of params.sectionOrder) {
            const section = findSection(layout, clientId);
            if (section) reordered.push(section);
          }
          // Append any sections not in the order list (safety net)
          for (const section of layout) {
            if (!reordered.includes(section)) reordered.push(section);
          }
          formData.layout = reordered;
          return { node: formData };
        }
      }
    ]
  },

  'reorder-containers': {
    id: 'reorder-containers',
    label: 'Reorder Containers in Section',
    category: 'forms',
    level: 2,
    description: 'Reorder containers within a section by providing the new order of container ClientIDs.',
    requiredParams: ['formId', 'sectionClientId', 'containerOrder'],
    // containerOrder is an array of container ClientIDs in the desired order
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Reorder containers and save',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) throw new Error('Could not retrieve form data');
          const layout = formData.layout;
          if (!layout) throw new Error('Form layout is missing');

          const section = findSection(layout, params.sectionClientId);
          if (!section) throw new Error(`Section "${params.sectionClientId}" not found`);

          const contents = section.contents || [];
          const reordered = [];
          for (const clientId of params.containerOrder) {
            const container = contents.find(c => c.ClientID === clientId);
            if (container) reordered.push(container);
          }
          for (const container of contents) {
            if (!reordered.includes(container)) reordered.push(container);
          }
          section.contents = reordered;
          return { node: formData };
        }
      }
    ]
  },

  'move-container-to-section': {
    id: 'move-container-to-section',
    label: 'Move Container to Another Section',
    category: 'forms',
    level: 2,
    description: 'Move an entire container (with all its columns and fields) from one section to another. Can identify the container by ClientID OR by sourceSectionClientId + sourceContainerIndex.',
    requiredParams: ['formId', 'targetSectionClientId'],
    optionalParams: ['containerClientId', 'sourceSectionClientId', 'sourceContainerIndex', 'sourceContainerColumns', 'sourceContainerContainsField', 'targetPosition'],
    // Identify container by EITHER containerClientId OR (sourceSectionClientId + sourceContainerIndex)
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Move container and save',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) throw new Error('Could not retrieve form data');
          const layout = formData.layout;
          if (!layout) throw new Error('Form layout is missing');

          let extractedContainer = null;

          if (params.containerClientId) {
            // Find by exact ClientID
            for (const section of layout) {
              const contents = section.contents || [];
              const idx = contents.findIndex(c => c.ClientID === params.containerClientId);
              if (idx !== -1) {
                extractedContainer = contents.splice(idx, 1)[0];
                break;
              }
            }
          } else if (params.sourceSectionClientId !== undefined) {
            // Find by section label/ClientID + container index or column count
            const sourceSection = findSection(layout, params.sourceSectionClientId);
            if (!sourceSection) throw new Error(`Source section "${params.sourceSectionClientId}" not found`);
            const contents = sourceSection.contents || [];

            let idx = -1;
            if (params.sourceContainerContainsField) {
              // Find container that holds a specific field (by ClientID or label)
              const fieldId = params.sourceContainerContainsField.toLowerCase();
              idx = contents.findIndex(c => {
                for (const col of (c.columns || [])) {
                  for (const item of (col.items || [])) {
                    if (item.ClientID === params.sourceContainerContainsField ||
                        (item.ClientID && item.ClientID.toLowerCase() === fieldId) ||
                        (item.Label && item.Label.toLowerCase().includes(fieldId))) {
                      return true;
                    }
                  }
                }
                return false;
              });
            } else if (params.sourceContainerColumns) {
              // Find by column count (e.g., "the 2-column container")
              idx = contents.findIndex(c => (c.columns || []).length === params.sourceContainerColumns);
            } else {
              idx = params.sourceContainerIndex || 0;
            }

            if (idx >= 0 && idx < contents.length) {
              extractedContainer = contents.splice(idx, 1)[0];
            }
          } else {
            throw new Error('Must provide either containerClientId or sourceSectionClientId');
          }

          if (!extractedContainer) throw new Error('Container not found');

          // Find the target section
          const targetSection = findSection(layout, params.targetSectionClientId);
          if (!targetSection) throw new Error(`Target section "${params.targetSectionClientId}" not found`);
          if (!targetSection.contents) targetSection.contents = [];

          const pos = params.targetPosition;
          if (pos !== undefined && pos !== null && pos < targetSection.contents.length) {
            targetSection.contents.splice(pos, 0, extractedContainer);
          } else {
            targetSection.contents.push(extractedContainer);
          }

          return { node: formData };
        }
      }
    ]
  },

  'add-field-to-form': {
    id: 'add-field-to-form',
    label: 'Add Field to Form',
    category: 'forms',
    level: 2,
    description: 'Fetch the current form, add a new field, and save it back',
    requiredParams: ['formId', 'field'],
    optionalParams: ['afterClientId', 'sectionIndex', 'containerIndex'],
    steps: [
      {
        name: 'Fetch current form layout',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' } // special: extract entire response
      },
      {
        name: 'Save form with new field',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params, prevResults) => {
          // Get the form data from the previous step
          // The form JSON is an ARRAY of sections at the top level
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) {
            throw new Error('Could not retrieve form data from previous step');
          }

          const field = params.field;
          const afterClientId = params.afterClientId;
          // The GET response is { _id, name, sid, layout: [...sections], script, css, rules, ... }
          // The sections array lives inside formData.layout
          const sections = formData.layout || (Array.isArray(formData) ? formData : formData.sections || [formData]);

          // Actual form JSON structure:
          // sections[] (top-level array)
          //   → .contents[] (containers inside a section)
          //     → .columns[] (columns inside a container)
          //       → .items[] (questions/fields inside a column)

          let inserted = false;

          // If afterClientId specified, search all sections/containers/columns for it
          if (afterClientId) {
            for (const section of sections) {
              if (inserted) break;
              const contents = section.contents || [];
              for (const container of contents) {
                if (inserted) break;
                const columns = container.columns || [];
                for (const column of columns) {
                  if (inserted) break;
                  const items = column.items || [];
                  const idx = items.findIndex(q => q.ClientID === afterClientId);
                  if (idx !== -1) {
                    items.splice(idx + 1, 0, field);
                    inserted = true;
                  }
                }
              }
            }
          }

          // If not inserted yet, add to first section > first container > first column
          if (!inserted) {
            const sectionIdx = params.sectionIndex || 0;
            const section = sections[sectionIdx] || sections[0];
            if (section) {
              const contents = section.contents || [];
              const containerIdx = params.containerIndex || 0;
              const container = contents[containerIdx] || contents[0];
              if (container) {
                const columns = container.columns || [];
                const column = columns[0];
                if (column) {
                  if (!column.items) column.items = [];
                  column.items.push(field);
                  inserted = true;
                }
              }
            }
          }

          if (!inserted) {
            throw new Error('Could not find a valid location to insert the field');
          }

          // The PUT expects the full form array wrapped in { node: ... }
          return { node: formData };
        }
      }
    ]
  },

  'setup-slack-integration': {
    id: 'setup-slack-integration',
    label: 'Set Up Slack Integration',
    category: 'integrations',
    level: 2,
    description: 'Create credential + REST request for Slack messaging',
    requiredParams: ['slackToken', 'channelId'],
    optionalParams: ['credentialName', 'requestName'],
    steps: [
      {
        name: 'Create Slack credential',
        method: 'POST',
        path: '/api/integrations/credentials/create',
        buildBody: (params) => ({
          name: params.credentialName || 'Slack Bot Token',
          resourceKind: 'restful-request',
          valueType: 'bearer-token',
          value: params.slackToken,
          scope: { ambient: 'tenant' }
        }),
        extractResult: { credentialId: 'data.sid' }
      },
      {
        name: 'Create Slack message request',
        method: 'POST',
        path: '/api/integrations/restful-requests/create',
        buildBody: (params, prevResults) => ({
          name: params.requestName || 'Slack - Post Message',
          description: 'Post a message to a Slack channel',
          request: {
            method: 'POST',
            url: 'https://slack.com/api/chat.postMessage',
            validateSSL: true,
            followRedirects: true,
            maxRedirects: 5,
            headers: [
              { key: 'Content-Type', value: 'application/json', enabled: true, source: 'fixed' }
            ],
            queryParams: [],
            auth: {
              type: 'bearer',
              credentialId: prevResults.credentialId || ''
            },
            body: {
              type: 'raw',
              contentType: 'application/json',
              raw: JSON.stringify({
                channel: params.channelId,
                text: '{{message}}'
              }, null, 2)
            },
            response: { expectedStatus: [200], enableTimeout: false, timeoutDuration: 30000 },
            mappings: [],
            envVars: []
          }
        })
      }
    ]
  },

  'setup-stripe-payment': {
    id: 'setup-stripe-payment',
    label: 'Set Up Stripe Payment Integration',
    category: 'integrations',
    level: 2,
    description: 'Create credential + REST requests for Stripe payments and refunds',
    requiredParams: ['stripeSecretKey'],
    optionalParams: ['credentialName'],
    steps: [
      {
        name: 'Create Stripe credential',
        method: 'POST',
        path: '/api/integrations/credentials/create',
        buildBody: (params) => ({
          name: params.credentialName || 'Stripe Secret Key',
          resourceKind: 'restful-request',
          valueType: 'bearer-token',
          value: params.stripeSecretKey,
          scope: { ambient: 'tenant' }
        }),
        extractResult: { credentialId: 'data.sid' }
      },
      {
        name: 'Create Stripe charge request',
        method: 'POST',
        path: '/api/integrations/restful-requests/create',
        buildBody: (params, prevResults) => ({
          name: 'Stripe - Create Payment Intent',
          description: 'Create a Stripe payment intent',
          request: {
            method: 'POST',
            url: 'https://api.stripe.com/v1/payment_intents',
            headers: [
              { key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true, source: 'fixed' }
            ],
            auth: { type: 'bearer', credentialId: prevResults.credentialId || '' },
            body: {
              type: 'form',
              urlEncoded: [
                { key: 'amount', value: '', source: 'field', fieldId: '', enabled: true },
                { key: 'currency', value: 'usd', source: 'fixed', enabled: true },
                { key: 'description', value: '', source: 'field', fieldId: '', enabled: true }
              ]
            },
            response: { expectedStatus: [200], enableTimeout: false, timeoutDuration: 30000 },
            mappings: []
          }
        })
      },
      {
        name: 'Create Stripe refund request',
        method: 'POST',
        path: '/api/integrations/restful-requests/create',
        buildBody: (params, prevResults) => ({
          name: 'Stripe - Create Refund',
          description: 'Issue a refund for a Stripe payment intent',
          request: {
            method: 'POST',
            url: 'https://api.stripe.com/v1/refunds',
            headers: [
              { key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true, source: 'fixed' }
            ],
            auth: { type: 'bearer', credentialId: prevResults.credentialId || '' },
            body: {
              type: 'form',
              urlEncoded: [
                { key: 'payment_intent', value: '', source: 'field', fieldId: '', enabled: true },
                { key: 'amount', value: '', source: 'field', fieldId: '', enabled: true }
              ]
            },
            response: { expectedStatus: [200], enableTimeout: false, timeoutDuration: 30000 },
            mappings: []
          }
        })
      }
    ]
  }
};


// ── Action Executor ──
class ActionEngine {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '';
    this.onConfirmRequired = options.onConfirmRequired || (() => Promise.resolve(false));
    this.onStepProgress = options.onStepProgress || (() => {});
    this.onActionComplete = options.onActionComplete || (() => {});
    this.pendingAction = null;
    this.formBackups = {}; // formId → backup of form JSON before modification
  }

  // ── Form Backup/Restore ──
  getBackup(formId) {
    return this.formBackups[formId] || null;
  }

  async restoreBackup(formId) {
    const backup = this.formBackups[formId];
    if (!backup) {
      throw new Error(`No backup found for form ${formId}`);
    }
    const fullUrl = `${this.baseUrl}/workflow/napi/tasktypes/power-form/${formId}/builder`;
    const response = await this._executeApiCall({
      method: 'PUT',
      url: fullUrl,
      headers: { 'Content-Type': 'application/json' },
      body: { node: backup }
    });
    if (response.status >= 200 && response.status < 300) {
      // Keep backup — user might need to undo multiple actions to the same original state
      return { success: true, message: 'Form restored to pre-modification state' };
    }
    throw new Error(`Restore failed: HTTP ${response.status}`);
  }

  clearBackup(formId) {
    delete this.formBackups[formId];
  }

  // Get action by ID
  getAction(actionId) {
    return ACTION_REGISTRY[actionId] || null;
  }

  // List all actions, optionally filtered
  listActions(filter = {}) {
    return Object.values(ACTION_REGISTRY).filter(action => {
      if (filter.category && action.category !== filter.category) return false;
      if (filter.level && action.level !== filter.level) return false;
      return true;
    });
  }

  // Validate params for an action
  validateParams(actionId, params) {
    const action = this.getAction(actionId);
    if (!action) return { valid: false, errors: [`Unknown action: ${actionId}`] };

    const errors = [];
    for (const required of action.requiredParams) {
      if (!params[required] && params[required] !== 0 && params[required] !== false) {
        errors.push(`Missing required parameter: ${required}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  // Parse AI response for executable action blocks
  // Format: ```action\n{"actionId": "...", "params": {...}}\n```
  parseActionsFromResponse(responseText) {
    const actions = [];
    // Match ```action ... ``` blocks
    const actionBlockRegex = /```action\s*\n([\s\S]*?)\n```/g;
    let match;

    while ((match = actionBlockRegex.exec(responseText)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.actionId && ACTION_REGISTRY[parsed.actionId]) {
          actions.push({
            actionId: parsed.actionId,
            params: parsed.params || {},
            raw: match[0],
            index: match.index
          });
        }
      } catch (e) {
        // Not valid JSON - skip
      }
    }

    return actions;
  }

  // Strip action blocks from response text (for display)
  stripActionBlocks(responseText) {
    return responseText.replace(/```action\s*\n[\s\S]*?\n```/g, '').trim();
  }

  // Prepare an action for confirmation (returns display info)
  prepareConfirmation(actionId, params) {
    const action = this.getAction(actionId);
    if (!action) return null;

    const validation = this.validateParams(actionId, params);

    return {
      actionId,
      label: action.label,
      description: action.description,
      category: action.category,
      level: action.level,
      steps: action.steps.map(s => s.name),
      params,
      validation,
      isMutating: action.steps.some(s => s.method !== 'GET')
    };
  }

  // Execute an action (after confirmation)
  async executeAction(actionId, params) {
    const action = this.getAction(actionId);
    if (!action) throw new Error(`Unknown action: ${actionId}`);

    const validation = this.validateParams(actionId, params);
    if (!validation.valid) throw new Error(`Validation failed: ${validation.errors.join(', ')}`);

    const results = [];
    const prevResults = {};

    for (let i = 0; i < action.steps.length; i++) {
      const step = action.steps[i];
      this.onStepProgress(i + 1, action.steps.length, step.name);

      try {
        // Build the path (may be dynamic)
        let path = typeof step.path === 'function' ? step.path(params) : step.path;

        // Add query params if builder exists
        if (step.buildQuery) {
          path += step.buildQuery(params);
        }

        // Build the body
        const body = step.buildBody(params, prevResults);

        // Execute
        const fullUrl = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
        const response = await this._executeApiCall({
          method: step.method,
          url: fullUrl,
          headers: { 'Content-Type': 'application/json' },
          body
        });

        // Store raw response for chaining (indexed by step number)
        prevResults[`_rawResponse_${i}`] = response.data;

        // Auto-backup: if this is a GET on a form and the action has a PUT step coming,
        // save the form data as a backup before modification.
        // Only save the FIRST backup — this preserves the original state before any AI modifications.
        if (step.method === 'GET' && action.category === 'forms' && response.data &&
            action.steps.some(s => s.method === 'PUT') && params.formId &&
            !this.formBackups[params.formId]) {
          this.formBackups[params.formId] = JSON.parse(JSON.stringify(response.data));
        }

        // Extract results for chaining
        if (step.extractResult && response.data) {
          for (const [key, path] of Object.entries(step.extractResult)) {
            if (path === '') {
              // Empty path means extract entire response
              prevResults[key] = response.data;
            } else {
              prevResults[key] = this._getNestedValue(response.data, path);
            }
          }
        }

        results.push({
          step: step.name,
          success: response.status >= 200 && response.status < 300,
          status: response.status,
          data: response.data
        });

        // Stop on failure
        if (response.status >= 400) {
          results[results.length - 1].error = `HTTP ${response.status}: ${response.statusText}`;
          break;
        }

      } catch (err) {
        results.push({
          step: step.name,
          success: false,
          error: err.message
        });
        break;
      }
    }

    const allSuccess = results.every(r => r.success);
    this.onActionComplete(actionId, allSuccess, results);

    return {
      actionId,
      label: action.label,
      success: allSuccess,
      results
    };
  }

  // Execute API call via background worker
  _executeApiCall(request) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'EXECUTE_API', payload: request },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'API call failed'));
          }
        }
      );
    });
  }

  // Helper: get nested value from object by dot path (e.g., "data.sid")
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}


// ── Confirmation UI Builder ──
function buildConfirmationHTML(confirmations) {
  if (!confirmations || confirmations.length === 0) return '';

  const categoryIcons = {
    credentials: '🔑',
    integrations: '🔌',
    instances: '▶️',
    processes: '⚙️',
    forms: '📝'
  };

  let html = '<div class="action-confirmations">';

  confirmations.forEach((conf, idx) => {
    const icon = categoryIcons[conf.category] || '⚡';
    const levelBadge = conf.level === 1 ? 'L1' : 'L2';
    const mutatingWarning = conf.isMutating
      ? '<span class="action-mutating">⚠ modifies data</span>'
      : '<span class="action-readonly">read-only</span>';

    html += `
      <div class="action-card" data-action-index="${idx}">
        <div class="action-card-header">
          <span class="action-icon">${icon}</span>
          <span class="action-label">${conf.label}</span>
          <span class="action-level">${levelBadge}</span>
          ${mutatingWarning}
        </div>
        <p class="action-description">${conf.description}</p>
        <div class="action-steps">
          <strong>Steps:</strong>
          <ol>${conf.steps.map(s => `<li>${s}</li>`).join('')}</ol>
        </div>
        <div class="action-params">
          <strong>Parameters:</strong>
          <pre>${JSON.stringify(conf.params, null, 2)}</pre>
        </div>
        ${!conf.validation.valid
          ? `<div class="action-errors">❌ ${conf.validation.errors.join(', ')}</div>`
          : ''
        }
        <div class="action-buttons">
          <button class="action-execute-btn" data-action-index="${idx}" ${!conf.validation.valid ? 'disabled' : ''}>
            ▶ Execute
          </button>
          <button class="action-edit-btn" data-action-index="${idx}">
            ✏️ Edit Params
          </button>
          <button class="action-skip-btn" data-action-index="${idx}">
            Skip
          </button>
        </div>
      </div>
    `;
  });

  html += '</div>';
  return html;
}


// ── Progress UI Builder ──
function buildProgressHTML(stepNum, totalSteps, stepName) {
  const pct = Math.round((stepNum / totalSteps) * 100);
  return `
    <div class="action-progress">
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${pct}%"></div>
      </div>
      <span class="progress-text">Step ${stepNum}/${totalSteps}: ${stepName}</span>
    </div>
  `;
}


// ── Result UI Builder ──
function buildResultHTML(result) {
  const statusIcon = result.success ? '✅' : '❌';
  let html = `
    <div class="action-result ${result.success ? 'success' : 'failure'}">
      <div class="result-header">
        ${statusIcon} <strong>${result.label}</strong>
      </div>
      <div class="result-steps">
  `;

  result.results.forEach(stepResult => {
    const icon = stepResult.success ? '✓' : '✗';
    html += `
      <div class="result-step ${stepResult.success ? 'success' : 'failure'}">
        <span>${icon} ${stepResult.step}</span>
        ${stepResult.error ? `<span class="result-error">${stepResult.error}</span>` : ''}
        ${stepResult.data && stepResult.success ? `<details><summary>Response</summary><pre>${JSON.stringify(stepResult.data, null, 2)}</pre></details>` : ''}
      </div>
    `;
  });

  html += '</div></div>';
  return html;
}


// ── Param Editor UI Builder ──
function buildParamEditorHTML(actionId, currentParams) {
  const action = ACTION_REGISTRY[actionId];
  if (!action) return '';

  const allParams = [...action.requiredParams, ...(action.optionalParams || [])];

  let html = `
    <div class="param-editor" data-action-id="${actionId}">
      <h4>Edit Parameters: ${action.label}</h4>
  `;

  allParams.forEach(param => {
    const value = currentParams[param];
    const isRequired = action.requiredParams.includes(param);
    const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : (value || '');
    const isMultiline = typeof value === 'object';

    html += `
      <div class="param-field">
        <label>${param} ${isRequired ? '<span class="required">*</span>' : ''}</label>
        ${isMultiline
          ? `<textarea class="param-input" data-param="${param}" rows="4">${displayValue}</textarea>`
          : `<input type="text" class="param-input" data-param="${param}" value="${displayValue}" placeholder="${param}">`
        }
      </div>
    `;
  });

  html += `
      <div class="param-editor-buttons">
        <button class="param-save-btn">Save & Execute</button>
        <button class="param-cancel-btn">Cancel</button>
      </div>
    </div>
  `;
  return html;
}


export {
  ACTION_REGISTRY,
  ActionEngine,
  buildConfirmationHTML,
  buildProgressHTML,
  buildResultHTML,
  buildParamEditorHTML
};

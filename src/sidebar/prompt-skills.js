// ══════════════════════════════════════════════════════════
//  Prompt Skills — Progressive Disclosure for System Prompt
// ══════════════════════════════════════════════════════════
//
// Each skill is a self-contained instruction module that only
// loads when relevant, reducing token usage by 60-80%.

export const SKILL_MODULES = {

  // ── Form Fields: types, templates, ClientID conventions ──
  'form-fields': {
    name: 'Form Fields',
    description: 'Add, update, and configure form fields',
    dependencies: [],
    pageHint: ['forms'],
    keywords: [
      'field', 'add', 'create', 'text', 'dropdown', 'select', 'checkbox', 'radio',
      'email', 'calendar', 'date', 'number', 'password', 'file', 'attachment',
      'signature', 'button', 'short text', 'long text', 'question', 'input',
      'form', 'label', 'placeholder', 'required', 'validation'
    ],
    prompt: `**Level 2 — Form Actions:**
- \`create-form\` — params: name, [description]
- \`create-form-with-layout\` — params: name, layout (full JSON)
- \`add-field-to-form\` — Add a single question/field. Params: formId, field (question object with type:"Question_Type"), [afterClientId], [sectionClientId (label or ID of the target section)], [containerIndex], [columnIndex]. **Use sectionClientId to place a field in a specific section** (e.g., sectionClientId: "Approval Process"). Without it, the field goes into the first section.
- \`update-field\` — **Update properties of an existing field in place.** Params: formId, fieldIdentifier (ClientID or Label of the field), updates (object of properties to merge). The engine finds the field and deep-merges your updates — it does NOT replace the field, only changes the keys you specify. Use this to configure RESTful Elements, change labels, update validation, set dbSettings, etc.
- \`update-form-javascript\` — Write JS to the form's JavaScript tab. Params: formId, javascript (the code string), mode ("replace" = overwrite all, "append" = add to existing, default "replace").
- \`update-form-css\` — Write CSS to the form's CSS tab. Params: formId, css (the code string), mode ("replace" | "append", default "replace").

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
Signature: QuestionType:"Signature", displayName:"Signature", prefix sig_`
  },

  // ── Form Layout: sections, containers, reordering ──
  'form-layout': {
    name: 'Form Layout',
    description: 'Sections, containers, columns, reordering',
    dependencies: ['form-fields'],
    pageHint: ['forms'],
    keywords: [
      'section', 'container', 'column', 'layout', 'move', 'reorder', 'reorganize',
      'rename', 'restructure', 'rearrange', 'position', 'before', 'after', 'above',
      'below', 'split', 'merge', 'resize', 'two-column', '2-column', 'multi-column'
    ],
    prompt: `- \`rename-section\` — Rename an existing section. Params: formId, sectionClientId (use current label!), newLabel.
- \`add-section-to-form\` — Add a new layout section. Params: formId, sectionLabel, [insertAfterSectionIndex], [containerColumns], [fields].
- \`add-container-to-section\` — **Add a container to an EXISTING section.** Params: formId, sectionClientId (the ClientID of the target section), columns (number of columns, e.g. 2), [fields].
- \`move-fields-to-new-section\` — Move existing fields to a NEW section. Params: formId, fieldClientIds (array of field ClientIDs OR Labels), newSectionLabel, [insertAfterSectionIndex], [containerColumns], [fieldsPerColumn].
- \`move-fields-to-container\` — Move existing fields to an EXISTING container. Params: formId, fieldClientIds (array of field ClientIDs OR Labels — e.g. ["Phone Number", "Email"] works), targetSectionClientId, [targetContainerIndex], [targetContainerColumns] (find container by column count — **prefer this over targetContainerIndex**), [targetColumnIndex].
- \`reorder-sections\` — Reorder sections on the form. Params: formId, sectionOrder (array of section ClientIDs in desired order).
- \`reorder-containers\` — Reorder containers within a section. Params: formId, sectionClientId, containerOrder (array of container ClientIDs in desired order).
- \`resize-container\` — Change column count in a container. Params: formId, sectionClientId, newColumnCount, PLUS one of: [containerColumns] (find by current column count), [containerContainsField] (find by field), [containerIndex] (0-based).
- \`move-container-to-section\` — Move an entire container between sections. Params: formId, targetSectionClientId, PLUS one of: (a) sourceSectionClientId + sourceContainerContainsField, (b) sourceSectionClientId + sourceContainerColumns, (c) sourceSectionClientId + sourceContainerIndex, (d) containerClientId.

**CRITICAL — Form Layout Hierarchy:**
- SECTION (type: "Section_Type") → collapsible grouping. Created with add-section-to-form.
- CONTAINER (type: "Container_Type") → lives inside a section's .contents[]. Holds columns.
- COLUMN → lives inside a container's .columns[]. Holds items (fields).
- FIELD/QUESTION (type: "Question_Type") → lives inside a column's .items[].
- NEVER create a question with QuestionType="Section" — sections are layout elements, not questions.
- Section ClientIDs look like timestamps ending in "s" (e.g. "1773951418087s"). Get them from get-form-json or infer from context.
- **Container identification**: When the user references a container by column count, use targetContainerColumns/sourceContainerColumns. When by a field it contains, use sourceContainerContainsField. Avoid index-based targeting unless explicitly requested.
- **Sanity-check requests**: Before executing, verify the request is logically possible. A 1-column container only has column index 0. If the user asks for something impossible, explain why and suggest alternatives.`
  },

  // ── Form Rules: conditions, effects, inverse rules ──
  'form-rules': {
    name: 'Form Rules',
    description: 'Conditional show/hide, required, enable/disable rules',
    dependencies: ['form-fields'],
    pageHint: ['forms'],
    keywords: [
      'rule', 'when', 'if', 'then', 'condition', 'show', 'hide', 'visible',
      'required', 'unrequired', 'optional', 'mandatory', 'enable', 'disable',
      'read-only', 'readonly', 'editable', 'conditional', 'equals', 'checked',
      'unchecked', 'empty', 'not empty', 'greater', 'less', 'inverse'
    ],
    prompt: `- \`add-rule\` — Add a conditional rule to the form. Params: formId, name (rule name), conditions (array), effects (array), [logic: "all"|"any" (default "all")], [createInverse: true|false (default true)].
  - Each condition: { field: "Label or ClientID", operator: "equals"|"!="|"contains"|"is empty"|etc., value: "the value" }
  - Each effect: { action: "show"|"hide"|"disable"|"enable"|"required"|"unrequired"|"readOnly"|"editable"|"set answer", target: "Label or ClientID", targetType: "question"|"section" }
  - **CRITICAL: Each effect's "target" must be the SPECIFIC field that effect applies to.** Different effects in the same rule can (and often should) target DIFFERENT fields.
  - **Only include the "positive" effects (what happens when condition is TRUE).** The engine auto-generates an inverse rule that flips everything (show↔hide, required↔unrequired). So if you want "show Department when checked, hide Department when unchecked" — just send {action: "show", target: "Department"}. The inverse handles the hide. If you send both show AND hide on the same target, the engine will discard the contradictory effect.
  - Operators: equal, notEqual, lessThan, lessThanInclusive, greaterThan, greaterThanInclusive, containsValue, doesNotContainValue, isEmpty, isNotEmpty. Engine also accepts aliases like "equals", "!=", "contains", "is empty", etc.
  - Effects: show, hide, disable, enable, readOnly, editable, required, unrequired, set_answer_with_value, set_answer_with_function. Engine accepts aliases like "visible", "hidden", "mandatory", "optional", etc.
  - Inverse rules are auto-generated with flipped operators and effects (show↔hide, required↔unrequired, equal↔notEqual, any↔all).
  - Example: name: "Show Details", logic: "all", conditions: [{field: "Show Details", operator: "is not empty"}], effects: [{action: "show", target: "Department"}, {action: "required", target: "Department"}, {action: "show", target: "Employee ID"}]
  - **CRITICAL ORDERING: ALL fields referenced in conditions and effects MUST already exist on the form BEFORE calling add-rule.** Always add fields FIRST, then add rules LAST.
  - When creating fields + rules in one response, use SEPARATE action blocks in this order: (1) add-field-to-form for ALL fields, (2) add-rule AFTER all fields exist.
- \`remove-rule\` — Remove a rule by name. Params: formId, ruleName. Also removes the inverse rule by default.
- **IMPORTANT — Rules vs JavaScript**: Do NOT mix Form Rules and JavaScript on the same form for controlling visibility/state. If the form uses script with onChange handlers, use script for all conditional logic. If the form uses Rules, use Rules for all conditional logic.`
  },

  // ── Form Grids: grid columns, aggregation, row management ──
  'form-grids': {
    name: 'Form Grids',
    description: 'Grid fields, columns, aggregation, row management',
    dependencies: ['form-fields'],
    pageHint: ['forms'],
    keywords: [
      'grid', 'table', 'row', 'column', 'aggregate', 'sum', 'total', 'footer',
      'line item', 'line items', 'inventory', 'spreadsheet', 'currency', 'multiply',
      'cell', 'row aggregation', 'column footer'
    ],
    prompt: `Grid: QuestionType:"Grid", displayName:"Grid", prefix grd_
The engine builds the FULL Grid structure from a simplified spec. You provide:
- QuestionType: "Grid", Label, ClientID (prefix grd)
- columns: array of column specs — each needs at minimum: { name, displayName, type, width }
- Supported column types: "string", "number", "currency", "boolean", "date", "StaticText", "MultiChoiceSelectList", "FileAttachment", "RowAggregation"
- For MultiChoiceSelectList columns: include choices: [{Label, Value}] or ["High","Medium","Low"]
- For RowAggregation (computed columns): include aggregationColumnNames: ["QTY","Cost"], rowAggregationType: "multiply"|"sum"
- For currency: optionally include selectedCurrencyFilter: "en-us"
- Optional: rowCount (default 3), gridOptions: { enableFiltering, showAddRowButton, maxHeight }
- The engine auto-generates: columnDefs with full properties, row data, cellTemplates, buttons, all ui-grid boilerplate.
Example:
\`\`\`json
{"QuestionType":"Grid","Label":"Line Items","ClientID":"grdLineItems","columns":[{"name":"Description","displayName":"Description","type":"string","width":"*"},{"name":"QTY","displayName":"QTY","type":"number","width":"75"},{"name":"Price","displayName":"Price","type":"currency","width":"100"},{"name":"Total","displayName":"Total","type":"RowAggregation","width":"125","aggregationColumnNames":["QTY","Price"],"rowAggregationType":"multiply"}],"rowCount":3}
\`\`\`

**Grid column width rules:**
- At LEAST one column should use width "*" (flex/auto-expand). Use "*" for the widest column.
- NEVER set fixed widths on every column — the grid won't fill available width.

**Grid aggregation rules:**
- **RowAggregation columns** compute per-ROW values across 2+ source columns. NEVER create RowAggregation with a single column.
- **Footer aggregation** shows column-level totals at the bottom. Set on the column with aggregationType: 2. Use \`update-grid-column\` to enable: updates: { aggregationType: 2, aggregationLabel: " ", footerCellFilter: "intCurrency:\\"en-us\\"" }.
- If user asks for a "total" of a single column → enable footer aggregation, do NOT add RowAggregation column.

**Grid-specific actions:**
- \`add-grid-column\` — Params: formId, fieldIdentifier (Grid's ClientID/Label), column ({name, displayName, type, width, ...}), [afterColumnName].
- \`remove-grid-column\` — Params: formId, fieldIdentifier, columnName.
- \`update-grid-column\` — Params: formId, fieldIdentifier, columnName, updates.
- \`add-grid-row\` — Params: formId, fieldIdentifier, [rowCount] (default 1), [rowData].`
  },

  // ── Form RESTful Elements: API-connected fields ──
  'form-restful': {
    name: 'RESTful Elements',
    description: 'API-connected form fields, request config, response mapping',
    dependencies: ['form-fields', 'form-javascript'],
    pageHint: ['forms'],
    keywords: [
      'restful', 'rest', 'api', 'endpoint', 'fetch', 'request', 'response',
      'mapping', 'jsonata', 'server variable', 'chain', 'pagination', 'cursor',
      'external', 'webhook', 'onresponse', 'data element'
    ],
    prompt: `**RESTful Element restRequest structure** (lives at dbSettings.restRequest):
- method: "GET"|"POST"|"PUT"|"DELETE"
- url: full URL string
- headers: array of {key, value, enabled:true, source:"fixed"} OR plain object (engine converts)
- queryParams: same format as headers
- auth: {type:"none"|"bearer"|"oauth2", credentialId:"...", grantType:"...", tokenUrl:"...", ...}
- body: {type:"none"|"form"|"raw", contentType:"application/json", raw:"...", urlEncoded:[{key,value,enabled,source}]} OR plain string (engine wraps) OR plain object (engine converts to urlEncoded)
- response: {expectedStatus:[], enableTimeout:false, timeoutDuration:30000, retryOnFailure:false, maxRetries:3, responseMode:"standard"}
- mappings: array of response-to-field mappings. Each: {responsePath:"$.results[*]", mapTo:"field", fieldId:"txtTargetField"}. Use JSONPath syntax.
- envVars: array of placeholder substitutions. Each: {key:"__placeholder__", source:"field", fieldId:"txtSourceField", enabled:true}.
- restRequestUISettings: {hideProgressIndicator:true}

**Response Mappings pattern** (REST → hidden field → script → Grid):
1. RESTful Element fetches data, mappings dump response into hidden ShortText fields (data buffers)
2. Hidden field's onChange handler processes the raw data in form script
3. Script populates a Grid or Select List with the processed results
- For paginated APIs: use TWO RESTful Elements — one for initial fetch, one for "get next page" with envVar placeholder.

**Configuring RESTful Elements:**
- Use \`update-field\` with fieldIdentifier and updates: { dbSettings: { restRequest: { method, url, headers, body, auth } } }.
- If the RESTful Element does NOT exist yet, \`update-field\` will **automatically create it** when the updates contain restRequest config.`
  },

  // ── Form JavaScript & CSS ──
  'form-javascript': {
    name: 'Form Scripting',
    description: 'Form JavaScript, intForm API, CSS styling',
    dependencies: ['form-fields'],
    pageHint: ['forms'],
    keywords: [
      'javascript', 'script', 'js', 'code', 'css', 'style', 'styling', 'class',
      'intform', 'getElement', 'onchange', 'onclick', 'event', 'handler',
      'submit', 'function', 'async', 'await', 'calculate', 'computed', 'auto-populate',
      'concatenate', 'combine', 'formula', 'dynamic'
    ],
    prompt: `### Form Scripting (intForm API):
The form object is "intForm". NEVER address HTML objects directly.
- formState: "preview" | "runtime" | "completed"
- intForm.getElementByClientID(clientID) — access any field
- intForm.getSectionByClientID(clientID) — access sections
- intForm.events.onSubmit / onSaveDraft — custom submit handlers (must call intForm.submit()/saveDraft())
- intForm.submitButton.enable()/disable(), intForm.saveDraftButton.enable()/disable()
- intForm.recipientTask — TaskName, InstanceSID, InstanceID, Instance.CreatedDate, Instance.LastMilestone
- intForm.generateUniqueID() — for RESTful element request IDs

Field properties: Answer (RW), Label (RW), show (RW), disabled (RW), readonly (RW), class (RW), flex (RW), validation (RW), events (onChange, onFocus, onBlur), ClientID (R), isdirty (R), originalAnswer (R), QuestionType (R)

Special types:
- Calendar: use setAnswer('YYYY-MM-DD'), NOT direct Answer assignment. todaysDate = server date.
- Select List: Answer is comma-separated. Choices array has Label/Value. multiple (true/false), multiChoiceAnswer array.
- Checkboxes: Must set BOTH Answer AND Choices[i].Selected=true. Answer is comma-space separated.
- Radio Buttons: Answer is selected value, Choices array.
- Grid: Answer is array of row objects. Use getRowObject() + addRow(). getFooterValues(). gridOptions.data for rows.
- File Attachment: Answer is array of File objects.
- Contact Search: Answer is array of user objects.
- RESTful Element: request.executeRequest(runId), onResponse handler.
- Button: events.onClick handler. No Answer property.

**Form Script patterns:**
- Assign ALL event handlers at the TOP LEVEL of the script. Do NOT wrap in formState checks.
- Get element references at the top: \`const btnSearch = intForm.getElementByClientID('btnSearch');\`
- Assign click handlers directly: \`btnSearch.events.onClick = async () => { ... };\`
- For RESTful Element execution, generate a shared runId: \`const runId = intForm.generateUniqueID();\`
- Grid manipulation: \`grid.getRowObject()\` for new row, \`grid.addRow(row)\`, \`grid.refreshGrid()\`
- Self-executing async IIFE for initialization: \`(async () => { await restElement.request.executeRequest(runId); })();\`

Client ID prefixes: stxt (ShortText), ltxt (LongText), num (Number), lnk (Link), eml (Email), cal (Calendar), sel (SelectList), chk (Checkboxes), rad (RadioButtons), file (FileAttachment), sig (Signature), cs (ContactSearch), srch (SearchBox), rest (RESTful), grd (Grid), btn (Button)

IMPORTANT: Do NOT mix Form Rules and JavaScript. If using script, handle ALL logic in script.

### Form CSS Styling:
- Add CSS in the Form Builder CSS tab. Use !important for specificity.
- Built-in classes: .int-label, .back-grey, .fcolor-red, .fsize-14, .corner-5, .bord-black, .icon-email
- Key selectors: form, .title-container, .title, .wrapper, .md-input, md-select, .pikadayDatePicker, textarea, .signaturePadCanvas
- Preview CSS in Preview tab, not the builder`
  },

  // ── Reports ──
  'reports': {
    name: 'Reports',
    description: 'Create, configure, and run reports with columns, filters, charts',
    dependencies: [],
    pageHint: ['reports'],
    keywords: [
      'report', 'column', 'filter', 'chart', 'kpi', 'dashboard', 'export',
      'csv', 'excel', 'aggregate', 'count', 'average', 'data', 'analytics',
      'metric', 'queue', 'manage task'
    ],
    prompt: `**Level 2 — Report Actions:**
- \`create-report\` — Params: name, [category], [categorySid], [processName], [objectSid], [dataType] ('request'|'task'|'custom'), [filters], [description], [allowChart]. Do NOT pass columns — engine auto-generates. Do NOT call get-report-categories or list-processes first.
- \`get-report\` — Params: reportSid
- \`update-report\` — Params: reportSid, plus any of: [name], [columns], [addColumns], [removeColumns], [filters], [addFilters], [removeFilters], [limits], [description], [allowChart]
- \`delete-report\` — Params: reportSid
- \`run-report\` — Params: reportSid, [filters], [dateFilter]
- \`search-reports\` — Params: [search]
- \`get-report-categories\` — Get category tree.
- \`auto-generate-report-columns\` — Params: reportSid
- \`export-report\` — Params: reportSid, exportType ("csv"|"excel")
- \`get-report-filters\` — Params: reportSid

**Report Data Types:**
- **Request** (default) — One row per request. Shows request-level data + form field data.
- **Task** — One row per task. Shows task-level data. Extra sources: Current Task, Any Data, Fixed Value, Matching Iteration.
- **Custom** — SQL queries. Built-in parameters: @user_sid, @date_limit_start, @date_limit_end.

**Report Column Sources:**
- Request: ID, Date Started, Date Completed, Last Milestone, Subject, Priority, Current Task, Current Assignee
- Requester/Client: Name, Email, Department, Title, Division, Cost Center, Location
- Data: Form question responses — maps to Task_Input|{fieldId}|{formSid}
- Task: Task name, date started, date completed, task status
- Task Completer/Recipient: Profile info

**Report column format:**
- Friendly: { field: "Request ID", alias: "ID", width: "65", sort: "Desc", format: "Date" }
- Explicit: { mapping_val: "Task_Input|fieldId|formSid", mapping_text: "Data - Form - Field", alias: "Name", width: "220" }
Column properties: alias, width, sort ("Asc"/"Desc"), sortable ("Yes"/"No"), format ("Date", "Currency", "Request Link", etc.), aggregate ("Count", "Sum", "Average"), chartoption ("Series"/"Datapoint")

**Report filter format:**
- { field: "Status", operator: "contains", value: "Approved", conjunction: "AND" }
- Operators: equals, not equals, contains, not contains, begins with, ends with, >, >=, <, <=, is empty, is not empty, is in date range.
- Exposed filters: Set expose: "Filter Label" to make user-editable at runtime.

**Report limits:** { startRange, endRange, dateRange, pageSize, exposeDateFilter, publishStatus }

**KPIs:** Measure time between task completions. Defined in Process Design → KPIs tab. Color-coded: Green/Yellow/Red thresholds.`
  },

  // ── Processes: process builder, tasks, transitions ──
  'processes': {
    name: 'Processes',
    description: 'Process builder, tasks, transitions, workflow instances',
    dependencies: [],
    pageHint: ['processes', 'process-design'],
    keywords: [
      'process', 'workflow', 'task', 'transition', 'approval', 'step', 'stage',
      'recipient', 'assignee', 'instance', 'start', 'launch', 'milestone',
      'task type', 'form task', 'email task', 'script task', 'notification'
    ],
    prompt: `**Level 1 — API Actions:**
- \`start-workflow-instance\` — params: processSid, [subject], [priority], [prefills]
- \`list-processes\` — no params needed

**Level 2 — Process Builder Actions:**
- \`create-process\` — params: name, [description], [category]
- \`add-process-task\` — params: processSid, name, taskType (Form|Approval|RestClient|Email|Script|Notification|WebForm), [formId]
- \`configure-task-transition\` — params: taskId, targetTaskId, [condition], [conditionType], [label]
- \`add-task-recipient\` — params: taskId, recipientType (user|group|role), recipientId
- \`configure-data-mapping\` — params: taskId, sourceField, targetField, [sourceCategory]
- \`configure-rest-client-task\` — params: taskId, method, url, [headers], [body], [auth]

**Process Flow for Integrations:**
1. Store credentials → POST /api/integrations/credentials/create
2. Define REST request → POST /api/integrations/restful-requests
3. Create/configure process → POST /api/processes
4. Add tasks → configure via task-dispatcher
5. Map data between tasks → POST /api/processes/processTask/{id}/mappings
6. Set transition rules → POST /api/processes/tasks/{id}/rules
7. Test → POST /api/task-dispatcher/{tasktype}/{id}/test`
  },

  // ── Integrations: REST client, credentials, external services ──
  'integrations': {
    name: 'Integrations',
    description: 'REST clients, credentials, Slack, Stripe, external APIs',
    dependencies: [],
    pageHint: ['integrations', 'credentials'],
    keywords: [
      'integration', 'connect', 'credential', 'api key', 'token', 'auth',
      'bearer', 'oauth', 'slack', 'stripe', 'salesforce', 'oracle', 'erp',
      'webhook', 'external', 'rest client', 'database', 'connection',
      'payment', 'notification'
    ],
    prompt: `### Integration Architecture Patterns:
THREE ways to connect Workflow to external services:

1. **REST Client Task** (in a process) — automated server-side API call during workflow execution
   - Created via: POST /api/integrations/restful-requests
   - Configured via: POST /api/task-dispatcher/restClient/{processTaskSid}/config/settings
   - Data mapped via: POST /api/processes/processTask/{processTaskSid}/mappings
   - Tested via: POST /api/task-dispatcher/restClient/{processTaskSid}/test

2. **RESTful Data Element** (on a form) — interactive API call triggered by form events
   - Value sources: Fixed, Form Field, Credential, Server Variable
   - Response mapping: JSONata expressions
   - Chaining: element.request.executeRequest(runId) + onResponse handlers
   - All requests execute server-side (no CORS)

3. **Database Connection** — direct SQL queries against external databases
   - Created via: POST /api/integrations/connections
   - Tested via: POST /api/integrations/connections/database/test

### Credentials Management:
- Store: POST /api/integrations/credentials/create
- Scope levels: task < process < user < tenant
- Referenced in requests via {{credential:name}} syntax
- Supports: bearer-token, api-key, basic-auth, custom

**Level 1 — API Actions:**
- \`create-credential\` — params: name, valueType, value, [resourceKind], [scope]
- \`create-restful-request\` — params: name, method, url, [headers], [body], [auth], [mappings]
- \`list-credentials\` — params: [valueType], [scope]
- \`create-ai-connection\` — params: name, provider, model, credentialId

**Composite Actions:**
- \`setup-slack-integration\` — params: slackToken, channelId, [credentialName], [requestName]
- \`setup-stripe-payment\` — params: stripeSecretKey, [credentialName]

### Slack Details:
- Webhook: POST to Incoming Webhook URL (single-channel)
- Bot Token: POST https://slack.com/api/chat.postMessage with Bearer xoxb-token
- Threading: thread_ts parameter
- Block Kit for rich messages

### Stripe Details:
- PaymentIntents API for SCA-compliant payments (form-urlencoded, NOT JSON)
- Amount always in cents ($50.00 = 5000)
- Client-side: Stripe.js + Payment Element
- Server-side: REST Client tasks`
  },

  // ── API Catalog: endpoint listing ──
  'api-catalog': {
    name: 'API Catalog',
    description: 'Browse and discover Workflow API endpoints',
    dependencies: [],
    pageHint: [],
    keywords: [
      'endpoint', '/api/', 'api', 'get', 'post', 'put', 'delete', 'rest',
      'url', 'route', 'service', 'swagger'
    ],
    prompt: `### Nutrient Workflow API (508 endpoints across 12 services):
The API catalog is available in the API Explorer panel. Key services:
- Forms API (/api/forms) — CRUD forms, questions, layouts, import/export
- Processes API (/api/processes) — CRUD processes, tasks, transitions, mappings
- Reports API (/api/reports) — CRUD reports, run, export, categories, KPIs
- Users API (/api/users) — User management, groups, roles, permissions
- Integrations API (/api/integrations) — Credentials, REST requests, connections, AI connections
- Task Dispatcher (/api/task-dispatcher) — Task execution, REST client config, testing
- Instances API (/api/instances) — Workflow instances, tasks, actions
- System API (/api/system) — Tenant settings, configuration
- Dashboard API (/api/dashboard) — Dashboard widgets, layouts
- Notifications API (/api/notifications) — Email templates, notification config
- Audit API (/api/audit) — Activity logs, audit trails
- Files API (/api/files) — File uploads, attachments

**Level 1 Actions:**
- \`get-form-json\` — params: formId
- \`list-forms\` — no params
- \`list-processes\` — no params`
  }
};

// ══════════════════════════════════════════════════════════
//  Skill Resolution — determines which skills to load
// ══════════════════════════════════════════════════════════

/**
 * Resolve which skill modules to load based on page context and user message.
 * Returns an array of skill keys.
 */
export function resolveSkills(userMessage, pageContext) {
  const msg = userMessage.toLowerCase();
  const page = pageContext?.page || 'unknown';
  const matched = new Set();

  // 1. Page-based defaults — always load relevant base skill
  const pageDefaults = {
    'forms': ['form-fields'],
    'reports': ['reports'],
    'processes': ['processes'],
    'process-design': ['processes'],
    'integrations': ['integrations'],
    'credentials': ['integrations'],
    'dashboard': ['reports'],
  };
  const defaults = pageDefaults[page] || [];
  defaults.forEach(s => matched.add(s));

  // 2. Keyword matching — scan message for skill triggers
  for (const [key, skill] of Object.entries(SKILL_MODULES)) {
    if (matched.has(key)) continue;
    const hitCount = skill.keywords.filter(kw => msg.includes(kw)).length;
    // Require at least 1 keyword match, weighted by specificity
    if (hitCount >= 1) {
      matched.add(key);
    }
  }

  // 3. Resolve dependencies — if form-rules is loaded, also load form-fields
  const resolved = new Set(matched);
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of resolved) {
      const deps = SKILL_MODULES[key]?.dependencies || [];
      for (const dep of deps) {
        if (!resolved.has(dep)) {
          resolved.add(dep);
          changed = true;
        }
      }
    }
  }

  // 4. If nothing matched (generic question like "hello"), don't load any skills
  //    The core prompt is sufficient for general conversation

  return [...resolved];
}

/**
 * Build the assembled skill prompt text from resolved skill keys.
 */
export function buildSkillPrompt(skillKeys) {
  if (skillKeys.length === 0) return '';

  const sections = skillKeys
    .map(key => SKILL_MODULES[key])
    .filter(Boolean)
    .map(skill => skill.prompt);

  return '\n\n## Loaded Skills\n\n' + sections.join('\n\n');
}

/**
 * Get a one-line menu of all available skills (for the core prompt).
 */
export function getSkillMenu() {
  return Object.entries(SKILL_MODULES)
    .map(([key, skill]) => `- **${skill.name}**: ${skill.description}`)
    .join('\n');
}

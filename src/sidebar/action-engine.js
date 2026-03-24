// ── Workflow Copilot Action Engine ──
// Handles executable actions: parses AI responses for action blocks,
// shows confirmation UI, executes multi-step API sequences, and reports results.

// ── Action Log ──
// Captures every action lifecycle: LLM raw output → parsing → normalization → execution → result
// Persisted to chrome.storage.local for debugging across sessions.
class ActionLog {
  constructor() {
    this.entries = [];
    this.maxEntries = 200;
    this._loaded = false;
  }

  async load() {
    if (this._loaded) return;
    try {
      const stored = await new Promise(resolve => {
        chrome.storage.local.get('actionLog', (result) => resolve(result.actionLog || []));
      });
      this.entries = stored;
      this._loaded = true;
    } catch (e) {
      this.entries = [];
      this._loaded = true;
    }
  }

  async _persist() {
    try {
      await new Promise(resolve => {
        chrome.storage.local.set({ actionLog: this.entries }, resolve);
      });
    } catch (e) {
      console.warn('ActionLog: Failed to persist', e);
    }
  }

  // Create a new log entry for an action execution
  createEntry(actionId, rawParams) {
    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      actionId,
      actionLabel: ACTION_REGISTRY[actionId]?.label || actionId,
      rawParams: JSON.parse(JSON.stringify(rawParams)),
      normalizations: [],   // What the engine auto-corrected
      warnings: [],          // Non-fatal issues detected
      errors: [],            // Fatal errors
      status: 'pending',     // pending → executing → success | failed | skipped
      stepResults: [],
      duration: null,
      formIdSource: null,    // 'llm' | 'auto-injected' | 'missing'
      fieldResolution: null, // How fields were resolved (by label, ClientID, partial, etc.)
      autoCreated: false,    // Whether a field was auto-created
      backupPushed: false    // Whether a backup was pushed to the stack
    };
    this.entries.push(entry);

    // Trim old entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    return entry;
  }

  // Log a normalization that was applied
  addNormalization(entry, field, from, to) {
    entry.normalizations.push({
      field,
      from: typeof from === 'object' ? JSON.stringify(from).slice(0, 200) : String(from),
      to: typeof to === 'object' ? JSON.stringify(to).slice(0, 200) : String(to),
      timestamp: new Date().toISOString()
    });
  }

  // Log a warning (non-fatal issue)
  addWarning(entry, message, details) {
    entry.warnings.push({ message, details: details || null, timestamp: new Date().toISOString() });
  }

  // Log an error
  addError(entry, message, details) {
    entry.errors.push({ message, details: details || null, timestamp: new Date().toISOString() });
  }

  // Log a step result
  addStepResult(entry, stepName, success, data) {
    entry.stepResults.push({
      step: stepName,
      success,
      status: data?.status || null,
      error: data?.error || null,
      timestamp: new Date().toISOString()
    });
  }

  // Finalize the entry
  async finalize(entry, status) {
    entry.status = status;
    entry.duration = new Date() - new Date(entry.timestamp);
    await this._persist();
  }

  // Get entries filtered by status, actionId, or time range
  query(filter = {}) {
    let results = [...this.entries];
    if (filter.status) results = results.filter(e => e.status === filter.status);
    if (filter.actionId) results = results.filter(e => e.actionId === filter.actionId);
    if (filter.hasErrors) results = results.filter(e => e.errors.length > 0);
    if (filter.hasWarnings) results = results.filter(e => e.warnings.length > 0 || e.normalizations.length > 0);
    if (filter.since) results = results.filter(e => new Date(e.timestamp) >= new Date(filter.since));
    return results.reverse(); // Most recent first
  }

  // Get summary stats
  getStats() {
    const total = this.entries.length;
    const success = this.entries.filter(e => e.status === 'success').length;
    const failed = this.entries.filter(e => e.status === 'failed').length;
    const withNormalizations = this.entries.filter(e => e.normalizations.length > 0).length;
    const withWarnings = this.entries.filter(e => e.warnings.length > 0).length;
    const autoCreated = this.entries.filter(e => e.autoCreated).length;

    // Group errors by type
    const errorTypes = {};
    for (const entry of this.entries) {
      for (const err of entry.errors) {
        const key = err.message.split(':')[0].trim();
        errorTypes[key] = (errorTypes[key] || 0) + 1;
      }
    }

    return { total, success, failed, withNormalizations, withWarnings, autoCreated, errorTypes };
  }

  // Clear all entries
  async clear() {
    this.entries = [];
    await this._persist();
  }
}

// Singleton instance
const actionLog = new ActionLog();
// Module-level ref to current log entry (set during executeAction, used by buildBody functions)
let _currentLogEntry = null;

// ── Action Registry ──
// Each action defines: id, label, description, steps[] (API calls), and optional validation
// Helper: find section by ClientID OR Label (case-insensitive)
// Helper: check if a field matches an identifier (by ClientID or Label, case-insensitive)
function fieldMatches(item, identifier) {
  if (!item || !identifier) return false;
  if (item.ClientID === identifier) return true;
  const lower = identifier.toLowerCase();
  if (item.Label && item.Label.toLowerCase() === lower) return true;
  if (item.Label && item.Label.toLowerCase().replace(/\s+/g, '') === lower.replace(/\s+/g, '')) return true;
  // Handle prefix-less match: "PhoneNumber" should match "txtPhoneNumber"
  if (item.ClientID && item.ClientID.toLowerCase().includes(lower.replace(/\s+/g, '').toLowerCase())) return true;
  return false;
}

// Helper: extract fields from layout by ClientID or Label, removing them from their current location
function extractFieldsFromLayout(layout, fieldIdentifiers) {
  const extracted = [];
  const notFound = [];

  for (const id of fieldIdentifiers) {
    let found = false;
    for (const section of layout) {
      if (found) break;
      for (const container of (section.contents || [])) {
        if (found) break;
        for (const column of (container.columns || [])) {
          const idx = (column.items || []).findIndex(item => fieldMatches(item, id));
          if (idx !== -1) {
            const field = column.items.splice(idx, 1)[0];
            extracted.push(field);
            found = true;
            if (_currentLogEntry) {
              actionLog.addNormalization(_currentLogEntry, 'fieldResolution',
                `identifier "${id}"`, `resolved to "${field.Label || field.ClientID}"`);
            }
          }
        }
      }
    }
    if (!found) {
      notFound.push(id);
      if (_currentLogEntry) {
        actionLog.addWarning(_currentLogEntry, 'Field not found for extraction', `"${id}" not found in layout`);
      }
    }
  }

  return { extracted, notFound };
}

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
  if (section) return section;
  // Try "Section N" pattern → resolve to Nth section (1-based)
  const sectionNumMatch = lower.match(/^section\s*(\d+)$/);
  if (sectionNumMatch) {
    const idx = parseInt(sectionNumMatch[1]) - 1;
    if (idx >= 0 && idx < layout.length) return layout[idx];
  }
  // If only one section exists and identifier looks generic, use it
  if (layout.length === 1 && (lower.includes('existing') || lower.includes('first') || lower.includes('current') || lower.includes('only'))) {
    return layout[0];
  }
  return null;
}

// ── REST Request Normalizers ──
// Converts headers/queryParams from various LLM formats into the correct array-of-objects format.
// Accepts: object {"Content-Type": "..."}, array [{key, value}], or already-correct array [{key, value, enabled, source}]
function normalizeKeyValueArray(input, _logEntry, _fieldName) {
  if (!input) return [];
  if (Array.isArray(input)) {
    const result = input.map(item => ({
      key: item.key || '',
      value: item.value || '',
      enabled: item.enabled !== undefined ? item.enabled : true,
      source: item.source || 'fixed'
    }));
    // Log if items were missing required properties
    const fixed = input.filter(item => !item.enabled && item.enabled !== false || !item.source);
    if (fixed.length > 0 && _logEntry) {
      actionLog.addNormalization(_logEntry, _fieldName || 'keyValueArray', 'items missing enabled/source', `added defaults to ${fixed.length} items`);
    }
    return result;
  }
  if (typeof input === 'object') {
    // Convert plain object {"Content-Type": "application/json"} to array format
    if (_logEntry) {
      actionLog.addNormalization(_logEntry, _fieldName || 'keyValueArray',
        `plain object with ${Object.keys(input).length} keys`,
        `array of ${Object.keys(input).length} {key,value,enabled,source} objects`);
    }
    return Object.entries(input).map(([key, value]) => ({
      key,
      value: String(value),
      enabled: true,
      source: 'fixed'
    }));
  }
  return [];
}

// Normalizes body from LLM format into the correct structured format.
// Accepts: string, object with type/raw/urlEncoded, or plain key-value object
function normalizeBody(input, _logEntry) {
  const empty = { type: 'none', contentType: 'none', raw: '', formData: [], urlEncoded: [] };
  if (!input) return empty;
  if (typeof input === 'string') {
    if (_logEntry) {
      actionLog.addNormalization(_logEntry, 'body', 'raw string', 'structured {type:"raw", contentType:"application/json"}');
    }
    return { type: 'raw', contentType: 'application/json', raw: input, formData: [], urlEncoded: [] };
  }
  if (typeof input === 'object' && input.type) {
    // Already structured — normalize sub-arrays
    return {
      type: input.type || 'none',
      contentType: input.contentType || 'none',
      raw: input.raw || '',
      formData: (input.formData || []).map(item => ({
        key: item.key || '', value: item.value || '', enabled: true, source: item.source || 'fixed'
      })),
      urlEncoded: (input.urlEncoded || []).map(item => ({
        key: item.key || '', value: item.value || '', enabled: true, source: item.source || 'fixed',
        ...(item.credentialId ? { credentialId: item.credentialId, credentialField: item.credentialField } : {})
      }))
    };
  }
  if (typeof input === 'object') {
    if (_logEntry) {
      actionLog.addNormalization(_logEntry, 'body',
        `plain object with keys: ${Object.keys(input).join(', ')}`,
        'structured {type:"form", urlEncoded:[...]}');
    }
    return {
      type: 'form',
      contentType: 'none',
      raw: '',
      formData: [],
      urlEncoded: Object.entries(input).map(([key, value]) => ({
        key,
        value: String(value),
        enabled: true,
        source: 'fixed'
      }))
    };
  }
  return empty;
}

// Normalizes response mappings from LLM format into the correct structure.
// Each mapping maps a JSONPath from the API response to a form field or server variable.
function normalizeResponseMappings(input, _logEntry) {
  if (!input || !Array.isArray(input)) return [];
  return input.map(m => {
    const normalized = {
      responsePath: m.responsePath || m.path || '',
      mapTo: m.mapTo || 'field',
      serverVariableName: m.serverVariableName || '',
      fieldId: m.fieldId || m.field || '',
      filename: m.filename || {},
      contentType: m.contentType || {}
    };
    // Log if LLM used shorthand keys
    if ((m.path || m.field) && _logEntry) {
      actionLog.addNormalization(_logEntry, 'restRequest.mappings',
        'shorthand keys (path/field)',
        'normalized to responsePath/fieldId');
    }
    return normalized;
  });
}

// Normalizes envVars (environment variable substitutions) for RESTful Elements.
// envVars allow placeholder replacement in the request body/URL with values from form fields.
// Format: { key: "__placeholder__", source: "field", fieldId: "txtFieldName", enabled: true }
function normalizeEnvVars(input, _logEntry) {
  if (!input || !Array.isArray(input)) return [];
  return input.map(ev => {
    const normalized = {
      key: ev.key || ev.placeholder || '',
      enabled: ev.enabled !== undefined ? ev.enabled : true,
      source: ev.source || 'field',
      fieldId: ev.fieldId || ev.field || ''
    };
    if ((ev.placeholder || ev.field) && _logEntry) {
      actionLog.addNormalization(_logEntry, 'restRequest.envVars',
        'shorthand keys (placeholder/field)',
        'normalized to key/fieldId');
    }
    return normalized;
  });
}

// ── Grid Column Definition Builder ──
// Takes a simplified column spec from the LLM and produces a complete columnDef object.
// The LLM provides: { name, displayName, type, width } + type-specific props.
// The engine fills in all platform-required properties.
const GRID_DATE_CELL_TEMPLATE = `<span>
              <span ng-if="row.entity[col.field]">
                <span ng-switch="grid.appScope.$parent.$ctrl.valueType(row.entity[col.field])">
                  <span ng-switch-when="string">
                    {{row.entity[col.field] | intDate:({dateOnly: true})}}
                  </span>
                  <span ng-switch-when="object">
                    {{row.entity[col.field].toISOString() | intDate:({dateOnly: true})}}
                  </span>
                </span>
              <span>
            </span>`;

// ── Grid column type normalization ──
const GRID_COLUMN_TYPE_ALIASES = {
  'text': 'string', 'str': 'string', 'varchar': 'string',
  'int': 'number', 'integer': 'number', 'float': 'number', 'decimal': 'number', 'numeric': 'number',
  'money': 'currency', 'dollar': 'currency', 'price': 'currency', 'amount': 'currency',
  'bool': 'boolean', 'checkbox': 'boolean', 'check': 'boolean', 'yesno': 'boolean', 'yes/no': 'boolean',
  'select': 'MultiChoiceSelectList', 'dropdown': 'MultiChoiceSelectList', 'selectlist': 'MultiChoiceSelectList',
  'multichoice': 'MultiChoiceSelectList', 'multi_choice': 'MultiChoiceSelectList',
  'file': 'FileAttachment', 'attachment': 'FileAttachment', 'upload': 'FileAttachment',
  'calendar': 'date', 'datetime': 'date', 'datepicker': 'date',
  'static': 'StaticText', 'label': 'StaticText', 'readonly': 'StaticText', 'display': 'StaticText',
  'formula': 'RowAggregation', 'computed': 'RowAggregation', 'calculated': 'RowAggregation', 'aggregate': 'RowAggregation'
};
const VALID_GRID_COLUMN_TYPES = ['string', 'number', 'currency', 'MultiChoiceSelectList', 'boolean', 'StaticText', 'date', 'FileAttachment', 'RowAggregation'];

function normalizeGridColumnType(rawType, _logEntry, colName) {
  if (!rawType) return 'string';
  if (VALID_GRID_COLUMN_TYPES.includes(rawType)) return rawType;
  const alias = GRID_COLUMN_TYPE_ALIASES[rawType.toLowerCase()];
  if (alias) {
    if (_logEntry) {
      actionLog.addNormalization(_logEntry, `Grid column "${colName}" type`,
        `"${rawType}" (LLM value)`, `"${alias}" (corrected)`);
    }
    return alias;
  }
  if (_logEntry) {
    actionLog.addWarning(_logEntry, `Unknown grid column type "${rawType}" for "${colName}"`,
      `Defaulting to "string".`);
  }
  return 'string';
}

function buildGridColumnDef(col, _logEntry) {
  const id = 'gridcol-' + Date.now() + Math.random().toString(36).slice(2, 5);
  const type = normalizeGridColumnType(col.type, _logEntry, col.name || col.displayName);

  // Base properties shared by all column types
  const def = {
    name: col.name,
    displayName: col.displayName || col.name,
    width: col.width || '*',
    type: type,
    enableCellEdit: col.enableCellEdit !== undefined ? col.enableCellEdit : true,
    id: col.id || id,
    cellClass: col.cellClass || null,
    headerCellClass: col.headerCellClass || null,
    footerCellClass: col.footerCellClass || null,
    selectedCurrencyFilter: null,
    footerCellFilter: col.footerCellFilter || null,
    validators: col.validators || { required: false },
    regex: col.regex || null,
    allowCellFocus: true,
    enableCellEditOnFocus: true,
    enableSorting: col.enableSorting !== undefined ? col.enableSorting : true,
    delete: false,
    aggregationColumns: null,
    rowAggregationType: null,
    editableCellTemplate: 'ui-grid/cellEditor',
    hidden: col.hidden || false,
    cellEditableCondition: col.cellEditableCondition !== undefined ? col.cellEditableCondition : true,
    enableHiding: false
  };

  // ── Type-specific enrichment ──
  if (type === 'string') {
    def.cellTooltip = true;
  }

  if (type === 'number') {
    def.cellClass = col.cellClass || 'rightAligned';
    if (col.footerCellFilter) def.footerCellFilter = col.footerCellFilter;
  }

  if (type === 'currency') {
    def.cellClass = col.cellClass || 'rightAligned';
    def.selectedCurrencyFilter = col.selectedCurrencyFilter || 'en-us';
    const cf = def.selectedCurrencyFilter;
    def.cellTemplate = `<span> {{grid.getCellValue(row, col) | intCurrency:"${cf}"}}</span>`;
    def.footerCellFilter = col.footerCellFilter || `intCurrency:"${cf}"`;
    def.aggregationType = col.aggregationType !== undefined ? col.aggregationType : 2;
    def.aggregationLabel = ' ';
  }

  if (type === 'MultiChoiceSelectList') {
    def.cellTemplate = '<int-question question="row.entity[col.field]"></int-question>';
    def.editableCellTemplate = '<int-question question="row.entity[col.field]"></int-question>';
    def.allowCellFocus = false;
    def.enableCellEditOnFocus = false;
    // Build the embedded question object
    def.question = {
      QuestionType: 'MultiChoiceSelectList',
      Label: col.displayName || col.name,
      Choices: (col.choices || []).map(c =>
        typeof c === 'string' ? { Label: c, Value: c } : { Label: c.Label || c.label, Value: c.Value || c.value || c.Label || c.label }
      ),
      multiple: col.multiple || false,
      flex: 100,
      ClientID: '',
      class: 'gridSelectList',
      show: true,
      dbSettings: { useDB: false },
      Answer: null,
      SelectedValue: null,
      disabled: false
    };
  }

  if (type === 'boolean') {
    // Default checkbox — no special template needed
  }

  if (type === 'StaticText') {
    def.hidden = true;
    def.enableSorting = false;
    def.visible = false;
    def.enableColumnMenu = false;
    def.cellTooltip = true;
  }

  if (type === 'date') {
    def.cellTemplate = GRID_DATE_CELL_TEMPLATE;
  }

  if (type === 'FileAttachment') {
    def.cellTemplate = '<int-question-file-attachment question="row.entity[col.field]" grid-ui="true"></int-question-file-attachment>';
    def.editableCellTemplate = '<int-question-file-attachment question="row.entity[col.field]" grid-ui="true"></int-question-file-attachment>';
    def.allowCellFocus = false;
    def.enableCellEditOnFocus = false;
    def.question = {
      QuestionType: 'FileAttachment',
      Label: 'File Attachment: ',
      flex: 100,
      ClientID: '',
      class: 'gridFileAttachment',
      show: true,
      Answer: [],
      events: { onChange: null }
    };
  }

  if (type === 'RowAggregation') {
    def.enableCellEdit = false;
    def.allowCellFocus = false;
    def.enableCellEditOnFocus = false;
    def.cellTemplate = "<div class='row-agg-total ui-grid-cell-contents'>{{grid.appScope.$ctrl.aggregateRow(row, col)}}</div>";
    def.editableCellTemplate = "<div class='row-agg-total ui-grid-cell-contents'>{{grid.appScope.$ctrl.aggregateRow(row, col)}}</div>";
    def.aggregationType = col.aggregationType !== undefined ? col.aggregationType : 2;
    def.aggregationLabel = ' ';
    def.rowAggregationType = col.rowAggregationType || 'multiply';
    // aggregationColumns will be resolved after all columns are built
    def._aggregationColumnNames = col.aggregationColumnNames || (col.aggregationColumns || []).map(c => c.name || c);
    if (col.footerCellFilter) def.footerCellFilter = col.footerCellFilter;
    if (col.selectedCurrencyFilter) {
      def.selectedCurrencyFilter = col.selectedCurrencyFilter;
      def.footerCellFilter = def.footerCellFilter || `intCurrency:"${col.selectedCurrencyFilter}"`;
    }
  }

  if (_logEntry && type !== 'string') {
    actionLog.addNormalization(_logEntry, `gridColumn:${col.name}`, `type "${type}"`, `built full columnDef with ${Object.keys(def).length} properties`);
  }

  return def;
}

// Resolves RowAggregation column references after all columnDefs are built.
// RowAggregation columns reference other columns by ID — this links them.
function resolveGridAggregationColumns(columnDefs) {
  for (const def of columnDefs) {
    if (def.type === 'RowAggregation' && def._aggregationColumnNames) {
      def.aggregationColumns = def._aggregationColumnNames.map(name => {
        const ref = columnDefs.find(c => c.name === name);
        if (!ref) return null;
        // Build the reference object matching the platform format
        return {
          id: ref.id,
          name: ref.name,
          displayName: ref.displayName,
          type: ref.type,
          visible: !ref.hidden,
          width: ref.width,
          cellClass: ref.cellClass,
          headerCellClass: ref.headerCellClass,
          footerCellClass: ref.footerCellClass,
          enableSorting: ref.enableSorting,
          enableCellEdit: ref.enableCellEdit,
          validators: ref.validators,
          regex: ref.regex,
          enableCellEditOnFocus: ref.enableCellEditOnFocus,
          allowCellFocus: ref.allowCellFocus,
          enableHiding: ref.enableHiding,
          ...(ref.selectedCurrencyFilter ? {
            selectedCurrencyFilter: ref.selectedCurrencyFilter,
            cellTemplate: ref.cellTemplate,
            aggregationType: ref.aggregationType,
            aggregationLabel: ref.aggregationLabel
          } : {}),
          ...(ref.footerCellFilter ? { footerCellFilter: ref.footerCellFilter } : {}),
          cellEditableCondition: ref.cellEditableCondition,
          editableCellTemplate: ref.editableCellTemplate
        };
      }).filter(Boolean);
      delete def._aggregationColumnNames;
    }
  }
}

// ── Grid Row Data Builder ──
// Given finalized columnDefs and a row count, produces row objects
// with correct default values per column type. Complex types (SelectList, FileAttachment)
// get deep-cloned embedded question objects with unique ClientIDs.
function buildGridRowData(columnDefs, rowCount) {
  const rows = [];
  for (let r = 0; r < rowCount; r++) {
    const row = {};
    for (const col of columnDefs) {
      if (col.type === 'MultiChoiceSelectList' && col.question) {
        // Deep clone with unique ClientID per row
        const q = JSON.parse(JSON.stringify(col.question));
        q.ClientID = Date.now() + r;
        q.events = { onChange: null, onBlur: null, onFocus: null, onResponse: null };
        q.formSid = '';
        q.builderMode = false;
        q.loaded = true;
        q.isdirty = false;
        q.originalAnswer = null;
        q.id = q.ClientID;
        q.islive = false;
        q.selectedValue = null;
        q.validation = {};
        row[col.name] = q;
      } else if (col.type === 'FileAttachment' && col.question) {
        const q = JSON.parse(JSON.stringify(col.question));
        q.uploadParentFolder = 'temp';
        q.uploadPath = '/';
        q.validation = {};
        row[col.name] = q;
      } else if (col.type === 'StaticText') {
        row[col.name] = '';
      } else {
        // string, number, currency, boolean, date, RowAggregation → null
        row[col.name] = null;
      }
    }
    rows.push(row);
  }
  return rows;
}

// Default gridOptions properties (ui-grid boilerplate the platform expects)
const GRID_OPTIONS_DEFAULTS = {
  enableRowHashing: true,
  flatEntityAccess: false,
  showHeader: true,
  headerRowHeight: 30,
  rowHeight: 30,
  showGridFooter: false,
  columnFooterHeight: 30,
  gridFooterHeight: 30,
  columnWidth: 50,
  maxVisibleColumnCount: 200,
  virtualizationThreshold: 20,
  columnVirtualizationThreshold: 10,
  excessRows: 4,
  scrollThreshold: 4,
  excessColumns: 4,
  aggregationCalcThrottle: 500,
  wheelScrollThrottle: 70,
  scrollDebounce: 300,
  enableHiding: true,
  suppressMultiSort: false,
  filterContainer: 'headerCell',
  enableColumnMenus: true,
  enableVerticalScrollbar: 1,
  enableHorizontalScrollbar: 1,
  enableMinHeightCheck: true,
  minimumColumnSize: 30,
  headerTemplate: null,
  footerTemplate: 'ui-grid/ui-grid-footer',
  gridFooterTemplate: 'ui-grid/ui-grid-grid-footer',
  rowTemplate: 'ui-grid/ui-grid-row',
  gridMenuTemplate: 'ui-grid/uiGridMenu',
  disableGridMenuHideOnScroll: false,
  menuButtonTemplate: 'ui-grid/ui-grid-menu-button',
  menuItemTemplate: 'ui-grid/uiGridMenuItem',
  appScopeProvider: null,
  cellEditableCondition: true,
  modifierKeysToMultiSelectCells: false,
  keyDownOverrides: [],
  importerShowMenu: true,
  exporterSuppressMenu: false,
  exporterMenuLabel: 'Export',
  exporterSuppressColumns: [],
  exporterCsvColumnSeparator: ',',
  exporterCsvFilename: 'download.csv',
  exporterPdfFilename: 'download.pdf',
  exporterExcelFilename: 'download.xlsx',
  exporterExcelSheetName: 'Sheet1',
  exporterOlderExcelCompatibility: false,
  exporterIsExcelCompatible: false,
  exporterMenuItemOrder: 200,
  exporterPdfDefaultStyle: { fontSize: 11 },
  exporterPdfTableStyle: { margin: [0, 5, 0, 15] },
  exporterPdfTableHeaderStyle: { bold: true, fontSize: 12, color: 'black' },
  exporterPdfHeader: null,
  exporterPdfFooter: null,
  exporterPdfOrientation: 'landscape',
  exporterPdfPageSize: 'A4',
  exporterPdfMaxGridWidth: 720,
  exporterMenuAllData: true,
  exporterMenuVisibleData: true,
  exporterMenuSelectedData: true,
  exporterMenuCsv: true,
  exporterMenuPdf: true,
  exporterMenuExcel: true,
  exporterHeaderFilterUseName: false,
  exporterColumnScaleFactor: 3.5,
  exporterFieldApplyFilters: false,
  exporterAllDataFn: null
};

// ── Field Template Builder ──
// Ensures all question types have the correct full structure.
// The LLM provides minimal params; the engine builds the complete object.
// ── QuestionType normalization map ──
// LLMs frequently use display names or wrong casing. This maps common mistakes to the correct internal type.
const QUESTION_TYPE_ALIASES = {
  // Radio button variants
  'radiobuttons': 'DbRadioButton', 'radiobutton': 'DbRadioButton', 'radio': 'DbRadioButton',
  'radio buttons': 'DbRadioButton', 'radio_buttons': 'DbRadioButton', 'radios': 'DbRadioButton',
  // Checkbox variants
  'checkbox': 'DbCheckbox', 'checkboxes': 'DbCheckbox', 'check': 'DbCheckbox',
  'check_boxes': 'DbCheckbox', 'check boxes': 'DbCheckbox',
  // Select list variants
  'selectlist': 'DbSelectList', 'select': 'DbSelectList', 'dropdown': 'DbSelectList',
  'select_list': 'DbSelectList', 'select list': 'DbSelectList', 'dropdownlist': 'DbSelectList',
  // Email variants
  'email': 'EmailAddress', 'emailfield': 'EmailAddress', 'email_address': 'EmailAddress',
  // Text variants
  'textarea': 'LongText', 'text_area': 'LongText', 'multiline': 'LongText',
  'text': 'ShortText', 'textfield': 'ShortText', 'short_text': 'ShortText',
  'shorttext': 'ShortText', 'longtext': 'LongText', 'long_text': 'LongText',
  // RESTful variants
  'restfulelement': 'RESTfulElement', 'restful': 'RESTfulElement', 'rest': 'RESTfulElement',
  'restfulElement': 'RESTfulElement', 'restelement': 'RESTfulElement', 'rest_element': 'RESTfulElement',
  // Other variants
  'file': 'FileAttachment', 'fileupload': 'FileAttachment', 'file_attachment': 'FileAttachment',
  'date': 'Calendar', 'datepicker': 'Calendar', 'date_picker': 'Calendar',
  'richtext': 'RichText', 'rich_text': 'RichText', 'html': 'RichText',
  'link': 'Hyperlink', 'url': 'Hyperlink',
  'phone': 'ShortText', 'currency': 'Number',
  'contactsearch': 'ContactSearch', 'contact_search': 'ContactSearch', 'contact': 'ContactSearch',
  'searchbox': 'SearchBox', 'search_box': 'SearchBox', 'search': 'SearchBox',
  'timezone': 'TimeZone', 'time_zone': 'TimeZone',
  'aibox': 'AIBox', 'ai_box': 'AIBox', 'ai': 'AIBox',
  'btn': 'Button', 'button': 'Button',
  'sig': 'Signature', 'sign': 'Signature',
  'pwd': 'Password', 'pass': 'Password',
  'grid': 'Grid', 'table': 'Grid', 'datagrid': 'Grid'
};

// ── ClientID prefix conventions ──
const CLIENTID_PREFIXES = {
  'ShortText': 'txt', 'LongText': 'ltxt', 'Number': 'num', 'Hyperlink': 'lnk',
  'EmailAddress': 'eml', 'Calendar': 'cal', 'DbSelectList': 'ddl', 'DbCheckbox': 'chk',
  'DbRadioButton': 'rad', 'FileAttachment': 'fa', 'Signature': 'sig',
  'ContactSearch': 'cs', 'SearchBox': 'srch', 'RESTfulElement': 'rest_',
  'Grid': 'grd', 'Button': 'btn', 'AIBox': 'ai', 'RichText': 'rtxt',
  'Password': 'pwd', 'TimeZone': 'tz'
};

// Normalizes a QuestionType string from LLM output to the correct internal value.
function normalizeQuestionType(rawType, _logEntry) {
  if (!rawType) return 'ShortText';
  // Already correct — check exact match against known types
  const VALID_TYPES = [
    'ShortText', 'LongText', 'DbSelectList', 'DbRadioButton', 'DbCheckbox',
    'Calendar', 'EmailAddress', 'Number', 'FileAttachment', 'RichText',
    'Hyperlink', 'ContactSearch', 'SearchBox', 'Signature', 'Password',
    'TimeZone', 'Grid', 'AIBox', 'RESTfulElement', 'Button'
  ];
  if (VALID_TYPES.includes(rawType)) return rawType;

  // Try alias lookup (case-insensitive)
  const alias = QUESTION_TYPE_ALIASES[rawType.toLowerCase()];
  if (alias) {
    if (_logEntry) {
      actionLog.addNormalization(_logEntry, 'QuestionType',
        `"${rawType}" (LLM value)`, `"${alias}" (corrected)`);
    }
    return alias;
  }

  // Unknown type — warn and default to ShortText
  if (_logEntry) {
    actionLog.addWarning(_logEntry, `Unknown QuestionType "${rawType}"`,
      `Not in valid types or alias map. Defaulting to ShortText.`);
  }
  return 'ShortText';
}

// Validates and auto-corrects ClientID prefix for a given QuestionType.
function normalizeClientID(clientId, questionType, _logEntry) {
  if (!clientId) return clientId;
  const expectedPrefix = CLIENTID_PREFIXES[questionType];
  if (!expectedPrefix) return clientId; // Unknown type, can't validate

  // Check if ClientID already starts with any known prefix (it's intentional)
  const allPrefixes = Object.values(CLIENTID_PREFIXES);
  const hasKnownPrefix = allPrefixes.some(p => clientId.startsWith(p));

  if (hasKnownPrefix) {
    // Has a prefix — check if it's the RIGHT one for this type
    if (!clientId.startsWith(expectedPrefix)) {
      if (_logEntry) {
        actionLog.addWarning(_logEntry, `ClientID prefix mismatch`,
          `"${clientId}" has wrong prefix for ${questionType}. Expected prefix: "${expectedPrefix}". Not auto-correcting — verify manually.`);
      }
    }
    return clientId;
  }

  // No known prefix — auto-prepend the correct one
  const corrected = expectedPrefix + clientId;
  if (_logEntry) {
    actionLog.addNormalization(_logEntry, 'ClientID',
      `"${clientId}" (no prefix)`, `"${corrected}" (added ${expectedPrefix} for ${questionType})`);
  }
  return corrected;
}

// ── Report Normalizers & Helpers ──

// Standard report column mapping_val patterns for common request fields
const STANDARD_REPORT_COLUMNS = {
  // Request-level fields
  'id': { mapping_val: 'Request|ID', mapping_text: 'Request - ID' },
  'request id': { mapping_val: 'Request|ID', mapping_text: 'Request - ID' },
  'status': { mapping_val: 'Request|LastMilestone', mapping_text: 'Request - Last Milestone' },
  'last milestone': { mapping_val: 'Request|LastMilestone', mapping_text: 'Request - Last Milestone' },
  'milestone': { mapping_val: 'Request|LastMilestone', mapping_text: 'Request - Last Milestone' },
  'process name': { mapping_val: 'Request|ProcessName', mapping_text: 'Request - Process Name' },
  'process': { mapping_val: 'Request|ProcessName', mapping_text: 'Request - Process Name' },
  'date started': { mapping_val: 'Request|StartDate', mapping_text: 'Request - Date Started' },
  'start date': { mapping_val: 'Request|StartDate', mapping_text: 'Request - Date Started' },
  'date entered': { mapping_val: 'Request|StartDate', mapping_text: 'Request - Date Started' },
  'date completed': { mapping_val: 'Request|CompletedDate', mapping_text: 'Request - Date Completed' },
  'completed date': { mapping_val: 'Request|CompletedDate', mapping_text: 'Request - Date Completed' },
  'subject': { mapping_val: 'Request|Subject', mapping_text: 'Request - Subject' },
  'priority': { mapping_val: 'Request|Priority', mapping_text: 'Request - Priority' },
  'current task': { mapping_val: 'Request|CurrentTaskName', mapping_text: 'Request - Current Task' },
  'current assignee': { mapping_val: 'Request|CurrentAssignee', mapping_text: 'Request - Current Assignee' },
  // Requester-level fields
  'requester': { mapping_val: 'Requester|Name', mapping_text: 'Requester - Name' },
  'requester name': { mapping_val: 'Requester|Name', mapping_text: 'Requester - Name' },
  'requester email': { mapping_val: 'Requester|Email', mapping_text: 'Requester - Email' },
  'requester department': { mapping_val: 'Requester|Department', mapping_text: 'Requester - Department' },
  'requester title': { mapping_val: 'Requester|Title', mapping_text: 'Requester - Title' },
  'requester division': { mapping_val: 'Requester|Division', mapping_text: 'Requester - Division' },
  'requester cost center': { mapping_val: 'Requester|CostCenter', mapping_text: 'Requester - Cost Center' },
  'requester location': { mapping_val: 'Requester|Location', mapping_text: 'Requester - Location' },
  // Client-level fields
  'client': { mapping_val: 'Client|Name', mapping_text: 'Client - Name' },
  'client name': { mapping_val: 'Client|Name', mapping_text: 'Client - Name' },
  'client email': { mapping_val: 'Client|Email', mapping_text: 'Client - Email' },
  'client department': { mapping_val: 'Client|Department', mapping_text: 'Client - Department' },
  'client title': { mapping_val: 'Client|Title', mapping_text: 'Client - Title' },
  // Task-level fields (for Task reports)
  'task name': { mapping_val: 'Task|TaskName', mapping_text: 'Task - Task Name' },
  'task status': { mapping_val: 'Task|TaskStatus', mapping_text: 'Task - Task Status' },
  'task date started': { mapping_val: 'Task|StartDate', mapping_text: 'Task - Date Started' },
  'task date completed': { mapping_val: 'Task|CompletedDate', mapping_text: 'Task - Date Completed' },
  // Task Completer / Recipient
  'task completer': { mapping_val: 'TaskCompleter|Name', mapping_text: 'Task Completer - Name' },
  'task completer name': { mapping_val: 'TaskCompleter|Name', mapping_text: 'Task Completer - Name' },
  'task completer email': { mapping_val: 'TaskCompleter|Email', mapping_text: 'Task Completer - Email' },
  'task recipient': { mapping_val: 'TaskRecipient|Name', mapping_text: 'Task Recipient - Name' },
  'task recipient name': { mapping_val: 'TaskRecipient|Name', mapping_text: 'Task Recipient - Name' },
  'task recipient email': { mapping_val: 'TaskRecipient|Email', mapping_text: 'Task Recipient - Email' },
  // Status
  'task current status': { mapping_val: 'Status|TaskStatus', mapping_text: 'Status - Task Status' },
  // Last milestone date
  'last milestone date': { mapping_val: 'Request|LastMilestoneDate', mapping_text: 'Request - Last Milestone Date' },
  'milestone date': { mapping_val: 'Request|LastMilestoneDate', mapping_text: 'Request - Last Milestone Date' }
};

// Report filter operator aliases (LLM-friendly → API values)
const REPORT_OPERATOR_ALIASES = {
  'equals': 'Equals', 'equal': 'Equals', '=': 'Equals', '==': 'Equals',
  'not equals': 'Not_Equals', 'not equal': 'Not_Equals', '!=': 'Not_Equals', '<>': 'Not_Equals',
  'contains': 'Contains', 'like': 'Contains', 'includes': 'Contains',
  'not contains': 'Not_Contains', 'does not contain': 'Not_Contains', 'not like': 'Not_Contains',
  'begins with': 'Begins_With', 'starts with': 'Begins_With', 'startswith': 'Begins_With',
  'ends with': 'Ends_With', 'endswith': 'Ends_With',
  'greater than': 'Greater_Than', '>': 'Greater_Than', 'gt': 'Greater_Than',
  'greater than or equal': 'Greater_Than_Eq_To', '>=': 'Greater_Than_Eq_To', 'gte': 'Greater_Than_Eq_To',
  'less than': 'Less_Than', '<': 'Less_Than', 'lt': 'Less_Than',
  'less than or equal': 'Less_Than_Eq_To', '<=': 'Less_Than_Eq_To', 'lte': 'Less_Than_Eq_To',
  'is empty': 'Is_Empty', 'empty': 'Is_Empty', 'blank': 'Is_Empty',
  'is not empty': 'Is_Not_Empty', 'not empty': 'Is_Not_Empty', 'not blank': 'Is_Not_Empty'
};

// Report column format aliases
const REPORT_FORMAT_ALIASES = {
  'date': 'Date', 'short date': 'Short Date', 'long date': 'Long Date',
  'currency': 'Currency', 'money': 'Currency', '$': 'Currency',
  'number': 'Number', 'percent': 'Percent', '%': 'Percent',
  'attachment': 'Attachment - icon', 'attachment icon': 'Attachment - icon',
  'link': 'Link', 'email': 'Email'
};

// Report column aggregate aliases
const REPORT_AGGREGATE_ALIASES = {
  'count': 'Count', 'sum': 'Sum', 'average': 'Average', 'avg': 'Average',
  'min': 'Min', 'minimum': 'Min', 'max': 'Max', 'maximum': 'Max'
};

// Normalize a single report column from LLM-friendly format to API format
function normalizeReportColumn(col, index, _logEntry) {
  // If already in @-prefixed format, pass through
  if (col['@alias'] !== undefined) return col;

  const normalized = {};

  // Map friendly names to @-prefixed API keys (only include non-empty values)
  normalized['@alias'] = col.alias || col.name || col.label || col.displayName || '';
  if (col.width) normalized['@width'] = String(col.width);
  if (col.sort) normalized['@sort'] = col.sort;
  normalized['@sortable'] = col.sortable || 'Yes';
  normalized.index = index;
  normalized.isSelected = col.isSelected !== undefined ? col.isSelected : false;

  // Normalize format (only include if provided)
  if (col.format) {
    const formatLower = col.format.toLowerCase();
    normalized['@format'] = REPORT_FORMAT_ALIASES[formatLower] || col.format;
    if (normalized['@format'] !== col.format && _logEntry) {
      actionLog.addNormalization(_logEntry, 'column.format', col.format, normalized['@format']);
    }
  }

  // Normalize aggregate (only include if provided)
  if (col.aggregate) {
    const aggLower = col.aggregate.toLowerCase();
    normalized['@aggregate'] = REPORT_AGGREGATE_ALIASES[aggLower] || col.aggregate;
    if (normalized['@aggregate'] !== col.aggregate && _logEntry) {
      actionLog.addNormalization(_logEntry, 'column.aggregate', col.aggregate, normalized['@aggregate']);
    }
  }

  // Chart option (only include if provided)
  if (col.chartoption || col.chartOption) {
    normalized['@chartoption'] = col.chartoption || col.chartOption;
  }

  // Resolve mapping_val — either from standard columns or from explicit mapping
  if (col.mapping_val && col.mapping_text) {
    // Explicit mapping provided
    normalized.mapping_val = col.mapping_val;
    normalized.mapping_text = col.mapping_text;
  } else if (col.field) {
    // LLM provided a field reference — try to resolve
    const fieldLower = col.field.toLowerCase().trim();
    const standard = STANDARD_REPORT_COLUMNS[fieldLower];
    if (standard) {
      normalized.mapping_val = standard.mapping_val;
      normalized.mapping_text = standard.mapping_text;
      if (_logEntry) {
        actionLog.addNormalization(_logEntry, 'column.field', col.field, `resolved to ${standard.mapping_val}`);
      }
    } else if (col.formFieldId && col.formSid) {
      // Form field reference: Task_Input|{fieldId}|{formSid}
      normalized.mapping_val = `Task_Input|${col.formFieldId}|${col.formSid}`;
      normalized.mapping_text = `Data - ${col.formName || 'Form'} - ${col.alias || col.name || col.field}`;
    } else {
      // Can't resolve — pass through as-is and warn
      normalized.mapping_val = col.field;
      normalized.mapping_text = col.field;
      if (_logEntry) {
        actionLog.addWarning(_logEntry, `Could not resolve column field "${col.field}"`,
          'Provide mapping_val/mapping_text explicitly, or use standard field names like "Request ID", "Status", "Requester".');
      }
    }
  } else if (col.mapping_val) {
    normalized.mapping_val = col.mapping_val;
    normalized.mapping_text = col.mapping_text || col.mapping_val;
  }

  return normalized;
}

// Normalize a single report filter from LLM-friendly format to API format
function normalizeReportFilter(filter, _logEntry) {
  // If already in @-prefixed format, pass through
  if (filter['@operator'] !== undefined) return filter;

  const normalized = {};

  // Normalize operator
  const rawOp = (filter.operator || 'Contains').toLowerCase().trim();
  const resolvedOp = REPORT_OPERATOR_ALIASES[rawOp] || filter.operator || 'Contains';
  if (resolvedOp !== filter.operator && _logEntry) {
    actionLog.addNormalization(_logEntry, 'filter.operator', filter.operator, resolvedOp);
  }
  normalized['@operator'] = resolvedOp;

  // Conjunction
  normalized['@conjunction'] = filter.conjunction || filter.logic || 'AND';

  // Grouping (only include when present)
  const groupStart = filter.groupStart || filter.group_start || '';
  const groupEnd = filter.groupEnd || filter.group_end || '';
  if (groupStart) normalized['@group_start'] = groupStart;
  if (groupEnd) normalized['@group_end'] = groupEnd;

  // Expose (makes the filter available to end users when running the report)
  if (filter.expose) normalized.expose = filter.expose;

  // Value and text
  normalized.value = filter.value !== undefined ? String(filter.value) : '';
  normalized.text = filter.text || normalized.value;

  // Resolve mapping
  if (filter.mapping_val && filter.mapping_text) {
    normalized.mapping_val = filter.mapping_val;
    normalized.mapping_text = filter.mapping_text;
  } else if (filter.field) {
    const fieldLower = filter.field.toLowerCase().trim();
    const standard = STANDARD_REPORT_COLUMNS[fieldLower];
    if (standard) {
      normalized.mapping_val = standard.mapping_val;
      normalized.mapping_text = standard.mapping_text;
      if (_logEntry) {
        actionLog.addNormalization(_logEntry, 'filter.field', filter.field, `resolved to ${standard.mapping_val}`);
      }
    } else if (filter.formFieldId && filter.formSid) {
      normalized.mapping_val = `Task_Input|${filter.formFieldId}|${filter.formSid}`;
      normalized.mapping_text = `Data - ${filter.formName || 'Form'} - ${filter.field}`;
    } else {
      normalized.mapping_val = filter.field;
      normalized.mapping_text = filter.field;
      if (_logEntry) {
        actionLog.addWarning(_logEntry, `Could not resolve filter field "${filter.field}"`,
          'Provide mapping_val/mapping_text explicitly.');
      }
    }
  } else if (filter.mapping_val) {
    normalized.mapping_val = filter.mapping_val;
    normalized.mapping_text = filter.mapping_text || filter.mapping_val;
  }

  return normalized;
}

// Normalize limits from LLM-friendly format to API format
function normalizeReportLimits(limits, _logEntry) {
  const normalized = {};
  if (!limits) limits = {};

  // Map friendly keys to API keys
  const keyMap = {
    'startRange': 'StartRange', 'startDate': 'StartRange', 'start': 'StartRange',
    'endRange': 'EndRange', 'endDate': 'EndRange', 'end': 'EndRange',
    'dateRange': 'DateRange', 'days': 'DateRange',
    'pageSize': 'PageSize', 'limit': 'PageSize', 'perPage': 'PageSize',
    'exposeDateFilter': 'ExposeDateFilter', 'showDateFilter': 'ExposeDateFilter',
    'hideLink': 'HideLink',
    'includeLaunchRequest': 'IncludeLaunchRequest',
    'userFilter': 'UserFilter',
    'publishStatus': 'PublishStatus', 'status': 'PublishStatus',
    'version': 'Version'
  };

  for (const [key, value] of Object.entries(limits)) {
    // Check if it's already a correct key (capitalized)
    const normalizedKey = keyMap[key] || key;
    const strValue = String(value);

    // Normalize boolean-like values for Yes/No fields
    if (['ExposeDateFilter', 'HideLink', 'IncludeLaunchRequest', 'UserFilter'].includes(normalizedKey)) {
      if (value === true || strValue.toLowerCase() === 'true') {
        normalized[normalizedKey] = 'Yes';
      } else if (value === false || strValue.toLowerCase() === 'false') {
        normalized[normalizedKey] = 'No';
      } else {
        normalized[normalizedKey] = strValue;
      }
    } else {
      normalized[normalizedKey] = strValue;
    }

    if (normalizedKey !== key && _logEntry) {
      actionLog.addNormalization(_logEntry, 'limits.key', key, normalizedKey);
    }
  }

  // Defaults
  if (!normalized.StartRange) normalized.StartRange = '2018-01-01';
  if (!normalized.PageSize) normalized.PageSize = '25';
  if (!normalized.ExposeDateFilter) normalized.ExposeDateFilter = 'No';
  if (!normalized.HideLink) normalized.HideLink = 'No';
  if (!normalized.IncludeLaunchRequest) normalized.IncludeLaunchRequest = 'No';
  if (!normalized.UserFilter) normalized.UserFilter = 'No';
  if (!normalized.PublishStatus) normalized.PublishStatus = 'Development';
  if (!normalized.Version) normalized.Version = '2';

  return normalized;
}

// Build complete report JSON from LLM-friendly params
// Based on actual API format (GET /api/reports/{sid}) — NOT the IRML XML format.
// The API uses: name, objectSid, objectType, categorySid, description, optionsBMask,
// columns (array of {column: [...]}), filters (array of {filter: [...]}), limits (object).
// Fields like reportType, dataType are IRML-only.
// allowChart and hideInMyReports ARE accepted by the JSON API and must be included.
function buildReportJSON(params, _logEntry) {
  const report = {};

  // Top-level metadata (only fields the API accepts)
  report.name = params.name || 'New Report';
  report.objectType = params.objectType || 'Process';
  report.objectSid = params.objectSid || params.processSid || '';
  report.categorySid = params.categorySid || '';
  report.description = params.description || '';
  report.optionsBMask = params.optionsBMask || 0;
  report.allowChart = params.allowChart === true;
  report.hideInMyReports = params.hideInMyReports === true;

  // Normalize columns
  if (params.columns && Array.isArray(params.columns)) {
    report.columns = [{
      column: params.columns.map((col, i) => normalizeReportColumn(col, i, _logEntry))
    }];
  } else {
    report.columns = [];
  }

  // Normalize filters
  if (params.filters && Array.isArray(params.filters)) {
    report.filters = [{
      filter: params.filters.map(f => normalizeReportFilter(f, _logEntry))
    }];
  } else {
    report.filters = [];
  }

  // Normalize limits
  report.limits = normalizeReportLimits(params.limits, _logEntry);

  if (_logEntry) {
    actionLog.addStepResult(_logEntry, 'Report JSON built', true, {
      columns: (report.columns[0]?.column || []).length,
      filters: (report.filters[0]?.filter || []).length,
      limits: Object.keys(report.limits).length
    });
  }

  return report;
}

function buildFieldFromTemplate(field, _logEntry) {
  const timestamp = Date.now().toString();

  // ── Normalize QuestionType before anything else ──
  const normalizedType = normalizeQuestionType(field.QuestionType, _logEntry);
  const normalizedClientID = normalizeClientID(field.ClientID, normalizedType, _logEntry);

  const base = {
    id: field.id || 'new_' + timestamp,
    ClientID: normalizedClientID || '',
    type: 'Question_Type',
    Label: field.Label || '',
    QuestionType: normalizedType,
    displayName: field.displayName || normalizedType || 'Short Text',
    show: true,
    class: field.class || '',
    flex: field.flex || 100,
    validation: field.validation || {
      required: false,
      requiredMessage: 'This field is required',
      min: null, minMessage: null,
      max: null, maxMessage: null,
      regEx: null, regExMessage: null
    },
    events: field.events || { onFocus: null, onBlur: null },
    Choices: field.Choices || null,
    Answer: field.Answer || null,
    columnOrRow: field.columnOrRow || null,
    multiple: field.multiple || null,
    dbSettings: field.dbSettings || null,
    gridOptions: field.gridOptions || null,
    formtext: field.formtext || null,
    placeholder: field.placeholder || null,
    helpText: field.helpText || null,
    builderMode: true,
    loaded: true,
    isdirty: false,
    originalAnswer: null,
    islive: false,
    hidden: field.hidden || false,
    stopBlurSave: field.stopBlurSave || false
  };

  // ── Type-specific enrichment ──
  const qt = base.QuestionType;

  if (_logEntry) {
    // Log what the LLM provided vs what the template will build
    const providedKeys = Object.keys(field).filter(k => field[k] !== undefined && field[k] !== null);
    if (providedKeys.length < 5) {
      actionLog.addWarning(_logEntry, `Sparse field definition for ${qt}`, `LLM only provided: ${providedKeys.join(', ')}`);
    }
  }

  if (qt === 'Button') {
    // Buttons are FormTool_Type, NOT Question_Type — distinct category in Form Builder
    base.type = 'FormTool_Type';
    base.displayName = 'Button';
    // Remove question-specific properties that buttons don't have
    delete base.validation;
    delete base.dbSettings;
    delete base.gridOptions;
    delete base.Choices;
    delete base.Answer;
    delete base.columnOrRow;
    delete base.multiple;
    delete base.formtext;
    delete base.placeholder;
    delete base.helpText;
    delete base.originalAnswer;
    delete base.flex;
    // Button-specific properties — onClick is ALWAYS null in the field definition.
    // Click handlers are assigned in the form script, not in the field JSON.
    if (field.events && field.events.onClick && typeof field.events.onClick === 'string') {
      if (_logEntry) {
        actionLog.addWarning(_logEntry, 'Button onClick handler stripped',
          'Button click handlers must be assigned in form script (update-form-javascript), not in the field JSON. The onClick value has been set to null.');
      }
    }
    base.events = { onClick: null };
    base.new = true;
    base.validation = {};
  }

  if (qt === 'RESTfulElement') {
    base.displayName = 'RESTful Element';
    base.moduleDisabled = false;
    base.events = field.events || { onChange: null, onBlur: null, onFocus: null, onResponse: null };
    base.request = field.request || {};
    base.response = field.response || null;

    // Build the full restRequest structure
    const restReq = field.restRequest || (field.dbSettings && field.dbSettings.restRequest) || {};
    base.dbSettings = {
      mappings: (field.dbSettings && field.dbSettings.mappings) || [],
      useDB: false,
      restRequest: {
        runId: restReq.runId || null,
        method: restReq.method || 'GET',
        url: restReq.url || '',
        validateSSL: restReq.validateSSL !== undefined ? restReq.validateSSL : true,
        followRedirects: restReq.followRedirects !== undefined ? restReq.followRedirects : true,
        maxRedirects: restReq.maxRedirects || 5,
        persistCookies: restReq.persistCookies || false,
        // Headers MUST be an array of {key, value, enabled, source} objects
        headers: normalizeKeyValueArray(restReq.headers, _logEntry, 'restRequest.headers'),
        // Query params same structure
        queryParams: normalizeKeyValueArray(restReq.queryParams, _logEntry, 'restRequest.queryParams'),
        auth: Object.assign({
          type: 'none',
          credentialId: '',
          addTo: null,
          usernameKeyName: 'username',
          passwordKeyName: 'password',
          apiKeyName: 'apiKey',
          clientIdKeyName: 'client_id',
          clientSecretKeyName: 'client_secret',
          grantType: 'client_credentials',
          tokenUrl: null,
          scope: null
        }, restReq.auth || {}),
        body: normalizeBody(restReq.body, _logEntry),
        response: Object.assign({
          expectedStatus: [],
          enableTimeout: false,
          timeoutDuration: 30000,
          retryOnFailure: false,
          maxRetries: 3,
          responseMode: 'standard'
        }, restReq.response || {}),
        mappings: normalizeResponseMappings(restReq.mappings, _logEntry),
        envVars: normalizeEnvVars(restReq.envVars, _logEntry)
      },
      restRequestUISettings: field.restRequestUISettings || (field.dbSettings && field.dbSettings.restRequestUISettings) || {}
    };
  }

  if (qt === 'DbRadioButton') {
    base.displayName = 'Radio Buttons';
    base.columnOrRow = field.columnOrRow || 'row';
    base.dbSettings = field.dbSettings || { useDB: false };
  }

  if (qt === 'DbCheckbox') {
    base.displayName = 'Checkboxes';
    base.columnOrRow = field.columnOrRow || 'row';
    base.dbSettings = field.dbSettings || { useDB: false };
  }

  if (qt === 'DbSelectList') {
    base.displayName = 'Select List';
    base.dbSettings = field.dbSettings || { useDB: false };
  }

  if (qt === 'Calendar') {
    base.displayName = 'Calendar';
    base.dateFormat = field.dateFormat || 'L';
  }

  if (qt === 'EmailAddress') {
    base.displayName = 'Email Address';
  }

  if (qt === 'FileAttachment') {
    base.displayName = 'File Attachment';
  }

  if (qt === 'RichText') {
    base.displayName = 'Rich Text';
  }

  if (qt === 'Grid') {
    base.displayName = 'Grid';

    // Process columns through buildGridColumnDef — LLM can pass simplified columns or full columnDefs
    const rawColumns = (field.gridOptions && field.gridOptions.columnDefs) || field.columns || [];
    const columnDefs = rawColumns.map(col => buildGridColumnDef(col, _logEntry));

    // Resolve RowAggregation column references now that all columns are built
    resolveGridAggregationColumns(columnDefs);

    // Determine row count
    const rowCount = (field.gridOptions && field.gridOptions.rowsSpecified) || field.rowCount || 3;

    // Build row data from column definitions (all three arrays must be independent deep copies)
    const rowData = buildGridRowData(columnDefs, rowCount);

    // Build complete gridOptions
    base.gridOptions = Object.assign({}, GRID_OPTIONS_DEFAULTS, {
      enableCellEdit: true,
      enableCellEditOnFocus: false,
      enableFiltering: (field.gridOptions && field.gridOptions.enableFiltering) || false,
      enableSorting: true,
      minRowsToShow: String(Math.max(rowCount + 3, 6)),
      rowsSpecified: rowCount,
      maxHeight: (field.gridOptions && field.gridOptions.maxHeight) || 350,
      columnDefs: columnDefs,
      data: rowData,
      showAddRowButton: !(field.gridOptions && field.gridOptions.showAddRowButton === false),
      showColumnFooter: !(field.gridOptions && field.gridOptions.showColumnFooter === false),
      enableGridMenu: false,
      enableImporter: false,
      gridMenuCustomItems: [],
      allowUsersToDeleteRows: !(field.gridOptions && field.gridOptions.allowUsersToDeleteRows === false),
      excludeProperties: ['$$hashKey']
    });

    // Sync Answer, prefillValues, and originalAnswer with gridOptions.data
    base.Answer = JSON.parse(JSON.stringify(rowData));
    base.prefillValues = JSON.parse(JSON.stringify(rowData));
    base.originalAnswer = JSON.parse(JSON.stringify(rowData));

    // Build cellTemplates
    base.cellTemplates = {};
    if (columnDefs.some(c => c.type === 'date')) {
      base.cellTemplates.date = GRID_DATE_CELL_TEMPLATE;
    }

    // Grid-specific properties
    base.dontSaveDeleteColumn = true;
    base.enableImportExport = field.enableImportExport || false;
    base.buttons = field.buttons || {
      show: true,
      delete: { show: true, disabled: true },
      add: { show: true, disabled: false }
    };
    base.stopBlurSave = false;
    base.showLabel = field.showLabel !== false;
    base.Help = field.Help || '';
    base.showEditPanel = false;
    base.new = false;
    base.events = { onChange: null, onBlur: null, onFocus: null, onResponse: null };
    base.labelForDropDown = `${base.ClientID} / ${base.Label}`;
    base.labelForRuleString = base.Label;
  }

  if (qt === 'AIBox') {
    base.displayName = 'AI Box';
    base.moduleDisabled = false;
    base.dbSettings = field.dbSettings || { mappings: [], useDB: false };
  }

  if (qt === 'Signature') {
    base.displayName = 'Signature';
  }

  if (qt === 'Number') {
    base.displayName = 'Number';
  }

  if (qt === 'Hyperlink') {
    base.displayName = 'Hyperlink';
  }

  if (qt === 'Password') {
    base.displayName = 'Password';
  }

  if (qt === 'TimeZone') {
    base.displayName = 'Time Zone';
  }

  if (qt === 'ContactSearch') {
    base.displayName = 'Contact Search';
  }

  if (qt === 'SearchBox') {
    base.displayName = 'Search Box';
  }

  return base;
}

// ── Form Rule Builder ──
// Constructs complete rule JSON from simplified LLM input.
// The LLM provides: condition field(s), operator(s), value(s), effect(s), target(s).
// The engine resolves field labels→IDs, builds question snapshots, generates
// allowedOperators/actionOptions metadata, uiJson, ruleString, and inverse rule.

// Static metadata — same for every rule, every condition
const ALLOWED_OPERATORS = [
  { label: '!=', value: 'notEqual' },
  { label: '=', value: 'equal' },
  { label: '<', value: 'lessThan' },
  { label: '<=', value: 'lessThanInclusive' },
  { label: '>', value: 'greaterThan' },
  { label: '>=', value: 'greaterThanInclusive' },
  { label: 'contains', value: 'containsValue' },
  { label: 'does not contain', value: 'doesNotContainValue' },
  { label: 'is empty', value: 'isEmpty' },
  { label: 'is not empty', value: 'isNotEmpty' }
];

const ACTION_OPTIONS = [
  { label: 'show', value: 'show' },
  { label: 'hide', value: 'hide' },
  { label: 'disable', value: 'disable' },
  { label: 'enable', value: 'enable' },
  { label: 'read only', value: 'readOnly' },
  { label: 'editable', value: 'editable' },
  { label: 'required', value: 'required' },
  { label: 'unrequired', value: 'unrequired' },
  { label: 'set answer w/ value', value: 'set_answer_with_value' },
  { label: 'set answer w/ function', value: 'set_answer_with_function' }
];

// Operator alias map — normalizes LLM-provided operator strings to internal values
const OPERATOR_ALIASES = {
  '=': 'equal', '==': 'equal', '===': 'equal', 'equals': 'equal', 'is': 'equal', 'eq': 'equal',
  '!=': 'notEqual', '!==': 'notEqual', 'not equal': 'notEqual', 'not equals': 'notEqual',
  'is not': 'notEqual', 'ne': 'notEqual', 'neq': 'notEqual',
  '<': 'lessThan', 'less than': 'lessThan', 'lt': 'lessThan',
  '<=': 'lessThanInclusive', 'less than or equal': 'lessThanInclusive', 'lte': 'lessThanInclusive',
  '>': 'greaterThan', 'greater than': 'greaterThan', 'gt': 'greaterThan',
  '>=': 'greaterThanInclusive', 'greater than or equal': 'greaterThanInclusive', 'gte': 'greaterThanInclusive',
  'contains': 'containsValue', 'includes': 'containsValue',
  'does not contain': 'doesNotContainValue', 'not contains': 'doesNotContainValue',
  'excludes': 'doesNotContainValue',
  'is empty': 'isEmpty', 'empty': 'isEmpty', 'blank': 'isEmpty',
  'is not empty': 'isNotEmpty', 'not empty': 'isNotEmpty', 'has value': 'isNotEmpty'
};

// Effect alias map — normalizes LLM-provided action strings
const EFFECT_ALIASES = {
  'show': 'show', 'visible': 'show', 'display': 'show',
  'hide': 'hide', 'hidden': 'hide', 'invisible': 'hide',
  'disable': 'disable', 'disabled': 'disable',
  'enable': 'enable', 'enabled': 'enable',
  'readonly': 'readOnly', 'read only': 'readOnly', 'read-only': 'readOnly',
  'editable': 'editable', 'edit': 'editable',
  'required': 'required', 'require': 'required', 'mandatory': 'required',
  'unrequired': 'unrequired', 'unrequire': 'unrequired', 'optional': 'unrequired',
  'not required': 'unrequired',
  'set answer': 'set_answer_with_value', 'set value': 'set_answer_with_value',
  'set answer with value': 'set_answer_with_value',
  'set answer with function': 'set_answer_with_function', 'calculate': 'set_answer_with_function'
};

// Inverse effect mapping — for auto-generating inverse rules
const INVERSE_EFFECTS = {
  'show': 'hide', 'hide': 'show',
  'enable': 'disable', 'disable': 'enable',
  'editable': 'readOnly', 'readOnly': 'editable',
  'required': 'unrequired', 'unrequired': 'required'
};

// Inverse operator mapping — for auto-generating inverse rules
const INVERSE_OPERATORS = {
  'equal': 'notEqual', 'notEqual': 'equal',
  'lessThan': 'greaterThanInclusive', 'greaterThanInclusive': 'lessThan',
  'lessThanInclusive': 'greaterThan', 'greaterThan': 'lessThanInclusive',
  'containsValue': 'doesNotContainValue', 'doesNotContainValue': 'containsValue',
  'isEmpty': 'isNotEmpty', 'isNotEmpty': 'isEmpty'
};

function normalizeOperator(raw) {
  if (!raw) return 'equal';
  const alias = OPERATOR_ALIASES[raw.toLowerCase ? raw.toLowerCase() : raw];
  return alias || raw;
}

function normalizeEffect(raw) {
  if (!raw) return 'show';
  const alias = EFFECT_ALIASES[raw.toLowerCase ? raw.toLowerCase() : raw];
  return alias || raw;
}

// Resolves a field identifier (label or ClientID) to the actual field object from the form layout.
// Returns { field, id } where id is the numeric field id (used as fact/target in rules).
function resolveFieldForRule(formData, identifier) {
  const layout = formData.layout || [];
  for (const section of layout) {
    for (const container of (section.contents || [])) {
      for (const column of (container.columns || [])) {
        for (const item of (column.items || [])) {
          if (item.ClientID && (
            String(item.ClientID) === String(identifier) ||
            (item.Label && item.Label.toLowerCase() === String(identifier).toLowerCase()) ||
            (item.Label && item.Label.toLowerCase().includes(String(identifier).toLowerCase()))
          )) {
            return { field: item, id: item.id || item.ClientID };
          }
        }
      }
    }
  }
  return null;
}

// Resolves a section identifier (label or ClientID) to the section object.
function resolveSectionForRule(formData, identifier) {
  const layout = formData.layout || [];
  for (const section of layout) {
    if (String(section.ClientID) === String(identifier) ||
        (section.Label && section.Label.toLowerCase() === String(identifier).toLowerCase()) ||
        (section.Label && section.Label.toLowerCase().includes(String(identifier).toLowerCase()))) {
      return { section, id: section.ClientID || section.id };
    }
  }
  return null;
}

// Builds the question snapshot embedded in each condition (full field object clone)
function buildQuestionSnapshot(field) {
  const snap = {
    displayName: field.displayName || field.QuestionType || '',
    QuestionType: field.QuestionType,
    Label: field.Label,
    type: field.type || 'Question_Type',
    flex: field.flex || 100,
    ClientID: field.id || field.ClientID,
    class: field.class || '',
    show: field.show !== false,
    validation: field.validation || {},
    events: { onChange: null, onBlur: null, onFocus: null },
    Answer: field.Answer || null,
    new: false,
    id: field.id || field.ClientID,
    showEditPanel: false,
    loaded: true,
    isdirty: false,
    originalAnswer: field.originalAnswer || field.Answer || null,
    islive: false,
    stopBlurSave: field.stopBlurSave || false,
    labelForDropDown: `${field.id || field.ClientID} / ${field.Label}`,
    labelForRuleString: field.Label
  };
  // Type-specific snapshot properties
  if (field.Choices) snap.Choices = field.Choices;
  if (field.columnOrRow) snap.columnOrRow = field.columnOrRow;
  if (field.dbSettings) snap.dbSettings = field.dbSettings;
  if (field.multiple !== undefined) snap.multiple = field.multiple;
  if (field.selectedValue !== undefined) snap.selectedValue = field.selectedValue;
  return snap;
}

// Builds the functionSourceTargets for effects (list of number fields for calculations)
function buildFunctionSourceTargets(formData) {
  const choices = [];
  const layout = formData.layout || [];
  for (const section of layout) {
    for (const container of (section.contents || [])) {
      for (const column of (container.columns || [])) {
        for (const item of (column.items || [])) {
          if (item.QuestionType === 'Number' || item.QuestionType === 'ShortText' ||
              item.QuestionType === 'LongText' || item.QuestionType === 'DbSelectList') {
            const varName = String.fromCharCode(97 + choices.length); // a, b, c, ...
            choices.push({
              Value: `${item.id || item.ClientID}|${varName} `,
              Label: `${item.Label} as '${varName}'`
            });
          }
        }
      }
    }
  }
  return { Choices: choices, multiple: true };
}

// Builds the uiJson string for the rule builder UI
function buildUiJson(conditions, logic) {
  const rules = conditions.map(c => ({
    fact: c.fact,
    operator: c.operator,
    value: c.value,
    allowedOperators: ALLOWED_OPERATORS,
    noValueNeeded: c.noValueNeeded || false,
    selectListAnswer: c.selectListAnswer || false,
    question: c.question
  }));
  return JSON.stringify({
    group: {
      condition: logic === 'any' ? 'ANY' : 'ALL',
      rules: rules
    }
  });
}

// Builds the human-readable ruleString
function buildRuleString(conditions, logic) {
  const parts = conditions.map(c => {
    const label = c.question ? c.question.labelForRuleString || c.question.Label : String(c.fact);
    const opMap = {
      'equal': '=', 'notEqual': '!=',
      'lessThan': '<', 'lessThanInclusive': '<=',
      'greaterThan': '>', 'greaterThanInclusive': '>=',
      'containsValue': 'contains', 'doesNotContainValue': 'does not contain',
      'isEmpty': 'is empty', 'isNotEmpty': 'is not empty'
    };
    const op = opMap[c.operator] || c.operator;
    if (c.noValueNeeded) return `${label} ${op}`;
    return `${label} ${op} ${c.value}`;
  });
  const joiner = logic === 'any' ? ' <strong>OR</strong> ' : ' <strong>AND</strong> ';
  return '(' + parts.join(joiner) + ')';
}

// Builds a complete rule object from simplified params.
// params: { name, logic ("all"|"any"), conditions: [{field, operator, value}], effects: [{action, target, targetType, value?}] }
// formData: the full form object (from GET) used to resolve fields and build snapshots
function buildRule(params, formData, _logEntry) {
  const logic = (params.logic || 'all').toLowerCase();
  const functionSourceTargets = buildFunctionSourceTargets(formData);

  // Build conditions
  const builtConditions = [];
  const flattenedFacts = [];

  for (const cond of (params.conditions || [])) {
    const operator = normalizeOperator(cond.operator);
    const noValueNeeded = (operator === 'isEmpty' || operator === 'isNotEmpty');

    // Resolve the condition field
    const resolved = resolveFieldForRule(formData, cond.field);
    if (!resolved) {
      if (_logEntry) {
        actionLog.addError(_logEntry, `Rule condition field "${cond.field}" not found on form`);
      }
      throw new Error(`Rule condition field "${cond.field}" not found on form`);
    }

    const questionSnapshot = buildQuestionSnapshot(resolved.field);
    const hasChoices = resolved.field.Choices && resolved.field.Choices.length > 0;

    const builtCond = {
      fact: String(resolved.id),
      operator: operator,
      value: noValueNeeded ? '' : (cond.value || ''),
      allowedOperators: ALLOWED_OPERATORS,
      noValueNeeded: noValueNeeded,
      selectListAnswer: hasChoices,
      question: questionSnapshot
    };

    builtConditions.push(builtCond);
    if (!flattenedFacts.includes(String(resolved.id))) {
      flattenedFacts.push(String(resolved.id));
    }
  }

  // Build effects
  const builtEffects = [];
  for (const eff of (params.effects || [])) {
    const action = normalizeEffect(eff.action);
    const targetType = (eff.targetType || 'question').toLowerCase();

    let targetId;
    if (targetType === 'section') {
      const resolved = resolveSectionForRule(formData, eff.target);
      if (!resolved) {
        if (_logEntry) actionLog.addError(_logEntry, `Rule effect target section "${eff.target}" not found`);
        throw new Error(`Rule effect target section "${eff.target}" not found`);
      }
      targetId = resolved.id;
    } else {
      const resolved = resolveFieldForRule(formData, eff.target);
      if (!resolved) {
        if (_logEntry) actionLog.addError(_logEntry, `Rule effect target field "${eff.target}" not found`);
        throw new Error(`Rule effect target field "${eff.target}" not found`);
      }
      targetId = resolved.id || resolved.field.ClientID;
    }

    const builtEffect = {
      targetType: targetType,
      functionSourceTargets: functionSourceTargets,
      actionOptions: ACTION_OPTIONS,
      target: targetId,
      action: action
    };

    // For section targets, no QuestionType
    if (targetType === 'question') {
      const resolved = resolveFieldForRule(formData, eff.target);
      if (resolved) builtEffect.QuestionType = resolved.field.QuestionType;
    }

    // For set_answer_with_value
    if (action === 'set_answer_with_value' && eff.value !== undefined) {
      builtEffect.value = eff.value;
    }
    // For set_answer_with_function
    if (action === 'set_answer_with_function' && eff.function) {
      builtEffect.function = eff.function;
    }

    builtEffects.push(builtEffect);
  }

  // Assemble the conditions object
  const conditionsObj = {};
  conditionsObj[logic === 'any' ? 'any' : 'all'] = builtConditions;

  // Build the rule
  const rule = {
    flattenedRuleFacts: flattenedFacts,
    name: params.name || 'New Rule',
    uiJson: buildUiJson(builtConditions, logic),
    ruleString: buildRuleString(builtConditions, logic),
    conditions: conditionsObj,
    event: {
      type: 'ruleEvalTrue',
      params: {
        message: 'rule has eval\'d to true',
        effects: builtEffects
      }
    }
  };

  return rule;
}

// Auto-generates the inverse of a rule.
// Flips: conditions (operators inverted), effects (show↔hide, required↔unrequired), logic (any↔all for multi-condition).
function buildInverseRule(rule) {
  const inverse = JSON.parse(JSON.stringify(rule)); // deep clone
  inverse.name = rule.name + ' (Inverse)';

  // Flip logic: ANY→ALL, ALL→ANY (De Morgan's law for inverse)
  const origLogic = rule.conditions.any ? 'any' : 'all';
  const inverseLogic = origLogic === 'any' ? 'all' : 'any';

  // Get the original conditions array
  const origConditions = rule.conditions[origLogic] || [];

  // Invert each condition's operator
  const invertedConditions = origConditions.map(c => {
    const inv = JSON.parse(JSON.stringify(c));
    inv.operator = INVERSE_OPERATORS[c.operator] || c.operator;
    // For isEmpty/isNotEmpty, update noValueNeeded
    inv.noValueNeeded = (inv.operator === 'isEmpty' || inv.operator === 'isNotEmpty');
    return inv;
  });

  // Set the inverted conditions under the flipped logic key
  inverse.conditions = {};
  inverse.conditions[inverseLogic] = invertedConditions;

  // Invert effects
  inverse.event.params.effects = rule.event.params.effects.map(e => {
    const inv = JSON.parse(JSON.stringify(e));
    inv.action = INVERSE_EFFECTS[e.action] || e.action;
    return inv;
  }).filter(e => e.action); // Remove effects that have no inverse (e.g., set_answer)

  // Rebuild uiJson and ruleString for inverse
  inverse.uiJson = buildUiJson(invertedConditions, inverseLogic);
  inverse.ruleString = buildRuleString(invertedConditions, inverseLogic);

  return inverse;
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
        path: '/workflow/api/instances/start',
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
        path: '/workflow/napi/processes',
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
        path: '/workflow/api/forms',
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
        path: '/workflow/api/processes/create',
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
        path: (params) => `/workflow/api/processes/${params.processSid}/tasks`,
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
        path: (params) => `/workflow/api/processes/tasks/${params.taskId}/rules`,
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
        path: (params) => `/workflow/api/processes/processTask/${params.taskId}/recipients`,
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
        path: (params) => `/workflow/api/processes/processTask/${params.taskId}/mappings`,
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
        path: '/workflow/api/forms/create',
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
        path: '/workflow/api/forms/createWithLayout',
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
        path: (params) => `/workflow/api/forms/${params.formId}`,
        buildBody: () => null
      }
    ]
  },

  // update-form-layout REMOVED — too dangerous, LLM can wipe the form.
  // Use targeted actions (update-field, add-field-to-form, etc.) instead.

  'update-field': {
    id: 'update-field',
    label: 'Update Field Properties',
    category: 'forms',
    level: 2,
    description: 'Update properties of an existing field in place. Finds the field by ClientID or Label and merges the provided properties. Does NOT replace the field — only updates the keys you specify.',
    requiredParams: ['formId', 'fieldIdentifier', 'updates'],
    // fieldIdentifier: ClientID or Label of the field to update
    // updates: object of properties to merge (e.g., { Label: "New Name", validation: { required: true } })
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Update field and save',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) throw new Error('Could not retrieve form data');
          const layout = formData.layout;
          if (!layout) throw new Error('Form layout is missing');

          // Find the field across all sections/containers/columns
          let targetField = null;
          let resolutionMethod = null;
          const allFields = [];
          for (const section of layout) {
            for (const container of (section.contents || [])) {
              for (const column of (container.columns || [])) {
                for (const item of (column.items || [])) {
                  allFields.push(item);
                  if (!targetField && fieldMatches(item, params.fieldIdentifier)) {
                    targetField = item;
                    resolutionMethod = 'fieldMatches (direct/label/partial)';
                  }
                }
              }
            }
          }

          // Fallback: if identifier looks like a QuestionType, find the only field of that type
          if (!targetField) {
            const typeMap = {
              'restfulelement': 'RESTfulElement', 'restful': 'RESTfulElement', 'rest': 'RESTfulElement',
              'aibox': 'AIBox', 'grid': 'Grid', 'signature': 'Signature'
            };
            const lower = params.fieldIdentifier.toLowerCase().replace(/[\s_-]/g, '');
            const matchType = typeMap[lower];
            if (matchType) {
              const ofType = allFields.filter(f => f.QuestionType === matchType);
              if (ofType.length === 1) {
                targetField = ofType[0];
                resolutionMethod = `QuestionType fallback → ${matchType}`;
              } else if (ofType.length > 1) {
                if (_currentLogEntry) actionLog.addError(_currentLogEntry, 'Ambiguous field type', `Multiple ${matchType} fields: ${ofType.map(f => f.Label || f.ClientID).join(', ')}`);
                throw new Error(`Multiple ${matchType} fields found. Specify by Label or ClientID: ${ofType.map(f => f.Label || f.ClientID).join(', ')}`);
              }
            }
          }

          // Fallback: if identifier contains "stripe", "salesforce", etc., search labels for partial match
          if (!targetField) {
            const lower = params.fieldIdentifier.toLowerCase();
            targetField = allFields.find(f => f.Label && f.Label.toLowerCase().includes(lower));
            if (targetField) resolutionMethod = `partial label match → "${targetField.Label}"`;
          }

          // Log how the field was resolved (or not)
          if (_currentLogEntry) {
            _currentLogEntry.fieldResolution = targetField
              ? { method: resolutionMethod, resolved: targetField.Label || targetField.ClientID, identifier: params.fieldIdentifier }
              : { method: 'not found', identifier: params.fieldIdentifier, availableFields: allFields.map(f => f.Label || f.ClientID) };
          }

          // Auto-create: if field not found and updates contain restRequest config, create a RESTful Element
          if (!targetField && params.updates && (params.updates.dbSettings || params.updates.restRequest)) {
            const label = params.fieldIdentifier.replace(/^rest_?/i, '').replace(/([A-Z])/g, ' $1').trim();
            const clientId = 'rest_' + params.fieldIdentifier.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
            const newField = buildFieldFromTemplate({
              QuestionType: 'RESTfulElement',
              Label: label || 'RESTful Element',
              ClientID: clientId,
              restRequest: (params.updates.dbSettings && params.updates.dbSettings.restRequest) || params.updates.restRequest
            }, _currentLogEntry);

            if (_currentLogEntry) {
              _currentLogEntry.autoCreated = true;
              actionLog.addWarning(_currentLogEntry, 'Auto-created RESTful Element',
                `"${params.fieldIdentifier}" not found → created "${label}" (${clientId})`);
            }

            // Add to the last section's first container's first column
            const lastSection = layout[layout.length - 1];
            const container = (lastSection.contents || [])[0];
            if (container) {
              const column = (container.columns || [])[0];
              if (column) {
                if (!column.items) column.items = [];
                column.items.push(newField);
                return { node: formData };
              }
            }
            throw new Error('Could not find a valid location to insert the new RESTful Element');
          }

          if (!targetField) {
            if (_currentLogEntry) actionLog.addError(_currentLogEntry, 'Field not found',
              `"${params.fieldIdentifier}" not on form. Available: ${allFields.map(f => f.Label || f.ClientID).join(', ')}`);
            throw new Error(`Field "${params.fieldIdentifier}" not found on the form. Available fields: ${allFields.map(f => f.Label || f.ClientID).join(', ')}`);
          }

          // Deep merge the updates into the field
          function deepMerge(target, source) {
            for (const key of Object.keys(source)) {
              if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
                  && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
                deepMerge(target[key], source[key]);
              } else {
                target[key] = source[key];
              }
            }
          }

          // ── Normalize updates before merging ──
          const updates = params.updates;

          // Normalize QuestionType if LLM is trying to change it
          if (updates.QuestionType) {
            updates.QuestionType = normalizeQuestionType(updates.QuestionType, _currentLogEntry);
          }

          // Normalize restRequest sub-properties if updating a RESTful Element
          if (updates.dbSettings && updates.dbSettings.restRequest) {
            const rr = updates.dbSettings.restRequest;
            if (rr.headers) {
              rr.headers = normalizeKeyValueArray(rr.headers, _currentLogEntry, 'update restRequest.headers');
            }
            if (rr.queryParams) {
              rr.queryParams = normalizeKeyValueArray(rr.queryParams, _currentLogEntry, 'update restRequest.queryParams');
            }
            if (rr.body) {
              rr.body = normalizeBody(rr.body, _currentLogEntry);
            }
            if (rr.mappings) {
              rr.mappings = normalizeResponseMappings(rr.mappings, _currentLogEntry);
            }
            if (rr.envVars) {
              rr.envVars = normalizeEnvVars(rr.envVars, _currentLogEntry);
            }
          }

          // Sanitize events — handlers should always be null in field JSON
          // (actual handlers are assigned in form script)
          if (updates.events) {
            for (const key of Object.keys(updates.events)) {
              if (typeof updates.events[key] === 'string' && updates.events[key].length > 0) {
                if (_currentLogEntry) {
                  actionLog.addWarning(_currentLogEntry, `Event handler "${key}" stripped from update`,
                    'Event handlers must be assigned in form script (update-form-javascript), not in field JSON.');
                }
                updates.events[key] = null;
              }
            }
          }

          deepMerge(targetField, updates);

          return { node: formData };
        }
      }
    ]
  },

  'update-form-javascript': {
    id: 'update-form-javascript',
    label: 'Update Form JavaScript',
    category: 'forms',
    level: 2,
    description: 'Update the form JavaScript. Fetches existing code first (for append mode), then saves via updateSpecificProperty endpoint. Supports "replace" (default) or "append".',
    requiredParams: ['formId', 'javascript'],
    optionalParams: ['mode'],
    steps: [
      {
        name: 'Fetch current JavaScript',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/code/script`,
        buildBody: () => null,
        extractResult: { existingCode: '' }
      },
      {
        name: 'Save JavaScript',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/updateSpecificProperty`,
        buildBody: (params, prevResults) => {
          const mode = params.mode || 'replace';
          let newScript = params.javascript;
          if (mode === 'append') {
            const existing = prevResults._rawResponse_0 || prevResults.existingCode || '';
            newScript = existing + (existing ? '\n\n' : '') + params.javascript;
          }

          // ── Script quality checks ──
          // Warn on formState guards — event handlers should be assigned at top level
          if (/intForm\.formState\s*===?\s*['"]runtime['"]/.test(newScript)) {
            if (_currentLogEntry) {
              actionLog.addWarning(_currentLogEntry, 'Script wraps code in formState check',
                'Event handlers should be assigned at the top level of the script without formState guards. The script runs in both preview and runtime modes.');
            }
          }
          // Warn if onClick is assigned inside a conditional block (common LLM mistake)
          if (/if\s*\(.*\)\s*\{[^}]*\.events\.onClick\s*=/.test(newScript)) {
            if (_currentLogEntry) {
              actionLog.addWarning(_currentLogEntry, 'onClick assigned inside conditional',
                'Button click handlers should be assigned at the top level, not inside if blocks. Pattern: const btn = intForm.getElementByClientID("btnX"); btn.events.onClick = async () => { ... };');
            }
          }

          return {
            sid: params.formId,
            updateThis: { script: newScript }
          };
        }
      }
    ]
  },

  'update-form-css': {
    id: 'update-form-css',
    label: 'Update Form CSS',
    category: 'forms',
    level: 2,
    description: 'Update the form CSS. Fetches existing styles first (for append mode), then saves via updateSpecificProperty endpoint. Supports "replace" (default) or "append".',
    requiredParams: ['formId', 'css'],
    optionalParams: ['mode'],
    steps: [
      {
        name: 'Fetch current CSS',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/code/css`,
        buildBody: () => null,
        extractResult: { existingCode: '' }
      },
      {
        name: 'Save CSS',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/updateSpecificProperty`,
        buildBody: (params, prevResults) => {
          const mode = params.mode || 'replace';
          let newCss = params.css;
          if (mode === 'append') {
            const existing = prevResults._rawResponse_0 || prevResults.existingCode || '';
            newCss = existing + (existing ? '\n\n' : '') + params.css;
          }
          return {
            sid: params.formId,
            updateThis: { css: newCss }
          };
        }
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

          // Step 1: Extract fields from their current locations (by ClientID or Label)
          const { extracted: extractedFields, notFound } = extractFieldsFromLayout(layout, params.fieldClientIds);

          if (extractedFields.length === 0) {
            throw new Error(`Could not find any fields: ${params.fieldClientIds.join(', ')}`);
          }
          if (notFound.length > 0) {
            console.warn(`Fields not found (skipped): ${notFound.join(', ')}`);
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

  'rename-section': {
    id: 'rename-section',
    label: 'Rename Section',
    category: 'forms',
    level: 2,
    description: 'Rename an existing section label.',
    requiredParams: ['formId', 'sectionClientId', 'newLabel'],
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Rename section and save',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) throw new Error('Could not retrieve form data');
          const layout = formData.layout;
          if (!layout) throw new Error('Form layout is missing');

          const section = findSection(layout, params.sectionClientId);
          if (!section) throw new Error(`Section "${params.sectionClientId}" not found`);

          section.Label = params.newLabel;
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

          // Build columns — if fields provided, run through template builder and distribute
          const columns = [];
          const fields = (params.fields || []).map(f => buildFieldFromTemplate(f, _currentLogEntry));
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
          const fields = (params.fields || []).map(f => buildFieldFromTemplate(f, _currentLogEntry));

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
    optionalParams: ['targetContainerIndex', 'targetContainerColumns', 'targetColumnIndex'],
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

          // Step 1: Extract fields from their current locations (by ClientID or Label)
          const { extracted: extractedFields, notFound } = extractFieldsFromLayout(layout, params.fieldClientIds);

          if (extractedFields.length === 0) {
            throw new Error(`Could not find fields: ${params.fieldClientIds.join(', ')}`);
          }
          if (notFound.length > 0) {
            console.warn(`Fields not found (skipped): ${notFound.join(', ')}`);
          }

          // Step 2: Find the target section and container
          const targetSection = findSection(layout, params.targetSectionClientId);
          if (!targetSection) throw new Error(`Target section "${params.targetSectionClientId}" not found`);

          const contents = targetSection.contents || [];
          let containerIdx;
          if (params.targetContainerColumns) {
            // Find container by column count
            containerIdx = contents.findIndex(c => (c.columns || []).length === params.targetContainerColumns);
            if (containerIdx === -1) throw new Error(`No container with ${params.targetContainerColumns} columns found in section`);
          } else {
            containerIdx = params.targetContainerIndex || 0;
          }
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

  'resize-container': {
    id: 'resize-container',
    label: 'Resize Container Columns',
    category: 'forms',
    level: 2,
    description: 'Change the number of columns in an existing container. Adding columns appends empty ones; reducing columns redistributes fields from removed columns into the last remaining column.',
    requiredParams: ['formId', 'sectionClientId', 'newColumnCount'],
    optionalParams: ['containerIndex', 'containerColumns', 'containerContainsField'],
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Resize container and save',
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
          let containerIdx;

          if (params.containerContainsField) {
            containerIdx = contents.findIndex(c =>
              (c.columns || []).some(col =>
                (col.items || []).some(item =>
                  item.ClientID === params.containerContainsField || item.Label === params.containerContainsField
                )
              )
            );
            if (containerIdx === -1) throw new Error(`No container containing field "${params.containerContainsField}" found`);
          } else if (params.containerColumns) {
            containerIdx = contents.findIndex(c => (c.columns || []).length === params.containerColumns);
            if (containerIdx === -1) throw new Error(`No container with ${params.containerColumns} columns found in section`);
          } else {
            containerIdx = params.containerIndex || 0;
          }

          if (containerIdx >= contents.length) throw new Error(`Container index ${containerIdx} out of range`);

          const container = contents[containerIdx];
          const columns = container.columns || [];
          const currentCount = columns.length;
          const newCount = params.newColumnCount;

          if (newCount < 1) throw new Error('Column count must be at least 1');
          if (newCount === currentCount) throw new Error(`Container already has ${currentCount} columns`);

          if (newCount > currentCount) {
            // Add empty columns
            while (columns.length < newCount) {
              columns.push({ items: [] });
            }
          } else {
            // Shrink: move fields from removed columns into the last surviving column
            const lastKeepIdx = newCount - 1;
            for (let i = newCount; i < currentCount; i++) {
              const removedItems = (columns[i].items || []);
              columns[lastKeepIdx].items = columns[lastKeepIdx].items.concat(removedItems);
            }
            columns.splice(newCount);
          }

          container.columns = columns;
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
    optionalParams: ['afterClientId', 'sectionClientId', 'sectionIndex', 'containerIndex', 'columnIndex'],
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

          const field = buildFieldFromTemplate(params.field, _currentLogEntry);
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

          // If not inserted yet, find the target section by label/ClientID or index
          if (!inserted) {
            let section;
            if (params.sectionClientId) {
              // Resolve by label or ClientID using the smart resolver
              section = findSection(sections, params.sectionClientId);
              if (!section && _currentLogEntry) {
                actionLog.addWarning(_currentLogEntry, `Section "${params.sectionClientId}" not found`,
                  `Falling back to first section. Available: ${sections.map(s => s.Label || s.ClientID).join(', ')}`);
              }
            }
            if (!section) {
              const sectionIdx = params.sectionIndex || 0;
              section = sections[sectionIdx] || sections[0];
            }
            if (section) {
              const contents = section.contents || [];
              const containerIdx = params.containerIndex || 0;
              const container = contents[containerIdx] || contents[0];
              if (container) {
                const columns = container.columns || [];
                const columnIdx = params.columnIndex || 0;
                const column = columns[columnIdx] || columns[0];
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

  // ═══════════════════════════════════════
  // Grid CRUD Actions
  // ═══════════════════════════════════════

  'add-grid-column': {
    id: 'add-grid-column',
    label: 'Add Grid Column',
    category: 'forms',
    level: 2,
    description: 'Add a new column to an existing Grid field. The column is built from a simplified spec (name, type, displayName, width, etc.).',
    requiredParams: ['formId', 'fieldIdentifier', 'column'],
    optionalParams: ['afterColumnName'],
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Add column and save',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) throw new Error('Could not retrieve form data');
          const layout = formData.layout;
          if (!layout) throw new Error('Form layout is missing');

          // Find the Grid field
          let gridField = null;
          for (const section of layout) {
            for (const container of (section.contents || [])) {
              for (const column of (container.columns || [])) {
                for (const item of (column.items || [])) {
                  if (item.QuestionType === 'Grid' && fieldMatches(item, params.fieldIdentifier)) {
                    gridField = item;
                  }
                }
              }
            }
          }
          if (!gridField) throw new Error(`Grid field "${params.fieldIdentifier}" not found`);

          const go = gridField.gridOptions;
          if (!go || !go.columnDefs) throw new Error('Grid has no gridOptions.columnDefs');

          // Build the new column
          const newCol = buildGridColumnDef(params.column, _currentLogEntry);

          // Resolve aggregation references if it's a RowAggregation column
          if (newCol.type === 'RowAggregation' && newCol._aggregationColumnNames) {
            const allDefs = [...go.columnDefs, newCol];
            resolveGridAggregationColumns(allDefs);
          }

          // Insert at the right position
          if (params.afterColumnName) {
            const idx = go.columnDefs.findIndex(c => c.name === params.afterColumnName);
            if (idx !== -1) {
              go.columnDefs.splice(idx + 1, 0, newCol);
            } else {
              go.columnDefs.push(newCol);
            }
          } else {
            go.columnDefs.push(newCol);
          }

          // Add default value for this column to every row in all three arrays
          const defaultVal = buildGridRowData([newCol], 1)[0][newCol.name];
          for (const arr of [go.data, gridField.Answer, gridField.prefillValues]) {
            if (Array.isArray(arr)) {
              for (const row of arr) {
                row[newCol.name] = JSON.parse(JSON.stringify(defaultVal));
              }
            }
          }

          return { node: formData };
        }
      }
    ]
  },

  'remove-grid-column': {
    id: 'remove-grid-column',
    label: 'Remove Grid Column',
    category: 'forms',
    level: 2,
    description: 'Remove a column from an existing Grid field by column name.',
    requiredParams: ['formId', 'fieldIdentifier', 'columnName'],
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Remove column and save',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) throw new Error('Could not retrieve form data');
          const layout = formData.layout;
          if (!layout) throw new Error('Form layout is missing');

          let gridField = null;
          for (const section of layout) {
            for (const container of (section.contents || [])) {
              for (const column of (container.columns || [])) {
                for (const item of (column.items || [])) {
                  if (item.QuestionType === 'Grid' && fieldMatches(item, params.fieldIdentifier)) {
                    gridField = item;
                  }
                }
              }
            }
          }
          if (!gridField) throw new Error(`Grid field "${params.fieldIdentifier}" not found`);

          const go = gridField.gridOptions;
          const colIdx = go.columnDefs.findIndex(c => c.name === params.columnName);
          if (colIdx === -1) throw new Error(`Column "${params.columnName}" not found in grid. Available: ${go.columnDefs.map(c => c.name).join(', ')}`);

          // Check if any RowAggregation columns reference this column
          const removedId = go.columnDefs[colIdx].id;
          for (const def of go.columnDefs) {
            if (def.type === 'RowAggregation' && def.aggregationColumns) {
              const refs = def.aggregationColumns.filter(ac => ac.id === removedId || ac.name === params.columnName);
              if (refs.length > 0) {
                if (_currentLogEntry) actionLog.addWarning(_currentLogEntry, 'RowAggregation reference broken',
                  `Column "${def.name}" references "${params.columnName}" in its aggregation formula`);
              }
            }
          }

          // Remove the columnDef
          go.columnDefs.splice(colIdx, 1);

          // Remove the column data from every row
          for (const arr of [go.data, gridField.Answer, gridField.prefillValues]) {
            if (Array.isArray(arr)) {
              for (const row of arr) {
                delete row[params.columnName];
              }
            }
          }

          return { node: formData };
        }
      }
    ]
  },

  'update-grid-column': {
    id: 'update-grid-column',
    label: 'Update Grid Column',
    category: 'forms',
    level: 2,
    description: 'Update properties of an existing Grid column (displayName, width, validators, type, choices, etc.). Deep merges the updates.',
    requiredParams: ['formId', 'fieldIdentifier', 'columnName', 'updates'],
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Update column and save',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) throw new Error('Could not retrieve form data');
          const layout = formData.layout;
          if (!layout) throw new Error('Form layout is missing');

          let gridField = null;
          for (const section of layout) {
            for (const container of (section.contents || [])) {
              for (const column of (container.columns || [])) {
                for (const item of (column.items || [])) {
                  if (item.QuestionType === 'Grid' && fieldMatches(item, params.fieldIdentifier)) {
                    gridField = item;
                  }
                }
              }
            }
          }
          if (!gridField) throw new Error(`Grid field "${params.fieldIdentifier}" not found`);

          const go = gridField.gridOptions;
          const colDef = go.columnDefs.find(c => c.name === params.columnName);
          if (!colDef) throw new Error(`Column "${params.columnName}" not found in grid. Available: ${go.columnDefs.map(c => c.name).join(', ')}`);

          // Deep merge updates into the column definition
          function deepMerge(target, source) {
            for (const key of Object.keys(source)) {
              if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
                  && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
                deepMerge(target[key], source[key]);
              } else {
                target[key] = source[key];
              }
            }
          }
          deepMerge(colDef, params.updates);

          // If choices were updated for a MultiChoiceSelectList, sync row data
          if (colDef.type === 'MultiChoiceSelectList' && params.updates.choices) {
            const newChoices = params.updates.choices.map(c =>
              typeof c === 'string' ? { Label: c, Value: c } : { Label: c.Label || c.label, Value: c.Value || c.value || c.Label || c.label }
            );
            if (colDef.question) colDef.question.Choices = newChoices;
            for (const arr of [go.data, gridField.Answer, gridField.prefillValues]) {
              if (Array.isArray(arr)) {
                for (const row of arr) {
                  if (row[params.columnName] && row[params.columnName].Choices) {
                    row[params.columnName].Choices = JSON.parse(JSON.stringify(newChoices));
                  }
                }
              }
            }
          }

          return { node: formData };
        }
      }
    ]
  },

  'add-grid-row': {
    id: 'add-grid-row',
    label: 'Add Grid Rows',
    category: 'forms',
    level: 2,
    description: 'Add one or more rows to an existing Grid field.',
    requiredParams: ['formId', 'fieldIdentifier'],
    optionalParams: ['rowCount', 'rowData'],
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Add rows and save',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) throw new Error('Could not retrieve form data');
          const layout = formData.layout;
          if (!layout) throw new Error('Form layout is missing');

          let gridField = null;
          for (const section of layout) {
            for (const container of (section.contents || [])) {
              for (const column of (container.columns || [])) {
                for (const item of (column.items || [])) {
                  if (item.QuestionType === 'Grid' && fieldMatches(item, params.fieldIdentifier)) {
                    gridField = item;
                  }
                }
              }
            }
          }
          if (!gridField) throw new Error(`Grid field "${params.fieldIdentifier}" not found`);

          const go = gridField.gridOptions;
          const count = params.rowCount || 1;
          const newRows = buildGridRowData(go.columnDefs, count);

          // Merge any provided rowData into the new rows
          if (params.rowData && typeof params.rowData === 'object') {
            for (const row of newRows) {
              for (const [key, val] of Object.entries(params.rowData)) {
                if (row.hasOwnProperty(key) && val !== undefined) {
                  row[key] = val;
                }
              }
            }
          }

          // Push to all three arrays
          for (const arr of [go.data, gridField.Answer, gridField.prefillValues]) {
            if (Array.isArray(arr)) {
              arr.push(...JSON.parse(JSON.stringify(newRows)));
            }
          }

          go.rowsSpecified = (go.rowsSpecified || 0) + count;
          go.minRowsToShow = String(Math.max(go.rowsSpecified + 3, 6));

          return { node: formData };
        }
      }
    ]
  },

  // ═══════════════════════════════════════
  // Form Rules Actions
  // ═══════════════════════════════════════

  'add-rule': {
    id: 'add-rule',
    label: 'Add Form Rule',
    category: 'forms',
    level: 2,
    description: 'Add a conditional rule to the form (e.g., if field X = "Yes", show field Y). Fetches the form to resolve field references, builds the full rule JSON with conditions and effects, auto-generates the inverse rule, and saves both.',
    requiredParams: ['formId', 'name', 'conditions', 'effects'],
    optionalParams: ['logic', 'createInverse'],
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Build rule and save',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/updateSpecificProperty`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) throw new Error('Could not retrieve form data');

          const existingRules = formData.rules || [];

          // Build the primary rule
          const rule = buildRule({
            name: params.name,
            logic: params.logic || 'all',
            conditions: params.conditions,
            effects: params.effects
          }, formData, _currentLogEntry);

          const newRules = [...existingRules, rule];

          // Auto-generate inverse unless explicitly disabled
          if (params.createInverse !== false) {
            const inverse = buildInverseRule(rule);
            newRules.push(inverse);
            if (_currentLogEntry) {
              actionLog.addStepResult(_currentLogEntry, 'Auto-generated inverse rule',
                { name: inverse.name, ruleString: inverse.ruleString });
            }
          }

          return {
            sid: params.formId,
            updateThis: { rules: newRules }
          };
        }
      }
    ]
  },

  'remove-rule': {
    id: 'remove-rule',
    label: 'Remove Form Rule',
    category: 'forms',
    level: 2,
    description: 'Remove a rule from the form by name. Also removes the inverse rule if one exists.',
    requiredParams: ['formId', 'ruleName'],
    optionalParams: ['removeInverse'],
    steps: [
      {
        name: 'Fetch current form',
        method: 'GET',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/builder`,
        buildBody: () => null,
        extractResult: { formData: '' }
      },
      {
        name: 'Remove rule and save',
        method: 'PUT',
        path: (params) => `/workflow/napi/tasktypes/power-form/${params.formId}/updateSpecificProperty`,
        buildBody: (params, prevResults) => {
          const formData = prevResults._rawResponse_0 || prevResults.formData;
          if (!formData) throw new Error('Could not retrieve form data');

          const existingRules = formData.rules || [];
          const nameLower = params.ruleName.toLowerCase();
          const removeInverse = params.removeInverse !== false;

          const filteredRules = existingRules.filter(r => {
            const rName = (r.name || '').toLowerCase();
            if (rName === nameLower) return false;
            if (removeInverse && rName === nameLower + ' (inverse)') return false;
            return true;
          });

          if (filteredRules.length === existingRules.length) {
            throw new Error(`Rule "${params.ruleName}" not found. Available rules: ${existingRules.map(r => r.name).join(', ')}`);
          }

          const removed = existingRules.length - filteredRules.length;
          if (_currentLogEntry) {
            actionLog.addStepResult(_currentLogEntry, `Removed ${removed} rule(s)`,
              { removed: existingRules.filter(r => !filteredRules.includes(r)).map(r => r.name) });
          }

          return {
            sid: params.formId,
            updateThis: { rules: filteredRules }
          };
        }
      }
    ]
  },

  // ── Report Actions ──
  'create-report': {
    id: 'create-report',
    label: 'Create Report',
    category: 'reports',
    level: 2,
    description: 'Create a new report with columns, filters, and limits. Accepts category by name or SID and process by name or SID — the engine auto-resolves names to SIDs.',
    requiredParams: ['name'],
    optionalParams: ['category', 'categorySid', 'processName', 'objectSid', 'columns', 'filters', 'limits', 'description', 'objectType', 'dataType', 'allowChart', 'hideInMyReports', 'isQueue'],
    // preResolve runs before steps — resolves human-readable names to SIDs via API lookups
    preResolve: async function(params, engine) {
      // Resolve categorySid from category name if not provided directly
      if (!params.categorySid && params.category) {
        try {
          const catResp = await engine._executeApiCall({
            method: 'GET',
            url: `${engine.baseUrl}/api/reports/categories/tree/process`,
            headers: { 'Content-Type': 'application/json' }
          });
          const categories = catResp.data || [];
          const catName = params.category.toLowerCase();
          const match = categories.find(c =>
            c.Name && c.Name.toLowerCase() === catName
          ) || categories.find(c =>
            c.Name && c.Name.toLowerCase().includes(catName)
          ) || categories.find(c =>
            c.Name && catName.includes(c.Name.toLowerCase()) && c.Name.length > 2
          );
          if (match) {
            params.categorySid = match.id;
          } else {
            throw new Error(`Category "${params.category}" not found. Available: ${categories.map(c => c.Name).join(', ')}`);
          }
        } catch (err) {
          if (err.message.includes('not found')) throw err;
          throw new Error(`Failed to resolve category: ${err.message}`);
        }
      }
      // If still no categorySid, use the first available category
      if (!params.categorySid) {
        try {
          const catResp = await engine._executeApiCall({
            method: 'GET',
            url: `${engine.baseUrl}/api/reports/categories/tree/process`,
            headers: { 'Content-Type': 'application/json' }
          });
          const categories = catResp.data || [];
          if (categories.length > 0) {
            params.categorySid = categories[0].id;
          } else {
            throw new Error('No report categories found. Create a category first.');
          }
        } catch (err) {
          if (err.message.includes('No report categories')) throw err;
          throw new Error(`Failed to fetch categories: ${err.message}`);
        }
      }
      // Resolve objectSid from processName if not provided directly
      if (!params.objectSid && params.processName) {
        try {
          const procResp = await engine._executeApiCall({
            method: 'GET',
            url: `${engine.baseUrl}/workflow/napi/processes`,
            headers: { 'Content-Type': 'application/json' }
          });
          // Response is {Items: [...], TotalItemCnt: N}
          const processes = procResp.data?.Items || procResp.data || [];
          const procName = params.processName.toLowerCase().trim();
          const procWords = procName.split(/\s+/);

          // Score each process by match quality
          const scored = processes
            .filter(p => p.Name || p.name)
            .map(p => {
              const pName = (p.Name || p.name).toLowerCase().trim();
              let score = 0;
              if (pName === procName) score = 100; // exact match
              else if (pName.includes(procName)) score = 90; // process name contains full search term
              else if (procName.includes(pName) && pName.length >= 4) {
                // Search contains full process name — score proportional to coverage
                // "Graysmith Industries Capex - Demo Ready" matching "Capex" scores ~12
                // but matching "Graysmith Industries Capex - Demo Ready" scores 80
                score = 70 + Math.round((pName.length / procName.length) * 10);
              } else {
                // Word overlap score — count how many search words appear in process name
                const matchedWords = procWords.filter(w => w.length > 2 && pName.includes(w));
                score = matchedWords.length > 0 ? (matchedWords.length / procWords.length) * 70 : 0;
              }
              return { process: p, name: p.Name || p.name, score };
            })
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score);

          if (scored.length === 0) {
            throw new Error(`Process "${params.processName}" not found. No similar processes found.`);
          } else if (scored[0].score >= 80) {
            // Strong match — use it (if tied at top, ask user)
            const topScore = scored[0].score;
            const topMatches = scored.filter(s => s.score === topScore);
            if (topMatches.length === 1) {
              params.objectSid = topMatches[0].process.SID || topMatches[0].process.sid || topMatches[0].process.id;
            } else {
              // Deduplicate by name (case-insensitive) — keep first occurrence
              const seen = new Set();
              const unique = topMatches.filter(s => {
                const key = s.name.toLowerCase().trim();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
              if (unique.length === 1) {
                params.objectSid = unique[0].process.SID || unique[0].process.sid || unique[0].process.id;
              } else {
                const options = unique.slice(0, 10).map(s => {
                  const sid = s.process.SID || s.process.sid || s.process.id;
                  return `"${s.name}" (${sid})`;
                }).join(', ');
                throw new Error(`Multiple processes match "${params.processName}": ${options}. Please specify the exact process name or provide objectSid directly.`);
              }
            }
          } else {
            // Weak matches only — show suggestions
            const suggestions = scored.slice(0, 5).map(s => `"${s.name}"`).join(', ');
            throw new Error(`Process "${params.processName}" not found. Did you mean: ${suggestions}?`);
          }
        } catch (err) {
          if (err.message.includes('not found')) throw err;
          throw new Error(`Failed to resolve process: ${err.message}`);
        }
      }

      // ── Fetch available columns for the process ──
      // If user didn't specify columns, discover what's available and use real mappings
      if (params.objectSid && !params.columns) {
        try {
          const colResp = await engine._executeApiCall({
            method: 'GET',
            url: `${engine.baseUrl}/api/reports/columns/available/${params.objectSid}`,
            headers: { 'Content-Type': 'application/json' }
          });
          const available = colResp.data || [];
          if (available.length > 0) {
            // Store discovered columns so the step can use them
            // Pick sensible defaults: ID, Subject/Name, Status, Requester, dates
            const priorities = [
              { pattern: /Request\|ID$/i, alias: 'ID', width: '65', sort: 'Desc' },
              { pattern: /Request\|Subject$/i, alias: 'Subject', width: '250' },
              { pattern: /Request\|LastMilestone$/i, alias: 'Status', width: '200' },
              { pattern: /Requester\|Name$/i, alias: 'Requester', width: '150' },
              { pattern: /Requester\|Department$/i, alias: 'Department', width: '150' },
              { pattern: /Request\|StartDate$/i, alias: 'Date Entered', width: '120', format: 'Date' },
              { pattern: /Request\|EndDate$/i, alias: 'Date Completed', width: '120', format: 'Date' },
              { pattern: /Task\|Name$/i, alias: 'Task Name', width: '200' },
              { pattern: /Task\|AssignedTo$/i, alias: 'Assigned To', width: '150' },
              { pattern: /Task\|Status$/i, alias: 'Task Status', width: '120' },
            ];

            // Flatten available columns into a lookup
            const allCols = [];
            for (const group of available) {
              if (group.columns && Array.isArray(group.columns)) {
                for (const col of group.columns) {
                  allCols.push(col);
                }
              } else if (group.mapping_val) {
                allCols.push(group);
              }
            }

            // Select defaults from available columns
            const selected = [];
            for (const prio of priorities) {
              const match = allCols.find(c =>
                prio.pattern.test(c.mapping_val || c.value || '')
              );
              if (match) {
                selected.push({
                  mapping_val: match.mapping_val || match.value,
                  mapping_text: match.mapping_text || match.text || match.label || '',
                  alias: prio.alias,
                  width: prio.width || '150',
                  sort: prio.sort || '',
                  format: prio.format || ''
                });
              }
            }

            if (selected.length > 0) {
              params.columns = selected;
              params._discoveredColumns = allCols; // Store for reference
            }
          }
        } catch (err) {
          // Non-fatal — fall back to built-in defaults
          console.warn('[Copilot] Could not fetch available columns:', err.message);
        }
      }

      return params;
    },
    steps: [
      {
        name: 'Create report shell',
        method: 'POST',
        path: () => '/core-service/reports/save/script/',
        buildBody: (params) => {
          // Core-service uses PascalCase/mixed-case field names
          // DataType: 0 = Request rows, 1 = Task rows, 2 = Custom SQL
          const dataTypeMap = { 'request': 0, 'task': 1, 'custom': 2 };
          const dataType = dataTypeMap[(params.dataType || 'request').toLowerCase()] || 0;
          return {
            name: params.name,
            categorySid: params.categorySid,
            description: params.description || '',
            AllowChart: params.allowChart || false,
            ObjectSID: params.objectSid || params.processSid || '',
            ReportType: 0,
            DataType: dataType
          };
        },
        extractResult: { createdReport: '' }
      },
      {
        name: 'Fetch report document',
        // GET the newly created report from MongoDB to get the full server-generated
        // document. We modify it in-place and PUT it back.
        method: 'GET',
        path: (params, prevResults) => {
          const created = prevResults?.createdReport || prevResults?._rawResponse_0;
          const sid = created?.SID || created?.sid;
          if (!sid) throw new Error('Could not get SID from created report');
          return `/api/reports/${sid}`;
        },
        buildBody: () => null,
        extractResult: { reportDoc: '' }
      },
      {
        name: 'Set columns, limits, and filters',
        // Modify the full server document in-place, then PUT it back.
        method: 'PUT',
        path: (params, prevResults) => {
          const created = prevResults?.createdReport || prevResults?._rawResponse_0;
          const sid = created?.SID || created?.sid;
          return `/api/reports/${sid}`;
        },
        buildBody: (params, prevResults) => {
          // Start from the full server document (step 2 GET response = _rawResponse_1)
          const report = prevResults._rawResponse_1 || prevResults.reportDoc;
          if (!report) throw new Error('Could not retrieve report document');

          // Built-in column mappings that are always valid for any process
          const BUILTIN_COLUMNS = {
            // Request fields
            'request id':       { mapping_val: 'Request|ID', mapping_text: 'Request - ID', width: '80' },
            'id':               { mapping_val: 'Request|ID', mapping_text: 'Request - ID', width: '80' },
            'subject':          { mapping_val: 'Request|Subject', mapping_text: 'Request - Subject', width: '250' },
            'status':           { mapping_val: 'Request|LastMilestone', mapping_text: 'Request - Last Milestone', width: '140' },
            'last milestone':   { mapping_val: 'Request|LastMilestone', mapping_text: 'Request - Last Milestone', width: '140' },
            'start date':       { mapping_val: 'Request|StartDate', mapping_text: 'Request - Start Date', width: '120', format: 'Date' },
            'date entered':     { mapping_val: 'Request|StartDate', mapping_text: 'Request - Start Date', width: '120', format: 'Date' },
            'created date':     { mapping_val: 'Request|StartDate', mapping_text: 'Request - Start Date', width: '120', format: 'Date' },
            'end date':         { mapping_val: 'Request|EndDate', mapping_text: 'Request - End Date', width: '120', format: 'Date' },
            'completed date':   { mapping_val: 'Request|EndDate', mapping_text: 'Request - End Date', width: '120', format: 'Date' },
            'priority':         { mapping_val: 'Request|Priority', mapping_text: 'Request - Priority', width: '100' },
            'category':         { mapping_val: 'Request|CategoryPath', mapping_text: 'Request - Category Path', width: '200' },
            'process':          { mapping_val: 'Request|ProcessName', mapping_text: 'Request - Process Name', width: '200' },
            'process name':     { mapping_val: 'Request|ProcessName', mapping_text: 'Request - Process Name', width: '200' },
            // Requester fields
            'requester':        { mapping_val: 'Requester|Name', mapping_text: 'Requester - Name', width: '150' },
            'requester name':   { mapping_val: 'Requester|Name', mapping_text: 'Requester - Name', width: '150' },
            'department':       { mapping_val: 'Requester|Department', mapping_text: 'Requester - Department', width: '150' },
            'email':            { mapping_val: 'Requester|Email', mapping_text: 'Requester - Email', width: '200' },
            'requester email':  { mapping_val: 'Requester|Email', mapping_text: 'Requester - Email', width: '200' },
            // Task fields (for task reports)
            'task name':        { mapping_val: 'Task|Name', mapping_text: 'Task - Name', width: '200' },
            'assigned to':      { mapping_val: 'Task|AssignedTo', mapping_text: 'Task - Assigned To', width: '150' },
            'task status':      { mapping_val: 'Task|Status', mapping_text: 'Task - Status', width: '120' },
            'due date':         { mapping_val: 'Task|DueDate', mapping_text: 'Task - Due Date', width: '120', format: 'Date' },
            'task start date':  { mapping_val: 'Task|StartDate', mapping_text: 'Task - Start Date', width: '120', format: 'Date' },
            'task end date':    { mapping_val: 'Task|EndDate', mapping_text: 'Task - End Date', width: '120', format: 'Date' },
          };

          // Default columns if none specified
          const DEFAULT_REQUEST_COLUMNS = ['request id', 'subject', 'status', 'requester', 'department', 'start date'];
          const DEFAULT_TASK_COLUMNS = ['request id', 'task name', 'assigned to', 'task status', 'due date', 'department'];

          const dataType = (params.dataType || 'request').toLowerCase();
          let columns;
          if (params.columns && Array.isArray(params.columns)) {
            // Process each column — could be a string name or a full object with mapping_val
            columns = params.columns.map((c, i) => {
              if (typeof c === 'string') {
                // Simple name — look up in built-in dictionary
                const builtin = BUILTIN_COLUMNS[c.toLowerCase().trim()];
                if (builtin) {
                  return {
                    '@alias': c, '@width': builtin.width, '@sortable': 'Yes',
                    '@sort': '', '@format': builtin.format || '', '@aggregate': '', '@chartoption': '',
                    index: i, isSelected: false, mapping_val: builtin.mapping_val, mapping_text: builtin.mapping_text
                  };
                }
                if (_currentLogEntry) actionLog.addWarning(_currentLogEntry, `Column "${c}" not in built-in mappings — skipped.`);
                return null;
              }
              // Object — check if it has a mapping_val (LLM provided full column spec)
              if (c.mapping_val) {
                return {
                  '@alias': c.alias || c['@alias'] || c.name || c.label || c.mapping_text || '',
                  '@width': c.width || c['@width'] || '150',
                  '@sortable': c.sortable || c['@sortable'] || 'Yes',
                  '@sort': c.sort || c['@sort'] || '',
                  '@format': c.format || c['@format'] || '',
                  '@aggregate': c.aggregate || c['@aggregate'] || '',
                  '@chartoption': c.chartoption || c['@chartoption'] || '',
                  index: i, isSelected: false,
                  mapping_val: c.mapping_val, mapping_text: c.mapping_text || c.mapping_val
                };
              }
              // Object with just a name/label — look up in built-in dictionary
              const name = c.alias || c.name || c.label || '';
              const builtin = BUILTIN_COLUMNS[name.toLowerCase().trim()];
              if (builtin) {
                return {
                  '@alias': name, '@width': c.width || builtin.width, '@sortable': 'Yes',
                  '@sort': c.sort || '', '@format': c.format || builtin.format || '', '@aggregate': '', '@chartoption': '',
                  index: i, isSelected: false, mapping_val: builtin.mapping_val, mapping_text: builtin.mapping_text
                };
              }
              if (_currentLogEntry) actionLog.addWarning(_currentLogEntry, `Column "${name}" not in built-in mappings and no mapping_val provided — skipped.`);
              return null;
            }).filter(Boolean);
          } else {
            // Default columns
            const defaultNames = dataType === 'task' ? DEFAULT_TASK_COLUMNS : DEFAULT_REQUEST_COLUMNS;
            columns = defaultNames.map((name, i) => {
              const builtin = BUILTIN_COLUMNS[name];
              return {
                '@alias': name, '@width': builtin.width, '@sortable': 'Yes',
                '@sort': i === 0 ? 'Desc' : '', '@format': builtin.format || '', '@aggregate': '', '@chartoption': '',
                index: i, isSelected: false, mapping_val: builtin.mapping_val, mapping_text: builtin.mapping_text
              };
            });
          }

          // Modify the full server document in-place
          if (columns.length > 0) {
            report.columns = [{ column: columns }];
          }
          report.limits = normalizeReportLimits(params.limits, _currentLogEntry);
          if (params.filters && Array.isArray(params.filters)) {
            report.filters = [{
              filter: params.filters.map(f => normalizeReportFilter(f, _currentLogEntry))
            }];
          }

          console.log('[Copilot] create-report PUT body:', JSON.stringify({
            columns: report.columns,
            filters: report.filters,
            limits: report.limits,
            objectSid: report.objectSid,
            categorySid: report.categorySid
          }, null, 2));

          return report;
        }
      }
    ]
  },

  'get-report': {
    id: 'get-report',
    label: 'Get Report',
    category: 'reports',
    level: 1,
    description: 'Fetch a report by SID to inspect its columns, filters, and limits.',
    requiredParams: ['reportSid'],
    optionalParams: [],
    steps: [
      {
        name: 'Fetch report',
        method: 'GET',
        path: (params) => `/api/reports/${params.reportSid}`,
        buildBody: () => null
      }
    ]
  },

  'update-report': {
    id: 'update-report',
    label: 'Update Report',
    category: 'reports',
    level: 2,
    description: 'Update an existing report — merge columns, filters, limits, or metadata.',
    requiredParams: ['reportSid'],
    optionalParams: ['name', 'columns', 'filters', 'limits', 'description', 'categorySid', 'allowChart', 'hideInMyReports', 'addColumns', 'removeColumns', 'addFilters', 'removeFilters'],
    steps: [
      {
        name: 'Fetch current report',
        method: 'GET',
        path: (params) => `/api/reports/${params.reportSid}`,
        buildBody: () => null,
        extractResult: { reportData: '' }
      },
      {
        name: 'Update report',
        method: 'PUT',
        path: (params) => `/api/reports/${params.reportSid}`,
        buildBody: (params, prevResults) => {
          const report = prevResults._rawResponse_0 || prevResults.reportData;
          if (!report) throw new Error('Could not retrieve report data');

          // Merge metadata
          if (params.name) report.name = params.name;
          if (params.description !== undefined) report.description = params.description;
          if (params.categorySid) report.categorySid = params.categorySid;
          if (params.allowChart !== undefined) report.allowChart = params.allowChart;
          if (params.hideInMyReports !== undefined) report.hideInMyReports = params.hideInMyReports;

          // Full column replacement
          if (params.columns) {
            report.columns = [{
              column: params.columns.map((col, i) => normalizeReportColumn(col, i, _currentLogEntry))
            }];
          }

          // Add columns to existing
          if (params.addColumns && Array.isArray(params.addColumns)) {
            const existing = (report.columns && report.columns[0]?.column) || [];
            const newCols = params.addColumns.map((col, i) =>
              normalizeReportColumn(col, existing.length + i, _currentLogEntry));
            if (!report.columns || report.columns.length === 0) {
              report.columns = [{ column: newCols }];
            } else {
              report.columns[0].column = [...existing, ...newCols];
            }
          }

          // Remove columns by alias
          if (params.removeColumns && Array.isArray(params.removeColumns)) {
            if (report.columns && report.columns[0]?.column) {
              const removeLower = params.removeColumns.map(c => c.toLowerCase());
              report.columns[0].column = report.columns[0].column.filter(c =>
                !removeLower.includes((c['@alias'] || '').toLowerCase())
              );
              if (_currentLogEntry) {
                actionLog.addStepResult(_currentLogEntry, `Removed columns: ${params.removeColumns.join(', ')}`, true);
              }
            }
          }

          // Full filter replacement
          if (params.filters) {
            report.filters = [{
              filter: params.filters.map(f => normalizeReportFilter(f, _currentLogEntry))
            }];
          }

          // Add filters
          if (params.addFilters && Array.isArray(params.addFilters)) {
            const existing = (report.filters && report.filters[0]?.filter) || [];
            const newFilters = params.addFilters.map(f => normalizeReportFilter(f, _currentLogEntry));
            if (!report.filters || report.filters.length === 0) {
              report.filters = [{ filter: newFilters }];
            } else {
              report.filters[0].filter = [...existing, ...newFilters];
            }
          }

          // Remove filters by expose label
          if (params.removeFilters && Array.isArray(params.removeFilters)) {
            if (report.filters && report.filters[0]?.filter) {
              const removeLower = params.removeFilters.map(f => f.toLowerCase());
              report.filters[0].filter = report.filters[0].filter.filter(f =>
                !removeLower.includes((f.expose || '').toLowerCase())
              );
            }
          }

          // Merge limits
          if (params.limits) {
            const normalizedLimits = normalizeReportLimits(params.limits, _currentLogEntry);
            report.limits = { ...report.limits, ...normalizedLimits };
          }

          return report;
        }
      }
    ]
  },

  'delete-report': {
    id: 'delete-report',
    label: 'Delete Report',
    category: 'reports',
    level: 2,
    description: 'Delete a report by SID.',
    requiredParams: ['reportSid'],
    optionalParams: [],
    steps: [
      {
        name: 'Delete report',
        method: 'DELETE',
        path: (params) => `/api/reports/${params.reportSid}`,
        buildBody: () => null
      }
    ]
  },

  'run-report': {
    id: 'run-report',
    label: 'Run Report',
    category: 'reports',
    level: 1,
    description: 'Run a report with optional filter overrides. Returns the report data.',
    requiredParams: ['reportSid'],
    optionalParams: ['filters', 'dateFilter'],
    steps: [
      {
        name: 'Run report',
        method: 'POST',
        path: (params) => `/api/reports/${params.reportSid}/run`,
        buildBody: (params) => {
          const body = [];

          // Date filter
          if (params.dateFilter) {
            if (Array.isArray(params.dateFilter)) {
              // Date range: ["2024-01-01", "2024-12-31"]
              body.push({ label: 'ExposeDateFilter', value: params.dateFilter });
            } else {
              // Number of days: "30" or 30
              body.push({ label: 'ExposeDateFilter', value: String(params.dateFilter) });
            }
          }

          // Exposed filter overrides
          if (params.filters && Array.isArray(params.filters)) {
            for (const f of params.filters) {
              body.push({
                label: f.label || f.expose || f.name,
                value: f.value
              });
            }
          }

          return body;
        }
      }
    ]
  },

  'search-reports': {
    id: 'search-reports',
    label: 'Search Reports',
    category: 'reports',
    level: 1,
    description: 'Search for reports by name.',
    requiredParams: [],
    optionalParams: ['search'],
    steps: [
      {
        name: 'Search reports',
        method: 'GET',
        path: (params) => `/api/reports/search${params.search ? '?search=' + encodeURIComponent(params.search) : ''}`,
        buildBody: () => null
      }
    ]
  },

  'get-report-categories': {
    id: 'get-report-categories',
    label: 'Get Report Categories',
    category: 'reports',
    level: 1,
    description: 'Get the category tree for organizing reports.',
    requiredParams: [],
    optionalParams: [],
    steps: [
      {
        name: 'Get categories tree',
        method: 'GET',
        path: () => '/api/reports/categories/tree/process',
        buildBody: () => null
      }
    ]
  },

  'auto-generate-report-columns': {
    id: 'auto-generate-report-columns',
    label: 'Auto-Generate Report Columns',
    category: 'reports',
    level: 2,
    description: 'Auto-generate columns for an existing report based on its associated process.',
    requiredParams: ['reportSid'],
    optionalParams: [],
    steps: [
      {
        name: 'Auto-generate columns',
        method: 'POST',
        path: (params) => `/api/reports/autogeneratecolumns/${params.reportSid}`,
        buildBody: () => null
      }
    ]
  },

  'export-report': {
    id: 'export-report',
    label: 'Export Report Data',
    category: 'reports',
    level: 1,
    description: 'Export report data as CSV or Excel.',
    requiredParams: ['reportSid', 'exportType'],
    optionalParams: [],
    steps: [
      {
        name: 'Export report data',
        method: 'GET',
        path: (params) => `/api/reports/${params.reportSid}/export/data/${params.exportType}`,
        buildBody: () => null
      }
    ]
  },

  'get-report-filters': {
    id: 'get-report-filters',
    label: 'Get Exposed Report Filters',
    category: 'reports',
    level: 1,
    description: 'Get the exposed filters for a report (to know what filters can be applied when running it).',
    requiredParams: ['reportSid'],
    optionalParams: [],
    steps: [
      {
        name: 'Get exposed filters',
        method: 'GET',
        path: (params) => `/api/reports/${params.reportSid}/filters`,
        buildBody: () => null
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
    this.formBackupStacks = {}; // formId → array of snapshots (stack, most recent last)
  }

  // ── Form Backup/Restore (stack-based) ──
  getBackup(formId) {
    const stack = this.formBackupStacks[formId];
    return stack && stack.length > 0 ? stack[stack.length - 1] : null;
  }

  getBackupCount(formId) {
    return (this.formBackupStacks[formId] || []).length;
  }

  async restoreBackup(formId) {
    const stack = this.formBackupStacks[formId];
    if (!stack || stack.length === 0) {
      throw new Error(`No backup found for form ${formId}`);
    }
    // Pop the most recent snapshot (the state before the last action)
    const backup = stack.pop();
    const fullUrl = `${this.baseUrl}/workflow/napi/tasktypes/power-form/${formId}/builder`;
    const response = await this._executeApiCall({
      method: 'PUT',
      url: fullUrl,
      headers: { 'Content-Type': 'application/json' },
      body: { node: backup }
    });
    if (response.status >= 200 && response.status < 300) {
      const remaining = stack.length;
      return { success: true, message: `Form restored. ${remaining} more undo${remaining !== 1 ? 's' : ''} available.` };
    }
    throw new Error(`Restore failed: HTTP ${response.status}`);
  }

  clearBackup(formId) {
    delete this.formBackupStacks[formId];
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
        } else if (parsed.actionId) {
          // Log unknown action IDs the LLM tried to use
          const entry = actionLog.createEntry(parsed.actionId, parsed.params || {});
          actionLog.addError(entry, 'Unknown action ID', `LLM emitted "${parsed.actionId}" which is not in the registry`);
          actionLog.finalize(entry, 'failed');
        }
      } catch (e) {
        // Log malformed JSON from LLM
        const entry = actionLog.createEntry('parse-error', {});
        actionLog.addError(entry, 'Malformed action block JSON', match[1]?.slice(0, 300));
        actionLog.finalize(entry, 'failed');
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

    // Create log entry
    const logEntry = actionLog.createEntry(actionId, params);
    logEntry.status = 'executing';

    const validation = this.validateParams(actionId, params);
    if (!validation.valid) {
      actionLog.addError(logEntry, 'Validation failed', validation.errors.join(', '));
      await actionLog.finalize(logEntry, 'failed');
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Expose logEntry so action buildBody functions can log normalizations
    _currentLogEntry = logEntry;

    // Track formId source if set by sidebar
    if (this._pendingFormIdSource) {
      logEntry.formIdSource = this._pendingFormIdSource;
      this._pendingFormIdSource = null;
    }

    // Run preResolve if defined — resolves human-readable names to SIDs via API lookups
    if (action.preResolve) {
      try {
        params = await action.preResolve(params, this);
        actionLog.addNormalization(logEntry, 'preResolve', 'Resolved names to SIDs', params);
      } catch (err) {
        actionLog.addError(logEntry, 'preResolve failed', err.message);
        await actionLog.finalize(logEntry, 'failed');
        return { actionId, label: action.label, success: false, results: [{ step: 'preResolve', success: false, error: err.message }] };
      }
    }

    const results = [];
    const prevResults = {};

    for (let i = 0; i < action.steps.length; i++) {
      const step = action.steps[i];
      this.onStepProgress(i + 1, action.steps.length, step.name);

      try {
        // Skip step if condition function returns false
        if (step.condition && !step.condition(params, prevResults)) {
          actionLog.addStepResult(logEntry, step.name + ' (skipped)', true);
          results.push({ step: step.name, success: true, skipped: true, data: null });
          continue;
        }

        // Build the path (may be dynamic)
        let path = typeof step.path === 'function' ? step.path(params, prevResults) : step.path;

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
        // push the current form state onto the backup stack before modification.
        if (step.method === 'GET' && action.category === 'forms' && response.data &&
            action.steps.some(s => s.method === 'PUT') && params.formId) {
          if (!this.formBackupStacks[params.formId]) {
            this.formBackupStacks[params.formId] = [];
          }
          this.formBackupStacks[params.formId].push(JSON.parse(JSON.stringify(response.data)));
          logEntry.backupPushed = true;
        }

        // Extract results for chaining
        if (step.extractResult && response.data) {
          for (const [key, path] of Object.entries(step.extractResult)) {
            if (path === '') {
              prevResults[key] = response.data;
            } else {
              prevResults[key] = this._getNestedValue(response.data, path);
            }
          }
        }

        const stepSuccess = response.status >= 200 && response.status < 300;
        results.push({
          step: step.name,
          success: stepSuccess,
          status: response.status,
          data: response.data
        });

        actionLog.addStepResult(logEntry, step.name, stepSuccess, { status: response.status });

        // Stop on failure
        if (response.status >= 400) {
          results[results.length - 1].error = `HTTP ${response.status}: ${response.statusText}`;
          actionLog.addError(logEntry, `Step "${step.name}" failed`, `HTTP ${response.status}: ${response.statusText}`);
          break;
        }

      } catch (err) {
        results.push({
          step: step.name,
          success: false,
          error: err.message
        });
        actionLog.addStepResult(logEntry, step.name, false, { error: err.message });
        actionLog.addError(logEntry, `Step "${step.name}" threw`, err.message);
        break;
      }
    }

    const allSuccess = results.every(r => r.success);
    this.onActionComplete(actionId, allSuccess, results);

    await actionLog.finalize(logEntry, allSuccess ? 'success' : 'failed');
    _currentLogEntry = null;

    // Build a deep link for certain action types when successful
    let link = null;
    if (allSuccess && results.length > 0) {
      const lastResult = results[results.length - 1];
      const data = lastResult.data;
      if (action.category === 'reports' && actionId === 'create-report') {
        // Find the SID from whichever step produced it (core-service returns SID in PascalCase)
        // r.data is the response wrapper {status, statusText, headers, data} — the actual payload is r.data.data
        const reportSid = results.reduce((sid, r) => r.data?.data?.SID || r.data?.data?.sid || r.data?.SID || r.data?.sid || sid, null);
        if (reportSid) {
          link = { url: `${this.baseUrl}/workflow/admin/reports/${reportSid}`, label: 'Open report' };
        }
      } else if (data && action.category === 'forms' && actionId === 'create-form' && (data.data?.sid || data.sid)) {
        const formSid = data.data?.sid || data.sid;
        link = { url: `${this.baseUrl}/workflow/admin/forms/${formSid}/builder`, label: 'Open form' };
      }
    }

    return {
      actionId,
      label: action.label,
      success: allSuccess,
      results,
      link
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

  // Render deep link if available (e.g., link to new report, form, etc.)
  if (result.link && result.link.url) {
    html += `
      <div class="result-link" style="margin-top: 8px;">
        <a href="${result.link.url}" target="_blank" rel="noopener" style="color: #3949ab; text-decoration: underline; font-weight: 500;">
          🔗 ${result.link.label || 'Open'}
        </a>
      </div>
    `;
  }

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
  actionLog,
  buildConfirmationHTML,
  buildProgressHTML,
  buildResultHTML,
  buildParamEditorHTML
};

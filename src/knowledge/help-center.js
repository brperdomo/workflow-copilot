// Workflow Copilot - Help Center Knowledge Base
// Indexed from https://www.nutrient.io/workflow-automation/help-center/

export const HELP_CENTER = {

  formBuilder: {
    articles: {
      createForm: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/create-a-new-form/',
      createQuestions: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/create-form-questions/',
      aiFormGenerator: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/using-ai-form-generator/',
      editQuestions: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/edit-form-questions/',
      aiDataExtraction: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/using-ai-data-extraction-question/',
      contactSearch: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/contact-search-question/',
      previewAndEditor: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/form-preview-and-editor/',
      rulesShowHide: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/form-rules-show-hide/',
      calculations: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/calculations-in-forms/',
      importExport: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/importing-and-exporting-forms/',
      templates: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/form-templates/',
      gridQuestion: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/using-the-grid-question/',
      importDataIntoGrids: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/importing-data-into-grids/',
      requestRecord: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/set-up-a-request-record/',
      cssStyles: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/css-styles-in-forms/',
      developerForm: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/developer-form/',
      calendarField: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/calendar-field/',
      attachments: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/adding-attachments-to-forms/',
      restfulDataElements: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/restful-data-elements/',
      copyPasteCSS: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/forms/copy-and-paste/'
    },

    formRules: {
      description: 'Form rules enable dynamic behavior based on user responses. Conditions trigger effects like show/hide/disable/enable/required/set answer.',
      conditions: {
        operators: ['equals', 'less than', 'less than or equal to', 'greater than', 'greater than or equal to', 'contains', 'does not contain'],
        logic: 'Combine with AND/OR. Create condition groups for complex rules.'
      },
      effects: {
        types: ['Show', 'Hide', 'Disable', 'Enable', 'Required', 'Unrequired', 'Set Answer'],
        targets: ['Question', 'Section']
      },
      inverseRules: 'System can auto-generate inverse rules for opposite conditions.',
      bestPractice: 'Do NOT mix Form Rules and JavaScript on the same form. If using Script, do all logic from the Form Script. Binding onChange in script disables that question from triggering Form Rules.'
    },

    cssInForms: {
      howToAdd: 'Access the CSS panel in the Form Builder. Define classes with: .classname { property: value !important; }',
      globalLabelClass: '.int-label { font-size:14pt; color:#707070 !important; }',
      builtInClasses: {
        backgrounds: ['.back-grey', '.back-yellow', '.back-red'],
        fontColors: ['.fcolor-black', '.fcolor-red', '.fcolor-green'],
        fontSizes: ['.fsize-12', '.fsize-14', '.fsize-16'],
        borderRadius: ['.corner-3', '.corner-5', '.corner-10'],
        borders: ['.bord-black', '.bord-red', '.bord-green', '.bord-grey', '.bord-dotted', '.bord-bevel'],
        icons: ['.icon-email', '.icon-phone', '.icon-home']
      },
      formStructureSelectors: {
        'form': 'Main form container',
        '.title-container': 'Header section',
        '.title': 'Form title',
        '.wrapper': 'Content wrapper',
        'md-input-container': 'Input wrapper',
        '.md-input': 'Text inputs',
        'md-input-container>md-select': 'Dropdowns',
        '.pikadayDatePicker': 'Date pickers',
        'textarea': 'Text areas',
        '.signaturePadCanvas': 'Signature fields',
        '.md-icon': 'Icon styling',
        '.md-checked, .md-off, .md-on': 'Checkbox states',
        'int-question-radio-button': 'Radio buttons',
        '.md-button': 'Buttons',
        '.buttons_bar': 'Button container',
        'int-form-section-dropzone': 'Section dropzones',
        'int-question-signature': 'Signature containers',
        '.ui-grid-*': 'Table/grid elements',
        '.theme-color-bar': 'Color bar (usually hidden with display:none)'
      },
      tips: [
        'Use !important flags for CSS specificity',
        'Preview changes in Form Preview tab, not the builder',
        'Apply multiple classes per field by separating with spaces',
        'Version 8 uses simplified selectors (.md-input)',
        'Version 7 uses form-scoped selectors (form .md-input)',
        'Font: Poppins, sans-serif commonly used via Google Fonts import'
      ]
    },

    developerForm: {
      description: 'Custom HTML/HTML5 forms with unrestricted JavaScript, CSS, and script library support. Cannot be reused across processes like standard forms.',
      tabs: {
        formCode: 'HTML/HTML5/JavaScript. Optional <script id="IntegrifyForm"></script> tag provides helper functions and a task variable with prefill data as JSON key-value pairs.',
        viewOnlyCode: 'Displays submitted forms. Use IntegrifyForm.submittedValues to populate values.',
        prefillMappings: 'Define process values injected into Form Code during execution.',
        fieldsToCapture: 'Map form fields to process data: Key Name (matches HTML name attribute), Label, Data Type.'
      }
    },

    calculations: {
      description: 'Dynamic calculations using form rules. Access via Rules > Add Rule.',
      constraints: [
        'Condition fields must be number fields',
        'Dont add more conditions than needed (unused cause errors)',
        'Leave spaces between variables and operators'
      ]
    },

    importExport: {
      format: 'JSON files',
      exportPath: 'Form > Detail > Export (saves as JSON)',
      importPath: 'Forms > View > Templates > Add Templates > Import (upload JSON)',
      apiEndpoints: {
        create: 'POST /api/forms/create',
        createWithLayout: 'POST /api/forms/createWithLayout',
        import: 'POST /api/forms/import',
        search: 'GET /api/forms/search',
        getForm: 'GET /api/forms/{formSids}',
        getQuestions: 'GET /api/forms/{formSid}/questions'
      }
    }
  },

  apiInformation: {
    description: 'The Nutrient Workflow API enables management of processes, requests, tasks, reports, and users.',
    authentication: {
      apiKeyGeneration: 'Settings > gear icon > API Keys > Create API Key. IMPORTANT: Copy the Private Key immediately - it will not be shown again.',
      jwtToken: 'Most API tasks require a JWT passed in the header. Retrieve using your API key, then use as bearer authentication.',
      userBasedApiKeys: 'v8.11.0+ allows user-based API keys that tie permissions to specific user accounts.',
      envTokens: 'IntegrifyEnv tokens are for system functions only and cannot be used by external systems.',
      impersonation: 'GET /api/auth/apikey/{tenant}/{key}/impersonate/{userName} - get JWT representing a specific user'
    },
    swaggerDocs: 'Available at System/APIs section with expandable function listings and "Try it out" feature.'
  },

  developmentResources: {
    articles: {
      architecture: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/development-resources/architecture/',
      apiInformation: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/development-resources/api-information/',
      securityOverview: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/development-resources/security-overview/',
      javascriptHelp: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/development-resources/javascript-help/',
      dashboardWidgets: 'https://www.nutrient.io/guides/workflow-automation/admin-guide/development-resources/creating-new-dashboard-widgets/'
    },
    javascriptResources: {
      exampleForms: ['JavaScript_Examples.json (most question types)', 'JavaScript_Examples_Grid_Edition.json (grid questions)'],
      scriptingReference: 'Workflow Automation Scripting Reference PDF (updated March 2024)'
    }
  }
};

// Workflow Copilot - Form Scripting Knowledge Base
// Complete reference for Nutrient Workflow Form Scripting (ECMA Script/JavaScript)
// Extracted from the Workflow Form Scripting Reference Manual

export const FORM_SCRIPTING = {
  overview: `Workflow Forms support custom scripting (ECMA Script/JavaScript) which provides a very flexible solution in creating a rich user experience. Each question type, as well as the various layout elements (Sections, Containers, etc.) have specific properties and methods available to use within the Form's script. This Reference Manual provides the information for the supported properties and methods of each element and Question Type/Field Type.

To add custom script to a form, from the Form Builder click on the JAVASCRIPT tab. This will display the Form's script editor. Standard ECMA Script (JavaScript) is supported.

The custom script is executed when the Form is loaded in Runtime mode, Preview mode, or View mode (formState). You can create global variables within the script as well as bind to events. Note that there is a limited number of event types available for the Workflow form and Questions compared to the number available when using script on a standard HTML page.

IMPORTANT: As general rule, and best practice, you should not mix Form Rules and JavaScript on the same form. If you have need for Script on the form, you should perform all functionality from the Form Script. Note that if you bind an event to a Question's onChange event, that binding will disable that Question triggering the evaluation of the Form Rules.

IMPORTANT: The Workflow form object, intForm, is the supported scripting object for accessing and working with a Workflow form. Properties and methods not included in this reference are not supported for form scripting, and their functionality may change or be eliminated entirely in any Workflow software release.`,

  intForm: {
    description: `The Workflow form object is named intForm. All interactions within the script should be done using this intForm object. You should never (with 1 or 2 exceptions) address HTML objects directly, as they are created dynamically by the Workflow framework, and the HTML structures and references may change from release to release.`,
    formState: `The formState property contains one of three values: "preview", "runtime", "completed". Sometimes you want the Form's script to perform differently, depending on what mode (formState) it's in. You can incorporate the formState value in your script to accomplish this.`,
    events: {
      onSubmit: `intForm.events.onSubmit = () => myFunction() — Binds a custom function to the Form's onSubmit event. The onSubmit event occurs when the user clicks the SUBMIT button. IMPORTANT: This will REPLACE the built-in form submit functionality, so the custom script must also handle actually submitting the form by calling intForm.submit().`,
      onSaveDraft: `intForm.events.onSaveDraft = () => myFunction() — Binds a custom function to the Form's saveDraft event. The saveDraft event occurs when the user clicks SAVE DRAFT button. The custom function must contain a call to intForm.saveDraft() to actually save the Form Draft.`
    },
    methods: {
      getElementByClientID: `intForm.getElementByClientID(c) — where c is the clientID of the Question. This method gives you access to the individual Questions/Fields on the Form. Each Question Type has its own set of properties and methods.`,
      getSectionByClientID: `intForm.getSectionByClientID(c) — where c is the clientID of the Section. Used to access Section layout elements.`,
      submit: `intForm.submit() — Submits the form. Must be called in custom onSubmit handlers to actually submit the form.`,
      saveDraft: `intForm.saveDraft() — Saves the form as a draft. Must be called in custom onSaveDraft handlers to actually save the draft.`,
      generateUniqueID: `intForm.generateUniqueID() — Generates a unique identifier that can be used for various purposes in form scripting.`
    },
    buttons: {
      description: `Clicking the SUBMIT or SAVE DRAFT buttons disables both buttons prior to calling the onSubmit or onSaveDraft event, so you must re-enable the buttons if your code's logic does not end in execution of intForm.submit() or intForm.saveDraft(). If you do not enable the buttons, the user will not be able to submit or save the draft after making the necessary changes.`,
      submitButton: {
        enable: `intForm.submitButton.enable() — Re-enables the Submit button.`,
        disable: `intForm.submitButton.disable() — Disables the Submit button. Best practice to call at the start of custom onSubmit handlers to prevent double-clicks.`
      },
      saveDraftButton: {
        enable: `intForm.saveDraftButton.enable() — Re-enables the Save Draft button.`,
        disable: `intForm.saveDraftButton.disable() — Disables the Save Draft button.`
      }
    },
    recipientTask: {
      description: `intForm.recipientTask is present if the Form is opened from a Form Task. The object contains information specific to the current user's Recipient Task, but also contains basic information about the Request (Instance) and the Form Task itself. All values in the recipientTask object are considered READ ONLY – they should never be changed by the Form Script.`,
      properties: [
        'TaskName',
        'InstanceSID',
        'InstanceID',
        'Instance.CreatedDate',
        'Instance.LastMilestone'
      ]
    }
  },

  clientIdPrefixes: {
    description: `When creating new Questions on a Form, it is recommended and a best practice to always change the generated Client ID with a more meaningful Client ID. This will allow you to more easily identify the Question references within the Script. It is also best practice to use standard prefixes for the Client IDs that indicate the Question Type.`,
    prefixes: {
      stxt: 'ShortText',
      ltxt: 'LongText',
      num: 'Number',
      lnk: 'Link / Hyperlink',
      eml: 'Email',
      cal: 'Calendar',
      sel: 'Select List',
      ck: 'Checkboxes',
      rad: 'Radio Buttons',
      fa: 'File Attachment',
      sig: 'Signature',
      cs: 'Contact Search',
      sb: 'Search Box',
      rest: 'RESTful Element',
      grd: 'Grid / Table',
      rtxt: 'Rich Text',
      tz: 'TimeZone',
      pwd: 'Password',
      sec: 'Section',
      cnt: 'Container'
    }
  },

  fieldTypes: {
    shortText: {
      questionType: 'ShortText',
      description: 'A single-line text input field.',
      properties: {
        Answer: { desc: 'The value of the field. For these field types the value is always a simple text value. Note that the empty value is null when the field has never had a value. If a previous answer value has been cleared/removed, then the value is an empty string.', rw: 'RW' },
        class: { desc: 'The CSS style class(es) applied to the field on the form (See section on Defining and Using Classes)', rw: 'RW' },
        ClientID: { desc: 'The ID of the html element on the form. This is the attribute that is used to reference any element on the form. The ClientID for a field can be changed on the configuration screen. It is recommended that the default long numeric ID is changed to something more meaningful.', rw: 'R' },
        disabled: { desc: 'Set to either true or false. If true, the field is disabled and cannot be selected or changed.', rw: 'RW' },
        events: { desc: 'Contains any script bound to the onFocus, onBlur, and onChange events of the field on the form. These events are emitted similar to the corresponding standard HTML events.', rw: 'RW' },
        flex: { desc: 'The width % applied to the field on the form. This value is in relation to the container that contains the field on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field (see also: ClientID)', rw: 'R' },
        isdirty: { desc: 'Indicates whether the value in the field has been changed since the form was loaded. Returns true if changed, false if not.', rw: 'R' },
        Label: { desc: 'The label text shown on the form for the field.', rw: 'RW' },
        originalAnswer: { desc: 'The value of the field when the form initially loads.', rw: 'R' },
        QuestionType: { desc: 'ShortText', rw: 'R' },
        readonly: { desc: 'Set to either true or false. If true, the field can be selected but the value cannot be changed.', rw: 'RW' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'The validation values and messages used when a form is submitted. Properties: regExMessage, regEx, Max (maximum length), maxMessage, Min (minimum length), minMessage, required (true/false - also triggers required field indicator *), requiredMessage.', rw: 'RW' }
      },
      events: ['onFocus', 'onBlur', 'onChange'],
      initValue: 'null',
      clearValue: 'empty string'
    },

    longText: {
      questionType: 'LongText',
      description: 'A multi-line text input field (textarea). LongText is backslash encoded. Use standard backslash codes, such as \\n for a carriage return, to include non-displayed control characters.',
      properties: {
        Answer: { desc: 'The value of the field. For these field types the value is always a simple text value. LongText is backslash encoded. Note that the empty value is null when the field has never had a value. If a previous answer value has been cleared/removed, then the value is an empty string.', rw: 'RW' },
        class: { desc: 'The CSS style class(es) applied to the field on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        disabled: { desc: 'Set to either true or false. If true, the field is disabled and cannot be selected or changed.', rw: 'RW' },
        events: { desc: 'Contains any script bound to the onFocus, onBlur, and onChange events of the field on the form.', rw: 'RW' },
        flex: { desc: 'The width % applied to the field on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isdirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label text shown on the form for the field.', rw: 'RW' },
        originalAnswer: { desc: 'The value of the field when the form initially loads.', rw: 'R' },
        QuestionType: { desc: 'LongText', rw: 'R' },
        readonly: { desc: 'Set to either true or false. If true, the field can be selected but the value cannot be changed.', rw: 'RW' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'The validation values and messages. Properties: regExMessage, regEx, Max, maxMessage, Min, minMessage, required (true/false), requiredMessage.', rw: 'RW' }
      },
      events: ['onFocus', 'onBlur', 'onChange'],
      initValue: 'null',
      clearValue: 'empty string'
    },

    number: {
      questionType: 'Number',
      description: 'A numeric input field. Number initializes and clears to null, unless a currency format is selected and then it initializes and clears to the value 0.',
      properties: {
        Answer: { desc: 'The value of the field. For Number the value is a numeric text value. Empty value is null when never set. If currency option is used, clears to 0 (zero).', rw: 'RW' },
        class: { desc: 'The CSS style class(es) applied to the field on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        disabled: { desc: 'Set to either true or false. If true, the field is disabled.', rw: 'RW' },
        events: { desc: 'Contains any script bound to the onFocus, onBlur, and onChange events.', rw: 'RW' },
        flex: { desc: 'The width % applied to the field on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isdirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label text shown on the form for the field.', rw: 'RW' },
        originalAnswer: { desc: 'The value of the field when the form initially loads.', rw: 'R' },
        QuestionType: { desc: 'Number', rw: 'R' },
        readonly: { desc: 'Set to either true or false.', rw: 'RW' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'Properties: regExMessage, regEx, Max, maxMessage, Min, minMessage, required (true/false), requiredMessage.', rw: 'RW' }
      },
      events: ['onFocus', 'onBlur', 'onChange'],
      initValue: 'null (0 for currency)',
      clearValue: 'null (0 for currency)'
    },

    link: {
      questionType: 'Hyperlink',
      description: 'A URL/hyperlink input field.',
      properties: {
        Answer: { desc: 'The value of the field (URL text). Empty value is null when never set, empty string if cleared.', rw: 'RW' },
        class: { desc: 'The CSS style class(es) applied to the field on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        disabled: { desc: 'Set to either true or false.', rw: 'RW' },
        events: { desc: 'Contains any script bound to the onFocus, onBlur, and onChange events.', rw: 'RW' },
        flex: { desc: 'The width % applied to the field on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isdirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label text shown on the form for the field.', rw: 'RW' },
        originalAnswer: { desc: 'The value of the field when the form initially loads.', rw: 'R' },
        QuestionType: { desc: 'Hyperlink', rw: 'R' },
        readonly: { desc: 'Set to either true or false.', rw: 'RW' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'Properties: regExMessage, regEx, Max, maxMessage, Min, minMessage, required (true/false), requiredMessage.', rw: 'RW' }
      },
      events: ['onFocus', 'onBlur', 'onChange'],
      initValue: 'null',
      clearValue: 'empty string'
    },

    email: {
      questionType: 'EmailAddress',
      description: 'An email address input field.',
      properties: {
        Answer: { desc: 'The value of the field (email text). Empty value is null when never set, empty string if cleared.', rw: 'RW' },
        class: { desc: 'The CSS style class(es) applied to the field on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        disabled: { desc: 'Set to either true or false.', rw: 'RW' },
        events: { desc: 'Contains any script bound to the onFocus, onBlur, and onChange events.', rw: 'RW' },
        flex: { desc: 'The width % applied to the field on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isdirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label text shown on the form for the field.', rw: 'RW' },
        originalAnswer: { desc: 'The value of the field when the form initially loads.', rw: 'R' },
        QuestionType: { desc: 'EmailAddress', rw: 'R' },
        readonly: { desc: 'Set to either true or false.', rw: 'RW' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'Properties: regExMessage, regEx, Max, maxMessage, Min, minMessage, required (true/false), requiredMessage.', rw: 'RW' }
      },
      events: ['onFocus', 'onBlur', 'onChange'],
      initValue: 'null',
      clearValue: 'empty string'
    },

    calendar: {
      questionType: 'Calendar',
      description: 'A date picker field. Answer is a date/moment object and should not be changed directly. Always use setAnswer() to change the date value. You can pass a date string in YYYY-MM-DD format or a Date object.',
      properties: {
        Answer: { desc: 'The value of the field. For Calendar the value can be represented via "moment object" or a date object. Answer should be considered Read-Only and only updated by using the setAnswer method. Answer is null if no date has been entered/selected.', rw: 'R' },
        answerUI: { desc: 'The date representation displayed in the Calendar question (e.g. 2022-09-14)', rw: 'R' },
        class: { desc: 'The CSS style class(es) applied to the field on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the element on the form. A given ClientID should be used only one time on the form (it should be unique within a given form).', rw: 'R' },
        disabled: { desc: 'Set to either true or false. If true, the field is disabled and cannot be selected or changed.', rw: 'RW' },
        events: { desc: 'Contains any script bound to the onFocus, onBlur, and onChange events of the field on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isdirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label text shown on the form for the field.', rw: 'RW' },
        originalAnswer: { desc: 'The value of the field when the form initially loads.', rw: 'R' },
        QuestionType: { desc: 'Calendar', rw: 'R' },
        readonly: { desc: 'Set to either true or false.', rw: 'RW' },
        setAnswer: { desc: 'Method that sets the date for a Calendar type question. Date should be in YYYY-MM-DD format or can be a Date object. Example: intForm.getElementByClientID("calStartDate").setAnswer("2022-08-28") or pass a Date object.', rw: 'method' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        todaysDate: { desc: 'Contains the current server date in the format MM/DD/YYYY. Useful for obtaining a date that is not dependent on a user\'s local system date.', rw: 'R' },
        validation: { desc: 'Properties: futureDatesOnly (true/false), regExMessage, regEx, maxDate, maxMessage, minDate, minMessage, required (true/false), requiredMessage.', rw: 'RW' }
      },
      events: ['onFocus', 'onBlur', 'onChange'],
      initValue: 'null',
      clearValue: 'null',
      notes: 'flex is NOT available for the Calendar field type. Always use setAnswer() to set the date value, never set Answer directly.'
    },

    selectList: {
      questionType: 'DbSelectList',
      description: 'A dropdown select list. Can support single or multiple selections. For multiple selections the selected values in Answer are stored as a comma separated list.',
      properties: {
        Answer: { desc: 'The value of the item selected in the list. Comma separated values if multiple answers are selected. If the field has no value it can be either null or an empty string. Note that this is a comma delimited list, so Answer values cannot contain commas.', rw: 'RW' },
        Choices: { desc: 'Array of objects containing the Label/Value pairs contained in the drop-down list. Note that when updating this list via script you need to only populate the Label and Value properties, the other properties are only used in Form Design.', rw: 'RW' },
        class: { desc: 'The style class(es) applied to the field on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        disabled: { desc: 'Set to either true or false.', rw: 'RW' },
        events: { desc: 'Contains any script bound to the onFocus, onBlur, and onChange events.', rw: 'RW' },
        flex: { desc: 'The width % applied to the question on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isdirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label shown on the form for the question.', rw: 'RW' },
        multiple: { desc: 'Indicates whether multiple selections are allowed (true/false). For Select List a multiple attribute is added and set to true (unlike FileAttachment/ContactSearch which change QuestionType).', rw: 'RW' },
        multiChoiceAnswer: { desc: 'Array of values selected when multiple=true.', rw: 'R' },
        originalAnswer: { desc: 'The value of the field when the form initially loads.', rw: 'R' },
        QuestionType: { desc: 'DbSelectList', rw: 'R' },
        readonly: { desc: 'Set to either true or false.', rw: 'RW' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'Properties: required (true/false), requiredMessage.', rw: 'RW' }
      },
      events: ['onFocus', 'onBlur', 'onChange'],
      initValue: 'null or empty string',
      clearValue: 'null or empty string'
    },

    checkboxes: {
      questionType: 'DbCheckbox',
      description: 'A group of checkboxes. If you are setting the value of a checkbox within script, then you must set both the Answer value and set the Selected attribute of the corresponding Choices.',
      properties: {
        Answer: { desc: 'Comma-space separated list of the values of the selected checkboxes. If the field has no value it can be either null or an empty string. If you are setting the value of a checkbox within script, then you must set both the Answer value and set the Selected attribute of the corresponding Choices. Note that this is a comma delimited list, so Answer values cannot contain commas.', rw: 'RW' },
        Choices: { desc: 'An array of objects corresponding to the checkboxes. Each object contains: Label (the label of the individual checkbox), Selected (true/false - indicates whether the checkbox is displayed as checked; if never checked this attribute is undefined), Value (the value stored in Answer if selected). When updating via script only populate Label and Value properties.', rw: 'RW' },
        class: { desc: 'The style class(es) applied to the field on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        columnOrRow: { desc: 'Indicates horizontal (row) or vertical (column) checkbox orientation.', rw: 'RW' },
        disabled: { desc: 'Set to either true or false.', rw: 'RW' },
        events: { desc: 'Contains any script bound to the onFocus, onBlur, and onChange events.', rw: 'RW' },
        flex: { desc: 'The width % applied to the question on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isDirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label shown on the form for the question.', rw: 'RW' },
        originalAnswer: { desc: 'The value of the field when the form initially loads.', rw: 'R' },
        QuestionType: { desc: 'DbCheckbox', rw: 'R' },
        readonly: { desc: 'Set to either true or false.', rw: 'RW' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'Properties: required (true/false), requiredMessage.', rw: 'RW' }
      },
      events: ['onFocus', 'onBlur', 'onChange'],
      initValue: 'null',
      clearValue: 'empty string'
    },

    radioButtons: {
      questionType: 'DbRadioButton',
      description: 'A group of radio buttons. Only one can be selected at a time.',
      properties: {
        Answer: { desc: 'The value of the selected radio button. If no radio button is selected the value will be null.', rw: 'RW' },
        Choices: { desc: 'An array of objects corresponding to the radio buttons. Each object contains: Label (the label of the individual radio button), Value (the value stored in Answer if selected). When updating via script only populate Label and Value properties.', rw: 'RW' },
        class: { desc: 'The style class(es) applied to the question on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        disabled: { desc: 'Set to either true or false.', rw: 'RW' },
        events: { desc: 'Contains any script bound to the onFocus, onBlur, and onChange events.', rw: 'RW' },
        flex: { desc: 'The width % applied to the question on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isDirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label shown on the form for the question.', rw: 'RW' },
        originalAnswer: { desc: 'The value of the field when the form initially loads.', rw: 'R' },
        QuestionType: { desc: 'DbRadioButton', rw: 'R' },
        readonly: { desc: 'Set to either true or false.', rw: 'RW' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'Properties: required (true/false), requiredMessage.', rw: 'RW' }
      },
      events: ['onFocus', 'onBlur', 'onChange'],
      initValue: 'null',
      clearValue: 'null'
    },

    fileAttachment: {
      questionType: 'FileAttachment',
      questionTypeMulti: 'MultiFileAttachment',
      description: 'A file upload field. Answer is an array of file objects. Checking "Allow Multiples" changes the QuestionType to MultiFileAttachment.',
      properties: {
        Answer: { desc: 'An array of objects, one for each file attachment, with the following elements: file_key (unique value assigned to the file), lastModifiedDate, name (file name), size, text (file name text displayed on the form), type (file type designator e.g. image/jpeg).', rw: 'RW' },
        class: { desc: 'The style class(es) applied to the question on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        disabled: { desc: 'Set to either true or false.', rw: 'RW' },
        events: { desc: 'Contains any script bound to the onFocus, onBlur, and onChange events.', rw: 'RW' },
        flex: { desc: 'The width % applied to the question on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isDirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label shown on the form for the question.', rw: 'RW' },
        multiple: { desc: 'If true, selection of multiple file attachments is allowed, else false.', rw: 'RW' },
        QuestionType: { desc: 'FileAttachment or MultiFileAttachment', rw: 'R' },
        readonly: { desc: 'Set to either true or false. If true, the field can be selected/file opened but the value cannot be changed.', rw: 'RW' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'Properties: requiredMessage.', rw: 'RW' }
      },
      events: ['onFocus', 'onBlur', 'onChange'],
      initValue: '[] (empty array)',
      clearValue: '[] (empty array)'
    },

    signature: {
      questionType: 'Signature',
      description: 'A signature pad field that captures a drawn signature. The signature is stored as an image data URL.',
      properties: {
        Answer: { desc: 'The signature data (typically a data URL or base64 encoded image).', rw: 'R' },
        class: { desc: 'The style class(es) applied to the question on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        disabled: { desc: 'Set to either true or false.', rw: 'RW' },
        events: { desc: 'Contains any script bound to events of the field.', rw: 'RW' },
        flex: { desc: 'The width % applied to the question on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isDirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label shown on the form for the question.', rw: 'RW' },
        QuestionType: { desc: 'Signature', rw: 'R' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'Properties: required (true/false), requiredMessage.', rw: 'RW' }
      },
      events: ['onChange'],
      initValue: 'null',
      clearValue: 'null'
    },

    contactSearch: {
      questionType: 'ContactSearch',
      questionTypeMulti: 'MultiContactSearch',
      description: 'A contact/user lookup field. Answer is an array of contact objects. Checking "Allow Multiples" changes the QuestionType to MultiContactSearch.',
      properties: {
        Answer: { desc: 'An array of objects, one for each contact selected. Each object contains: Email (contacts email address), ID (contact ID), Name (the name from the contact profile), SID (contact SID), Title (the title of the user), UserName (the Workflow user name), text (the contact name displayed on the form). Answer is empty array if there is no selection.', rw: 'RW' },
        class: { desc: 'The style class(es) applied to the question on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        disabled: { desc: 'Indicates whether the question field on the form is set to disabled (true/false).', rw: 'RW' },
        events: { desc: 'Contains any script for the onFocus, onBlur, and onChange events bound to the question field on the form.', rw: 'RW' },
        flex: { desc: 'The width % applied to the question on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isDirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label shown on the form for the question.', rw: 'RW' },
        originalAnswer: { desc: 'The value of the field when the form initially loads.', rw: 'R' },
        QuestionType: { desc: 'ContactSearch, MultiContactSearch', rw: 'RW' },
        searchFilter: { desc: 'An array containing the SID (0) and name (1) of the contact search group filter.', rw: 'RW' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'Properties: requiredMessage.', rw: 'RW' }
      },
      events: ['onFocus', 'onBlur', 'onChange'],
      initValue: '[] (empty array)',
      clearValue: '[] (empty array)'
    },

    searchBox: {
      questionType: 'SearchBox',
      description: 'A search/autocomplete field that can be populated from static choices or a database source. Has special setAnswer and clearAnswer methods.',
      properties: {
        Answer: { desc: 'The value of the selected item (see also setAnswer, clearAnswer). Answer is Read-Only - use setAnswer/clearAnswer methods to modify.', rw: 'R' },
        Choices: { desc: 'An array of Label/Value pairs that are available in the Search Box list (for non-db-derived results).', rw: 'RW' },
        class: { desc: 'The style class(es) applied to the question on the form.', rw: 'RW' },
        clearAnswer: { desc: 'Method to clear the label/value settings and update the field display.', rw: 'method' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        dbSettings: { desc: 'An object containing the data source, query and mapping information. Properties: DbSourceLabelColumn (column name for Label), DbSourceValueColumn (column name for Value), hideSearchResultFields (list of column names to exclude from displayed list), SID (SID of the db source), Mappings (array of ClientID and ColumnName pairs for mapping other columns to fields on the form).', rw: 'RW' },
        disabled: { desc: 'Set to either true or false.', rw: 'RW' },
        events: { desc: 'Contains any script for the onFocus, onBlur, and onChange events.', rw: 'RW' },
        flex: { desc: 'The width % applied to the question on the form.', rw: 'RW' },
        friendlyAnswer: { desc: 'The LABEL that is displayed in the field when a selection is made.', rw: 'R' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isDirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label shown on the form for the question.', rw: 'RW' },
        originalAnswer: { desc: 'The value of the field when the form initially loads.', rw: 'R' },
        QuestionType: { desc: 'SearchBox', rw: 'R' },
        readonly: { desc: 'Set to either true or false.', rw: 'RW' },
        setAnswer: { desc: 'Method to set the values of the Answer and Label and related attributes. You must supply a JSON object containing the keys Label and Value. Example: setAnswer({"Value": 712, "Label": "HR"})', rw: 'method' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'Properties: requiredMessage.', rw: 'RW' }
      },
      events: ['onFocus', 'onBlur', 'onChange'],
      initValue: 'null',
      clearValue: 'null'
    },

    richText: {
      questionType: 'RichText',
      description: 'A rich text editor field. Answer contains HTML tagged content that can include standard HTML elements such as tables, links, images, etc. The RichText field does not support the onFocus event.',
      properties: {
        Answer: { desc: 'HTML tagged content that has been entered into the field. This can contain standard HTML elements, such as tables, links, images, etc.', rw: 'RW' },
        class: { desc: 'The style class(es) applied to the question on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        disabled: { desc: 'Indicates whether the question field on the form is set to disabled (true/false).', rw: 'RW' },
        events: { desc: 'Contains any script for the onBlur and onChange events bound to the question field on the form. NOTE: RichText does NOT support the onFocus event.', rw: 'RW' },
        flex: { desc: 'The width % applied to the question on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isDirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label shown on the form for the question.', rw: 'RW' },
        loaded: { desc: 'Indicates the Question has initialized and any prefill data has been set. true/false', rw: 'R' },
        QuestionType: { desc: 'RichText', rw: 'R' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'Properties: requiredMessage.', rw: 'RW' }
      },
      events: ['onBlur', 'onChange'],
      initValue: 'null',
      clearValue: 'empty string'
    },

    timeZone: {
      questionType: 'TimeZone',
      description: 'A time zone selector dropdown.',
      properties: {
        Answer: { desc: 'Contains the name of the selected time zone.', rw: 'RW' },
        class: { desc: 'The style class(es) applied to the question on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        disabled: { desc: 'Indicates whether the question field on the form is set to disabled (true/false).', rw: 'RW' },
        events: { desc: 'Contains any script for the onFocus, onBlur, and onChange events.', rw: 'RW' },
        flex: { desc: 'The width % applied to the question on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isDirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label shown on the form for the question.', rw: 'RW' },
        originalAnswer: { desc: 'The value of the field when the form initially loads.', rw: 'R' },
        QuestionType: { desc: 'TimeZone', rw: 'R' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'Properties: requiredMessage.', rw: 'RW' }
      },
      events: ['onFocus', 'onBlur', 'onChange'],
      initValue: 'null',
      clearValue: 'null'
    },

    password: {
      questionType: 'Password',
      description: 'A password input field with optional confirm password field.',
      properties: {
        Answer: { desc: 'Contains the password value entered (see also ConfirmPassword).', rw: 'RW' },
        class: { desc: 'The style class(es) applied to the question on the form.', rw: 'R' },
        clearAnswer: { desc: 'Method that clears both the Answer and ConfirmPassword attributes.', rw: 'method' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        ConfirmPassword: { desc: 'Contains the Confirm Password value entered (see also Answer).', rw: 'R' },
        disabled: { desc: 'Indicates whether the question field on the form is set to disabled (true/false).', rw: 'RW' },
        events: { desc: 'Contains any script for the onFocus, onBlur, and onChange events.', rw: 'RW' },
        flex: { desc: 'The width % applied to the question on the form.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        isDirty: { desc: 'Indicates whether the value has been changed since the form was loaded.', rw: 'R' },
        Label: { desc: 'The label shown on the form for the question.', rw: 'RW' },
        QuestionType: { desc: 'Password', rw: 'R' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        validation: { desc: 'Properties: regExMessage, regEx, Max, maxMessage, Min, minMessage, required (true/false), requiredMessage.', rw: 'RW' }
      },
      events: ['onFocus', 'onBlur', 'onChange'],
      initValue: 'null',
      clearValue: 'null'
    },

    restfulElement: {
      questionType: 'RESTfulElement',
      description: `The RESTful Element is a powerful form question type that allows making HTTP requests to external APIs or the Workflow server from within the form. It can execute GET, POST, PUT, DELETE requests and handle responses. The RESTful element is configured in the form builder with URL, method, headers, and body templates, but can also be fully controlled via script.

Key concepts:
- The request object contains the HTTP request configuration
- executeRequest() triggers the HTTP call
- onResponse event fires when the response is received
- Server variables can be used in URL and body templates for dynamic values
- Can be used with Workflow API endpoints using relative URLs
- Supports both synchronous-style (via onResponse callback) and async patterns`,
      properties: {
        Answer: { desc: 'Contains the response data from the last executed request. Typically a JSON object or string depending on the API response.', rw: 'R' },
        class: { desc: 'The CSS style class(es) applied to the element on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the html element on the form.', rw: 'R' },
        disabled: { desc: 'Set to either true or false.', rw: 'RW' },
        events: { desc: 'Contains the onResponse event handler. Set events.onResponse to a function that processes the API response.', rw: 'RW' },
        id: { desc: 'The system-assigned field ID linked to the field.', rw: 'R' },
        Label: { desc: 'The label shown on the form for the element.', rw: 'RW' },
        QuestionType: { desc: 'RESTfulElement', rw: 'R' },
        show: { desc: 'Indicates whether the element should be shown on the form (true/false). Often set to false since RESTful elements are typically invisible.', rw: 'RW' }
      },
      request: {
        description: 'The request object configures the HTTP request to be executed.',
        properties: {
          url: 'The URL to send the request to. Can be a full URL for external APIs or a relative URL (e.g. /api/...) for Workflow server APIs. Server variables can be embedded using {{variableName}} syntax.',
          method: 'The HTTP method: GET, POST, PUT, DELETE.',
          headers: 'An object containing HTTP headers to include in the request. Common: {"Content-Type": "application/json"}.',
          body: 'The request body for POST/PUT requests. Can be a JSON string or object. Server variables can be embedded using {{variableName}} syntax.',
          serverVariables: 'An object containing key-value pairs that can be substituted into the URL and body templates using {{key}} syntax. Allows dynamic parameterization of requests based on form field values or other data.'
        }
      },
      methods: {
        executeRequest: 'Triggers the HTTP request defined in the request object. The response will be delivered via the onResponse event. Usage: intForm.getElementByClientID("restMyApi").executeRequest()',
      },
      eventHandlers: {
        onResponse: 'Fires when the HTTP response is received. The callback receives the response object. Usage: intForm.getElementByClientID("restMyApi").events.onResponse = (response) => { /* handle response */ }'
      },
      serverVariables: {
        description: 'Server variables allow dynamic values to be inserted into the request URL and body. They are defined as key-value pairs on the request object and referenced using double-curly-brace syntax {{variableName}} in the URL and body templates.',
        usage: `Set server variables before calling executeRequest:
let restEl = intForm.getElementByClientID('restMyApi');
restEl.request.serverVariables = { employeeId: '12345', department: 'HR' };
restEl.executeRequest();

In the URL template: /api/employees/{{employeeId}}
In the body template: { "dept": "{{department}}" }`
      },
      events: ['onResponse'],
      notes: `The RESTful Element is essential for:
- Loading data from external systems into form fields
- Submitting data to external APIs on form events
- Calling Workflow APIs to look up instance data, user info, etc.
- Chaining multiple API calls by triggering one request in another's onResponse handler
- Pre-populating form fields based on API responses`
    },

    grid: {
      questionType: 'Grid',
      description: 'A table/grid question that displays data in rows and columns. Supports adding/removing rows, column definitions, footer aggregations, and onChange events for row data changes. In the 24 Feb 2023 release the grid data structure was changed to add a "name" key to each column definition.',
      properties: {
        addRow: { desc: 'Method that adds a new row object to the grid. Use with getRowObject(). Usage: intForm.getElementByClientID("grdItems").addRow(newRow)', rw: 'method' },
        Answer: { desc: 'An array of JSON objects. Contains the data entered for the rows in the grid. The JSON object label/key is the name given to the column in the grid. Each answer also has a delete property (true/false) indicating the status of the checkbox for each row. You should not directly modify Answer for Grid questions; use getRowObject() and addRow() functions.', rw: 'R' },
        class: { desc: 'The style class(es) applied to the question on the form.', rw: 'RW' },
        ClientID: { desc: 'The ID of the HTML element on the form.', rw: 'R' },
        events: { desc: 'onChange event (onBlur and onFocus not yet implemented). The change event for the grid returns an object containing data about the change made to the row.', rw: 'RW' },
        flex: { desc: 'The width % applied to the question on the form.', rw: 'RW' },
        getFooterValues: { desc: 'Method: Returns an array of JSON objects containing the grid footer columns, or if supplied a column key returns the value of that column footer. Each array object contains: name, value, and aggregationType.', rw: 'method' },
        getRowObject: { desc: 'Method that returns an empty row object that matches the column definition. Used in conjunction with addRow to insert new rows into the grid.', rw: 'method' },
        'gridOptions.data': { desc: 'Contains an array of row objects for the row data contained in the grid.', rw: 'R' },
        isdirty: { desc: 'true/false - Indicates whether grid data has been changed.', rw: 'R' },
        Label: { desc: 'The label shown on the form for the question.', rw: 'RW' },
        loaded: { desc: 'Indicates whether the grid has finished loading.', rw: 'R' },
        show: { desc: 'Indicates whether the question field should be shown on the form (true/false)', rw: 'RW' },
        showDeleteButton: { desc: 'Method: Hides/Shows the Delete button for the grid (true/false). Usage: showDeleteButton(true)', rw: 'method' },
        showDeleteColumn: { desc: 'Method: Hides/Shows the selection checkboxes for each row in the grid (true/false). Usage: showDeleteColumn(true)', rw: 'method' },
        showLabel: { desc: 'Hides/Shows the label for the grid (true/false).', rw: 'RW' }
      },
      events: ['onChange'],
      initValue: '[] (empty array)',
      clearValue: '[] (empty array)',
      notes: 'In the 24 Feb 2023 release the grid data structure was changed to add a "name" key to each column definition. The "name" is a unique identifier for each column and must be used when referencing columns in your script. A new "displayName" key was also added, which is the text used as the column header. On grid columns added prior to this update the "name" will be the same as the original column name, on columns added after the release the "name" will be a unique identifier (GUID) value. Use standard array methods like splice() to remove rows from the Answer array.'
    }
  },

  layoutElements: {
    section: {
      description: 'A Section is a layout container on the form that groups questions and other elements together. Access via intForm.getSectionByClientID(clientID).',
      properties: {
        ClientID: { desc: 'The ID of the section element on the form.', rw: 'R' },
        show: { desc: 'Indicates whether the section should be shown on the form (true/false). Hiding a section hides all contained questions.', rw: 'RW' },
        Label: { desc: 'The section title/label text.', rw: 'RW' },
        class: { desc: 'The CSS style class(es) applied to the section.', rw: 'RW' },
        collapsed: { desc: 'Indicates whether the section is collapsed (true) or expanded (false). Sections can be collapsible.', rw: 'RW' }
      },
      accessMethod: 'intForm.getSectionByClientID(clientID)',
      notes: 'Use the "sec" prefix for Section ClientIDs (e.g. secEmployeeInfo).'
    },
    container: {
      description: 'A Container is a layout element within a Section that holds questions. Containers control the horizontal layout of questions within a section. Questions within the same container appear on the same row.',
      properties: {
        ClientID: { desc: 'The ID of the container element on the form.', rw: 'R' },
        show: { desc: 'Indicates whether the container should be shown on the form (true/false).', rw: 'RW' },
        class: { desc: 'The CSS style class(es) applied to the container.', rw: 'RW' }
      },
      accessMethod: 'intForm.getElementByClientID(clientID)',
      notes: 'Use the "cnt" prefix for Container ClientIDs (e.g. cntNameFields).'
    }
  },

  cssClasses: {
    description: `CSS classes can be defined and applied to form elements to customize their appearance. Classes are applied via the "class" property on each element. You can define CSS classes in the Form's CSS tab and then assign them to questions via script or the form builder configuration.

To apply a CSS class to a question via script:
  intForm.getElementByClientID('stxtName').class = 'myCustomClass';

Multiple classes can be applied as a space-separated string:
  intForm.getElementByClientID('stxtName').class = 'highlight required-field';`,

    supportedSelectors: {
      description: 'The following CSS selectors and classes can be used to style form elements. Use !important flags for CSS specificity since form styles are dynamically generated.',
      selectors: [
        { selector: 'form', desc: 'The main form element' },
        { selector: '.title-container', desc: 'The container around the form title' },
        { selector: '.title', desc: 'The form title text' },
        { selector: '.wrapper', desc: 'The main form wrapper element' },
        { selector: 'md-input-container', desc: 'Angular Material input container wrapping each field' },
        { selector: '.md-input', desc: 'The actual input element inside md-input-container' },
        { selector: 'md-select', desc: 'Angular Material select/dropdown element' },
        { selector: '.pikadayDatePicker', desc: 'The date picker calendar element' },
        { selector: 'textarea', desc: 'Textarea elements (Long Text fields)' },
        { selector: '.signaturePadCanvas', desc: 'The signature drawing canvas element' },
        { selector: '.md-icon', desc: 'Material Design icon elements' },
        { selector: '.md-checked', desc: 'Checked state for checkboxes/radio buttons' },
        { selector: '.md-off', desc: 'Unchecked state for checkboxes' },
        { selector: '.md-on', desc: 'Checked state for checkboxes' },
        { selector: 'int-question-radio-button', desc: 'Radio button question element' },
        { selector: '.md-button', desc: 'Material Design button elements' },
        { selector: '.buttons_bar', desc: 'The container for Submit/Save Draft buttons' },
        { selector: 'int-form-section-dropzone', desc: 'Section dropzone element in form builder' },
        { selector: 'int-question-signature', desc: 'Signature question element' },
        { selector: '.ui-grid-*', desc: 'UI Grid classes for Grid/Table questions (e.g. .ui-grid-header, .ui-grid-row, .ui-grid-cell)' }
      ]
    },

    versionDifferences: {
      description: 'CSS selectors differ between Workflow versions.',
      version8: 'Uses simplified selectors. Styles can target elements directly without form-scoping prefixes.',
      version7: 'Uses form-scoped selectors. Styles must be scoped to the specific form to avoid conflicts.'
    },

    bestPractices: [
      'Always use !important flags to ensure CSS specificity overrides dynamically generated styles',
      'Use the font family: Poppins, sans-serif (commonly used in Workflow forms)',
      'Test CSS changes in both preview and runtime modes',
      'Use class property on questions to conditionally apply/remove CSS classes via script',
      'For Grid/Table styling, use .ui-grid-* prefixed classes',
      'When hiding elements, prefer using the show property over CSS display:none, as show properly handles form validation'
    ],

    commonPatterns: [
      {
        name: 'Hide field label',
        css: `.myHiddenLabel md-input-container label { display: none !important; }`
      },
      {
        name: 'Change input background color',
        css: `.highlight .md-input { background-color: #ffffcc !important; }`
      },
      {
        name: 'Style section header',
        css: `int-form-section-dropzone .title { font-family: Poppins, sans-serif; font-size: 18px !important; color: #333 !important; }`
      },
      {
        name: 'Style buttons bar',
        css: `.buttons_bar .md-button { background-color: #1976d2 !important; color: white !important; }`
      },
      {
        name: 'Read-only field appearance',
        css: `.readonly-style .md-input { background-color: #f5f5f5 !important; color: #666 !important; }`
      }
    ]
  },

  propertyMethodSummary: {
    description: 'Summary of property availability across all field types. Y = valid, N = not valid.',
    answerInitClearValues: {
      'null': 'Field initializes to/clears to null (ShortText, LongText, Link, Email, Calendar, RadioButton, SearchBox, TimeZone, Password)',
      'emptyString': 'Empty string (cleared ShortText, LongText, Link, Email, Checkboxes)',
      'emptyArray': 'Empty array [] (FileAttachment, ContactSearch, Grid)',
      'zero': '0 for Number with currency format'
    },
    notes: [
      'For ContactSearch Answer is an Array with objects containing: Email, ID, Name, SID, Title, UserName, r, selected, text. Answer is empty array if no selection.',
      'File Attachment Answer is an array of File objects, each with: file_key, lastModified, lastModifiedDate, name, size, text, type, webkitRelativePath. Empty array if no file selected.',
      'Calendar validation is an object containing: futureDatesOnly (true/false), maxDate, mdDateFilter, minDate, required (true/false), requiredMessage.',
      'For Calendar questions, Answer is null if no date entered. Answer is a date object and should not be changed directly. Use setAnswer(YYYY-MM-DD).',
      'Select List fields with no selection or cleared selection can be either null or empty string, even for multi-selection.',
      'For FileAttachment and ContactSearch, checking "Allow Multiples" changes the QuestionType, but for SelectList a multiple attribute is added.',
      'For Grid questions, Answer is an Array of JSON objects. Use getRowObject() and addRow() functions, do not modify Answer directly.',
      'LongText is backslash encoded. Use standard backslash codes like \\n for carriage return.',
      'Number initializes and clears to null, unless a currency format is selected (then 0).',
      'RichText field does not support the onFocus event.'
    ]
  },

  codeExamples: [
    {
      title: 'Check formState before executing script',
      description: 'Use formState to conditionally execute code based on whether the form is in preview, runtime, or completed mode.',
      code: `if(intForm.formState !== 'completed') {
    intForm.getElementByClientID('stxtRequestNumber').Answer = intForm.recipientTask.InstanceID
}`
    },
    {
      title: 'Custom form validation with onSubmit',
      description: 'Bind a custom validation function to the onSubmit event. Must call intForm.submit() to actually submit.',
      code: `intForm.events.onSubmit = () => validateForm()

function validateForm() {
    if(intForm.getElementByClientID('stxtEmployeeNumber').Answer) {
        intForm.submit();
    } else {
        alert('Employee Number is a Required Field!');
        // the Form will not be submitted
        intForm.submitButton.enable();
        intForm.saveDraftButton.enable();
    }
}`
    },
    {
      title: 'Submit and Save Draft button control',
      description: 'Enable and disable form action buttons.',
      code: `intForm.submitButton.disable()
intForm.submitButton.enable()
intForm.saveDraftButton.disable()
intForm.saveDraftButton.enable()`
    },
    {
      title: 'Hide/Show a question',
      description: 'All Questions support the show attribute. Even if hidden (show=false), the Question still exists on the form, the Answer will still be saved when submitted, and you can reference the Question in scripts.',
      code: `intForm.getElementByClientID('radQuarter').show = false;`
    },
    {
      title: 'Get and set simple text answers',
      description: 'For ShortText, LongText, Number, Link, SelectList, RadioButton, Email, TimeZone: Answer contains only the text value. Get and set directly.',
      code: `let fName = intForm.getElementByClientID('stxtFirstName').Answer
let lName = intForm.getElementByClientID('stxtLastName').Answer
let fullName = fName + ' ' + lName
intForm.getElementByClientID('stxtFullName').Answer = fullName;`
    },
    {
      title: 'Set checkbox value',
      description: 'For checkboxes, you must set both the Answer value AND the Selected attribute of the corresponding Choices item.',
      code: `intForm.getElementByClientID('ckGroup').Answer = '245'
intForm.getElementByClientID('ckGroup').Choices[3].Selected = true;`
    },
    {
      title: 'Helper function for setting checkboxes',
      description: 'A reusable function that properly sets a checkbox answer by finding the matching Choice and setting both Selected and Answer.',
      code: `function setCheckbox(q, a) {
    // q is the ClientID of the Question; a is the Answer value to set
    // if the value of a does not exist in the array of Choices, no action is taken
    if(q && a) {
        let targ = intForm.getElementByClientID(q);
        let i = targ.Choices.findIndex(el => el.Value === a);
        if(i > -1) {
            targ.Choices[i].Selected = true;
            targ.Answer = a;
        }
    }
}`
    },
    {
      title: 'Set calendar date with string',
      description: 'Always use the setAnswer method to set Calendar question values.',
      code: `intForm.getElementByClientID('calStartDate').setAnswer('2022-08-28');`
    },
    {
      title: 'Set calendar date with Date object',
      description: 'Create a Date object and pass it to setAnswer for dynamic date calculation.',
      code: `let sd = new Date('08-28-2022');
intForm.getElementByClientID('calStartDate').setAnswer(sd);`
    },
    {
      title: 'Add row to Grid',
      description: 'Use getRowObject() and addRow() to insert new rows into a Grid. The getRowObject method returns an empty JSON object with keys matching the column names.',
      code: `let newRow = intForm.getElementByClientID('grdItems').getRowObject();

newRow["colItemCode"] = 'WD9930-33';
newRow["itemDesc"] = 'Advanced Widget';
newRow["itemPrice"] = '2430.12';

intForm.getElementByClientID('grdItems').addRow(newRow);`
    },
    {
      title: 'Remove row from Grid',
      description: 'Use standard array splice() method to remove rows from Grid Answer. Arrays are 0-based.',
      code: `// Remove the 4th row (index 3)
intForm.getElementByClientID('grdItems').Answer.splice(3, 1);`
    },
    {
      title: 'Form state conditional logic',
      description: 'Check formState to perform different actions in completed, preview, or runtime modes.',
      code: `if (intForm.formState === 'completed') {
    doSomething();
} else if (intForm.formState === 'preview') {
    doSomething();
} else if (intForm.formState === 'runtime') {
    doSomething();
}`
    },
    {
      title: 'Bind onChange event to a field',
      description: 'Bind a function to a field onChange event. NOTE: Binding onChange disables Form Rules for that question.',
      code: `intForm.getElementByClientID('selDepartment').events.onChange = () => {
    let dept = intForm.getElementByClientID('selDepartment').Answer;
    if(dept === 'Engineering') {
        intForm.getElementByClientID('secEngineeringDetails').show = true;
    } else {
        intForm.getElementByClientID('secEngineeringDetails').show = false;
    }
}`
    },
    {
      title: 'Populate select list choices via script',
      description: 'Dynamically set the Choices array for a Select List. Only Label and Value properties are needed.',
      code: `intForm.getElementByClientID('selStatus').Choices = [
    { Label: 'Active', Value: 'active' },
    { Label: 'Inactive', Value: 'inactive' },
    { Label: 'Pending', Value: 'pending' }
];`
    },
    {
      title: 'Use recipientTask to prefill fields',
      description: 'Access the recipientTask object to get instance and task information for prefilling form fields.',
      code: `if(intForm.formState !== 'completed') {
    intForm.getElementByClientID('stxtRequestNumber').Answer = intForm.recipientTask.InstanceID;
    intForm.getElementByClientID('stxtTaskName').Answer = intForm.recipientTask.TaskName;
}`
    },
    {
      title: 'RESTful Element - Execute request and handle response',
      description: 'Set up a RESTful element to call an API, set server variables for dynamic URLs, and process the response.',
      code: `let restEl = intForm.getElementByClientID('restLookupEmployee');

// Set server variables for dynamic URL parameters
restEl.request.serverVariables = {
    employeeId: intForm.getElementByClientID('stxtEmployeeId').Answer
};

// Handle the response
restEl.events.onResponse = (response) => {
    if(response && response.data) {
        intForm.getElementByClientID('stxtEmployeeName').Answer = response.data.Name;
        intForm.getElementByClientID('stxtDepartment').Answer = response.data.Department;
        intForm.getElementByClientID('emlEmployeeEmail').Answer = response.data.Email;
    }
};

// Execute the request
restEl.executeRequest();`
    },
    {
      title: 'RESTful Element - POST request with body',
      description: 'Configure a RESTful element for POST requests with a JSON body.',
      code: `let restEl = intForm.getElementByClientID('restCreateRecord');

restEl.request.method = 'POST';
restEl.request.headers = { 'Content-Type': 'application/json' };
restEl.request.body = JSON.stringify({
    name: intForm.getElementByClientID('stxtName').Answer,
    email: intForm.getElementByClientID('emlEmail').Answer,
    department: intForm.getElementByClientID('selDepartment').Answer
});

restEl.events.onResponse = (response) => {
    if(response.status === 200) {
        intForm.getElementByClientID('stxtRecordId').Answer = response.data.id;
    }
};

restEl.executeRequest();`
    },
    {
      title: 'RESTful Element - Chain API calls',
      description: 'Chain multiple API calls by triggering the next request in the onResponse handler.',
      code: `let restLookup = intForm.getElementByClientID('restLookup');
let restDetails = intForm.getElementByClientID('restDetails');

restLookup.events.onResponse = (response) => {
    if(response && response.data && response.data.id) {
        // Use the result of the first call to make a second call
        restDetails.request.serverVariables = { recordId: response.data.id };
        restDetails.executeRequest();
    }
};

restDetails.events.onResponse = (response) => {
    if(response && response.data) {
        intForm.getElementByClientID('stxtDetails').Answer = response.data.description;
    }
};

// Start the chain
restLookup.executeRequest();`
    },
    {
      title: 'SearchBox - Set and clear answer',
      description: 'Use setAnswer and clearAnswer methods for SearchBox fields.',
      code: `// Set a SearchBox answer (must provide both Label and Value)
intForm.getElementByClientID('sbDepartment').setAnswer({ Value: 712, Label: 'HR' });

// Clear a SearchBox answer
intForm.getElementByClientID('sbDepartment').clearAnswer();`
    },
    {
      title: 'Dynamic field validation',
      description: 'Modify validation properties at runtime to conditionally require fields.',
      code: `// Make a field required based on another field's value
let dept = intForm.getElementByClientID('selDepartment').Answer;
if(dept === 'Engineering') {
    intForm.getElementByClientID('stxtProjectCode').validation.required = true;
    intForm.getElementByClientID('stxtProjectCode').validation.requiredMessage = 'Project Code is required for Engineering';
} else {
    intForm.getElementByClientID('stxtProjectCode').validation.required = false;
}`
    },
    {
      title: 'Apply CSS class conditionally',
      description: 'Set CSS class on a question based on its value or other conditions.',
      code: `let amount = parseFloat(intForm.getElementByClientID('numAmount').Answer);
if(amount > 10000) {
    intForm.getElementByClientID('numAmount').class = 'high-value-highlight';
} else {
    intForm.getElementByClientID('numAmount').class = '';
}`
    },
    {
      title: 'Disable all fields in completed mode',
      description: 'Common pattern to disable editing when form is in completed/view mode.',
      code: `if(intForm.formState === 'completed') {
    intForm.getElementByClientID('stxtName').disabled = true;
    intForm.getElementByClientID('selDepartment').disabled = true;
    intForm.getElementByClientID('calStartDate').disabled = true;
    intForm.getElementByClientID('numBudget').disabled = true;
}`
    },
    {
      title: 'Grid onChange event handling',
      description: 'Handle changes to grid row data.',
      code: `intForm.getElementByClientID('grdLineItems').events.onChange = (changeData) => {
    // changeData contains information about what changed
    // Recalculate totals when grid data changes
    let total = 0;
    let rows = intForm.getElementByClientID('grdLineItems').Answer;
    rows.forEach(row => {
        if(!row.delete) {
            total += parseFloat(row['amount'] || 0);
        }
    });
    intForm.getElementByClientID('numTotal').Answer = total.toFixed(2);
}`
    },
    {
      title: 'Grid footer values',
      description: 'Read aggregated footer values from a Grid question.',
      code: `let footerValues = intForm.getElementByClientID('grdLineItems').getFooterValues();
// footerValues is an array of { name, value, aggregationType }

// Or get a specific column footer value
let totalAmount = intForm.getElementByClientID('grdLineItems').getFooterValues('amount');`
    },
    {
      title: 'Contact Search - Read selected contacts',
      description: 'Access contact search results and extract user information.',
      code: `let contacts = intForm.getElementByClientID('csApprover').Answer;
if(contacts && contacts.length > 0) {
    let approverName = contacts[0].Name;
    let approverEmail = contacts[0].Email;
    let approverUsername = contacts[0].UserName;
    intForm.getElementByClientID('stxtApproverName').Answer = approverName;
    intForm.getElementByClientID('emlApproverEmail').Answer = approverEmail;
}`
    },
    {
      title: 'Use todaysDate from Calendar field',
      description: 'Get the server date (not dependent on user local system date).',
      code: `let serverDate = intForm.getElementByClientID('calAnyCalendar').todaysDate;
// serverDate is in MM/DD/YYYY format`
    },
    {
      title: 'Full form initialization pattern',
      description: 'Common pattern for initializing a form with conditional logic, event bindings, and data loading.',
      code: `// Only execute initialization in runtime mode
if(intForm.formState === 'runtime') {

    // Prefill from recipientTask
    intForm.getElementByClientID('stxtRequestID').Answer = intForm.recipientTask.InstanceID;

    // Set up event handlers
    intForm.getElementByClientID('selCategory').events.onChange = () => handleCategoryChange();

    // Custom submit validation
    intForm.events.onSubmit = () => validateAndSubmit();

    // Load initial data via REST
    let restInit = intForm.getElementByClientID('restInitData');
    restInit.events.onResponse = (response) => {
        if(response && response.data) {
            populateFormFields(response.data);
        }
    };
    restInit.executeRequest();
}

function handleCategoryChange() {
    let cat = intForm.getElementByClientID('selCategory').Answer;
    intForm.getElementByClientID('secCategoryDetails').show = (cat !== null && cat !== '');
}

function validateAndSubmit() {
    intForm.submitButton.disable();
    intForm.saveDraftButton.disable();

    let isValid = true;
    if(!intForm.getElementByClientID('stxtName').Answer) {
        alert('Name is required');
        isValid = false;
    }

    if(isValid) {
        intForm.submit();
    } else {
        intForm.submitButton.enable();
        intForm.saveDraftButton.enable();
    }
}

function populateFormFields(data) {
    intForm.getElementByClientID('stxtEmployeeName').Answer = data.name;
    intForm.getElementByClientID('emlEmail').Answer = data.email;
    intForm.getElementByClientID('selDepartment').Answer = data.department;
}`
    }
  ]
};

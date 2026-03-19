// Workflow Copilot - External Service Integration Guides
// Deep knowledge about connecting Workflow to popular external services

export const EXTERNAL_SERVICES = {

  slack: {
    name: 'Slack',
    description: 'Send messages, create channels, and post workflow data to Slack',
    authMethods: ['webhook', 'bot-token', 'oauth2'],

    patterns: {
      'post-message-on-completion': {
        title: 'Post Slack Message When a Process Completes',
        description: 'Automatically send a message to a Slack channel when a workflow process instance reaches a specific task or completes entirely.',
        workflowApproach: 'REST Client task at the end of the process (or after a key task) that calls Slack\'s API',

        architectureOptions: [
          {
            name: 'Slack Incoming Webhook (Simplest)',
            description: 'No bot or app needed. Create a webhook URL in Slack and POST to it.',
            pros: ['No Slack app required', 'Takes 2 minutes to set up', 'No OAuth needed'],
            cons: ['Fixed to one channel per webhook', 'Limited formatting', 'No threading/replies'],
            setup: {
              slack: [
                'Go to https://api.slack.com/messaging/webhooks',
                'Create a new Slack App (or use existing)',
                'Enable Incoming Webhooks',
                'Add webhook to a specific channel',
                'Copy the webhook URL'
              ],
              workflow: [
                {
                  step: 'Store the webhook URL as a credential',
                  endpoint: 'POST /api/integrations/credentials/create',
                  body: {
                    name: 'Slack Webhook - #process-notifications',
                    resourceKind: 'restful-request',
                    valueType: 'custom',
                    value: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX',
                    scope: { ambient: 'tenant' }
                  }
                },
                {
                  step: 'Create a RESTful Request definition',
                  endpoint: 'POST /api/integrations/restful-requests',
                  body: {
                    name: 'Slack - Post Process Completion',
                    method: 'POST',
                    url: '{{credential:slack-webhook-url}}',
                    headers: { 'Content-Type': 'application/json' },
                    bodyTemplate: JSON.stringify({
                      blocks: [
                        {
                          type: 'header',
                          text: { type: 'plain_text', text: '✅ Process Completed: {{processName}}' }
                        },
                        {
                          type: 'section',
                          fields: [
                            { type: 'mrkdwn', text: '*Request:*\n{{requestName}}' },
                            { type: 'mrkdwn', text: '*Submitted by:*\n{{requesterName}}' },
                            { type: 'mrkdwn', text: '*Completed:*\n{{completionDate}}' },
                            { type: 'mrkdwn', text: '*Status:*\n{{finalStatus}}' }
                          ]
                        },
                        {
                          type: 'section',
                          text: { type: 'mrkdwn', text: '*Summary:*\n{{approvalNotes}}' }
                        },
                        {
                          type: 'actions',
                          elements: [
                            {
                              type: 'button',
                              text: { type: 'plain_text', text: 'View in Workflow' },
                              url: '{{instanceUrl}}'
                            }
                          ]
                        }
                      ]
                    }, null, 2)
                  }
                },
                {
                  step: 'Add a REST Client task at the end of your process',
                  description: 'In the Process Builder, add a new task of type "REST Client" after the final approval/completion task',
                  endpoint: 'POST /api/task-dispatcher/restClient/{processTaskSid}/config/settings',
                  notes: 'Link it to the RESTful Request definition you created'
                },
                {
                  step: 'Map process data to the message template',
                  description: 'Use Process Task Mappings to fill in {{processName}}, {{requesterName}}, etc.',
                  endpoint: 'POST /api/processes/processTask/{processTaskSid}/mappings',
                  mappingExamples: {
                    '{{processName}}': 'Source: Process > Process Name',
                    '{{requestName}}': 'Source: Instance > Request Name',
                    '{{requesterName}}': 'Source: Instance > Requester > Full Name',
                    '{{completionDate}}': 'Source: System > Current Date',
                    '{{finalStatus}}': 'Source: Previous Task > Approval Decision',
                    '{{approvalNotes}}': 'Source: Previous Task > Comments',
                    '{{instanceUrl}}': 'Source: Instance > Instance URL'
                  }
                },
                {
                  step: 'Set up transition rules',
                  description: 'Configure when the Slack notification fires',
                  endpoint: 'POST /api/processes/tasks/{processTaskSid}/rules',
                  notes: 'Add conditions if you only want to post on certain outcomes (e.g., approved only, not rejected)'
                }
              ]
            }
          },
          {
            name: 'Slack Bot Token (More Flexible)',
            description: 'Create a Slack app with a Bot Token for full API access - threading, multiple channels, reactions, etc.',
            pros: ['Post to any channel', 'Threading support', 'Rich formatting', 'Can read/reply to messages'],
            cons: ['Requires Slack app setup', 'Bot must be invited to channels', 'Token management needed'],
            setup: {
              slack: [
                'Create a Slack App at https://api.slack.com/apps',
                'Add Bot Token Scopes: chat:write, chat:write.public',
                'Install app to workspace',
                'Copy the Bot User OAuth Token (xoxb-...)',
                'Invite bot to target channel: /invite @YourBot'
              ],
              workflow: [
                {
                  step: 'Store the Bot Token as a credential',
                  endpoint: 'POST /api/integrations/credentials/create',
                  body: {
                    name: 'Slack Bot Token',
                    resourceKind: 'restful-request',
                    valueType: 'bearer-token',
                    value: 'xoxb-your-bot-token-here',
                    scope: { ambient: 'tenant' }
                  }
                },
                {
                  step: 'Create RESTful Request for chat.postMessage',
                  endpoint: 'POST /api/integrations/restful-requests',
                  body: {
                    name: 'Slack - Post to Channel',
                    method: 'POST',
                    url: 'https://slack.com/api/chat.postMessage',
                    headers: {
                      'Authorization': 'Bearer {{credential:slack-bot-token}}',
                      'Content-Type': 'application/json'
                    },
                    bodyTemplate: JSON.stringify({
                      channel: '{{channelId}}',
                      text: 'Process "{{processName}}" completed by {{requesterName}}',
                      blocks: [
                        {
                          type: 'section',
                          text: {
                            type: 'mrkdwn',
                            text: '*Process Completed* :white_check_mark:\n\n*{{processName}}* - {{requestName}}\n\nSubmitted by: {{requesterName}}\nDecision: {{decision}}\nNotes: {{notes}}'
                          }
                        }
                      ]
                    }, null, 2)
                  }
                },
                {
                  step: 'Configure REST Client task with channel routing',
                  description: 'Map the channel ID dynamically or use a fixed channel',
                  notes: 'Channel IDs look like C01234567. You can find them by right-clicking a channel in Slack > "View channel details" > scroll to bottom. Or use Slack API conversations.list to look them up.'
                }
              ]
            }
          }
        ],

        formApproach: {
          title: 'Slack Channel Selection on a Form',
          description: 'Let users pick which Slack channel to notify using a RESTful Data Element',
          steps: [
            {
              step: 'Add a RESTful Data Element to your form for channel selection',
              config: {
                method: 'GET',
                url: 'https://slack.com/api/conversations.list',
                headers: { 'Authorization': 'Bearer {{credential:slack-bot-token}}' },
                queryParams: { types: 'public_channel', limit: '200' },
                responseMapping: '$.channels[is_archived=false]{ $.id : $.name }',
                notes: 'This populates a dropdown with all non-archived public channels'
              }
            },
            {
              step: 'The selected channel ID flows through the process to the REST Client task',
              notes: 'Map the form field value to the REST Client task\'s channel parameter'
            }
          ]
        }
      },

      'thread-replies': {
        title: 'Post Thread Replies for Process Updates',
        description: 'Post an initial message when a process starts, then add threaded replies as tasks complete',
        notes: 'Requires Bot Token approach. Store the initial message timestamp (ts) as instance data, then pass it as thread_ts in subsequent calls.',
        slackEndpoints: [
          'POST https://slack.com/api/chat.postMessage (initial + thread_ts for replies)',
          'POST https://slack.com/api/reactions.add (add emoji reactions for status)'
        ]
      }
    }
  },

  stripe: {
    name: 'Stripe',
    description: 'Process payments, manage subscriptions, and handle refunds',
    authMethods: ['api-key', 'oauth2'],

    patterns: {
      'payment-form': {
        title: 'Build a Payment Form with Stripe',
        description: 'Create a workflow form that collects payment information via Stripe and processes charges, with the ability to issue refunds later.',

        architectureOptions: [
          {
            name: 'Stripe Payment Intents (Recommended)',
            description: 'Use Stripe PaymentIntents API for SCA-compliant payments. The form creates a PaymentIntent server-side, then Stripe.js handles the card UI.',

            setup: {
              stripe: [
                'Create a Stripe account at https://dashboard.stripe.com',
                'Get your API keys from Developers > API Keys',
                'Secret Key (sk_...): stored in Workflow credentials, used for server-side calls',
                'Publishable Key (pk_...): used in form JavaScript for Stripe.js client-side'
              ],

              workflowPaymentForm: {
                title: 'Payment Form Setup',
                steps: [
                  {
                    step: '1. Store Stripe credentials',
                    endpoint: 'POST /api/integrations/credentials/create',
                    calls: [
                      {
                        name: 'Secret Key (for server-side API calls)',
                        body: {
                          name: 'Stripe Secret Key',
                          resourceKind: 'restful-request',
                          valueType: 'bearer-token',
                          value: 'sk_live_your_secret_key',
                          scope: { ambient: 'tenant' }
                        }
                      }
                    ]
                  },
                  {
                    step: '2. Create RESTful Request: Create PaymentIntent',
                    endpoint: 'POST /api/integrations/restful-requests',
                    body: {
                      name: 'Stripe - Create PaymentIntent',
                      method: 'POST',
                      url: 'https://api.stripe.com/v1/payment_intents',
                      headers: {
                        'Authorization': 'Bearer {{credential:stripe-secret-key}}',
                        'Content-Type': 'application/x-www-form-urlencoded'
                      },
                      bodyTemplate: 'amount={{amountInCents}}&currency={{currency}}&description={{description}}&metadata[workflow_instance]={{instanceId}}&metadata[requester]={{requesterName}}'
                    },
                    notes: 'Stripe API uses form-urlencoded, not JSON. Amount is in cents (e.g., $50.00 = 5000).'
                  },
                  {
                    step: '3. Create the payment form with RESTful Data Elements',
                    description: 'The form needs two RESTful elements working together',
                    elements: [
                      {
                        name: 'Create PaymentIntent Element',
                        purpose: 'Creates a PaymentIntent when the form loads or when amount is entered',
                        config: {
                          method: 'POST',
                          url: 'https://api.stripe.com/v1/payment_intents',
                          headers: { 'Authorization': 'Bearer {{credential:stripe-secret-key}}' },
                          body: 'amount={{amount}}&currency=usd&automatic_payment_methods[enabled]=true',
                          responseMapping: '$.client_secret',
                          serverVariable: {
                            name: 'paymentIntentClientSecret',
                            description: 'Stored for Stripe.js confirmation'
                          }
                        }
                      },
                      {
                        name: 'Confirm Payment Element (client-side)',
                        purpose: 'Uses Stripe.js Elements to collect card info and confirm payment',
                        formJavaScript: `// Load Stripe.js (add to form's custom JavaScript)
const stripe = Stripe('pk_live_your_publishable_key');
const elements = stripe.elements({
  clientSecret: serverVariables.paymentIntentClientSecret
});

// Create and mount the Payment Element
const paymentElement = elements.create('payment');
paymentElement.mount('#payment-element');

// Handle form submission
async function handlePayment() {
  const { error, paymentIntent } = await stripe.confirmPayment({
    elements,
    confirmParams: {
      return_url: window.location.href
    },
    redirect: 'if_required'
  });

  if (error) {
    intForm.setElementValue('paymentStatus', 'failed');
    intForm.setElementValue('paymentError', error.message);
  } else if (paymentIntent.status === 'succeeded') {
    intForm.setElementValue('paymentStatus', 'succeeded');
    intForm.setElementValue('paymentIntentId', paymentIntent.id);
    intForm.setElementValue('amountPaid', paymentIntent.amount / 100);
  }
}`
                      }
                    ]
                  },
                  {
                    step: '4. Store payment data in instance',
                    description: 'The PaymentIntent ID, amount, and status flow into the workflow instance data for later reference (refunds, receipts, etc.)',
                    mappings: {
                      'paymentIntentId': 'Maps to instance data for refund processing later',
                      'paymentStatus': 'Used in transition rules to route the process',
                      'amountPaid': 'Stored for reporting and refund calculations'
                    }
                  }
                ]
              },

              workflowRefundProcess: {
                title: 'Refund Process Setup',
                steps: [
                  {
                    step: '1. Create RESTful Request: Create Refund',
                    endpoint: 'POST /api/integrations/restful-requests',
                    body: {
                      name: 'Stripe - Create Refund',
                      method: 'POST',
                      url: 'https://api.stripe.com/v1/refunds',
                      headers: {
                        'Authorization': 'Bearer {{credential:stripe-secret-key}}',
                        'Content-Type': 'application/x-www-form-urlencoded'
                      },
                      bodyTemplate: 'payment_intent={{paymentIntentId}}&amount={{refundAmountInCents}}&reason={{refundReason}}'
                    },
                    notes: 'Omit amount for full refund. Include amount (in cents) for partial refund.'
                  },
                  {
                    step: '2. Create RESTful Request: Get PaymentIntent (for status/history)',
                    endpoint: 'POST /api/integrations/restful-requests',
                    body: {
                      name: 'Stripe - Get Payment Details',
                      method: 'GET',
                      url: 'https://api.stripe.com/v1/payment_intents/{{paymentIntentId}}',
                      headers: {
                        'Authorization': 'Bearer {{credential:stripe-secret-key}}'
                      }
                    }
                  },
                  {
                    step: '3. Build the refund workflow',
                    description: 'Create a process with these tasks:',
                    tasks: [
                      'Form Task: Refund request form - captures reason, amount, and looks up original payment',
                      'REST Client Task: Get Payment Details - fetches current payment status from Stripe',
                      'Approval Task: Manager approves the refund (with AI approval analysis if configured)',
                      'REST Client Task: Create Refund - executes the refund on Stripe',
                      'REST Client Task: Slack Notification (optional) - notifies finance channel',
                      'Email Task: Send refund confirmation to customer'
                    ]
                  },
                  {
                    step: '4. Refund form with payment lookup',
                    description: 'Use a RESTful Data Element to look up the original payment',
                    formElement: {
                      method: 'GET',
                      url: 'https://api.stripe.com/v1/payment_intents/{{paymentIntentId}}',
                      headers: { 'Authorization': 'Bearer {{credential:stripe-secret-key}}' },
                      responseMapping: {
                        'Original Amount': '$.amount / 100',
                        'Currency': '$.currency',
                        'Status': '$.status',
                        'Customer Email': '$.receipt_email',
                        'Already Refunded': '$sum($.charges.data.refunds.data.amount) / 100'
                      }
                    }
                  }
                ]
              }
            }
          }
        ],

        transitionRules: {
          'Payment Succeeded': 'Route to next task in process',
          'Payment Failed': 'Route back to payment form with error message',
          'Payment Requires Action': 'Hold task open for 3D Secure confirmation',
          'Refund Approved': 'Execute Stripe refund API call',
          'Refund Rejected': 'Notify requester with rejection reason'
        }
      },

      'subscription-management': {
        title: 'Manage Stripe Subscriptions',
        description: 'Create, update, and cancel subscriptions via workflow processes',
        stripeEndpoints: [
          'POST /v1/customers (create customer)',
          'POST /v1/subscriptions (create subscription)',
          'POST /v1/subscriptions/{id} (update)',
          'DELETE /v1/subscriptions/{id} (cancel)',
          'GET /v1/invoices?customer={id} (list invoices)'
        ],
        notes: 'Each Stripe API call becomes a RESTful Request definition, then linked to REST Client tasks in your process.'
      }
    }
  },

  salesforce: {
    name: 'Salesforce',
    description: 'Sync contacts, accounts, and opportunities with Salesforce CRM',
    authMethods: ['oauth2', 'api-key'],
    patterns: {
      'sync-contacts': {
        title: 'Sync Workflow Data to Salesforce',
        description: 'Push workflow form data to Salesforce records (Contacts, Accounts, Cases, etc.)',
        quickSetup: [
          'Create a Connected App in Salesforce for API access',
          'Store OAuth2 credentials in Workflow',
          'Create RESTful Requests for Salesforce REST API',
          'Use REST Client tasks to push data at process milestones'
        ]
      }
    }
  },

  microsoftTeams: {
    name: 'Microsoft Teams',
    description: 'Post messages and notifications to Teams channels',
    authMethods: ['webhook', 'graph-api'],
    patterns: {
      'post-notification': {
        title: 'Post Teams Notification on Process Completion',
        quickSetup: [
          'Create an Incoming Webhook connector in Teams channel',
          'Store webhook URL as Workflow credential',
          'Create RESTful Request with Adaptive Card JSON body',
          'Add REST Client task at process completion point'
        ],
        bodyTemplate: {
          type: 'message',
          attachments: [{
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.4',
              body: [
                { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '{{processName}} Completed' },
                { type: 'FactSet', facts: [
                  { title: 'Submitted by', value: '{{requesterName}}' },
                  { title: 'Status', value: '{{status}}' }
                ]}
              ]
            }
          }]
        }
      }
    }
  },

  jira: {
    name: 'Jira',
    description: 'Create and update Jira issues from workflow processes',
    authMethods: ['api-key', 'oauth2'],
    patterns: {
      'create-issue': {
        title: 'Create Jira Issue from Workflow',
        quickSetup: [
          'Generate API token at https://id.atlassian.com/manage/api-tokens',
          'Store as Basic Auth credential (email:token base64 encoded)',
          'Create RESTful Request: POST https://your-domain.atlassian.net/rest/api/3/issue',
          'Map workflow form fields to Jira issue fields'
        ]
      }
    }
  },

  docusign: {
    name: 'DocuSign',
    description: 'Send documents for electronic signature',
    notes: 'Workflow has a built-in Electronic Signature task type. For DocuSign specifically, use REST Client tasks with DocuSign eSignature API.'
  },

  googleSheets: {
    name: 'Google Sheets',
    description: 'Log workflow data to Google Sheets',
    authMethods: ['service-account', 'oauth2'],
    patterns: {
      'append-row': {
        title: 'Log Process Data to Google Sheets',
        quickSetup: [
          'Create a Google Cloud Service Account with Sheets API access',
          'Share the target spreadsheet with the service account email',
          'Store service account credentials in Workflow',
          'Create RESTful Request: POST sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}:append',
          'Map process data to spreadsheet columns'
        ]
      }
    }
  },

  twilioSms: {
    name: 'Twilio SMS',
    description: 'Send SMS notifications from workflows',
    authMethods: ['api-key'],
    patterns: {
      'send-sms': {
        title: 'Send SMS on Task Assignment',
        quickSetup: [
          'Get Twilio Account SID and Auth Token',
          'Store as Basic Auth credential (SID:Token)',
          'Create RESTful Request: POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json',
          'Body (form-urlencoded): To={{phone}}&From={{twilioNumber}}&Body={{message}}'
        ]
      }
    }
  }
};

// Maps common user intents to the right external service + pattern
export const INTENT_MAPPING = {
  'slack': { service: 'slack', defaultPattern: 'post-message-on-completion' },
  'slack message': { service: 'slack', defaultPattern: 'post-message-on-completion' },
  'slack channel': { service: 'slack', defaultPattern: 'post-message-on-completion' },
  'slack notification': { service: 'slack', defaultPattern: 'post-message-on-completion' },
  'slack thread': { service: 'slack', defaultPattern: 'thread-replies' },
  'payment': { service: 'stripe', defaultPattern: 'payment-form' },
  'stripe': { service: 'stripe', defaultPattern: 'payment-form' },
  'charge': { service: 'stripe', defaultPattern: 'payment-form' },
  'refund': { service: 'stripe', defaultPattern: 'payment-form' },
  'subscription': { service: 'stripe', defaultPattern: 'subscription-management' },
  'salesforce': { service: 'salesforce', defaultPattern: 'sync-contacts' },
  'teams': { service: 'microsoftTeams', defaultPattern: 'post-notification' },
  'microsoft teams': { service: 'microsoftTeams', defaultPattern: 'post-notification' },
  'jira': { service: 'jira', defaultPattern: 'create-issue' },
  'sms': { service: 'twilioSms', defaultPattern: 'send-sms' },
  'twilio': { service: 'twilioSms', defaultPattern: 'send-sms' },
  'docusign': { service: 'docusign', defaultPattern: null },
  'google sheets': { service: 'googleSheets', defaultPattern: 'append-row' },
  'spreadsheet': { service: 'googleSheets', defaultPattern: 'append-row' }
};

# Workflow Copilot

AI-powered Chrome extension that integrates into the Nutrient Workflow admin UI as a sidebar panel. Build, modify, and configure forms using natural language instead of manual drag-and-drop.

## How It Works

1. User types a natural language request in the sidebar chat
2. The LLM generates action blocks (structured JSON) describing what to do
3. The **Action Engine** executes each action via Workflow's Form Builder API — GET the form, surgically modify it, PUT it back
4. The Form Builder auto-refreshes after each modification

The LLM handles intent recognition and API knowledge. The engine handles all JSON surgery, field resolution, template building, and validation. This separation exists because LLMs are unreliable at precise JSON manipulation.

## Features

- **20+ registered actions** — sections, containers, fields, grid columns/rows, credentials, RESTful requests
- **18 question types** — ShortText, Grid, RESTful Element, FileAttachment, etc. with complete template builders
- **Grid support** — 10 column types, RowAggregation formulas, footer aggregation, CRUD actions
- **Smart resolution** — sections/fields resolved by label, partial match, or position (never requires exact IDs)
- **RESTful Element builder** — auto-normalizes headers, body, auth into the exact array-of-objects format the API expects
- **Undo system** — stack-based snapshots before every modification
- **Action Log** — persistent logging of every action lifecycle for debugging
- **Embedded knowledge base** — 508 API endpoints, 16 field type references, Help Center articles, integration guides

## Extension Structure

```
workflow-copilot/
├── manifest.json                       # Chrome Extension manifest v3
├── public/icons/                       # Extension icons (Nutrient branding)
├── styles/
│   ├── sidebar.css                     # Sidebar UI styles (Nutrient theme)
│   └── content.css                     # Content script styles
└── src/
    ├── background/
    │   └── service-worker.js           # Background worker, message routing
    ├── content/
    │   └── context-detector.js         # Detects current page context
    ├── sidebar/
    │   ├── sidebar.html                # Sidebar panel markup
    │   ├── sidebar.js                  # Chat UI, AI integration, system prompt
    │   └── action-engine.js            # Action registry, executor, backup system
    └── knowledge/
        ├── api-knowledge.js            # 508 Workflow API endpoints
        ├── form-scripting.js           # Field types, code examples, CSS selectors
        ├── help-center.js              # Help Center articles indexed
        ├── external-integrations.js    # Slack, Stripe integration guides
        └── powerForm-service-latest.js # Full PowerFormService source
```

## Setup

1. Clone the repo
2. Open `chrome://extensions/` and enable Developer Mode
3. Click **Load unpacked** and select the `workflow-copilot/` directory
4. Navigate to any Workflow admin page (`*.on-nutrient.io/workflow/admin/*`)
5. Click the extension icon to open the sidebar
6. In Settings, connect your Anthropic or OpenAI API key via Workflow's Credential Center

## Action Registry

### Level 1: API Actions
| Action | Description |
|--------|-------------|
| `create-credential` | Create a credential in Workflow's Credential Center |
| `create-restful-request` | Create a reusable RESTful request definition |
| `get-form-json` | Fetch the full Form Builder JSON |
| `get-form-metadata` | Retrieve form metadata |

### Level 2: Form Builder Actions
| Action | Description |
|--------|-------------|
| `add-section-to-form` | Add a new layout section with optional fields |
| `add-container-to-section` | Add a container to an existing section |
| `add-field-to-form` | Add a single field to the form |
| `update-field` | Update field properties (auto-creates RESTful Elements if needed) |
| `move-fields-to-container` | Move fields to an existing container |
| `move-fields-to-new-section` | Move fields into a new section |
| `move-container-to-section` | Move an entire container between sections |
| `rename-section` | Rename a section's label |
| `resize-container` | Change container column count |
| `reorder-sections` | Reorder sections on the form |
| `reorder-containers` | Reorder containers within a section |
| `update-form-javascript` | Update the form's JavaScript |
| `update-form-css` | Update the form's CSS |

### Level 3: Grid Actions
| Action | Description |
|--------|-------------|
| `add-grid-column` | Add a column to a Grid field |
| `remove-grid-column` | Remove a column from a Grid field |
| `update-grid-column` | Update Grid column properties |
| `add-grid-row` | Add a data row to a Grid field |

### Composite Actions
| Action | Description |
|--------|-------------|
| `setup-slack-integration` | Credential + REST request for Slack |
| `setup-stripe-payment` | Credential + REST request for Stripe |

## AI Providers

Supports **Anthropic Claude** (default) and **OpenAI GPT-4**. API keys are stored in Workflow's Credential Center — never in the extension itself.

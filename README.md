# Workflow Copilot

AI-powered Chrome extension that integrates into the Nutrient Workflow admin UI as a sidebar panel. Build, modify, and configure forms and reports using natural language instead of manual point-and-click.

## How It Works

1. User types a natural language request in the sidebar chat
2. The LLM generates action blocks (structured JSON) describing what to do
3. The **Action Engine** executes each action via Workflow's APIs — GET the resource, surgically modify it, PUT it back
4. The Form Builder / Report Builder auto-refreshes after each modification

The LLM handles intent recognition and API knowledge. The engine handles all JSON surgery, field resolution, template building, and validation. This separation exists because LLMs are unreliable at precise JSON manipulation.

## Features

- **30+ registered actions** — forms, reports, grids, credentials, RESTful requests
- **18 question types** — ShortText, Grid, RESTful Element, FileAttachment, etc. with complete template builders
- **Reports engine** — create, update, preview reports with columns, filters, limits, and aggregation via dual-backend (MongoDB + core-service) architecture
- **Grid support** — 10 column types, RowAggregation formulas, footer aggregation, CRUD actions
- **Smart resolution** — sections/fields resolved by label, partial match, or position (never requires exact IDs)
- **RESTful Element builder** — auto-normalizes headers, body, auth into the exact array-of-objects format the API expects
- **Core-service proxy** — content script proxies `/core-service/` API calls from page context for same-origin compliance
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
    │   └── service-worker.js           # Background worker, message routing, core-service proxy
    ├── content/
    │   └── context-detector.js         # Detects page context, proxies same-origin API calls
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

### Prerequisites
- **Google Chrome** (or any Chromium-based browser — Edge, Brave, Arc, etc.)
- **Nutrient Workflow** admin access on `*.on-nutrient.io`
- An **Anthropic** or **OpenAI** API key stored in Workflow's Credential Center

### Install from Source

1. **Clone the repo**
   ```bash
   git clone https://github.com/brperdomo/workflow-copilot.git
   ```

2. **Open Chrome's extension manager**
   - Navigate to `chrome://extensions/`
   - Toggle **Developer mode** ON (top-right corner)

3. **Load the extension**
   - Click **Load unpacked**
   - Select the `workflow-copilot/` directory (the folder containing `manifest.json`)
   - The extension should appear in your extensions list with the Nutrient icon

4. **Pin the extension** (optional but recommended)
   - Click the puzzle piece icon in Chrome's toolbar
   - Find **Workflow Copilot** and click the pin icon

### Connect Your AI Provider

5. **Navigate to any Workflow admin page**
   - Go to `https://<your-tenant>.on-nutrient.io/workflow/admin/`

6. **Open the sidebar**
   - Click the Workflow Copilot icon in Chrome's toolbar
   - The sidebar panel opens on the right side of the page

7. **Configure AI credentials**
   - Click the **⚙ Settings** gear icon at the top of the sidebar
   - Select your AI provider (Anthropic Claude or OpenAI GPT-4)
   - Choose the Workflow credential that contains your API key
   - If you don't have one yet, create a credential in **Admin → Credential Center** with your API key

### Updating

When pulling new changes from the repo:
1. `git pull` in the `workflow-copilot/` directory
2. Go to `chrome://extensions/`
3. Click the **refresh icon** (↻) on the Workflow Copilot card
4. Reload any open Workflow admin tabs

### Troubleshooting

| Issue | Fix |
|-------|-----|
| Sidebar won't open | Check that the extension is enabled in `chrome://extensions/` |
| "Service Worker (inactive)" | Click the refresh icon on the extension card, then reload the Workflow page |
| Content script errors | Reload the Workflow admin page (`Cmd+R` / `Ctrl+R`) |
| API calls fail with CORS | Make sure you're on a `*.on-nutrient.io` domain — the extension only has permissions for Nutrient hosts |
| Enter key creates new line | Close and reopen the sidebar panel |

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

### Level 2: Report Actions
| Action | Description |
|--------|-------------|
| `create-report` | Create a report via core-service, then add columns/filters/limits |
| `update-report` | Update report columns, filters, limits, or metadata |
| `get-report` | Fetch a report by SID |
| `get-report-categories` | List available report categories |
| `get-report-columns` | Get available columns for a process |
| `preview-report` | Preview report data with current configuration |
| `delete-report` | Delete a report by SID |

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

## Architecture Notes

### Dual-Backend Report Creation
Workflow reports live in two backends: MongoDB (via `/api/reports`) and a SQL-based core-service (via `/core-service/reports/`). Reports must be registered in **both** for previews and execution to work. The `create-report` action handles this as a two-step flow: first creates the shell via `POST /core-service/reports/save/script/`, then adds columns/filters/limits via `PUT /api/reports/:sid`.

### Core-Service Proxy
The `/core-service/` endpoints require same-origin requests that fail from the `chrome-extension://` origin. The service worker detects these URLs and proxies them through the content script, which runs in the page's origin context. If the content script isn't loaded (e.g., after extension reload), the service worker auto-injects it via `chrome.scripting.executeScript`.

## AI Providers

Supports **Anthropic Claude** (default) and **OpenAI GPT-4**. API keys are stored in Workflow's Credential Center — never in the extension itself.

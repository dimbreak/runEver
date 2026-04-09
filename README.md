# RunEver

**RunEver** is an open-source agentic browser built with **TypeScript**, **Electron**, and an **HTML-first automation runtime**.

It is designed to make browser automation practical for real-world work: not just for benchmark demos, not just for teams with frontier models, and not just for companies with dedicated automation engineers.

RunEver focuses on three things:

- **Accessibility** — automation that more people can actually use
- **Transparency** — steps humans can inspect, confirm, and correct
- **Efficiency** — workflows that can run with smaller, lower-cost models

---

## Why RunEver?

Most browser agents are still too dependent on expensive models, brittle screenshot-based reasoning, or highly technical setup.

RunEver takes a different approach:

- **HTML-first execution** instead of relying only on screenshots
- **Model-flexible design** that works with multiple providers
- **Small-model-friendly runtime** for lower operating cost
- **Task decomposition** for longer, more reliable workflows
- **Human-in-the-loop controls** for confirmation and correction
- **Desktop-first setup** with local credential storage in the system keyring

The goal is simple:

> Make browser automation usable by everyone, not only teams with strong models, large budgets, or dedicated IT support.

---

## What it can do

RunEver is built for real browser workflows, including:

- logging into websites
- reading information from web pages
- filling forms
- clicking through multi-step flows
- uploading and downloading files
- handling tabs and sessions
- capturing screenshots
- waiting, retrying, and recovering from page changes
- asking for human confirmation mid-workflow
- continuing the task after human feedback

This makes it suitable for longer task chains rather than only one-shot actions.

---

## Example workflow

A typical RunEver flow can look like this:

1. Log into a web app
2. Read an email or task context
3. Fill in an order form
4. Ask a human to confirm the result
5. Adjust the task based on feedback
6. Download an invoice
7. Reply to the client

This is an important part of the product direction:

- RunEver is **not only for mocked environments**
- It is intended for **real websites and real business workflows**

In one demo scenario, a roughly 15-minute workflow was completed in human mode with `GPT-5-mini` at around `$0.25` total cost. Treat that as an example from the demo, not as a universal benchmark.

---

## Core ideas

### HTML-first automation

Instead of treating the browser as a sequence of images, RunEver is built around the structure of the page itself. This improves inspectability, action grounding, and compatibility with smaller models.

### Human mode

Humans can step in when needed:

- confirm an action
- correct the agent
- provide extra instruction
- approve sensitive steps

This makes automation more trustworthy and easier to debug.

### Small-model-friendly execution

RunEver is designed so that useful automation is not limited to the strongest and most expensive models. By improving task splitting and execution transparency, it becomes more practical to run longer workflows at lower cost.

### Desktop-first experience

RunEver runs as an Electron desktop app and stores provider configuration in the system keyring rather than plaintext project files.

---


## Benchmark Snapshot

Latest internal `RunEverMark` benchmark result: `all-configs-final-r3`.

What was tested:

- scam-aware search result selection
- long-context Amazon purchase flow
- long task splitting and checkpoint planning
- long form filling
- calendar reasoning under delivery constraints
- wishlist webskill usage
- order-preparation webskill usage

Setup:

- `7` cases
- `3` repeats per model
- mixed HTML-first DOM execution, checklist planning, and task-level webskills

| Model | Score | Adjusted | Avg time |
| --- | ---: | ---: | ---: |
| `openai-gpt-5.4` | `120.7/129` | `131.2/139.5` | `11.06s` |
| `anthropic-claude-opus-4-6` | `116/129` | `124.5/139.5` | `13.15s` |
| `openai-gpt-5.1` | `115/129` | `124/139.5` | `9.49s` |
| `google-gemini-3.1-pro-preview` | `114.5/129` | `123.25/139.5` | `10.59s` |
| `openai-gpt-5-mini` | `113/129` | `121.5/139.5` | `11.25s` |
| `x-ai/grok-4.20` | `110.8/129` | `120.3/139.5` | `31.28s` |
| `anthropic-claude-sonnet-4-6` | `110/129` | `120.25/139.5` | `16.28s` |
| `google-gemini-3.1-flash-lite-preview` | `105/129` | `113.5/139.5` | `8.17s` |
| `alibaba-qwen3.6-plus` | `101/129` | `109.5/139.5` | `73.72s` |
| `kimi-k2.5` | `100.4/129` | `109.4/139.5` | `55.73s` |
| `openai-gpt-5.4-mini` | `98.9/129` | `103.4/139.5` | `6.92s` |
| `minimax-m2.7` | `86.9/129` | `95.65/139.5` | `11.33s` |
| `grok-4.1-fast` | `88.3/129` | `95.55/139.5` | `7.28s` |
| `zai-glm-5` | `84.4/129` | `87.4/139.5` | `28.26s` |

`Adjusted` applies light task-importance weighting, with extra emphasis on irreversible workflow planning such as task splitting.

These scores reflect RunEver's own execution interface rather than a generic chat benchmark, so they are most useful as a measure of structured browser-task reliability.

---

## Architecture

```text
src/main       Electron main process, IPC handlers, window/session management
src/renderer   React application, tabs, agent panel, auth flow, state
src/webView    In-page automation runtime, DOM actions, screenshots, network helpers
src/contracts  IPC contracts shared across processes
src/__tests__  Jest and React Testing Library tests
assets/        App icons and packaging resources
```

---

## Repository structure

```text
src/
  main/        Electron main process, auth, IPC, downloads, session control
  renderer/    React UI, tabs, auth pages, agent panel, state management
  webView/     Runtime injected into the browsing layer for automation
  contracts/   Shared contracts across main, renderer, and webview
  __tests__/   Test suites

assets/        Icons and packaging resources
testHtml/      Local benchmark and sample task assets, including RunEverMark
release/       Packaging output
```

---

## Getting started

### Prerequisites

Before running RunEver locally, make sure you have:

- **Node.js**
- **npm 7+**
- credentials for at least one supported model provider
- optionally, **ApiTrust OAuth app credentials** if you want to use hosted sign-in

---

## Installation

```bash
npm install
```

The ApiTrust OAuth flow is implemented directly inside the repository, so the
app can be installed and built without any extra sibling package checkout.

---

## Development

Start the app in development mode:

```bash
npm start
```

This launches the Electron app with the renderer dev server and main-process watch mode.

You can also run individual development commands:

```bash
npm run start:main
npm test
npm run lint
npm run lint:fix
```

---

## Production build

Build production bundles:

```bash
npm run build
```

Create packaged distributables:

```bash
npm run package
```

---

## Authentication and provider setup

RunEver currently supports two main ways to start using the agent.

### 1) Sign in with ApiTrust

RunEver can open an in-app OAuth window and authenticate through ApiTrust.

Create a local `.env` file with:

```env
CLIENT_ID=
CLIENT_SECRET=
REDIRECT_URI=
AUTH_BASE_URL=
API_URL=
```

Then start the app normally.

### 2) Use your own provider

From the auth screen, you can configure supported providers such as:

- `openai`
- `codex`
- `google`
- `zai`

For Codex, both of these modes are supported:

- API key
- local Codex login already authenticated on the machine

Provider credentials are stored in the **system keyring**, not in plaintext project files.

---

## Current capabilities

Based on the current codebase, RunEver already includes support for:

- prompt-driven browser sessions
- HTML/DOM-oriented action planning and execution
- DOM-based actions with waits and retries
- typing, selecting, keyboard input, mouse input, scrolling, and drag-and-drop
- file uploads and downloads
- screenshot capture
- opening and managing tabs and sessions
- auth deep links and in-app OAuth handling
- configurable providers and reasoning/model options
- human confirmation loops inside longer workflows

---

## Testing

RunEver uses:

- **Jest**
- **React Testing Library**

Run the test suite with:

```bash
npm test
```

---

## Contributing

Contributions are welcome.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution workflow and
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for community expectations.

Before opening a pull request:

1. Keep changes focused
2. Run `npm test`
3. Run `npm run lint`
4. Describe behavior changes clearly
5. Include screenshots for UI changes when relevant

Conventional Commits are preferred, for example:

- `feat:`
- `fix:`
- `refactor:`

---

## Project status

RunEver is under active development.

Some demo materials describe the project as “Release soon”. That should be interpreted as an early-stage product direction rather than a promise of general availability.

If you are evaluating the project today, treat it as an evolving open-source codebase focused on building a more practical and affordable browser agent.

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)**. This is intended to protect valuable prompt and service-facing logic, including cases where modified versions are offered over a network. See [LICENSE](./LICENSE) for the full text.

---

## Credits

Built on top of [electron-react-boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate)

# Repository Guidelines

## Project Structure & Module Organization
- `src/agentic` holds agent runtime logic, schemas, providers, prompts, and task/session orchestration.
- `src/main` holds Electron main-process code, IPC handlers, auth flow, and window/webview session management.
- `src/renderer` contains the React UI (`components/`, `hooks/`, `services/`, `state/`, `view/`).
- `src/renderer/config_page` is a separate config-page app built with its own toolchain.
- `src/webView` is the embedded automation layer (preload, DOM actions, network helpers, screenshots, cursor logic).
- `src/extensions` contains browser/webview extension assets, including iframe-related builds.
- `src/contracts` defines IPC contracts between main, renderer, and webview.
- `src/schema` and `src/utils` hold shared schemas and utility helpers.
- `src/__tests__` hosts Jest tests.
- `testHtml/runEverMark` contains local test/demo assets used by build scripts.
- `assets/` stores app icons and build resources; `release/` is packaging output.

## Build, Test, and Development Commands
- `npm start` runs the development app (main + renderer with live reload).
- `npm run start:main` runs the Electron main process in watch mode.
- `npm run start:renderer` runs only the renderer dev server.
- `npm run start:preload` and `npm run start:webViewPreload` rebuild preload bundles in development.
- `npm run build` builds production bundles for main and renderer.
- `npm run build:main` and `npm run build:renderer` build the Electron bundles directly.
- `npm run build:extensions`, `npm run build:configPage`, and `npm run build:runEverMark` build supporting assets/apps used by the main app.
- `npm run package` builds distributables via electron-builder.
- `npm test` runs Jest in jsdom.
- `npm run lint` or `npm run lint:fix` checks (and fixes) lint issues.
- `npm run build:dll` rebuilds the ERB renderer DLL used by the dev setup.
- `npm run rebuild` rebuilds native Electron dependencies.

## Coding Style & Naming Conventions
- Indentation: 2 spaces, LF line endings (see `.editorconfig`).
- TypeScript + React; prefer `.ts`/`.tsx` and keep UI components in `src/renderer/components`.
- Hooks live in `src/renderer/hooks` and should use the `useX` naming pattern.
- Formatting: Prettier (config in `package.json`), linting via ESLint (`.eslintrc.js`).

## Testing Guidelines
- Frameworks: Jest + React Testing Library.
- Test files use `*.test.tsx` and live under `src/__tests__`.
- No explicit coverage requirement is defined; keep tests targeted to UI and IPC behavior.

## Completion Standard
- A task is considered complete when:
- The requested change has been implemented
- The result has been verified using the most relevant method
- No obvious next step remains that would significantly improve correctness
- A response should represent a finished state, not a planned state.

## Verification
- Work is considered verified when:
- Code changes compile or run successfully, or
- The relevant command / test / request has been executed, or
- The observable result matches the expected outcome
- If verification is possible, it should be performed before concluding the task.

## Commit & Pull Request Guidelines
- Commit history mixes short imperative messages with Conventional Commit prefixes
  (e.g., `feat:`, `fix:`). Prefer Conventional Commits for clarity.
- Keep commits focused and scoped; reference issues or PR numbers when relevant.
- PRs should describe behavior changes, include screenshots for UI updates, and link
  the issue or feature request when applicable.

## Configuration & Environment
- Use a local `.env` for environment-specific configuration; keep secrets out of git.

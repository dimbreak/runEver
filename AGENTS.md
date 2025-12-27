# Repository Guidelines

## Project Structure & Module Organization
- `src/main` holds Electron main-process code, including IPC handlers and webview session management.
- `src/renderer` contains the React UI (`App.tsx`, `components/`, `hooks/`, `state/`).
- `src/webView` is the embedded webview layer (preload, actions, network, OCR).
- `src/contracts` defines IPC contracts between main/renderer/webview.
- `src/__tests__` hosts Jest tests (e.g., `App.test.tsx`).
- `assets/` stores app icons and build resources; `release/` is packaging output.

## Build, Test, and Development Commands
- `npm start` runs the development app (main + renderer with live reload).
- `npm run start:main` runs the Electron main process in watch mode.
- `npm run build` builds production bundles for main and renderer.
- `npm run package` builds distributables via electron-builder.
- `npm test` runs Jest in jsdom.
- `npm run lint` or `npm run lint:fix` checks (and fixes) lint issues.

## Coding Style & Naming Conventions
- Indentation: 2 spaces, LF line endings (see `.editorconfig`).
- TypeScript + React; prefer `.ts`/`.tsx` and keep UI components in `src/renderer/components`.
- Hooks live in `src/renderer/hooks` and should use the `useX` naming pattern.
- Formatting: Prettier (config in `package.json`), linting via ESLint (`.eslintrc.js`).

## Testing Guidelines
- Frameworks: Jest + React Testing Library.
- Test files use `*.test.tsx` and live under `src/__tests__`.
- No explicit coverage requirement is defined; keep tests targeted to UI and IPC behavior.

## Commit & Pull Request Guidelines
- Commit history mixes short imperative messages with Conventional Commit prefixes
  (e.g., `feat:`, `fix:`). Prefer Conventional Commits for clarity.
- Keep commits focused and scoped; reference issues or PR numbers when relevant.
- PRs should describe behavior changes, include screenshots for UI updates, and link
  the issue or feature request when applicable.

## Configuration & Environment
- Use `.env.sample` as the template for local configuration; keep secrets out of git.

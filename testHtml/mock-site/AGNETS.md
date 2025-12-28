# Mock Site Agent Notes

## Intention
This mock-site subproject provides modular, static-ish UI layouts for testing an
agentic browser. The main entry uses a `flow` query parameter to define a
sequence of UI steps, and an optional `step` parameter to control which step is
currently active. The layouts are designed to be wrapped by page components so
that behavior and state can be added without changing the base UI.

## Structure
- `src/components/flows/*Layout.tsx` holds presentational layouts for each mock flow.
- `src/pages/*Page.tsx` wraps layouts and is the intended place to add logic.
- `src/components/FlowFrame.tsx` provides shared framing for each flow section.
- `src/App.tsx` parses `flow` + `step` and renders the active page in sequence.
- `src/styles.css` contains shared styling and editor theming.

## Flows
Supported `flow` values: `login`, `email_list`, `search_engine`, `search_result`.
Sequences are comma-separated: `?flow=login,email_list` with `step` advancing.

## Editor
The email composer uses Quill for rich text editing (see `EmailListLayout.tsx`).

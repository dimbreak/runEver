# runEverMark benchmark

Simple LLM benchmark scaffold for `runEverMark`.

## What it does

- Keeps benchmark cases as code: `name`, `systemPrompt`, `userPrompt`, `score()`.
- Uses `src/agentic/api.ts` to hit multiple LLM providers.
- Repeats each request a configurable number of times and aggregates average score.
- Records first-token latency and total latency for scoring.
- Writes one report directory per run under `runEverMark/benchmark/reports/`.

## Current seed

- `dummy-search-plan`: a single lightweight dummy case based on the real `runEverMark` search prompt.

## Configure APIs

Put keys in [runEverMark/benchmark/.env](/B:/runEver/runEverMark/benchmark/.env):

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
GOOGLE_API_KEY=...
GOOGLE_BASE_URL=...
ZAI_API_KEY=...
ZAI_BASE_URL=...
ANTHROPIC_API_KEY=...
ANTHROPIC_BASE_URL=...
XAI_API_KEY=...
XAI_BASE_URL=...
XAI_420_API_KEY=...
XAI_420_BASE_URL=...
ALIBABA_API_KEY=...
ALIBABA_BASE_URL=...
ALIBABA_36_API_KEY=...
ALIBABA_36_BASE_URL=...
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=...
MINIMAX_API_KEY=...
MINIMAX_BASE_URL=...
```

`[config.ts](/B:/runEver/runEverMark/benchmark/config.ts)` flattens `runEverMark/benchmark/.env` directly into an `env` object, then each API preset reads `apiKey` / `baseUrl` from that object.

`xai-grok-4.20-reasoning` uses `XAI_420_API_KEY` / `XAI_420_BASE_URL`.
`xai-grok-4-1-fast-reasoning` uses `XAI_API_KEY` / `XAI_BASE_URL`.
`alibaba-qwen3.6-plus` uses `ALIBABA_36_API_KEY` / `ALIBABA_36_BASE_URL`.
`alibaba-qwen3.5-397b-a17b` and `alibaba-qwen3.5-122b-a10b` use `ALIBABA_API_KEY` / `ALIBABA_BASE_URL`.

If a key is empty in `runEverMark/benchmark/.env`, that API preset is marked disabled and will not run.

## Run

```bash
npm run benchmark:runevermark
```

Optional flags:

```bash
npm run benchmark:runevermark -- --list
npm run benchmark:runevermark -- --api openai-hi --repeats 3
```

## Report layout

Each run creates:

```text
runEverMark/benchmark/reports/run-<timestamp>/
  summary.json
  <model-id>/
    details.json
    cases/
      <case-id>.json
    prompt-record/
```

`summary.json` stores each case's average score, highlights, average first-token time, and average total time.

# Working on Laya Studio

Laya Studio is a local web UI for [Laya](https://github.com/NandhaKishorM/laya). It is a decision playground, not a generative chatbot. Preserve the real Jev-compatible API contract and keep the upstream project credited in the README.

## Architecture

- React + TypeScript + Vite. `src/App.tsx` owns the workspace and run lifecycle; `src/api.ts` owns typed contracts, validation, examples, and the HTTP client; `src/ThemeSwitch.tsx` owns appearance controls.
- `src/styles.css` defines shared design tokens and responsive styling. Fonts ship locally via Fontsource. Icons use Lucide or the existing SVG mark; no third-party requests are needed to render the interface.
- The production web image serves static assets through Nginx. `/api/*` proxies to the backend, so browser requests stay on the same origin.
- `compose.yaml` runs `web` and `api`. The backend builds the official upstream Dockerfile at a pinned Git commit. We do not fork or duplicate Laya inference internals.
- `compose.metal.yaml` is a standalone alternative that connects the web container to a native Mac backend. Do not merge it with the CPU Compose file.
- The API is independently exposed on port 8000. Container peers on the same Compose network use `http://api:8000`.

## Product and UI conventions

- The product name is **Laya Studio**, with npm/Compose names `laya-studio`.
- Use Laya's blue `#2a78d6`, neutral off-white light surfaces, and near-black dark surfaces. Keep colors in CSS variables; avoid unrelated accent palettes.
- Default to the system theme. Persist explicit choices. The theme thumb slides across three stable positions; respect `prefers-reduced-motion`.
- Use clear, human language in the interface. Hide infrastructure detail unless it helps someone act on an error or connect their service.
- Support narrow screens, keyboard navigation, labeled form controls, visible focus, accessible dialogs, and readable loading/error/empty states.
- Render actual model results. Never present fixture predictions or hard-coded timing as a live result. Show stale-result notices when inputs change.
- `choice` returns a label and distribution; `score` is a zero-based expected ordinal level; `noul` is P(true), not a generated boolean. Explicit yes/no criteria matter.
- Model probabilities are not measured accuracy. Keep that distinction in result copy.

## Implementation conventions

- Use strict TypeScript, functional React components, and hooks. Prefer small components and explicit data flow; extract cohesive UI sections as they grow.
- Validate requests before sending them. Keep payload construction in `src/api.ts`; preserve cancellation, duplicate-run guards, server-error handling, and cold-model timeouts.
- Use `fetch` through the same-origin `/api` proxy. Don't hard-code a Docker service hostname into browser code.
- Format with Prettier (`npm run format`). Commit `package-lock.json` and use `npm ci` for reproducible installs.
- Avoid new dependencies unless they solve a real problem. Don't add unrelated refactors or speculative features.
- Never store API keys in localStorage, sessionStorage, source files, screenshots, or test fixtures. Current keys live only in tab memory.
- History contains input text. It is limited to 30 runs and stays in the browser; account for unavailable/full storage.

## Docker and Mac behavior

- CPU is the default on ARM64 and AMD64. Do not force x86 emulation on Apple Silicon.
- Metal is unavailable inside macOS's Linux Docker VM. Native PyTorch MPS is an optional host-side path; do not describe it as container GPU acceleration or MLX.
- Preserve `/home/laya/.cache/huggingface` as the backend cache mount. Upstream runs as UID/GID 10001; changing the target without ownership handling breaks downloads.
- Keep default published ports bound to `127.0.0.1`. Document authentication and bind-address changes for LAN access.
- `/health` reports availability, not completion of lazy model downloads. Verify inference separately when changing backend/deployment behavior.
- Don't delete cache volumes, stop unrelated containers, or kill a process just because a port is occupied. Use a local `.env` port override instead.
- Secrets, `.env`, model weights, virtual environments, dependencies, and generated builds must stay untracked.

## Verification

```sh
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:e2e
docker compose config --quiet
```

Tests in `tests/api.test.ts` cover request contracts and HTTP failures. `tests/browser/` uses explicit mock responses for UI behavior. These tests do not prove inference works.

For backend/proxy changes, start Compose and run `python3 tests/smoke.py --web http://localhost:3000`. Override ports and `LAYA_API_KEY` as needed. This uses real models and exercises all three primitives through both direct API and web proxy. It may download model weights.

For visual changes, inspect light and dark modes plus a narrow viewport. Rebuild the web container before checking production; Vite alone uses hot reload. Distinguish tested behavior from optional, unverified paths in the handoff. Don't repeatedly run broad tests after they've passed unless a new change warrants it.

## Context and tool routing

When context-mode MCP tools are available, use them to keep exploration output bounded:

1. Gather related reads with `ctx_batch_execute(commands, queries)`; ask focused questions in the same call.
2. Query indexed content with `ctx_search`, batching related questions.
3. Use `ctx_execute` / `ctx_execute_file` for analysis, searches, long command output, and HTTP calls. Print concise findings instead of raw files/logs.
4. Fetch web content with `ctx_fetch_and_index`, then search the indexed source. Do not use `curl`, `wget`, or inline HTTP through ordinary shell execution.
5. Read files directly when you need their exact contents to edit. Use `rg` for text/file discovery. Ordinary shell calls are fine for short operations such as Git, directory creation, and package installation.

If those tools are unavailable, use bounded local commands and summarize output; never dump an unbounded log or response. Write substantial artifacts to files and link them. Keep user-facing updates and final reports concise (under 500 words).

## Documentation and delivery

- README should stay welcoming: Docker first, then fully local setup, Mac acceleration, API access, configuration, and troubleshooting.
- Explain why configuration matters rather than merely listing variables. Keep example ports consistent with defaults; local port overrides belong in `.env`.
- `CLAUDE.md` references this file. Keep shared instructions here instead of maintaining competing copies.
- Before publishing, check tracked files for secrets and local artifacts, run relevant checks, and describe what changed and what was verified.
- Don't create or delegate to subagents unless the user explicitly asks for parallel agent work.

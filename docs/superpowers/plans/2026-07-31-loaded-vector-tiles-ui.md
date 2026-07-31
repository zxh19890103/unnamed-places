# Loaded Vector Tiles UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone Tailwind table page for paginated loaded vector coverage and link it from the portal.

**Architecture:** A typed `src/jobs/api.ts` helper owns URL construction, fetch errors, and response normalization. The jobs React root owns loading, error, page offset, and table rendering; Vite exposes it through a new MPA HTML entry.

**Tech Stack:** React 19, TypeScript, Vite MPA, Tailwind CSS 4, Vitest

---

### Task 1: Loaded Coverage API Helper

**Files:**

- Create: `app/lancangriver/client/src/jobs/api.test.ts`
- Create: `app/lancangriver/client/src/jobs/api.ts`

- [ ] Write a failing test that stubs `fetch`, calls `fetchLoadedCoverage({ limit: 100, offset: 200 })`, verifies `${BASE_URL}/vector/coverage/loaded?limit=100&offset=200`, and expects typed tiles plus pagination metadata.
- [ ] Run `cd app/lancangriver/client && npm test -- src/jobs/api.test.ts`; expect failure because `api.ts` is absent.
- [ ] Implement `LoadedCoverageTile`, `LoadedCoveragePage`, and `fetchLoadedCoverage`, throwing `Loaded coverage API failed: <status>` for non-OK responses.
- [ ] Rerun the focused test; expect PASS.

### Task 2: Jobs Page And Portal Entry

**Files:**

- Modify: `app/lancangriver/client/src/jobs/App.tsx`
- Modify: `app/lancangriver/client/src/jobs/main.tsx`
- Create: `app/lancangriver/client/jobs.html`
- Modify: `app/lancangriver/client/vite.config.ts`
- Modify: `app/lancangriver/client/src/portal/App.tsx`

- [ ] Implement `App.tsx` with a 100-row page size, initial fetch, loading/error/empty states, total count, a responsive table for key/z/x/y, and Previous/Next controls derived from offset and total.
- [ ] Bootstrap the component with `createRoot` and shared `styles.css` in `main.tsx`.
- [ ] Add `jobs.html` with the `#App` root and jobs bootstrap script.
- [ ] Add `jobs` to Vite Rollup inputs and `/jobs` dev rewrite beside `/portal`.
- [ ] Add a `Loaded Vector Tiles` portal card linking to `/jobs.html`.
- [ ] Run `cd app/lancangriver/client && npm test`; expect all tests PASS.
- [ ] Run `cd app/lancangriver/client && npm run typecheck`; expect exit code 0.
- [ ] Run `cd app/lancangriver/client && npm run build`; expect `dist/jobs.html` and a successful build.
- [ ] Start the client dev server and verify `/jobs.html` renders without overlap at desktop and mobile widths; verify loading or data from the service is visible.

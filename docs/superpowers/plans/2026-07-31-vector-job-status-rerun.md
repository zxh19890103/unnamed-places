# Vector Job Status And Rerun Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show all vector ingest job statuses in the jobs table, support row-level refresh, and allow failed jobs to be requeued.

**Architecture:** PostgreSQL status listing and atomic failed-to-queued transitions remain in `osmJobsStore`. The vector coverage router exposes list and rerun endpoints through injected store methods. The client API helper consumes those endpoints while a standalone `JobStatus` button handles row refresh.

**Tech Stack:** Express, PostgreSQL, Vitest/Supertest, React 19, TypeScript, Tailwind CSS, Vite

---

### Task 1: Store All-Job Listing And Failed Rerun

**Files:**

- Modify: `app/lancangriver/serve/test/osm.jobs.store.test.js`
- Modify: `app/lancangriver/serve/src/jobs/osmJobsStore.js`

- [ ] Add failing tests for `listJobs({ limit, offset })` returning `{ jobs: [{ key, status }], total }` and `rerunFailed(key)` returning `queued`, `not_found`, or `not_failed` based on an atomic update plus status lookup.
- [ ] Run `cd app/lancangriver/serve && npm test -- test/osm.jobs.store.test.js`; expect missing-method failures.
- [ ] Implement stable all-status pagination and a failed-only update that sets `status = 'queued'`, clears `started_at`, `finished_at`, and `last_error`, and refreshes `queued_at`/`updated_at`.
- [ ] Rerun the focused store tests; expect PASS.

### Task 2: Jobs List And Rerun Routes

**Files:**

- Modify: `app/lancangriver/serve/test/vector.tiles.route.test.js`
- Modify: `app/lancangriver/serve/src/routes/vectorTiles.js`
- Modify: `app/lancangriver/serve/src/server.js`
- Modify: `app/lancangriver/serve/README.md`

- [ ] Add failing Supertest cases for paginated `GET /vector/coverage/jobs`, successful failed-job rerun, 404 unknown job, and 409 non-failed job.
- [ ] Run `cd app/lancangriver/serve && npm test -- test/vector.tiles.route.test.js`; expect new route failures.
- [ ] Inject `listCoverageJobs` and `rerunFailedCoverage` from `jobsStore` in `createApp`.
- [ ] Implement the jobs list using existing pagination validation and parse canonical keys into z/x/y. Implement `POST /vector/coverage/12/:x/:y/rerun` with coordinate validation and result-to-status mapping.
- [ ] Document both endpoints and rerun constraints.
- [ ] Rerun route tests and then `npm test`; expect all service tests PASS.

### Task 3: Client Status And Actions Columns

**Files:**

- Modify: `app/lancangriver/client/src/jobs/api.test.ts`
- Modify: `app/lancangriver/client/src/jobs/api.ts`
- Create: `app/lancangriver/client/src/jobs/JobStatus.tsx`
- Modify: `app/lancangriver/client/src/jobs/App.tsx`

- [ ] Add failing API tests for all-jobs pagination, `GET /vector/coverage/12/:x/:y`, and `POST /vector/coverage/12/:x/:y/rerun`.
- [ ] Run `cd app/lancangriver/client && npm test -- src/jobs/api.test.ts`; expect missing-export failures.
- [ ] Add typed job statuses and implement `fetchCoverageJobs`, `fetchCoverageStatus`, and `rerunFailedCoverageJob`.
- [ ] Rerun focused API tests; expect PASS.
- [ ] Add standalone `JobStatus` button with status-specific Tailwind colors, refresh busy state, and accessible label.
- [ ] Switch `App` to all jobs, add Status and Actions headers, update a single row after refresh, and show Rerun only for failed rows. Update successful reruns to queued and surface request errors.
- [ ] Run client tests and build; expect PASS and `dist/jobs.html`.
- [ ] Verify browser states with intercepted queued/running/done/failed rows, click status refresh, click failed rerun, and check desktop/mobile layout.

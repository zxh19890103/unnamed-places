# Vector Job Status And Rerun Design

## Goal

Extend the vector jobs page to show every ingest job's status, refresh individual statuses, and requeue failed jobs.

## Service API

`GET /vector/coverage/jobs?limit=100&offset=0` returns all canonical coverage jobs, ordered by `z12_key`, with this shape:

```json
{
  "jobs": [
    { "key": "12/3456/1523", "z": 12, "x": 3456, "y": 1523, "status": "failed" }
  ],
  "limit": 100,
  "offset": 0,
  "total": 1
}
```

Statuses are `queued`, `running`, `done`, or `failed`. Pagination validation matches the existing loaded-coverage list.

`GET /vector/coverage/12/:x/:y` remains the row-level status endpoint.

`POST /vector/coverage/12/:x/:y/rerun` atomically changes a job from `failed` to `queued`, clears execution timestamps and `last_error`, and updates `queued_at`/`updated_at`. It returns `{ key, status: "queued" }`. Unknown jobs return 404. Jobs not currently failed return 409 so active or completed work cannot be duplicated.

The existing `GET /vector/coverage/loaded` endpoint remains unchanged.

## Client UI

The jobs page switches from the loaded-only endpoint to the all-jobs endpoint. The total label becomes `Jobs total`.

A standalone `JobStatus` component renders a compact status badge as a button. Clicking it requests the single-tile status endpoint and replaces that row's status. It disables itself while refreshing and exposes a descriptive accessible label.

The Actions column renders `Rerun` only for failed jobs. While rerunning, the control is disabled. A successful response updates the row to `queued`, removing the action. Request failures surface through the page's existing error treatment.

## Testing

Service store and route tests cover all-status pagination, failed-to-queued transition, unknown jobs, and conflict responses. Client API tests cover list, status refresh, and rerun URLs/methods. Component behavior is verified through browser rendering because the client does not include a React DOM test library. Full service/client tests and client build remain required.

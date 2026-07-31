# Loaded Vector Tiles UI Design

## Goal

Add a small client page that lists completed zoom-12 vector coverage tiles from the service and make it accessible from the portal.

## Page

`jobs.html` boots `src/jobs/main.tsx`, which renders `src/jobs/App.tsx` and imports the shared Tailwind stylesheet.

The page requests `GET /vector/coverage/loaded?limit=100&offset=<offset>` through a small typed API helper. It displays:

- total loaded tile count
- tile key, zoom, x, and y in a table
- loading, empty, and request-error states
- Previous and Next pagination buttons

Previous is disabled on the first page. Next is disabled when the current page reaches the total count. Requests use the existing service `BASE_URL` convention.

## Integration

Add `jobs.html` to Vite's multi-page build inputs. Add a `Loaded Vector Tiles` entry to the existing portal card list linking to `/jobs.html`.

## Testing

Add focused tests for API URL construction and response parsing. Run client tests and production build to verify the new entry is included.

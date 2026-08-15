---
name: create-client-page-skeleton
description: "Create a new Lancangriver client page named A with a Vite MPA entry. Use when the user says create a page A and wants a simple UI skeleton plus pagesCfg route registration in app/lancangriver/client."
argument-hint: "Provide page name A and a short UI description."
---

# Create Client Page Skeleton

## Outcome

Produce a runnable page scaffold in the Lancangriver client with:

- folder created at `app/lancangriver/client/src/A/`
- files created: `App.tsx`, `main.tsx`, `index.html`
- route registered in `app/lancangriver/client/vite.config.ts` via `pagesCfg`
- portal quick-nav updated in `app/lancangriver/client/src/portal/App.tsx` (`pages` array)

## When To Use

Use this skill when the user asks for:

- "create a page A"
- "add page A"
- "scaffold page A"

Do not use this skill when:

- the user wants a finished feature implementation
- the task targets the root Electron prototype instead of Lancangriver client
- the user asks for backend/API work

Scope: workspace only for this repository.

## Required Flow

1. Confirm target scope is `app/lancangriver/client`.
2. Parse page name `A` from user request. Treat `A` as folder name and route name.
3. Check whether `app/lancangriver/client/src/A/` already exists.
4. If folder exists, stop and ask user for confirmation before any overwrite or edit.
5. If folder does not exist, create `app/lancangriver/client/src/A/`.
6. Create exactly these files in that folder:
   - `App.tsx` as the real UI file
   - `main.tsx` as bootstrap only
   - `index.html` as the Vite HTML entry
7. Customize `App.tsx` only from explicit user description. Keep it simple and do not guess missing features.
8. Open `app/lancangriver/client/vite.config.ts` and register the page in `pagesCfg` with key `A` and value `./src/A`.
9. If key `A` already exists in `pagesCfg`, stop and ask user for confirmation before changing it.
10. Update `app/lancangriver/client/src/portal/App.tsx` by appending one item in `pages` for quick navigation.
11. If the same route href already exists in `pages`, stop and ask user for confirmation before changing portal entries.
12. Run quick validation when feasible.
13. Report all created/updated files and any confirmation decisions taken.

## Decision Points

### 1) Folder Collision

- Folder `src/A` exists: stop and ask whether to overwrite, skip, or use another name.
- Folder `src/A` missing: proceed with creation.

### 2) Route Key Collision

- `pagesCfg` already contains key `A`: stop and ask before modifying that entry.
- Key `A` missing: add the new entry directly.

### 3) UI Detail Level

- Use only elements directly requested by the user.
- If the request is vague, ask one focused clarification question.
- Do not invent extra panels, charts, workflows, or data behavior.

### 4) Portal Entry Collision

- If `pages` in portal already has href `/A` (or `/A.html` by local convention), stop and ask whether to keep existing entry or update it.
- If no entry exists, append a new page metadata item for quick navigation.

## File Contract

- `main.tsx` must stay bootstrap-only: mount `App` to root.
- `App.tsx` contains page UI.
- `index.html` is the Vite entry that loads `./main.tsx`.
- Route URL uses folder name `A` through `pagesCfg` registration.
- Portal entry should include `title`, `href`, and `description` in the `pages` array.

## Skeleton Quality Bar

A valid skeleton must:

- compile/render without errors
- include simple semantic structure (`header`, `main`, section headings)
- keep bootstrap logic in `main.tsx` only
- avoid guessed features and heavy business logic
- keep styling minimal and structural

## Completion Checks

Before finishing, verify:

- New page is registered in `pagesCfg` with key `A` unless user declined confirmation.
- No duplicate `pagesCfg` key was silently overwritten.
- Portal `pages` includes one quick-nav item for the new page unless user declined confirmation.
- No unrelated files were reformatted.
- `main.tsx` remains bootstrap-only.

## Response Format

When done, report:

1. what was scaffolded
2. files changed
3. whether any folder/key/portal-entry confirmation was required
4. how to run/preview
5. assumptions or open questions

## Common Mistakes

- Scaffolding in the wrong stack (root app instead of Lancangriver client)
- Guessing UI behavior not requested by the user
- Writing non-bootstrap logic inside `main.tsx`
- Forgetting to register `pagesCfg`
- Forgetting to append the portal `pages` entry for quick navigation
- Overwriting existing folder or route key without explicit confirmation

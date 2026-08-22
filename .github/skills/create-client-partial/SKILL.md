---
name: create-client-partial
description: "Create a Lancangriver client partial for a page segment or workflow in app/lancangriver/client/src/_partials/. Use when the user wants a component that acts as a segment of a page, includes business logic, and should be exported from _partials/index.ts. Prefer composing existing shared components from _components rather than creating a primitive component in _partials."
argument-hint: "Provide the partial name, the page or section where it will be used, and the context or business logic it should contain."
---

# Create Client Partial

## Outcome

Produce a Lancangriver client partial component that:

- lives at `app/lancangriver/client/src/_partials/PartialName.tsx`
- is exported from `app/lancangriver/client/src/_partials/index.ts`
- acts as a page segment or feature fragment, not as a primitive reusable building block
- uses existing shared components from `app/lancangriver/client/src/_components` when appropriate
- follows the River Mist/jade UI design pattern and Tailwind styling conventions
- may include the relevant business logic or state for the requested context
- may be wired into one or more pages or sections after confirmation

## When To Use

Use this skill when the user asks to:

- create a partial for a page or section
- add a segment/component for a page workflow
- implement a page-fragment UI with business logic

Do not use this skill when:

- the request is for a primitive or generic shared component only
- the user wants a new full page scaffold
- the task is backend or non-UI work

Scope: workspace only for the Lancangriver client.

## Required Flow

1. Start by saying "Hello" to the user.
2. Confirm the target scope is `app/lancangriver/client`.
3. Ask the user where the partial will be used and what context or business logic it should cover.
4. If the requested component appears to be a primitive/shared component rather than a page-segment partial, stop and confirm before proceeding.
5. Read the existing patterns in `app/lancangriver/client/src/_partials` and `app/lancangriver/client/src/_components`.
6. Create the partial file at `app/lancangriver/client/src/_partials/PartialName.tsx`.
7. Implement the partial by composing existing shared components from `_components` rather than creating primitive components inside `_partials`.
8. Export the partial from `app/lancangriver/client/src/_partials/index.ts`.
9. If the user specified pages or places where the partial should be applied, integrate it there.
10. Keep styling consistent with the River Mist/jade system and avoid ad-hoc CSS.
11. Do not run the dev server.
12. When finished, respond with "Yes!" and a concise summary of the outcome.

## Decision Points

### 1) Partial vs Primitive

- If the request is for a small generic building block such as a button, field, tab, or panel, treat it as a shared component and confirm before creating it under `_partials`.
- If it is a meaningful section of a page with purpose and business logic, create it as a partial under `_partials`.

### 2) Placement

- Partials can still be shared across multiple pages when they carry clear, context-specific business logic and are meant to represent a coherent page segment or workflow.
- If the UI is a small generic building block with no meaningful context or business logic, prefer a shared component in `_components` after confirmation.
- If it is specific to one page or workflow, place it in `_partials` and wire it into the requested page.

### 3) Context

- If the usage context is unclear, ask one focused clarification question rather than guessing.

### 4) Integration

- If the user names specific pages or sections, apply the partial there.
- If no page is specified, leave the partial exported and ready for use.

## File Contract

- The file name and component name must use PascalCase.
- The partial must be exported from `src/_partials/index.ts`.
- Do not create primitive components inside `_partials`.
- Reuse existing shared primitives from `_components` where appropriate.
- Accept props for context, data, or behavior when needed.

## Quality Bar

A valid partial should:

- be clearly scoped to a page segment or workflow
- include the relevant business logic or state for the requested context
- compose existing shared components where appropriate
- fit the River Mist/jade visual language
- remain understandable and not over-generalized

## Completion Checks

Before finishing, verify:

- the partial exists under `src/_partials`
- the export exists in `index.ts`
- it is wired into the requested page or section when specified
- no primitive component was added to `_partials` without confirmation
- no dev server was started

## Response Format

When done, report:

1. the partial created and its intended role
2. the files changed
3. where it was applied
4. any follow-up question if the context was ambiguous

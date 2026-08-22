---
name: create-client-shared-component
description: "Create a reusable Lancangriver client component under app/lancangriver/client/src/_components using React, Radix UI, Tailwind CSS, and the River Mist/jade design system. Use when the user wants a shared component scaffold with PascalCase file/component names, index export, optional props, and a Storybook sample provider via static __storybook."
argument-hint: "Provide the component name and a short description of its purpose."
---

# Create Client Shared Component

## Outcome

Produce a reusable component scaffold in the Lancangriver client that follows the project conventions:

- file placed at `app/lancangriver/client/src/_components/ComponentName.tsx`
- component name and file name both use PascalCase
- component is exported from `app/lancangriver/client/src/_components/index.ts`
- styling uses Tailwind classes and shared River Mist/jade tokens from `src/styles.css`
- no inline styles
- Radix UI primitives are preferred where they already fit the use case
- props are optional whenever practical; whenever the component needs sample/demo data, implement a static `__storybook` function that returns sample props matching the component's props shape

## When To Use

Use this skill when the user asks to:

- create a shared or common UI component
- add a reusable primitive for the Lancangriver client
- scaffold a component that should be available across pages

Do not use this skill when:

- the component is page-specific or feature-specific
- the task is backend or non-UI work
- the request is only to tweak an existing component without introducing a new shared primitive

Scope: workspace only for the Lancangriver client.

## Required Flow

1. Confirm the target scope is `app/lancangriver/client`.
2. Read the existing shared component patterns in `app/lancangriver/client/src/_components`.
3. Read the semantic color and Tailwind setup in `app/lancangriver/client/src/styles.css` before introducing new visual tokens.
4. Derive a clear component name in PascalCase.
5. Create the component file at `app/lancangriver/client/src/_components/ComponentName.tsx`.
6. Prefer composition over duplication by reusing existing shared primitives such as `Button`, `IconButton`, `Panel`, `Tooltip`, or `ChildWindow` when appropriate.
7. Implement the component using Tailwind utility classes and the River Mist/jade design tokens; avoid inline style objects and ad-hoc CSS.
8. Prefer optional props in the component API. When the component needs Storybook/demo data, add a static `__storybook` function that returns sample props matching the component's props shape rather than making the main page API less ergonomic.
9. Export the component from `app/lancangriver/client/src/_components/index.ts`.
10. Run a quick validation step when feasible, such as a client build or typecheck.
11. Report the created files and any assumptions made.

## Decision Points

### 1) Shared vs Page-Specific

- If the UI is reused across multiple pages or workflows, place it in `src/_components`.
- If it only serves one page, keep it local to that page folder.

### 2) Props Design

- Prefer optional props for flexibility and safer reuse.
- If a prop is truly required or helpful for Storybook preview, add a static `__storybook` function that returns sample props matching the component props shape.

### 3) Styling Approach

- Use className utilities and semantic colors from the River Mist system.
- Do not add inline styles or introduce unrelated color values.

### 4) Radix UI Usage

- Use Radix primitives when the component needs accessible dialogs, dropdowns, tooltips, portalled content, or similar behavior.
- Do not introduce a new UI system when an existing Radix-based pattern already satisfies the need.

## File Contract

- The file name must match the component name in PascalCase.
- The component export must be named exactly as the file name.
- The component must be importable from `src/_components/index.ts`.
- The component must remain generic and reusable rather than embedding page-specific logic.

## Quality Bar

A valid shared component should:

- be small, focused, and composable
- use semantic River Mist/jade tokens instead of ad-hoc colors
- remain accessible and keyboard-friendly
- work without inline styles
- support Storybook-friendly defaults without overcomplicating page usage

## Completion Checks

Before finishing, verify:

- the component exists at the correct path
- the file name and component name are PascalCase
- the component is exported from `index.ts`
- props were made optional where practical
- a static `__storybook` sample-data provider exists when Storybook/demo data is needed
- styling uses Tailwind and project tokens rather than inline style

## Response Format

When done, report:

1. the component created
2. the files changed
3. any design tradeoffs or assumptions
4. whether a validation step was run

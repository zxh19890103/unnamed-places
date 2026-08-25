---
name: create-client-shared-component
description: "Create a reusable Lancangriver client component under app/lancangriver/client/src/_components using React, Radix UI, Tailwind CSS, and the River Mist/jade design system. Use when the user wants a shared component scaffold with PascalCase file/component names, index export, optional props, and a Storybook sample provider via static __storybook."
argument-hint: "Provide the component name and a short description of its purpose."
---

# Create Client Shared Component

## Goal

Create a reusable Lancangriver client component that fits the existing shared-component patterns.

## Use this skill when

- the UI should be shared across pages or flows
- you are creating a reusable primitive for the Lancangriver client

Do not use this skill when the work is page-specific, backend-focused, or a small tweak to an existing component.

## Rules

1. Put the component in `app/lancangriver/client/src/_components/ComponentName.tsx`.
2. Use a PascalCase component name and file name.
3. Export it from `app/lancangriver/client/src/_components/index.ts`.
4. Prefer optional props and keep the API simple.
5. Use Tailwind classes and River Mist/jade tokens from `src/styles.css`; avoid inline styles.
6. Reuse existing shared primitives such as `Button`, `IconButton`, `Panel`, `Tooltip`, or `ChildWindow` when they fit.
7. Keep the component generic, accessible, and focused.
8. When adding Storybook/demo data, use a static `__storybook` function that returns story cases as either `{ description, props }` for simple cases, or `{ description, run }` only when a wrapper, extra interaction, or effect is genuinely needed.
9. Keep each description funny but meaningful.
10. If feasible, run a quick client validation step.

## Simple checklist

- File and component names are PascalCase.
- The component is exported from the shared index.
- Props are optional when practical.
- Styling uses Tailwind and project tokens.
- Story cases use the right shape.

---
name: refactor-ts-react
description: "Use when refactoring TypeScript and React code. Start by narrowing the scope, asking for the relevant files and code blocks, and prefer small isolated components with local state. Avoid large components with many unrelated useState hooks, avoid wrapper-heavy patterns, and use useReducer for complex state transitions."
argument-hint: "Provide the target files, the relevant code blocks, and the refactoring goal."
---

# Refactor TypeScript and React Code

## Goal

Help refactor React/TypeScript code in a way that keeps the change small, focused, and maintainable.

## Use this skill when

- the user wants to refactor existing TS + React code
- a component is becoming too large or hard to reason about
- state and behavior should be isolated into smaller units
- a refactor needs clearer structure before editing

## Required flow

1. Narrow the scope first.
   - Ask which files are involved.
   - Ask for the specific code blocks or component sections to refactor.
   - Clarify the target outcome before changing anything.

2. Before working, think through the likely impact and explain it briefly.
   - Tell the user what will happen in plain language.
   - Ask for approval before making structural changes.

3. Prefer small, isolated components.
   - Split unrelated UI or behavior into separate components.
   - Keep each component focused on one concern.
   - Avoid turning a single file into a giant component that mixes unrelated logic.

4. Keep state local and isolated.
   - Put state close to the component that uses it.
   - Avoid lifting unrelated state to a parent just for convenience.
   - If a component has many unrelated `useState` values, split it.

5. If component separation is involved, ask how the new small components should be placed.
   - Offer these options: 1. local file, 2. a new single file, 3. a single file with a new folder.
   - Respect the user's choice before proceeding.

6. Avoid wrapper-heavy refactors.
   - Do not introduce a lot of small wrapper functions just to hide structure.
   - Prefer direct composition and clear component boundaries.
   - Keep the refactor simple and readable.

7. Use `useReducer` when state updates are complex.
   - If several related state changes share the same intent, use `useReducer`.
   - Prefer dispatch-based updates over many scattered handlers or wrapper functions.
   - This makes the state flow easier to follow and reduces brittle glue code.

8. Preserve behavior.
   - Refactor for structure, not for style alone.
   - Keep the user-visible behavior the same unless the request says otherwise.

9. Validate the refactor.
   - Run the relevant build, typecheck, or tests when feasible.
   - Confirm the change did not introduce regressions.

## Decision points

- If the component is doing many unrelated jobs, split it.
- If the state is shared across multiple concerns, isolate the state into a smaller component or reducer.
- If the logic is mostly a set of related transitions, use `useReducer`.
- If the code is only wrapped in forwarding functions with little value, simplify it.

## Simple checklist

- Scope was narrowed before editing.
- The refactor uses small, focused components.
- State is kept local where possible.
- Large mixed components were split instead of growing larger.
- Complex state updates use `useReducer`.
- Wrapper-heavy patterns were avoided.

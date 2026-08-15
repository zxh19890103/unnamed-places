---
applyTo: "app/lancangriver/client/**"
description: "Use when editing the Lancangriver client. Follow the TypeScript, Tailwind CSS, React, and Three.js stack conventions and the no-TDD, no-unit-tests workflow."
---

# Lancangriver Client Instructions

## Stack

- Use TypeScript and ES modules.
- Use React for application and interface components.
- Use Three.js for 3D scenes, globe rendering, terrain, tiles, and interactions.
- Use Tailwind CSS for styling when adding or changing client UI.
- Preserve the existing Vite project structure and entry points.

## Workflow

- Do not use a TDD workflow unless the user explicitly requests it.
- Do not add or write unit tests unless the user explicitly requests them.
- Prefer focused validation through `npm run build`, `npm run typecheck`, or a manual browser check when appropriate.
- Keep changes small and consistent with the existing client modules.
- At the beginning of every new session or task, load the `hi` skill and give a short greeting before working.

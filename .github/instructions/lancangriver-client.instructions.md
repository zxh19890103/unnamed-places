---
applyTo: "app/lancangriver/client/**"
description: "Use when editing the Lancangriver frontend (Vite + React + Three.js) for rendering, controls, tile streaming, and client tests."
---

# Lancangriver Client Instructions

Scope: app/lancangriver/client only.

## Commands

- Install: npm install (run in app/lancangriver/client)
- Dev server: npm run dev
- Build check: npm run build
- Tests: npm test

## Working Conventions

- Keep rendering logic modular under src/explore, src/view, and src/calc.
- Preserve TypeScript + ESM patterns already in use.
- Favor small, localized changes over broad refactors.
- When behavior changes, add or update Vitest coverage in app/lancangriver/client/test.

## Rendering and Tile Guidance

- Keep per-frame work bounded; avoid unthrottled request fan-out.
- Respect existing viewport-driven and LOD-aware loading paths.
- Avoid introducing synchronous heavy work on frame-critical paths.

## Verify Before Done

- Run npm test for client changes.
- If rendering/request behavior changed, run npm run dev and validate no obvious console/runtime errors.

## Reference Docs

- Runbook: ../../app/lancangriver/docs/runbook.md
- Client overview: ../../app/lancangriver/client/README.md
- Render details: ../../app/lancangriver/client/RENDER_LOGIC.md
- Controls docs: ../../app/lancangriver/client/src/explore/docs/controls.md

---
applyTo: "app/lancangriver/client/**"
description: "Use when designing or modifying UI in the Lancangriver client. Keep map overlays and controls consistent with the established compact dark scene-control pattern."
---

# Lancangriver Client UI Design

## Visual Pattern

- Build compact, work-focused map overlays rather than marketing-style sections or decorative page cards.
- Use dark, translucent surfaces: `bg-slate-950/80` or `bg-[rgba(8,10,14,0.88)]`, with subtle blur where it improves legibility.
- Use restrained borders and layers: `border-white/10`, faint white fills, and soft dark shadows.
- Use sky accents sparingly for section labels, selected controls, and meaningful status emphasis.
- Keep panel corners consistent: `rounded-xl` for panels and `rounded-lg` for contained controls or metric cells.

## Layout And Type

- Position scene tools as fixed overlays with `pointer-events-none` wrappers and `pointer-events-auto` interactive surfaces.
- Keep panels narrow, dense, and responsive; use viewport-bounded widths for small screens.
- Use uppercase, small section labels with wider tracking and a sky accent. Pair them with a clear, compact title.
- Use small readable control text, `tabular-nums` for live metrics, and truncation for uncertain dynamic values.
- Group related metrics in a compact grid of softly separated cells.

## Controls And States

- Buttons use a subtle translucent white fill, a light border, and a hover state with a slightly stronger fill.
- Use selected states deliberately: sky-tinted fill and border for the active terrain mode.
- Provide `aria-label`, `aria-pressed`, `disabled`, or `title` when the control type needs them.
- Ensure disabled controls are visibly muted and non-interactive.
- Prefer concise action labels that describe the command, such as "Open flat map" or "Pause tile updates".

## Consistency Review

When editing or reviewing UI under `app/lancangriver/client`, compare it with this pattern. If it introduces an inconsistent visual treatment, update it to match unless a distinct product context requires a documented exception.

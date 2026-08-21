---
applyTo: "app/lancangriver/client/**"
description: "Use when designing or modifying Lancangriver client DOM UI, including light River Mist map overlays, operational pages, Leaflet views, modals, iframe windows, controls, accessibility, and responsive browser layout."
---

# Lancangriver Client DOM UI

## Scope

This instruction governs rendered DOM only: React markup, Tailwind/CSS, overlays, panels, buttons, links, modals, diagnostics, browser layout, accessibility, and visible interaction states.

It does not govern Three.js, WebGL, shaders, cameras, scene graphs, terrain or material rendering, tile loading or LOD, map-rendering internals, or other non-DOM implementation. A DOM control may trigger those systems, but this instruction covers only the control's visible structure, placement, state, event affordance, and accessibility contract.

## Design Intent

- Treat the map or canvas as the primary surface. DOM UI should help the user inspect, choose, navigate, or act without competing with it.
- Build compact, work-focused map interfaces rather than marketing sections, hero layouts, decorative cards, or persistent explanatory chrome.
- Prefer progressive disclosure: show the next useful action or status first, and collapse secondary diagnostics or history when they are not needed.
- Keep the 3D and flat-map pages visually related through shared DOM tokens while allowing each page to retain its native map affordances.
- Use the light River Mist visual language demonstrated by `src/ui-design-implement`. It draws from mist, open sky, river water, lotus flowers, vegetation, and sunlight rather than a monochromatic green or dark software theme.

## Visual Tokens

- Use semantic River Mist tokens instead of scattering unrelated colors through components. The reference values are foundation `#eaf2f7`, depth `#dce8f0`, panel `#f8fbfd`, raised panel `#ffffff`, control `#e4eef5`, control hover `#d3e3ed`, border `#8ea7b7`, soft border `#c2d2dc`, primary text `#182a36`, muted text `#5f7482`, river accent `#078ea5`, selected fill `#cdeef3`, success/leaf `#2e9b66`, warning/sun `#c78313`, error `#d94b5b`, navigation/sky `#397fcf`, and photos/lotus `#d94f83`.
- Prefer the Tailwind color utilities registered in `src/styles.css`, such as `bg-jade-panel`, `bg-jade-panel/95`, `text-jade-text`, `text-jade-text-muted`, `border-jade-border`, `border-jade-border-soft`, `outline-jade-river`, and state variants such as `hover:bg-jade-control`. Use direct `var(--jade-*)` syntax only where a Tailwind color utility cannot express the property.
- Use cool off-white and blue-gray surfaces rather than pure white everywhere. Preserve enough translucency over maps to retain geographic context without sacrificing text contrast.
- Use panel and raised-panel surfaces for overlays, with control and control-hover fills for contained actions. Apply blur only when it improves legibility over changing imagery.
- Give every panel and control a visible blue-gray border. Avoid borders so pale they disappear over bright satellite or Leaflet imagery.
- Use restrained blue-charcoal shadows with low opacity. Avoid heavy outlines, glossy gradients, neon glow, and persistent dark chrome.
- Reserve river cyan for map selection and focus, sky blue for navigation and viewpoint actions, lotus pink for photos and journeys, leaf green for success, sun amber for warnings, and error red for failures. Do not make every action the same accent color.
- Keep panel corners consistent: `rounded-xl` for panels and `rounded-lg` for contained controls or metric cells. Do not nest decorative cards inside other cards.
- Keep text small but readable. Use blue-charcoal text for primary content and muted blue-gray text for supporting labels. Use uppercase, tracked labels only for short category names; use normal case for actions, statuses, and user-facing messages.
- Use `tabular-nums` for live metrics and coordinates. Truncate or wrap dynamic values deliberately so they cannot resize a panel unexpectedly.
- Keep contrast sufficient over satellite, terrain, vector, and schematic map imagery. Light overlays need visible edges, readable muted text, and distinct selected and disabled states.

## Typography

- Use `SUSE Mono` as the final typeface for all Lancangriver client DOM UI, including headings, body text, controls, labels, tables, coordinates, and telemetry. Fall back to `ui-monospace`, `SFMono-Regular`, `Menlo`, `Monaco`, `Consolas`, and `monospace`.
- Let hierarchy come from size, weight, color, and spacing rather than switching font families. Use approximately 600 for titles and selected controls, 500 for buttons and labels, and 400 for body text and supporting values.
- Keep letter spacing at `0`. Do not add tracking to uppercase labels; SUSE Mono already provides a strong technical rhythm.
- Use `tabular-nums` for changing values even though the primary font is monospaced, so intent remains explicit and fallback behavior stays stable.
- Keep labels concise. Monospaced text is wider than proportional text, so verify long commands, translated text, coordinates, filenames, and place names at narrow widths.

## Button System

- Buttons use a quiet River Mist base: `bg-jade-control`, `border-jade-border-soft`, and `text-jade-text`. On hover, use `bg-jade-control-hover` with `border-jade-border`. Do not use gradients, glow, heavy shadows, or decorative pills.
- Use `rounded-lg` consistently. Standard text buttons are at least `min-h-10`; primary dialog and workflow actions may use `min-h-11`. Keep horizontal padding between `px-3` and `px-4` according to label length.
- Keep button labels at `text-sm font-medium` and letter spacing `0`. Do not uppercase command labels. Button width must remain stable when labels, loading indicators, icons, or selected states change.
- Use one clear primary action per local decision area. Primary map-selection actions use `bg-jade-river text-white`; navigation or viewpoint actions may use `bg-jade-sky text-white`; photo and journey actions may use lotus emphasis. Secondary and cancel actions remain on the neutral control surface.
- Icon-and-text buttons place a `size-4` or `size-5` icon before the label with `gap-2`. Icons must describe the action rather than decorate it. Do not add an icon when it repeats no useful meaning.
- Icon-only map toolbar buttons use a stable `size-11` square, a centered `size-5` or `size-5.5` icon, `rounded-lg`, and the same neutral border and surface as other controls. Place vertical toolbars inside a `role="toolbar"` container with `aria-orientation="vertical"`.
- Every icon-only button needs an `aria-label` and a Radix UI tooltip. Tooltips name the resulting action, open away from the viewport edge, use a raised River Mist surface, and must also appear on keyboard focus. Do not rely on the native `title` attribute as the primary tooltip.
- Toggle buttons use `aria-pressed`. Their selected state uses `border-jade-river bg-jade-river-soft text-jade-text`; change the icon when doing so makes the current state or next action clearer, such as pause versus resume.
- Segmented mode buttons form one semantic group. Keep equal height and stable icon placement, allow horizontal scrolling on narrow screens, and use the same selected state as toggle buttons. Do not make each segment look like an unrelated primary action.
- Destructive actions use error color only when the action is truly destructive. Prefer a neutral button until confirmation, then use `border-jade-error bg-jade-error text-white` for the final destructive command.
- Loading buttons retain their normal dimensions and label context, prevent duplicate activation, expose `aria-busy`, and show a compact progress indicator without shifting adjacent controls. Loading is not the same as disabled; communicate what is happening.
- Disabled buttons use the neutral surface with reduced contrast and opacity, keep their explanatory label or tooltip, and use `disabled:cursor-not-allowed`. They must not resemble selected or loading states.
- Keyboard focus uses a two-pixel `outline-jade-river` with visible offset. Hover, focus, active, selected, loading, and disabled treatments must not resize or move the button.
- Use familiar symbols for close, minimize, restore, zoom, pause, play, map, photo, navigation, and add actions. Prefer the existing icon library when it has a suitable icon; use a custom SVG only when the domain action needs a clearer project-specific symbol.
- On touch layouts, keep at least 44 by 44 CSS pixels for icon controls and sufficient separation to prevent accidental activation. Do not shrink controls to solve overlay collisions; reposition, dock, scroll, or collapse the surrounding UI instead.

## Interface Families

- **Map workspace:** Treat `OpsPanel`, terrain material controls, `SceneMonitor`, and `JourneyPanel` as one coordinated overlay system. Keep commands compact, use `aria-pressed` for selectable modes, collapse secondary diagnostics, bound journey scrolling, and reserve map-safe zones so panels do not overlap.
- **Standalone pages:** Use the same foundation, panel, control, typography, and status tokens for DOM-only operational pages. Favor dense lists, tables, filters, and direct actions over landing-page composition. A Leaflet page remains a map-first page, not a decorative panel containing a map.
- **Modal over 3D:** Use a neutral translucent backdrop that preserves map context, a viewport-bounded River Mist dialog, a clear title and close control, explicit cancel/confirm actions, coherent initial focus, Escape dismissal, and focus restoration.
- **Iframe floating window:** Give the iframe an accessible title and a stable River Mist window frame with close and, when useful, minimize/restore controls. Communicate loading and unavailable states outside or over the iframe. Bound the window to the viewport and dock or widen it on small screens instead of allowing it to overflow.

## DOM Layout And Layering

- Position map-adjacent panels as fixed or absolute overlays with explicit layer ownership. Use `pointer-events-none` wrappers and `pointer-events-auto` interactive surfaces when the map must remain clickable around a panel.
- Keep panels narrow and viewport-bounded, for example `w-[min(320px,calc(100vw-2rem))]`. Use bounded internal scrolling for journey lists, diagnostics, and other growing content.
- Reserve safe zones around the viewport edges. Do not let panels overlap each other, cover essential map content, or hide native map attribution and controls.
- On small screens, stack or collapse secondary panels rather than shrinking text until it becomes unusable. Keep controls reachable with one hand and prevent horizontal overflow.
- Use a clear hierarchy inside each panel: short eyebrow or status, compact title, primary action or content, then secondary details.
- Keep modals visually distinct from map overlays: use an intentional backdrop, a bounded dialog, a clear close control, and a layout that remains usable on small screens.
- Keep flat-map attribution and native map controls visible and functional. Add DOM overlays around them instead of silently replacing or obscuring them.

## Controls And Accessibility

- Links remain visually distinct from buttons. Use text links for navigation within prose or tables and button styling only for commands and bounded navigation controls.
- Use selected states deliberately with the river border and selected-fill token. Use `aria-pressed`, `aria-selected`, or a native form control according to the control semantics; do not communicate state by color alone.
- Provide `aria-label`, `aria-describedby`, `disabled`, `title`, and dialog semantics where the DOM interaction requires them. Preserve a visible keyboard focus state.
- Make touch targets comfortably usable, with a stable minimum height and spacing. Do not let labels, icons, loading indicators, or hover states resize controls.
- Ensure disabled controls are visibly muted, non-interactive, and still understandable. Do not use disabled styling for an action that is merely loading without communicating the reason.
- Use progressive disclosure or a collapse control for secondary diagnostics, as demonstrated by `SceneMonitor`. The collapsed state must remain discoverable and accessible.
- Respect `prefers-reduced-motion`. Motion should clarify opening, closing, selection, or loading state and must not be required to understand the interface.

## Content And UI States

- Give actions concise labels that describe the command, such as "Open flat map", "Load photo locations", or "Pause tile updates". Avoid implementation terms, internal names, and debug language in visible controls.
- Represent loading with a local status and a stable layout. Prevent duplicate submissions where appropriate and restore the relevant action after completion.
- Represent empty, error, unavailable, and success states explicitly. Keep errors actionable and specific without exposing stack traces or transport details.
- Keep live telemetry compact and scannable. Group related metrics into softly separated cells and use clear placeholders such as `--` when a value is not available.
- Use truncation, wrapping, or disclosure for uncertain dynamic content. Never allow a long place name, filename, error, or coordinate to push neighboring controls off-screen.
- Keep status language calm and factual. Do not use alerts for routine state changes when an inline status, selected state, or live region is sufficient.

## View Integration

- Share DOM tokens, panel density, control states, focus behavior, and content conventions between the 3D page and flat map.
- On the 3D page, DOM controls may expose view modes, diagnostics, photos, or scene actions, but their visual contract remains this DOM guidance only.
- On the flat map, preserve Leaflet's native zoom, attribution, marker, popup, and keyboard affordances. DOM additions should clarify the selection workflow without duplicating native controls unnecessarily.
- For iframe or modal map selection, communicate the dialog or frame title and close action, keep focus behavior coherent, expose loading or unavailable states, and return the selected result to the surrounding DOM UI with a visible confirmation or updated state.

## Review Checklist

When editing DOM UI under `app/lancangriver/client`, compare the result with `src/ui-design-implement`, `JourneyPanel`, `SceneMonitor`, `OpsPanel`, the terrain-mode control markup, `MapIntroCard`, the flat-map modal, and `MiniMap`.

- Is the map still the primary visual surface?
- Does every overlay have an intentional viewport position, z-index, and pointer-event behavior?
- Do loading, empty, error, disabled, selected, and focus states remain legible and stable?
- Does the layout avoid overlap and horizontal overflow on narrow screens?
- Are keyboard, touch, screen-reader, and reduced-motion behaviors accounted for?
- Are Leaflet attribution and native controls unobstructed?
- Does the UI use River Mist semantic colors without a green-dominated base, pure-black surfaces, or undifferentiated accents?
- For modal and iframe views, are close, loading, focus, viewport bounds, and mobile docking behaviors explicit?
- Does the change concern DOM presentation and browser interaction only, without prescribing Three.js or WebGL implementation?

---
status: done
---

# Item 4 Plan: Border-Style Theme Exploration

## Objective

Explore and apply a lighter, border-led visual theme to the Lancangriver client so the interface feels clearer, softer, and more consistent with the River Mist design language while retaining readability over map imagery.

---

## 1. Audit the Current Visual System

### Tasks

- Review the current client styling tokens and color usage.
- Inspect the existing map overlays, panels, buttons, and form controls for visual density and contrast.
- Identify the current weak spots: low-contrast borders, heavy fills, inconsistent surfaces, or unclear state styling.
- Confirm how the UI behaves on both the 3D map surface and the flat map surface.

### Output

- A list of existing visual patterns that should stay.
- A list of patterns that need to be softened or reworked.

### Success criteria

- The theme update is based on the actual current design system, not a style guess.
- The plan clearly distinguishes stable patterns from those that are visually noisy or low-contrast.

---

## 2. Define the Border-Style Design Direction

### Design goals

- Use borders as the primary separation device instead of relying on heavy fills.
- Keep the interface airy and technical, with good separation over both bright and dark map backgrounds.
- Preserve the River Mist palette and avoid drifting toward a dark chrome or monochrome green theme.
- Keep controls and panels readable without looking overly decorative or glossy.

### Target characteristics

- Soft blue-gray borders with enough contrast to remain legible.
- Light panel surfaces with controlled translucency.
- Clear selected states using the river/sky accent language.
- Consistent rounded corners and compact control density.

### Success criteria

- The visual system looks intentional and cohesive.
- The interface remains legible on top of both terrain and flat map layers.

---

## 3. Update the Shared UI Tokens

### Tasks

- Review the shared semantic color tokens used for panels, controls, borders, text, selected states, and accent colors.
- Adjust border, surface, and hover weights where needed to support a lighter border-driven theme.
- Make sure the color system remains consistent with existing River Mist semantics.
- Keep the token structure reusable for dialogs, toolbars, and overlays rather than patching individual screens ad hoc.

### Expected behavior

- Panels and form controls use the same visual foundation.
- Hover, focus, selected, and disabled modes remain clearly distinct.
- The design remains consistent across multiple screens and map overlay types.

### Success criteria

- The theme can be implemented through shared tokens rather than scattered one-off hex colors.
- Individual UI components inherit the same border treatment cleanly.

---

## 4. Refresh Core Map Overlay Components

### Scope

Apply the theme to the main overlay surfaces that sit on the map, such as:

- control toolbars
- side panels
- status groups
- selected-state elements
- small utility popovers

### Tasks

- Reduce visual weight on panels and containers.
- Increase border visibility without making the UI too heavy.
- Preserve map-safe spacing and avoid overlap with native controls or attribution.
- Test labels, icons, and status text against the new surface colors.

### Success criteria

- Map overlays feel lighter and more cohesive.
- They remain easy to scan while preserving enough contrast for user control.

---

## 5. Update Button and Input Styling

### Tasks

- Refine the button base, hover, selected, disabled, and loading states.
- Make key actions stand out with the appropriate accent color without overusing a single tone.
- Apply the same border logic to toggles, segmented controls, and compact utility buttons.
- Check the visual treatment for input fields and other small interactive elements.

### Expected behavior

- Buttons read as clear actions rather than heavy blocks.
- Selected and focus states are visible and consistent.
- The border treatment supports both keyboard and pointer interactions.

### Success criteria

- Major actions and minor actions retain clear hierarchy.
- The control system remains readable without excess decoration.

---

## 6. Validate the Theme on Real Client Surfaces

### Manual checks

- Open the 3D map and inspect panel surfaces against terrain and satellite backgrounds.
- Open the flat map flow and verify the panels and controls remain legible.
- Check toolbar states, modal surfaces, and focus treatment.
- Validate contrast for text, borders, and selected markers in both bright and dark visual conditions.
- Ensure the interface still feels focused and not visually noisy.

### Success criteria

- The updated UI works across the main usage contexts of the client.
- The border-led theme reads clearly without reducing usability.

---

## 7. Polish and Accessibility Pass

### Tasks

- Confirm keyboard focus remains visible and strong enough to stand out from the border styling.
- Review disabled and loading states so they remain understandable without confusion.
- Check that reduced-motion and generally calm visual behavior are maintained.
- Tighten any surface or text contrast issues before finalizing the theme.

### Success criteria

- The design remains accessible and readable.
- The lighter border theme does not trade away clarity or interaction feedback.

---

## 8. Risks and Notes

### Main risks

- Borders may become too thin or too pale and lose contrast over bright imagery.
- Over-soft surfaces may reduce hierarchy and make actions less distinct.
- The visual update may accidentally drift away from the River Mist palette if color choices are made too locally.

### Mitigations

- Keep the border treatment semantically tied to the existing token system.
- Validate contrast against both bright and darker map scenes.
- Prefer a few strong visual rules over ad hoc patchwork styling.

---

## Recommended Implementation Order

1. Audit existing visual patterns and token usage.
2. Define the border-led design direction.
3. Update shared tokens and sematic colors.
4. Refresh map overlays and panel surfaces.
5. Update buttons, toggles, and inputs.
6. Validate across 3D and flat map workflows.
7. Finish with accessibility and contrast tuning.

---

## Follow-up Considerations

- Apply the same theme to any new UI added in later tasks so it stays consistent.
- Re-use the border-led patterns for dialogs, floating tool windows, and map controls rather than introducing a separate visual language.
- If a later feature needs stronger emphasis, prefer accent color and state styling over heavier decorative fills.

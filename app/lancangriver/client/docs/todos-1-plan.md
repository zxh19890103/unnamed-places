# Item 1 Plan: Load Photos and Show Photo Locations on the Map

## Objective

Implement a photo layer workflow that loads photo metadata, displays each photo's geographic location on the map, and allows the user to preview a selected photo without breaking the current map interactions.

## Goal State

When the user opens the client and loads the photo dataset:

- photo points appear on the map at their correct coordinates,
- each point is associated with a photo record,
- selecting a point opens a compact preview,
- the preview includes enough metadata to understand the photo context,
- the workflow remains usable in both flat-map and terrain-style view modes.

---

## 1. Understand the Existing Data Flow

### Tasks

- Locate the current data-loading pattern used by the client for map layers or markers.
- Identify the API or store that provides photo metadata.
- Check whether photo records already include fields like `id`, `lat`, `lng`, `url`, `timestamp`, `name`, or `caption`.
- Confirm how the map handles point-based overlays and selection events.

### Output

- A clear list of the photo data schema and access path.
- A map-layer integration pattern that matches the current client architecture.

### Success criteria

- The plan is aligned to the existing layer and selection patterns.
- No duplicate or conflicting marker lifecycle logic is introduced.

---

## 2. Define the Photo Data Contract

### Data requirements

For each photo, make sure the client can resolve the following:

- unique photo id
- latitude and longitude
- thumbnail or full image URL
- optional title or caption
- timestamp or date
- optional place context or project metadata

### Handling missing or partial data

- If a photo is missing coordinates, do not render it on the map.
- If a thumbnail fails to load, show a placeholder state.
- If metadata is partially missing, still render the marker but show a minimal preview.

### Success criteria

- All rendered markers have a valid geographic position.
- The preview UI degrades gracefully when metadata is incomplete.

---

## 3. Add Photo Loading and Marker Generation

### Tasks

- Create or extend a photo-loading function that fetches photo records.
- Normalize the data into a consistent structure used throughout the client.
- Convert each photo record into a map marker or layer object.
- Keep marker generation independent from rendering logic so filtering or selection is easier later.

### Map behavior

- Place markers near their real location.
- Use a visual style that distinguishes photo markers from other map objects.
- Support zoom-based visibility or clustering if the photo count becomes large.

### Success criteria

- Loading a dataset produces one visible marker per valid photo.
- Marker state and photo record state stay synchronized.

---

## 4. Build Photo Selection and Preview UX

### Tasks

- Add click/selection behavior for each photo marker.
- Track the current selected photo in local view state.
- Show a compact preview panel or modal when a photo is selected.
- Include a clear close or deselect action.

### Preview content

The preview should include:

- photo thumbnail or image
- photo title or label
- timestamp
- location summary (e.g., coordinates or place label)
- optional metadata such as camera or altitude if available

### UX expectations

- The preview should not block the map excessively.
- The selection should remain readable on top of terrain or satellite layers.
- The interaction should feel fast and lightweight.

### Success criteria

- Clicking a marker selects the corresponding photo reliably.
- The preview reflects the correct photo record.
- Clearing selection removes the preview state cleanly.

---

## 5. Integrate with the Existing Map and Camera Model

### Tasks

- Ensure the selected photo is visible when the user focuses or navigates to it.
- If the system supports camera movement, map a selected photo to a target location.
- Ensure the photo layer works in both the 3D globe view and any flat or 2D map mode.
- Avoid interfering with existing map gestures, markers, or overlays.

### Behavior expectations

- The user can still pan, zoom, and inspect the map around the photo layer.
- Photo selection does not hijack unrelated map interactions.
- The current camera state remains stable when markers are added.

### Success criteria

- The photo layer is integrated without breaking navigation or inspection flows.
- The user can select and inspect photos while continuing to use the map normally.

---

## 6. Add Empty, Error, and Loading States

### Tasks

- Show a loading state while photo metadata is being fetched.
- Show an empty state when no valid photos are available.
- Show an explicit error message if photo loading fails.
- Provide a lightweight retry path where appropriate.

### Success criteria

- The UI communicates the data state clearly.
- The user knows whether the map is still loading, empty, or failed.

---

## 7. Validate the Feature End-to-End

### Manual verification checklist

- Open the client with the photo dataset loaded.
- Verify the markers appear on the map at the correct positions.
- Click several markers and confirm the preview updates correctly.
- Verify that the preview remains readable over the current map background.
- Check that the client still works when there are many points or when some photos are missing metadata.
- Confirm the feature behaves correctly in the terrain and flat-map flows.

### Acceptance criteria

- Photo markers render on the map successfully.
- Marker selection opens a usable preview UI.
- Empty or error states are explicit and user-friendly.
- Existing map actions are not broken by the new feature.

---

## 8. Recommended Implementation Order

1. Confirm the photo data contract and available fields.
2. Create the photo loading and normalization layer.
3. Render markers on the map.
4. Add marker selection state and preview panel.
5. Connect preview to camera focus or location inspection if needed.
6. Handle empty/loading/error states.
7. Run a manual browser check and polish the interaction details.

---

## 9. Risks and Notes

### Main risks

- Photo coordinate mismatches or invalid data causing markers to render in the wrong place.
- Marker clutter when large numbers of photos are loaded.
- A preview panel that competes visually with the map or slows interaction.

### Mitigations

- Validate coordinates before rendering.
- Add simple visibility or clustering logic if the dataset is large.
- Keep the preview compact and map-aware.
- Favor a pattern already used by existing map overlays and selection components.

---

## Suggested Follow-up Tasks

- Add marker clustering for dense photo collections.
- Add filtering by date or area.
- Add keyboard navigation between selected photos.
- Add a “fly to photo” camera action from the preview panel.

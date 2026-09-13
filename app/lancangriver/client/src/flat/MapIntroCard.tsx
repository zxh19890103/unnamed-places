export function MapIntroCard() {
  return (
    <section className="pointer-events-none absolute top-3 right-3 left-14 z-500 max-w-80 rounded-xl border border-jade-border bg-jade-panel/92 px-4 py-3 text-sm text-jade-text shadow-[0_8px_24px_rgba(24,42,54,0.12)] backdrop-blur-md sm:top-4 sm:right-auto sm:left-16">
      <h1 className="font-semibold">Choose a map center</h1>
      <p className="mt-1 text-xs leading-5 text-jade-text-muted">
        Select a point on the map, then confirm the coordinates.
      </p>
    </section>
  );
}

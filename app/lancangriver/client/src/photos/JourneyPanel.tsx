import type { JourneyDayNode } from "./types";

type JourneyPanelProps = {
  days: JourneyDayNode[];
  selectedDayKey: string | null;
  loading: boolean;
  error: string | null;
  onSelectDay: (dayKey: string) => void;
};

export function JourneyPanel({
  days,
  selectedDayKey,
  loading,
  error,
  onSelectDay,
}: JourneyPanelProps) {
  return (
    <aside className="flex max-h-[calc(100vh-6rem)] w-[min(320px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-(--jade-border) bg-(--jade-panel)/95 p-3 text-(--jade-text) shadow-xl shadow-[#182a36]/20 backdrop-blur-md">
      <div className="mb-2 border-b border-(--jade-border-soft) pb-2">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-(--jade-river) uppercase">
          Photo timeline
        </p>
        <h2 className="mt-0.5 text-sm font-semibold">Life journey</h2>
      </div>

      {loading && (
        <p className="text-xs text-(--jade-text-muted)" role="status">
          Loading photo locations...
        </p>
      )}
      {!loading && error && (
        <p className="text-xs text-(--jade-error)" role="status">
          {error}
        </p>
      )}
      {!loading && !error && days.length === 0 && (
        <p className="text-xs text-(--jade-text-muted)">
          No geotagged photos found
        </p>
      )}

      <div className="mt-2 min-h-0 space-y-2 overflow-y-auto pr-1">
        {days.map((day) => {
          const isSelected = selectedDayKey === day.dayKey;

          return (
            <button
              key={day.dayKey}
              type="button"
              onClick={() => onSelectDay(day.dayKey)}
              aria-pressed={isSelected}
              className={`w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--jade-river) ${
                isSelected
                  ? "border-(--jade-river) bg-(--jade-river-soft)"
                  : "border-(--jade-border-soft) bg-(--jade-depth)/40 hover:border-(--jade-border) hover:bg-(--jade-control)"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium text-(--jade-text)">
                  {day.displayLabel}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-(--jade-text-muted)">
                  {day.photoCount} photos
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {day.placeChips.map((chip) => (
                  <span
                    key={chip}
                    className="max-w-full truncate rounded-md bg-jade-lotus-soft px-2 py-0.5 text-[11px] text-jade-lotus"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

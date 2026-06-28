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
    <aside className="max-h-[calc(100vh-2rem)] w-[320px] overflow-hidden rounded-xl bg-slate-950/70 p-3 text-white backdrop-blur-sm">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
        Life Journey
      </h2>

      {loading && <p className="text-xs text-slate-300">Loading photos...</p>}
      {!loading && error && <p className="text-xs text-rose-300">{error}</p>}
      {!loading && !error && days.length === 0 && (
        <p className="text-xs text-slate-300">No geotagged photos found</p>
      )}

      <div className="mt-2 space-y-2 overflow-y-auto pr-1">
        {days.map((day) => {
          const isSelected = selectedDayKey === day.dayKey;

          return (
            <button
              key={day.dayKey}
              type="button"
              onClick={() => onSelectDay(day.dayKey)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                isSelected
                  ? "border-sky-400 bg-sky-500/20"
                  : "border-slate-700 bg-slate-900/50 hover:bg-slate-900/80"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{day.displayLabel}</span>
                <span className="text-xs text-slate-300">
                  {day.photoCount} photos
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {day.placeChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200"
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

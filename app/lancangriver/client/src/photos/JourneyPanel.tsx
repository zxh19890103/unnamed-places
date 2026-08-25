import { Panel } from '@/_components';
import type { JourneyDayNode } from './types';
import { ArrowBottomRightIcon, ArrowTopLeftIcon } from '@radix-ui/react-icons';

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
    <Panel
      title="Photo timeline"
      defaultMinimized
      description="Life journey"
      minIcon={<ArrowBottomRightIcon />}
      maxIcon={<ArrowTopLeftIcon />}
    >
      {loading && (
        <p className="text-xs text-jade-text-muted" role="status">
          Loading photo locations...
        </p>
      )}

      {!loading && error && (
        <p className="text-xs text-jade-error" role="status">
          {error}
        </p>
      )}

      {!loading && !error && days.length === 0 && (
        <p className="text-xs text-jade-text-muted">No geotagged photos found</p>
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
              className={`w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river ${
                isSelected
                  ? 'border-jade-river bg-jade-river-soft'
                  : 'border-jade-border-soft bg-jade-depth/40 hover:border-jade-border hover:bg-jade-control'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium text-jade-text">
                  {day.displayLabel}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-jade-text-muted">
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
    </Panel>
  );
}

import { Panel } from '@/_components';
import type {
  JourneyBuildResult,
  JourneyChipNode,
  JourneyDayNode,
  JourneyGeoNode,
  JourneyPhotosCapacities,
  PhotoRecord,
} from './types';
import {
  ArrowBottomRightIcon,
  ArrowTopLeftIcon,
  CaretDownIcon,
  CaretRightIcon,
} from '@radix-ui/react-icons';
import { useEffect, useState } from 'react';
import { fetchGeotaggedPhotos } from './sources';
import { buildJourneyDays } from './journey';
import { BASE_URL } from '../calc/constants';

function getThumbUrl(filePath: string): string {
  return `${BASE_URL}/photos/thumb/${encodeURIComponent(filePath)}`;
}

export function JourneyPanel({ capacities }: { capacities: JourneyPhotosCapacities }) {
  const [journeyRecords, setJourneyRecords] = useState<PhotoRecord[]>([]);
  const [journeyData, setJourneyData] = useState<JourneyBuildResult>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [selectedGeoKey, setSelectedGeoKey] = useState<string | null>(null);
  const [openChips, setOpenChips] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [days, setDays] = useState<JourneyDayNode[]>([]);
  const [geoNodes, setGeoNodes] = useState<JourneyGeoNode[]>([]);
  const [chipNodes, setChipNodes] = useState<JourneyChipNode[]>([]);

  useEffect(() => {
    const handleLoadGeotaggedPhotos = async () => {
      setLoading(true);

      try {
        const mode = import.meta.env.DEV ? 'dev' : 'prod';
        const photos =
          mode === 'dev'
            ? await fetchGeotaggedPhotos({ mode: 'dev' })
            : await fetchGeotaggedPhotos({ mode: 'prod' });

        const journey = buildJourneyDays(photos);

        setJourneyRecords(journey.records);
        setJourneyData(journey);
        setDays(journey.days);
        setGeoNodes(journey.geoNodes);
        setChipNodes(journey.chipNodes);

        setError(null);
      } catch (error) {
        console.warn('Failed to load life journey photos', error);
        setError('Could not load photos');
      } finally {
        setLoading(false);
      }
    };

    handleLoadGeotaggedPhotos();
  }, []);

  const onSelectDay = async (dayKey: string) => {
    setSelectedDayKey(dayKey);

    const selectedDay = days.find((day) => day.dayKey === dayKey);
    if (!selectedDay) {
      return;
    }

    try {
      console.log(selectedDay);
      capacities.onDaySelect(selectedDay, journeyData.buckets);
    } catch (error) {
      console.warn('Failed to focus journey day', error);
      setError('Could not focus that day');
    }
  };

  const onSelectGeo = async (chipKey: string) => {
    setSelectedGeoKey(chipKey);

    const selectedGeo = geoNodes.find((geoNode) => geoNode.chipKey === chipKey);
    if (!selectedGeo) {
      return;
    }

    try {
      console.log(selectedGeo);
      capacities.onGeoSelect(selectedGeo, journeyData.geoBuckets);
    } catch (error) {
      console.warn('Failed to focus geolocation', error);
      setError('Could not focus that location');
    }
  };

  const toggleChip = (chipKey: string) => {
    setOpenChips((previous) => {
      const next = new Set(previous);
      if (next.has(chipKey)) {
        next.delete(chipKey);
      } else {
        next.add(chipKey);
      }
      return next;
    });
  };

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

      {!loading && !error && days.length === 0 && geoNodes.length === 0 && (
        <p className="text-xs text-jade-text-muted">No geotagged photos found</p>
      )}

      <div className="mt-2 min-h-0 space-y-4 overflow-y-auto pr-1">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-jade-text-muted">
            By Day
          </h3>
          <div className="space-y-2">
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
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-jade-text-muted">
            By Geolocation
          </h3>
          <div className="space-y-2">
            {geoNodes.map((geoNode) => {
              const isSelected = selectedGeoKey === geoNode.chipKey;
              const isOpen = openChips.has(geoNode.chipKey);

              return (
                <div
                  key={geoNode.chipKey}
                  className={`rounded-lg border p-3 transition-colors ${
                    isSelected
                      ? 'border-jade-river bg-jade-river-soft'
                      : 'border-jade-border-soft bg-jade-depth/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectGeo(geoNode.chipKey);
                      toggleChip(geoNode.chipKey);
                    }}
                    aria-pressed={isSelected}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-jade-text">
                      {geoNode.displayLabel}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-xs tabular-nums text-jade-text-muted">
                        {geoNode.photoCount} photos
                      </span>
                      {isOpen ? (
                        <CaretDownIcon className="shrink-0 text-jade-text-muted" />
                      ) : (
                        <CaretRightIcon className="shrink-0 text-jade-text-muted" />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-2 flex flex-wrap gap-1 border-t border-jade-border-soft pt-2">
                      {geoNode.photos.map((photo) => (
                        <img
                          key={photo.id}
                          src={getThumbUrl(photo.filePath)}
                          alt=""
                          loading="lazy"
                          className="h-16 w-16 rounded-md border border-jade-border-soft object-cover"
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Panel>
  );
}

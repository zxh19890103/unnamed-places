import { Panel } from '@/_components';
import type {
  JourneyBuildResult,
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
import { useEffect, useRef, useState } from 'react';
import { fetchGeotaggedPhotos } from './sources';
import { buildJourneyDays } from './journey';
import { BASE_URL } from '../calc/constants';

function getThumbUrl(filePath: string): string {
  return `${BASE_URL}/photos/thumb/${encodeURIComponent(filePath)}`;
}

export function JourneyPanel({
  capacities,
  byDay = true,
  byGeo = true,
}: {
  capacities: JourneyPhotosCapacities;
  byDay?: boolean;
  byGeo?: boolean;
}) {
  const [journeyData, setJourneyData] = useState<JourneyBuildResult | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [openGeoKey, setOpenGeoKey] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [days, setDays] = useState<JourneyDayNode[]>([]);
  const [geoNodes, setGeoNodes] = useState<JourneyGeoNode[]>([]);
  const [motionLinesVisible, setMotionLinesVisible] = useState(false);

  const capacitiesRef = useRef<JourneyPhotosCapacities>(null);
  capacitiesRef.current = capacities;

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

        setJourneyData(journey);
        setDays(journey.days);
        setGeoNodes(journey.geoNodes);

        capacitiesRef.current?.onLoaded(journey);

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

  const onSelectDay = (dayKey: string) => {
    if (selectedDayKey === dayKey) {
      return;
    }

    setSelectedDayKey(dayKey);
    setOpenGeoKey(null);
    setSelectedPhotoId(null);

    const selectedDay = days.find((day) => day.dayKey === dayKey);
    if (!selectedDay) {
      return;
    }

    try {
      capacitiesRef.current?.onDaySelect(selectedDay);
    } catch (error) {
      console.warn('Failed to focus journey day', error);
      setError('Could not focus that day');
    }
  };

  const onToggleGeo = (chipKey: string) => {
    const targetGeo = geoNodes.find((geoNode) => geoNode.chipKey === chipKey);
    if (!targetGeo || !journeyData) {
      return;
    }

    if (openGeoKey === chipKey) {
      setSelectedPhotoId(null);
      setOpenGeoKey(null);
      try {
        capacitiesRef.current?.onGeoClose(targetGeo);
      } catch (error) {
        console.warn('Failed to close geolocation', error);
        setError('Could not close that location');
      }
      return;
    }

    setSelectedDayKey(null);
    setSelectedPhotoId(null);
    setOpenGeoKey(chipKey);

    try {
      capacitiesRef.current?.onGeoOpen(targetGeo);
    } catch (error) {
      console.warn('Failed to open geolocation', error);
      setError('Could not open that location');
    }
  };

  const onPhotoClick = (photo: PhotoRecord, geoNode: JourneyGeoNode) => {
    setSelectedPhotoId(photo.id);
    try {
      capacitiesRef.current?.onPhotoSelect(photo, geoNode);
    } catch (error) {
      console.warn('Failed to select photo', error);
      setError('Could not select that photo');
    }
  };

  const onToggleMotions = () => {
    setMotionLinesVisible((previous) => !previous);

    if (!journeyData) {
      return;
    }

    try {
      capacitiesRef.current?.onMotionsToggle?.(!motionLinesVisible, journeyData);
    } catch (error) {
      console.warn('Failed to toggle motion lines', error);
      setError('Could not toggle motion lines');
    }
  };

  const finalSelectedGeoNodeKey = capacities.geoNode?.chipKey ?? openGeoKey;
  const finalSelectedPhotoID = capacities.photo?.id ?? selectedPhotoId;

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

      {!loading && !error && journeyData && (
        <button
          type="button"
          onClick={onToggleMotions}
          aria-pressed={motionLinesVisible}
          className={`mb-2 w-full rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river ${
            motionLinesVisible
              ? 'border-jade-river bg-jade-river-soft text-jade-text'
              : 'border-jade-border-soft bg-jade-control text-jade-text hover:border-jade-border hover:bg-jade-control'
          }`}
        >
          {motionLinesVisible ? 'Hide motions' : 'Motions'}
        </button>
      )}

      <div className="mt-2 min-h-0 space-y-4 overflow-y-auto pr-1">
        {byDay && (
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
        )}

        {byGeo && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-jade-text-muted">
              By Geolocation
            </h3>
            <div className="space-y-2">
              {geoNodes.map((geoNode) => {
                const isOpen = finalSelectedGeoNodeKey === geoNode.chipKey;

                return (
                  <div
                    key={geoNode.chipKey}
                    className={`rounded-lg border p-3 transition-colors  bg-jade-depth/40 ${
                      isOpen ? 'border-jade-river' : 'border-jade-border-soft'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleGeo(geoNode.chipKey)}
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
                      <div className="flex flex-col gap-2">
                        {geoNode.bydate.map((g) => {
                          return (
                            <div key={g.key} className="">
                              <div className=" ">
                                <h3 className=" text-lg font-semibold">{g.key}</h3>
                              </div>
                              <div className=" flex flex-wrap gap-1 ">
                                {g.photos.map((photo) => {
                                  const isSelected = finalSelectedPhotoID === photo.id;

                                  return (
                                    <button
                                      key={photo.id}
                                      type="button"
                                      onClick={() => onPhotoClick(photo, geoNode)}
                                      aria-pressed={isSelected}
                                      className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river ${
                                        isSelected ? 'border-jade-river' : 'border-jade-border-soft'
                                      }`}
                                    >
                                      <img
                                        src={getThumbUrl(photo.filePath)}
                                        alt=""
                                        loading="lazy"
                                        className="h-full w-full object-cover"
                                      />
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </Panel>
  );
}

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertProvider } from '../_components';
import { Tile12OsmLink } from '../_partials';
import { LeafletBBoxMap } from './map.js';
import { readBBoxFromSearch, readLatLngFromSearch, type BBox } from './bbox.js';
import { coverageTilesForBBox, type TileKey } from './tiles.js';
import {
  enqueueCoverageJob,
  enqueueCoverageJobHighways,
  enqueueCoverageJobNaturalWater,
  enqueueCoverageJobPlaces,
  enqueueCoverageJobWaters,
  fetchCoverageStatus,
  fetchCoverageStatusHighways,
  fetchCoverageStatusNaturalWater,
  fetchCoverageStatusPlaces,
  fetchCoverageStatusWaters,
  type CoverageStatusResponse,
} from '../jobs/api.js';
import clsx from 'clsx';

const COVERAGE_ZOOM = 12;

export default function App() {
  const bbox = useMemo(() => readBBoxFromSearch(window.location.search), []);
  const latlng = useMemo(() => readLatLngFromSearch(window.location.search), []);
  const [visibleBounds, setVisibleBounds] = useState<BBox>(bbox);
  const [focusTile, setFocusTile] = useState<string | null>(null);
  const [manualTiles, setManualTiles] = useState<TileKey[]>([]);

  const tiles = useMemo(() => coverageTilesForBBox(visibleBounds, COVERAGE_ZOOM), [visibleBounds]);

  const combinedTiles = useMemo(() => {
    const manualTileKeys = manualTiles.map((tile) => tile.id);

    return [
      ...tiles
        .map((tile) => ({ ...tile, isManual: false }))
        .filter((tile) => !manualTileKeys.includes(tile.id)),
      ...manualTiles.map((tile) => ({ ...tile, isManual: true })),
    ];
  }, [manualTiles, tiles]);

  const handleAddManualTile = (tile: TileKey) => {
    setManualTiles((current) => {
      if (current.some((entry) => entry.id === tile.id)) {
        return current;
      }
      return [...current, tile];
    });
    setFocusTile(tile.id);
  };

  const handleRemoveManualTile = (tileId: string) => {
    setManualTiles((current) => current.filter((tile) => tile.id !== tileId));
  };

  return (
    <AlertProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-jade-foundation text-jade-text font-[SUSEMono] lg:flex-row">
        <main className="min-h-0 min-w-0 flex-1">
          <LeafletBBoxMap
            focusTile={focusTile}
            bbox={bbox}
            latlng={latlng}
            manualTiles={manualTiles}
            onBoundsChange={setVisibleBounds}
            onTileAdd={handleAddManualTile}
          />
        </main>

        <aside className="z-999 flex h-[43vh] w-full shrink-0 flex-col border-t border-jade-border bg-jade-panel/95 backdrop-blur-md lg:h-full lg:w-96 lg:border-t-0 lg:border-l">
          <header className="border-b border-jade-border-soft px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase text-jade-river">
                  Coverage workspace
                </p>
                <h1 className="mt-1 text-sm font-semibold tracking-wide text-jade-text">
                  Zoom {COVERAGE_ZOOM} Coverage
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-jade-border-soft bg-jade-control px-2 py-1 font-[SUSEMono] text-[10px] tabular-nums text-jade-text-muted">
                  {combinedTiles.length} tiles
                </span>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-jade-text-muted">
              {tiles.length === 0
                ? 'Visible map exceeds 30km, zoom in to list tiles'
                : 'Click the map to add manual zoom-12 tiles to this list.'}
            </p>
          </header>
          <TileList
            tiles={combinedTiles}
            focusTile={focusTile}
            onTileClick={setFocusTile}
            onRemoveManualTile={handleRemoveManualTile}
          />
        </aside>
      </div>
    </AlertProvider>
  );
}

function FocusTileIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
    </svg>
  );
}

function BuildingsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 20V7.5L12 4l8 3.5V20" />
      <path d="M8 20v-6h8v6M8 9h2M14 9h2M8 12h2M14 12h2" />
    </svg>
  );
}

function HighwaysIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 18h16M6 18V8M12 18V5M18 18v-9" />
      <path d="M8 7l2 2 2-2 2 2" />
    </svg>
  );
}

function WaterIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 16c1.5-2 3.5-3 5.5-3 2.5 0 4.5 1.5 6.5 3.5 1.5 1.5 2.5 3.5 2.5 5.5H3c0-2 1-4 2-5Z" />
      <path d="M7 11c1.5-1.5 3-2.5 5-2.5s3.5 1 5 2.5" />
    </svg>
  );
}

function PlacesIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 20s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
      <circle cx="12" cy="10" r="2.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NaturalWaterIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 15c2-2 3.5-3 6-3 2.5 0 4 1.5 6 3 1.5 1.2 2.5 2.5 4 4" />
      <path d="M4 11c1.5-1.5 2.5-2.5 4-2.5 1.5 0 2.5 1 4 2.5 1.5 1.5 2.5 2.5 4 2.5 1.5 0 3-.8 4-2" />
      <path d="M4 19c1.5-1.3 2.8-2 4.5-2 2 0 3.5 1.2 5.5 2.2S18.5 20 20 20" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 7h16M9 7V4h6v3M7 7l1 12h8l1-12" />
    </svg>
  );
}

type TileActionStatus = 'idle' | 'queuing' | 'queued' | 'error';

type TileActionKind = 'buildings' | 'highways' | 'waters' | 'places' | 'natural_water';

function TileActionButton({
  kind,
  status,
  onClick,
  disabled,
  className,
  ariaLabel,
}: {
  kind: TileActionKind;
  status: TileActionStatus;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel: string;
}) {
  const iconByKind = {
    buildings: BuildingsIcon,
    highways: HighwaysIcon,
    waters: WaterIcon,
    places: PlacesIcon,
    natural_water: NaturalWaterIcon,
  } satisfies Record<TileActionKind, (args: { className?: string }) => React.ReactNode>;

  const Icon = iconByKind[kind];

  const content =
    status === 'queuing' ? (
      '…'
    ) : status === 'queued' ? (
      '✓'
    ) : status === 'error' ? (
      '↻'
    ) : (
      <Icon className="h-4 w-4" />
    );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={clsx(
        'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-2xl border transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {typeof content === 'string' ? <span className="text-sm">{content}</span> : content}
    </button>
  );
}

const TileList = ({
  tiles,
  focusTile,
  onTileClick,
  onRemoveManualTile,
}: {
  tiles: Array<TileKey & { isManual?: boolean }>;
  focusTile: string | null;
  onTileClick: (tileId: string) => void;
  onRemoveManualTile?: (tileId: string) => void;
}) => {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleClick = (event: PointerEvent) => {
      // if it is the button of itemtype = `where?`, trigger
      const target = event.target as HTMLElement;
      const button = target.closest('button[itemtype="tile/where"]');

      if (button) {
        const id = button.getAttribute('itemid');
        if (id) onTileClick(id);
      }
    };

    element.addEventListener('click', handleClick);
    return () => element.removeEventListener('click', handleClick);
  }, [onTileClick]);

  return (
    <div ref={elementRef} className="min-h-0 flex-1 overflow-y-auto">
      <ul className="flex flex-col gap-2 px-3 py-3">
        {tiles.map((tile) => (
          <TileListItem
            focused={focusTile === tile.id}
            key={tile.id}
            tile={tile}
            isManualTile={tile.isManual}
            onRemove={() => onRemoveManualTile?.(tile.id)}
          />
        ))}
      </ul>
    </div>
  );
};

const TileListItem = memo(
  ({
    focused,
    tile,
    isManualTile,
    onRemove,
  }: {
    focused: boolean;
    tile: TileKey & { isManual?: boolean };
    isManualTile?: boolean;
    onRemove?: () => void;
  }) => {
    const [downloadStatus, setDownloadStatus] = useState<'idle' | 'queuing' | 'queued' | 'error'>(
      'idle',
    );
    const [highwayDownloadStatus, setHighwayDownloadStatus] = useState<
      'idle' | 'queuing' | 'queued' | 'error'
    >('idle');
    const [waterDownloadStatus, setWaterDownloadStatus] = useState<
      'idle' | 'queuing' | 'queued' | 'error'
    >('idle');
    const [placeDownloadStatus, setPlaceDownloadStatus] = useState<
      'idle' | 'queuing' | 'queued' | 'error'
    >('idle');
    const [naturalWaterDownloadStatus, setNaturalWaterDownloadStatus] = useState<
      'idle' | 'queuing' | 'queued' | 'error'
    >('idle');

    const showCoverageStatusModal = (
      kind: 'buildings' | 'highways' | 'waters' | 'places' | 'natural_water',
      result: CoverageStatusResponse,
    ) => {
      const label =
        kind === 'buildings'
          ? 'Buildings'
          : kind === 'highways'
            ? 'Highways'
            : kind === 'waters'
              ? 'Waterways'
              : kind === 'places'
                ? 'Places'
                : 'Natural Water';

      const statusText = result.status ?? 'no job queued yet';
      const loadedText = result.loaded
        ? 'yes, data is loaded in the database'
        : 'no, not loaded yet';

      Alert.create({
        title: label,
        description: `tile ${tile.z}/${tile.x}/${tile.y}`,
        actionLabel: 'Close',
        cancelLabel: 'Dismiss',
        children: (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-jade-control/70 px-3 py-2">
              <span className="text-jade-text-muted">Job status</span>
              <span className="font-medium text-jade-text">{statusText}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-jade-control/70 px-3 py-2">
              <span className="text-jade-text-muted">Data loaded</span>
              <span className="font-medium text-jade-text">{loadedText}</span>
            </div>
          </div>
        ),
      });
    };

    const handleDownloadOsm = async () => {
      setDownloadStatus('queuing');
      try {
        const existingStatus = await fetchCoverageStatus(tile.x, tile.y);
        if (existingStatus.status !== null || existingStatus.loaded) {
          setDownloadStatus('queued');
          showCoverageStatusModal('buildings', existingStatus);
          return;
        }

        await enqueueCoverageJob(tile.x, tile.y);
        const refreshedStatus = await fetchCoverageStatus(tile.x, tile.y);
        setDownloadStatus('queued');
        showCoverageStatusModal('buildings', refreshedStatus);
      } catch (error) {
        console.warn('Failed to enqueue or check OSM coverage job', tile, error);
        setDownloadStatus('error');
      }
    };

    const handleDownloadHighwayOsm = async () => {
      setHighwayDownloadStatus('queuing');
      try {
        const existingStatus = await fetchCoverageStatusHighways(tile.x, tile.y);
        if (existingStatus.status !== null || existingStatus.loaded) {
          setHighwayDownloadStatus('queued');
          showCoverageStatusModal('highways', existingStatus);
          return;
        }

        await enqueueCoverageJobHighways(tile.x, tile.y);
        const refreshedStatus = await fetchCoverageStatusHighways(tile.x, tile.y);
        setHighwayDownloadStatus('queued');
        showCoverageStatusModal('highways', refreshedStatus);
      } catch (error) {
        console.warn('Failed to enqueue or check highway OSM coverage job', tile, error);
        setHighwayDownloadStatus('error');
      }
    };

    const handleDownloadWaterOsm = async () => {
      setWaterDownloadStatus('queuing');
      try {
        const existingStatus = await fetchCoverageStatusWaters(tile.x, tile.y);
        if (existingStatus.status !== null || existingStatus.loaded) {
          setWaterDownloadStatus('queued');
          showCoverageStatusModal('waters', existingStatus);
          return;
        }

        await enqueueCoverageJobWaters(tile.x, tile.y);
        const refreshedStatus = await fetchCoverageStatusWaters(tile.x, tile.y);
        setWaterDownloadStatus('queued');
        showCoverageStatusModal('waters', refreshedStatus);
      } catch (error) {
        console.warn('Failed to enqueue or check water OSM coverage job', tile, error);
        setWaterDownloadStatus('error');
      }
    };

    const handleDownloadPlaceOsm = async () => {
      setPlaceDownloadStatus('queuing');
      try {
        const existingStatus = await fetchCoverageStatusPlaces(tile.x, tile.y);
        if (existingStatus.status !== null || existingStatus.loaded) {
          setPlaceDownloadStatus('queued');
          showCoverageStatusModal('places', existingStatus);
          return;
        }

        await enqueueCoverageJobPlaces(tile.x, tile.y);
        const refreshedStatus = await fetchCoverageStatusPlaces(tile.x, tile.y);
        setPlaceDownloadStatus('queued');
        showCoverageStatusModal('places', refreshedStatus);
      } catch (error) {
        console.warn('Failed to enqueue or check place OSM coverage job', tile, error);
        setPlaceDownloadStatus('error');
      }
    };

    const handleDownloadNaturalWaterOsm = async () => {
      setNaturalWaterDownloadStatus('queuing');
      try {
        const existingStatus = await fetchCoverageStatusNaturalWater(tile.x, tile.y);
        if (existingStatus.status !== null || existingStatus.loaded) {
          setNaturalWaterDownloadStatus('queued');
          showCoverageStatusModal('natural_water', existingStatus);
          return;
        }

        await enqueueCoverageJobNaturalWater(tile.x, tile.y);
        const refreshedStatus = await fetchCoverageStatusNaturalWater(tile.x, tile.y);
        setNaturalWaterDownloadStatus('queued');
        showCoverageStatusModal('natural_water', refreshedStatus);
      } catch (error) {
        console.warn('Failed to enqueue or check natural water OSM coverage job', tile, error);
        setNaturalWaterDownloadStatus('error');
      }
    };

    return (
      <li
        key={`${tile.z}/${tile.x}/${tile.y}`}
        className={
          'rounded-xl border bg-jade-panel/90 p-3 text-xs transition-colors hover:bg-jade-control' +
          (focused ? ' border-jade-river ring-1 ring-jade-river/30' : ' border-jade-border-soft')
        }
      >
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Tile12OsmLink
              tileKey={tile.id}
              className="text-sm font-semibold text-jade-text hover:text-jade-river hover:underline"
            >
              {tile.z}/{tile.x}/{tile.y}
            </Tile12OsmLink>
            {isManualTile ? (
              <span className="rounded-md border border-jade-sky/40 bg-jade-sky-soft px-2 py-0.5 text-[10px] uppercase text-jade-sky">
                manual
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              className={
                'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-2xl border px-1.5 transition-colors' +
                (focused
                  ? ' border-jade-river bg-jade-river-soft text-jade-text'
                  : ' border-jade-border-soft bg-jade-control text-jade-text-muted hover:bg-jade-control-hover')
              }
              itemID={tile.id}
              itemType="tile/where"
              aria-label={`Focus tile ${tile.z}/${tile.x}/${tile.y}`}
            >
              <FocusTileIcon className="h-4 w-4" />
            </button>
            <TileActionButton
              kind="buildings"
              status={downloadStatus}
              onClick={() => void handleDownloadOsm()}
              disabled={downloadStatus === 'queuing'}
              ariaLabel={`Download buildings for tile ${tile.z}/${tile.x}/${tile.y}`}
              className="border-jade-success/25 bg-jade-success/10 text-jade-success hover:bg-jade-success/20"
            />
            <TileActionButton
              kind="highways"
              status={highwayDownloadStatus}
              onClick={() => void handleDownloadHighwayOsm()}
              disabled={highwayDownloadStatus === 'queuing'}
              ariaLabel={`Download highways for tile ${tile.z}/${tile.x}/${tile.y}`}
              className="border-jade-sky/25 bg-jade-sky-soft text-jade-sky hover:bg-jade-sky/10"
            />
            <TileActionButton
              kind="waters"
              status={waterDownloadStatus}
              onClick={() => void handleDownloadWaterOsm()}
              disabled={waterDownloadStatus === 'queuing'}
              ariaLabel={`Download waterways for tile ${tile.z}/${tile.x}/${tile.y}`}
              className="border-cyan-500/25 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
            />
            <TileActionButton
              kind="places"
              status={placeDownloadStatus}
              onClick={() => void handleDownloadPlaceOsm()}
              disabled={placeDownloadStatus === 'queuing'}
              ariaLabel={`Download places for tile ${tile.z}/${tile.x}/${tile.y}`}
              className="border-amber-500/25 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
            />
            <TileActionButton
              kind="natural_water"
              status={naturalWaterDownloadStatus}
              onClick={() => void handleDownloadNaturalWaterOsm()}
              disabled={naturalWaterDownloadStatus === 'queuing'}
              ariaLabel={`Download natural water for tile ${tile.z}/${tile.x}/${tile.y}`}
              className="border-cyan-500/25 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
            />
            {isManualTile ? (
              <button
                onClick={() => onRemove?.()}
                aria-label={`Remove tile ${tile.z}/${tile.x}/${tile.y}`}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-2xl border transition-colors disabled:cursor-not-allowed disabled:opacity-60 border-jade-error/25 bg-jade-error/10 text-jade-error hover:bg-jade-error/20"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </li>
    );
  },
);

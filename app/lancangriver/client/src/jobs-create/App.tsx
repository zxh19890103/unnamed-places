import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertProvider, Button } from '../_components';
import { Tile12OsmLink } from '../_partials';
import { LeafletBBoxMap } from './map.js';
import { readBBoxFromSearch, readLatLngFromSearch, type BBox } from './bbox.js';
import { coverageTilesForBBox, type TileKey } from './tiles.js';
import {
  enqueueCoverageJob,
  enqueueCoverageJobHighways,
  fetchCoverageStatus,
  fetchCoverageStatusHighways,
} from '../jobs/api.js';

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

    const handleDownloadOsm = async () => {
      setDownloadStatus('queuing');
      try {
        await enqueueCoverageJob(tile.x, tile.y);
        setDownloadStatus('queued');
      } catch (error) {
        console.warn('Failed to enqueue OSM coverage job', tile, error);
        setDownloadStatus('error');
      }
    };

    const handleDownloadHighwayOsm = async () => {
      setHighwayDownloadStatus('queuing');
      try {
        await enqueueCoverageJobHighways(tile.x, tile.y);
        setHighwayDownloadStatus('queued');
      } catch (error) {
        console.warn('Failed to enqueue highway OSM coverage job', tile, error);
        setHighwayDownloadStatus('error');
      }
    };

    const handleCheckStatus = async (kind: 'buildings' | 'highways') => {
      const label = kind === 'buildings' ? 'Buildings & waters' : 'Highways';

      try {
        const result =
          kind === 'buildings'
            ? await fetchCoverageStatus(tile.x, tile.y)
            : await fetchCoverageStatusHighways(tile.x, tile.y);

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
      } catch (error) {
        console.warn(`Failed to check ${kind} coverage status`, tile, error);
        Alert.create({
          title: label,
          description: `tile ${tile.z}/${tile.x}/${tile.y}`,
          actionLabel: 'Close',
          cancelLabel: 'Dismiss',
          actionVariant: 'destructive',
          children: (
            <p className="rounded-lg border border-jade-error/40 bg-jade-error/10 px-3 py-2 text-sm text-jade-error">
              Could not check status. See console for details.
            </p>
          ),
        });
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
            {isManualTile ? (
              <Button
                onClick={onRemove}
                variant="destructive"
                size="sm"
                className="min-h-8 px-2.5 py-1 text-[11px]"
              >
                remove
              </Button>
            ) : null}
            <button
              className={
                'cursor-pointer rounded-lg border px-2.5 py-1 font-medium transition-colors' +
                (focused
                  ? ' border-jade-river bg-jade-river-soft text-jade-text'
                  : ' border-jade-border-soft bg-jade-control text-jade-text-muted hover:bg-jade-control-hover')
              }
              itemID={tile.id}
              itemType="tile/where"
            >
              where?
            </button>
            <button
              onClick={() => void handleDownloadOsm()}
              disabled={downloadStatus === 'queuing'}
              className="cursor-pointer rounded-lg border border-jade-success/25 bg-jade-success/10 px-2.5 py-1 font-medium text-jade-success transition-colors hover:bg-jade-success/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloadStatus === 'queuing'
                ? 'queuing...'
                : downloadStatus === 'queued'
                  ? 'queued'
                  : downloadStatus === 'error'
                    ? 'retry download osm'
                    : 'down load osm'}
            </button>
            <button
              onClick={() => void handleDownloadHighwayOsm()}
              disabled={highwayDownloadStatus === 'queuing'}
              className="cursor-pointer rounded-lg border border-jade-sky/25 bg-jade-sky-soft px-2.5 py-1 font-medium text-jade-sky transition-colors hover:bg-jade-sky/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {highwayDownloadStatus === 'queuing'
                ? 'queuing...'
                : highwayDownloadStatus === 'queued'
                  ? 'queued'
                  : highwayDownloadStatus === 'error'
                    ? 'retry download highway osm'
                    : 'down load highway osm'}
            </button>
            <button
              onClick={() => void handleCheckStatus('buildings')}
              className="cursor-pointer rounded-lg border border-jade-border-soft px-2.5 py-1 font-medium text-jade-text-muted transition-colors hover:bg-jade-control hover:text-jade-text"
            >
              buildings & waters?
            </button>
            <button
              onClick={() => void handleCheckStatus('highways')}
              className="cursor-pointer rounded-lg border border-jade-border-soft px-2.5 py-1 font-medium text-jade-text-muted transition-colors hover:bg-jade-control hover:text-jade-text"
            >
              highways?
            </button>
          </div>
        </div>
      </li>
    );
  },
);

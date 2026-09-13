import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CameraIcon,
  CheckIcon,
  Cross2Icon,
  DrawingPinIcon,
  EnterFullScreenIcon,
  MinusIcon,
  PauseIcon,
  PlusIcon,
  ReloadIcon,
  TrashIcon,
} from '@radix-ui/react-icons';

import { Tooltip } from '../_components';

type MaterialMode = 'Satellite' | 'Elevation' | 'Clean' | 'Debug' | 'Watercolor';
type JourneyState = 'ready' | 'loading' | 'empty' | 'error';
type PageView = 'dom' | 'map';

const panelClass =
  'rounded-xl border border-jade-border bg-jade-panel/95 text-jade-text shadow-[0_8px_24px_rgba(24,42,54,0.12)] backdrop-blur-md';
const controlClass =
  'min-h-10 rounded-lg border border-jade-border-soft bg-jade-control px-3 py-2 text-sm font-medium text-jade-text transition-colors hover:border-jade-border hover:bg-jade-control-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river disabled:cursor-not-allowed disabled:text-jade-text-muted disabled:opacity-45';
const primaryRiverClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-jade-river bg-jade-river px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-jade-sky focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river';
const primarySkyClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-jade-sky bg-jade-sky px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-sky';
const iconButtonClass =
  'grid size-11 shrink-0 place-items-center rounded-lg border border-jade-border-soft bg-jade-control text-jade-text-muted transition-colors hover:border-jade-border hover:bg-jade-control-hover hover:text-jade-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river';
const labelClass = 'text-[10px] font-semibold text-jade-river uppercase';

const journeys = [
  {
    key: '2026-08-18',
    label: '18 Aug 2026',
    count: 14,
    places: ['Dali', 'Nujiang'],
  },
  {
    key: '2026-08-12',
    label: '12 Aug 2026',
    count: 8,
    places: ['Deqin', 'Mekong bend'],
  },
  {
    key: '2026-07-29',
    label: '29 Jul 2026',
    count: 21,
    places: ['Jinghong', 'River market'],
  },
];

const iframeDocument = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}body{margin:0;overflow:hidden;background:#dce8f0;color:#182a36;font:12px system-ui,sans-serif}
.map{position:absolute;inset:0;background:linear-gradient(145deg,#dce8f0,#bcd5df)}
.map:before{content:"";position:absolute;inset:-20%;background:repeating-radial-gradient(ellipse at 25% 70%,transparent 0 28px,#789c8d 30px 32px,transparent 34px 58px);opacity:.38;transform:rotate(-12deg)}
.river{position:absolute;left:46%;top:-15%;width:16%;height:140%;border-radius:50%;background:#55b8cc;transform:rotate(18deg);box-shadow:0 0 0 7px #078ea524}
.pin{position:absolute;left:52%;top:47%;width:18px;height:18px;border:4px solid #fff;border-radius:50%;background:#078ea5;box-shadow:0 3px 12px #182a3640}
.status{position:absolute;left:10px;bottom:10px;padding:7px 9px;border:1px solid #8ea7b7;border-radius:7px;background:#f8fbfddd;letter-spacing:0}
</style></head><body><div class="map"><div class="river"></div><div class="pin"></div><div class="status">24.8801 N, 100.0891 E</div></div></body></html>`;

function IconTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip label={label} side="top" sideOffset={8}>
      {children as React.ReactElement}
    </Tooltip>
  );
}

function ButtonSystem() {
  const [paused, setPaused] = useState(false);

  return (
    <div className="grid gap-5 rounded-xl border border-jade-border bg-jade-panel p-4 lg:grid-cols-[1fr_auto]">
      <div>
        <p className={labelClass}>Command buttons</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={primaryRiverClass}>
            <DrawingPinIcon className="size-4" aria-hidden="true" />
            Use center
          </button>
          <button type="button" className={controlClass}>
            Cancel
          </button>
          <button
            type="button"
            aria-busy="true"
            className={`${controlClass} inline-flex items-center gap-2`}
          >
            <ReloadIcon className="size-4 animate-spin" aria-hidden="true" />
            Loading map
          </button>
          <button type="button" disabled className={controlClass}>
            Unavailable
          </button>
          <button
            type="button"
            className="min-h-10 rounded-lg border border-jade-error bg-jade-error px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-error"
          >
            <TrashIcon className="size-4" aria-hidden="true" />
            Delete job
          </button>
        </div>
      </div>

      <div>
        <p className={labelClass}>Icon toolbar</p>
        <div className="mt-3 flex gap-2" role="toolbar" aria-label="Map actions">
          <IconTooltip label={paused ? 'Resume updates' : 'Pause updates'}>
            <button
              type="button"
              aria-label={paused ? 'Resume updates' : 'Pause updates'}
              aria-pressed={paused}
              onClick={() => setPaused((value) => !value)}
              className={`${iconButtonClass} ${
                paused ? 'border-jade-river bg-jade-river-soft text-jade-text' : ''
              }`}
            >
              {paused ? (
                <CheckIcon className="size-5" aria-hidden="true" />
              ) : (
                <PauseIcon className="size-5" aria-hidden="true" />
              )}
            </button>
          </IconTooltip>
          <IconTooltip label="Photo locations">
            <button
              type="button"
              aria-label="Photo locations"
              className={`${iconButtonClass} text-jade-lotus`}
            >
              <CameraIcon className="size-5" aria-hidden="true" />
            </button>
          </IconTooltip>
          <IconTooltip label="Close toolbar">
            <button type="button" aria-label="Close toolbar" className={iconButtonClass}>
              <Cross2Icon className="size-5" aria-hidden="true" />
            </button>
          </IconTooltip>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-5 border-t border-jade-border-soft py-8">
      <header className="mb-5 max-w-3xl">
        <p className={labelClass}>{eyebrow}</p>
        <h2 className="mt-2 text-xl font-semibold text-jade-text">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-jade-text-muted">{description}</p>
      </header>
      {children}
    </section>
  );
}

function Stage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`map-stage relative min-h-150 overflow-hidden rounded-xl border border-jade-border ${className}`}
    >
      <div className="map-river" aria-hidden="true" />
      <div className="map-contours" aria-hidden="true" />
      {children}
      <div className="absolute right-3 bottom-2 text-[10px] text-[#bed1ca]">
        Schematic terrain / offline
      </div>
    </div>
  );
}

function MaterialModes({
  selected,
  onSelect,
}: {
  selected: MaterialMode;
  onSelect: (mode: MaterialMode) => void;
}) {
  const modes: Array<{ name: MaterialMode; symbol: string }> = [
    { name: 'Satellite', symbol: 'SAT' },
    { name: 'Elevation', symbol: 'DEM' },
    { name: 'Clean', symbol: 'CLR' },
    { name: 'Debug', symbol: 'DBG' },
    { name: 'Watercolor', symbol: 'INK' },
  ];

  return (
    <div
      className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto p-1"
      aria-label="Terrain material"
      role="group"
    >
      {modes.map((mode) => {
        const active = selected === mode.name;
        return (
          <button
            key={mode.name}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(mode.name)}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river ${
              active
                ? 'border-jade-river bg-jade-river-soft text-jade-text'
                : 'border-jade-border-soft bg-jade-panel/95 text-jade-text-muted hover:border-jade-border hover:bg-jade-control-hover'
            }`}
          >
            <span className="text-[9px] font-bold" aria-hidden="true">
              {mode.symbol}
            </span>
            {mode.name}
          </button>
        );
      })}
    </div>
  );
}

function OpsPanel() {
  const [updatesPaused, setUpdatesPaused] = useState(false);
  return (
    <aside className={`${panelClass} w-[min(280px,calc(100vw-3rem))] p-3`}>
      <div className="mb-2 border-b border-jade-border-soft pb-2">
        <p className={labelClass}>Map workspace</p>
        <h3 className="mt-0.5 text-sm font-semibold">Scene controls</h3>
      </div>
      <div className="grid gap-1.5">
        <button
          type="button"
          aria-pressed={updatesPaused}
          onClick={() => setUpdatesPaused((paused) => !paused)}
          className={`${controlClass} text-left`}
        >
          {updatesPaused ? 'Resume tile updates' : 'Pause tile updates'}
        </button>
        <button type="button" className={`${controlClass} text-left`}>
          Open flat map
        </button>
        <button type="button" className={`${controlClass} text-left`}>
          Switch to top-down view
        </button>
        <button type="button" className={`${controlClass} text-left`}>
          Load photo locations
        </button>
        <button type="button" disabled className={`${controlClass} text-left`}>
          Elevation unavailable at this zoom
        </button>
      </div>
    </aside>
  );
}

function SceneMonitor() {
  const [collapsed, setCollapsed] = useState(false);
  const metrics = [
    ['Camera distance', '18,420 m'],
    ['Zoom level', '12.7'],
    ['Visible tiles', '46'],
    ['Control mode', 'Orbit'],
    ['Asset loading', '3 pending'],
    ['Frame p95', '18.2 ms'],
  ];

  return (
    <aside className={`${panelClass} w-60 p-3`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={labelClass}>Live diagnostics</p>
          <h3 className="mt-0.5 text-sm font-semibold">Scene monitor</h3>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          className={`${controlClass} px-2 text-xs`}
        >
          {collapsed ? 'Expand' : 'Hide'}
        </button>
      </div>
      {!collapsed && (
        <dl className="mt-3 grid grid-cols-2 gap-1.5">
          {metrics.map(([label, value]) => (
            <div
              key={label}
              className="min-w-0 rounded-lg border border-jade-border-soft bg-jade-depth/45 p-2"
            >
              <dt className="truncate text-[9px] text-jade-text-muted uppercase">{label}</dt>
              <dd className="mt-1 truncate text-xs font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}

function JourneyPanel() {
  const [state, setState] = useState<JourneyState>('ready');
  const [selected, setSelected] = useState(journeys[0].key);

  return (
    <aside className={`${panelClass} flex max-h-112 w-[min(320px,calc(100vw-3rem))] flex-col p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={labelClass}>Photo timeline</p>
          <h3 className="mt-0.5 text-sm font-semibold">Life journey</h3>
        </div>
        <select
          aria-label="Journey panel state"
          value={state}
          onChange={(event) => setState(event.target.value as JourneyState)}
          className="min-h-9 rounded-lg border border-jade-border-soft bg-jade-control px-2 text-xs text-jade-text"
        >
          <option value="ready">Ready</option>
          <option value="loading">Loading</option>
          <option value="empty">Empty</option>
          <option value="error">Error</option>
        </select>
      </div>
      <div className="mt-3 min-h-18 overflow-y-auto" aria-live="polite">
        {state === 'loading' && (
          <p className="text-xs text-jade-text-muted">Loading photo locations...</p>
        )}
        {state === 'empty' && (
          <p className="text-xs text-jade-text-muted">No geotagged photos in this area.</p>
        )}
        {state === 'error' && (
          <p className="text-xs text-jade-error">Photo locations could not be loaded. Try again.</p>
        )}
        {state === 'ready' && (
          <div className="grid gap-2">
            {journeys.map((day) => {
              const active = day.key === selected;
              return (
                <button
                  key={day.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(day.key)}
                  className={`rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river ${
                    active
                      ? 'border-jade-river bg-jade-river-soft'
                      : 'border-jade-border-soft bg-jade-depth/35 hover:border-jade-border hover:bg-jade-control-hover'
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{day.label}</span>
                    <span className="shrink-0 text-xs tabular-nums text-jade-text-muted">
                      {day.count} photos
                    </span>
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1">
                    {day.places.map((place) => (
                      <span
                        key={place}
                        className="rounded-md bg-jade-lotus-soft px-2 py-0.5 text-[10px] text-jade-lotus"
                      >
                        {place}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

function MapWorkspace() {
  const [material, setMaterial] = useState<MaterialMode>('Satellite');

  return (
    <Stage className="min-h-190">
      <div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex justify-center">
        <MaterialModes selected={material} onSelect={setMaterial} />
      </div>
      <div className="workspace-journey absolute top-20 left-3 z-10">
        <JourneyPanel />
      </div>
      <div className="workspace-ops absolute top-20 right-3 z-10">
        <OpsPanel />
      </div>
      <div className="workspace-stats absolute bottom-3 left-3 z-10">
        <SceneMonitor />
      </div>
    </Stage>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: 'ready' | 'pending' | 'error';
  children: ReactNode;
}) {
  const toneClass =
    tone === 'ready'
      ? 'text-jade-success'
      : tone === 'pending'
        ? 'text-jade-silt'
        : 'text-jade-error';
  return <span className={`text-xs font-medium ${toneClass}`}>{children}</span>;
}

function DomPage() {
  const rows = [
    ['12/3456/1523', '46 features', 'ready'],
    ['12/3457/1523', 'Requesting', 'pending'],
    ['12/3458/1523', 'Retry available', 'error'],
  ] as const;

  return (
    <div className="min-h-120 bg-jade-depth p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-jade-border-soft pb-4">
          <div>
            <p className={labelClass}>Vector coverage</p>
            <h3 className="mt-1 text-lg font-semibold">Loaded map tiles</h3>
          </div>
          <button type="button" className={primarySkyClass}>
            <PlusIcon className="size-4" aria-hidden="true" />
            Create tile job
          </button>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-jade-border">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-jade-panel-raised text-jade-text-muted">
              <tr>
                {['Tile', 'Coverage', 'Status'].map((head) => (
                  <th key={head} className="px-4 py-3 font-medium">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([tile, coverage, status]) => (
                <tr key={tile} className="border-t border-jade-border-soft bg-jade-panel">
                  <td className="px-4 py-3 font-medium tabular-nums">{tile}</td>
                  <td className="px-4 py-3 text-jade-text-muted">{coverage}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={status}>
                      {status === 'ready'
                        ? 'Ready'
                        : status === 'pending'
                          ? 'Pending'
                          : 'Needs attention'}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LeafletPage() {
  return (
    <div className="leaflet-stage relative min-h-120 overflow-hidden">
      <div className="map-river" aria-hidden="true" />
      <div className="map-contours" aria-hidden="true" />
      <div
        className="absolute top-3 left-3 grid gap-2"
        aria-label="Map zoom controls"
        role="toolbar"
      >
        <IconTooltip label="Zoom in">
          <button type="button" aria-label="Zoom in" className={iconButtonClass}>
            <PlusIcon className="size-5" aria-hidden="true" />
          </button>
        </IconTooltip>
        <IconTooltip label="Zoom out">
          <button type="button" aria-label="Zoom out" className={iconButtonClass}>
            <MinusIcon className="size-5" aria-hidden="true" />
          </button>
        </IconTooltip>
      </div>
      <div className="map-pin absolute top-[43%] left-[52%]" aria-label="Selected map center" />
      <aside
        className={`${panelClass} absolute right-3 bottom-8 w-[min(280px,calc(100%-1.5rem))] p-3`}
      >
        <p className={labelClass}>Selected center</p>
        <p className="mt-1 text-sm font-medium tabular-nums">24.88010, 100.08910</p>
        <button type="button" className={`${primaryRiverClass} mt-3 w-full`}>
          <DrawingPinIcon className="size-4" aria-hidden="true" />
          Use this center
        </button>
      </aside>
      <p className="absolute bottom-1 left-2 text-[9px] text-[#c6d7d1]">
        Map data specimen | Attribution remains visible
      </p>
    </div>
  );
}

function PageSpecimens() {
  const [view, setView] = useState<PageView>('dom');

  return (
    <div className="overflow-hidden rounded-xl border border-jade-border bg-jade-depth">
      <div
        className="flex gap-1 border-b border-jade-border bg-jade-panel p-2"
        role="tablist"
        aria-label="Page specimens"
      >
        {(['dom', 'map'] as PageView[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={view === item}
            onClick={() => setView(item)}
            className={`min-h-10 rounded-lg border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river ${
              view === item
                ? 'border-jade-river bg-jade-river-soft text-jade-text'
                : 'border-transparent text-jade-text-muted hover:border-jade-border-soft hover:bg-jade-control-hover'
            }`}
          >
            {item === 'dom' ? 'DOM page' : 'Leaflet map'}
          </button>
        ))}
      </div>
      <div role="tabpanel">{view === 'dom' ? <DomPage /> : <LeafletPage />}</div>
    </div>
  );
}

function FlatMapDialog() {
  const [open, setOpen] = useState(false);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      triggerButtonRef.current?.focus();
    };
  }, [open]);

  return (
    <Stage className="min-h-125">
      <div className="absolute inset-0 grid place-items-center p-4">
        <button
          ref={triggerButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          className={primaryRiverClass}
        >
          Open flat map
        </button>
      </div>
      {open && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#182a36]/45 p-3 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="flat-map-title"
            className={`${panelClass} flex h-[min(480px,calc(100%-1rem))] w-[min(760px,calc(100%-1rem))] flex-col overflow-hidden`}
          >
            <header className="flex items-center justify-between gap-3 border-b border-jade-border px-4 py-3">
              <div>
                <p className={labelClass}>Choose location</p>
                <h3 id="flat-map-title" className="mt-0.5 text-sm font-semibold">
                  Flat map selector
                </h3>
              </div>
              <IconTooltip label="Close flat map">
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close flat map selector"
                  className={iconButtonClass}
                >
                  <Cross2Icon className="size-5" aria-hidden="true" />
                </button>
              </IconTooltip>
            </header>
            <div className="leaflet-stage relative min-h-0 flex-1">
              <div className="map-river" />
              <div className="map-contours" />
              <div className="map-pin absolute top-[42%] left-1/2" />
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-jade-border bg-jade-panel-raised px-4 py-3">
              <p className="text-xs tabular-nums text-jade-text-muted">24.88010, 100.08910</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className={controlClass}>
                  Cancel
                </button>
                <button type="button" onClick={() => setOpen(false)} className={primaryRiverClass}>
                  <DrawingPinIcon className="size-4" aria-hidden="true" />
                  Use center
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </Stage>
  );
}

function IframeWindow() {
  const [open, setOpen] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(true);

  return (
    <Stage className="min-h-125">
      {!open && (
        <div className="absolute top-3 right-3">
          <button type="button" onClick={() => setOpen(true)} className={controlClass}>
            Open mini map
          </button>
        </div>
      )}
      {open && (
        <div
          className={`iframe-window absolute top-3 right-3 z-10 overflow-hidden rounded-xl border border-jade-border bg-jade-panel shadow-[0_12px_36px_rgba(24,42,54,0.16)] ${
            minimized ? 'h-auto' : 'h-[min(390px,calc(100%-1.5rem))]'
          }`}
        >
          <header className="flex h-12 items-center justify-between gap-3 border-b border-jade-border px-3">
            <div className="min-w-0">
              <p className={labelClass}>Following camera</p>
              <h3 className="truncate text-xs font-semibold">Mini map</h3>
            </div>
            <div className="flex gap-1">
              <IconTooltip label={minimized ? 'Restore mini map' : 'Minimize mini map'}>
                <button
                  type="button"
                  onClick={() => setMinimized((value) => !value)}
                  aria-label={minimized ? 'Restore mini map' : 'Minimize mini map'}
                  className={iconButtonClass}
                >
                  {minimized ? (
                    <EnterFullScreenIcon className="size-5" aria-hidden="true" />
                  ) : (
                    <MinusIcon className="size-5" aria-hidden="true" />
                  )}
                </button>
              </IconTooltip>
              <IconTooltip label="Close mini map">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close mini map"
                  className={iconButtonClass}
                >
                  <Cross2Icon className="size-5" aria-hidden="true" />
                </button>
              </IconTooltip>
            </div>
          </header>
          {!minimized && (
            <div className="relative h-[calc(100%-3rem)]">
              <iframe
                title="Offline mini map specimen"
                srcDoc={iframeDocument}
                onLoad={() => setLoading(false)}
                className="h-full w-full border-0 bg-jade-depth"
              />
              {loading && (
                <div
                  className="absolute inset-0 grid place-items-center bg-jade-depth text-xs text-jade-text-muted"
                  role="status"
                >
                  Loading mini map...
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Stage>
  );
}

function Tokens() {
  const tokens = [
    ['Foundation', '#EAF2F7', 'var(--jade-foundation)'],
    ['Panel', '#F8FBFD', 'var(--jade-panel)'],
    ['Control', '#E4EEF5', 'var(--jade-control)'],
    ['River', '#078EA5', 'var(--jade-river)'],
    ['Sky', '#397FCF', 'var(--jade-sky)'],
    ['Lotus', '#D94F83', 'var(--jade-lotus)'],
    ['Leaf', '#2E9B66', 'var(--jade-success)'],
    ['Sun', '#C78313', 'var(--jade-silt)'],
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-jade-border bg-jade-border sm:grid-cols-4 lg:grid-cols-8">
      {tokens.map(([name, hex, color]) => (
        <div key={name} className="bg-jade-panel p-3">
          <div className="h-10 rounded-lg border border-white/15" style={{ background: color }} />
          <p className="mt-2 text-xs font-semibold">{name}</p>
          <p className="mt-0.5 text-[10px] tabular-nums text-jade-text-muted">{hex}</p>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <main className="min-h-screen px-4 py-6 text-jade-text sm:px-6 lg:px-8">
      <div className="mx-auto max-w-310">
        <header className="flex flex-col gap-5 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className={labelClass}>Lancangriver interface system</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">River Mist UI Workbench</h1>
            <p className="mt-2 text-sm leading-6 text-jade-text-muted">
              A light blue-gray language with river, sky, lotus, leaf, and sun accents for map
              controls and operational views.
            </p>
          </div>
          <nav
            aria-label="Specimen sections"
            className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-jade-border-soft bg-jade-panel p-1"
          >
            {[
              ['workspace', 'Workspace'],
              ['pages', 'Pages'],
              ['modal', 'Modal'],
              ['window', 'Window'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={`#${href}`}
                className="min-h-10 shrink-0 rounded-lg px-3 py-2.5 text-xs font-medium text-jade-text-muted hover:bg-jade-control hover:text-jade-text"
              >
                {label}
              </a>
            ))}
          </nav>
        </header>

        <Tokens />
        <Section
          id="buttons"
          eyebrow="00 / Controls"
          title="Button system"
          description="Stable SUSE Mono controls for commands, loading, destructive actions, toggles, and icon-only map tools."
        >
          <ButtonSystem />
        </Section>
        <Section
          id="workspace"
          eyebrow="01 / Map overlays"
          title="Map workspace"
          description="Controls remain compact and legible while the terrain stays primary. Interactive states mirror OpsPanel, material modes, diagnostics, and the journey timeline."
        >
          <MapWorkspace />
        </Section>
        <Section
          id="pages"
          eyebrow="02 / Standalone views"
          title="DOM and Leaflet pages"
          description="One shared surface language supports dense operational data and full-screen map selection without hiding native map affordances."
        >
          <PageSpecimens />
        </Section>
        <Section
          id="modal"
          eyebrow="03 / 3D interruption"
          title="Flat map modal"
          description="A focused location decision uses a bounded dialog, clear backdrop, keyboard dismissal, and explicit confirmation."
        >
          <FlatMapDialog />
        </Section>
        <Section
          id="window"
          eyebrow="04 / Browser boundary"
          title="Iframe floating window"
          description="A real offline iframe demonstrates independent content with stable window controls and a viewport-bounded mobile treatment."
        >
          <IframeWindow />
        </Section>
      </div>
    </main>
  );
}

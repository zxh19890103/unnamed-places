import { memo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { ChildWindow, IconButton, Tooltip } from '@/_components';
import { Create3dTilesViewer, currentThreeDTilesViewer } from '@/_3dtiles';
import { buildFlatModalUrl, FLAT_CENTER_CONFIRMED } from '@/flat/protocol';
import type { TilesManager } from '../TilesManager.class';
import { SceneState } from '../setup';
import { useChildWindowMessages } from '@/_components/Window';

type OpsPanelProps = {
  sceneState: SceneState;
  tileManager: TilesManager;
  threeTilesViewer: Create3dTilesViewer;
};

export const OpsPanel = ({ sceneState, tileManager }: OpsPanelProps) => {
  return (
    <>
      <div
        className="flex flex-col gap-2"
        role="toolbar"
        aria-label="Scene controls"
        aria-orientation="vertical"
      >
        <PauseTileUpdatesButton tileManager={tileManager} />
        <DescendToAltitudeButton sceneState={sceneState} />
        <LoadElevationButton sceneState={sceneState} />
        <OpenFlatMapButton />
        <JobsManagerButton />
        <CreateTileJobButton />
      </div>
    </>
  );
};

function SceneControlTooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip label={label} side="left" align="center" sideOffset={10}>
      {children}
    </Tooltip>
  );
}

function PauseTileUpdatesButton({ tileManager }) {
  const [viewerUpdateEnabled, setViewerUpdateEnabled] = useState(!tileManager.frozen);

  const onToggle = () => {
    const nextFrozen = !tileManager.frozen;
    tileManager.frozen = nextFrozen;
    const nextUpdateEnabled = !nextFrozen;
    setViewerUpdateEnabled(nextUpdateEnabled);
  };

  return (
    <SceneControlTooltip label={viewerUpdateEnabled ? 'Pause tile updates' : 'Resume tile updates'}>
      <IconButton
        aria-label={viewerUpdateEnabled ? 'Pause tile updates' : 'Resume tile updates'}
        aria-pressed={!viewerUpdateEnabled}
        onClick={onToggle}
        className="pointer-events-auto"
      >
        {viewerUpdateEnabled ? <PauseTilesIcon /> : <ResumeTilesIcon />}
      </IconButton>
    </SceneControlTooltip>
  );
}

function DescendToAltitudeButton({ sceneState }: { sceneState: SceneState }) {
  const [isDescending, setIsDescending] = useState(false);
  const label = isDescending ? 'Descending to 500 m' : 'Descend to 500 m';

  const handleDescend = async () => {
    setIsDescending(true);

    try {
      sceneState.setTilesMgrMode('static');
      await sceneState.controls.descendTo(500, { speed: 1 });
    } finally {
      setIsDescending(false);
      sceneState.setTilesMgrMode('dynamic');
    }
  };

  return (
    <SceneControlTooltip label={label}>
      <IconButton
        type="button"
        aria-label={label}
        aria-busy={isDescending}
        disabled={isDescending}
        onClick={() => void handleDescend()}
        className="pointer-events-auto"
      >
        <DescendIcon />
      </IconButton>
    </SceneControlTooltip>
  );
}

function LoadElevationButton({ sceneState }: { sceneState: SceneState }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [rangeLabel, setRangeLabel] = useState('');
  const label =
    status === 'loading'
      ? 'Loading elevation min/max'
      : status === 'loaded'
        ? `Remove elevation adjustment (${rangeLabel})`
        : status === 'error'
          ? 'Elevation load failed. Retry'
          : 'Load elevation min/max';

  const handleLoadElevation = async () => {
    if (sceneState.controls.liveState.mode === 'orbit') {
      alert('noops');
      return null;
    }

    if (status === 'loaded') {
      sceneState.controls.setElevation(0, 0);
      setRangeLabel('');
      setStatus('idle');
      return;
    }

    setStatus('loading');

    try {
      const range = await sceneState.controls.loadElevation();
      setRangeLabel(`${Math.round(range.min)} to ${Math.round(range.max)} m`);
      setStatus('loaded');
    } catch {
      setStatus('error');
    }
  };

  return (
    <SceneControlTooltip label={label}>
      <IconButton
        type="button"
        aria-label={label}
        aria-busy={status === 'loading'}
        aria-pressed={status === 'loaded'}
        disabled={status === 'loading'}
        onClick={() => void handleLoadElevation()}
        className="pointer-events-auto"
      >
        <LoadElevationIcon />
      </IconButton>
    </SceneControlTooltip>
  );
}

const OpenFlatMapButton = memo(() => {
  const [isFlatModalOpen, setIsFlatModalOpen] = useState(false);
  const [flatFrameUrl, setFlatFrameUrl] = useState('/flat.html');
  const ifrRef = useRef<HTMLIFrameElement>(null);

  const handleOpenFlatModal = () => {
    const center = currentThreeDTilesViewer.getLatlng();
    setFlatFrameUrl(buildFlatModalUrl(center));
    setIsFlatModalOpen(true);
  };

  useChildWindowMessages(FLAT_CENTER_CONFIRMED, () => {
    setIsFlatModalOpen(false);
  });

  return (
    <>
      <SceneControlTooltip label="Open flat map">
        <IconButton
          type="button"
          aria-label="Open flat map"
          onClick={handleOpenFlatModal}
          className="pointer-events-auto"
        >
          <FlatMapIcon />
        </IconButton>
      </SceneControlTooltip>
      {isFlatModalOpen && (
        <ChildWindow.Modal closeSignal={false} onClose={setIsFlatModalOpen}>
          <ChildWindow
            iframeElementRef={ifrRef}
            title="Flat map selector"
            winRole="choose location"
            pageUrl={flatFrameUrl}
            onOpenStateChange={setIsFlatModalOpen}
          />
        </ChildWindow.Modal>
      )}
    </>
  );
});

const JobsManagerButton = memo(() => {
  const [isJobsManageModalOpen, setIsJobsManageModalOpen] = useState(false);
  const [jobsManageFrameUrl, setJobsManageFrameUrl] = useState('./jobs');

  const openJobsManageModal = () => {
    setJobsManageFrameUrl('./jobs');
    setIsJobsManageModalOpen(true);
  };

  return (
    <>
      <SceneControlTooltip label="Open jobs manager">
        <IconButton
          type="button"
          aria-label="Open jobs manager"
          onClick={openJobsManageModal}
          className="pointer-events-auto"
        >
          <JobsManageIcon />
        </IconButton>
      </SceneControlTooltip>
      {isJobsManageModalOpen && (
        <ChildWindow.Modal onClose={setIsJobsManageModalOpen}>
          <ChildWindow
            title="Jobs manager"
            winRole="manage jobs"
            pageUrl={jobsManageFrameUrl}
            onOpenStateChange={setIsJobsManageModalOpen}
          />
        </ChildWindow.Modal>
      )}
    </>
  );
});

const CreateTileJobButton = () => {
  const [isCreateJobModalOpen, setIsCreateJobModalOpen] = useState(false);
  const [createJobFrameUrl, setCreateJobFrameUrl] = useState('./jobs-create');

  const openCreateJobModal = () => {
    const center = currentThreeDTilesViewer.getLatlng();
    const nextUrl = center ? `./jobs-create?latlng=${center.lat},${center.lng}` : './jobs-create';
    setCreateJobFrameUrl(nextUrl);
    setIsCreateJobModalOpen(true);
  };

  return (
    <>
      <SceneControlTooltip label="Create OSM tile job">
        <IconButton
          type="button"
          aria-label="Create OSM tile job"
          onClick={openCreateJobModal}
          className="pointer-events-auto"
        >
          <CreateTileJobIcon />
        </IconButton>
      </SceneControlTooltip>
      {isCreateJobModalOpen && (
        <ChildWindow.Modal closeSignal={false} onClose={setIsCreateJobModalOpen}>
          <ChildWindow
            title="Create OSM tile job"
            winRole="create job"
            pageUrl={createJobFrameUrl}
            onOpenStateChange={setIsCreateJobModalOpen}
          />
        </ChildWindow.Modal>
      )}
    </>
  );
};

//#region  icons
const iconClass = 'size-5.5';

function PauseTilesIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        <path d="m3.5 7 8.5-4 8.5 4-8.5 4-8.5-4Z" />
        <path d="m3.5 11 8.5 4 8.5-4M3.5 15l8.5 4 3.5-1.65" opacity=".65" />
        <path d="M18 15.5v5M21 15.5v5" strokeWidth="2.2" />
      </g>
    </svg>
  );
}

function ResumeTilesIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        <path d="m3.5 7 8.5-4 8.5 4-8.5 4-8.5-4Z" />
        <path d="m3.5 11 8.5 4 8.5-4M3.5 15l8.5 4 3.5-1.65" opacity=".65" />
      </g>
      <path d="m17 15 4 2.75-4 2.75V15Z" fill="currentColor" />
    </svg>
  );
}

function FlatMapIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      >
        <path d="m3 5 5-2 8 3 5-2v15l-5 2-8-3-5 2V5Z" />
        <path d="M8 3v15M16 6v4" opacity=".7" />
        <path d="M19 13.5c0 2-3 5-3 5s-3-3-3-5a3 3 0 1 1 6 0Z" />
        <circle cx="16" cy="13.5" r=".8" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

function DescendIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        <path d="M12 3v11" />
        <path d="m8 10 4 4 4-4" />
        <path d="M4 18c2.5-1.5 5-1.5 8 0s5.5 1.5 8 0" opacity=".7" />
        <path d="M5 21c2-1 4-1 7 0s5 1 7 0" opacity=".45" />
      </g>
    </svg>
  );
}

function LoadElevationIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        <path d="m3 18 5-7 3 3 4-7 6 11H3Z" />
        <path d="M12 3v6" />
        <path d="m9.5 6.5 2.5 2.5 2.5-2.5" />
      </g>
    </svg>
  );
}

function CreateTileJobIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      >
        <path d="M4 5.5h16" />
        <path d="M7 3.5v4" />
        <path d="M17 3.5v4" />
        <rect x="4" y="5.5" width="16" height="13" rx="2" />
        <path d="M8 13.5h8" />
        <path d="M12 9.5v8" />
      </g>
    </svg>
  );
}

function JobsManageIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      >
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 8h8" />
        <path d="M8 12h8" />
        <path d="M8 16h5" />
      </g>
    </svg>
  );
}
//#endregion

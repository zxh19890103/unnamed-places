import { useState } from "react";
import type { ReactElement } from "react";

import { IconButton, Tooltip } from "@/_components";
import {
  Create3dTilesViewer,
  useCurrentThreeDTilesViewerState,
} from "@/_3dtiles";
import type { LatLng } from "@/calc/types";
import type { TilesManager } from "../TilesManager.class";
import type { LatLngBBox } from "../setup/coverageVisibility";

type OpsPanelProps = {
  openFlatModal: () => Promise<void>;
  onOpenJobsManage: () => void;
  onOpenCreateJob: () => void;
  handleDirectSwitchTo3dView: () => Promise<void>;
  handleLoadGeotaggedPhotos: () => Promise<void>;
  getVisibleGroundBBox: () => LatLngBBox | null;
  getCurrentLookingAtCenter: () => LatLng | null;
  tileManager: TilesManager;
  threeTilesViewer: Create3dTilesViewer;
};

export const OpsPanel = ({
  openFlatModal,
  onOpenJobsManage,
  onOpenCreateJob,
  handleDirectSwitchTo3dView,
  handleLoadGeotaggedPhotos,
  tileManager,
}: OpsPanelProps) => {
  const state = useCurrentThreeDTilesViewerState("zoomLevel");
  console.log("state.zoomls", state);

  const [viewerUpdateEnabled, setViewerUpdateEnabled] = useState(
    !tileManager.frozen,
  );

  return (
    <div
      className="flex flex-col gap-2"
      role="toolbar"
      aria-label="Scene controls"
      aria-orientation="vertical"
    >
      <SceneControlTooltip
        label={
          viewerUpdateEnabled ? "Pause tile updates" : "Resume tile updates"
        }
      >
        <IconButton
          aria-label={
            viewerUpdateEnabled ? "Pause tile updates" : "Resume tile updates"
          }
          aria-pressed={!viewerUpdateEnabled}
          onClick={() => {
            const nextFrozen = !tileManager.frozen;
            tileManager.frozen = nextFrozen;
            const nextUpdateEnabled = !nextFrozen;
            setViewerUpdateEnabled(nextUpdateEnabled);
          }}
          className={`pointer-events-auto ${
            viewerUpdateEnabled
              ? ""
              : "border-jade-river bg-jade-river-soft text-jade-text"
          }`}
        >
          {viewerUpdateEnabled ? <PauseTilesIcon /> : <ResumeTilesIcon />}
        </IconButton>
      </SceneControlTooltip>
      <SceneControlTooltip label="Open flat map">
        <IconButton
          type="button"
          aria-label="Open flat map"
          onClick={() => void openFlatModal()}
          className="pointer-events-auto"
        >
          <FlatMapIcon />
        </IconButton>
      </SceneControlTooltip>
      <SceneControlTooltip label="Switch top-down / perspective view">
        <IconButton
          type="button"
          aria-label="Switch top-down or perspective view"
          onClick={() => void handleDirectSwitchTo3dView()}
          className="pointer-events-auto"
        >
          <ViewAngleIcon />
        </IconButton>
      </SceneControlTooltip>
      <SceneControlTooltip label="Load photo locations">
        <IconButton
          type="button"
          aria-label="Load photo locations"
          onClick={() => void handleLoadGeotaggedPhotos()}
          className="pointer-events-auto"
        >
          <PhotoLocationsIcon />
        </IconButton>
      </SceneControlTooltip>
      <SceneControlTooltip label="Open jobs manager">
        <IconButton
          type="button"
          aria-label="Open jobs manager"
          onClick={() => onOpenJobsManage()}
          className="pointer-events-auto"
        >
          <JobsManageIcon />
        </IconButton>
      </SceneControlTooltip>
      <SceneControlTooltip label="Create OSM tile job">
        <IconButton
          type="button"
          aria-label="Create OSM tile job"
          onClick={() => onOpenCreateJob()}
          className="pointer-events-auto"
        >
          <CreateTileJobIcon />
        </IconButton>
      </SceneControlTooltip>
    </div>
  );
};

function SceneControlTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <Tooltip label={label} side="left" align="center" sideOffset={10}>
      {children}
    </Tooltip>
  );
}

const iconClass = "size-5.5";

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

function ViewAngleIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      >
        <path d="m3 16 9-4 9 4-9 4-9-4Z" />
        <path d="M12 3v7M9.5 5.5 12 3l2.5 2.5" />
        <path d="M5 12.5 8.5 9M5 9v3.5h3.5" opacity=".8" />
      </g>
    </svg>
  );
}

function PhotoLocationsIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      >
        <rect x="3" y="5.5" width="14" height="12" rx="2" />
        <path d="m5.5 15 3.5-3 2.5 2 2-1.5 3.5 3M7 5.5l1-2h4l1 2" />
        <circle cx="13" cy="9.5" r="1.4" />
        <path
          d="M22 15.5c0 2-3 5-3 5s-3-3-3-5a3 3 0 1 1 6 0Z"
          fill="var(--jade-panel)"
        />
        <circle cx="19" cy="15.5" r=".8" fill="currentColor" stroke="none" />
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

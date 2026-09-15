import { memo, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';

import { Button } from '@/_components';
import { latlngToStandardTileZxy, currentThreeDTilesViewer } from '@/_3dtiles';
import { BASE_URL, ELEVATION_SCALE } from '@/calc/constants';
import type { TilesManager } from '../TilesManager.class';
import { currentSceneState, globalTileMaterialMode, setGlobalTileMaterialMode } from '../setup';
import { TileMaterialMode } from '../SphereTile.class';
import { ExploreControls, ExploreControlsLiveState } from '../controls/ExploreControls.class';

type DemAltitudeResponse = {
  ok: boolean;
  min: number;
  max: number;
};

const materialModeIcons: Record<TileMaterialMode, () => ReactNode> = {
  [TileMaterialMode.Basic]: () => (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="m4 8 8-4 8 4-8 4-8-4Z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="m4 12 8 4 8-4M4 16l8 4 8-4"
      />
    </svg>
  ),
  [TileMaterialMode.Dem]: () => <MaterialModeElevationIcon />,
  [TileMaterialMode.Debug]: () => (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="M5 5h14v14H5zM9 5v14M5 9h14M15 5v14M5 15h14"
      />
    </svg>
  ),
  [TileMaterialMode.ShanshuiWash]: () => (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="M4 16c3-7 6-7 8 0s5 7 8 0"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="M4 11c3-7 6-7 8 0s5 7 8 0"
      />
    </svg>
  ),
};

function MaterialModeElevationIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="m3 18 5-6 3 3 4-7 6 10H3Z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="M16 5h5M18.5 3.5v3"
      />
    </svg>
  );
}

function MaterialModeIcon({ mode }: { mode: TileMaterialMode }) {
  return materialModeIcons[mode]();
}

export const TileMaterialModeSelect = memo(
  ({ tileManager, controls }: { controls: ExploreControls; tileManager: TilesManager }) => {
    const [viewerState, setLiveState] = useState<ExploreControlsLiveState>(controls.liveState);

    useEffect(() => {
      const onstate = ({ data }) => {
        setLiveState(data);
      };

      controls.addEventListener('state', onstate);

      return () => {
        controls.removeEventListener('state', onstate);
      };
    }, [controls]);

    const [mode, setMode] = useState(globalTileMaterialMode);

    const modeLabels: Record<TileMaterialMode, string> = {
      [TileMaterialMode.Basic]: 'Satellite',
      [TileMaterialMode.Dem]: 'Elevation',
      [TileMaterialMode.Debug]: 'Debug',
      [TileMaterialMode.ShanshuiWash]: 'Watercolor',
    };

    const applyMaterialMode = (requested: TileMaterialMode) => {
      for (const node of tileManager.getAttachedNodes()) {
        if (node.tile) {
          node.tile.setMaterialMode(requested);
        }
      }

      setMode(requested);
      setGlobalTileMaterialMode(requested);
    };

    const applyNonElevationMode = (event: React.MouseEvent<HTMLButtonElement>) => {
      const button = event.currentTarget;
      const requested = button.getAttribute('itemtype') as TileMaterialMode;
      applyMaterialMode(requested);
    };

    return (
      <div
        className="pointer-events-auto flex max-w-full flex-nowrap gap-1 overflow-x-auto rounded-xl p-1 shadow-[0_8px_24px_rgba(24,42,54,0.12)] backdrop-blur-md"
        role="group"
        aria-label="Terrain material"
      >
        {Object.values(TileMaterialMode).map((materialMode) => {
          const isSelected = mode === materialMode;

          return (
            <Button
              key={materialMode}
              aria-pressed={isSelected}
              itemType={materialMode}
              className={clsx(
                'shrink-0',
                isSelected && 'font-semibold ring ring-offset-2 ring-red-200',
              )}
              onClick={applyNonElevationMode}
            >
              <MaterialModeIcon mode={materialMode} />
              {/* <span className="whitespace-nowrap">{modeLabels[materialMode]}</span> */}
            </Button>
          );
        })}
      </div>
    );
  },
);

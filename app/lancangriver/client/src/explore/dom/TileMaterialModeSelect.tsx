import { memo, useState } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';

import { Button } from '@/_components';
import {
  useCurrentThreeDTilesViewerState,
  latlngToStandardTileZxy,
  currentThreeDTilesViewer,
} from '@/_3dtiles';
import { BASE_URL, ELEVATION_SCALE } from '@/calc/constants';
import type { TilesManager } from '../TilesManager.class';
import { currentSceneState, globalTileMaterialMode, setGlobalTileMaterialMode } from '../setup';
import { TileMaterialMode } from '../SphereTile.class';
import { ExploreControls } from '../controls/ExploreControls.class';

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
  [TileMaterialMode.Clean]: () => (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        d="M12 3 14 9l6 2-6 2-2 8-2-8-6-2 6-2 2-6Z"
      />
    </svg>
  ),
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
  ({ tileManager }: { controls: ExploreControls; tileManager: TilesManager }) => {
    const viewerState = useCurrentThreeDTilesViewerState('zoom');

    const [mode, setMode] = useState(globalTileMaterialMode);
    const [isElevationLoading, setIsElevationLoading] = useState(false);

    const modeLabels: Record<TileMaterialMode, string> = {
      [TileMaterialMode.Basic]: 'Satellite',
      [TileMaterialMode.Dem]: 'Elevation',
      [TileMaterialMode.Clean]: 'Clean',
      [TileMaterialMode.Debug]: 'Debug',
      [TileMaterialMode.ShanshuiWash]: 'Watercolor',
    };

    const applyMaterialMode = (requested: TileMaterialMode) => {
      for (const node of tileManager.getAttachedNodes()) {
        if (node.tile) {
          node.tile.setMaterialMode(requested);
        }
      }

      return true;
    };

    const applyElevationMode = async () => {
      if (viewerState.zoom < 11 || isElevationLoading) {
        return;
      }

      const groundCenter = currentThreeDTilesViewer.getCameraLatLng();
      if (!groundCenter) {
        return;
      }

      const [, x, y] = latlngToStandardTileZxy(groundCenter, 10);
      setIsElevationLoading(true);

      try {
        const response = await fetch(`${BASE_URL}/raster/dem/10/${x}/${y}/altitude`);

        if (!response.ok) {
          throw new Error(`Altitude request failed: ${response.status}`);
        }

        const altitude = (await response.json()) as DemAltitudeResponse;
        if (
          !altitude.ok ||
          !Number.isFinite(altitude.min) ||
          !Number.isFinite(altitude.max) ||
          altitude.max < altitude.min
        ) {
          throw new Error('Altitude response had an invalid elevation range');
        }

        currentSceneState.setVisibleTilesElevationRange(
          altitude.min * ELEVATION_SCALE,
          altitude.max * ELEVATION_SCALE,
        );

        applyMaterialMode(TileMaterialMode.Dem);
        setMode(TileMaterialMode.Dem);
        setGlobalTileMaterialMode(TileMaterialMode.Dem);
      } catch (error) {
        console.warn('Failed to prepare elevation terrain', error);
      } finally {
        setIsElevationLoading(false);
      }
    };

    return (
      <div className="flex flex-wrap gap-2">
        {Object.values(TileMaterialMode).map((materialMode) => {
          const isSelected = mode === materialMode;
          const isElevationMode = materialMode === TileMaterialMode.Dem;
          const isZoomBlocked = isElevationMode && viewerState.zoom < 11;
          const isDisabled = isZoomBlocked || (isElevationMode && isElevationLoading);
          const title = isElevationLoading
            ? 'Loading elevation data'
            : isZoomBlocked
              ? 'Zoom in past level 11 to use elevation terrain'
              : modeLabels[materialMode];

          return (
            <Button
              key={materialMode}
              aria-label={isDisabled ? title : `Use ${modeLabels[materialMode]} terrain`}
              aria-pressed={isSelected}
              disabled={isDisabled}
              title={title}
              className={clsx('pointer-events-auto', isSelected ? 'relative top-1' : null)}
              onClick={() => {
                const requested = materialMode;

                if (requested === TileMaterialMode.Dem) {
                  void applyElevationMode();
                  return;
                }

                if (applyMaterialMode(requested)) {
                  setMode(requested);
                  setGlobalTileMaterialMode(requested);
                }
              }}
            >
              <MaterialModeIcon mode={materialMode} />
              <span className="whitespace-nowrap">{modeLabels[materialMode]}</span>
            </Button>
          );
        })}
      </div>
    );
  },
);

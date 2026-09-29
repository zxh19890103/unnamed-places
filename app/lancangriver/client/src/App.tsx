import { memo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import { initializeScene, SceneState } from './explore/setup';
import { SceneMonitor } from './explore/dom/SceneMonitor';
import { TileMaterialModeSelect } from './explore/dom/TileMaterialModeSelect';
import { OpsPanel } from './explore/dom/OpsPanel';
import type { LatLng } from './calc/types';
import { SphereTile } from './explore/SphereTile.class';
import { FLAT_CENTER_CONFIRMED } from './flat/protocol';
import { JourneyPanel } from './photos/JourneyPanel';
import { MiniMap } from './explore/dom/MiniMap';
import { ChildWindow } from './_components';

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [sceneState, setSceneState] = useState<SceneState>(null);

  useEffect(() => {
    const hostElement = hostRef.current;
    const state = initializeScene({ container: hostElement });
    setSceneState(state);

    return () => {
      state.cleanup();
      hostElement.removeChild(state.renderer.domElement);
    };
  }, []);

  return (
    <div className="relative h-screen w-screen">
      <div ref={hostRef} className="absolute inset-0 overflow-hidden" />
      {sceneState && <CreateScene sceneState={sceneState} host={hostRef.current} />}
    </div>
  );
}

const CreateScene = memo(({ sceneState }: { sceneState: SceneState; host: HTMLDivElement }) => {
  const [tile12OsmFrameUrl, setTile12OsmFrameUrl] = useState<string | boolean>(null);

  useEffect(() => {
    const { scene, camera, renderer, stats, controls, resize, onFrame } = sceneState;

    const clickRaycaster = new THREE.Raycaster();
    const clickCoordinates = new THREE.Vector2();
    const sphereWorldPosition = new THREE.Vector3();
    const cameraWorldPosition = new THREE.Vector3();
    const surfaceNormal = new THREE.Vector3();
    const surfaceToCamera = new THREE.Vector3();

    const handleMapClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      clickCoordinates.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      clickCoordinates.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      clickRaycaster.setFromCamera(clickCoordinates, camera);

      sceneState.sphere.updateWorldMatrix(true, true);
      sceneState.sphere.getWorldPosition(sphereWorldPosition);
      camera.getWorldPosition(cameraWorldPosition);

      const hit = clickRaycaster.intersectObject(sceneState.sphere, true).find((intersection) => {
        if (!(intersection.object instanceof SphereTile)) {
          return false;
        }

        let object: THREE.Object3D | null = intersection.object;
        while (object) {
          if (!object.visible) {
            return false;
          }
          if (object === sceneState.sphere) {
            break;
          }
          object = object.parent;
        }

        surfaceNormal.copy(intersection.point).sub(sphereWorldPosition).normalize();
        surfaceToCamera.copy(cameraWorldPosition).sub(intersection.point).normalize();

        return surfaceNormal.dot(surfaceToCamera) > 0;
      });
      if (!hit) {
        return;
      }

      const radius = hit.point.length();
      const latlng = {
        lat: (Math.asin(hit.point.y / radius) * 180) / Math.PI,
        lng: (Math.atan2(hit.point.x, hit.point.z) * 180) / Math.PI,
      };

      controls.dispatchEvent({
        type: 'click',
        latlng,
      });
    };

    const handleResize = () => resize();
    window.addEventListener('resize', handleResize);

    let frameId = 0;
    let lastTime = performance.now();

    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.016); // Cap at 16ms
      lastTime = now;

      onFrame(delta * 1000);

      controls.update(delta);

      stats.update();
      renderer.render(scene, camera);
    };

    resize();
    animate();

    renderer.domElement.addEventListener('click', handleMapClick);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', handleMapClick);
      window.cancelAnimationFrame(frameId);
    };
  }, [sceneState]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const eventType = event.data?.type;

      switch (eventType) {
        case FLAT_CENTER_CONFIRMED: {
          const center = event.data.payload as LatLng;
          sceneState.setTilesMgrMode('static');
          sceneState.controls
            .flyTo(center, {
              speed: 1,
            })
            .finally(() => {
              sceneState.setTilesMgrMode('dynamic');
            });
          break;
        }
        case 'tile12osm': {
          const url = event.data.urlToGo;
          setTile12OsmFrameUrl(url);
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-2 lg:top-2 z-40 flex justify-start overflow-x-auto sm:inset-x-3 sm:top-3 sm:justify-center">
        <TileMaterialModeSelect
          controls={sceneState.controls}
          tileManager={sceneState.tileManager}
        />
      </div>

      <div className="pointer-events-none fixed lg:left-2 lg:top-2 z-40 sm:left-3 sm:top-20">
        <JourneyPanel
          capacities={{
            scene: sceneState.scene,
            onDaySelect: () => {},
            onGeoOpen: () => {},
            onGeoClose: () => {},
            onPhotoSelect: () => {},
            onLoaded: () => {},
          }}
        />
      </div>

      <div className="pointer-events-none fixed lg:right-2 top-1/2 z-40 -translate-y-1/2 sm:right-3">
        <OpsPanel
          sceneState={sceneState}
          tileManager={sceneState.tileManager}
          threeTilesViewer={sceneState.threeTilesViewer}
        />
      </div>

      <div className="pointer-events-none fixed bottom-2 lg:left-2 z-40 sm:bottom-3 sm:left-3">
        <SceneMonitor
          controls={sceneState.controls}
          sphere={sceneState.sphere}
          threeJsStats={sceneState.stats}
        />
      </div>

      {tile12OsmFrameUrl && (
        <ChildWindow.Modal size={96} closeSignal={null} onClose={setTile12OsmFrameUrl}>
          <ChildWindow
            title="Check Tile Osm"
            winRole="tile osm"
            pageUrl={tile12OsmFrameUrl as string}
            onOpenStateChange={setTile12OsmFrameUrl}
          />
        </ChildWindow.Modal>
      )}

      <div className="pointer-events-none fixed right-2 lg:top-2 z-50 sm:top-20">
        <MiniMap controls={sceneState.controls} precision={9} />
      </div>
    </>
  );
});

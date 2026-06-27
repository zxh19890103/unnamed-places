import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { createScene } from "./explore/setup";
import { SceneMonitor } from "./explore/dom/SceneMonitor";
import type { Sphere } from "./explore/Sphere.class";
import type { TileNode } from "./explore/TilesManager.class";

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [sphere, setSphere] = useState<Sphere | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const {
      scene,
      camera,
      renderer,
      controlsManager,
      sphere: sceneSphere,
      stats,
      tileManager,
      compositor,
      resize,
      destroyCameraGui,
      destroyStats,
      cleanup,
    } = createScene(host);

    setSphere(sceneSphere);

    const handleResize = () => resize();
    window.addEventListener("resize", handleResize);

    let frameId = 0;
    let lastTime = performance.now();
    let lastCompositorUpdate = 0;
    const centerRaycaster = new THREE.Raycaster();
    const centerNdc = new THREE.Vector2(0, 0);

    const getCenterLookedTileNode = (
      attachedNodes: TileNode[],
    ): TileNode | null => {
      const tileMeshes: THREE.Object3D[] = [];
      const meshToNode = new Map<THREE.Object3D, TileNode>();

      for (const node of attachedNodes) {
        if (!node.tile) {
          continue;
        }

        tileMeshes.push(node.tile);
        meshToNode.set(node.tile, node);
      }

      if (tileMeshes.length === 0) {
        return null;
      }

      centerRaycaster.setFromCamera(centerNdc, camera);
      const hits = centerRaycaster.intersectObjects(tileMeshes, false);

      for (const hit of hits) {
        const node = meshToNode.get(hit.object);
        if (node) {
          return node;
        }
      }

      return null;
    };

    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.016); // Cap at 16ms
      lastTime = now;

      controlsManager.update(delta);

      // Update compositor when tiles are frozen (fly or groundOrbit mode), throttled
      if (tileManager.frozen && now - lastCompositorUpdate > 300) {
        const attachedNodes = tileManager.getAttachedNodes();
        const lookedAtNode = getCenterLookedTileNode(attachedNodes);

        const tilesToCompose = attachedNodes
          .filter((node) => node.tile)
          .map((node) => {
            return {
              node,
              tile: node.tile!,
              // for testing
              cameraDistance: node === lookedAtNode ? 11_000 : 31_000,
            };
          })
          .sort((a, b) => {
            if (a.node === lookedAtNode) {
              return -1;
            }
            if (b.node === lookedAtNode) {
              return 1;
            }
            return 0;
          });

        if (tilesToCompose.length > 0) {
          void compositor.updateForTiles(tilesToCompose);
        }

        lastCompositorUpdate = now;
      }

      stats.update();
      renderer.render(scene, camera);
    };

    resize();
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(frameId);
      destroyCameraGui();
      destroyStats();
      cleanup();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      setSphere(null);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <div
        ref={hostRef}
        style={{ position: "absolute", inset: 0, overflow: "hidden" }}
      />
      <SceneMonitor sphere={sphere} />
    </div>
  );
}

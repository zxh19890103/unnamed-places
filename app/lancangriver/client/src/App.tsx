import { useEffect, useRef, useState } from "react";

import { createScene } from "./explore/setup";
import { SceneMonitor } from "./explore/SceneMonitor";
import type { Sphere } from "./explore/Sphere.class";

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
    // let lastCompositorUpdate = 0;

    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.016); // Cap at 16ms
      lastTime = now;

      controlsManager.update(delta);

      // Update compositor in fly mode (throttled)
      // if (controlsManager.isFlyMode() && now - lastCompositorUpdate > 100) {
      //   const attachedNodes = tileManager.getAttachedNodes();
      //   const tilesToCompose = attachedNodes
      //     .filter((node) => node.tile)
      //     .map((node) => ({
      //       node,
      //       tile: node.tile!,
      //       cameraDistance: camera.position.distanceTo(node.tile!.position),
      //     }));

      //   if (tilesToCompose.length > 0) {
      //     void compositor.updateForTiles(tilesToCompose);
      //   }
      //   lastCompositorUpdate = now;
      // }

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

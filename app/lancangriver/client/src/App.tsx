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
      controls,
      sphere: sceneSphere,
      stats,
      resize,
      destroyCameraGui,
      destroyStats,
    } = createScene(host);

    setSphere(sceneSphere);

    const handleResize = () => resize();
    window.addEventListener("resize", handleResize);

    let frameId = 0;
    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      controls.update();
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
      controls.dispose();
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

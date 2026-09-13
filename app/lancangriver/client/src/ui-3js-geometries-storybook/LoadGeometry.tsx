import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type Props = {
  geometry: THREE.BufferGeometry | null;
  name?: string;
};

export default function LoadGeometry({ geometry, name }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current || !geometry) {
      return;
    }

    const container = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || 640, container.clientHeight || 420);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fbfd);

    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
    camera.position.set(0, 1.8, 4.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(3, 4, 2);
    scene.add(directionalLight);

    const previewGeometry = geometry.clone();
    previewGeometry.computeVertexNormals();
    previewGeometry.center();

    const material = new THREE.MeshPhongMaterial({
      color: 0x3f8fcf,
      shininess: 70,
    });
    const mesh = new THREE.Mesh(previewGeometry, material);
    mesh.rotation.set(-0.5, 0.4, 0);
    scene.add(mesh);

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    let frameId = 0;
    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const width = container.clientWidth || 640;
      const height = container.clientHeight || 420;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      previewGeometry.dispose();
      container.innerHTML = '';
    };
  }, [geometry, name]);

  return (
    <div className="mt-6 rounded-xl border border-jade-border-soft bg-jade-panel-raised/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase text-jade-text-muted">Preview</h3>
        {name ? <span className="text-sm text-jade-text-muted">{name}</span> : null}
      </div>
      <div
        ref={mountRef}
        className="h-105 w-full overflow-hidden rounded-lg border border-jade-border bg-jade-depth"
      />
    </div>
  );
}

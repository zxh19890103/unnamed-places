import * as THREE from "three";
import { useEffect, memo, useRef } from "react";
import { setupThree, type ThreeSetup } from "./geo/setup.js";

let __textureLoader: THREE.TextureLoader;
let __world: ThreeSetup;

const Load = memo((props: {}) => {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    __textureLoader = new THREE.TextureLoader(new THREE.LoadingManager());
    const world = setupThree(elementRef.current);

    __world = world;

    return () => {
      __textureLoader = null;
      __world = null;
    };
  }, []);

  return <div ref={elementRef} className=" size-full font-mono" />;
});

export default memo(() => {
  useEffect(() => {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1024, 1024),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: __textureLoader.load("/public/tmp/tilepic-16.jpeg"),
      }),
    );

    ground.rotation.x = -Math.PI / 2;
    __world.world.add(ground);

    fetch("/public/tmp/polygons.json")
      .then((r) => r.json())
      .then((data) => {
        for (const poly of data) {
          if (poly.label === "building") {
            const shape = new THREE.Shape(
              poly.coordinates.map((xy) => new THREE.Vector2(xy.x, xy.y)),
            );

            const geometry = new THREE.ExtrudeGeometry(shape, {
              depth: 10 + Math.random() * 60,
            });

            const polyMesh = new THREE.Mesh(
              geometry,
              new THREE.MeshBasicMaterial({
                depthTest: true,
                transparent: true,
                opacity: 0.6,
                side: THREE.DoubleSide,
                color: Math.ceil(Math.random() * 0xffffff),
              }),
            );

            const edges = new THREE.Line(
              new THREE.EdgesGeometry(geometry),
              new THREE.LineBasicMaterial({
                color: 0x000000,
              }),
            );

            polyMesh.add(edges)
            polyMesh.position.set(-512, -512, 0);
            ground.add(polyMesh);
          } else if (poly.label === "vegetation") {
          }
        }
      });
  }, []);

  return (
    <>
      <Load />
    </>
  );
});

import { memo, useEffect, useRef } from "react";
import { BuildingsCollection } from "./osm/building.js";
import * as calc from "./geo/calc.js";
import * as tile from "./geo/tile.js";
import * as THREE from "three";
import type { TileElevation } from "./geo/tile.js";
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

export const OsmBuildings = memo((props: { latlng: L.LatLng }) => {
  useEffect(() => {
    buildOsmBuildings(props.latlng, __textureLoader, __world);
  }, []);

  return (
    <>
      <Load />
    </>
  );
});

async function buildOsmBuildings(
  latlng: L.LatLng,
  __textureLoader,
  __world: ThreeSetup,
) {
  const tileIndex = calc.latLonToTile(latlng, calc.ZOOM_BASIS);
  const bbox = tile.calcTileBBOX(tileIndex.x, tileIndex.y, tileIndex.z);
  const tileCrsProject = tile.createLatlngToTileCoordProjector(bbox);

  const elevation: TileElevation = await fetch(
    `/elevation/${tileIndex.z}/${tileIndex.x}/${tileIndex.y}`,
  ).then((r) => r.json());

  const displacementMap = __textureLoader.load(
    `/dem/${tileIndex.z}/${tileIndex.x}/${tileIndex.y}?bbox=${bbox.bbox}`,
  );

  displacementMap.magFilter = THREE.LinearFilter;
  displacementMap.minFilter = THREE.LinearFilter;

  const demInformation = {
    texture: displacementMap,
    elevation,
  };

  const tileSize = new THREE.Vector2(bbox.measureX, bbox.measureY);

  const resolution = 20.5;
  const segments_in_x = Math.ceil(bbox.measureX / resolution);
  const segments_in_y = Math.ceil(bbox.measureY / resolution);

  await fetch(`/osm/${bbox.z}/${bbox.x}/${bbox.y}/building?bbox=${bbox.bbox}`)
    .then((r) => r.json())
    .then((geojson) => {
      const ui = new BuildingsCollection(
        geojson,
        tileCrsProject,
        tileSize,
        new THREE.Vector2(segments_in_x, segments_in_y),
        __world,
        demInformation,
        bbox,
      );

      console.log(
        `https://mt1.google.com/vt/lyrs=s&x=${bbox.x}&y=${bbox.y}&z=${bbox.z}&scale=4&hl=en`,
      );

      const tile = new THREE.Mesh(
        new THREE.PlaneGeometry(
          tileSize.x,
          tileSize.y,
          segments_in_x,
          segments_in_y,
        ),
        new THREE.MeshStandardMaterial({
          color: "#fff",
          wireframe: false,
          transparent: false,
          map: __textureLoader.load(`/public/assets/tilepic.png`),
          displacementMap: displacementMap,
          displacementScale: demInformation.elevation.span,
          displacementBias: 0,
          opacity: 0.5,
        }),
      );

      tile.rotation.x = -Math.PI / 2;
      tile.position.set(0, 0, 0);

      ui.position.set(-bbox.measureX / 2, -bbox.measureY / 2, 0);

      tile.add(ui);
      __world.world.add(tile);
    });
}

import { memo, useEffect, useRef, useState } from "react";

import * as THREE from "three";
import { setupThree, ThreeSetup } from "./geo/setup.js";
import * as calc from "./geo/calc.js";
import * as tile from "./geo/tile.js";

import type { TileElevation, TilePosition } from "./geo/tile.js";
import { HighwaysCollection } from "./osm/highway.js";
import { BuildingsCollection } from "./osm/building.js";
import { NaturalThingsCollection } from "./osm/natural.js";
import { GoogleTileRoot } from "./env/earth.js";
import { Plants } from "./env/plants.js";
import { LonelyBigClouds, SkyClouds } from "./env/clouds.js";

export default function (props: { latlng: L.LatLng }) {
  if (!props.latlng) {
    return <div>no latlng</div>;
  }

  return (
    <>
      <Load />
      <Tile latlng={props.latlng} />
    </>
  );
}

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

const Tile = (props: { latlng: L.LatLngLiteral }) => {
  const tileIndex = calc.latLonToTile(props.latlng, calc.ZOOM_BASIS);
  const key = `${tileIndex.z}/${tileIndex.x}/${tileIndex.y}`;

  return <TileRender key={key} {...tileIndex} />;
};

const TileRender = memo((props: { x: number; y: number; z: number }) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let _dispose = null;
    const disposer = createOneTileMap(props);

    disposer.then((fn) => {
      _dispose = fn;
      setLoading(false);
    });

    return () => {
      _dispose?.();
    };
  }, []);

  if (loading)
    return (
      <div className=" absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-ping text-white">
        loading...
      </div>
    );

  return null;
});

const createOneTileMap = async (tileIndex: TilePosition) => {
  const bbox = tile.calcTileBBOX(tileIndex.x, tileIndex.y, tileIndex.z);

  const meters_in_x = calc.Meters_per_lon(bbox.center.lat) * bbox.dLng;
  const meters_in_y = calc.Meters_per_lat * bbox.dLat;
  const resolution = 8.5;
  const segments_in_x = Math.ceil(meters_in_x / resolution);
  const segments_in_y = Math.ceil(meters_in_y / resolution);

  console.log(meters_in_x, meters_in_y, segments_in_x, segments_in_y);

  __world.updateSun(bbox.center.lat, bbox.center.lng);

  const elevation: TileElevation = await fetch(
    `/elevation/${tileIndex.z}/${tileIndex.x}/${tileIndex.y}`,
  ).then((r) => r.json());

  const displacementMap = __textureLoader.load(
    `/dem/${tileIndex.z}/${tileIndex.x}/${tileIndex.y}?bbox=${bbox.bbox}`,
  );

  displacementMap.magFilter = THREE.LinearFilter;
  displacementMap.minFilter = THREE.LinearFilter;

  const tileCrsProject = tile.createLatlngToTileCoordProjector(bbox);

  const demInformation = {
    texture: displacementMap,
    elevation,
  };

  const tileSize = new THREE.Vector2(meters_in_x, meters_in_y);

  async function renderOsm(
    onSettled: (river: THREE.Texture, road: THREE.Texture) => void,
  ) {
    await fetch(`/osm/${bbox.z}/${bbox.x}/${bbox.y}/building?bbox=${bbox.bbox}`)
      .then((r) => r.json())
      .then((geojson) => {
        const things = new BuildingsCollection(
          geojson,
          tileCrsProject,
          tileSize,
          new THREE.Vector2(segments_in_x, segments_in_y),
          __world,
          demInformation,
          bbox,
        );

        things.position.set(-meters_in_x / 2, -meters_in_y / 2, 5);
        // earthGround.add(things);
      });

    let riverTex: THREE.Texture;
    let roadTex: THREE.Texture;

    fetch(`/osm/${bbox.z}/${bbox.x}/${bbox.y}/natural?bbox=${bbox.bbox}`)
      .then((r) => r.json())
      .then((geojson) => {
        const things = new NaturalThingsCollection(
          geojson,
          tileCrsProject,
          tileSize.clone(),
          new THREE.Vector2(segments_in_x, segments_in_y),
          demInformation,
          __textureLoader,
          __world,
        );

        earthGround.setRiverMaskTex(things.riverMaskTex);
        riverTex = things.riverMaskTex;

        if (roadTex) {
          onSettled(riverTex, roadTex);
        }

        // earthGround.add(things);
      });

    fetch(`/osm/${bbox.z}/${bbox.x}/${bbox.y}/highway?bbox=${bbox.bbox}`)
      .then((r) => r.json())
      .then((geojson) => {
        const things = new HighwaysCollection(
          geojson,
          tileCrsProject,
          tileSize.clone(),
          demInformation,
          __world,
        );

        roadTex = things.bwMaskTex;
        if (riverTex) {
          onSettled(riverTex, roadTex);
        }

        things.position.set(-meters_in_x / 2, -meters_in_y / 2, 5);
        // earthGround.add(things);
      });

    // fetch(`/osm/${bbox.z}/${bbox.x}/${bbox.y}/waterway?bbox=${bbox.bbox}`)
    //   .then((r) => r.json())
    //   .then((geojson) => {
    //     const things = new WaterwaysCollection(
    //       geojson,
    //       tileCrsProject,
    //       tileSize.clone(),
    //       demInformation
    //     );

    //     things.position.set(-meters_in_x / 2, -meters_in_y / 2, 7);
    //     earthGround.add(things);
    //   });
  }

  const earthGround = new GoogleTileRoot(bbox.x, bbox.y, __world);

  earthGround.widthSegments = segments_in_x;
  earthGround.heightSegments = segments_in_x;

  earthGround.prepare().then(() => {
    earthGround.split24();

    __world.controls.addEventListener("change", () => {
      earthGround.cameraPosLive.copy(__world.camera.position);
      earthGround.cameraPolarAngle =
        Math.PI / 2 - __world.controls.getPolarAngle();
      earthGround.updateMaterialUniforms();
    });

    const greenMask = __textureLoader.load(
      tile.getGoogleTileUrl(tileIndex, true),
    );

    greenMask.magFilter = THREE.NearestFilter;
    greenMask.minFilter = THREE.NearestFilter;

    renderOsm((riverTex, roadTex) => {
      const plants = new Plants(
        tileSize,
        greenMask,
        riverTex,
        roadTex,
        demInformation,
        __world,
      );

      plants.position.set(-meters_in_x / 2, -meters_in_y / 2, 0.1);
      earthGround.add(plants);
    });
  });

  earthGround.rotation.x = -Math.PI / 2;
  __world.world.add(earthGround);

  const cloudsTexture = __textureLoader.load(
    "/steal/data-vecteezy/clouds/_in-one",
  );

  __world.world.add(
    new SkyClouds(
      cloudsTexture,
      3,
      Math.hypot(tileSize.x * 0.5),
      demInformation.elevation.minElevation,
    ),
  );

  return () => {};
};

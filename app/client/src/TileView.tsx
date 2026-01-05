import { memo, useEffect, useRef, useState } from "react";

import * as THREE from "three";
import { setupThree, ThreeSetup } from "./geo/setup.js";
import * as calc from "./geo/calc.js";
import * as tile from "./geo/tile.js";

import abc from "./abc.glsl";
import type { TileElevation, TilePosition } from "./geo/tile.js";

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
  const tileUrl = tile.getGoogleTileUrl(tileIndex, true);

  const bbox = tile.calcTileBBOX(tileIndex.x, tileIndex.y, tileIndex.z);

  const meters_in_x = calc.Meters_per_lon(bbox.center.lat) * bbox.dLng;
  const meters_in_y = calc.Meters_per_lat * bbox.dLat;
  const resolution = 10;
  const segments_in_x = Math.ceil(meters_in_x / resolution);
  const segments_in_y = Math.ceil(meters_in_y / resolution);

  console.log(meters_in_x, meters_in_y, segments_in_x, segments_in_y);

  __world.updateSun(bbox.center.lat, bbox.center.lng);

  const elevation: TileElevation = await fetch(
    `/elevation/${tileIndex.z}/${tileIndex.x}/${tileIndex.y}`
  ).then((r) => r.json());

  const displacementMap = __textureLoader.load(
    `/dem/${tileIndex.z}/${tileIndex.x}/${tileIndex.y}?bbox=${bbox.bbox}`
  );

  const map = __textureLoader.load(tileUrl);

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(
      meters_in_x,
      meters_in_y,
      segments_in_x,
      segments_in_y
    ),
    new THREE.ShaderMaterial({
      wireframe: false,
      precision: "highp",
      uniforms: {
        map: {
          value: map,
        },
        displacementMap: {
          value: displacementMap,
        },
        elevation: {
          value: new THREE.Vector3(
            elevation.minElevation,
            elevation.maxElevation,
            elevation.span
          ),
        },
        ambLightColor: {
          value: __world.ambientLight.color,
        },
        ambLightIntensity: {
          value: __world.ambientLight.intensity,
        },
        dirLightColor: {
          value: __world.directionalLight.color,
        },
        dirLightDir: {
          value: __world.directionalLight.position.clone().normalize(),
        },
        dirLightIntensity: {
          value: __world.directionalLight.intensity,
        },
      },
      vertexShader: abc.vertexShader,
      fragmentShader: abc.fragmentShader,
    })
  );

  plane.rotation.x = -Math.PI / 2;
  __world.world.add(plane);

  return () => {
    __world.world.remove(plane);

    plane.geometry.dispose();
    map.dispose();
    displacementMap.dispose();
    plane.material.dispose();
  };
};

import { useEffect, useRef } from "react";

import * as THREE from "three";
import { setupThree } from "./geo/setup.js";
import * as calc from "./geo/calc.js";
import * as tile from "./geo/tile.js";

export default function (props: { latlng: L.LatLng }) {
  if (!props.latlng) {
    return <div>no latlng</div>;
  }

  return <Load {...props} />;
}

const Load = (props: { latlng: L.LatLng }) => {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { world, camera } = setupThree(elementRef.current);

    const tileIndex = calc.latLonToTile(props.latlng, calc.ZOOM_BASIS);
    const tileUrl = tile.getGoogleTileUrl(tileIndex);

    const bbox = tile.calcTileBBOX(tileIndex.x, tileIndex.y, tileIndex.z);
    const meters_in_x = calc.Meters_per_lon(bbox.center.lat);
    const meters_in_y = calc.Meters_per_lat;

    console.log(props.latlng, meters_in_x, meters_in_y);

    const textureLoader = new THREE.TextureLoader(new THREE.LoadingManager());

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(meters_in_x, meters_in_y, 1000, 1000),
      new THREE.ShaderMaterial({
        wireframe: false,
        uniforms: {
          map: {
            value: textureLoader.load(tileUrl),
          },
        },
        vertexShader: /*glsl */ `

        varying vec2 vUv;

        void main() {

          vUv = uv;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
        `,
        fragmentShader: /*glsl */ `

        uniform sampler2D map;
        varying vec2 vUv;

        void main() {
          vec4 color = texture2D(map, vUv);
          gl_FragColor = vec4(color.rgb, 1.0);
        }
        `,
      })
    );

    plane.rotation.x = -Math.PI / 2;

    world.add(plane);
    world.add(new THREE.AxesHelper(1500));
  }, []);

  return <div ref={elementRef} className=" size-full font-mono" />;
};

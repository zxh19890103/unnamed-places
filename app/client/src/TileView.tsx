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
import { SkyClouds } from "./env/clouds.js";

export default function (props: { latlng: L.LatLng }) {
  if (!props.latlng) {
    return <div>no latlng</div>;
  }

  return (
    <>
      <Load />
      <SimpleTile latlng={props.latlng} />
      {/* <Tile latlng={props.latlng} /> */}
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

    // const composer = new EffectComposer(world.renderer);
    // composer.addPass(new RenderPass(world.world, world.camera));

    // const monetShader = createMonetShader(world.resolution);
    // const monetPass = new ShaderPass(monetShader);
    // monetPass.renderToScreen = true;
    // composer.addPass(monetPass);

    // world.onBeforeRender = () => {
    //   composer.render();
    // };

    __world = world;

    return () => {
      __textureLoader = null;
      __world = null;
    };
  }, []);

  return <div ref={elementRef} className=" size-full font-mono" />;
});

const SimpleTile = (props: { latlng: L.LatLngLiteral }) => {
  const tileIndex = calc.latLonToTile(props.latlng, calc.ZOOM_BASIS);
  const key = `${tileIndex.z}/${tileIndex.x}/${tileIndex.y}`;
  return <SimpleTileRender key={key} {...tileIndex} />;
};

const SimpleTileRender = (props: { x: number; y: number; z: number }) => {
  useEffect(() => {
    (async () => {
      const tileIndex = props;
      // const url = tile.getGoogleTileUrl(props, false);
      const bbox = tile.calcTileBBOX(props.x, props.y, props.z);

      const elevation: TileElevation = await fetch(
        `/elevation/${tileIndex.z}/${tileIndex.x}/${tileIndex.y}`,
      ).then((r) => r.json());

      elevation.span *= 3;

      const displacementMap = __textureLoader.load(
        `/dem/${tileIndex.z}/${tileIndex.x}/${tileIndex.y}?bbox=${bbox.bbox}`,
      );

      displacementMap.magFilter = THREE.LinearFilter;
      displacementMap.minFilter = THREE.LinearFilter;

      const resolution = 8.5;
      const segments_in_x = Math.ceil(bbox.measureX / resolution);
      const segments_in_y = Math.ceil(bbox.measureY / resolution);

      __world.ambientLight.intensity = 3.0;

      await fetch(
        `/gootile/${tileIndex.z}/${tileIndex.x}/${tileIndex.y}?scale=4`,
      );

      const terrianVegetationMask = __textureLoader.load(
        `/gootile-mask/${tileIndex.z}/${tileIndex.x}/${tileIndex.y}`,
      );

      const demAspectTexture = __textureLoader.load(
        `/dem-aspect/${tileIndex.z}/${tileIndex.x}/${tileIndex.y}`,
      );

      const demSlopeTexture = __textureLoader.load(
        `/dem-slope/${tileIndex.z}/${tileIndex.x}/${tileIndex.y}`,
      );

      {
        const n = 3e5;
        const trees = new Float32Array(3 * n);
        const treesUv = new Float32Array(2 * n);
        const treesMeta = new Float32Array(3 * n);

        const tX = -bbox.measureX / 2;
        const tY = -bbox.measureX / 2;

        for (let i = 0; i < n; i++) {
          const s = Math.random();
          const t = Math.random();
          const x = tX + s * bbox.measureX;
          const y = tY + t * bbox.measureY;

          trees[i * 3 + 0] = x;
          trees[i * 3 + 1] = y;

          treesUv[2 * i + 0] = s;
          treesUv[2 * i + 1] = t;

          treesMeta[3 * i + 0] = Math.random() * 8;
          treesMeta[3 * i + 1] = Math.random() * 8;
          treesMeta[3 * i + 2] = 100 * (2 + 2 * Math.random());
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(trees, 3));
        geometry.setAttribute("uv", new THREE.BufferAttribute(treesUv, 2));
        geometry.setAttribute("meta", new THREE.BufferAttribute(treesMeta, 3));

        const plantsTex = __textureLoader.load(
          "/steal/data-vecteezy/plants.hackberry/_in-one",
        );

        const treesUi = new THREE.Points(
          geometry,
          new THREE.ShaderMaterial({
            uniforms: {
              map: {
                value: plantsTex,
              },
              vegetationMask: {
                value: terrianVegetationMask,
              },
              tileSize: {
                value: new THREE.Vector2(bbox.measureX, bbox.measureY),
              },
              displacementMap: { value: displacementMap },
              displacementBias: { value: 40.0 },
              displacementScale: { value: elevation.span },
              demSlopeTexture: { value: demSlopeTexture },
              terrianVegetationMask: { value: terrianVegetationMask },
            },
            vertexShader: `
              attribute vec3 meta;

              uniform sampler2D demSlopeTexture;
              uniform sampler2D terrianVegetationMask;

              uniform sampler2D displacementMap;
              uniform float displacementBias;
              uniform float displacementScale;

              varying vec4 vPos;
              varying float vSlopeDeg;
              varying float vVegetable;
              varying vec3 vMeta;

              void main() {
                vec3 iPos = position.xyz;

                float h = texture2D(displacementMap, uv).r;
                iPos.z = displacementBias + displacementScale * h;

                vPos = modelViewMatrix * vec4(iPos, 1.0);
                vSlopeDeg = texture2D(demSlopeTexture, uv).r * 90.0;
                vVegetable = texture2D(terrianVegetationMask, uv).g;
                vMeta = meta;

                gl_PointSize = meta.z * (300.0 / -vPos.z);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(iPos, 1.0);
              }
            `,
            fragmentShader: `
              uniform sampler2D map;
              uniform vec2 tileSize;

              varying vec4 vPos;
              varying float vSlopeDeg;
              varying float vVegetable;
              varying vec3 vMeta;

              void main() {
                if (vVegetable < 0.1) discard;
                if (vSlopeDeg > 45.0) discard;

                vec2 uv = gl_PointCoord;

                uv.y = 1.0 - uv.y;
                vec2 uv_offset = 0.125 * floor(vMeta.xy);
                uv = uv_offset  +  0.125 * uv;

                vec4 baseColor = texture2D(map, uv);

                if (baseColor.a < 0.5) discard;
                
                float depth = gl_FragCoord.z / gl_FragCoord.w;
                
                float fogFactor = smoothstep(10.0 , tileSize.x * 0.58, depth );
                vec3 finalColor = mix(baseColor.rgb, vec3(0.1, 0.1, 0.1), fogFactor);
                
                float bottomFactor = smoothstep( 0.5, 1.0 , gl_PointCoord.t);
                finalColor = mix(finalColor, vec3(0.0, 0.0, 0.0), bottomFactor);

                gl_FragColor = vec4(finalColor, 1.0);
              }
            `,
          }),
        );

        treesUi.rotation.x = -Math.PI / 2;
        treesUi.visible = false;
        __world.world.add(treesUi);
      }

      const perlinNoise = __textureLoader.load(
        `/public/assets/noise/perlin-noise-rgb-256x256.png`,
      );

      perlinNoise.wrapS = THREE.MirroredRepeatWrapping;
      perlinNoise.wrapT = THREE.MirroredRepeatWrapping;

      const hillSurface = __textureLoader.load("/public/assets/ODG24R0.jpg");
      hillSurface.wrapS = THREE.RepeatWrapping;
      hillSurface.wrapT = THREE.RepeatWrapping;

      const plantsCovering = __textureLoader.load(
        "/public/assets/covered-by-plants.jpg",
      );
      plantsCovering.wrapS = THREE.RepeatWrapping;
      plantsCovering.wrapT = THREE.RepeatWrapping;

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(
          bbox.measureX,
          bbox.measureY,
          segments_in_x,
          segments_in_y,
        ),
        new THREE.ShaderMaterial({
          uniforms: {
            perlinNoise: { value: perlinNoise },
            hillSurface: { value: hillSurface },
            uHealthyColor: { value: new THREE.Color(0x228b22) }, // Forest Green
            terrianVegetationMask: { value: terrianVegetationMask },
            displacementMap: { value: displacementMap },
            displacementBias: { value: elevation.minElevation },
            displacementScale: { value: elevation.span },
            demSlopeTexture: { value: demSlopeTexture },
            demAspectTexture: { value: demAspectTexture },
            plantsCovering: { value: plantsCovering },
            lowColor: { value: new THREE.Color(`#C2B280`) }, // Forest Green
            midColor: { value: new THREE.Color(`#3D5A35`) }, // Saddle Brown
            rockColor: { value: new THREE.Color("#555555") },
            highColor: { value: new THREE.Color(`#F0F8FF`) }, // Snow White
            slopeSharpness: { value: 0.6 },
            dirLightDir: { value: new THREE.Vector3(0, 1, 0) },
            dirLightColor: { value: new THREE.Color("#ffffff") },
            dirLightIntensity: { value: 2.1 },
            ambLightColor: { value: new THREE.Color("#ffffff") },
            ambLightIntensity: { value: 0.3 },
          },
          fragmentShader: `
            uniform sampler2D terrianVegetationMask;
            uniform sampler2D perlinNoise;
            uniform sampler2D hillSurface;
            uniform sampler2D plantsCovering;

            varying float vElevation;
            varying vec3 vNormal;

            uniform vec3 lowColor;
            uniform vec3 midColor;
            uniform vec3 rockColor;
            uniform vec3 highColor;
            uniform vec3 uHealthyColor;

            uniform float dirLightIntensity;
            uniform vec3 dirLightColor;
            uniform vec3 dirLightDir;

            uniform float ambLightIntensity;
            uniform vec3 ambLightColor;

            uniform float slopeSharpness;

            varying float vSlope;
            varying vec2 vUv;

            void main() {
              vec3 terrianColor;

              vec3 rockTexColor = texture2D(hillSurface, vUv * 40.0).rgb;
              vec3 noiseColor = texture2D(perlinNoise, vUv * 20.0).rgb;

              float vegetable = texture2D(terrianVegetationMask, vUv).g;

              float h0 = smoothstep(0.14, 0.15, vElevation);
              terrianColor = mix(lowColor, midColor, h0);

              float h1 = smoothstep(0.15, 0.75, vElevation);
              terrianColor = mix(terrianColor, rockTexColor, h1);

              vegetable = smoothstep(-0.5, 1.0, vegetable);
              terrianColor = mix(terrianColor, uHealthyColor * 0.18, vegetable);

              float h2 = smoothstep(0.75, 0.8, vElevation);
              float noise = smoothstep(0.5, 0.55, noiseColor.r);
              h2 = mix(0.0, h2, noise);
              terrianColor = mix(terrianColor, highColor, h2);

              float influence = smoothstep(0.82, 0.36, vSlope);
              influence += 0.78;

              vec3 finalColor = terrianColor * influence;

              // float diffuse = max(dot(vNormal, dirLightDir), 0.0);
              // vec3 lighting = ambLightColor.rgb * ambLightIntensity + (dirLightColor.rgb * diffuse) * dirLightIntensity;
              // gl_FragColor = vec4(finalColor * lighting, 1.0);
              
              gl_FragColor = vec4(finalColor, 1.0);
            }
          `,
          vertexShader: `
            uniform sampler2D displacementMap;
            uniform sampler2D demSlopeTexture;
            uniform sampler2D demAspectTexture;

            uniform float displacementBias;
            uniform float displacementScale;

            varying float vElevation;
            varying vec3 vNormal;
            varying float vSlope;
            varying vec2 vUv;

            void main() {
              vec3 ipos = position.xyz;
              float h = texture2D(displacementMap, uv).r;
              ipos.z = displacementScale * h;

              vElevation = h;
              vUv = uv;

              float slopeDeg = texture2D(demSlopeTexture, uv).r * 90.0;
              float aspectDeg = texture2D(demAspectTexture, uv).r * 360.0;

              float s = radians(slopeDeg);
              float a = radians(aspectDeg);
              
              vSlope = s;
              vec3 localNormal;

              localNormal.x = sin(s) * sin(a);   // Horizontal shift East/West
              localNormal.y = cos(s);           // Vertical component (Up)
              localNormal.z = sin(s) * -cos(a);  // Horizontal shift North/South (Negative Z is North)

              vNormal = normalize(mat3(modelMatrix) * localNormal);

              gl_Position = projectionMatrix * modelViewMatrix * vec4(ipos, 1.0);
            }
          `,
        }),
      );

      mesh.rotation.x = -Math.PI / 2;
      __world.world.add(mesh);
    })();
  }, []);

  return null;
};

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
        earthGround.add(things);
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

        earthGround.add(things);
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
        earthGround.add(things);
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
      10,
      Math.hypot(tileSize.x * 0.5),
      demInformation.elevation.minElevation,
    ),
  );

  return () => {};
};

const createMonetShader = (resolution: THREE.Vector2) => {
  const noiseTexture = __textureLoader.load(
    "/public/assets/noise/perlin-noise-rgb-256x256.png",
  );
  noiseTexture.wrapS = THREE.RepeatWrapping;
  noiseTexture.wrapT = THREE.RepeatWrapping;
  noiseTexture.minFilter = THREE.LinearFilter;

  return {
    uniforms: {
      tDiffuse: { value: null },
      uResolution: {
        value: resolution,
      },
      uRadius: { value: 3 }, // Brush size
      uNoise: {
        value: noiseTexture,
      }, // A Perlin noise texture
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D uNoise;
        uniform vec2 uResolution;
        uniform int uRadius;
        varying vec2 vUv;

        void main() {
            vec2 src_size = uResolution;

            // Offset the UVs by a small amount based on noise
            // vec2 noise = texture2D(uNoise, vUv).gb; 
            // vec2 uv = vUv + (noise - 0.5) * 0.15;

            vec2 uv = vUv;
            
            vec4 texel = texture2D(tDiffuse, uv);

            float luma = dot(texel.rgb, vec3(0.299, 0.587, 0.114));

            // float exg = 2.0 * texel.g - texel.r - texel.b;

            float vari = (texel.g - texel.r) / (texel.g + texel.r - texel.b);
            vari = min(1.0, max(vari, 0.0));
            float vari2 = smoothstep(0.1, 0.15, vari);

            gl_FragColor = mix(vec4(0.7, 0.4, 0.1, 1.0), vec4(0.0, vari, 0.0, 1.0), vari2);

            // texel.rgb = mix(vec3(luma), texel.rgb, 5.5);
            // float levels = 12.0; // Adjust this for more/less detail
            // texel.rgb = floor(texel.rgb * levels) / levels;
            // gl_FragColor = vec4(texel.rgb, 1.0);
        }
    `,
  };
};

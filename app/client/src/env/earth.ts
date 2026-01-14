import { Meters_per_lat, Meters_per_lon, ZOOM_BASIS } from "@/geo/calc.js";
import type { ThreeSetup } from "@/geo/setup.js";
import {
  calcTileBBOX,
  getGoogleTileUrl,
  splitTileDownTo4,
  type DemInformation,
  type TileBBOX,
  type TileElevation,
} from "@/geo/tile.js";
import * as THREE from "three";
import { buildGroundGeometry } from "./ground.js";

class GoogleTile extends THREE.Group {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly width: number;
  readonly height: number;

  widthSegments: number;
  heightSegments: number;

  readonly meters_per_lon: number;
  readonly meters_per_lat = Meters_per_lat;

  readonly geoCenter: THREE.Vector2;

  readonly texture: THREE.Texture;

  readonly bbox: TileBBOX;

  textLoader: THREE.TextureLoader;

  googleTileRoot: GoogleTileRoot;

  uvScale: THREE.Vector2 = new THREE.Vector2(1, 1);
  uvOffset: THREE.Vector2 = new THREE.Vector2(0, 0);

  splitPlace:
    | "bottom-left"
    | "bottom-right"
    | "top-left"
    | "top-right"
    | "none" = "none";

  constructor(
    readonly x: number,
    readonly y: number,
    readonly zoom: number,
    root: GoogleTileRoot,
    readonly threeSetup: ThreeSetup
  ) {
    super();

    const bbox = calcTileBBOX(x, y, zoom);

    this.bbox = bbox;

    const meters_per_lon = Meters_per_lon(bbox.center.lat);
    const meters_by_x =
      meters_per_lon * (bbox.rightTop.lng - bbox.leftBottom.lng);
    const meters_by_y =
      Meters_per_lat * (bbox.rightTop.lat - bbox.leftBottom.lat);

    this.width = meters_by_x;
    this.height = meters_by_y;
    this.meters_per_lon = meters_per_lon;

    const dZ = zoom - ZOOM_BASIS;
    const factor = 1 / Math.pow(2, dZ);

    this.textLoader = threeSetup.textureLoader;

    const dem_segments_by_x = threeSetup.demXSegments;
    const dem_segments_by_y = threeSetup.demYSegments;

    this.widthSegments = Math.ceil(dem_segments_by_x * factor);
    this.heightSegments = Math.ceil(dem_segments_by_y * factor);

    this.geoCenter = new THREE.Vector2(bbox.center.lng, bbox.center.lat);

    if (root !== null) {
      this.googleTileRoot = root;
    }
  }

  private teardownMesh() {
    this.remove(this.mesh);
  }

  private setupMesh() {
    this.add(this.mesh);
  }

  private buildMesh() {
    console.log(
      `${this.getTileName()} - ${this.splitPlace}`,
      this.uvScale.toArray(),
      this.uvOffset.toArray()
    );

    const map = this.textLoader.load(getGoogleTileUrl(this.bbox));
    const styledMap = this.textLoader.load(getGoogleTileUrl(this.bbox, true));

    console.log(this.googleTileRoot.elevation);
    console.log(
      this.width,
      this.height,
      this.widthSegments,
      this.heightSegments
    );

    const mesh = new THREE.Mesh(
      // buildGroundGeometry(
      //   this.width,
      //   this.height,
      //   this.widthSegments,
      //   this.heightSegments
      // ),
      new THREE.PlaneGeometry(
        this.width,
        this.height,
        this.googleTileRoot.widthSegments,
        this.googleTileRoot.heightSegments
      ),
      new THREE.ShaderMaterial({
        wireframe: false,
        transparent: true,
        precision: "highp",
        uniforms: {
          map: {
            value: map,
          },
          styledMap: {
            value: styledMap,
          },
          uvScale: {
            value: this.uvScale,
          },
          uCameraPos: {
            value: this.googleTileRoot.cameraPosLive,
          },
          uCameraPolarAngle: {
            value: this.googleTileRoot.cameraPolarAngle,
          },
          uvOffset: {
            value: this.uvOffset,
          },
          displacementMap: {
            value: this.googleTileRoot.demTexture,
          },
          displacementScale: { value: this.googleTileRoot.elevation.span },
          displacementBias: {
            value: this.googleTileRoot.elevation.minElevation + 5,
          },
          // lights
          ambLightColor: {
            value: this.threeSetup.ambientLight.color,
          },
          ambLightIntensity: {
            value: this.threeSetup.ambientLight.intensity,
          },
          dirLightColor: {
            value: this.threeSetup.directionalLight.color,
          },
          dirLightDir: {
            value: this.threeSetup.directionalLight.position
              .clone()
              .normalize(),
          },
          dirLightIntensity: {
            value: this.threeSetup.directionalLight.intensity,
          },
          demAspectMap: {
            value: this.googleTileRoot.demAspectTexture,
          },
          demSlopeMap: {
            value: this.googleTileRoot.demSlopeTexture,
          },
          riverMaskTex: {
            value: null,
          },
        },
        vertexShader: /*glsl */ `
          uniform sampler2D displacementMap;
          uniform float displacementScale;
          uniform float displacementBias;

          uniform sampler2D demSlopeMap;
          uniform sampler2D demAspectMap;

          uniform vec2 uvScale;
          uniform vec2 uvOffset;

          varying vec2 vUv;
          varying vec2 vaUv;
          varying vec3 vNormal;

          void main() {
            vUv = uv;

            vec3 pos = position.xyz;
            vec2 aUv = uvOffset + uvScale * uv;

            vaUv = aUv;

            float h = texture2D(displacementMap, aUv).r;
            pos.z += displacementBias + displacementScale * h;

            float slopeDeg = texture2D(demSlopeMap, aUv).r * 90.0;
            float aspectDeg = texture2D(demAspectMap, aUv).r * 360.0;

            float s = radians(slopeDeg);
            float a = radians(aspectDeg);

            vec3 localNormal;

            localNormal.x = sin(s) * sin(a);   // Horizontal shift East/West
            localNormal.y = cos(s);           // Vertical component (Up)
            localNormal.z = sin(s) * -cos(a);  // Horizontal shift North/South (Negative Z is North)

            vNormal = normalize(mat3(modelMatrix) * localNormal);

            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: /*glsl */ `
          uniform sampler2D map;
          uniform sampler2D styledMap;
          uniform sampler2D riverMaskTex;

          uniform vec3 uCameraPos;
          uniform float uCameraPolarAngle;

          uniform vec3 ambLightColor;
          uniform float ambLightIntensity;
          uniform vec3 dirLightColor;
          uniform float dirLightIntensity;
          uniform vec3 dirLightDir;

          varying vec2 vUv;
          varying vec2 vaUv;
          varying vec3 vNormal;

          void main() {
            vec3 baseColor = texture2D(map, vUv).rgb;
            vec3 styledBaseColor = texture2D(styledMap, vUv).rgb;

            float isRiver = texture2D(riverMaskTex, vaUv).r;

            if (isRiver > 0.5) {

              vec3 waterColor = vec3(0.6, 0.7, 0.91);
              gl_FragColor = vec4(waterColor * 0.6, 1.0);

            } else {

              float angleMask = smoothstep(0.02, 1.5, uCameraPolarAngle);

              float luminance = dot(styledBaseColor.rgb, vec3(0.2126, 0.7152, 0.0722));

              vec3 shadowColor = vec3(0.4, 0.35, 0.3); // Warm brown/grey for depths
              vec3 sunColor = vec3(1.0, 0.9, 0.7);    // Bright, warm yellow-white for highlights
              
              // 3. Blend based on brightness
              // This makes dark areas earthy and bright areas look like they are hit by sun
              vec3 warmGround = mix(shadowColor, sunColor, luminance);
              
              // 4. Boost Saturation/Contrast (Optional)
              warmGround = pow(warmGround, vec3(0.9)); // Slight gamma adjustment for pop

              baseColor = mix(warmGround, baseColor, angleMask);

              float diffuse = max(dot(vNormal, dirLightDir), 0.0);
              vec3 lighting = ambLightColor.rgb * ambLightIntensity + (dirLightColor.rgb * diffuse) * dirLightIntensity;

              gl_FragColor = vec4(baseColor * lighting, 1.0);

            }
          }
        `,
      })
    );

    this.add(mesh);
    // @ts-ignore
    this.mesh = mesh;

    mesh.frustumCulled = false;

    return mesh;
  }

  child0: GoogleTile = null;
  child1: GoogleTile = null;
  child2: GoogleTile = null;
  child3: GoogleTile = null;

  children0to3: GoogleTile[] = [];

  getUvOffsetByPlace(pla: number, vec2: THREE.Vector2) {
    if (pla === 0) {
      // bottom left
      vec2.set(0, 0);
    } else if (pla === 1) {
      // bottom right
      vec2.set(0.5, 0);
    } else if (pla === 2) {
      // top left
      vec2.set(0, 0.5);
    } else if (pla === 3) {
      // top right
      vec2.set(0.5, 0.5);
    }
  }

  getTileName() {
    return `${this.zoom}.${this.x}.${this.y}`;
  }

  getTileKey() {
    return `${this.zoom}.${this.x}.${this.y}`;
  }

  private splitted = false;

  private _split24() {
    const to4 = splitTileDownTo4(this.x, this.y, this.zoom);

    const { tiles, tiles0 } = this.googleTileRoot;
    const { uvScale, uvOffset } = this;
    const childUvScale = { x: uvScale.x * 0.5, y: uvScale.y * 0.5 };

    // bottom left, bottom right; top left, top right
    to4.asArray.forEach((bbox, idx) => {
      const tilechild = new GoogleTile(
        bbox.x,
        bbox.y,
        bbox.z,
        this.googleTileRoot,
        this.threeSetup
      );

      tiles.add(tilechild);
      tiles0.set(tilechild.getTileKey(), tilechild);
      this.children0to3.push(tilechild);

      this.getUvOffsetByPlace(idx, tilechild.uvOffset);
      tilechild.uvOffset.multiply(uvScale);
      tilechild.uvOffset.add(uvOffset);

      tilechild.uvScale.copy(childUvScale);

      const offset = tilechild.geoCenter.clone().sub(this.geoCenter);
      this.add(tilechild);
      tilechild.splitPlace = bbox.placement;

      this[`child${idx}`] = tilechild;

      const dX = tilechild.meters_per_lon * offset.x;
      const dY = tilechild.meters_per_lat * offset.y;

      tilechild.position.set(dX, dY, this.position.z);
      tilechild.buildMesh();
    });
  }

  split24() {
    this.teardownMesh();

    if (this.splitted) {
      for (const child of this.children) {
        if (child instanceof GoogleTile) {
          child.setupMesh();
        }
      }
      return;
    }

    this._split24();
    this.splitted = true;
  }

  splitChildren0to3To4() {
    for (const child of this.children0to3) {
      child.split24();
    }
  }

  unsplit24() {
    if (this.splitted) {
      this.setupMesh();
      this.teardownAllAncetorMeshes();
    }
  }

  teardownAllAncetorMeshes() {
    for (const child of this.children0to3) {
      child.teardownMesh();
      child.teardownAllAncetorMeshes();
    }
  }
}

export class GoogleTileRoot extends GoogleTile {
  readonly demTileUrl: string;

  readonly tiles: Set<GoogleTile> = new Set();
  readonly tiles0: Map<string, GoogleTile> = new Map();

  readonly demTexture: THREE.Texture;
  readonly demAspectTexture: THREE.Texture;
  readonly demSlopeTexture: THREE.Texture;

  readonly elevation: TileElevation;
  cameraPosLive: THREE.Vector3 = new THREE.Vector3();
  cameraPolarAngle: number = 90 * THREE.MathUtils.DEG2RAD;

  setRiverMaskTex(riverMaskTex: THREE.CanvasTexture) {
    console.log("hy", this.tiles.size);
    for (const tile of this.tiles) {
      tile.mesh.material.uniforms.riverMaskTex.value = riverMaskTex;
      tile.mesh.material.needsUpdate = true;
    }
  }

  constructor(x: number, y: number, threeSetup: ThreeSetup) {
    super(x, y, ZOOM_BASIS, null, threeSetup);

    this.googleTileRoot = this;

    // request dem data from openTopo
    const demInformationUrl = `/dem/${ZOOM_BASIS}/${x}/${y}?bbox=${this.bbox.bbox}`;

    this.demTexture = threeSetup.textureLoader.load(demInformationUrl);

    this.demAspectTexture = this.textLoader.load(
      `/dem-aspect/${ZOOM_BASIS}/${x}/${y}`
    );

    this.demSlopeTexture = this.textLoader.load(
      `/dem-slope/${ZOOM_BASIS}/${x}/${y}`
    );
  }

  updateMaterialUniforms() {
    for (const tile of this.tiles) {
      tile.mesh.material.uniforms.uCameraPolarAngle.value =
        this.cameraPolarAngle;
    }
  }

  async prepare() {
    const elevation: DemInformation = await fetch(
      `/elevation/${ZOOM_BASIS}/${this.x}/${this.y}`
    ).then((r) => r.json());

    // @ts-ignore
    this.elevation = elevation;

    //@ts-ignore
    this.buildMesh();
    // listen the change of camera's pos
  }
}

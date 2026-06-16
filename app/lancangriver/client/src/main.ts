import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";

import { fetchTilesManifest, tileImageUrl } from "./data/api";
import { renderDiagnostics } from "./ui/diagnostics";
import { attachCameraGui } from "./ui/camera-gui";
import { createTilesManifestModal } from "./ui/tiles-manifest-modal";
import type { TileKey } from "./view/request-scheduler";
import {
  createSatelliteRequestBudget,
  type SatelliteTextureRequest,
} from "./view/satellite-request-budget";
import { DEFAULT_LOD_PROFILE, type LODProfile } from "./view/lod-profile";
import {
  type ManifestTileEntry,
  createManifestTileSet,
  isTileInManifest,
  toTileId,
} from "./view/manifest-tiles";
import { chooseSatelliteZoom, enumerateChildTiles } from "./view/satellite-lod";
import { createTileViewportController } from "./view/tile-viewport-controller";

const baseUrl = "http://localhost:4050";
const FIXED_TILE_ZOOM = 11;
const TILE_SIZE = 256;
const TILE_SCALE = 120;
const TERRAIN_SEGMENTS = 64;
const ELEVATION_SCALE = 1;
const MANIFEST_HIT_OUTLINE_COLOR = 0x00ff66;
const FIXED_VIEW_ANGLE = Math.PI / 4;
const START_CENTER_LON = 97.17658060985056;
const START_CENTER_LAT = 31.13551645138972;
const textureLoader = new THREE.TextureLoader();

function lonLatToTile(lon: number, lat: number, zoom: number): TileKey {
  const tileCount = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * tileCount);
  const latRad = (lat * Math.PI) / 180;
  const mercatorY =
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
  const y = Math.floor(mercatorY * tileCount);

  return {
    z: zoom,
    x: Math.max(0, Math.min(tileCount - 1, x)),
    y: Math.max(0, Math.min(tileCount - 1, y)),
  };
}

function ensureAppRoot(): HTMLElement {
  let app = document.getElementById("app");
  if (!app) {
    app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
  }

  return app;
}

function createAppShell() {
  const app = ensureAppRoot();
  app.innerHTML = "";
  app.style.width = "100vw";
  app.style.height = "100vh";
  app.style.overflow = "hidden";
  app.style.margin = "0";

  const canvasHost = document.createElement("div");
  canvasHost.style.position = "absolute";
  canvasHost.style.inset = "0";
  app.appendChild(canvasHost);

  const diagnostics = document.createElement("pre");
  diagnostics.style.position = "absolute";
  diagnostics.style.left = "12px";
  diagnostics.style.top = "12px";
  diagnostics.style.margin = "0";
  diagnostics.style.padding = "12px 14px";
  diagnostics.style.background = "rgba(10, 16, 26, 0.72)";
  diagnostics.style.color = "#d7f0ff";
  diagnostics.style.font =
    "12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace";
  diagnostics.style.borderRadius = "10px";
  diagnostics.style.zIndex = "10";
  diagnostics.textContent = "booting...";
  app.appendChild(diagnostics);

  return { app, canvasHost, diagnostics };
}

function createScene(
  canvasHost: HTMLElement,
  onSatelliteLodFreezeChange?: (frozen: boolean) => void,
) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1120");

  const camera = new THREE.PerspectiveCamera(
    120,
    window.innerWidth / window.innerHeight,
    0.1,
    50000,
  );

  camera.position.set(0, 1800, 1800);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  canvasHost.appendChild(renderer.domElement);

  const controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.screenSpacePanning = false;
  controls.enableRotate = false;
  controls.minPolarAngle = FIXED_VIEW_ANGLE;
  controls.maxPolarAngle = FIXED_VIEW_ANGLE;
  controls.target.set(0, 0, 0);
  controls.update();

  const destroyCameraGui = attachCameraGui(camera, controls, {
    onSatelliteLodFreezeChange,
  });

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
  directionalLight.position.set(250, 500, 300);
  scene.add(directionalLight);

  return { scene, camera, renderer, controls, destroyCameraGui };
}

function tileToWorldPosition(tile: TileKey, origin: TileKey) {
  return {
    x: (tile.x - origin.x) * TILE_SIZE * TILE_SCALE,
    z: (tile.y - origin.y) * TILE_SIZE * TILE_SCALE,
  };
}

function createTileMesh(
  tile: TileKey,
  origin: TileKey,
): THREE.Mesh<THREE.PlaneGeometry, THREE.Material | THREE.Material[]> {
  const geometry = new THREE.PlaneGeometry(
    TILE_SIZE * TILE_SCALE,
    TILE_SIZE * TILE_SCALE,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS,
  );
  const material = new THREE.MeshStandardMaterial({
    color: 0x334455,
    roughness: 1,
    metalness: 0,
  });
  const mesh: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.Material | THREE.Material[]
  > = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  const position = tileToWorldPosition(tile, origin);
  mesh.position.set(position.x, 0, position.z);
  return mesh;
}

async function loadDemTexture(tile: TileKey) {
  return textureLoader.loadAsync(tileImageUrl(baseUrl, "dem", tile));
}

async function loadSatelliteTextureForDemTile(
  demTile: TileKey,
  satelliteZoom: number,
) {
  if (satelliteZoom <= demTile.z) {
    const texture = await textureLoader.loadAsync(
      tileImageUrl(baseUrl, "satellite", demTile),
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const childTiles = enumerateChildTiles(demTile, satelliteZoom);
  const factor = 2 ** (satelliteZoom - demTile.z);
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE * factor;
  canvas.height = TILE_SIZE * factor;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2d canvas context is unavailable");
  }

  const loadedTiles = await Promise.all(
    childTiles.map(async (tile) => {
      const texture = await textureLoader.loadAsync(
        tileImageUrl(baseUrl, "satellite", tile),
      );
      return { texture, tile };
    }),
  );

  for (const { texture, tile } of loadedTiles) {
    context.drawImage(
      texture.image,
      tile.offsetX * TILE_SIZE,
      tile.offsetY * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE,
    );
    texture.dispose();
  }

  const compositeTexture = new THREE.CanvasTexture(canvas);
  compositeTexture.colorSpace = THREE.SRGBColorSpace;
  return compositeTexture;
}

function createDebugTileMaterial(tile: TileKey) {
  const hash =
    ((tile.x * 73856093) ^ (tile.y * 19349663) ^ (tile.z * 83492791)) >>> 0;
  const hue = (hash % 360) / 360;
  const color = new THREE.Color().setHSL(hue, 0.8, 0.6);

  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
  });
}

function createManifestHitOutline(
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.Material | THREE.Material[]>,
) {
  const edges = new THREE.EdgesGeometry(mesh.geometry);
  const material = new THREE.LineBasicMaterial({
    color: MANIFEST_HIT_OUTLINE_COLOR,
    transparent: true,
    opacity: 0.9,
  });
  const lines = new THREE.LineSegments(edges, material);
  lines.renderOrder = 5;
  mesh.add(lines);
  return lines;
}

function createTerrainMaterial(
  satelliteTexture: THREE.Texture,
  demTexture: THREE.Texture,
) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSatelliteTexture: { value: satelliteTexture },
      uDemTexture: { value: demTexture },
      uElevationScale: { value: ELEVATION_SCALE },
    },
    vertexShader: `
      uniform sampler2D uDemTexture;
      uniform float uElevationScale;

      varying vec2 vUv;

      void main() {
        vUv = uv;

        vec3 demRgb = texture2D(uDemTexture, uv).rgb * 255.0;
        float elevation = (demRgb.r * 256.0 + demRgb.g + demRgb.b / 256.0) - 32768.0;

        vec3 displaced = position;
        displaced.z += elevation * uElevationScale;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uSatelliteTexture;
      varying vec2 vUv;

      void main() {
        vec4 color = texture2D(uSatelliteTexture, vUv);
        gl_FragColor = vec4(color.rgb, 1.0);
      }
    `,
  });
}

function computeViewportTiles(
  origin: TileKey,
  targetX: number,
  targetZ: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
): TileKey[] {
  const tileScale = TILE_SIZE * TILE_SCALE;
  const centerTileX = origin.x + Math.round(targetX / tileScale);
  const centerTileY = origin.y + Math.round(targetZ / tileScale);
  const radius = Math.max(
    1,
    Math.ceil(Math.max(viewportWidthPx, viewportHeightPx) / tileScale / 2) + 1,
  );
  const tileCount = 2 ** FIXED_TILE_ZOOM;
  const tiles: TileKey[] = [];

  for (
    let x = Math.max(0, centerTileX - radius);
    x <= Math.min(tileCount - 1, centerTileX + radius);
    x += 1
  ) {
    for (
      let y = Math.max(0, centerTileY - radius);
      y <= Math.min(tileCount - 1, centerTileY + radius);
      y += 1
    ) {
      tiles.push({ z: FIXED_TILE_ZOOM, x, y });
    }
  }

  return tiles;
}

function summarizeSatelliteZoomDistribution(
  runtimes: Iterable<{ satelliteZoom: number }>,
): string {
  const counts = new Map<number, number>();

  for (const runtime of runtimes) {
    counts.set(
      runtime.satelliteZoom,
      (counts.get(runtime.satelliteZoom) ?? 0) + 1,
    );
  }

  if (counts.size === 0) {
    return "none";
  }

  return Array.from(counts.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([zoom, count]) => `z${zoom}:${count}`)
    .join(",");
}

async function bootstrap() {
  const { app, canvasHost, diagnostics } = createAppShell();
  let satelliteLodFrozen = false;

  const { scene, camera, renderer, controls, destroyCameraGui } = createScene(
    canvasHost,
    (frozen) => {
      satelliteLodFrozen = frozen;
      if (!satelliteLodFrozen) {
        updateSatelliteLodForVisibleTerrain();
        refreshDiagnostics();
      }
    },
  );

  const origin = lonLatToTile(
    START_CENTER_LON,
    START_CENTER_LAT,
    FIXED_TILE_ZOOM,
  );
  const tileGroup = new THREE.Group();
  scene.add(tileGroup);
  const satelliteRequestBudget = createSatelliteRequestBudget(2, 4);
  let meshBudgetSnapshot = {
    visibleChildMeshes: 0,
    projectedChildMeshes: 0,
    splitOpsThisFrame: 0,
    mergeOpsThisFrame: 0,
    budgetExceededFrames: 0,
  };
  const lodProfile = DEFAULT_LOD_PROFILE;

  let manifestTiles: ManifestTileEntry[] = [];
  let manifestTileSet = new Set<string>();
  let manifestError = "";
  let lastError = "";

  try {
    manifestTiles = await fetchTilesManifest(baseUrl);
    manifestTileSet = createManifestTileSet(manifestTiles);
  } catch (error) {
    manifestError = String(error);
    lastError = manifestError;
  }

  const tilesManifestModal = createTilesManifestModal({
    root: app,
    entries: manifestTiles,
    onTileClick: (tile) => {
      const world = tileToWorldPosition(tile, origin);
      const offset = camera.position.clone().sub(controls.target);
      if (offset.lengthSq() === 0) {
        offset.set(
          0,
          Math.max(200, camera.position.y),
          Math.max(200, camera.position.y),
        );
      }
      const nextTarget = new THREE.Vector3(world.x, 0, world.z);

      controls.target.copy(nextTarget);
      camera.position.copy(nextTarget.clone().add(offset));
      camera.lookAt(nextTarget);
      controls.update();
      syncViewport();
    },
  });

  let lastSnapshot = {
    desiredCount: 0,
    loadedCount: 0,
    pendingCount: 0,
    failedCount: 0,
    loadedIds: [] as string[],
  };

  let manifestHits = 0;
  let manifestMisses = 0;
  let sampleHit = "";
  let sampleMiss = "";

  const loggedHitTiles = new Set<string>();
  type TerrainRuntime = {
    tile: TileKey;
    tileId: string;
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.Material | THREE.Material[]>;
    hitOutline: THREE.LineSegments;
    material?: THREE.ShaderMaterial;
    demTexture?: THREE.Texture;
    satelliteTexture?: THREE.Texture;
    satelliteZoom: number;
    requestedZoom: number;
    pending: boolean;
    requestSeq: number;
    disposed: boolean;
    parentTileId?: string;
    childTileIds: string[];
    isChildReady: boolean;
    targetZoom: number;
    zoomState: "stable" | "splitting" | "merging";
  };
  const terrainRuntimeById = new Map<string, TerrainRuntime>();

  function applySatelliteTexture(
    runtime: TerrainRuntime,
    request: SatelliteTextureRequest,
    nextTexture: THREE.Texture,
  ) {
    if (runtime.disposed || runtime.requestSeq !== request.generation) {
      nextTexture.dispose();
      return;
    }

    const previousTexture = runtime.satelliteTexture;
    runtime.satelliteTexture = nextTexture;
    runtime.satelliteZoom = request.targetZoom;

    if (runtime.material) {
      runtime.material.uniforms.uSatelliteTexture.value = nextTexture;
      runtime.material.needsUpdate = true;
    } else if (runtime.demTexture) {
      const terrainMaterial = createTerrainMaterial(
        nextTexture,
        runtime.demTexture,
      );
      runtime.mesh.material = terrainMaterial;
      runtime.material = terrainMaterial;
      runtime.material.needsUpdate = true;
    }

    if (previousTexture) {
      previousTexture.dispose();
    }
  }

  function refreshDiagnostics() {
    const satelliteBudgetSnapshot = satelliteRequestBudget.getSnapshot();

    diagnostics.textContent = renderDiagnostics({
      vectorCount: 0,
      demStatus: lastSnapshot.loadedCount > 0 ? "ok" : "na",
      satelliteStatus: lastSnapshot.loadedCount > 0 ? "ok" : "na",
      tileCount: lastSnapshot.desiredCount,
      pendingCount: lastSnapshot.pendingCount,
      satellitePendingCount:
        satelliteBudgetSnapshot.queuedCount +
        satelliteBudgetSnapshot.inFlightCount,
      failedCount: lastSnapshot.failedCount,
      lastError:
        lastError ||
        manifestError ||
        (lastSnapshot.failedCount > 0 ? "tile load failure" : ""),
      manifestSize: manifestTileSet.size,
      manifestHits,
      manifestMisses,
      sampleHit,
      sampleMiss,
      satelliteZoomDistribution: summarizeSatelliteZoomDistribution(
        terrainRuntimeById.values(),
      ),
    });
  }

  function processSatelliteRequestBudget() {
    satelliteRequestBudget.startFrame();

    while (true) {
      const request = satelliteRequestBudget.takeNext();
      if (!request) {
        return;
      }

      const runtime = terrainRuntimeById.get(request.tileId);
      if (!runtime || runtime.disposed) {
        satelliteRequestBudget.complete(request);
        continue;
      }

      void loadSatelliteTextureForDemTile(runtime.tile, request.targetZoom)
        .then((nextTexture) => {
          applySatelliteTexture(runtime, request, nextTexture);
        })
        .catch((error: unknown) => {
          console.warn("satellite lod update failed", runtime.tileId, error);
        })
        .finally(() => {
          satelliteRequestBudget.complete(request);
          if (!runtime.disposed && runtime.requestSeq === request.generation) {
            runtime.pending = false;
          }
          refreshDiagnostics();
        });
    }

    refreshDiagnostics();
  }

  function updateSatelliteLodForVisibleTerrain() {
    if (satelliteLodFrozen) {
      return;
    }

    for (const runtime of terrainRuntimeById.values()) {
      if (runtime.disposed || !runtime.demTexture) {
        continue;
      }

      const distanceToTile = camera.position.distanceTo(runtime.mesh.position);
      const desiredZoom = chooseSatelliteZoom(
        distanceToTile,
        runtime.satelliteZoom,
      );
      if (desiredZoom === runtime.requestedZoom) {
        continue;
      }

      runtime.pending = true;
      const requestSeq = runtime.requestSeq + 1;
      runtime.requestSeq = requestSeq;
      runtime.requestedZoom = desiredZoom;

      satelliteRequestBudget.enqueue({
        tileId: runtime.tileId,
        distance: distanceToTile,
        targetZoom: desiredZoom,
        generation: requestSeq,
      });
    }
  }

  const controller = createTileViewportController(async (tile) => {
    const mesh = createTileMesh(tile, origin);
    tileGroup.add(mesh);

    if (!isTileInManifest(tile, manifestTileSet)) {
      manifestMisses += 1;
      if (!sampleMiss) {
        sampleMiss = toTileId(tile);
      }
      mesh.material = createDebugTileMaterial(tile);

      return {
        dispose: () => {
          tileGroup.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            for (const material of mesh.material) {
              material.dispose();
            }
          } else {
            mesh.material.dispose();
          }
        },
      };
    }

    manifestHits += 1;
    const tileId = toTileId(tile);
    if (!sampleHit) {
      sampleHit = tileId;
    }

    if (!loggedHitTiles.has(tileId)) {
      loggedHitTiles.add(tileId);
      console.debug("[manifest-hit]", tileId, {
        worldX: mesh.position.x,
        worldZ: mesh.position.z,
      });
    }

    const hitOutline = createManifestHitOutline(mesh);
    const runtime: TerrainRuntime = {
      tile,
      tileId,
      mesh,
      hitOutline,
      satelliteZoom: FIXED_TILE_ZOOM,
      requestedZoom: FIXED_TILE_ZOOM,
      pending: false,
      requestSeq: 0,
      disposed: false,
      childTileIds: [],
      isChildReady: false,
      targetZoom: FIXED_TILE_ZOOM,
      zoomState: "stable",
      parentTileId: undefined,
    };
    terrainRuntimeById.set(tileId, runtime);

    void loadDemTexture(tile)
      .then(async (demTexture) => {
        if (runtime.disposed) {
          demTexture.dispose();
          return;
        }

        const distanceToTile = camera.position.distanceTo(mesh.position);
        const satelliteZoom = chooseSatelliteZoom(distanceToTile);
        runtime.demTexture = demTexture;
        runtime.satelliteZoom = satelliteZoom;
        if (runtime.satelliteTexture) {
          const terrainMaterial = createTerrainMaterial(
            runtime.satelliteTexture,
            demTexture,
          );
          mesh.material = terrainMaterial;
          runtime.material = terrainMaterial;
          terrainMaterial.needsUpdate = true;
        } else {
          runtime.pending = true;
          runtime.requestSeq += 1;
          runtime.requestedZoom = satelliteZoom;
          satelliteRequestBudget.enqueue({
            tileId,
            distance: distanceToTile,
            targetZoom: satelliteZoom,
            generation: runtime.requestSeq,
          });
        }
      })
      .catch((error: unknown) => {
        lastError = String(error);
        lastSnapshot = controller.getSnapshot();
        refreshDiagnostics();
      });

    return {
      dispose: () => {
        runtime.disposed = true;
        terrainRuntimeById.delete(tileId);
        tileGroup.remove(mesh);
        mesh.geometry.dispose();
        if (runtime.demTexture) {
          runtime.demTexture.dispose();
        }
        if (runtime.satelliteTexture) {
          runtime.satelliteTexture.dispose();
        }
        if (runtime.material) {
          runtime.material.dispose();
        } else if (Array.isArray(mesh.material)) {
          for (const material of mesh.material) {
            material.dispose();
          }
        } else {
          mesh.material.dispose();
        }
        hitOutline.geometry.dispose();
        hitOutline.material.dispose();
      },
    };
  });

  function syncViewport() {
    const viewTiles = computeViewportTiles(
      origin,
      controls.target.x,
      controls.target.z,
      window.innerWidth,
      window.innerHeight,
    );
    controller.sync(viewTiles);
    lastSnapshot = controller.getSnapshot();

    manifestHits = 0;
    manifestMisses = 0;
    sampleHit = "";
    sampleMiss = "";
    for (const tile of viewTiles) {
      if (isTileInManifest(tile, manifestTileSet)) {
        manifestHits += 1;
        if (!sampleHit) {
          sampleHit = toTileId(tile);
        }
      } else {
        manifestMisses += 1;
        if (!sampleMiss) {
          sampleMiss = toTileId(tile);
        }
      }
    }

    if (!satelliteLodFrozen) {
      updateSatelliteLodForVisibleTerrain();
    }

    refreshDiagnostics();
  }

  syncViewport();

  const animate = () => {
    controls.update();
    processSatelliteRequestBudget();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };

  animate();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    syncViewport();
  });

  controls.addEventListener("change", () => {
    syncViewport();
  });

  window.addEventListener(
    "beforeunload",
    () => {
      destroyCameraGui();
      tilesManifestModal.destroy();
    },
    { once: true },
  );
}

void bootstrap();

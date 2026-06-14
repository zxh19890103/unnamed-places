import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { renderDiagnostics } from "./ui/diagnostics";
import { computeRequestPlan, type TileKey } from "./view/request-scheduler";
import { createTileViewportController } from "./view/tile-viewport-controller";

const baseUrl = "http://localhost:4050";
const TILE_SIZE = 256;
const TILE_SCALE = 120;

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

  return { canvasHost, diagnostics };
}

function createScene(canvasHost: HTMLElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1120");

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    50000,
  );
  camera.position.set(0, 700, 900);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  canvasHost.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.update();

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
  directionalLight.position.set(250, 500, 300);
  scene.add(directionalLight);

  return { scene, camera, renderer, controls };
}

function tileToWorldPosition(tile: TileKey, origin: TileKey) {
  return {
    x: (tile.x - origin.x) * TILE_SIZE * TILE_SCALE,
    z: (tile.y - origin.y) * TILE_SIZE * TILE_SCALE,
  };
}

function createTileMesh(tile: TileKey, origin: TileKey) {
  const geometry = new THREE.PlaneGeometry(
    TILE_SIZE * TILE_SCALE,
    TILE_SIZE * TILE_SCALE,
    1,
    1,
  );
  const material = new THREE.MeshStandardMaterial({
    color: 0x334455,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  const position = tileToWorldPosition(tile, origin);
  mesh.position.set(position.x, 0, position.z);
  return mesh;
}

async function loadTileTextures(tile: TileKey) {
  const textureLoader = new THREE.TextureLoader();
  const [satelliteTexture, demTexture] = await Promise.all([
    textureLoader.loadAsync(
      `${baseUrl}/raster/satellite/${tile.z}/${tile.x}/${tile.y}.jpeg`,
    ),
    textureLoader.loadAsync(
      `${baseUrl}/raster/dem/${tile.z}/${tile.x}/${tile.y}.png`,
    ),
  ]);

  satelliteTexture.colorSpace = THREE.SRGBColorSpace;
  return { satelliteTexture, demTexture };
}

function computeViewportTiles(
  origin: TileKey,
  targetX: number,
  targetZ: number,
  zoom: number,
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
  const tileCount = 2 ** zoom;
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
      tiles.push({ z: zoom, x, y });
    }
  }

  return tiles;
}

async function bootstrap() {
  const { canvasHost, diagnostics } = createAppShell();
  const initialPlan = computeRequestPlan({
    centerLon: 100.5,
    centerLat: 22.1,
    zoom: 11,
    viewportWidthPx: 1024,
    viewportHeightPx: 768,
    haloTiles: 1,
  });

  const { scene, camera, renderer, controls } = createScene(canvasHost);
  const origin = initialPlan.rasterTiles[0];
  const tileGroup = new THREE.Group();
  scene.add(tileGroup);

  let lastSnapshot = {
    desiredCount: 0,
    loadedCount: 0,
    pendingCount: 0,
    failedCount: 0,
    loadedIds: [] as string[],
  };

  const controller = createTileViewportController(async (tile) => {
    const mesh = createTileMesh(tile, origin);
    tileGroup.add(mesh);

    void loadTileTextures(tile)
      .then(({ satelliteTexture, demTexture }) => {
        mesh.material = new THREE.MeshStandardMaterial({
          map: satelliteTexture,
          // displacementMap: demTexture,
          // displacementScale: 18,
          roughness: 1,
          metalness: 0,
        });
        mesh.material.needsUpdate = true;
      })
      .catch((error: unknown) => {
        lastSnapshot = controller.getSnapshot();
        diagnostics.textContent = renderDiagnostics({
          vectorCount: 0,
          demStatus: "na",
          satelliteStatus: "na",
          tileCount: lastSnapshot.desiredCount,
          pendingCount: lastSnapshot.pendingCount,
          failedCount: lastSnapshot.failedCount + 1,
          lastError: String(error),
        });
      });

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
  });

  function syncViewport() {
    const viewTiles = computeViewportTiles(
      origin,
      controls.target.x,
      controls.target.z,
      11,
      window.innerWidth,
      window.innerHeight,
    );
    controller.sync(viewTiles);
    lastSnapshot = controller.getSnapshot();
    diagnostics.textContent = renderDiagnostics({
      vectorCount: 0,
      demStatus: lastSnapshot.loadedCount > 0 ? "ok" : "na",
      satelliteStatus: lastSnapshot.loadedCount > 0 ? "ok" : "na",
      tileCount: lastSnapshot.desiredCount,
      pendingCount: lastSnapshot.pendingCount,
      failedCount: lastSnapshot.failedCount,
      lastError: lastSnapshot.failedCount > 0 ? "tile load failure" : "",
    });
  }

  syncViewport();

  const animate = () => {
    controls.update();
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
}

void bootstrap();

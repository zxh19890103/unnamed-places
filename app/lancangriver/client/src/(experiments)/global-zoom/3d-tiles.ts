import * as THREE from 'three';

type SquareRuntime = {
  eyeAngle: number;
};

type Square = {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  zoom: number;
  size: number;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null;
  parent: Square | null;
  children: Square[];
  volume: THREE.Box3;
  runtime: SquareRuntime;
};

type Create3DTilesViewerOptions = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  baseDistance?: number;
  maxZoom?: number;
};

type ThreeDTilesViewerHandle = {
  getLayerSize: () => number;
  getZoomScale: (distance: number) => number;
  getZoomLevel: (distance: number) => number;
  onEyesMove: (position: THREE.Vector3) => void;
  onDispose: () => void;
};

export function create3DTilesViewer({
  camera,
  scene,
  maxZoom = 8,
  baseDistance = 50.9,
}: Create3DTilesViewerOptions): ThreeDTilesViewerHandle {
  const minZoom = 0;
  const refineBiasStartAngle = (60 * Math.PI) / 180;
  const maxRefineViewAngle = (85 * Math.PI) / 180;
  const maxAngleZoomBiasLevels = 2;
  const rightAngle = Math.PI / 2;

  function getZoomScale(dist: number) {
    return Math.log2(baseDistance / dist);
  }

  function getZoomLevel(dist: number) {
    const zoomLevel = Math.floor(Math.log2(baseDistance / dist));
    return Math.max(minZoom, Math.min(zoomLevel, maxZoom));
  }

  function getAngleZoomBiasLevel(eyeAngle: number) {
    if (eyeAngle <= refineBiasStartAngle) {
      return 0;
    }
    if (eyeAngle >= maxRefineViewAngle) {
      return maxAngleZoomBiasLevels;
    }

    const t = (eyeAngle - refineBiasStartAngle) / (maxRefineViewAngle - refineBiasStartAngle);

    return Math.floor(t * maxAngleZoomBiasLevels);
  }

  let rootSquares: Square[] = [];
  let renderedLayer: Square[] = [];

  function createSquare(at: THREE.Vector3Like, zoom: number, size: number): Square {
    const center = new THREE.Vector3().copy(at);
    const halfSize = size / 2;
    const volume = new THREE.Box3(
      new THREE.Vector3(center.x - halfSize, center.y - halfSize, center.z),
      new THREE.Vector3(center.x + halfSize, center.y + halfSize, center.z),
    );

    return {
      pos: center,
      normal: new THREE.Vector3(0, 0, 1),
      zoom,
      size,
      mesh: null,
      parent: null,
      volume,
      runtime: { eyeAngle: 0 },
      children: [],
    };
  }

  const childCenterOffsets = [
    new THREE.Vector3(-0.5, -0.5, 0),
    new THREE.Vector3(0.5, -0.5, 0),
    new THREE.Vector3(0.5, 0.5, 0),
    new THREE.Vector3(-0.5, 0.5, 0),
  ];

  function subdivideSquare(square: Square) {
    const childSize = square.size / 2;
    const childZoom = square.zoom + 1;

    const pos0 = square.pos.clone().add(childCenterOffsets[0].clone().multiplyScalar(childSize));
    const pos1 = square.pos.clone().add(childCenterOffsets[1].clone().multiplyScalar(childSize));
    const pos2 = square.pos.clone().add(childCenterOffsets[2].clone().multiplyScalar(childSize));
    const pos3 = square.pos.clone().add(childCenterOffsets[3].clone().multiplyScalar(childSize));

    const child0 = createSquare(pos0, childZoom, childSize);
    const child1 = createSquare(pos1, childZoom, childSize);
    const child2 = createSquare(pos2, childZoom, childSize);
    const child3 = createSquare(pos3, childZoom, childSize);

    child0.parent = square;
    child1.parent = square;
    child2.parent = square;
    child3.parent = square;

    square.children = [child0, child1, child2, child3];
  }

  const cameraFrustum = new THREE.Frustum();
  const cameraProjectionMatrix = new THREE.Matrix4();

  function isSquareInside(square: Square) {
    return cameraFrustum.intersectsBox(square.volume);
  }

  function collectVisibleSquares(
    square: Square,
    eyePosition: THREE.Vector3,
    visibleSquares: Square[],
  ) {
    const distanceToSquare = eyePosition.distanceTo(square.pos);

    const squareToEyeDirection = new THREE.Vector3()
      .subVectors(eyePosition, square.pos)
      .normalize();
    const eyeAngle = squareToEyeDirection.angleTo(square.normal);

    square.runtime.eyeAngle = eyeAngle;

    if (eyeAngle > rightAngle) return;

    const distanceZoom = getZoomLevel(distanceToSquare);
    const angleZoomBias = getAngleZoomBiasLevel(eyeAngle);
    const desiredZoom = Math.max(minZoom, distanceZoom - angleZoomBias);
    const zoomDelta = desiredZoom - square.zoom;

    if (zoomDelta <= 0) {
      visibleSquares.push(square);
      return;
    }

    if (square.children.length === 0) {
      subdivideSquare(square);
    }

    for (const child of square.children) {
      collectVisibleSquares(child, eyePosition, visibleSquares);
    }
  }

  function renderSquare(square: Square, colorRatio: number) {
    if (square.mesh) {
      return;
    }

    const geometry = new THREE.PlaneGeometry(square.size, square.size);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(colorRatio, 0.85, 0.62),
      wireframe: false,
      transparent: true,
      opacity: 0.8,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(square.pos);
    scene.add(mesh);
    square.mesh = mesh;
  }

  function disposeSquare(square: Square) {
    if (!square.mesh) {
      return;
    }
    scene.remove(square.mesh);
    square.mesh.geometry.dispose();
    square.mesh.material.dispose();
    square.mesh = null;
  }

  function renderLayer(nextVisibleLayer: Square[]) {
    const nextLayerSet = new Set(nextVisibleLayer);
    for (const square of renderedLayer) {
      if (!nextLayerSet.has(square)) {
        disposeSquare(square);
      }
    }

    const count = nextVisibleLayer.length;
    let i = 0;
    for (const square of nextVisibleLayer) {
      renderSquare(square, count > 0 ? i / count : 0);
      i++;
    }

    renderedLayer = nextVisibleLayer;
  }

  function updateLayerForEyePosition(eyePosition: THREE.Vector3) {
    let visibleSquares: Square[] = [];

    camera.updateMatrixWorld();
    cameraProjectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    cameraFrustum.setFromProjectionMatrix(cameraProjectionMatrix);

    for (const rootSquare of rootSquares) {
      collectVisibleSquares(rootSquare, eyePosition, visibleSquares);
    }

    visibleSquares = visibleSquares.filter((square) => isSquareInside(square));

    renderLayer(visibleSquares);
  }

  const rootSquare = createSquare(new THREE.Vector3(), 0, 8);
  rootSquares = [rootSquare];

  // init
  updateLayerForEyePosition(camera.position);

  return {
    onEyesMove: updateLayerForEyePosition,
    getZoomLevel,
    getZoomScale,
    getLayerSize: () => {
      return renderedLayer.length;
    },
    onDispose: () => {},
  };
}

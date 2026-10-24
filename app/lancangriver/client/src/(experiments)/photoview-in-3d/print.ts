import * as THREE from 'three';
import type { PhotoviewViewer } from './_viewer';

const PRINT_WIDTH = 7016;
const PRINT_HEIGHT = 4961;
const TILE_SIZE = 2048;

/** A2 landscape at 300 DPI; preserves vertical framing and adjusts horizontal framing. */
export async function downloadScenePng(
  viewer: PhotoviewViewer,
  signal: AbortSignal,
  onProgress: (message: string) => void,
): Promise<void> {
  onProgress('Waiting for terrain and imagery...');
  const release = await viewer.prepareForPrint(signal);
  const { renderer, scene } = viewer;
  const camera = viewer.camera.clone();
  const size = renderer.getSize(new THREE.Vector2());
  const pixelRatio = renderer.getPixelRatio();
  const target = renderer.getRenderTarget();
  const viewport = renderer.getViewport(new THREE.Vector4());
  const scissor = renderer.getScissor(new THREE.Vector4());
  const scissorTest = renderer.getScissorTest();
  const culling = new Map<THREE.Object3D, boolean>();
  const canvas = document.createElement('canvas');

  try {
    signal.throwIfAborted();
    if (renderer.getContext().isContextLost()) throw new Error('WebGL context is unavailable.');
    canvas.width = PRINT_WIDTH;
    canvas.height = PRINT_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error('Unable to allocate the A2 image. Try closing other browser tabs.');
    camera.clearViewOffset();
    camera.aspect = PRINT_WIDTH / PRINT_HEIGHT;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(1);
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);

    // Shader-positioned labels can cross tile boundaries outside their geometry bounds.
    scene.traverse((object) => {
      culling.set(object, object.frustumCulled);
      object.frustumCulled = false;
    });

    const gl = renderer.getContext();
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const tileSize = Math.min(
      TILE_SIZE,
      renderer.capabilities.maxTextureSize,
      maxViewport[0],
      maxViewport[1],
    );
    const total = Math.ceil(PRINT_WIDTH / tileSize) * Math.ceil(PRINT_HEIGHT / tileSize);
    const labelScale = PRINT_HEIGHT / size.y;
    let completed = 0;

    for (let y = 0; y < PRINT_HEIGHT; y += tileSize) {
      for (let x = 0; x < PRINT_WIDTH; x += tileSize) {
        signal.throwIfAborted();
        if (gl.isContextLost()) throw new Error('WebGL context was lost during image export.');
        const width = Math.min(tileSize, PRINT_WIDTH - x);
        const height = Math.min(tileSize, PRINT_HEIGHT - y);
        renderer.setSize(width, height, false);
        renderer.setViewport(0, 0, width, height);
        viewer.updatePrintViewport(width / labelScale, height / labelScale);
        camera.setViewOffset(PRINT_WIDTH, PRINT_HEIGHT, x, y, width, height);
        renderer.render(scene, camera);
        context.drawImage(renderer.domElement, x, y);
        onProgress(`Rendering ${++completed} / ${total} tiles...`);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }

    onProgress('Encoding PNG...');
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else
          reject(new Error('PNG encoding failed. The image may exceed available browser memory.'));
      }, 'image/png');
    });
    signal.throwIfAborted();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'unnamed-places-A2-300dpi.png';
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    culling.forEach((value, object) => {
      object.frustumCulled = value;
    });
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(size.x, size.y, false);
    renderer.setRenderTarget(target);
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
    release();
  }
}

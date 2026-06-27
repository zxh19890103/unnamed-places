import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LowAltitudeTileCompositor } from "./LowAltitudeTileCompositor.class.js";
import { TileNode } from "./TilesManager.class.js";
import { distanceToLowAltitudeZoom } from "../calc/mercator.js";

function makeTileNode(): TileNode {
  return new TileNode({ z: 11, x: 1, y: 2 });
}

function makeTile(): any {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSatelliteTexture: { value: new THREE.Texture() },
    },
  });

  return {
    material,
    tile: { z: 11, x: 1, y: 2 },
  };
}

describe("FlySatelliteCompositor retry bounds", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: () => undefined,
        }),
        remove: () => undefined,
      }),
    });
  });

  it("marks retries exhausted after 5 failed attempts and logs error", async () => {
    const compositor = new LowAltitudeTileCompositor({} as any, {} as any);
    const node = makeTileNode();
    const tile = makeTile();

    vi.spyOn(compositor as any, "composeChildTiles").mockRejectedValue(
      new Error("boom"),
    );

    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    for (let i = 0; i < 5; i += 1) {
      await (compositor as any).composeAndApplyTexture(
        tile,
        node,
        2,
        i + 1,
        new AbortController().signal,
      );
    }

    expect(node.satelliteFailureCount).toBe(5);
    expect(node.satelliteRetryExhausted).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(4);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("skips scheduling retries when exhausted for unchanged target", async () => {
    const compositor = new LowAltitudeTileCompositor({} as any, {} as any);
    const node = makeTileNode();
    const tile = makeTile();
    const cameraDistance = 11_000;
    const targetZoom = distanceToLowAltitudeZoom(cameraDistance);

    node.targetLowAltitudeZoom = targetZoom;
    node.satelliteRetryExhausted = true;

    const composeSpy = vi
      .spyOn(compositor as any, "composeAndApplyTexture")
      .mockImplementation(async () => undefined);

    await compositor.updateForTiles([
      {
        node,
        tile,
        cameraDistance,
      },
    ]);

    expect(composeSpy).not.toHaveBeenCalled();
    expect(node.satellitePending).not.toBe(true);
  });
});

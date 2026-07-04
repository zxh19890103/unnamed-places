import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import fragmentShader from "./shaders/tiledem.advance.frag.glsl?raw";
import { TileDemAdvanceMaterial } from "./TileDemAdvanceMaterial.class";

function createImageStub(): HTMLImageElement {
  return {
    onload: null,
    onerror: null,
    src: "",
  } as unknown as HTMLImageElement;
}

describe("TileDemAdvanceMaterial", () => {
  it("opts into scene directional lights and references light uniforms in the fragment shader", () => {
    const textureLoader = {} as THREE.TextureLoader;
    const imageLoader = {
      load: vi.fn(() => createImageStub()),
    } as unknown as THREE.ImageLoader;

    const material = new TileDemAdvanceMaterial(textureLoader, imageLoader, {
      tileKey: { z: 11, x: 1, y: 2 },
    });

    expect(material.lights).toBe(true);
    expect(material.uniforms.ambientLightColor).toBeDefined();
    expect(fragmentShader).toContain("ambientLightColor");
    expect(fragmentShader).toContain("directionalLights");

    material.dispose();
  });

  it("reconstructs the lighting normal from slope and aspect instead of screen-space derivatives", () => {
    expect(fragmentShader).toContain(
      "float slopeRad = slope * 3.14159 / 180.0;",
    );
    expect(fragmentShader).toContain("vec3 terrainNormalLocal = vec3(");
    expect(fragmentShader).not.toContain("dFdx(vViewPos)");
    expect(fragmentShader).not.toContain("dFdy(vViewPos)");
  });
});

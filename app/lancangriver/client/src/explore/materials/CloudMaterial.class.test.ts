import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CloudMaterial } from "./CloudMaterial.class";

describe("CloudMaterial", () => {
  it("sets point-cloud friendly defaults", () => {
    const material = new CloudMaterial({});

    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.vertexShader).toContain("gl_PointSize");
    expect(material.vertexShader).toContain("attribute float spriteIndex");
    expect(material.fragmentShader).toContain("gl_PointCoord");
    expect(material.fragmentShader).toContain("uAtlasTexture");
    expect(material.uniforms.uColor.value).toBeInstanceOf(THREE.Color);
    expect(material.uniforms.uOpacity.value).toBeCloseTo(0.8, 8);
    expect(material.uniforms.uSize.value).toBeCloseTo(48, 8);
    expect(material.uniforms.uAtlasGrid.value).toBe(4);
    expect(material.uniforms.uAtlasTexture.value).toBeInstanceOf(THREE.Texture);
  });

  it("supports overriding color/size/opacity/softness", () => {
    const atlasTexture = new THREE.Texture();
    const material = new CloudMaterial({
      color: 0xffccaa,
      size: 64,
      opacity: 0.65,
      softness: 0.35,
      sizeAttenuation: false,
      atlasTexture,
      atlasGrid: 4,
    });

    expect(material.uniforms.uColor.value.getHex()).toBe(0xffccaa);
    expect(material.uniforms.uSize.value).toBeCloseTo(64, 8);
    expect(material.uniforms.uOpacity.value).toBeCloseTo(0.65, 8);
    expect(material.uniforms.uSoftness.value).toBeCloseTo(0.35, 8);
    expect(material.uniforms.uSizeAttenuation.value).toBe(0);
    expect(material.uniforms.uAtlasGrid.value).toBe(4);
    expect(material.uniforms.uAtlasTexture.value).toBe(atlasTexture);
  });
});

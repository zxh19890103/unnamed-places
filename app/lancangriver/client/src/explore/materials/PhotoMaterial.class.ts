import * as THREE from "three";
import { BASE_URL } from "../../calc/constants";
import { PhotoRecord } from "../../photos/types";
import vertexShader from "./shaders/photo.vert.glsl?raw";
import fragmentShader from "./shaders/photo.frag.glsl?raw";

type Parameters = {
  color?: THREE.ColorRepresentation;
  rec: PhotoRecord;
};

export class PhotoMaterial extends THREE.ShaderMaterial {
  constructor(textureLoader: THREE.TextureLoader, params: Parameters) {
    const { color = "#ffffff", rec } = params;

    const thumbId = encodeURIComponent(rec.filePath);
    const thumbUrl = `${BASE_URL}/photos/thumb/${thumbId}`;
    const thumbTexture = textureLoader.load(thumbUrl);

    thumbTexture.wrapS = THREE.ClampToEdgeWrapping;
    thumbTexture.wrapT = THREE.ClampToEdgeWrapping;
    thumbTexture.minFilter = THREE.LinearMipmapLinearFilter;
    thumbTexture.magFilter = THREE.LinearFilter;

    super({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uMap: { value: thumbTexture },
      },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: true,
      depthTest: true,
    });

    this.userData = {
      ...(this.userData ?? {}),
      thumbTexture,
    };
  }

  override dispose(): void {
    const map = this.uniforms.uMap?.value;
    if (map instanceof THREE.Texture) {
      map.dispose();
    }
    super.dispose();
  }
}

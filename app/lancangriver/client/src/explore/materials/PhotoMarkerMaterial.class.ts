import * as THREE from "three";
import { PhotoRecord } from "../../photos/types";
import { WorldExtent } from "../../calc/types";
import { ELEVATION_SCALE } from "../../calc/constants";
import vertexShader from "./shaders/photomarker.vert.glsl?raw";
import fragmentShader from "./shaders/photomarker.frag.glsl?raw";

type Parameters = {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture;
  rec: PhotoRecord;
  worldExtent: WorldExtent;
  worldDemTexture: THREE.Texture;
};

export class PhotoMarkerMaterial extends THREE.ShaderMaterial {
  constructor(textureLoader: THREE.TextureLoader, params: Parameters) {
    const {
      color = "#ffffff",
      map,
      rec,
      worldExtent,
      worldDemTexture,
    } = params;

    const t = (rec.lat - worldExtent.south) / worldExtent.latSpan;
    const s = (rec.lng - worldExtent.west) / worldExtent.lngSpan;

    super({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uMap: { value: map },
        uDemTexture: { value: worldDemTexture },
        uWorldUv: { value: new THREE.Vector2(s, t) },
        uElevationScale: { value: ELEVATION_SCALE },
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
      rec,
    };
  }

  override dispose(): void {
    super.dispose();
  }
}

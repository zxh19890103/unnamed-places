import * as THREE from "three";
import { BASE_URL } from "../calc/constants";
import { tileExtent } from "../calc/mercator";
import { getLocalBasisAtPoint } from "../calc/sphere";
import { type LatLng, TileNodeState } from "../calc/types";
import { fetchTileVector } from "../osm/tiles";
import { OsmBuildingTileGeometry } from "./geometries/OsmBuildingTileGeometry.class";
import { OsmBuildingTileMaterial } from "./materials/OsmBuildingTileMaterial.class";
import type { TileNode } from "./TilesManager.class";
import { latlngToSphere } from "../experiments/sphere-zoom/core";

type Parameters = {
  scene: THREE.Scene;
  baseUrl?: string;
};

export class OsmBuildingTilesController {
  private readonly scene: THREE.Scene;

  private readonly baseUrl: string;

  private readonly material: OsmBuildingTileMaterial;

  private readonly meshByTileId = new Map<
    string,
    THREE.Mesh<OsmBuildingTileGeometry, OsmBuildingTileMaterial>
  >();

  private readonly fetchInFlight = new Set<string>();

  private creationTriggered = false;

  constructor(parameters: Parameters) {
    const { scene, baseUrl = BASE_URL } = parameters;
    this.scene = scene;
    this.baseUrl = baseUrl;
    this.material = new OsmBuildingTileMaterial({
      color: "#e8b97a",
      roughness: 0.93,
      metalness: 0.02,
    });
  }

  isCreationTriggered(): boolean {
    return this.creationTriggered;
  }

  triggerCreateOnce(attachedNodes: TileNode[]): boolean {
    if (this.creationTriggered) {
      return false;
    }

    this.creationTriggered = true;
    console.log("[OSM] One-shot tile creation enabled");

    for (const node of attachedNodes) {
      void this.ensureForNode(node);
    }

    return true;
  }

  onTileCreate(node: TileNode): void {
    void this.ensureForNode(node);
  }

  onTileAttach(node: TileNode): void {
    const id = this.keyOf(node);
    const mesh = this.meshByTileId.get(id);

    if (mesh) {
      this.scene.add(mesh);
      return;
    }

    void this.ensureForNode(node);
  }

  onTileDetach(node: TileNode): void {
    const id = this.keyOf(node);
    const mesh = this.meshByTileId.get(id);
    if (mesh) {
      this.scene.remove(mesh);
    }
  }

  onTileDispose(node: TileNode): void {
    const id = this.keyOf(node);
    const mesh = this.meshByTileId.get(id);
    if (mesh) {
      this.scene.remove(mesh);
    }
  }

  dispose(): void {
    for (const mesh of this.meshByTileId.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }

    this.meshByTileId.clear();
    this.fetchInFlight.clear();
    this.material.dispose();
  }

  private keyOf(node: TileNode): string {
    return `${node.key.z}/${node.key.x}/${node.key.y}`;
  }

  private getTileCenterLatLng(node: TileNode): LatLng {
    const extent = tileExtent(node.key.z, node.key.x, node.key.y);
    return {
      lat: (extent.north + extent.south) * 0.5,
      lng: (extent.west + extent.east) * 0.5,
    };
  }

  private createMeshTransform(origin: LatLng): THREE.Matrix4 {
    const point = latlngToSphere(origin.lat, origin.lng);
    const originPoint = new THREE.Vector3(point.x, point.y, point.z);
    const { east, north, up } = getLocalBasisAtPoint(originPoint);
    const basis = new THREE.Matrix4();
    basis.makeBasis(east, up, north);
    basis.setPosition(originPoint);
    return basis;
  }

  private async ensureForNode(node: TileNode): Promise<void> {
    if (!this.creationTriggered) {
      return;
    }

    const id = this.keyOf(node);
    if (this.meshByTileId.has(id) || this.fetchInFlight.has(id)) {
      return;
    }

    this.fetchInFlight.add(id);

    try {
      const url = `${this.baseUrl}/vector/tiles/${node.key.z}/${node.key.x}/${node.key.y}.pbf`;
      const tileVector = await fetchTileVector(url, node.key);
      const features = tileVector.layers.flatMap((layer) => layer.features);

      if (features.length === 0) {
        return;
      }

      const origin = this.getTileCenterLatLng(node);
      const geometry = new OsmBuildingTileGeometry({
        features,
        origin,
      });

      const position = geometry.getAttribute("position");
      if (!position || position.count === 0) {
        geometry.dispose();
        return;
      }

      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(this.createMeshTransform(origin));
      mesh.matrixWorld.copy(mesh.matrix);
      this.meshByTileId.set(id, mesh);

      if (node.state === TileNodeState.attached) {
        this.scene.add(mesh);
      }
    } catch (error) {
      console.warn("[OSM] tile fetch/build failed", id, error);
    } finally {
      this.fetchInFlight.delete(id);
    }
  }
}

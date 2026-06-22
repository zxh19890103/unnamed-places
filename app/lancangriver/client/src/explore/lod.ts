import { ITileNode, SphereTileKey, TileNodeState } from "../calc/types";
import { SphereTile } from "./SphereTile.class";

export class TileNode implements ITileNode {
  readonly x: number;
  readonly y: number;
  readonly z: number;

  state: TileNodeState = TileNodeState.init;

  /**
   * the related tile mesh.
   */
  tile?: SphereTile;

  /**
   * Fly-mode specific metadata (resolution mode).
   * Used to track satellite texture composition state.
   */
  satelliteCurrentZoom?: number; // Current composite zoom level
  satelliteTargetZoom?: number; // Desired zoom level based on camera distance
  satellitePending?: boolean; // Composition request in flight
  satelliteRequestSeq?: number; // Generation counter for dedup

  constructor(readonly key: SphereTileKey) {
    this.x = key.x;
    this.y = key.y;
    this.z = key.z;
  }
}

export class TilesManager {
  private nodes: TileNode[];
  private updateTimer: ReturnType<typeof setTimeout> | null;

  onTileCreate?: (node: TileNode) => void;
  onTileAttach?: (node: TileNode) => void;
  onTileDetach?: (node: TileNode) => void;
  onTileDispose?: (node: TileNode) => void;

  constructor() {
    this.nodes = [];
    this.updateTimer = null;
  }

  private keyOf(key: SphereTileKey): string {
    return `${key.z}/${key.x}/${key.y}`;
  }

  setNodes(nextKeys: SphereTileKey[]) {
    const currentByKey = new Map<string, TileNode>();
    for (const node of this.nodes) {
      currentByKey.set(this.keyOf(node.key), node);
    }

    const nextByKey = new Map<string, SphereTileKey>();
    for (const key of nextKeys) {
      nextByKey.set(this.keyOf(key), key);
    }

    const reconciled: TileNode[] = [];

    for (const [id, currentNode] of currentByKey) {
      if (nextByKey.has(id)) {
        if (currentNode.state >= TileNodeState.toDetach) {
          currentNode.state = currentNode.tile
            ? TileNodeState.attached
            : TileNodeState.toAttach;
        }
        reconciled.push(currentNode);
        continue;
      }

      if (currentNode.state < TileNodeState.toDetach) {
        currentNode.state = TileNodeState.toDetach;
      }

      reconciled.push(currentNode);
    }

    for (const [id, nextKey] of nextByKey) {
      if (currentByKey.has(id)) {
        continue;
      }

      const created = new TileNode(nextKey);
      created.state = TileNodeState.toCreate;
      reconciled.push(created);
    }

    this.nodes = reconciled;
    this.scheduleApplyUpdates();
  }

  private scheduleApplyUpdates() {
    if (this.updateTimer !== null) {
      return;
    }

    this.updateTimer = setTimeout(() => {
      this.updateTimer = null;
      this.applyUpdates();
    }, 0);
  }

  applyUpdates() {
    let didChange = false;

    for (const node of this.nodes) {
      const prevState = node.state;

      switch (node.state) {
        case TileNodeState.toCreate:
          this.onTileCreate?.(node);
          node.state = TileNodeState.created;
          break;
        case TileNodeState.created:
          node.state = TileNodeState.toAttach;
          break;
        case TileNodeState.toAttach:
          // TODO: create tile mesh instance here and bind it to node.tile.
          this.onTileAttach?.(node);
          // TODO: add node.tile mesh to the scene graph here.
          node.state = TileNodeState.attached;
          break;
        case TileNodeState.attached:
          break;

        case TileNodeState.toDetach:
          this.onTileDetach?.(node);
          // TODO: remove node.tile mesh from scene graph here.
          node.state = TileNodeState.detached;
        case TileNodeState.detached:
          node.state = TileNodeState.toDispose;
          break;
        case TileNodeState.toDispose:
          this.onTileDispose?.(node);
          // TODO: dispose mesh/material/geometry resources here.
          node.state = TileNodeState.disposed;
          break;
        case TileNodeState.disposed:
          break;
        default:
          break;
      }

      if (node.state !== prevState) {
        didChange = true;
      }
    }

    this.nodes = this.nodes.filter(
      (node) => node.state !== TileNodeState.disposed,
    );

    if (didChange) {
      this.scheduleApplyUpdates();
    }
  }

  /**
   * Get the count of currently visible (attached) tiles.
   */
  getVisibleCount(): number {
    return this.nodes.filter((node) => node.state === TileNodeState.attached)
      .length;
  }

  /**
   * Get all currently attached tile nodes.
   */
  getAttachedNodes(): TileNode[] {
    return this.nodes.filter((node) => node.state === TileNodeState.attached);
  }
}

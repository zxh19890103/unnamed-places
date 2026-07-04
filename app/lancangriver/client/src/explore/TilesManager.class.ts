import {
  FocusTileRole,
  ITileNode,
  SphereTileKey,
  TileNodeState,
} from "../calc/types";
import { SphereTile } from "./SphereTile.class";

export type TileNodeInput = SphereTileKey & { focusRole?: FocusTileRole };

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
   * Low-altitude satellite composition detail level (1, 2, 3...).
   * Used in fly/groundOrbit modes to track composition state.
   */
  lowAltitudeZoom?: number; // Current composite detail level
  targetLowAltitudeZoom?: number; // Desired detail level based on camera distance

  satellitePending?: boolean; // Composition request in flight
  satelliteRequestSeq?: number; // Generation counter for dedup
  satelliteFailureCount?: number; // Consecutive composition failures
  satelliteRetryExhausted?: boolean; // Retry cap reached for current target

  focusRole?: FocusTileRole;

  constructor(
    readonly key: SphereTileKey,
    focusRole?: FocusTileRole,
  ) {
    this.x = key.x;
    this.y = key.y;
    this.z = key.z;
    this.focusRole = focusRole;
  }
}

export class TilesManager {
  frozen = false;

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

  setNodes(nextKeys: TileNodeInput[]) {
    const currentByKey = new Map<string, TileNode>();
    for (const node of this.nodes) {
      currentByKey.set(this.keyOf(node.key), node);
    }

    const nextByKey = new Map<string, TileNodeInput>();
    for (const key of nextKeys) {
      nextByKey.set(this.keyOf(key), key);
    }

    const reconciled: TileNode[] = [];

    for (const [id, currentNode] of currentByKey) {
      if (nextByKey.has(id)) {
        currentNode.focusRole = nextByKey.get(id)?.focusRole;
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

      const created = new TileNode(nextKey, nextKey.focusRole);
      created.state = TileNodeState.toCreate;
      reconciled.push(created);
    }

    this.nodes = reconciled;
    this.scheduleNodeStateTransitionProcessing();
  }

  private scheduleNodeStateTransitionProcessing() {
    if (this.updateTimer !== null) {
      return;
    }

    this.updateTimer = setTimeout(() => {
      this.updateTimer = null;
      this.processNodeStateTransitions();
    }, 0);
  }

  private processNodeStateTransitions() {
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
      this.scheduleNodeStateTransitionProcessing();
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

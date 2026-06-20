import { beforeEach, describe, expect, it, vi } from "vitest";
import { SphereTileKey, TileNodeState } from "../calc/types";
import { TilesManager } from "./lod";

function makeKey(z: number, x: number, y: number): SphereTileKey {
  return { z, x, y };
}

describe("TilesManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("fires create and attach callbacks at phase start", () => {
    const manager = new TilesManager();
    const calls: string[] = [];

    manager.onTileCreate = (node) => {
      calls.push(`create:${node.state}`);
    };
    manager.onTileAttach = (node) => {
      calls.push(`attach:${node.state}`);
    };
    manager.onTileDetach = () => {
      calls.push("detach");
    };
    manager.onTileDispose = () => {
      calls.push("dispose");
    };

    manager.setNodes([makeKey(11, 1, 2)]);
    vi.runAllTimers();

    expect(calls).toEqual([
      `create:${TileNodeState.toCreate}`,
      `attach:${TileNodeState.toAttach}`,
    ]);
  });

  it("fires detach and dispose callbacks at phase start and removes node", () => {
    const manager = new TilesManager();
    const calls: string[] = [];

    manager.onTileCreate = () => undefined;
    manager.onTileAttach = () => undefined;
    manager.onTileDetach = (node) => {
      calls.push(`detach:${node.state}`);
    };
    manager.onTileDispose = (node) => {
      calls.push(`dispose:${node.state}`);
    };

    manager.setNodes([makeKey(11, 5, 6)]);
    vi.runAllTimers();

    manager.setNodes([]);
    vi.runAllTimers();

    expect(calls).toEqual([
      `detach:${TileNodeState.toDetach}`,
      `dispose:${TileNodeState.toDispose}`,
    ]);
    expect((manager as any).nodes).toHaveLength(0);
  });

  it("keeps a tile when removed and quickly requested again", () => {
    const manager = new TilesManager();
    const calls: string[] = [];

    manager.onTileCreate = (node) => {
      (node as any).tile = {};
      calls.push("create");
    };
    manager.onTileAttach = () => {
      calls.push("attach");
    };
    manager.onTileDetach = () => {
      calls.push("detach");
    };
    manager.onTileDispose = () => {
      calls.push("dispose");
    };

    const key = makeKey(11, 8, 9);

    manager.setNodes([key]);
    vi.runAllTimers();

    manager.setNodes([]);
    manager.setNodes([key]);
    vi.runAllTimers();

    expect(calls).toEqual(["create", "attach"]);
    expect((manager as any).nodes).toHaveLength(1);
    expect((manager as any).nodes[0].state).toBe(TileNodeState.attached);
  });
});

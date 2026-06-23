export var TileNodeState;
(function (TileNodeState) {
    TileNodeState[TileNodeState["init"] = 1] = "init";
    TileNodeState[TileNodeState["toCreate"] = 5] = "toCreate";
    TileNodeState[TileNodeState["created"] = 10] = "created";
    TileNodeState[TileNodeState["toAttach"] = 15] = "toAttach";
    TileNodeState[TileNodeState["attached"] = 20] = "attached";
    TileNodeState[TileNodeState["toDetach"] = 50] = "toDetach";
    TileNodeState[TileNodeState["detached"] = 60] = "detached";
    TileNodeState[TileNodeState["toDispose"] = 70] = "toDispose";
    TileNodeState[TileNodeState["disposed"] = 80] = "disposed";
})(TileNodeState || (TileNodeState = {}));

export type SatelliteTextureRequest = {
  tileId: string;
  distance: number;
  targetZoom: number;
  generation: number;
};

type QueuedRequest = SatelliteTextureRequest & {
  order: number;
};

export type SatelliteRequestBudgetSnapshot = {
  queuedCount: number;
  inFlightCount: number;
};

export type SatelliteRequestBudget = {
  enqueue(request: SatelliteTextureRequest): void;
  startFrame(): void;
  takeNext(): SatelliteTextureRequest | undefined;
  complete(request: SatelliteTextureRequest): void;
  getSnapshot(): SatelliteRequestBudgetSnapshot;
};

function requestKey(request: SatelliteTextureRequest): string {
  return `${request.tileId}|${request.targetZoom}|${request.generation}`;
}

export function createSatelliteRequestBudget(
  maxPerFrame: number,
  maxConcurrent: number,
): SatelliteRequestBudget {
  const queue: QueuedRequest[] = [];
  const queuedKeyToIndex = new Map<string, number>();
  const latestGenerationByTileId = new Map<string, number>();
  const activeRequests = new Set<string>();

  let frameIssuedCount = 0;
  let inFlightCount = 0;
  let nextOrder = 0;

  const safeMaxPerFrame = Math.max(0, Math.floor(maxPerFrame));
  const safeMaxConcurrent = Math.max(0, Math.floor(maxConcurrent));

  function isStale(request: QueuedRequest): boolean {
    return latestGenerationByTileId.get(request.tileId) !== request.generation;
  }

  function rebuildQueueIndex(fromIndex: number): void {
    for (let index = fromIndex; index < queue.length; index += 1) {
      queuedKeyToIndex.set(requestKey(queue[index]), index);
    }
  }

  function pruneQueue(): void {
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < queue.length; readIndex += 1) {
      const request = queue[readIndex];
      if (isStale(request)) {
        queuedKeyToIndex.delete(requestKey(request));
        continue;
      }

      queue[writeIndex] = request;
      queuedKeyToIndex.set(requestKey(request), writeIndex);
      writeIndex += 1;
    }

    queue.length = writeIndex;
  }

  function insertRequest(request: SatelliteTextureRequest): void {
    const key = requestKey(request);
    const existingIndex = queuedKeyToIndex.get(key);

    if (existingIndex != null) {
      queue[existingIndex] = {
        ...request,
        order: queue[existingIndex].order,
      };
      return;
    }

    const queuedRequest: QueuedRequest = {
      ...request,
      order: nextOrder,
    };
    nextOrder += 1;

    let insertIndex = queue.length;
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (queuedRequest.distance < current.distance) {
        insertIndex = index;
        break;
      }

      if (
        queuedRequest.distance === current.distance &&
        queuedRequest.order < current.order
      ) {
        insertIndex = index;
        break;
      }
    }

    queue.splice(insertIndex, 0, queuedRequest);
    rebuildQueueIndex(insertIndex);
  }

  function removeRequest(index: number): QueuedRequest {
    const [request] = queue.splice(index, 1);
    queuedKeyToIndex.delete(requestKey(request));
    rebuildQueueIndex(index);
    return request;
  }

  return {
    enqueue(request) {
      const currentGeneration = latestGenerationByTileId.get(request.tileId);
      if (currentGeneration != null && request.generation < currentGeneration) {
        return;
      }

      latestGenerationByTileId.set(request.tileId, request.generation);
      insertRequest(request);
    },

    startFrame() {
      frameIssuedCount = 0;
    },

    takeNext() {
      if (
        frameIssuedCount >= safeMaxPerFrame ||
        inFlightCount >= safeMaxConcurrent
      ) {
        return undefined;
      }

      pruneQueue();

      if (queue.length === 0) {
        return undefined;
      }

      const request = removeRequest(0);
      activeRequests.add(requestKey(request));
      frameIssuedCount += 1;
      inFlightCount += 1;

      return {
        tileId: request.tileId,
        distance: request.distance,
        targetZoom: request.targetZoom,
        generation: request.generation,
      };
    },

    complete(request) {
      const key = requestKey(request);
      if (!activeRequests.delete(key)) {
        return;
      }

      inFlightCount = Math.max(0, inFlightCount - 1);
    },

    getSnapshot() {
      pruneQueue();

      return {
        queuedCount: queue.length,
        inFlightCount,
      };
    },
  };
}

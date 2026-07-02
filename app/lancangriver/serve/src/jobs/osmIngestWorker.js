export function createOsmIngestWorker({ jobs, fetchOsmFeatures, upsertVectorFeatures }) {
  return {
    async tickOnce() {
      const job = await jobs.claimNextQueued();
      if (!job) {
        return false;
      }

      await jobs.markRunning(job.z12Key);

      try {
        const features = await fetchOsmFeatures(job.z12Key);
        await upsertVectorFeatures(features);
        await jobs.markDone(job.z12Key);
      } catch (error) {
        await jobs.markFailed(job.z12Key, String(error?.message ?? error));
      }

      return true;
    }
  };
}

export function createOsmIngestRunner({ worker, intervalMs = 2000 }) {
  let timer = null;
  let running = false;

  async function loop() {
    if (!running) {
      return;
    }

    try {
      const progressed = await worker.tickOnce();
      const delay = progressed ? 50 : intervalMs;
      timer = setTimeout(loop, delay);
    } catch (_error) {
      timer = setTimeout(loop, intervalMs);
    }
  }

  return {
    start() {
      if (running) {
        return;
      }

      running = true;
      timer = setTimeout(loop, 0);
    },

    stop() {
      running = false;
      if (timer) {
        clearTimeout(timer);
      }
      timer = null;
    }
  };
}

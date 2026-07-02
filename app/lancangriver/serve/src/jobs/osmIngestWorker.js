export function createOsmIngestWorker({ jobs, fetchOsmFeatures, upsertVectorFeatures, logger = console }) {
  return {
    async tickOnce() {
      const job = await jobs.claimNextQueued();
      if (!job) {
        if (typeof logger?.debug === 'function') {
          logger.debug('[osm-jobs] idle: no queued jobs');
        }
        return false;
      }

      await jobs.markRunning(job.z12Key);
      if (typeof logger?.info === 'function') {
        logger.info(`[osm-jobs] running ${job.z12Key}`);
      }

      try {
        const features = await fetchOsmFeatures(job.z12Key);
        await upsertVectorFeatures(features);
        await jobs.markDone(job.z12Key);

        if (typeof logger?.info === 'function') {
          logger.info(`[osm-jobs] done ${job.z12Key} features=${features.length}`);
        }
      } catch (error) {
        const message = String(error?.message ?? error);
        await jobs.markFailed(job.z12Key, message);

        if (typeof logger?.error === 'function') {
          logger.error(`[osm-jobs] failed ${job.z12Key} reason=${message}`);
        }
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

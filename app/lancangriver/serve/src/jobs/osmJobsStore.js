export function createOsmJobsStore({ db }) {
  return {
    async enqueueIfMissing(z12Key) {
      const result = await db.query(
        `INSERT INTO public.osm_ingest_jobs (z12_key, status)
         VALUES ($1, 'queued')
         ON CONFLICT (z12_key) DO NOTHING`,
        [z12Key]
      );

      return { enqueued: result.rowCount > 0 };
    },

    async getStatuses(keys) {
      if (!Array.isArray(keys) || keys.length === 0) {
        return {};
      }

      const result = await db.query(
        `SELECT z12_key, status
         FROM public.osm_ingest_jobs
         WHERE z12_key = ANY($1::text[])`,
        [keys]
      );

      return Object.fromEntries(result.rows.map((row) => [row.z12_key, row.status]));
    },

    async claimNextQueued() {
      const result = await db.query(
        `SELECT z12_key
         FROM public.osm_ingest_jobs
         WHERE status = 'queued'
         ORDER BY queued_at ASC
         LIMIT 1`
      );

      if (result.rows.length === 0) {
        return null;
      }

      return { z12Key: result.rows[0].z12_key };
    },

    async markRunning(z12Key) {
      await db.query(
        `UPDATE public.osm_ingest_jobs
         SET status = 'running',
             started_at = NOW(),
             updated_at = NOW(),
             attempt_count = attempt_count + 1
         WHERE z12_key = $1`,
        [z12Key]
      );
    },

    async markDone(z12Key) {
      await db.query(
        `UPDATE public.osm_ingest_jobs
         SET status = 'done',
             finished_at = NOW(),
             last_error = NULL,
             updated_at = NOW()
         WHERE z12_key = $1`,
        [z12Key]
      );
    },

    async markFailed(z12Key, message) {
      await db.query(
        `UPDATE public.osm_ingest_jobs
         SET status = 'failed',
             finished_at = NOW(),
             last_error = $2,
             updated_at = NOW()
         WHERE z12_key = $1`,
        [z12Key, message]
      );
    }
  };
}

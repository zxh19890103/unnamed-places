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

    async getStatus(z12Key) {
      const result = await db.query(
        `SELECT status
         FROM public.osm_ingest_jobs
         WHERE z12_key = $1`,
        [z12Key]
      );

      return result.rows[0]?.status ?? null;
    },

    async listLoaded({ limit, offset }) {
      const pageResult = await db.query(
        `SELECT z12_key
         FROM public.osm_ingest_jobs
         WHERE status = 'done'
         ORDER BY z12_key ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      const countResult = await db.query(
        `SELECT COUNT(*)::integer AS total
         FROM public.osm_ingest_jobs
         WHERE status = 'done'`
      );

      return {
        keys: pageResult.rows.map((row) => row.z12_key),
        total: countResult.rows[0]?.total ?? 0
      };
    },

    async listJobs({ limit, offset }) {
      const pageResult = await db.query(
        `SELECT jobs.z12_key, jobs.status, geo_info.display_name
         FROM public.osm_ingest_jobs AS jobs
         LEFT JOIN public.z12geoinfo AS geo_info
           ON geo_info.z12_key = jobs.z12_key
         ORDER BY jobs.queued_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      const countResult = await db.query(
        `SELECT COUNT(*)::integer AS total
         FROM public.osm_ingest_jobs`
      );

      return {
        jobs: pageResult.rows.map((row) => ({
          key: row.z12_key,
          status: row.status,
          displayName: row.display_name ?? null
        })),
        total: countResult.rows[0]?.total ?? 0
      };
    },

    async rerunFailed(z12Key) {
      const updateResult = await db.query(
        `UPDATE public.osm_ingest_jobs
         SET status = 'queued',
             queued_at = NOW(),
             started_at = NULL,
             finished_at = NULL,
             last_error = NULL,
             updated_at = NOW()
         WHERE z12_key = $1
           AND status = 'failed'
         RETURNING status`,
        [z12Key]
      );

      if (updateResult.rowCount > 0) {
        return 'queued';
      }

      const statusResult = await db.query(
        `SELECT status
         FROM public.osm_ingest_jobs
         WHERE z12_key = $1`,
        [z12Key]
      );

      return statusResult.rows.length === 0 ? 'not_found' : 'not_failed';
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

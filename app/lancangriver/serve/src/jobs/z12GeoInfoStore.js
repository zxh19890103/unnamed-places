export function createZ12GeoInfoStore({ db }) {
  return {
    async upsert({ z12Key, displayName, rawData }) {
      const result = await db.query(
        `INSERT INTO public.z12geoinfo (z12_key, display_name, raw_data)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (z12_key)
         DO UPDATE SET
           display_name = EXCLUDED.display_name,
           raw_data = EXCLUDED.raw_data
         RETURNING z12_key, display_name, raw_data`,
        [z12Key, displayName, JSON.stringify(rawData)],
      );

      return result.rows[0];
    },

    async get(z12Key) {
      const result = await db.query(
        `SELECT z12_key, display_name, raw_data
         FROM public.z12geoinfo
         WHERE z12_key = $1`,
        [z12Key],
      );

      return result.rows[0] ?? null;
    },
  };
}

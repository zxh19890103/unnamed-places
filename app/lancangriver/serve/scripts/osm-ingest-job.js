import '../src/env.js';
import { dbQuery, upsertVectorFeatures } from '../src/db.js';
import { createOsmJobsStore } from '../src/jobs/osmJobsStore.js';
import { getVectorIngestSource } from '../src/jobs/vectorSourceConfig.js';
import { createVectorFeatureFetcher } from '../src/jobs/vectorSourceRegistry.js';

function printUsage() {
  console.log(`
Run one vector ingest job by canonical z12 key.

Usage:
  npm run osm:ingest:job -- --key 12/3456/1523

Options:
  --key <12/x/y>     Required canonical zoom-12 job key.
  --enqueue-only     Only create/queue the job. Do not fetch/ingest now.
  --force            Force status back to queued before running ingest.
  --help, -h         Show this help.
`);
}

function parseArgs(argv) {
  const options = {
    key: null,
    enqueueOnly: false,
    force: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--key') {
      options.key = argv[i + 1] ?? null;
      i += 1;
      continue;
    }

    if (token === '--enqueue-only') {
      options.enqueueOnly = true;
      continue;
    }

    if (token === '--force') {
      options.force = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!options.key || !/^12\/\d+\/\d+$/.test(options.key)) {
    throw new Error('Invalid or missing --key. Expected format: 12/x/y');
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv);
  const jobs = createOsmJobsStore({ db: { query: dbQuery } });
  const source = getVectorIngestSource();
  const fetchFeaturesForZ12Key = createVectorFeatureFetcher(source);

  if (options.force) {
    await dbQuery(
      `INSERT INTO public.osm_ingest_jobs (z12_key, status)
       VALUES ($1, 'queued')
       ON CONFLICT (z12_key)
       DO UPDATE SET
         status = 'queued',
         last_error = NULL,
         started_at = NULL,
         finished_at = NULL,
         updated_at = NOW()`,
      [options.key]
    );
    console.log(`[vector-job-cli source=${source}] forced queued ${options.key}`);
  } else {
    const enqueueResult = await jobs.enqueueIfMissing(options.key);
    console.log(
      enqueueResult.enqueued
        ? `[vector-job-cli source=${source}] queued ${options.key}`
        : `[vector-job-cli source=${source}] job already exists ${options.key}`
    );
  }

  if (options.enqueueOnly) {
    console.log(`[vector-job-cli source=${source}] enqueue-only mode, exiting`);
    return;
  }

  await jobs.markRunning(options.key);
  console.log(`[vector-job-cli source=${source}] running ${options.key}`);

  try {
    const features = await fetchFeaturesForZ12Key(options.key);
    await upsertVectorFeatures(features);
    await jobs.markDone(options.key);
    console.log(`[vector-job-cli source=${source}] done ${options.key} features=${features.length}`);
  } catch (error) {
    const message = String(error?.message ?? error);
    await jobs.markFailed(options.key, message);
    console.error(`[vector-job-cli source=${source}] failed ${options.key} reason=${message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});

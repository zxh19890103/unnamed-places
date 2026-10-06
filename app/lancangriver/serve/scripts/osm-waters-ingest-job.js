import '../src/env.js';
import { dbQuery, upsertVectorFeaturesWaters } from '../src/db.js';
import { createOsmWatersJobsStore } from '../src/jobs/osmWatersJobsStore.js';
import { fetchOsmWaterFeaturesForZ12Key } from '../src/jobs/osmFetch.js';

function printUsage() {
  console.log(`
Run one OSM waters ingest job by canonical z12 key.

Usage:
  npm run osm:ingest:waters:job -- --key 12/3456/1523

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
    force: false,
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
  const jobs = createOsmWatersJobsStore({ db: { query: dbQuery } });

  if (options.force) {
    await dbQuery(
      `INSERT INTO public.osm_ingest_jobs_waters (z12_key, status)
       VALUES ($1, 'queued')
       ON CONFLICT (z12_key)
       DO UPDATE SET
         status = 'queued',
         last_error = NULL,
         started_at = NULL,
         finished_at = NULL,
         updated_at = NOW()`,
      [options.key],
    );
    console.log(`[osm-waters-job-cli] forced queued ${options.key}`);
  } else {
    const enqueueResult = await jobs.enqueueIfMissing(options.key);
    console.log(
      enqueueResult.enqueued
        ? `[osm-waters-job-cli] queued ${options.key}`
        : `[osm-waters-job-cli] job already exists ${options.key}`,
    );
  }

  if (options.enqueueOnly) {
    console.log('[osm-waters-job-cli] enqueue-only mode, exiting');
    return;
  }

  await jobs.markRunning(options.key);
  console.log(`[osm-waters-job-cli] running ${options.key}`);

  try {
    const features = await fetchOsmWaterFeaturesForZ12Key(options.key);
    await upsertVectorFeaturesWaters(features);
    await jobs.markDone(options.key);
    console.log(`[osm-waters-job-cli] done ${options.key} features=${features.length}`);
  } catch (error) {
    const message = String(error?.message ?? error);
    await jobs.markFailed(options.key, message);
    console.error(`[osm-waters-job-cli] failed ${options.key} reason=${message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});

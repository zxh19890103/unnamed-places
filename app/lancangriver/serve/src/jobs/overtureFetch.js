import { spawn } from 'node:child_process';

import { getZ12EnvelopeFromKey } from './tileCoverage.js';
import { normalizeOvertureFeatures } from './overtureNormalize.js';

const DEFAULT_OVERTURE_CMD = 'overturemaps';

function readIntOption(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanOption(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  return fallback;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableOvertureError(error) {
  const message = String(error?.message ?? error).toLowerCase();
  return (
    message.includes('network_connection') ||
    message.includes('timeout') ||
    message.includes('error reading stac index') ||
    message.includes('aws-s3')
  );
}

function filterOvertureWaterFeatures(rawFeatures, options) {
  const features = Array.isArray(rawFeatures) ? rawFeatures : [];

  return features.filter((feature) => {
    const geometryType = feature?.geometry?.type;
    const properties = feature?.properties ?? {};
    const subtype = properties.subtype;
    const waterClass = properties.class;

    if (
      options.inlandOnly &&
      (subtype === 'ocean' || (subtype === 'physical' && (waterClass === 'ocean' || waterClass === 'sea')))
    ) {
      return false;
    }

    if (options.polygonsOnly && geometryType !== 'Polygon' && geometryType !== 'MultiPolygon') {
      return false;
    }

    return true;
  });
}

function parseCommand(rawCommand) {
  const command = String(rawCommand ?? DEFAULT_OVERTURE_CMD).trim();
  if (!command) {
    throw new Error('Overture command is empty. Set OVERTUREMAPS_CMD or install overturemaps CLI.');
  }

  const parts = command.split(/\s+/);
  return {
    executable: parts[0],
    prefixArgs: parts.slice(1)
  };
}

function parseGeoJsonOutput(rawOutput, sourceLabel) {
  const trimmed = String(rawOutput ?? '').trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('Error')) {
    throw new Error(`Overture ${sourceLabel} command returned error output: ${trimmed}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Overture ${sourceLabel} output is not valid JSON: ${error.message}`);
  }

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed?.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
    return parsed.features;
  }

  if (parsed?.type === 'Feature') {
    return [parsed];
  }

  throw new Error(`Overture ${sourceLabel} output must be a GeoJSON FeatureCollection or Feature`);
}

function runOvertureDownload(rawCommand, args, sourceLabel, spawnImpl = spawn) {
  const { executable, prefixArgs } = parseCommand(rawCommand);
  const startedAt = Date.now();

  console.info(`[overture] ${sourceLabel} command start: ${executable} ${[...prefixArgs, ...args].join(' ')}`);

  return new Promise((resolve, reject) => {
    const child = spawnImpl(executable, [...prefixArgs, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    const progressTimer = setInterval(() => {
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
      console.info(`[overture] ${sourceLabel} command in progress (${elapsedSeconds}s elapsed)`);
    }, 15000);

    function clearProgressTimer() {
      clearInterval(progressTimer);
    }

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      clearProgressTimer();
      if (error?.code === 'ENOENT') {
        reject(
          new Error(
            `Overture command not found: ${executable}. Install it via \`pip install overturemaps\` and ensure it is on PATH.`
          )
        );
        return;
      }
      reject(error);
    });

    child.on('close', (exitCode) => {
      clearProgressTimer();
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

      if (exitCode !== 0) {
        const details = stderr.trim() || stdout.trim() || 'no output';
        console.warn(`[overture] ${sourceLabel} command failed after ${elapsedSeconds}s`);
        reject(new Error(`Overture ${sourceLabel} command failed (exit ${exitCode}): ${details}`));
        return;
      }

      console.info(`[overture] ${sourceLabel} command finished in ${elapsedSeconds}s`);
      resolve(stdout);
    });
  });
}

async function fetchThemeFeatures(command, bbox, extraArgs, sourceLabel, spawnImpl) {
  const commandOptions = extraArgs.commandOptions ?? {};
  const additionalArgs = [];

  if (commandOptions.release) {
    additionalArgs.push('-r', commandOptions.release);
  }
  if (commandOptions.connectTimeoutSeconds > 0) {
    additionalArgs.push('--connect_timeout', String(commandOptions.connectTimeoutSeconds));
  }
  if (commandOptions.requestTimeoutSeconds > 0) {
    additionalArgs.push('--request_timeout', String(commandOptions.requestTimeoutSeconds));
  }
  if (commandOptions.useStac === false) {
    additionalArgs.push('--no-stac');
  }

  const args = ['download', `--bbox=${bbox}`, '-f', 'geojson', ...additionalArgs, ...extraArgs.args];

  const retries = Math.max(0, commandOptions.retries ?? 0);
  const retryDelayMs = Math.max(0, commandOptions.retryDelayMs ?? 1000);

  let attempt = 0;
  while (true) {
    try {
      const rawOutput = await runOvertureDownload(command, args, sourceLabel, spawnImpl);
      return parseGeoJsonOutput(rawOutput, sourceLabel);
    } catch (error) {
      attempt += 1;
      if (attempt > retries || !isRetryableOvertureError(error)) {
        throw error;
      }

      const message = String(error?.message ?? error);
      console.warn(
        `[overture] ${sourceLabel} retry ${attempt}/${retries} after error: ${message}`
      );
      await delay(retryDelayMs);
    }
  }
}

export async function fetchOvertureFeaturesForZ12Key(z12Key, options = {}) {
  const ingestStart = Date.now();
  const { minLon, minLat, maxLon, maxLat } = getZ12EnvelopeFromKey(z12Key);
  const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
  const command = options.command ?? process.env.OVERTUREMAPS_CMD ?? DEFAULT_OVERTURE_CMD;
  const spawnImpl = options.spawnImpl ?? spawn;
  const allowPartial = options.allowPartial ?? process.env.OVERTURE_ALLOW_PARTIAL !== 'false';
  const useStac = readBooleanOption(options.useStac, readBooleanOption(process.env.OVERTURE_USE_STAC, true));
  const stacFallbackToNoStac = readBooleanOption(
    options.stacFallbackToNoStac,
    readBooleanOption(process.env.OVERTURE_STAC_FALLBACK_TO_NO_STAC, true)
  );
  const release = options.release ?? process.env.OVERTURE_RELEASE ?? null;
  const connectTimeoutSeconds = readIntOption(
    options.connectTimeoutSeconds,
    readIntOption(process.env.OVERTURE_CONNECT_TIMEOUT, 20)
  );
  const requestTimeoutSeconds = readIntOption(
    options.requestTimeoutSeconds,
    readIntOption(process.env.OVERTURE_REQUEST_TIMEOUT, 120)
  );
  const retries = readIntOption(options.retries, readIntOption(process.env.OVERTURE_DOWNLOAD_RETRIES, 1));
  const retryDelayMs = readIntOption(
    options.retryDelayMs,
    readIntOption(process.env.OVERTURE_DOWNLOAD_RETRY_DELAY_MS, 1500)
  );

  async function fetchWithOptionalStacFallback(sourceLabel, args) {
    const baseCommandOptions = {
      useStac,
      release,
      connectTimeoutSeconds,
      requestTimeoutSeconds,
      retries,
      retryDelayMs
    };

    try {
      return await fetchThemeFeatures(command, bbox, { args, commandOptions: baseCommandOptions }, sourceLabel, spawnImpl);
    } catch (error) {
      if (!stacFallbackToNoStac || useStac === false) {
        throw error;
      }

      const message = String(error?.message ?? error).toLowerCase();
      if (!message.includes('stac index') && !message.includes('aws-s3')) {
        throw error;
      }

      console.warn(
        `[overture] ${sourceLabel} failed with STAC, retrying once with --no-stac`
      );

      return fetchThemeFeatures(
        command,
        bbox,
        {
          args,
          commandOptions: {
            ...baseCommandOptions,
            useStac: false,
            retries: 0
          }
        },
        sourceLabel,
        spawnImpl
      );
    }
  }
  const waterFilterOptions = {
    inlandOnly: readBooleanOption(options.waterInlandOnly, readBooleanOption(process.env.OVERTURE_WATER_INLAND_ONLY, false)),
    polygonsOnly: readBooleanOption(
      options.waterPolygonsOnly,
      readBooleanOption(process.env.OVERTURE_WATER_POLYGONS_ONLY, false)
    )
  };

  console.info(
    `[overture] ingest start ${z12Key} bbox=${bbox} stac=${useStac} release=${release ?? 'latest'} retries=${retries}`
  );
  console.info(`[overture] ${z12Key} fetching buildings`);

  const buildingFeatures = await fetchWithOptionalStacFallback('buildings', ['-t', 'building']);
  console.info(`[overture] ${z12Key} buildings fetched count=${buildingFeatures.length}`);

  let waterFeatures = [];
  try {
    console.info(`[overture] ${z12Key} fetching water`);
    const rawWaterFeatures = await fetchWithOptionalStacFallback('water', ['-t', 'water']);
    waterFeatures = filterOvertureWaterFeatures(rawWaterFeatures, waterFilterOptions);
    console.info(
      `[overture] ${z12Key} water fetched raw=${rawWaterFeatures.length} kept=${waterFeatures.length}`
    );
  } catch (error) {
    if (!allowPartial) {
      throw error;
    }

    const message = String(error?.message ?? error);
    console.warn(`[overture] water fetch failed, continuing with buildings only: ${message}`);
  }

  const normalized = normalizeOvertureFeatures([...buildingFeatures, ...waterFeatures]);
  const ingestElapsedSeconds = Math.round((Date.now() - ingestStart) / 1000);
  console.info(
    `[overture] ingest done ${z12Key} normalized=${normalized.length} elapsed=${ingestElapsedSeconds}s`
  );

  return normalized;
}

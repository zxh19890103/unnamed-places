import { spawn } from 'node:child_process';

import { getZ12EnvelopeFromKey } from './tileCoverage.js';
import { normalizeOvertureFeatures } from './overtureNormalize.js';

const DEFAULT_OVERTURE_CMD = 'overturemaps';

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
  let parsed;
  try {
    parsed = JSON.parse(rawOutput);
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

  return new Promise((resolve, reject) => {
    const child = spawnImpl(executable, [...prefixArgs, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
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
      if (exitCode !== 0) {
        const details = stderr.trim() || stdout.trim() || 'no output';
        reject(new Error(`Overture ${sourceLabel} command failed (exit ${exitCode}): ${details}`));
        return;
      }

      resolve(stdout);
    });
  });
}

async function fetchThemeFeatures(command, bbox, extraArgs, sourceLabel, spawnImpl) {
  const args = ['download', `--bbox=${bbox}`, '-f', 'geojson', ...extraArgs];
  const rawOutput = await runOvertureDownload(command, args, sourceLabel, spawnImpl);
  return parseGeoJsonOutput(rawOutput, sourceLabel);
}

export async function fetchOvertureFeaturesForZ12Key(z12Key, options = {}) {
  const { minLon, minLat, maxLon, maxLat } = getZ12EnvelopeFromKey(z12Key);
  const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
  const command = options.command ?? process.env.OVERTUREMAPS_CMD ?? DEFAULT_OVERTURE_CMD;
  const spawnImpl = options.spawnImpl ?? spawn;

  const [buildingFeatures, waterFeatures] = await Promise.all([
    fetchThemeFeatures(command, bbox, ['-t', 'building'], 'buildings', spawnImpl),
    fetchThemeFeatures(command, bbox, ['-t', 'water'], 'water', spawnImpl)
  ]);

  return normalizeOvertureFeatures([...buildingFeatures, ...waterFeatures]);
}

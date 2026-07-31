import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import { fetchOvertureFeaturesForZ12Key } from '../src/jobs/overtureFetch.js';

function createSpawnMock(scenarios) {
  const queued = [...scenarios];
  const calls = [];

  const spawnImpl = (executable, args) => {
    calls.push({ executable, args });

    const scenario = queued.shift() ?? {};
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    queueMicrotask(() => {
      if (scenario.error) {
        child.emit('error', scenario.error);
        return;
      }

      if (scenario.stdout) {
        child.stdout.emit('data', scenario.stdout);
      }

      if (scenario.stderr) {
        child.stderr.emit('data', scenario.stderr);
      }

      child.emit('close', scenario.exitCode ?? 0);
    });

    return child;
  };

  return { spawnImpl, calls };
}

describe('fetchOvertureFeaturesForZ12Key', () => {
  it('runs building and water downloads and normalizes output', async () => {
    const { spawnImpl, calls } = createSpawnMock([
      {
        stdout: JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              id: 'building-1',
              properties: { class: 'building' },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [100, 20],
                    [100.1, 20],
                    [100.1, 20.1],
                    [100, 20]
                  ]
                ]
              }
            }
          ]
        })
      },
      {
        stdout: JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              id: 'water-1',
              properties: { class: 'water' },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [100.2, 20.2],
                    [100.3, 20.2],
                    [100.3, 20.3],
                    [100.2, 20.2]
                  ]
                ]
              }
            }
          ]
        })
      }
    ]);

    const features = await fetchOvertureFeaturesForZ12Key('12/1024/1024', {
      command: 'overturemaps',
      spawnImpl
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].args).toContain('-t');
    expect(calls[0].args).toContain('building');
    expect(calls[1].args).toContain('-t');
    expect(calls[1].args).toContain('water');
    expect(features).toHaveLength(2);
    expect(features.map((feature) => feature.source)).toEqual(['overture', 'overture']);
    expect(features.map((feature) => feature.feature_id)).toEqual([
      'overture/building-1',
      'overture/water-1'
    ]);
  });

  it('fails when overture command exits non-zero', async () => {
    const { spawnImpl } = createSpawnMock([
      { exitCode: 7, stderr: 'service unavailable' },
      { stdout: JSON.stringify({ type: 'FeatureCollection', features: [] }) }
    ]);

    await expect(
      fetchOvertureFeaturesForZ12Key('12/1024/1024', {
        command: 'overturemaps',
        spawnImpl
      })
    ).rejects.toThrow('Overture buildings command failed (exit 7): service unavailable');
  });

  it('fails when overture output is malformed json', async () => {
    const { spawnImpl } = createSpawnMock([
      { stdout: '{not-json' },
      { stdout: JSON.stringify({ type: 'FeatureCollection', features: [] }) }
    ]);

    await expect(
      fetchOvertureFeaturesForZ12Key('12/1024/1024', {
        command: 'overturemaps',
        spawnImpl
      })
    ).rejects.toThrow('Overture buildings output is not valid JSON');
  });

  it('fails with a clear message when command is missing', async () => {
    const missing = new Error('spawn ENOENT');
    missing.code = 'ENOENT';

    const { spawnImpl } = createSpawnMock([
      { error: missing },
      { stdout: JSON.stringify({ type: 'FeatureCollection', features: [] }) }
    ]);

    await expect(
      fetchOvertureFeaturesForZ12Key('12/1024/1024', {
        command: 'overturemaps',
        spawnImpl
      })
    ).rejects.toThrow('Overture command not found: overturemaps');
  });
});

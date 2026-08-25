import { describe, expect, it, vi } from 'vitest';
import {
  createOsmHighwayIngestWorker,
  createOsmIngestWorker,
} from '../src/jobs/osmIngestWorker.js';

describe('osm ingest worker', () => {
  it('transitions queued -> running -> done and upserts features', async () => {
    const jobs = {
      claimNextQueued: vi.fn().mockResolvedValue({ z12Key: '12/3456/1523' }),
      markRunning: vi.fn().mockResolvedValue(undefined),
      markDone: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const fetchOsmFeatures = vi.fn().mockResolvedValue([
      {
        source: 'osm',
        feature_id: 'way/1',
        feature_type: 'LineString',
        tags: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [100, 20],
            [100.1, 20.1],
          ],
        },
      },
    ]);
    const upsertVectorFeatures = vi.fn().mockResolvedValue(undefined);

    const worker = createOsmIngestWorker({ jobs, fetchOsmFeatures, upsertVectorFeatures });
    await worker.tickOnce();

    expect(jobs.markRunning).toHaveBeenCalledWith('12/3456/1523');
    expect(upsertVectorFeatures).toHaveBeenCalledTimes(1);
    expect(jobs.markDone).toHaveBeenCalledWith('12/3456/1523');
    expect(jobs.markFailed).not.toHaveBeenCalled();
  });

  it('marks failed when fetch/upsert throws', async () => {
    const jobs = {
      claimNextQueued: vi.fn().mockResolvedValue({ z12Key: '12/3456/1523' }),
      markRunning: vi.fn().mockResolvedValue(undefined),
      markDone: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const fetchOsmFeatures = vi.fn().mockRejectedValue(new Error('boom'));
    const upsertVectorFeatures = vi.fn();

    const worker = createOsmIngestWorker({ jobs, fetchOsmFeatures, upsertVectorFeatures });
    await worker.tickOnce();

    expect(jobs.markFailed).toHaveBeenCalledWith('12/3456/1523', 'boom');
    expect(jobs.markDone).not.toHaveBeenCalled();
  });

  it('ingests highway features with the highways upsert target', async () => {
    const jobs = {
      claimNextQueued: vi.fn().mockResolvedValue({ z12Key: '12/3456/1523' }),
      markRunning: vi.fn().mockResolvedValue(undefined),
      markDone: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const fetchOsmHighwayFeatures = vi.fn().mockResolvedValue([
      {
        source: 'osm',
        feature_id: 'way/88',
        feature_type: 'LineString',
        tags: { highway: 'primary' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [100, 20],
            [100.1, 20.1],
          ],
        },
      },
    ]);
    const upsertVectorFeaturesHighways = vi.fn().mockResolvedValue(undefined);

    const worker = createOsmHighwayIngestWorker({
      jobs,
      fetchOsmHighwayFeatures,
      upsertVectorFeaturesHighways,
    });
    await worker.tickOnce();

    expect(fetchOsmHighwayFeatures).toHaveBeenCalledWith('12/3456/1523');
    expect(upsertVectorFeaturesHighways).toHaveBeenCalledTimes(1);
    expect(jobs.markDone).toHaveBeenCalledWith('12/3456/1523');
    expect(jobs.markFailed).not.toHaveBeenCalled();
  });
});

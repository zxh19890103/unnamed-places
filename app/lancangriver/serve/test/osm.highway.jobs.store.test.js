import { describe, expect, it, vi } from 'vitest';
import { createOsmHighwayJobsStore } from '../src/jobs/osmHighwayJobsStore.js';

describe('osm highway jobs store', () => {
  it('enqueues once and ignores duplicate key', async () => {
    const db = {
      query: vi.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 }),
    };

    const store = createOsmHighwayJobsStore({ db });

    const first = await store.enqueueIfMissing('12/3456/1523');
    const second = await store.enqueueIfMissing('12/3456/1523');

    expect(first.enqueued).toBe(true);
    expect(second.enqueued).toBe(false);
  });

  it('lists loaded coverage with stable pagination and a total', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ z12_key: '12/3456/1523' }] })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] }),
    };
    const store = createOsmHighwayJobsStore({ db });

    const result = await store.listLoaded({ limit: 25, offset: 0 });

    expect(result).toEqual({ keys: ['12/3456/1523'], total: 1 });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/FROM public\.osm_ingest_jobs_highways/),
      [25, 0],
    );
  });

  it('requeues a failed job atomically', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ status: 'queued' }] }),
    };
    const store = createOsmHighwayJobsStore({ db });

    const result = await store.rerunFailed('12/3456/1523');

    expect(result).toBe('queued');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE public\.osm_ingest_jobs_highways/),
      ['12/3456/1523'],
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createOsmJobsStore } from '../src/jobs/osmJobsStore.js';

describe('osm jobs store', () => {
  it('enqueues once and ignores duplicate key', async () => {
    const db = {
      query: vi.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 })
    };

    const store = createOsmJobsStore({ db });

    const first = await store.enqueueIfMissing('12/3456/1523');
    const second = await store.enqueueIfMissing('12/3456/1523');

    expect(first.enqueued).toBe(true);
    expect(second.enqueued).toBe(false);
  });

  it('returns a status for one canonical coverage key', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [{ status: 'done' }] })
    };
    const store = createOsmJobsStore({ db });

    const status = await store.getStatus('12/3456/1523');

    expect(status).toBe('done');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE z12_key = $1'),
      ['12/3456/1523']
    );
  });

  it('returns null for unknown coverage', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [] })
    };
    const store = createOsmJobsStore({ db });

    await expect(store.getStatus('12/3456/1523')).resolves.toBeNull();
  });

  it('lists loaded coverage with stable pagination and a total', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ z12_key: '12/3456/1523' }, { z12_key: '12/3457/1523' }]
        })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
    };
    const store = createOsmJobsStore({ db });

    const result = await store.listLoaded({ limit: 25, offset: 50 });

    expect(result).toEqual({
      keys: ['12/3456/1523', '12/3457/1523'],
      total: 2
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE status = 'done'[\s\S]*ORDER BY z12_key ASC/),
      [25, 50]
    );
  });

  it('preserves the loaded total when a page has no rows', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
    };
    const store = createOsmJobsStore({ db });

    const result = await store.listLoaded({ limit: 25, offset: 100 });

    expect(result).toEqual({ keys: [], total: 2 });
  });

  it('lists all jobs with status and stable pagination', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            { z12_key: '12/3456/1523', status: 'done' },
            { z12_key: '12/3457/1523', status: 'failed' }
          ]
        })
        .mockResolvedValueOnce({ rows: [{ total: 4 }] })
    };
    const store = createOsmJobsStore({ db });

    const result = await store.listJobs({ limit: 2, offset: 2 });

    expect(result).toEqual({
      jobs: [
        { key: '12/3456/1523', status: 'done' },
        { key: '12/3457/1523', status: 'failed' }
      ],
      total: 4
    });
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/SELECT z12_key, status[\s\S]*ORDER BY z12_key ASC/),
      [2, 2]
    );
  });

  it('requeues a failed job atomically', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ status: 'queued' }] })
    };
    const store = createOsmJobsStore({ db });

    const result = await store.rerunFailed('12/3456/1523');

    expect(result).toBe('queued');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/SET status = 'queued'[\s\S]*WHERE z12_key = \$1[\s\S]*AND status = 'failed'/),
      ['12/3456/1523']
    );
  });

  it('distinguishes unknown and non-failed jobs when rerun is rejected', async () => {
    const missingDb = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rows: [] })
    };
    const activeDb = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rows: [{ status: 'running' }] })
    };

    await expect(
      createOsmJobsStore({ db: missingDb }).rerunFailed('12/3456/1523')
    ).resolves.toBe('not_found');
    await expect(
      createOsmJobsStore({ db: activeDb }).rerunFailed('12/3456/1523')
    ).resolves.toBe('not_failed');
  });
});

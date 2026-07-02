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
});

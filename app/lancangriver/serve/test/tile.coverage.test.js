import { describe, expect, it } from 'vitest';
import { getCoveringZ12Tiles } from '../src/jobs/tileCoverage.js';

describe('getCoveringZ12Tiles', () => {
  it('returns exactly one z12 key for a z12 tile request', () => {
    const result = getCoveringZ12Tiles(12, 3456, 1523);
    expect(result).toEqual([{ z: 12, x: 3456, y: 1523, key: '12/3456/1523' }]);
  });

  it('returns four z12 keys for a z11 tile request', () => {
    const result = getCoveringZ12Tiles(11, 1728, 761);
    expect(result.map((t) => t.key)).toEqual([
      '12/3456/1522',
      '12/3457/1522',
      '12/3456/1523',
      '12/3457/1523'
    ]);
  });
});

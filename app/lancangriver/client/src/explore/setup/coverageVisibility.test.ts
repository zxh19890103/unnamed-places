import { describe, expect, it } from 'vitest';

import { coverageVisibilityInternals } from './coverageVisibility';

describe('coverage visibility helpers', () => {
  const { tileOverlaps } = coverageVisibilityInternals;

  it('matches identical tiles at same zoom', () => {
    expect(tileOverlaps({ z: 12, x: 3456, y: 1523 }, { z: 12, x: 3456, y: 1523 })).toBe(true);
    expect(tileOverlaps({ z: 12, x: 3456, y: 1523 }, { z: 12, x: 3457, y: 1523 })).toBe(false);
  });

  it('matches when lower zoom tile contains higher zoom tile', () => {
    expect(tileOverlaps({ z: 10, x: 864, y: 380 }, { z: 12, x: 3456, y: 1523 })).toBe(true);
    expect(tileOverlaps({ z: 10, x: 865, y: 380 }, { z: 12, x: 3456, y: 1523 })).toBe(false);
  });

  it('matches when higher zoom tile belongs to lower zoom candidate', () => {
    expect(tileOverlaps({ z: 13, x: 6912, y: 3046 }, { z: 12, x: 3456, y: 1523 })).toBe(true);
    expect(tileOverlaps({ z: 13, x: 6913, y: 3046 }, { z: 12, x: 3456, y: 1523 })).toBe(true);
    expect(tileOverlaps({ z: 13, x: 6914, y: 3046 }, { z: 12, x: 3456, y: 1523 })).toBe(false);
  });
});

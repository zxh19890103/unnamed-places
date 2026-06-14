import { describe, expect, it } from 'vitest';

import { parseArgs } from '../scripts/prefetch-tiles.js';

describe('parseArgs manifest mode', () => {
  it('accepts --manifest without --bbox', () => {
    const parsed = parseArgs([
      'node',
      'script',
      '--manifest',
      'pipeline/output/tiles/z11_manifest.json',
    ]);
    expect(parsed.manifestPath).toContain('z11_manifest.json');
  });

  it('rejects --manifest with --bbox', () => {
    expect(() =>
      parseArgs([
        'node',
        'script',
        '--manifest',
        'm.json',
        '--bbox',
        '99,21,101,23',
      ]),
    ).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { ExperimentalShanshuiMaterial } from './ShanshuiMaterial.js';
import { ELEVATION_SCALE } from '../../calc/constants.js';

describe('ShanshuiMaterial', () => {
  it('uses a terrain-scale displacement value by default', () => {
    const material = new ExperimentalShanshuiMaterial();
    expect(material.uniforms.uDisplacementScale.value).toBe(ELEVATION_SCALE);
    material.dispose();
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { getConfig } from '../src/config.js';

const ORIGINAL_PORT = process.env.PORT;

function setPort(value) {
  if (value === undefined) {
    delete process.env.PORT;
    return;
  }

  process.env.PORT = value;
}

describe('getConfig', () => {
  afterEach(() => {
    setPort(ORIGINAL_PORT);
  });

  it('defaults to 4050 when PORT is missing', () => {
    setPort(undefined);

    expect(getConfig().port).toBe(4050);
  });

  it('defaults to 4050 when PORT is invalid', () => {
    setPort('abc');
    expect(getConfig().port).toBe(4050);

    setPort('12.3');
    expect(getConfig().port).toBe(4050);
  });

  it('defaults to 4050 when PORT is out of range', () => {
    setPort('0');
    expect(getConfig().port).toBe(4050);

    setPort('65536');
    expect(getConfig().port).toBe(4050);
  });

  it('uses PORT when it is an integer in range', () => {
    setPort('4051');

    expect(getConfig().port).toBe(4051);
  });
});
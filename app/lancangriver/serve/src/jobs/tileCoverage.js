const CANONICAL_ZOOM = 12;

function assertInteger(value, label) {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
}

export function getCoveringZ12Tiles(z, x, y) {
  assertInteger(z, 'z');
  assertInteger(x, 'x');
  assertInteger(y, 'y');

  const delta = CANONICAL_ZOOM - z;

  if (delta < 0) {
    const scaleDown = 2 ** (-delta);
    const cx = Math.floor(x / scaleDown);
    const cy = Math.floor(y / scaleDown);

    return [{ z: CANONICAL_ZOOM, x: cx, y: cy, key: `${CANONICAL_ZOOM}/${cx}/${cy}` }];
  }

  const scaleUp = 2 ** delta;
  const baseX = x * scaleUp;
  const baseY = y * scaleUp;
  const tiles = [];

  for (let dy = 0; dy < scaleUp; dy += 1) {
    for (let dx = 0; dx < scaleUp; dx += 1) {
      const tx = baseX + dx;
      const ty = baseY + dy;
      tiles.push({ z: CANONICAL_ZOOM, x: tx, y: ty, key: `${CANONICAL_ZOOM}/${tx}/${ty}` });
    }
  }

  return tiles;
}

export function getZ12EnvelopeFromKey(z12Key) {
  const parts = String(z12Key).split('/');
  if (parts.length !== 3 || parts[0] !== String(CANONICAL_ZOOM)) {
    throw new Error(`Invalid z12 key: ${z12Key}`);
  }

  const [, xRaw, yRaw] = parts;
  const x = Number(xRaw);
  const y = Number(yRaw);

  assertInteger(x, 'z12 x');
  assertInteger(y, 'z12 y');

  const n = 2 ** CANONICAL_ZOOM;
  const minLon = (x / n) * 360 - 180;
  const maxLon = ((x + 1) / n) * 360 - 180;

  const latTopRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const latBottomRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));

  const maxLat = (latTopRad * 180) / Math.PI;
  const minLat = (latBottomRad * 180) / Math.PI;

  return { minLon, minLat, maxLon, maxLat };
}

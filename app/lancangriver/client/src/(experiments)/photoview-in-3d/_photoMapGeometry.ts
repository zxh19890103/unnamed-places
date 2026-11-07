type Position = [number, number];
type Polygon = GeoJSON.Position[][];

const RADIANS = Math.PI / 180;

function project(position: GeoJSON.Position): Position {
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, position[1]));
  return [position[0] * RADIANS, Math.log(Math.tan(Math.PI / 4 + latitude * RADIANS / 2))];
}

function unproject(position: Position): Position {
  return [position[0] / RADIANS, (2 * Math.atan(Math.exp(position[1])) - Math.PI / 2) / RADIANS];
}

function lineLength(line: GeoJSON.Position[]): number {
  let length = 0;
  for (let index = 1; index < line.length; index += 1) {
    const previous = line[index - 1];
    const current = line[index];
    const sinLat = Math.sin((current[1] - previous[1]) * RADIANS / 2);
    const sinLng = Math.sin((current[0] - previous[0]) * RADIANS / 2);
    const a = sinLat ** 2 + Math.cos(previous[1] * RADIANS)
      * Math.cos(current[1] * RADIANS) * sinLng ** 2;
    length += 2 * Math.asin(Math.sqrt(Math.min(1, a)));
  }
  return length;
}

function lineMidpoint(line: GeoJSON.Position[]): Position | null {
  if (!line.length) return null;
  let remaining = lineLength(line) / 2;
  for (let index = 1; index < line.length; index += 1) {
    const start = line[index - 1];
    const end = line[index];
    const length = lineLength([start, end]);
    if (length > 0 && remaining <= length) {
      const a = project(start);
      const b = project(end);
      const ratio = remaining / length;
      return unproject([a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio]);
    }
    remaining -= length;
  }
  return [line[0][0], line[0][1]];
}

function ringMoment(ring: Position[]) {
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  const origin = ring[0] ?? [0, 0];
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    const ax = a[0] - origin[0];
    const ay = a[1] - origin[1];
    const bx = b[0] - origin[0];
    const by = b[1] - origin[1];
    const cross = ax * by - bx * ay;
    twiceArea += cross;
    x += (ax + bx) * cross;
    y += (ay + by) * cross;
  }
  return {
    area: Math.abs(twiceArea) / 2,
    center: twiceArea === 0 ? origin : [
      origin[0] + x / (3 * twiceArea),
      origin[1] + y / (3 * twiceArea),
    ],
  };
}

function polygonArea(polygon: Polygon): number {
  return polygon.reduce((area, ring, index) =>
    area + ringMoment(ring.map(project)).area * (index === 0 ? 1 : -1), 0);
}

function containsPoint(rings: Position[][], point: Position): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const a = ring[index];
      const b = ring[previous];
      if ((a[1] > point[1]) !== (b[1] > point[1])
        && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function polygonCenter(polygon: Polygon): Position | null {
  const rings = polygon.map((ring) => ring.map(project));
  if (!rings[0]?.length) return null;
  let area = 0;
  let x = 0;
  let y = 0;
  rings.forEach((ring, index) => {
    const moment = ringMoment(ring);
    const weight = moment.area * (index === 0 ? 1 : -1);
    area += weight;
    x += moment.center[0] * weight;
    y += moment.center[1] * weight;
  });
  if (area <= 0) return null;
  const centroid: Position = [x / area, y / area];
  if (containsPoint(rings, centroid)) return unproject(centroid);

  // Pair scanline intersections across all rings to exclude holes.
  const heights = [...new Set(rings[0].map((point) => point[1]))].sort((a, b) => a - b);
  const scanlines = [centroid[1], (heights[0] + heights[heights.length - 1]) / 2];
  for (let index = 1; index < heights.length; index += 1) {
    scanlines.push((heights[index - 1] + heights[index]) / 2);
  }
  for (const height of scanlines) {
    const crossings: number[] = [];
    for (const ring of rings) {
      for (let index = 0; index < ring.length; index += 1) {
        const a = ring[index];
        const b = ring[(index + 1) % ring.length];
        if ((a[1] > height) !== (b[1] > height)) {
          crossings.push(a[0] + (height - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        }
      }
    }
    crossings.sort((a, b) => a - b);
    let widest = 0;
    let position: Position | null = null;
    for (let index = 1; index < crossings.length; index += 2) {
      const width = crossings[index] - crossings[index - 1];
      const candidate: Position = [(crossings[index] + crossings[index - 1]) / 2, height];
      if (width > widest && containsPoint(rings, candidate)) {
        widest = width;
        position = candidate;
      }
    }
    if (position) return unproject(position);
  }
  return null;
}

export function geometryLabelPosition(geometry: GeoJSON.Geometry | null): Position | null {
  if (!geometry) return null;
  switch (geometry.type) {
    case 'Point': return [geometry.coordinates[0], geometry.coordinates[1]];
    case 'LineString': return lineMidpoint(geometry.coordinates);
    case 'MultiLineString': {
      const longest = geometry.coordinates.reduce<GeoJSON.Position[]>(
        (best, line) => lineLength(line) > lineLength(best) ? line : best, [],
      );
      return lineMidpoint(longest);
    }
    case 'Polygon': return polygonCenter(geometry.coordinates);
    case 'MultiPolygon': {
      const largest = geometry.coordinates.reduce<Polygon>(
        (best, polygon) => polygonArea(polygon) > polygonArea(best) ? polygon : best, [],
      );
      return polygonCenter(largest);
    }
    default: return null;
  }
}

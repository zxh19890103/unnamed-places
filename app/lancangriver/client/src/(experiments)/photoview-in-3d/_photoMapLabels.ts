import * as L from 'leaflet';
import { featureText, placeLabelStyle, placeName, type MapCategory } from './_photoMap';
import { geometryLabelPosition } from './_photoMapGeometry';

function labelStyle(category: MapCategory, feature: GeoJSON.Feature) {
  if (category === 'places') {
    const style = placeLabelStyle(feature);
    return { ...style, color: '#d4e5d6', priority: style.minZoom };
  }
  if (category === 'highways') {
    const kind = featureText(feature, 'highway') || featureText(feature, 'feature_type');
    const minZoom = /^(motorway|trunk|primary)/.test(kind) ? 11
      : /^(secondary|tertiary)/.test(kind) ? 13 : 15;
    return { fontSize: 11, fontWeight: 400, minZoom, color: '#cfc6ad', priority: 30 + minZoom };
  }
  const kind = featureText(feature, 'waterway') || featureText(feature, 'water')
    || featureText(feature, 'feature_type');
  const minZoom = /^(river|lake|reservoir)$/.test(kind) ? 10
    : /^(canal|basin)$/.test(kind) ? 12 : 14;
  return { fontSize: 11, fontWeight: 500, minZoom, color: '#8acbdc', priority: 20 + minZoom };
}

export function createPhotoMapLabels(
  map: L.Map,
  datasets: Array<{ category: MapCategory; data: GeoJSON.FeatureCollection }>,
) {
  const group = L.layerGroup().addTo(map);
  const labels = datasets.flatMap(({ category, data }) => data.features.flatMap((feature) => {
    const name = placeName(feature).trim();
    if (!name) return [];
    const position = geometryLabelPosition(feature.geometry);
    if (!position) return [];
    const style = labelStyle(category, feature);
    const element = document.createElement('span');
    element.textContent = name;
    element.className = 'block w-max -translate-x-1/2 -translate-y-1/2 whitespace-nowrap';
    element.style.cssText = `color:${style.color};font:${style.fontWeight} ${style.fontSize}px sans-serif;`
      + 'text-shadow:0 0 3px #10231e,1px 0 2px #10231e,-1px 0 2px #10231e,0 1px 2px #10231e,0 -1px 2px #10231e;'
      + 'pointer-events:none;visibility:hidden;';
    const marker = L.marker([position[1], position[0]], {
      icon: L.divIcon({ html: element, className: '', iconSize: [0, 0] }),
      pane: category === 'places' ? 'photo-map-places' : 'photo-map-labels',
      interactive: false,
      keyboard: false,
    }).addTo(group);
    return [{ marker, element, ...style }];
  })).sort((a, b) => a.priority - b.priority || b.fontSize - a.fontSize);

  let frame: number | null = null;
  const layout = () => {
    frame = null;
    const container = map.getContainer();
    const viewport = container.getBoundingClientRect();
    const obstacles = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.leaflet-photo-map-photos-pane button'),
      (button) => button.getBoundingClientRect(),
    );
    for (const label of labels) {
      label.element.style.visibility = 'hidden';
      if (map.getZoom() < label.minZoom) continue;
      const bounds = label.element.getBoundingClientRect();
      if (bounds.right < viewport.left || bounds.left > viewport.right
        || bounds.bottom < viewport.top || bounds.top > viewport.bottom) continue;
      if (obstacles.some((other) =>
        bounds.left < other.right + 5 && bounds.right > other.left - 5
        && bounds.top < other.bottom + 5 && bounds.bottom > other.top - 5)) continue;
      label.element.style.visibility = 'visible';
      obstacles.push(bounds);
    }
  };
  const schedule = () => {
    if (frame === null) frame = requestAnimationFrame(layout);
  };
  map.on('moveend zoomend resize photomapmarkerschange', schedule);
  let disposed = false;
  void document.fonts.ready.then(() => {
    if (!disposed) schedule();
  });
  schedule();
  return () => {
    disposed = true;
    if (frame !== null) cancelAnimationFrame(frame);
    map.off('moveend zoomend resize photomapmarkerschange', schedule);
    group.remove();
  };
}

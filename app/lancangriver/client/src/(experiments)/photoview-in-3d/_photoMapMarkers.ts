import * as L from 'leaflet';
import type { PhotoRecord } from '@/photos/types';

type PhotoMarker = { photo: PhotoRecord; marker: L.Marker; position: L.LatLng };

const MARKER_WIDTH = 34;
const MARKER_HEIGHT = 24;
const MARKER_GAP = 6;
const SPREAD_SPACING = Math.hypot(MARKER_WIDTH, MARKER_HEIGHT) + MARKER_GAP;

export function createPhotoMapMarkers(
  map: L.Map,
  photos: PhotoRecord[],
  onSelect: (photo: PhotoRecord) => void,
) {
  const layer = L.layerGroup().addTo(map);
  const legs = L.layerGroup().addTo(map);
  const entries: PhotoMarker[] = [];
  let expanded = new Set<string>();
  let activeId: string | null = null;

  const restyle = () => {
    for (const { photo, marker } of entries) {
      const selected = photo.id === activeId;
      const isSpread = expanded.has(photo.id);
      const element = marker.getElement();
      const button = element?.querySelector('button');
      button?.setAttribute('aria-pressed', String(selected));
      if (button) {
        button.style.backgroundColor = selected ? '#fbbf24' : isSpread ? '#be123c' : '#9af';
        button.style.color = selected ? '#142c26' : '#fff';
        button.style.borderColor = isSpread ? '#fecdd3' : selected ? '#fff' : '#fff';
        button.style.borderStyle = isSpread ? 'dashed' : 'solid';
        button.style.boxShadow = selected ? '0 0 0 4px #fbbf2440' : '0 1px 5px #0009';
        if (isSpread) {
          button.setAttribute(
            'aria-description',
            'Spread marker: temporarily offset from the photo location. The line points to its actual location.',
          );
        } else {
          button.removeAttribute('aria-description');
        }
      }
      marker.setZIndexOffset(selected ? 2000 : isSpread ? 1000 : 0);
    }
    map.fire('photomapmarkerschange');
  };

  const collapse = () => {
    for (const entry of entries) {
      if (expanded.has(entry.photo.id)) entry.marker.setLatLng(entry.position);
    }
    expanded = new Set();
    legs.clearLayers();
    restyle();
  };

  const spread = (group: PhotoMarker[]) => {
    collapse();
    const center = map.latLngToLayerPoint(group[0].position);
    const markedLocations = new Set<string>();
    group.forEach((entry, index) => {
      const angle =
        group.length <= 8
          ? (index * 2 * Math.PI) / group.length - Math.PI / 2
          : index * 0.85 - Math.PI / 2;
      const radius =
        group.length <= 8
          ? Math.max(40, SPREAD_SPACING / (2 * Math.sin(Math.PI / group.length)))
          : SPREAD_SPACING + index * 10;
      const position = map.layerPointToLatLng(
        center.add(L.point(Math.cos(angle) * radius, Math.sin(angle) * radius)),
      );
      entry.marker.setLatLng(position);
      expanded.add(entry.photo.id);
      L.polyline([entry.position, position], {
        color: '#fda4af',
        weight: 1,
        interactive: false,
        pane: 'photo-map-legs',
      }).addTo(legs);
      const locationKey = `${entry.position.lat},${entry.position.lng}`;
      if (!markedLocations.has(locationKey)) {
        markedLocations.add(locationKey);
        L.circleMarker(entry.position, {
          radius: 3,
          stroke: false,
          fill: true,
          fillColor: '#fda4af',
          fillOpacity: 0.67,
          interactive: false,
          pane: 'photo-map-legs',
        }).addTo(legs);
      }
    });
    restyle();
  };

  photos.forEach((photo, index) => {
    const button = document.createElement('button');
    const fileName = photo.filePath.split('/').pop() ?? photo.filePath;
    button.type = 'button';
    button.textContent = String(index + 1);
    button.title = `${fileName} (${index + 1} of ${photos.length})`;
    button.setAttribute('aria-label', `View map photo ${index + 1}: ${fileName}`);
    button.style.cssText =
      `display:block;box-sizing:border-box;width:${MARKER_WIDTH}px;height:${MARKER_HEIGHT}px;border:2px solid;` +
      'border-radius:4px;padding:0;font:600 11px sans-serif;cursor:pointer;';
    const position = L.latLng(photo.lat, photo.lng);
    const marker = L.marker(position, {
      icon: L.divIcon({
        html: button,
        className: '',
        iconSize: [MARKER_WIDTH, MARKER_HEIGHT],
        iconAnchor: [MARKER_WIDTH / 2, MARKER_HEIGHT / 2],
      }),
      keyboard: false,
      bubblingMouseEvents: false,
      pane: 'photo-map-photos',
    }).addTo(layer);
    const entry = { photo, marker, position };
    entries.push(entry);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!expanded.has(photo.id)) {
        const point = map.latLngToLayerPoint(position);
        const group = entries.filter((other) => {
          const otherPoint = map.latLngToLayerPoint(other.position);
          return (
            Math.abs(point.x - otherPoint.x) < MARKER_WIDTH + MARKER_GAP &&
            Math.abs(point.y - otherPoint.y) < MARKER_HEIGHT + MARKER_GAP
          );
        });
        if (group.length > 1) {
          spread(group);
          return;
        }
        collapse();
      }
      onSelect(photo);
    });
  });

  const fitAll = () => {
    collapse();
    if (!entries.length) return;
    const bounds = L.latLngBounds(entries.map((entry) => entry.position));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: false });
  };

  const keepActiveVisible = () => {
    const entry = entries.find(({ photo }) => photo.id === activeId);
    if (!entry) return;
    const position = entry.marker.getLatLng();
    if (!map.getBounds().contains(position)) {
      map.panTo(position, { animate: false });
    }
  };

  const onBackgroundClick = () => collapse();
  // Keep the fan-out while panning so even a large spiral remains reachable.
  map.on('zoomstart', collapse);
  map.on('click', onBackgroundClick);
  fitAll();

  return {
    fitAll,
    setActive(id: string) {
      activeId = id;
      restyle();
      keepActiveVisible();
    },
    dispose() {
      map.off('zoomstart', collapse);
      map.off('click', onBackgroundClick);
      layer.remove();
      legs.remove();
    },
  };
}

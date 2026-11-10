import * as L from 'leaflet';
import type { PhotoRecord } from '@/photos/types';
import { photoDisplayTime } from './_photoTime';

type PhotoMarker = {
  photo: PhotoRecord;
  marker: L.CircleMarker;
  position: L.LatLng;
  time: number | null;
  label: HTMLSpanElement;
};

const MARKER_RADIUS = 12;
const MARKER_GAP = 6;
const SPREAD_SPACING = MARKER_RADIUS * 2 + MARKER_GAP;

export function createPhotoMapMarkers(
  map: L.Map,
  photos: PhotoRecord[],
  onSelect: (photo: PhotoRecord) => void,
) {
  const layer = L.layerGroup().addTo(map);
  const legs = L.layerGroup().addTo(map);
  const renderer = L.svg({ pane: 'photo-map-photos' });
  const entries: PhotoMarker[] = [];
  let expanded = new Set<string>();
  let activeId: string | null = null;

  const restyle = () => {
    const activeEntry = entries.find(({ photo }) => photo.id === activeId);
    const activeTime = activeEntry?.time ?? null;
    for (const { photo, marker, time, label } of entries) {
      const selected = photo.id === activeId;
      const isSpread = expanded.has(photo.id);
      const opacity =
        isSpread || activeTime === null || time === null
          ? 1
          : 1 - 0.75 * Math.tanh(Math.abs(time - activeTime) / (15 * 60 * 1000));
      marker.setStyle({
        fillColor: selected ? '#fbbf24' : isSpread ? '#be123c' : '#9af',
        color: isSpread ? '#fecdd3' : '#be123c',
        weight: selected ? 3 : 1,
        dashArray: isSpread ? '3 3' : '',
        opacity: 1,
        fillOpacity: opacity,
      });
      const element = marker.getElement();
      element?.setAttribute('aria-pressed', String(selected));
      if (element) {
        if (isSpread) {
          element.setAttribute(
            'aria-description',
            'Spread marker: temporarily offset from the photo location. The line points to its actual location.',
          );
        } else {
          element.removeAttribute('aria-description');
        }
      }
      label.style.color = selected ? '#142c26' : '#fff';
      const tooltip = marker.getTooltip()?.getElement();
      if (tooltip) tooltip.style.zIndex = selected ? '2000' : isSpread ? '1000' : '0';
      if (isSpread) marker.bringToFront();
    }
    activeEntry?.marker.bringToFront();
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
    const fileName = photo.filePath.split('/').pop() ?? photo.filePath;
    const label = document.createElement('span');
    label.textContent = String(index + 1);
    label.style.cssText = `display:block;font:600 ${label.textContent.length > 3 ? 8 : 11}px sans-serif;`;
    label.setAttribute('aria-hidden', 'true');
    const position = L.latLng(photo.lat, photo.lng);
    const marker = L.circleMarker(position, {
      radius: MARKER_RADIUS,
      renderer,
      stroke: true,
      fill: true,
      bubblingMouseEvents: false,
      pane: 'photo-map-photos',
    }).addTo(layer);
    marker.bindTooltip(label, {
      permanent: true,
      direction: 'center',
      opacity: 1,
      interactive: false,
      className: 'photo-map-photo-number',
      pane: 'photo-map-photos',
    });
    const tooltip = marker.getTooltip()?.getElement();
    if (tooltip) {
      tooltip.style.cssText +=
        'background:transparent;border:0;box-shadow:none;padding:0;margin:0;pointer-events:none;user-select:none;';
    }
    const entry = { photo, marker, position, time: photoDisplayTime(photo), label };
    entries.push(entry);
    const activate = () => {
      if (!expanded.has(photo.id)) {
        const point = map.latLngToLayerPoint(position);
        const group = entries.filter((other) => {
          const otherPoint = map.latLngToLayerPoint(other.position);
          return point.distanceTo(otherPoint) < SPREAD_SPACING;
        });
        if (group.length > 1) {
          spread(group);
          return;
        }
        collapse();
      }
      onSelect(photo);
    };
    marker.on('click', activate);
    const element = marker.getElement();
    if (element) {
      element.setAttribute('tabindex', '0');
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', `View map photo ${index + 1}: ${fileName}`);
      element.setAttribute('data-photo-map-circle', '');
      element.setAttribute(
        'class',
        `${element.getAttribute('class') ?? ''} cursor-pointer focus-visible:outline-2 focus-visible:outline-white`,
      );
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${fileName} (${index + 1} of ${photos.length})`;
      element.append(title);
      element.addEventListener('keydown', (event) => {
        if (event instanceof KeyboardEvent && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          event.stopPropagation();
          activate();
        }
      });
    }
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
      renderer.remove();
    },
  };
}

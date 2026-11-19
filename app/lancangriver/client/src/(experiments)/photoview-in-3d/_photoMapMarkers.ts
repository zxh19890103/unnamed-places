import * as L from 'leaflet';
import type { PhotoRecord } from '@/photos/types';
import { photoDisplayTime } from './_photoTime';
import { createPhotoCameraIcon, PHOTO_CAMERA_SCALE } from './_photoCameraIcon';
import { createPhotoFootprintIcon } from './_photoFootprintIcon';
import './_photoMapMarkers.css';

type PhotoLocationMarker =
  | { kind: 'footprint'; marker: L.Marker; element: HTMLSpanElement }
  | { kind: 'circle'; marker: L.CircleMarker; outline: L.CircleMarker };

type PhotoMarker = {
  photo: PhotoRecord;
  marker: L.Marker;
  location: PhotoLocationMarker;
  position: L.LatLng;
  time: number | null;
  button: HTMLButtonElement;
};

const GROUP_SPACING = 24;
const GROUP_CAMERA_CLEARANCE = GROUP_SPACING * PHOTO_CAMERA_SCALE;
const MAX_GROUP_ZOOM = 16;
const SPREAD_SPACING = 48;
export const MAX_SPREAD_PHOTOS = 12;
export const PHOTO_FOOTPRINT_LIMIT = 100;

export function createPhotoMapMarkers(
  map: L.Map,
  photos: PhotoRecord[],
  onSelect: (photo: PhotoRecord) => void,
  onSpreadLimit: (count: number | null) => void,
) {
  const layer = L.layerGroup().addTo(map);
  const groups = L.layerGroup().addTo(map);
  const locations = L.layerGroup().addTo(map);
  const legs = L.layerGroup().addTo(map);
  const entries: PhotoMarker[] = [];
  let expanded = new Set<string>();
  let expandedGroup: PhotoMarker[] = [];
  let activeId: string | null = null;

  const createLocationMarker = (position: L.LatLng): PhotoLocationMarker => {
    if (photos.length < PHOTO_FOOTPRINT_LIMIT) {
      const element = createPhotoFootprintIcon();
      const marker = L.marker(position, {
        icon: L.divIcon({
          html: element,
          className: 'photo-location-marker',
          iconSize: [20, 30],
          iconAnchor: [10, 0],
        }),
        interactive: false,
        keyboard: false,
        pane: 'photo-map-legs',
      }).addTo(locations);
      return { kind: 'footprint', marker, element };
    }
    const outline = L.circleMarker(position, {
      radius: 4,
      color: '#142c26',
      weight: 4,
      fill: false,
      interactive: false,
      pane: 'photo-map-legs',
    }).addTo(locations);
    const marker = L.circleMarker(position, {
      radius: 4,
      color: '#ffffff',
      weight: 2,
      fill: false,
      interactive: false,
      pane: 'photo-map-legs',
    }).addTo(locations);
    return { kind: 'circle', marker, outline };
  };

  const createMarker = (position: L.LatLng, button: HTMLButtonElement) => {
    // Group activation can remove its marker before Leaflet receives the click.
    L.DomEvent.disableClickPropagation(button);
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    });
    const marker = L.marker(position, {
      icon: L.divIcon({ html: button, className: '', iconSize: [24, 24], iconAnchor: [12, 12] }),
      keyboard: false,
      bubblingMouseEvents: false,
      pane: 'photo-map-photos',
    });
    const highlight = () => {
      marker.setZIndexOffset(
        button.matches(':hover, :focus-visible')
          ? 3000
          : button.classList.contains('is-active')
            ? 2000
            : button.classList.contains('is-spread')
              ? 1000
              : 0,
      );
      map.fire('photomapmarkerschange');
    };
    for (const event of ['mouseenter', 'mouseleave', 'focus', 'blur']) {
      button.addEventListener(event, highlight);
    }
    return marker;
  };

  const restyle = () => {
    const activeEntry = entries.find(({ photo }) => photo.id === activeId);
    const activeTime = activeEntry?.time ?? null;
    for (const { photo, marker, location, time, button } of entries) {
      const selected = photo.id === activeId;
      const isSpread = expanded.has(photo.id);
      const opacity =
        isSpread || activeTime === null || time === null
          ? 1
          : 1 - 0.75 * Math.tanh(Math.abs(time - activeTime) / (15 * 60 * 1000));
      button.classList.toggle('is-active', selected);
      button.classList.toggle('is-spread', isSpread);
      button.style.setProperty('--photo-time-opacity', String(opacity));
      button.setAttribute('aria-pressed', String(selected));
      if (isSpread) {
        button.setAttribute(
          'aria-description',
          'Temporarily offset. The line points to the actual photo location.',
        );
      } else {
        button.removeAttribute('aria-description');
      }
      marker.setZIndexOffset(selected ? 2000 : isSpread ? 1000 : 0);
      if (location.kind === 'footprint') {
        location.element.classList.toggle('is-active', selected);
        location.marker.setZIndexOffset(selected ? 1000 : 0);
      } else {
        location.marker.setRadius(selected ? 8 : 4).setStyle({
          color: selected ? '#fbbf24' : '#ffffff',
        });
        location.outline.setRadius(selected ? 8 : 4);
      }
    }
    if (activeEntry?.location.kind === 'circle') {
      activeEntry.location.outline.bringToFront();
      activeEntry.location.marker.bringToFront();
    }
    map.fire('photomapmarkerschange');
  };

  const addGroupMarker = (members: PhotoMarker[], isExpanded = false) => {
    const points = members.map(({ position }) => map.latLngToLayerPoint(position));
    const center = isExpanded
      ? points[0]
      : points.reduce((sum, point) => sum.add(point), L.point(0, 0)).divideBy(points.length);
    let displayCenter = center;
    const active = entries.find(({ photo }) => photo.id === activeId);
    if (active) {
      const offset = center.subtract(map.latLngToLayerPoint(active.marker.getLatLng()));
      const distance = Math.hypot(offset.x, offset.y);
      if (distance < GROUP_CAMERA_CLEARANCE) {
        displayCenter = center.add(
          distance > 0
            ? offset.multiplyBy((GROUP_CAMERA_CLEARANCE - distance) / distance)
            : L.point(GROUP_CAMERA_CLEARANCE, 0),
        );
        L.polyline([map.layerPointToLatLng(center), map.layerPointToLatLng(displayCenter)], {
          color: '#88c3ab',
          weight: 1,
          interactive: false,
          pane: 'photo-map-legs',
        }).addTo(groups);
      }
    }
    const button = createPhotoCameraIcon(members.length, true);
    button.dataset.photoGroup = members[0].photo.id;
    button.setAttribute(
      'aria-label',
      `${members.length} photos. ${
        isExpanded
          ? 'Collapse spread photos.'
          : members.length > MAX_SPREAD_PHOTOS
            ? 'Zoom in to explore.'
            : 'Zoom in or spread to explore.'
      }`,
    );
    button.setAttribute('aria-expanded', String(isExpanded));
    button.title = `${members.length} photos`;
    createMarker(map.layerPointToLatLng(displayCenter), button).addTo(groups);
    button.addEventListener('click', () => {
      const keyboard = button.matches(':focus-visible');
      if (isExpanded) {
        collapse();
      } else {
        const bounds = L.latLngBounds(members.map(({ position }) => position));
        const tooLarge = members.length > MAX_SPREAD_PHOTOS;
        const fitZoom = map.getBoundsZoom(bounds, false, L.point(96, 96));
        const zoom = Math.min(
          MAX_GROUP_ZOOM,
          map.getMaxZoom(),
          tooLarge ? Math.max(map.getZoom() + 1, fitZoom) : fitZoom,
        );
        if (zoom > map.getZoom()) {
          map.setView(bounds.getCenter(), zoom, { animate: false });
        } else if (tooLarge) {
          onSpreadLimit(members.length);
        } else {
          spread(members);
        }
      }
      if (keyboard) {
        const groupControl = Array.from(
          map.getContainer().querySelectorAll<HTMLButtonElement>('.is-group'),
        ).find((candidate) => candidate.dataset.photoGroup === members[0].photo.id);
        const next = expanded.has(members[0].photo.id)
          ? members[0].button
          : (groupControl ?? members.find(({ button }) => button.isConnected)?.button);
        next?.focus({ preventScroll: true });
      }
    });
  };

  const layout = () => {
    groups.clearLayers();
    const available = entries.filter(({ photo }) => !expanded.has(photo.id));
    const points = available.map(({ position }) => map.latLngToLayerPoint(position));
    const remaining = new Set(available.map((_, index) => index));
    const visible = new Set(
      entries.filter(({ photo }) => photo.id === activeId || expanded.has(photo.id)),
    );

    // Connected screen-space neighbors stay together, independent of the map's pan.
    while (remaining.size) {
      const first = remaining.values().next().value!;
      remaining.delete(first);
      const indices = [first];
      for (let cursor = 0; cursor < indices.length; cursor++) {
        for (const index of remaining) {
          if (points[indices[cursor]].distanceTo(points[index]) < GROUP_SPACING) {
            indices.push(index);
            remaining.delete(index);
          }
        }
      }
      const members = indices.map((index) => available[index]);
      if (members.length === 1) {
        visible.add(members[0]);
      } else {
        addGroupMarker(members);
      }
    }
    if (expandedGroup.length) addGroupMarker(expandedGroup, true);
    for (const entry of entries) {
      if (visible.has(entry)) {
        if (!layer.hasLayer(entry.marker)) entry.marker.addTo(layer);
      } else {
        layer.removeLayer(entry.marker);
      }
    }
    restyle();
  };

  const resetSpread = () => {
    onSpreadLimit(null);
    for (const entry of entries) {
      if (expanded.has(entry.photo.id)) entry.marker.setLatLng(entry.position);
    }
    expanded = new Set();
    expandedGroup = [];
    legs.clearLayers();
  };

  const collapse = () => {
    resetSpread();
    layout();
  };

  const spread = (members: PhotoMarker[]) => {
    resetSpread();
    expandedGroup = members;
    const center = map.latLngToLayerPoint(members[0].position);
    members.forEach((entry, index) => {
      const angle =
        members.length <= 8
          ? (index * 2 * Math.PI) / members.length - Math.PI / 2
          : index * 0.85 - Math.PI / 2;
      const radius =
        PHOTO_CAMERA_SCALE *
        (members.length <= 8
          ? Math.max(52, SPREAD_SPACING / (2 * Math.sin(Math.PI / members.length)))
          : SPREAD_SPACING + index * 10);
      const position = map.layerPointToLatLng(
        center.add(L.point(Math.cos(angle) * radius, Math.sin(angle) * radius)),
      );
      entry.marker.setLatLng(position);
      expanded.add(entry.photo.id);
      L.polyline([entry.position, position], {
        color: '#f5a08b',
        weight: 1,
        dashArray: '4 3',
        interactive: false,
        pane: 'photo-map-legs',
      }).addTo(legs);
    });
    layout();
  };

  photos.forEach((photo, index) => {
    const fileName = photo.filePath.split('/').pop() ?? photo.filePath;
    const position = L.latLng(photo.lat, photo.lng);
    const location = createLocationMarker(position);
    const button = createPhotoCameraIcon(index + 1);
    button.setAttribute('aria-label', `View map photo ${index + 1}: ${fileName}`);
    button.title = `${fileName} (${index + 1} of ${photos.length})`;
    const marker = createMarker(position, button);
    entries.push({ photo, marker, location, position, time: photoDisplayTime(photo), button });
    button.addEventListener('click', () => onSelect(photo));
  });

  const fitAll = () => {
    resetSpread();
    if (entries.length) {
      map.fitBounds(L.latLngBounds(entries.map(({ position }) => position)), {
        padding: [48, 48],
        maxZoom: 16,
        animate: false,
      });
    }
    layout();
  };

  // Keep the fan-out while panning so even a large spiral remains reachable.
  map.on('zoomstart', resetSpread);
  map.on('zoomend resize', layout);
  map.on('click', collapse);
  fitAll();

  return {
    fitAll,
    setActive(id: string) {
      onSpreadLimit(null);
      activeId = id;
      layout();
      const entry = entries.find(({ photo }) => photo.id === activeId);
      if (entry && !map.getBounds().contains(entry.marker.getLatLng())) {
        map.panTo(entry.marker.getLatLng(), { animate: false });
      }
    },
    dispose() {
      map.off('zoomstart', resetSpread);
      map.off('zoomend resize', layout);
      map.off('click', collapse);
      layer.remove();
      groups.remove();
      locations.remove();
      legs.remove();
    },
  };
}

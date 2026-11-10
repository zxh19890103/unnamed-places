import * as L from 'leaflet';
import type { PhotoRecord } from '@/photos/types';
import { getPhotoUrl } from '../_fns';
import { hasPhotoLocation } from '../_photoMap';
import {
  formatCaptureClockTime,
  formatCaptureTime,
  hasSequenceLink,
  journeyThumbnailFilter,
  momentPhoto,
  relationLabel,
  type JourneyMoment,
} from './_journey';
import { placeJourneyCards } from './_journeyLayout';

export function createJourneyMarkers(
  map: L.Map,
  moments: JourneyMoment[],
  activeIndex: number,
  activePhoto: PhotoRecord,
  colors: Map<string, string>,
  onSelect: (photo: PhotoRecord) => void,
  positionFor: (photo: PhotoRecord) => L.LatLng,
) {
  const group = L.layerGroup().addTo(map);
  const connectors = L.layerGroup().addTo(map);
  let popup: L.Popup | null = null;
  const entries: Array<{
    marker: L.Marker;
    position: L.LatLng;
    card: HTMLDivElement;
    selected: boolean;
    width: number;
    anchorY: number;
  }> = [];
  const firstIndex = Math.max(0, activeIndex - 2);
  const activeMoment = moments[activeIndex];

  moments.slice(firstIndex, activeIndex + 3).forEach((moment, index) => {
    const sequence = firstIndex + index + 1;
    const selected = moment === activeMoment;
    const photo = momentPhoto(moment, activePhoto, sequence - 1 < activeIndex);
    if (!hasPhotoLocation(photo)) return;
    const position = positionFor(photo);
    const width = selected ? 80 : 64;
    const height = selected ? 60 : 48;
    const cardWidth = 188;
    const card = document.createElement('div');
    card.className = 'relative flex flex-col items-center gap-2 text-center';
    card.style.width = `${cardWidth}px`;
    card.setAttribute('data-photo-map-card', '');
    L.DomEvent.disableClickPropagation(card);
    const imageButton = document.createElement('button');
    imageButton.type = 'button';
    imageButton.className =
      'relative block cursor-pointer rounded-md border-2 bg-stone-900 shadow-lg focus-visible:outline-2 focus-visible:outline-white';
    imageButton.style.width = `${width}px`;
    imageButton.style.height = `${height}px`;
    imageButton.style.borderColor = selected ? '#fbbf24' : (colors.get(photo.id) ?? '#a8a29e');
    if (selected) {
      imageButton.style.boxShadow = '0 0 0 3px #1c1917, 0 0 0 6px #fbbf24, 0 6px 20px #0009';
    }
    const captionText = selected
      ? formatCaptureClockTime(photo)
      : relationLabel(activePhoto, photo);
    imageButton.setAttribute('aria-pressed', String(selected));
    imageButton.setAttribute(
      'aria-label',
      `${selected ? 'Selected' : 'View'} moment ${sequence}: ${selected ? formatCaptureTime(photo) : captionText}, ${moment.photos.length} photos`,
    );
    const image = document.createElement('img');
    image.src = getPhotoUrl('thumb', photo.filePath);
    image.alt = '';
    image.className = 'h-full w-full rounded-sm object-cover';
    image.style.filter = journeyThumbnailFilter(activePhoto, photo);
    image.draggable = false;
    const imageFrame = document.createElement('span');
    imageFrame.className = 'block h-full w-full overflow-hidden rounded-sm';
    imageFrame.append(image);
    imageButton.append(imageFrame);
    const sequenceBadge = document.createElement('span');
    sequenceBadge.className = `absolute -left-2 -top-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-stone-900 ${
      selected ? 'bg-amber-300 text-stone-900' : 'bg-jade-river-700 text-white'
    }`;
    sequenceBadge.textContent = String(sequence);
    imageButton.append(sequenceBadge);
    imageButton.addEventListener('click', () => onSelect(photo));
    card.append(imageButton);
    if (moment.photos.length > 1) {
      const countBadge = document.createElement('button');
      countBadge.type = 'button';
      countBadge.className =
        'absolute -top-2 cursor-pointer rounded-full bg-stone-800 px-1.5 py-0.5 text-[10px] font-semibold text-white ring-1 ring-stone-900 focus-visible:outline-2 focus-visible:outline-white';
      countBadge.style.left = `${(cardWidth + width) / 2 - 16}px`;
      countBadge.textContent = `x ${moment.photos.length}`;
      countBadge.setAttribute(
        'aria-label',
        `Open ${moment.photos.length} photos in moment ${sequence}`,
      );
      countBadge.setAttribute('aria-expanded', 'false');
      countBadge.addEventListener('click', (event) => {
        event.stopPropagation();
        if (popup?.isOpen() && countBadge.getAttribute('aria-expanded') === 'true') {
          map.closePopup();
          return;
        }
        const content = document.createElement('div');
        content.className = 'space-y-2 w-fit';
        content.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            event.preventDefault();
            map.closePopup();
          }
        });
        const title = document.createElement('p');
        title.textContent = `Moment ${sequence} · ${moment.photos.length} photos`;
        content.append(title);
        const thumbnails = document.createElement('div');
        thumbnails.className = 'flex flex-nowrap gap-2 overflow-y-auto p-1';
        L.DomEvent.disableScrollPropagation(thumbnails);
        for (const item of moment.photos) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className =
            'cursor-pointer rounded border-2 p-0.5 focus-visible:outline-2 focus-visible:outline-jade-river';
          button.style.borderColor = item.id === activePhoto.id ? '#fbbf24' : '#8ea7b7';
          button.setAttribute(
            'aria-label',
            `View ${item.filePath.split('/').pop()}: ${formatCaptureTime(item)}`,
          );
          button.setAttribute('aria-pressed', String(item.id === activePhoto.id));
          const thumbnail = document.createElement('img');
          thumbnail.src = getPhotoUrl('thumb', item.filePath);
          thumbnail.alt = '';
          thumbnail.loading = 'lazy';
          thumbnail.className = 'h-12 w-16 rounded object-cover';
          thumbnail.style.filter = journeyThumbnailFilter(activePhoto, item);
          const thumbnailFrame = document.createElement('span');
          thumbnailFrame.className = 'block h-12 w-16 overflow-hidden rounded';
          thumbnailFrame.append(thumbnail);
          button.append(thumbnailFrame);
          button.addEventListener('click', () => {
            map.closePopup();
            onSelect(item);
          });
          thumbnails.append(button);
        }
        content.append(thumbnails);
        marker.closeTooltip();
        popup = L.popup({
          className: '',
          autoPanPadding: L.point(24, 60),
        })
          .setLatLng(marker.getLatLng())
          .setContent(content)
          .openOn(map);
        countBadge.setAttribute('aria-expanded', 'true');
        popup.on('remove', () => {
          countBadge.setAttribute('aria-expanded', 'false');
          if (countBadge.isConnected) countBadge.focus({ preventScroll: true });
        });
        requestAnimationFrame(() => {
          if (content.isConnected) thumbnails.querySelector<HTMLButtonElement>('button')?.focus();
        });
      });
      card.append(countBadge);
    }
    const caption = document.createElement('div');
    caption.className = `max-w-full rounded bg-stone-900/90 px-2 py-1 text-[10px] leading-tight shadow-md ${
      selected ? 'text-amber-200' : 'text-white'
    }`;
    caption.textContent = captionText;
    if (!selected && activeMoment) {
      const between = moments.slice(
        Math.min(sequence - 1, activeIndex),
        Math.max(sequence - 1, activeIndex) + 1,
      );
      const broken = between.some(
        (current, step) => step > 0 && !hasSequenceLink(between[step - 1], current),
      );
      if (broken) {
        const note = document.createElement('span');
        note.className = 'mt-1 block text-amber-200';
        note.textContent = 'Sequence break';
        caption.append(note);
      }
    }
    card.append(caption);
    const marker = L.marker(position, {
      pane: 'photo-map-photos',
      keyboard: false,
      bubblingMouseEvents: false,
      zIndexOffset: selected ? 1000 : 0,
      icon: L.divIcon({
        html: card,
        className: '',
        iconSize: [cardWidth, height + 44],
        iconAnchor: [cardWidth / 2, height / 2],
      }),
    }).addTo(group);
    marker.bindTooltip(`${formatCaptureTime(photo)} · ${moment.photos.length} photos`, {
      direction: 'bottom',
    });
    entries.push({ marker, position, card, selected, width: cardWidth, anchorY: height / 2 });
  });

  let frame: number | null = null;
  let disposed = false;
  const layout = () => {
    frame = null;
    connectors.clearLayers();
    const cards = entries.map((entry) => {
      const point = map.latLngToContainerPoint(entry.position);
      return {
        x: point.x,
        y: point.y,
        width: entry.width + 16,
        height: entry.card.getBoundingClientRect().height + 16,
        anchorX: entry.width / 2 + 8,
        anchorY: entry.anchorY + 8,
        selected: entry.selected,
      };
    });
    const size = map.getSize();
    placeJourneyCards(cards, { width: size.x, height: size.y }).forEach((card, index) => {
      const entry = entries[index];
      const position = map.containerPointToLatLng(L.point(card.x, card.y));
      entry.marker.setLatLng(position);
      const start = cards[index];
      const dx = card.x - start.x;
      const dy = card.y - start.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 1) {
        const bend = Math.min(distance * 0.35, 80);
        const controlX = (start.x + card.x) / 2 - (dy / distance) * bend;
        const controlY = (start.y + card.y) / 2 + (dx / distance) * bend;
        const curve = Array.from({ length: 31 }, (_, step) => {
          const t = (step + 1) / 32;
          const remaining = 1 - t;
          return map.containerPointToLatLng(
            L.point(
              remaining ** 2 * start.x + 2 * remaining * t * controlX + t ** 2 * card.x,
              remaining ** 2 * start.y + 2 * remaining * t * controlY + t ** 2 * card.y,
            ),
          );
        });

        L.polyline([entry.position, ...curve, position], {
          pane: 'photo-map-legs',
          color: '#fff',
          fillColor: '#fff',
          stroke: true,
          weight: 3,
          dashArray: '3 6',
          smoothFactor: 0,
          interactive: false,
        }).addTo(connectors);

        L.circleMarker(entry.position, {
          pane: 'photo-map-legs',
          radius: 6,
          color: '#fff',
          fillColor: '#aea',
          stroke: true,
          weight: 1,
          fillOpacity: 1,
          interactive: false,
        }).addTo(connectors);
      }
    });
    map.fire('photomapmarkerschange');
  };
  const schedule = () => {
    if (frame === null) frame = requestAnimationFrame(layout);
  };
  map.on('moveend zoomend resize', schedule);
  void document.fonts.ready.then(() => {
    if (!disposed) schedule();
  });
  schedule();
  return {
    positions: entries.map((entry) => entry.position),
    dispose() {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      map.off('moveend zoomend resize', schedule);
      popup?.remove();
      group.remove();
      connectors.remove();
    },
  };
}

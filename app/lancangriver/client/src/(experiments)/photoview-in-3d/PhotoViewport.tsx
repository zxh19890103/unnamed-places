import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { PhotoRecord } from '@/photos/types';
import { getPhotoUrl } from './_fns';

export interface PhotoViewportHandle {
  reset: () => void;
  zoomBy: (factor: number) => void;
}

interface PhotoViewportProps {
  photo: PhotoRecord;
  onZoomChange: (zoom: number) => void;
}

export const PhotoViewport = memo(forwardRef<PhotoViewportHandle, PhotoViewportProps>(
  function PhotoViewport({ photo, onZoomChange }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const transformRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef({ zoom: 1, x: 0, y: 0 });
    const pointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
    const frameRef = useRef<number | null>(null);
    const reportedZoomRef = useRef(1);
    const mountedRef = useRef(false);
    const [highResLoaded, setHighResLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    const scheduleTransform = useCallback(() => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const { zoom, x, y } = viewRef.current;
        if (transformRef.current) {
          transformRef.current.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
        }
        if (containerRef.current) {
          containerRef.current.style.cursor = pointerRef.current
            ? 'grabbing'
            : zoom > 1.05 ? 'grab' : 'default';
        }
        if (reportedZoomRef.current !== zoom) {
          reportedZoomRef.current = zoom;
          onZoomChange(zoom);
        }
      });
    }, [onZoomChange]);

    const endDrag = useCallback(() => {
      const pointer = pointerRef.current;
      pointerRef.current = null;
      const container = containerRef.current;
      if (pointer && container?.hasPointerCapture(pointer.id)) {
        container.releasePointerCapture(pointer.id);
      }
    }, []);

    const reset = useCallback(() => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      endDrag();
      viewRef.current = { zoom: 1, x: 0, y: 0 };
      scheduleTransform();
    }, [endDrag, scheduleTransform]);

    useImperativeHandle(ref, () => ({
      reset,
      zoomBy: (factor) => {
        viewRef.current.zoom = Math.min(Math.max(viewRef.current.zoom * factor, 0.5), 6);
        scheduleTransform();
      },
    }), [reset, scheduleTransform]);

    useLayoutEffect(() => {
      mountedRef.current = true;
      onZoomChange(1);
      const container = containerRef.current;
      return () => {
        mountedRef.current = false;
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        const pointer = pointerRef.current;
        pointerRef.current = null;
        if (pointer && container?.hasPointerCapture(pointer.id)) {
          container.releasePointerCapture(pointer.id);
        }
      };
    }, [onZoomChange]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const rect = container.getBoundingClientRect();
        const cursorX = event.clientX - rect.left - rect.width / 2;
        const cursorY = event.clientY - rect.top - rect.height / 2;
        const previous = viewRef.current;
        const nextZoom = Math.min(Math.max(previous.zoom * Math.exp(-event.deltaY * 0.002), 0.5), 6);
        if (nextZoom <= 1.05 && previous.zoom <= 1.05) {
          viewRef.current = { zoom: 1, x: 0, y: 0 };
        } else {
          const ratio = nextZoom / previous.zoom;
          viewRef.current = {
            zoom: nextZoom,
            x: cursorX - (cursorX - previous.x) * ratio,
            y: cursorY - (cursorY - previous.y) * ratio,
          };
        }
        scheduleTransform();
      };
      container.addEventListener('wheel', onWheel, { passive: false });
      return () => container.removeEventListener('wheel', onWheel);
    }, [scheduleTransform]);

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !event.isPrimary || pointerRef.current) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      scheduleTransform();
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.id !== event.pointerId) return;
      viewRef.current.x += event.clientX - pointer.x;
      viewRef.current.y += event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      scheduleTransform();
    };

    const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
      if (pointerRef.current?.id !== event.pointerId) return;
      endDrag();
      scheduleTransform();
    };

    const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
      if (viewRef.current.zoom > 1.1) {
        reset();
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const cursorX = event.clientX - rect.left - rect.width / 2;
      const cursorY = event.clientY - rect.top - rect.height / 2;
      const previous = viewRef.current;
      const ratio = 2.5 / previous.zoom;
      viewRef.current = {
        zoom: 2.5,
        x: cursorX - (cursorX - previous.x) * ratio,
        y: cursorY - (cursorY - previous.y) * ratio,
      };
      scheduleTransform();
    };

    const fileName = photo.filePath.split('/').pop() ?? photo.filePath;

    return (
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
        onDoubleClick={handleDoubleClick}
        className="absolute inset-0 overflow-hidden touch-none"
      >
        <div
          ref={transformRef}
          className="absolute inset-4"
          style={{ transformOrigin: 'center center' }}
        >
          <img
            src={getPhotoUrl('thumb', photo.filePath)}
            alt={fileName}
            draggable={false}
            onError={() => console.warn('Failed to load modal thumbnail:', photo.filePath)}
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
              highResLoaded ? 'opacity-0' : 'opacity-100 blur-xs'
            }`}
          />
          <img
            src={getPhotoUrl('original', photo.filePath)}
            alt={fileName}
            draggable={false}
            onLoad={() => {
              if (mountedRef.current) setHighResLoaded(true);
            }}
            onError={() => {
              console.warn('Failed to load original modal photo:', photo.filePath);
              if (mountedRef.current) setImageError(true);
            }}
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
              highResLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
        {imageError && (
          <p role="status" className="absolute bottom-3 left-3 rounded bg-black/70 px-3 py-2 text-xs text-white">
            Original photo could not be loaded.
          </p>
        )}
      </div>
    );
  },
));

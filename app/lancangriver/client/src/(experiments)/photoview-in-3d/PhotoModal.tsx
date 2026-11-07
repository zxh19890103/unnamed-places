import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Cross1Icon,
  InfoCircledIcon,
  GlobeIcon,
  Share2Icon,
  ResetIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@radix-ui/react-icons';
import type { PhotoRecord } from '@/photos/types';
import { BASE_URL } from '@/calc/constants';
import type { ExifData } from './_photo';
import { PhotoFilmstrip } from './PhotoFilmstrip';
import { PhotoViewport, type PhotoViewportHandle } from './PhotoViewport';
import { PhotoMapPanel } from './PhotoMapPanel';
import { PhotoJourneyPanel } from './photo-journey/PhotoJourneyPanel';
import { Tooltip } from '@/_components/Tooltip';
import type { BBox } from './_tile';

export interface PhotoModalProps {
  photo: PhotoRecord;
  photos?: PhotoRecord[];
  osmBbox?: BBox | null;
  onClose: (finalPhoto: PhotoRecord) => void;
}

function formatExposureTime(exposureTime: number | null): string | null {
  if (exposureTime === null || exposureTime <= 0) return null;
  if (exposureTime >= 1) return `${exposureTime.toFixed(1).replace(/\.0$/, '')}s`;
  const denominator = Math.round(1 / exposureTime);
  return `1/${denominator}s`;
}

function formatFileSize(bytes: number | null): string | null {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export function PhotoModal({ photo: initialPhoto, photos, osmBbox, onClose }: PhotoModalProps) {
  const [activePhoto, setActivePhoto] = useState<PhotoRecord>(initialPhoto);
  const [showExif, setShowExif] = useState(false);
  const [leftPanel, setLeftPanel] = useState<'map' | 'journey' | null>(null);
  const [exif, setExif] = useState<ExifData | null>(null);
  const [exifLoading, setExifLoading] = useState(false);

  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef<PhotoViewportHandle | null>(null);
  const exifCacheRef = useRef<Map<string, ExifData>>(new Map());

  const photoList = useMemo(
    () => (photos?.length ? photos : [initialPhoto]),
    [photos, initialPhoto],
  );
  const currentIndex = useMemo(
    () => photoList.findIndex((p) => p.id === activePhoto.id),
    [photoList, activePhoto.id],
  );
  const effectiveIndex = currentIndex >= 0 ? currentIndex : 0;
  const hasPrev = effectiveIndex > 0;
  const hasNext = effectiveIndex < photoList.length - 1;

  const resetView = useCallback(() => {
    viewportRef.current?.reset();
  }, []);

  const selectPhoto = useCallback(
    (photo: PhotoRecord) => {
      resetView();
      setActivePhoto(photo);
    },
    [resetView],
  );

  const goToPrev = useCallback(() => {
    if (hasPrev) {
      selectPhoto(photoList[effectiveIndex - 1]);
    }
  }, [hasPrev, photoList, effectiveIndex, selectPhoto]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      selectPhoto(photoList[effectiveIndex + 1]);
    }
  }, [hasNext, photoList, effectiveIndex, selectPhoto]);

  const handleClose = useCallback(() => {
    onClose(activePhoto);
  }, [onClose, activePhoto]);

  // Fetch EXIF metadata for active photo
  useEffect(() => {
    let cancelled = false;
    const filePath = activePhoto.filePath;

    if (exifCacheRef.current.has(filePath)) {
      setExif(exifCacheRef.current.get(filePath)!);
      return;
    }

    setExifLoading(true);
    fetch(`${BASE_URL}/photos/exif/${encodeURIComponent(filePath)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { exif: ExifData } | null) => {
        if (!cancelled && data?.exif) {
          exifCacheRef.current.set(filePath, data.exif);
          setExif(data.exif);
        }
      })
      .catch((err) => {
        console.warn('Failed to load EXIF for modal photo:', err);
      })
      .finally(() => {
        if (!cancelled) setExifLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activePhoto.filePath]);

  // Keyboard navigation & controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.target instanceof Element && e.target.closest('[data-photo-map]')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setShowExif((prev) => !prev);
      } else if (e.key === '0' || e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        resetView();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose, goToPrev, goToNext, resetView]);

  const fileName = activePhoto.filePath.split('/').pop() ?? activePhoto.filePath;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo viewer - ${fileName}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-md select-none pointer-events-auto animate-fade-in"
    >
      {/* Top bar header */}
      <header className="flex h-14 min-h-14 items-center justify-between border-b border-white/10 px-5 text-jade-text bg-stone-900">
        <div className="flex items-center gap-3 min-w-0">
          <span className="truncate text-sm font-semibold tracking-wide text-white">
            {fileName}
          </span>
          {activePhoto.takenAt && (
            <span className="hidden sm:inline-block text-xs text-white/50">
              {new Date(activePhoto.takenAt).toLocaleString()}
            </span>
          )}
          {photoList.length > 1 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/70">
              {effectiveIndex + 1} / {photoList.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <button
            type="button"
            onClick={() => viewportRef.current?.zoomBy(0.75)}
            aria-label="Zoom out"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/80 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
          >
            <ZoomOutIcon />
          </button>
          <button
            type="button"
            onClick={resetView}
            aria-label="Reset zoom"
            title="Reset to fit (0 or R)"
            className="flex h-8 px-2 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 text-xs text-white/80 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
          >
            <ResetIcon className="h-3 w-3" />
            <span>{Math.round(zoom * 100)}%</span>
          </button>
          <button
            type="button"
            onClick={() => viewportRef.current?.zoomBy(1.35)}
            aria-label="Zoom in"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/80 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
          >
            <ZoomInIcon />
          </button>

          <Tooltip label={leftPanel === 'map' ? 'Close map' : 'Open map'}>
          <button
            type="button"
            onClick={() => setLeftPanel((previous) => previous === 'map' ? null : 'map')}
            aria-label="Toggle photo map"
            aria-expanded={leftPanel === 'map'}
            aria-controls="photo-map-panel"
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
              leftPanel === 'map'
                ? 'border-jade-river bg-jade-river/20 text-white'
                : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/15 hover:text-white'
            }`}
          >
            <GlobeIcon />
          </button>
          </Tooltip>
          <Tooltip label={leftPanel === 'journey' ? 'Close journey' : 'Open journey'}>
            <button
              type="button"
              onClick={() => setLeftPanel((previous) => previous === 'journey' ? null : 'journey')}
              aria-label="Toggle photo journey"
              aria-expanded={leftPanel === 'journey'}
              aria-controls="photo-journey-panel"
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                leftPanel === 'journey'
                  ? 'border-jade-river bg-jade-river/20 text-white'
                  : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/15 hover:text-white'
              }`}
            >
              <Share2Icon />
            </button>
          </Tooltip>

          {/* EXIF drawer toggle */}
          <button
            type="button"
            onClick={() => setShowExif((prev) => !prev)}
            aria-label="Toggle EXIF Info"
            title="Toggle EXIF drawer (I)"
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
              showExif
                ? 'border-jade-river bg-jade-river/20 text-white'
                : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/15 hover:text-white'
            }`}
          >
            <InfoCircledIcon />
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close modal"
            title="Close (Esc)"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-white transition-colors hover:bg-red-500/80 cursor-pointer"
          >
            <Cross1Icon />
          </button>
        </div>
      </header>

      {/* Main content area */}
      <div className="relative flex flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
        {leftPanel === 'map' && (
          <PhotoMapPanel
            photos={photoList}
            activePhotoId={activePhoto.id}
            osmBbox={osmBbox ?? null}
            onSelect={selectPhoto}
            onClose={() => setLeftPanel(null)}
          />
        )}
        {leftPanel === 'journey' && (
          <PhotoJourneyPanel
            photos={photoList}
            activePhoto={activePhoto}
            osmBbox={osmBbox ?? null}
            onSelect={selectPhoto}
            onClose={() => setLeftPanel(null)}
          />
        )}
        <div
          className={`flex flex-1 flex-col ${leftPanel || showExif ? 'min-w-[320px]' : 'min-w-0'}`}
        >
          <div className="relative min-h-0 flex-1">
            <PhotoViewport
              key={`${activePhoto.id}:${activePhoto.filePath}`}
              ref={viewportRef}
              photo={activePhoto}
              onZoomChange={setZoom}
            />
            {hasPrev && (
              <button
                type="button"
                onClick={goToPrev}
                aria-label="Previous photo"
                title="Previous photo (Arrow Left)"
                className="absolute left-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/70 hover:scale-110 active:scale-95 cursor-pointer"
              >
                <ChevronLeftIcon className="h-6 w-6" />
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                onClick={goToNext}
                aria-label="Next photo"
                title="Next photo (Arrow Right)"
                className="absolute right-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/70 hover:scale-110 active:scale-95 cursor-pointer"
              >
                <ChevronRightIcon className="h-6 w-6" />
              </button>
            )}
          </div>
          <PhotoFilmstrip photos={photoList} activeIndex={currentIndex} onSelect={selectPhoto} />
        </div>

        {/* Collapsible EXIF sidebar drawer */}
        {showExif && (
          <aside className="w-80 shrink-0 border-l border-white/10 bg-stone-800/80 backdrop-blur-xl p-5 text-jade-text text-xs overflow-y-auto space-y-5 animate-slide-left">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-semibold text-white tracking-wide">EXIF Telemetry</h3>
              <button
                type="button"
                onClick={() => setShowExif(false)}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                <Cross1Icon />
              </button>
            </div>

            {exifLoading ? (
              <div className="flex h-32 items-center justify-center text-white/50">
                <span>Loading metadata...</span>
              </div>
            ) : exif ? (
              <div className="space-y-4">
                {/* Camera & Lens */}
                <div>
                  <h4 className="text-[10px] font-semibold text-jade-river uppercase tracking-wider mb-1.5">
                    Camera & Lens
                  </h4>
                  <div className="space-y-1 bg-white/5 p-2.5 rounded-lg border border-white/5">
                    <p className="font-medium text-white">
                      {[exif.make, exif.model].filter(Boolean).join(' ') || 'Unknown Camera'}
                    </p>
                    {exif.lensModel && <p className="text-white/70">{exif.lensModel}</p>}
                    {exif.software && (
                      <p className="text-white/40 text-[10px]">Processed: {exif.software}</p>
                    )}
                  </div>
                </div>

                {/* Exposure Parameters */}
                <div>
                  <h4 className="text-[10px] font-semibold text-jade-river uppercase tracking-wider mb-1.5">
                    Exposure Settings
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                      <span className="text-[10px] text-white/50">Focal Length</span>
                      <p className="text-sm font-semibold text-white">
                        {exif.focalLength ? `${exif.focalLength} mm` : '—'}
                      </p>
                      {exif.focalLengthIn35mmFormat && (
                        <span className="text-[10px] text-white/40">
                          {exif.focalLengthIn35mmFormat} mm (35mm)
                        </span>
                      )}
                    </div>
                    <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                      <span className="text-[10px] text-white/50">Aperture</span>
                      <p className="text-sm font-semibold text-white">
                        {exif.fNumber ? `ƒ/${exif.fNumber}` : '—'}
                      </p>
                    </div>
                    <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                      <span className="text-[10px] text-white/50">Shutter Speed</span>
                      <p className="text-sm font-semibold text-white">
                        {formatExposureTime(exif.exposureTime) ?? '—'}
                      </p>
                    </div>
                    <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                      <span className="text-[10px] text-white/50">ISO</span>
                      <p className="text-sm font-semibold text-white">{exif.iso ?? '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Geometry & File */}
                <div>
                  <h4 className="text-[10px] font-semibold text-jade-river uppercase tracking-wider mb-1.5">
                    Dimensions & Size
                  </h4>
                  <div className="space-y-1 bg-white/5 p-2.5 rounded-lg border border-white/5">
                    <p className="text-white/80">
                      Dimensions:{' '}
                      <span className="text-white font-medium">
                        {exif.imageWidth && exif.imageHeight
                          ? `${exif.imageWidth} × ${exif.imageHeight}`
                          : '—'}
                      </span>
                    </p>
                    {formatFileSize(exif.sizeBytes) && (
                      <p className="text-white/80">
                        Size:{' '}
                        <span className="text-white font-medium">
                          {formatFileSize(exif.sizeBytes)}
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Geolocation & Time */}
                <div>
                  <h4 className="text-[10px] font-semibold text-jade-river uppercase tracking-wider mb-1.5">
                    Geospatial & Time
                  </h4>
                  <div className="space-y-1.5 bg-white/5 p-2.5 rounded-lg border border-white/5">
                    <div className="flex justify-between">
                      <span className="text-white/50">Latitude:</span>
                      <span className="text-white font-medium">
                        {(exif.latitude ?? activePhoto.lat)?.toFixed(5)}°
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Longitude:</span>
                      <span className="text-white font-medium">
                        {(exif.longitude ?? activePhoto.lng)?.toFixed(5)}°
                      </span>
                    </div>
                    {exif.altitude !== null && (
                      <div className="flex justify-between">
                        <span className="text-white/50">Altitude:</span>
                        <span className="text-white font-medium">
                          {Math.round(exif.altitude)} m
                        </span>
                      </div>
                    )}
                    {exif.dateTimeOriginal && (
                      <div className="pt-1 border-t border-white/5">
                        <span className="text-[10px] text-white/50">Captured:</span>
                        <p className="text-white/90 text-[11px]">{exif.dateTimeOriginal}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-white/50">No EXIF data found for this photo.</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

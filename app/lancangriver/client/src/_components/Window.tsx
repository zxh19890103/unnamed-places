import { Cross1Icon } from '@radix-ui/react-icons';
import { IconButton } from './Button';
import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ComponentStoryBook } from './_types';

type Props = {
  winRole?: string;
  title?: React.ReactNode;
  pageUrl: string;
  iframeElementRef?: React.RefObject<HTMLIFrameElement>;
  className?: string;
  size?: number;
  onOpenStateChange?: (open: boolean) => void;
};

function onOpenStateChangeStub() {}

export const ChildWindow = ({
  title = 'A child window',
  winRole = 'Another Data Presentation',
  pageUrl = 'https://google.com',
  onOpenStateChange = onOpenStateChangeStub,
  iframeElementRef,
  className,
  size = null,
}: Props) => {
  const [isPageLoading, setIsPageLoading] = useState(true);
  const titleId = useId();

  useEffect(() => {
    setIsPageLoading(true);
  }, [pageUrl]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={clsx(
        'flex max-h-[calc(100vh-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-jade-border bg-jade-panel/95 text-jade-text shadow-[0_12px_36px_rgba(24,42,54,0.16)] backdrop-blur-md',
        className ? className : 'h-full w-full ',
      )}
    >
      <header className="z-1 flex min-h-14 items-center justify-between gap-3 border-b border-jade-border-soft px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-jade-river uppercase">{winRole}</p>
          <h2 id={titleId} className="truncate text-sm font-semibold">
            {title}
          </h2>
        </div>
        <IconButton size="sm" onClick={() => onOpenStateChange(false)} aria-label={winRole}>
          <Cross1Icon />
        </IconButton>
      </header>
      <div className="relative min-h-0 flex-1 bg-jade-depth">
        <iframe
          title={winRole}
          src={pageUrl}
          ref={iframeElementRef}
          onLoad={() => setIsPageLoading(false)}
          className="h-full w-full border-0"
        />
        {isPageLoading && (
          <div
            className="absolute inset-0 grid place-items-center bg-jade-depth text-sm text-jade-text-muted"
            role="status"
          >
            Loading page...
          </div>
        )}
      </div>
    </div>
  );
};

export const useChildWindowMessages = (type: string, callback: (data: any) => void) => {
  const callbackRef = useRef<(data: any) => void>(callback);

  callbackRef.current = callback;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.type !== type) {
        return;
      }

      callbackRef.current(event.data);
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [type]);
};

const ChildWindowModal = ({
  children,
  className,
  size = null,
  closeSignal = false,
  onClose,
}: React.PropsWithChildren<{
  className?: string;
  /**
   * Size of the modal viewport as a percentage.
   * Example: 96 renders at 96vw and 96vh.
   */
  size?: number;
  closeSignal?: any;
  onClose?: (signal?: any) => void;
}>) => {
  const backrdopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.(closeSignal);
      }
    };

    const requestClose = (event) => {
      event.stopPropagation();
      onClose?.(closeSignal);
    };

    // backrdopRef.current?.addEventListener("click", requestClose);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // backrdopRef.current?.removeEventListener("click", requestClose);
    };
  }, [closeSignal, onClose]);

  const portalRoot = typeof document !== 'undefined' ? document.body : null;

  if (!portalRoot) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-1994 grid place-items-center bg-jade-950/45 p-3 backdrop-blur-[2px]">
      <div ref={backrdopRef} aria-label="backdrop" className="absolute inset-0" />
      <div
        className={clsx(
          'h-[min(80vh,760px)] w-[min(90vw,1280px)] overflow-hidden rounded-xl border border-jade-border bg-jade-panel shadow-[0_20px_60px_rgba(24,42,54,0.18)]',
          className,
        )}
        style={
          size
            ? {
                width: `${size}vw`,
                height: `${size}vh`,
              }
            : null
        }
      >
        {children}
      </div>
    </div>,
    portalRoot,
  );
};

ChildWindow.Modal = ChildWindowModal;

ChildWindow.__storybook = (): ComponentStoryBook<Props> => {
  return {
    pageUrl: '/flat',
  };
};

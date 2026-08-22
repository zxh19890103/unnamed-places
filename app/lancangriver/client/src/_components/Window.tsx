import { Cross1Icon } from "@radix-ui/react-icons";
import { IconButton } from "./Button";
import React, { useEffect, useState } from "react";
import clsx from "clsx";

type Props = {
  winRole?: string;
  title?: React.ReactNode;
  pageUrl: string;
  iframeElementRef?: React.RefObject<HTMLIFrameElement>;
  className?: string;
  onOpenStateChange?: (open: boolean) => void;
};

function onOpenStateChangeStub() {}

export const ChildWindow = ({
  title = "A child window",
  winRole = "Another Data Presentation",
  pageUrl = "https://google.com",
  onOpenStateChange = onOpenStateChangeStub,
  iframeElementRef,
  className,
}: Props) => {
  const [isPageLoading, setIsPageLoading] = useState(true);

  useEffect(() => {
    setIsPageLoading(true);
  }, [pageUrl]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="child-win-dialog-title"
      className={clsx(
        "flex flex-col overflow-hidden rounded-xl bg-jade-panel text-jade-text",
        className ? className : "h-full w-full ",
      )}
    >
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-jade-border-soft px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-jade-river uppercase">
            {winRole}
          </p>
          <h2
            id="flat-map-dialog-title"
            className="truncate text-sm font-semibold"
          >
            {title}
          </h2>
        </div>
        <IconButton
          size="sm"
          onClick={() => onOpenStateChange(false)}
          aria-label={winRole}
        >
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

ChildWindow.Modal = ({ children }: React.PropsWithChildren<{}>) => {
  return (
    <div className="absolute inset-0 z-1994 grid place-items-center bg-jade-950/45 p-3 backdrop-blur-[2px]">
      <div className="h-[min(80vh,760px)] w-[min(90vw,1280px)] overflow-hidden rounded-xl border border-jade-border bg-jade-panel shadow-2xl shadow-[#182a36]/25">
        {children}
      </div>
    </div>
  );
};

import React, { useState } from "react";
import clsx from "clsx";
import { ArrowBottomLeftIcon, ArrowTopRightIcon } from "@radix-ui/react-icons";
import { IconButton } from "./Button";

type Props = {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  minIcon?: React.ReactNode;
  maxIcon?: React.ReactNode;
  defaultMinimized?: boolean;
  defaultMaximized?: boolean;
  onClose?: () => void;
};

export const Panel = ({
  title = "Panel",
  description = "Yes, it is a panel",
  children,
  className,
  defaultMinimized = false,
  defaultMaximized = false,
  minIcon = <ArrowTopRightIcon />,
  maxIcon = <ArrowBottomLeftIcon />,
  onClose,
}: Props) => {
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);
  const [isMaximized, setIsMaximized] = useState(defaultMaximized);

  return (
    <section
      className={clsx(
        "overflow-hidden rounded-xl bg-jade-panel/95 text-jade-text",
        isMaximized ? "w-full max-w-none" : "w-[min(360px,100%)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-jade-text">{title}</h3>
          {!isMinimized && description ? (
            <p className="mt-0.5 text-xs text-jade-text-muted">{description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <IconButton
            onClick={() => setIsMinimized((value) => !value)}
            aria-label={isMinimized ? "Restore panel" : "Minimize panel"}
            aria-expanded={!isMinimized}
            size="sm"
          >
            {isMinimized ? minIcon : maxIcon}
          </IconButton>
        </div>
      </div>

      {isMinimized ? null : (
        <div className=" mx-2">
          <hr className="border-t border-jade-border-soft" />
        </div>
      )}

      {!isMinimized ? (
        <div
          className={clsx(
            "px-4 py-3",
            isMaximized
              ? "max-h-[70vh] overflow-auto"
              : "max-h-[min(320px,60vh)] overflow-auto",
          )}
        >
          {children ? children : <div className="min-h-36" />}
        </div>
      ) : null}
    </section>
  );
};

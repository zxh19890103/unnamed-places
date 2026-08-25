import * as RadixTooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import React from "react";
import { ComponentStoryBook } from "./_types";

type TooltipSide = "top" | "right" | "bottom" | "left";
type TooltipAlign = "start" | "center" | "end";

type Props = {
  label: React.ReactNode;
  children: React.ReactElement;
  side?: TooltipSide;
  align?: TooltipAlign;
  sideOffset?: number;
  delayDuration?: number;
  skipDelayDuration?: number;
  className?: string;
  withArrow?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const baseContentClassName =
  "z-2000 rounded-lg bg-jade-panel-raised px-3 py-2 text-xs font-medium text-jade-text shadow-[0_12px_30px_rgba(24,42,54,0.18)] select-none";

export const Tooltip = ({
  label,
  children,
  side = "top",
  align = "center",
  sideOffset = 8,
  delayDuration = 250,
  skipDelayDuration = 100,
  className,
  withArrow = true,
  open,
  defaultOpen,
  onOpenChange,
}: Props) => {
  return (
    <RadixTooltip.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
    >
      <RadixTooltip.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
      >
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            align={align}
            sideOffset={sideOffset}
            className={clsx(baseContentClassName, className)}
          >
            {label}
            {withArrow ? (
              <RadixTooltip.Arrow className="fill-jade-panel-raised" />
            ) : null}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
};

Tooltip.__storybook = (): ComponentStoryBook<Props> => {
  return [
    {
      label: "Open details",
      children: (
        <button className="rounded-lg border border-jade-border bg-jade-control px-3 py-2 text-sm text-jade-text">
          Hover me
        </button>
      ),
    },
    {
      label: "Running now",
      side: "right",
      children: (
        <button className="rounded-lg border border-jade-border bg-jade-river px-3 py-2 text-sm text-white">
          Action
        </button>
      ),
    },
  ];
};

import clsx from "clsx";
import React from "react";

type TagVariant =
  | "default"
  | "primary"
  | "secondary"
  | "destructive"
  | "success"
  | "silt";
type TagSize = "xs" | "sm" | "base" | "lg";

type Props = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: TagVariant;
  className?: string;
  size?: TagSize;
  running?: boolean;
  uppercase?: boolean;
};

const baseTagClassName =
  "inline-flex select-none items-center justify-center whitespace-nowrap rounded-full font-medium shadow-[0_8px_24px_rgba(24,42,54,0.10)] transition-colors duration-150";

const runningTagClassName =
  "motion-safe:animate-[tag-pulse_1.2s_ease-in-out_infinite]";

const tagVariants: Record<TagVariant, string> = {
  default: "bg-jade-control text-jade-text",
  primary: "bg-jade-river text-white",
  secondary: "bg-jade-panel text-jade-text",
  destructive: "bg-jade-error text-white",
  success: "bg-jade-success text-white",
  silt: "bg-jade-silt text-white",
};

const tagSizes: Record<TagSize, string> = {
  xs: "min-h-5 px-2 py-0.5 text-[10px] leading-3",
  sm: "min-h-6 px-2.5 py-1 text-[11px] leading-4",
  base: "min-h-8 px-3 py-1.5 text-xs leading-4",
  lg: "min-h-10 px-3.5 py-2 text-sm leading-5",
};

export const Tag = ({
  variant = "default",
  className,
  size = "base",
  running = false,
  uppercase = false,
  children,
  ...props
}: React.PropsWithChildren<Props>) => {
  return (
    <span
      {...props}
      className={clsx(
        baseTagClassName,
        tagVariants[variant],
        tagSizes[size],
        running && runningTagClassName,
        uppercase && "uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
};

Tag.__storybook = (): Props[] => {
  return [
    {
      children: "Queued",
    },
    {
      children: "Live",
      variant: "primary",
      running: true,
    },
    {
      children: "Draft",
      variant: "secondary",
      uppercase: true,
    },
    {
      children: "Failed",
      variant: "destructive",
    },
    {
      children: "Done",
      variant: "success",
    },
    {
      children: "Pending",
      variant: "silt",
    },
  ];
};

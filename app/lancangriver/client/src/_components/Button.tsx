import { IconJarLogoIcon } from "@radix-ui/react-icons";
import clsx from "clsx";
import React from "react";

type ButtonVariant = "default" | "primary" | "secondary" | "destructive";
type ButtonSize = "base" | "sm" | "lg";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  className?: string;
  size?: ButtonSize;
  disabled?: boolean;
};

const baseButtonClassName =
  "inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river active:translate-y-px active:scale-[0.98] active:ring-2 active:ring-offset-1 active:ring-offset-jade-foundation disabled:cursor-not-allowed disabled:opacity-60 disabled:translate-y-0 disabled:scale-100 disabled:shadow-none disabled:ring-0 disabled:transition-none disabled:active:translate-y-0 disabled:active:scale-100 disabled:active:shadow-none disabled:active:ring-0";

const buttonVariants: Record<ButtonVariant, string> = {
  default:
    "bg-jade-control text-jade-text hover:bg-jade-control-hover active:bg-jade-depth",
  primary:
    "bg-jade-river text-white hover:bg-jade-river/90 active:bg-jade-river/80",
  secondary:
    "bg-jade-panel text-jade-text hover:bg-jade-control active:bg-jade-depth",
  destructive:
    "bg-jade-error text-white hover:bg-jade-error/90 active:bg-jade-error/80",
};

const baseIconButtonClassName =
  "inline-flex select-none items-center justify-center rounded-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river active:translate-y-px active:scale-[0.97] active:ring-2 active:ring-offset-1 active:ring-offset-jade-foundation disabled:cursor-not-allowed disabled:opacity-60 disabled:translate-y-0 disabled:scale-100 disabled:shadow-none disabled:ring-0 disabled:transition-none disabled:active:translate-y-0 disabled:active:scale-100 disabled:active:shadow-none disabled:active:ring-0";

const buttonSizes: Record<ButtonSize, string> = {
  base: "min-h-10 px-3 py-2 text-sm",
  sm: "min-h-8 px-2.5 py-1.5 text-xs",
  lg: "min-h-11 px-4 py-2.5 text-base",
};

const iconButtonSizes: Record<ButtonSize, string> = {
  base: "size-10",
  sm: "size-8",
  lg: "size-11",
};

const iconButtonVariants: Record<ButtonVariant, string> = {
  default:
    "bg-jade-control text-jade-text hover:bg-jade-control-hover active:bg-jade-depth",
  primary:
    "bg-jade-river text-white hover:bg-jade-river/90 active:bg-jade-river/80",
  secondary:
    "bg-jade-panel text-jade-text hover:bg-jade-control active:bg-jade-depth",
  destructive:
    "bg-jade-error text-white hover:bg-jade-error/90 active:bg-jade-error/80",
};

const buttonPressVariants: Record<ButtonVariant, string> = {
  default:
    "active:shadow-[0_0_0_2px_rgba(125,139,153,0.18)] active:ring-jade-border/35",
  primary:
    "active:shadow-[0_0_0_2px_rgba(6,132,166,0.2)] active:ring-jade-river/30",
  secondary:
    "active:shadow-[0_0_0_2px_rgba(7,142,165,0.16)] active:ring-jade-river/20",
  destructive:
    "active:shadow-[0_0_0_2px_rgba(191,69,69,0.18)] active:ring-jade-error/25",
};

const iconButtonPressVariants: Record<ButtonVariant, string> = {
  default:
    "active:shadow-[0_0_0_2px_rgba(125,139,153,0.18)] active:ring-jade-border/35",
  primary:
    "active:shadow-[0_0_0_2px_rgba(6,132,166,0.2)] active:ring-jade-river/30",
  secondary:
    "active:shadow-[0_0_0_2px_rgba(7,142,165,0.16)] active:ring-jade-river/20",
  destructive:
    "active:shadow-[0_0_0_2px_rgba(191,69,69,0.18)] active:ring-jade-error/25",
};

export const Button = ({
  variant = "default",
  className,
  children,
  type = "button",
  size = "base",
  ...props
}: React.PropsWithChildren<Props>) => {
  return (
    <button
      {...props}
      type={type}
      className={clsx(
        baseButtonClassName,
        buttonVariants[variant],
        buttonPressVariants[variant],
        buttonSizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
};

export const IconButton = ({
  variant = "default",
  className,
  children,
  type = "button",
  size = "base",
  ...props
}: React.PropsWithChildren<Props>) => {
  return (
    <button
      {...props}
      type={type}
      className={clsx(
        baseIconButtonClassName,
        iconButtonVariants[variant],
        iconButtonPressVariants[variant],
        iconButtonSizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
};

Button.__storybook = (): Props[] => {
  return [
    {
      children: "Hello, World!",
    },
    {
      children: "Hello, World!",
      variant: "destructive",
    },
    {
      children: "Hello, World!",
      variant: "primary",
    },
    {
      children: "Hello, World!",
      variant: "secondary",
    },
  ];
};

IconButton.__storybook = (): Props[] => {
  return [
    {
      children: <IconJarLogoIcon />,
    },
    {
      children: <IconJarLogoIcon />,
      variant: "destructive",
    },
    {
      children: <IconJarLogoIcon />,
      variant: "secondary",
    },
    {
      children: <IconJarLogoIcon />,
      variant: "primary",
    },
  ];
};

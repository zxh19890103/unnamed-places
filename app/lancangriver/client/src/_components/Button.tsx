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
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river disabled:cursor-not-allowed disabled:opacity-60";

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
  "inline-flex items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river disabled:cursor-not-allowed disabled:opacity-60";

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
        iconButtonSizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
};

Button.__storybook = () => {
  return {
    children: "Hello, World!",
    onClick: () => {
      alert("hello, world!");
    },
  };
};

IconButton.__storybook = () => {
  return {
    children: <IconJarLogoIcon />,
  };
};

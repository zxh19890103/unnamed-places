import { IconJarLogoIcon } from '@radix-ui/react-icons';
import clsx from 'clsx';
import React from 'react';
import { ComponentStoryBook } from './_types';

type ButtonVariant = 'default' | 'primary' | 'secondary' | 'destructive' | 'success' | 'silt';
type ButtonSize = 'xs' | 'sm' | 'base' | 'lg';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  className?: string;
  size?: ButtonSize;
  disabled?: boolean;
};

const baseButtonClassName =
  'inline-flex select-none items-center justify-center gap-2 rounded-lg border font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river active:ring-2 active:ring-offset-1 active:ring-offset-jade-foundation disabled:cursor-not-allowed disabled:border-jade-border-soft disabled:bg-jade-control disabled:text-jade-text-muted disabled:opacity-55 disabled:shadow-none disabled:ring-0 disabled:transition-none disabled:active:shadow-none disabled:active:ring-0';

const buttonVariants: Record<ButtonVariant, string> = {
  default:
    'border-jade-border-soft bg-jade-control text-jade-text hover:border-jade-border hover:bg-jade-control-hover active:bg-jade-depth aria-pressed:border-jade-river aria-pressed:bg-jade-river-soft',
  primary:
    'border-jade-river bg-jade-river text-white hover:border-jade-river-600 hover:bg-jade-river-600 active:bg-jade-river-700',
  secondary:
    'border-jade-border-soft bg-jade-panel text-jade-text hover:border-jade-border hover:bg-jade-control active:bg-jade-depth aria-pressed:border-jade-river aria-pressed:bg-jade-river-soft',
  destructive:
    'border-jade-error bg-jade-error text-white hover:border-jade-error-600 hover:bg-jade-error-600 active:bg-jade-error-700',
  success:
    'border-jade-success bg-jade-success text-white hover:border-jade-success-600 hover:bg-jade-success-600 active:bg-jade-success-700',
  silt: 'border-jade-silt bg-jade-silt text-white hover:border-jade-silt-600 hover:bg-jade-silt-600 active:bg-jade-silt-700',
};

const baseIconButtonClassName =
  'inline-flex select-none items-center justify-center rounded-full border transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river active:ring-2 active:ring-offset-1 active:ring-offset-jade-foundation disabled:cursor-not-allowed disabled:border-jade-border-soft disabled:bg-jade-control disabled:text-jade-text-muted disabled:opacity-55 disabled:shadow-none disabled:ring-0 disabled:transition-none disabled:active:shadow-none disabled:active:ring-0';

const buttonSizes: Record<ButtonSize, string> = {
  xs: 'min-h-7 px-2 py-1 text-[11px]',
  base: 'min-h-10 px-3 py-2 text-sm',
  sm: 'min-h-8 px-2.5 py-1.5 text-xs',
  lg: 'min-h-11 px-4 py-2.5 text-base',
};

const iconButtonSizes: Record<ButtonSize, string> = {
  xs: 'size-7',
  base: 'size-10',
  sm: 'size-8',
  lg: 'size-11',
};

const iconButtonVariants: Record<ButtonVariant, string> = {
  default:
    'border-jade-border-soft bg-jade-control text-jade-text hover:border-jade-border hover:bg-jade-control-hover active:bg-jade-depth aria-pressed:border-jade-river aria-pressed:bg-jade-river-soft',
  primary:
    'border-jade-river bg-jade-river text-white hover:border-jade-river-600 hover:bg-jade-river-600 active:bg-jade-river-700',
  secondary:
    'border-jade-border-soft bg-jade-panel text-jade-text hover:border-jade-border hover:bg-jade-control active:bg-jade-depth aria-pressed:border-jade-river aria-pressed:bg-jade-river-soft',
  destructive:
    'border-jade-error bg-jade-error text-white hover:border-jade-error-600 hover:bg-jade-error-600 active:bg-jade-error-700',
  success:
    'border-jade-success bg-jade-success text-white hover:border-jade-success-600 hover:bg-jade-success-600 active:bg-jade-success-700',
  silt: 'border-jade-silt bg-jade-silt text-white hover:border-jade-silt-600 hover:bg-jade-silt-600 active:bg-jade-silt-700',
};

const buttonPressVariants: Record<ButtonVariant, string> = {
  default: 'active:shadow-[0_0_0_2px_rgba(125,139,153,0.18)] active:ring-jade-border/35',
  primary: 'active:shadow-[0_0_0_2px_rgba(6,132,166,0.2)] active:ring-jade-river/30',
  secondary: 'active:shadow-[0_0_0_2px_rgba(7,142,165,0.16)] active:ring-jade-river/20',
  destructive: 'active:shadow-[0_0_0_2px_rgba(191,69,69,0.18)] active:ring-jade-error/25',
  success: 'active:shadow-[0_0_0_2px_rgba(46,155,102,0.18)] active:ring-jade-success/25',
  silt: 'active:shadow-[0_0_0_2px_rgba(199,131,19,0.18)] active:ring-jade-silt/25',
};

const iconButtonPressVariants: Record<ButtonVariant, string> = {
  default: 'active:shadow-[0_0_0_2px_rgba(125,139,153,0.18)] active:ring-jade-border/35',
  primary: 'active:shadow-[0_0_0_2px_rgba(6,132,166,0.2)] active:ring-jade-river/30',
  secondary: 'active:shadow-[0_0_0_2px_rgba(7,142,165,0.16)] active:ring-jade-river/20',
  destructive: 'active:shadow-[0_0_0_2px_rgba(191,69,69,0.18)] active:ring-jade-error/25',
  success: 'active:shadow-[0_0_0_2px_rgba(46,155,102,0.18)] active:ring-jade-success/25',
  silt: 'active:shadow-[0_0_0_2px_rgba(199,131,19,0.18)] active:ring-jade-silt/25',
};

export const Button = ({
  variant = 'default',
  className,
  children,
  type = 'button',
  size = 'base',
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
  variant = 'default',
  className,
  children,
  type = 'button',
  size = 'base',
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
      children: 'Hello, World!',
    },
    {
      children: 'Hello, World!',
      variant: 'destructive',
    },
    {
      children: 'Hello, World!',
      variant: 'primary',
    },
    {
      children: 'Hello, World!',
      variant: 'secondary',
    },
    {
      children: 'Hello, World!',
      variant: 'success',
    },
    {
      children: 'Hello, World!',
      variant: 'silt',
    },
  ];
};

IconButton.__storybook = (): ComponentStoryBook<Props> => {
  return [
    {
      children: <IconJarLogoIcon />,
    },
    {
      children: <IconJarLogoIcon />,
      variant: 'destructive',
    },
    {
      children: <IconJarLogoIcon />,
      variant: 'secondary',
    },
    {
      children: <IconJarLogoIcon />,
      variant: 'primary',
    },
    {
      children: <IconJarLogoIcon />,
      variant: 'success',
    },
    {
      children: <IconJarLogoIcon />,
      variant: 'silt',
    },
  ];
};

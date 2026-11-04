import { IconJarLogoIcon } from '@radix-ui/react-icons';
import clsx from 'clsx';
import type React from 'react';
import type { ComponentStoryBook } from './_types';

type ButtonVariant = 'default' | 'primary' | 'secondary' | 'destructive' | 'success' | 'silt';
type ButtonSize = 'xs' | 'sm' | 'base' | 'lg';

type Props = React.ComponentPropsWithRef<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const baseButtonClassName =
  'inline-flex select-none items-center justify-center gap-2 rounded-2xl border font-share-tech-mono ring ring-offset-1 ring-offset-jade-foundation cursor-pointer enabled:hover:brightness-105 enabled:hover:drop-shadow-2xl enabled:active:brightness-95 enabled:active:ring-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 transition-[background-color,box-shadow,filter] duration-150 motion-reduce:transition-none disabled:cursor-not-allowed disabled:border-jade-border-soft disabled:bg-none disabled:bg-jade-control disabled:text-jade-text-muted disabled:opacity-60 disabled:ring-0 disabled:drop-shadow-none';

const baseIconButtonClassName =
  'inline-flex select-none items-center justify-center rounded-full border font-share-tech-mono ring ring-offset-1 ring-offset-jade-foundation cursor-pointer enabled:hover:brightness-105 enabled:hover:drop-shadow-2xl enabled:active:brightness-95 enabled:active:ring-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 transition-[background-color,box-shadow,filter] duration-150 motion-reduce:transition-none disabled:cursor-not-allowed disabled:border-jade-border-soft disabled:bg-none disabled:bg-jade-control disabled:text-jade-text-muted disabled:opacity-60 disabled:ring-0 disabled:drop-shadow-none';

const buttonVariants: Record<ButtonVariant, string> = {
  default:
    'border-slate-700 ring-slate-700 bg-linear-to-b from-white via-zinc-300 to-white text-jade-text-950 drop-shadow-2xl drop-shadow-jade-400 focus-visible:outline-slate-700',
  primary:
    'border-jade-river-800 ring-jade-river-700 bg-linear-to-b from-jade-river-400 via-jade-river to-jade-river-600 text-white drop-shadow-2xl drop-shadow-jade-river/40 focus-visible:outline-jade-river-700',
  secondary:
    'border-slate-600 ring-slate-600 bg-linear-to-b from-jade-panel-raised via-jade-depth to-jade-panel text-jade-text drop-shadow-2xl drop-shadow-jade-300 focus-visible:outline-slate-600',
  destructive:
    'border-jade-error-800 ring-jade-error-700 bg-linear-to-b from-jade-error-400 via-jade-error to-jade-error-600 text-white drop-shadow-2xl drop-shadow-jade-error/40 focus-visible:outline-jade-error-700',
  success:
    'border-jade-success-800 ring-jade-success-700 bg-linear-to-b from-jade-success-400 via-jade-success to-jade-success-600 text-white drop-shadow-2xl drop-shadow-jade-success/40 focus-visible:outline-jade-success-700',
  silt: 'border-jade-silt-800 ring-jade-silt-700 bg-linear-to-b from-jade-silt-400 via-jade-silt to-jade-silt-600 text-white drop-shadow-2xl drop-shadow-jade-silt/40 focus-visible:outline-jade-silt-700',
};

const buttonSizes: Record<ButtonSize, string> = {
  xs: 'min-h-7 min-w-7 px-2 py-0.5 text-[11px]',
  sm: 'min-h-8 min-w-8 px-2 py-1 text-xs',
  base: 'min-h-8 min-w-8 px-2.5 py-1 text-sm',
  lg: 'min-h-10 min-w-10 px-3.5 py-1.5 text-base',
};

const iconButtonSizes: Record<ButtonSize, string> = {
  xs: 'size-7',
  sm: 'size-8',
  base: 'size-8',
  lg: 'size-10',
};

export const Button = ({
  variant = 'default',
  className,
  children,
  type = 'button',
  size = 'base',
  ...props
}: Props) => {
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
  variant = 'default',
  className,
  children,
  type = 'button',
  size = 'base',
  ...props
}: Props) => {
  return (
    <button
      {...props}
      type={type}
      className={clsx(
        baseIconButtonClassName,
        buttonVariants[variant],
        iconButtonSizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
};

Button.__storybook = (): ComponentStoryBook<Props> => [
  {
    description:
      'Default: White-to-zinc gradient with jade glow. Hover, press, or Tab to inspect states.',
    props: { children: 'Default Button' },
  },
  {
    description: 'Primary: Jade river linear gradient with atmospheric cyan glow.',
    props: { children: 'Primary Action', variant: 'primary' },
  },
  {
    description: 'Secondary: Subtle panel gradient with depth border.',
    props: { children: 'Secondary Action', variant: 'secondary' },
  },
  {
    description: 'Destructive: Warning/delete action with error gradient and glow.',
    props: { children: 'Delete Item', variant: 'destructive' },
  },
  {
    description: 'Success: Positive confirmation with green gradient and glow.',
    props: { children: 'Confirm Changes', variant: 'success' },
  },
  {
    description: 'Silt: Earthy amber gradient for highlighted secondary tasks.',
    props: { children: 'Silt Highlight', variant: 'silt' },
  },
  {
    description: 'Disabled: muted surface, no glow, and no hover or press feedback.',
    props: { children: 'Unavailable', disabled: true },
  },
  {
    description: 'With Icon: Shared compact spacing with Radix icon.',
    props: {
      children: (
        <>
          <IconJarLogoIcon aria-hidden="true" />
          Save Place
        </>
      ),
    },
  },
  {
    description: 'Compact (xs) size.',
    props: { children: 'Compact', size: 'xs' },
  },
  {
    description: 'Large (lg) size.',
    props: { children: 'Large Button', size: 'lg' },
  },
];

IconButton.__storybook = (): ComponentStoryBook<Props> => [
  {
    description: 'Default circular icon button with halo ring and jade glow.',
    props: {
      children: <IconJarLogoIcon aria-hidden="true" />,
      'aria-label': 'Explore places',
    },
  },
  {
    description: 'Primary circular icon button.',
    props: {
      children: <IconJarLogoIcon aria-hidden="true" />,
      variant: 'primary',
      'aria-label': 'Primary icon action',
    },
  },
  {
    description: 'Secondary circular icon button.',
    props: {
      children: <IconJarLogoIcon aria-hidden="true" />,
      variant: 'secondary',
      'aria-label': 'Secondary icon action',
    },
  },
  {
    description: 'Destructive circular icon button.',
    props: {
      children: <IconJarLogoIcon aria-hidden="true" />,
      variant: 'destructive',
      'aria-label': 'Delete action',
    },
  },
  {
    description: 'Success circular icon button.',
    props: {
      children: <IconJarLogoIcon aria-hidden="true" />,
      variant: 'success',
      'aria-label': 'Success action',
    },
  },
  {
    description: 'Silt circular icon button.',
    props: {
      children: <IconJarLogoIcon aria-hidden="true" />,
      variant: 'silt',
      'aria-label': 'Silt action',
    },
  },
  {
    description: 'Disabled circular icon button without glow or ring.',
    props: {
      children: <IconJarLogoIcon aria-hidden="true" />,
      disabled: true,
      'aria-label': 'Disabled action',
    },
  },
  {
    description: 'Small (sm) size circular icon button.',
    props: {
      children: <IconJarLogoIcon aria-hidden="true" />,
      size: 'sm',
      'aria-label': 'Small icon button',
    },
  },
];

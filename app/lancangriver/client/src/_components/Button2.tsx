import { IconJarLogoIcon } from '@radix-ui/react-icons';
import clsx from 'clsx';
import type React from 'react';
import type { ComponentStoryBook } from './_types';

type Props = React.ComponentPropsWithRef<'button'>;

export const Button2 = ({ children, className, type = 'button', ...props }: Props) => {
  return (
    <button
      {...props}
      type={type}
      className={clsx(
        'inline-flex min-h-8 min-w-8 select-none items-center justify-center gap-2 rounded-2xl border border-slate-700 px-2 py-1 font-share-tech-mono text-sm text-jade-text-950',
        'bg-linear-to-b from-white via-zinc-300 to-white ring ring-slate-700 ring-offset-1 ring-offset-jade-foundation drop-shadow-2xl drop-shadow-jade-400',
        'cursor-pointer enabled:hover:brightness-105 enabled:hover:drop-shadow-2xl enabled:active:brightness-95 enabled:active:ring-offset-2',
        'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-700',
        'transition-[background-color,box-shadow,filter] duration-150 motion-reduce:transition-none',
        'disabled:cursor-not-allowed disabled:border-jade-border-soft disabled:bg-none disabled:bg-jade-control disabled:text-jade-text-muted disabled:opacity-60 disabled:ring-0 disabled:drop-shadow-none',
        className,
      )}
    >
      {children ?? 'Hello?'}
    </button>
  );
};

Button2.__storybook = (): ComponentStoryBook<Props> => [
  {
    description:
      'White-to-black gradient with a jade glow. Hover, press, or Tab here to inspect each state.',
    props: { children: 'Explore places' },
  },
  {
    description: 'Disabled: muted surface, no glow, and no hover or press feedback.',
    props: { children: 'Unavailable', disabled: true },
  },
  {
    description: 'An icon and label share compact, centered spacing.',
    props: {
      children: (
        <>
          <IconJarLogoIcon aria-hidden="true" />
          Save place
        </>
      ),
    },
  },
  {
    description: 'Icon-only buttons need an accessible name.',
    props: {
      children: <IconJarLogoIcon aria-hidden="true" />,
      'aria-label': 'Save place',
    },
  },
];

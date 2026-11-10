import { useState, type ComponentPropsWithRef } from 'react';
import clsx from 'clsx';
import type { ComponentStoryBook } from './_types';

type Props = Omit<ComponentPropsWithRef<'button'>, 'children' | 'role' | 'aria-checked'> & {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export const ToggleSwitch = ({
  label,
  checked,
  onCheckedChange,
  onClick,
  className = 'text-jade-text',
  ...props
}: Props) => (
  <button
    {...props}
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={(event) => {
      onClick?.(event);
      if (!event.defaultPrevented) onCheckedChange(!checked);
    }}
    className={clsx(
      'group inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent p-0 text-xs',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river-300 disabled:cursor-not-allowed disabled:opacity-40',
      className,
    )}
  >
    <span className={clsx(
      'transition-opacity duration-150 motion-reduce:transition-none',
      checked ? 'opacity-100' : 'opacity-60 group-hover:opacity-90',
    )}>
      {label}
    </span>
    <span
      aria-hidden="true"
      className={clsx(
        'relative h-4 w-7 shrink-0 rounded-full shadow-inner ring-1 ring-inset ring-white/15 transition-colors duration-150 motion-reduce:transition-none',
        checked ? 'bg-jade-river' : 'bg-stone-600',
      )}
    >
      <span className={clsx(
        'absolute left-0.5 top-0.5 h-3 w-3 rounded-full shadow-sm transition-transform duration-150 motion-reduce:transition-none',
        checked ? 'translate-x-3 bg-jade-panel-raised' : 'translate-x-0 bg-stone-300',
      )} />
    </span>
  </button>
);

ToggleSwitch.__storybook = (): ComponentStoryBook<Props> => [
  {
    description: 'A tiny lever, no heavy machinery: click the label or thumb, or use the keyboard.',
    run: function ToggleSwitchDemo() {
      const [checked, setChecked] = useState(false);
      return <ToggleSwitch label="Layers" checked={checked} onCheckedChange={setChecked} />;
    },
  },
];

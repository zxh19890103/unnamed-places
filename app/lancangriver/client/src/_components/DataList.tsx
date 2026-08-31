import clsx from 'clsx';
import type { ReactNode } from 'react';
import { ComponentStoryBook } from './_types';

export type DataListItem = {
  label: ReactNode;
  value: ReactNode;
  actions?: ReactNode;
  key?: string;
  hidden?: boolean;
};

export type DataListSize = 'sm' | 'base';

export type DataListProps = {
  items?: DataListItem[];
  title?: ReactNode;
  emptyText?: ReactNode;
  size?: DataListSize;
  bordered?: boolean;
  className?: string;
  itemClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
};

const sizeClasses: Record<DataListSize, string> = {
  sm: 'text-xs',
  base: 'text-sm',
};

const labelWidthClasses: Record<DataListSize, string> = {
  sm: 'w-36 shrink-0',
  base: 'w-42 shrink-0',
};

export const DataList = ({
  items = [],
  title,
  emptyText = 'No data yet.',
  size = 'base',
  bordered = true,
  className,
  itemClassName,
  labelClassName,
  valueClassName,
}: DataListProps) => {
  const visibleItems = items.filter((item) => !item.hidden);
  const hasItems = visibleItems.length > 0;

  return (
    <div
      className={clsx(
        'w-full rounded-xl text-jade-text',
        bordered && 'border border-jade-border-soft bg-jade-panel-raised/95',
        className,
      )}
    >
      {title ? (
        <div className="border-b border-jade-border-soft/70 px-4 py-2.5">
          <h3 className={clsx('font-semibold', sizeClasses[size])}>{title}</h3>
        </div>
      ) : null}

      <div className={clsx('px-4', bordered ? 'py-2' : 'py-0')}>
        {hasItems ? (
          <dl className="divide-y divide-jade-border-soft/70">
            {visibleItems.map((item, index) => (
              <div
                key={item.key ?? `data-list-${index}`}
                className={clsx('flex items-start gap-3 py-2', sizeClasses[size], itemClassName)}
              >
                <dt
                  className={clsx('text-jade-text-muted', labelWidthClasses[size], labelClassName)}
                >
                  {item.label}
                </dt>
                <dd className={clsx('min-w-0 flex-1 font-medium text-jade-text', valueClassName)}>
                  {item.value}
                </dd>
                {item.actions ? (
                  <div className="ml-auto flex shrink-0 items-center gap-1">{item.actions}</div>
                ) : null}
              </div>
            ))}
          </dl>
        ) : (
          <p className={clsx('py-6 text-center text-jade-text-muted', sizeClasses[size])}>
            {emptyText}
          </p>
        )}
      </div>
    </div>
  );
};

DataList.__storybook = (): ComponentStoryBook<DataListProps> => {
  return [
    {
      description: 'A modest river reading.',
      props: {
        title: 'Segment summary',
        bordered: false,
        items: [
          { label: 'Name', value: 'Lancang-Mekong #7' },
          { label: 'Length', value: '142 km' },
          { label: 'Status', value: 'Traced' },
          { label: 'Elevation', value: '412 m' },
        ],
      },
    },
    {
      description: 'Tiny but mighty.',
      props: {
        size: 'sm',
        items: [
          { label: 'Tile', value: '10/794/472' },
          { label: 'Zoom', value: '10' },
          { label: 'Format', value: 'pbf' },
        ],
      },
    },
    {
      description: 'Nothing to see here.',
      props: {
        title: 'Empty list',
        items: [],
        emptyText: 'Select a feature first.',
      },
    },
    {
      description: 'With row actions for advanced users.',
      props: {
        title: 'Editable fields',
        items: [
          { label: 'Layer', value: 'Waterways', actions: <span>⋮</span> },
          { label: 'Style', value: 'River mist', actions: <span>⋮</span> },
        ],
      },
    },
  ];
};

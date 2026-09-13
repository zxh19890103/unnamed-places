import clsx from 'clsx';
import React, { useState } from 'react';
import type { ComponentStoryBook } from '../_components/_types';

function __defaultStorybook() {
  return {};
}

export default function App({ components }) {
  const [componentEntries] = useState(() =>
    Object.entries(components)
      .map(([name, component]) => {
        if (typeof component !== 'function') return null;

        const getStorybookProps =
          typeof component['__storybook'] === 'function'
            ? component['__storybook']
            : __defaultStorybook;

        return {
          name,
          component,
          getStorybookProps,
        };
      })
      .filter(Boolean),
  );

  const [selectedComponentEntry, setSelectedComponentEntry] = useState(componentEntries[0]);

  return (
    <main className="min-h-screen bg-jade-foundation px-4 py-8 text-jade-text sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase text-jade-river">Lancangriver</p>
          <h1 className="mt-2 text-2xl font-semibold text-jade-text">Component workbench</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-jade-text-muted">
            Inspect shared client components and their supported states.
          </p>
        </header>

        <section className="space-y-4 rounded-xl border border-jade-border bg-jade-panel/95 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-jade-text">Components</h2>
          <div className="flex flex-col gap-4 sm:flex-row">
            <nav
              className="flex gap-2 overflow-x-auto sm:block sm:space-y-2"
              aria-label="Components"
            >
              {componentEntries.map((entry) => {
                return (
                  <div key={entry.name}>
                    <button
                      className={clsx(
                        'min-h-9 whitespace-nowrap rounded-lg border px-3 py-1 text-sm transition-colors hover:border-jade-border hover:bg-jade-control-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-river',
                        entry === selectedComponentEntry
                          ? 'border-jade-river bg-jade-river-soft text-jade-text'
                          : 'border-jade-border-soft bg-jade-control text-jade-text-muted',
                      )}
                      onClick={() => setSelectedComponentEntry(entry)}
                    >
                      {entry.name}
                    </button>
                  </div>
                );
              })}
            </nav>
            <div className="min-w-0 flex-1 border-t border-jade-border-soft pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
              {selectedComponentEntry ? (
                <LoadFc componentEntry={selectedComponentEntry} />
              ) : (
                <div>no component selected.</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

let nextStoryKey = 1911;

const LoadFc = ({ componentEntry }) => {
  const storyEntries = React.useMemo(() => {
    const rawStories = componentEntry.getStorybookProps() as ComponentStoryBook<{}>;
    const normalizedStories = Array.isArray(rawStories) ? rawStories : [rawStories];

    return normalizedStories.map((story) => {
      const key = `__id_${nextStoryKey++}`;

      if (
        story &&
        typeof story === 'object' &&
        !Array.isArray(story) &&
        ('props' in story || 'run' in story)
      ) {
        const storySpec = story as {
          description?: React.ReactNode;
          props?: Record<string, unknown>;
          run?: React.ComponentType<{}>;
        };

        if (storySpec.run) {
          return {
            key,
            kind: 'run' as const,
            component: storySpec.run,
            description: storySpec.description,
          };
        }

        return {
          key,
          kind: 'component' as const,
          props: storySpec.props ?? {},
          description: storySpec.description,
        };
      }

      return {
        key,
        kind: 'component' as const,
        props: story ?? {},
        description: undefined,
      };
    });
  }, [componentEntry]);

  return (
    <div className=" grid grid-cols-1 gap-4">
      {storyEntries.map((entry) => {
        if (/^[A-Z]/.test(componentEntry.name) && !/Provider$/.test(componentEntry.name)) {
          const content =
            entry.kind === 'run' ? (
              <entry.component key={entry.key} />
            ) : (
              React.createElement(componentEntry.component, {
                key: entry.key,
                ...entry.props,
              })
            );

          return (
            <section
              key={entry.key}
              className="min-h-36 min-w-60 flex-1 rounded-xl border border-jade-border-soft bg-jade-panel-raised/90 p-4"
            >
              {entry.description ? (
                <p className="mb-3 text-sm font-medium text-jade-text-muted">{entry.description}</p>
              ) : null}
              <div className="">{content}</div>
            </section>
          );
        }

        return (
          <div key={entry.key} className="text-jade-error-400">
            {componentEntry.name} is not a component.
          </div>
        );
      })}
    </div>
  );
};

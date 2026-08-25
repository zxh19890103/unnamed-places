import clsx from "clsx";
import React, { useState } from "react";
import type { ComponentStoryBook } from "../_components/_types";

function __defaultStorybook() {
  return {};
}

export default function App({ components }) {
  const [componentEntries] = useState(() =>
    Object.entries(components)
      .map(([name, component]) => {
        if (typeof component !== "function") return null;

        const getStorybookProps =
          typeof component["__storybook"] === "function"
            ? component["__storybook"]
            : __defaultStorybook;

        return {
          name,
          component,
          getStorybookProps,
        };
      })
      .filter(Boolean),
  );

  const [selectedComponentEntry, setSelectedComponentEntry] = useState(
    componentEntries[0],
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-900">
          Lancangriver
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-900">Page A</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-800">
          A simple page scaffold for the Lancangriver client. Use this page as a
          starting point for feature-specific UI and navigation.
        </p>
      </header>

      <section className=" space-y-4 rounded-3xl p-8 shadow-lg shadow-slate-950/20">
        <h2 className="text-2xl font-semibold text-slate-900">Components</h2>
        <div className=" flex gap-4">
          <div className=" space-y-2">
            {componentEntries.map((entry) => {
              return (
                <div key={entry.name}>
                  <button
                    className={clsx(
                      " hover:border-slate-500 active:bg-amber-200 active:border-amber-700 rounded-xl border px-2 py-1",
                      entry === selectedComponentEntry
                        ? " border-jade-border bg-jade-depth"
                        : null,
                    )}
                    onClick={() => setSelectedComponentEntry(entry)}
                  >
                    {entry.name}
                  </button>
                </div>
              );
            })}
          </div>
          <div className=" h-10 w-0 border-r border-jade-300 " />
          <div className=" flex-1 min-w-0">
            {selectedComponentEntry ? (
              <LoadFc componentEntry={selectedComponentEntry} />
            ) : (
              <div>no component selected.</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

let nextStoryKey = 1911;

const LoadFc = ({ componentEntry }) => {
  const storyEntries = React.useMemo(() => {
    const rawStories =
      componentEntry.getStorybookProps() as ComponentStoryBook<{}>;
    const normalizedStories = Array.isArray(rawStories)
      ? rawStories
      : [rawStories];

    return normalizedStories.map((story) => {
      const key = `__id_${nextStoryKey++}`;

      if (
        story &&
        typeof story === "object" &&
        !Array.isArray(story) &&
        ("props" in story || "run" in story)
      ) {
        const storySpec = story as {
          description?: React.ReactNode;
          props?: Record<string, unknown>;
          run?: React.ComponentType<{}>;
        };

        if (storySpec.run) {
          return {
            key,
            kind: "run" as const,
            component: storySpec.run,
            description: storySpec.description,
          };
        }

        return {
          key,
          kind: "component" as const,
          props: storySpec.props ?? {},
          description: storySpec.description,
        };
      }

      return {
        key,
        kind: "component" as const,
        props: story ?? {},
        description: undefined,
      };
    });
  }, [componentEntry]);

  return (
    <div className=" grid grid-cols-1 gap-4">
      {storyEntries.map((entry) => {
        if (
          /^[A-Z]/.test(componentEntry.name) &&
          !/Provider$/.test(componentEntry.name)
        ) {
          const content =
            entry.kind === "run" ? (
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
              className="min-w-60 min-h-36 flex-1 rounded-2xl bg-white p-4 shadow-sm"
            >
              {entry.description ? (
                <p className="mb-3 text-sm font-medium text-slate-700">
                  {entry.description}
                </p>
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

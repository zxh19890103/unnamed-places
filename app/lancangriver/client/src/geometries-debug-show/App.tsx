import clsx from "clsx";
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import LoadGeometry from "./LoadGeometry.js";

type GeometryFactory = (new (
  params?: Record<string, unknown>,
) => THREE.BufferGeometry) & {
  __storybook?: () => Record<string, unknown>;
};

type GeometryEntry = {
  name: string;
  ctor: GeometryFactory;
  __storybook: () => Record<string, unknown>;
};

function __defaultStorybook() {
  return {};
}

export default function App({
  components = {},
}: {
  components?: Record<string, GeometryFactory>;
}) {
  const namedGeometries = useMemo<GeometryEntry[]>(() => {
    return Object.entries(components)
      .map(([name, component]) => {
        if (typeof component !== "function") return null;

        const storybook =
          typeof component.__storybook === "function"
            ? component.__storybook
            : __defaultStorybook;

        return {
          name,
          ctor: component,
          __storybook: storybook,
        };
      })
      .filter(Boolean) as GeometryEntry[];
  }, [components]);

  const [selected, setSelected] = useState<GeometryEntry | null>(null);

  useEffect(() => {
    if (
      namedGeometries.length &&
      (!selected ||
        !namedGeometries.some((entry) => entry.name === selected.name))
    ) {
      setSelected(namedGeometries[0]);
    }
  }, [namedGeometries, selected]);

  const preview = useMemo(() => {
    if (!selected) return null;

    const params = selected.__storybook();

    try {
      const geometry = new selected.ctor(params);
      const positionCount = geometry.attributes.position?.count ?? 0;
      const indexCount = geometry.index?.count ?? 0;

      return {
        params,
        geometry,
        positionCount,
        indexCount,
      };
    } catch (error) {
      return {
        params,
        error:
          error instanceof Error ? error.message : "Unknown geometry error",
      };
    }
  }, [selected]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 text-slate-900">
      <header className="mb-8">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-700">
          Lancangriver
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">
          Geometries Debug / Show
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700">
          Browse geometry builders exported from the client geometry registry
          and inspect the static storybook params used for debugging.
        </p>
      </header>

      {namedGeometries.length === 0 ? (
        <section className="rounded-3xl border border-slate-300 bg-white/80 p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">
            No geometries registered yet
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-700">
            Create a geometry class under the geometry registry and export it
            from the index module to see it appear here.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-slate-300 bg-white/80 p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
              Geometries
            </h2>
            <div className="mt-3 space-y-2">
              {namedGeometries.map((entry) => (
                <button
                  key={entry.name}
                  className={clsx(
                    "w-full rounded-2xl border px-3 py-2 text-left text-sm transition",
                    selected?.name === entry.name
                      ? "border-jade-border bg-jade-depth text-slate-950"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
                  )}
                  onClick={() => setSelected(entry)}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          </aside>

          <div className="rounded-3xl border border-slate-300 bg-white/80 p-6 shadow-sm">
            {selected ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-950">
                      {selected.name}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-slate-700">
                      This panel shows the storybook params and a quick
                      structural summary for the selected geometry.
                    </p>
                  </div>
                </div>

                <LoadGeometry
                  geometry={preview?.error ? null : (preview?.geometry ?? null)}
                  name={selected.name}
                />

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
                      Params
                    </h3>
                    <pre className="mt-3 overflow-x-auto text-xs leading-6 text-slate-800">
                      {JSON.stringify(preview?.params ?? {}, null, 2)}
                    </pre>
                  </div>

                  <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
                      Summary
                    </h3>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      {preview?.error ? (
                        <p className="text-amber-700">{preview.error}</p>
                      ) : (
                        <>
                          <p>Position count: {preview?.positionCount ?? 0}</p>
                          <p>Index count: {preview?.indexCount ?? 0}</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </section>
      )}
    </main>
  );
}

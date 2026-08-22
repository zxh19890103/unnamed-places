import clsx from "clsx";
import React, { useState } from "react";

export default function App({ components }) {
  const [namedFcs] = useState(() =>
    Object.entries(components)
      .map(([name, fc]) => {
        if (typeof fc !== "function") return null;
        return {
          name,
          fc,
        };
      })
      .filter(Boolean),
  );

  const [fc, setFc] = useState(namedFcs[1]);

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

      <section className=" space-y-4 rounded-3xl border border-slate-700/70 p-8 shadow-lg shadow-slate-950/20">
        <h2 className="text-2xl font-semibold text-slate-900">Components</h2>
        <div className=" flex flex-wrap gap-2">
          {namedFcs.map((ifc) => {
            return (
              <button
                className={clsx(
                  " hover:border-slate-500 active:bg-amber-200 active:border-amber-700 rounded-xl border px-2 py-1",
                  ifc === fc ? " border-jade-border bg-jade-depth" : null,
                )}
                key={ifc.name}
                onClick={() => setFc(ifc)}
              >
                {ifc.name}
              </button>
            );
          })}
        </div>
        <div>{fc ? <LoadFc fc={fc} /> : <div>no fc</div>}</div>
      </section>
    </main>
  );
}

const LoadFc = ({ fc }) => {
  return <div>{React.createElement(fc.fc, {})}</div>;
};

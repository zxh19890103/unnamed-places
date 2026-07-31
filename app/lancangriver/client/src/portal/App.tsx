const experiments = [
  {
    title: "Map",
    href: "/index.html",
    description: "The main map page with 3D globe and tiled satellite imagery.",
  },
  {
    title: "Global Zoom",
    href: "/experiments-global-zoom.html",
    description: "3D globe and tiled satellite zoom experiment.",
  },
  {
    title: "Sphere Zoom",
    href: "/experiments-sphere-zoom.html",
    description: "Sphere-based tile loading and close-range LOD experiment.",
  },
  {
    title: "Shanshui Shader",
    href: "/experiments-shanshui-shader.html",
    description:
      "DEM-driven terrain shading, normals, slope darkening, and noise.",
  },
  {
    title: "Loaded Vector Tiles",
    href: "/jobs.html",
    description: "Browse zoom-12 OSM coverage ready for vector tile requests.",
  },
];

export default function App() {
  return (
    <main className="mx-auto max-w-260 px-6 pb-18 pt-14">
      <section className="mb-7 rounded-[20px] border border-slate-400/20 bg-slate-950/55 px-7.5 py-7 shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-md">
        <div className="text-xs tracking-[0.18em] text-emerald-300 uppercase">
          Lancangriver
        </div>
        <h1 className="my-2.5 text-[42px] leading-[1.05] text-slate-100">
          Experiments Portal
        </h1>
        <p className="m-0 max-w-170 text-base leading-[1.6] text-slate-300">
          Open the current rendering experiments from one place. Each entry is a
          standalone multi-page HTML page in the client.
        </p>
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        {experiments.map((experiment) => (
          <a
            key={experiment.href}
            href={experiment.href}
            className="block rounded-[18px] border border-slate-400/20 bg-linear-to-b from-slate-900/90 to-slate-900/65 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.18)] transition-[transform,border-color,background] duration-150 ease-out hover:-translate-y-0.5 hover:border-emerald-300/45 hover:from-slate-800/95 hover:to-slate-900/80"
          >
            <div className="mb-2 text-[13px] text-emerald-300">
              {experiment.href}
            </div>
            <div className="mb-2.5 text-[22px] font-semibold text-slate-50">
              {experiment.title}
            </div>
            <div className="leading-[1.6] text-slate-300">
              {experiment.description}
            </div>
          </a>
        ))}
      </section>
    </main>
  );
}

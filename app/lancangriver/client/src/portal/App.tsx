import { ArrowRightIcon, ExternalLinkIcon } from "@radix-ui/react-icons";

const pages = [
  {
    title: "Map",
    href: "/index.html",
    description: "The main map page with 3D globe and tiled satellite imagery.",
  },
  {
    title: "Global Zoom",
    href: "/global-zoom",
    description: "3D globe and tiled satellite zoom experiment.",
  },
  {
    title: "Sphere Zoom",
    href: "/sphere-zoom",
    description: "Sphere-based tile loading and close-range LOD experiment.",
  },
  {
    title: "Shanshui Shader",
    href: "/shanshui-shader",
    description:
      "DEM-driven terrain shading, normals, slope darkening, and noise.",
  },
  {
    title: "Loaded Vector Tiles",
    href: "/jobs",
    description: "Browse zoom-12 OSM coverage ready for vector tile requests.",
  },
  {
    title: "Jobs Create",
    href: "/jobs-create?bbox=120.15,22.47,120.45,22.77",
    description:
      "Fit a bbox from the URL on a Leaflet map and list the zoom-12 tiles covering it.",
  },
  {
    title: "Static Leaflet Map",
    href: "/static-leaflet-map",
    description:
      "Full-screen non-interactive Leaflet map centered by the parent page.",
  },
  {
    title: "UI Design Storybook",
    href: "/ui-design-storybook",
    description: "A minimal new page scaffold for the Lancangriver client.",
  },
  {
    title: "Geometries Debug / Show",
    href: "/geometries-debug-show",
    description:
      "Inspect geometry builders and their storybook params in one place.",
  },
  {
    title: "Tile 12 OSM Inspector",
    href: "/tile12-osm",
    description: "Inspect one existing vector tile in a local Three.js scene.",
  },
  {
    title: "UI Design Implement",
    href: "/ui-design-implement",
    description:
      "Examples of buttons, panels, and tables grouped with reusable section blocks.",
  },
];

export default function App() {
  return (
    <main className="min-h-screen bg-jade-foundation px-4 py-6 text-jade-text font-[SUSEMono] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="overflow-hidden rounded-2xl border border-jade-border bg-jade-panel/95 shadow-2xl shadow-[#182a36]/15 backdrop-blur-md">
          <div className="border-b border-jade-border-soft px-6 py-6 sm:px-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-jade-river">
                  Lancangriver
                </p>
                <h1 className="mt-2 text-3xl font-semibold text-jade-text sm:text-4xl">
                  Experiments Portal
                </h1>
                <p className="mt-2 text-sm leading-6 text-jade-text-muted sm:text-base">
                  Open the current rendering experiments from one place. Each
                  entry is a standalone multi-page experience in the client.
                </p>
              </div>
              <div className="rounded-lg border border-jade-border-soft bg-jade-control/70 px-3 py-2 text-sm text-jade-text-muted">
                <span className="font-medium text-jade-text">11</span> live
                views
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3">
            {pages.map((experiment) => (
              <a
                key={experiment.href}
                href={experiment.href}
                className="group flex h-full flex-col rounded-xl border border-jade-border-soft bg-jade-panel/80 p-5 shadow-lg shadow-[#182a36]/10 transition-all duration-150 hover:-translate-y-0.5 hover:border-jade-river hover:bg-jade-panel-raised"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full border border-jade-river/25 bg-jade-river-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-jade-river">
                    View
                  </span>
                  <ExternalLinkIcon
                    className="size-4 text-jade-text-muted transition-colors group-hover:text-jade-river"
                    aria-hidden="true"
                  />
                </div>

                <div className="mt-4">
                  <h2 className="text-lg font-semibold text-jade-text">
                    {experiment.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-jade-text-muted">
                    {experiment.description}
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-jade-border-soft pt-4 text-sm">
                  <span className="truncate text-jade-text-muted">
                    {experiment.href}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-jade-river transition-colors group-hover:text-jade-sky">
                    Open
                    <ArrowRightIcon className="size-4" aria-hidden="true" />
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

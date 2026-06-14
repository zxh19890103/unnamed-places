import type { ManifestTileEntry } from "../view/manifest-tiles";

type TilesManifestModalOptions = {
  root: HTMLElement;
  entries: ManifestTileEntry[];
  onTileClick: (tile: ManifestTileEntry) => void;
};

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  return element;
}

function tileLabel(tile: ManifestTileEntry): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

export function createTilesManifestModal(options: TilesManifestModalOptions) {
  const { root, onTileClick } = options;
  const sortedEntries = [...options.entries].sort((a, b) => {
    if (a.z !== b.z) return a.z - b.z;
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  const openButton = createElement("button", "tiles-manifest-open");
  openButton.textContent = `tiles manifest (${sortedEntries.length})`;
  openButton.type = "button";
  Object.assign(openButton.style, {
    position: "absolute",
    right: "12px",
    bottom: "12px",
    zIndex: "11",
    border: "1px solid rgba(100, 128, 160, 0.9)",
    borderRadius: "8px",
    background: "rgba(12, 22, 34, 0.9)",
    color: "#d7f0ff",
    font: "12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace",
    padding: "8px 10px",
    cursor: "pointer",
  } as Partial<CSSStyleDeclaration>);

  const backdrop = createElement("div", "tiles-manifest-backdrop");
  Object.assign(backdrop.style, {
    position: "absolute",
    inset: "0",
    zIndex: "20",
    background: "rgba(3, 8, 14, 0.6)",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
  } as Partial<CSSStyleDeclaration>);

  const modal = createElement("div", "tiles-manifest-modal");
  Object.assign(modal.style, {
    width: "min(760px, calc(100vw - 24px))",
    maxHeight: "min(84vh, 840px)",
    display: "flex",
    flexDirection: "column",
    borderRadius: "12px",
    overflow: "hidden",
    border: "1px solid rgba(87, 121, 156, 0.8)",
    background: "#0b1120",
    color: "#d7f0ff",
    boxShadow: "0 16px 52px rgba(0, 0, 0, 0.45)",
  } as Partial<CSSStyleDeclaration>);

  const header = createElement("div", "tiles-manifest-header");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    borderBottom: "1px solid rgba(87, 121, 156, 0.4)",
  } as Partial<CSSStyleDeclaration>);

  const title = createElement("strong");
  title.textContent = `tiles_manifest.json (${sortedEntries.length})`;
  title.style.font = "13px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace";

  const closeButton = createElement("button");
  closeButton.textContent = "close";
  closeButton.type = "button";
  Object.assign(closeButton.style, {
    border: "1px solid rgba(100, 128, 160, 0.9)",
    borderRadius: "6px",
    background: "rgba(12, 22, 34, 0.9)",
    color: "#d7f0ff",
    font: "12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace",
    padding: "6px 8px",
    cursor: "pointer",
  } as Partial<CSSStyleDeclaration>);

  const listHost = createElement("div", "tiles-manifest-list");
  Object.assign(listHost.style, {
    overflow: "auto",
    padding: "8px",
    display: "grid",
    gap: "6px",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  } as Partial<CSSStyleDeclaration>);

  for (const tile of sortedEntries) {
    const itemButton = createElement("button");
    itemButton.type = "button";
    itemButton.textContent = tileLabel(tile);
    Object.assign(itemButton.style, {
      border: "1px solid rgba(100, 128, 160, 0.75)",
      borderRadius: "8px",
      background: "rgba(12, 22, 34, 0.7)",
      color: "#d7f0ff",
      font: "12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace",
      padding: "8px",
      cursor: "pointer",
      textAlign: "left",
    } as Partial<CSSStyleDeclaration>);

    itemButton.addEventListener("click", () => {
      onTileClick(tile);
      backdrop.style.display = "none";
    });

    listHost.appendChild(itemButton);
  }

  header.appendChild(title);
  header.appendChild(closeButton);
  modal.appendChild(header);
  modal.appendChild(listHost);
  backdrop.appendChild(modal);

  const open = () => {
    backdrop.style.display = "flex";
  };

  const close = () => {
    backdrop.style.display = "none";
  };

  openButton.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      close();
    }
  });

  root.appendChild(openButton);
  root.appendChild(backdrop);

  return {
    destroy: () => {
      openButton.remove();
      backdrop.remove();
    },
  };
}

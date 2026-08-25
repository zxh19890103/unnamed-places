import type { MouseEvent, ReactNode } from 'react';

type Tile12OsmLinkProps = {
  tileKey: string;
  children?: ReactNode;
  className?: string;
};

export function Tile12OsmLink({ tileKey, children, className }: Tile12OsmLinkProps) {
  const href = `/tile12-osm?tilekey=${tileKey}`;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const isInsideIframe = window.self !== window.top;

    if (isInsideIframe) {
      event.preventDefault();
      window.parent.postMessage({ type: 'tile12osm', urlToGo: href }, window.location.origin);
    }
  };

  return (
    <a href={href} target="_blank" onClick={handleClick} className={className}>
      {children ?? tileKey}
    </a>
  );
}

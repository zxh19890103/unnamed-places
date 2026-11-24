import { useEffect, useRef, useState, type SVGProps } from 'react';
import {
  ArrowLeftIcon,
  CheckIcon,
  Cross2Icon,
  HomeIcon,
  PlusIcon,
  ReloadIcon,
  TrashIcon,
} from '@radix-ui/react-icons';
import { Button, IconButton, Tooltip } from '@/_components';
import { BASE_URL } from '@/calc/constants';
import {
  readPhotoFolders,
  savePhotoFolders,
  subscribePhotoFolders,
  type PhotoFolderPreferences,
} from '@/photos/folders';
import {
  getElectronPhotosBridge,
  loadPhotoFolders,
  mergePhotoFolderResults,
  type PhotoFolderResult,
} from '@/photos/sources';

type Folder = { name: string; path: string; hasVisibleSubfolders: boolean | null };

type DirectoryListing = {
  path: string;
  roots: string[];
  parent: string | null;
  directories: Folder[];
  nextOffset: number | null;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

function folderName(root: string): string {
  return root.split('/').filter(Boolean).at(-1) || root;
}

function FolderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
    >
      <path d="M1.5 4a1 1 0 0 1 1-1h3l1.5 1.5h5.5a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

function FolderRow({
  folder,
  loading,
  selected,
  onSelectionChange,
  onOpen,
}: {
  folder: Folder;
  loading: boolean;
  selected: boolean;
  onSelectionChange?: (path: string, checked: boolean) => void;
  onOpen: (path: string) => void;
}) {
  const { name, path, hasVisibleSubfolders } = folder;

  return (
    <li className="flex min-h-11 items-center gap-3 py-1 pl-2 text-sm">
      <FolderIcon className="shrink-0 text-jade-river" />
      <div className="min-w-0 flex-1">
        {hasVisibleSubfolders && !selected ? (
          <button
            type="button"
            disabled={loading}
            className="min-h-8 break-all text-left text-jade-river underline-offset-4 enabled:cursor-pointer enabled:hover:underline focus-visible:outline-2 focus-visible:outline-jade-river disabled:opacity-50"
            onClick={() => onOpen(path)}
          >
            {name}
          </button>
        ) : (
          <span className="break-all">{name}</span>
        )}
        {hasVisibleSubfolders === null && (
          <p className="text-xs text-jade-text-muted">Subfolders unavailable</p>
        )}
      </div>
      {onSelectionChange && (
        <label className="grid size-11 shrink-0 cursor-pointer place-items-center has-disabled:cursor-not-allowed has-disabled:opacity-50">
          <input
            type="checkbox"
            className="peer sr-only"
            aria-label={`Select ${name}`}
            checked={selected}
            disabled={loading}
            onChange={(event) => onSelectionChange(path, event.currentTarget.checked)}
          />
          <span
            aria-hidden="true"
            className="grid size-5 place-items-center rounded border border-jade-river text-jade-river peer-checked:bg-jade-control peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-jade-river"
          >
            {selected && <CheckIcon />}
          </span>
        </label>
      )}
    </li>
  );
}

function FolderBrowser({
  selectedRoots,
  onSelectionChange,
  onClose,
}: {
  selectedRoots: readonly string[];
  onSelectionChange: (path: string, checked: boolean) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [request, setRequest] = useState<{ path?: string; offset: number }>({ offset: 0 });
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [roots, setRoots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const parent = listing?.parent;
  const openFolder = (path: string) => setRequest({ path, offset: 0 });
  const browseRoot = listing?.roots
    .filter(
      (root) => listing.path === root || listing.path.startsWith(root === '/' ? root : `${root}/`),
    )
    .sort((first, second) => second.length - first.length)[0];
  const breadcrumbs = browseRoot
    ? [
        { name: folderName(browseRoot), path: browseRoot },
        ...listing!.path
          .slice(browseRoot.length)
          .split('/')
          .filter(Boolean)
          .map((name, index, segments) => ({
            name,
            path: `${browseRoot === '/' ? '' : browseRoot}/${segments.slice(0, index + 1).join('/')}`,
          })),
      ]
    : [];

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    if (request.offset === 0) setListing(null);
    const params = new URLSearchParams({ offset: String(request.offset) });
    if (request.path) params.set('path', request.path);
    void fetch(`${BASE_URL}/photos/directories?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            ['EPERM', 'EACCES'].includes(body.error?.code)
              ? 'Permission denied for this folder'
              : body.error?.reason || 'Could not list folders',
          );
        return body as DirectoryListing;
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        const visibleRoots = body.roots.filter((root) => !folderName(root).startsWith('.'));
        setRoots(visibleRoots);
        if (folderName(body.path).startsWith('.')) {
          if (!request.path && visibleRoots.length > 0) {
            setRequest({ path: visibleRoots[0], offset: 0 });
            return;
          }
          throw new Error('No visible folder is available at this location');
        }
        const directories = body.directories.filter(({ name }) => !name.startsWith('.'));
        setListing((previous) => ({
          ...body,
          roots: visibleRoots,
          parent: body.parent && !folderName(body.parent).startsWith('.') ? body.parent : null,
          directories:
            request.offset > 0 && previous?.path === body.path
              ? [...previous.directories, ...directories]
              : directories,
        }));
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="folder-browser-title"
      onCancel={onClose}
      className="m-auto max-h-[85dvh] w-[min(44rem,calc(100vw-2rem))] rounded-lg border border-jade-border bg-jade-panel p-0 text-jade-text shadow-xl backdrop:bg-black/35"
    >
      <header className="flex items-center justify-between gap-3 border-b border-jade-border-soft p-4">
        <h2 id="folder-browser-title" className="text-lg font-semibold">
          Select Photo Folder
        </h2>
        <IconButton
          aria-label="Close folder browser"
          title="Close folder browser"
          onClick={onClose}
        >
          <Cross2Icon />
        </IconButton>
      </header>
      <div className="flex max-h-[calc(85dvh-10rem)] min-h-64 flex-col overflow-y-auto p-4">
        {roots.length > 0 && (
          <nav aria-label="Folder locations" className="mb-4 flex flex-wrap gap-2">
            {roots.map((root) => (
              <Button key={root} size="sm" disabled={loading} onClick={() => openFolder(root)}>
                <HomeIcon aria-hidden="true" />
                <span className="min-w-0 break-all text-left">{folderName(root)}</span>
              </Button>
            ))}
          </nav>
        )}
        {listing && (
          <div className="mb-3 flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Back to parent folder"
              title="Back to parent folder"
              disabled={!parent || loading}
              onClick={() => {
                if (parent) openFolder(parent);
              }}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border-0 enabled:cursor-pointer enabled:hover:bg-jade-control focus-visible:outline-2 focus-visible:outline-jade-river disabled:opacity-50"
            >
              <ArrowLeftIcon aria-hidden="true" />
            </button>
            <p className="min-w-0 break-all text-sm leading-6">{listing.path}</p>
          </div>
        )}
        {listing && (
          <nav aria-label="Folder breadcrumb" className="mb-3">
            <ol className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
              {breadcrumbs.map((crumb, index) => (
                <li key={crumb.path} className="flex min-w-0 items-center gap-2">
                  {index > 0 && <span aria-hidden="true">/</span>}
                  <button
                    type="button"
                    disabled={loading}
                    aria-current={crumb.path === listing.path ? 'location' : undefined}
                    className="break-all text-left text-jade-river underline-offset-4 hover:underline disabled:opacity-50"
                    onClick={() => openFolder(crumb.path)}
                  >
                    {crumb.name}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        )}
        {error && (
          <div role="alert" className="mb-3 text-sm text-jade-error">
            <p>{error}</p>
            <Button size="sm" className="mt-3" onClick={() => setRequest({ ...request })}>
              <ReloadIcon />
              Retry
            </Button>
          </div>
        )}
        {listing && (
          <ul
            aria-label="Directories"
            className="divide-y divide-jade-border-soft border-y border-jade-border-soft"
          >
            {listing.directories.map((directory) => (
              <FolderRow
                key={directory.path}
                folder={directory}
                loading={loading}
                selected={selectedRoots.includes(directory.path)}
                onSelectionChange={roots.includes(directory.path) ? undefined : onSelectionChange}
                onOpen={openFolder}
              />
            ))}
          </ul>
        )}
        {!loading && !error && listing?.directories.length === 0 && listing.nextOffset === null && (
          <p className="py-5 text-sm text-jade-text-muted">No subfolders</p>
        )}
        {loading && (
          <p role="status" className="py-4 text-sm text-jade-text-muted">
            Loading folders...
          </p>
        )}
        {listing?.nextOffset !== null && listing?.nextOffset !== undefined && !loading && (
          <Button
            size="sm"
            className="mt-4 self-start"
            onClick={() => setRequest({ path: listing.path, offset: listing.nextOffset! })}
          >
            Load more
          </Button>
        )}
      </div>
      <footer className="flex justify-end border-t border-jade-border-soft p-4">
        <Button onClick={onClose}>Done</Button>
      </footer>
    </dialog>
  );
}

export default function App() {
  const [saved, setSaved] = useState<PhotoFolderPreferences | null>(null);
  const savedRef = useRef<PhotoFolderPreferences | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<PhotoFolderResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const scanRef = useRef<AbortController | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved?.roots ?? []);

  useEffect(() => {
    const sync = () => {
      try {
        const next = readPhotoFolders();
        const previous = savedRef.current;
        if (next.revision === previous?.revision) return;
        scanRef.current?.abort();
        setScanning(false);
        setResults([]);
        setDraft((current) =>
          JSON.stringify(current) === JSON.stringify(previous?.roots ?? []) ? next.roots : current,
        );
        savedRef.current = next;
        setSaved(next);
        setError(null);
      } catch (failure) {
        setError(errorMessage(failure));
      }
    };
    sync();
    const unsubscribe = subscribePhotoFolders(sync);
    return () => {
      unsubscribe();
      scanRef.current?.abort();
    };
  }, []);

  const addRoots = (roots: string[]) => {
    setDraft((previous) => [...new Set([...previous, ...roots])]);
    setMessage(null);
  };

  const removeRoot = (root: string) => {
    setDraft((current) => current.filter((item) => item !== root));
    setMessage(null);
  };

  const selectFolders = async () => {
    const bridge = getElectronPhotosBridge();
    if (!bridge?.pickPhotoDirectories) {
      setBrowsing(true);
      return;
    }
    setPicking(true);
    setError(null);
    try {
      const selection = await bridge.pickPhotoDirectories();
      if (!selection.canceled) addRoots(selection.roots);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPicking(false);
    }
  };

  const scan = async (roots: string[]) => {
    scanRef.current?.abort();
    const controller = new AbortController();
    scanRef.current = controller;
    setScanning(true);
    setResults([]);
    try {
      const next = await loadPhotoFolders(roots, controller.signal);
      if (!controller.signal.aborted) setResults(next);
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorMessage(failure));
    } finally {
      if (!controller.signal.aborted) setScanning(false);
    }
  };

  const apply = async (roots: string[]) => {
    try {
      savePhotoFolders(roots);
      setDraft(roots);
      setError(null);
      setMessage('Folders saved');
      await scan(roots);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  return (
    <main className="min-h-dvh bg-jade-foundation px-4 py-8 text-jade-text sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-jade-border pb-6">
          <div>
            <p className="mb-2 text-xs uppercase text-jade-river">Lancangriver</p>
            <h1 className="text-3xl font-semibold">Photo Settings</h1>
          </div>
          <Button onClick={() => void selectFolders()} disabled={picking || !saved}>
            <PlusIcon aria-hidden="true" />
            {picking ? 'Selecting...' : 'Add Folders'}
          </Button>
        </header>
        {error && (
          <div role="alert" className="mt-5 wrap-break-word text-sm text-jade-error">
            <p>{error}</p>
            {!saved && (
              <Button className="mt-3" variant="destructive" onClick={() => void apply([])}>
                Reset Saved Folders
              </Button>
            )}
          </div>
        )}
        <section aria-labelledby="folders-title" className="py-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 id="folders-title" className="text-base font-semibold">
              Folders <span className="ml-2 text-jade-text-muted">{draft.length}</span>
            </h2>
            <span className="text-xs text-jade-text-muted">Including subfolders</span>
          </div>
          {draft.length === 0 && (
            <p className="border-y border-dashed border-jade-border py-12 text-center text-sm text-jade-text-muted">
              No photo folders selected
            </p>
          )}
          <ul className="divide-y divide-jade-border-soft">
            {draft.map((root) => {
              const result = results.find((item) => item.root === root);
              return (
                <li key={root} className="flex min-w-0 items-start gap-4 py-5">
                  <FolderIcon className="mt-1 size-5 shrink-0 text-jade-river" />
                  <div className="min-w-0 flex-1">
                    <h3 className="break-all text-sm font-semibold">{folderName(root)}</h3>
                    <p className="mt-1 break-all text-xs leading-5 text-jade-text-muted">{root}</p>
                    {scanning && saved?.roots.includes(root) && (
                      <p className="mt-2 text-xs text-jade-text-muted">Scanning...</p>
                    )}
                    {result && (
                      <p
                        className={`mt-2 text-xs ${result.error ? 'text-jade-error' : 'text-jade-text-muted'}`}
                      >
                        {result.error ||
                          `${result.photos.length} geotagged photos${result.warningCount ? `, ${result.warningCount} warnings` : ''}`}
                      </p>
                    )}
                    {!!result?.warnings.length && (
                      <details className="mt-2 text-xs text-jade-text-muted">
                        <summary className="cursor-pointer">Scan warnings</summary>
                        <ul className="mt-2 space-y-2">
                          {result.warnings.map((warning, index) => (
                            <li key={index} className="break-all">
                              {warning.path}: {warning.reason}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  <Tooltip label="Remove folder">
                    <IconButton aria-label={`Remove ${root}`} onClick={() => removeRoot(root)}>
                      <TrashIcon />
                    </IconButton>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-5 border-t border-jade-border pt-5">
          <div role="status" aria-live="polite" className="text-sm text-jade-text-muted">
            {scanning
              ? 'Scanning photo folders...'
              : dirty
                ? 'Unsaved changes'
                : results.length
                  ? `${mergePhotoFolderResults(results).length} unique geotagged photos`
                  : message}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Tooltip label="Rescan saved folders">
              <IconButton
                aria-label="Rescan saved folders"
                disabled={!saved || dirty || scanning || saved.roots.length === 0}
                onClick={() => void apply(saved!.roots)}
              >
                <ReloadIcon />
              </IconButton>
            </Tooltip>
            <Button
              disabled={!dirty}
              onClick={() => {
                setDraft(saved?.roots ?? []);
                setMessage(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" disabled={!saved || !dirty} onClick={() => void apply(draft)}>
              <CheckIcon aria-hidden="true" />
              Apply
            </Button>
          </div>
        </footer>
      </div>
      {browsing && (
        <FolderBrowser
          selectedRoots={draft}
          onSelectionChange={(root, checked) => {
            if (checked) addRoots([root]);
            else removeRoot(root);
          }}
          onClose={() => setBrowsing(false)}
        />
      )}
    </main>
  );
}

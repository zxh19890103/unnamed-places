import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  CheckIcon,
  Cross2Icon,
  FileIcon,
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

type DirectoryListing = {
  path: string;
  roots: string[];
  parent: string | null;
  directories: { name: string; path: string }[];
  nextOffset: number | null;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

function folderName(root: string): string {
  return root.split('/').filter(Boolean).at(-1) || root;
}

function FolderBrowser({
  onSelect,
  onClose,
}: {
  onSelect: (root: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [request, setRequest] = useState<{ path?: string; offset: number }>({ offset: 0 });
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [roots, setRoots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        setRoots(body.roots);
        setListing((previous) => ({
          ...body,
          directories:
            request.offset > 0 && previous?.path === body.path
              ? [...previous.directories, ...body.directories]
              : body.directories,
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
        <nav aria-label="Folder locations" className="mb-4 flex flex-wrap gap-2">
          {(roots.length ? roots : ['']).map((root) => (
            <Button
              key={root}
              size="sm"
              disabled={loading}
              onClick={() => setRequest({ path: root || undefined, offset: 0 })}
            >
              <HomeIcon aria-hidden="true" />
              {root ? folderName(root) : 'Home'}
            </Button>
          ))}
        </nav>
        {listing && (
          <div className="mb-3 flex min-w-0 items-start gap-3">
            <Tooltip label="Parent folder">
              <IconButton
                aria-label="Parent folder"
                disabled={!listing.parent || loading}
                onClick={() => setRequest({ path: listing.parent!, offset: 0 })}
              >
                <ArrowLeftIcon />
              </IconButton>
            </Tooltip>
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
                    onClick={() => setRequest({ path: crumb.path, offset: 0 })}
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
              <li key={directory.path}>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setRequest({ path: directory.path, offset: 0 })}
                  className="flex min-h-11 w-full items-center gap-3 px-2 py-3 text-left text-sm hover:bg-jade-control focus-visible:outline-2 focus-visible:outline-jade-river disabled:opacity-50"
                >
                  <FileIcon aria-hidden="true" className="shrink-0 text-jade-river" />
                  <span className="min-w-0 break-all">{directory.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!loading && listing?.directories.length === 0 && (
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
      <footer className="flex flex-wrap justify-end gap-3 border-t border-jade-border-soft p-4">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!listing || loading || !!error}
          onClick={() => {
            onSelect(listing!.path);
            onClose();
          }}
        >
          <CheckIcon aria-hidden="true" />
          Select Folder
        </Button>
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
                  <FileIcon aria-hidden="true" className="mt-1 size-5 shrink-0 text-jade-river" />
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
                    <IconButton
                      aria-label={`Remove ${root}`}
                      onClick={() => {
                        setDraft((current) => current.filter((item) => item !== root));
                        setMessage(null);
                      }}
                    >
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
        <FolderBrowser onSelect={(root) => addRoots([root])} onClose={() => setBrowsing(false)} />
      )}
    </main>
  );
}

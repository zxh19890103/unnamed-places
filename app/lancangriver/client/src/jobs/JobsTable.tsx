import { memo, useEffect, useState } from "react";
import { JobStatus } from "./JobStatus";
import type { CoverageJob, CoverageJobsPage, CoverageJobStatus } from "./api";
import { fetchGeoReverse, saveZ12GeoInfo } from "./api";
import { tileZxyToCenterLatlng } from "../experiments/sphere-zoom/tile";
import { tileExtent } from "../calc/mercator";

type JobsTableProps = {
  page: CoverageJobsPage | null;
  loading: boolean;
  error: string | null;
  api: import("./api").CoverageApi;
};

function hasJobs(page: CoverageJobsPage | null): page is CoverageJobsPage {
  return Boolean(page && page.jobs.length > 0);
}

function TableColGroup() {
  return (
    <colgroup>
      <col width="120px" />
      <col width="120px" />
      <col width="100px" />
      <col width="150px" />
      <col width="400px" />
      <col width="150px" />
      <col width="auto" />
    </colgroup>
  );
}

function TableHead() {
  return (
    <thead className=" bg-slate-900 text-slate-100">
      <tr>
        <th className="px-4 py-3 font-medium">Tile ID</th>
        <th className="px-4 py-3 font-medium">Latlng</th>
        <th className="px-4 py-3 font-medium">Area</th>
        <th className="px-4 py-3 font-medium">Size</th>
        <th className="px-4 py-3 font-medium">Geo Reverse (Center)</th>
        <th className="px-4 py-3 font-medium">Status</th>
        <th className="px-4 py-3 font-medium" align="right">
          Actions
        </th>
      </tr>
    </thead>
  );
}

export function JobsTable({ page, loading, error, api }: JobsTableProps) {
  return (
    <div className=" h-full flex flex-col bg-white">
      <div className=" w-full">
        <table className=" table-fixed w-full min-w-190 border-collapse text-left text-sm">
          <TableColGroup />
          <TableHead />
        </table>
      </div>
      <div className=" flex-1  min-h-0 overflow-y-auto">
        <table className="table-fixed w-full min-w-190 border-collapse text-left text-sm">
          <TableColGroup />
          <tbody className="divide-y divide-slate-200">
            {hasJobs(page)
              ? page.jobs.map((job) => (
                  <JobRow key={job.key} job={job} api={api} />
                ))
              : null}
          </tbody>
        </table>
      </div>

      {loading ? (
        <div className="px-4 py-10 text-center text-sm text-slate-500">
          Loading tiles...
        </div>
      ) : null}
      {!loading && !error && page?.jobs.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-slate-500">
          No vector ingest jobs found.
        </div>
      ) : null}
    </div>
  );
}

type JobRowProps = {
  job: CoverageJob;
  api: import("./api").CoverageApi;
};

const JobRow = memo(({ job, api }: JobRowProps) => {
  const [status, setStatus] = useState<CoverageJobStatus>(job.status);
  const [rerunning, setRerunning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(job.status);
  }, [job.status]);

  const handleRefresh = async () => {
    try {
      const response = await api.fetchCoverageStatus(job.x, job.y);
      if (!response.status) {
        throw new Error(`Coverage job no longer exists: ${job.key}`);
      }

      setStatus(response.status);
      setActionError(null);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const handleRerun = async () => {
    setRerunning(true);
    try {
      const response = await api.rerunFailedCoverageJob(job.x, job.y);
      setStatus(response.status);
      setActionError(null);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRerunning(false);
    }
  };

  return (
    <tr itemType="jobrow" itemID={job.key} className="hover:bg-emerald-50">
      <td className="px-4 py-2.5 font-mono text-slate-950">
        <a
          target="_blank"
          className=" font-semibold hover:underline"
          href={`/tile12-osm?tilekey=${job.key}`}
        >
          {job.key}
        </a>
      </td>
      <td className=" px-4 py-2.5">
        <JobLatlng job={job} />
      </td>
      <td className=" px-4 py-2.5">
        <JobTileArea job={job} />
      </td>
      <td className=" px-4 py-2.5">
        <JobTileSize job={job} />
      </td>
      <td>
        <LoadGeoInfoReverse tile={job} />
      </td>
      <td className="px-4 py-2.5">
        <JobStatus label={job.key} status={status} onRefresh={handleRefresh} />
      </td>
      <td
        className="px-4 py-2.5"
        align="right"
        title={actionError ?? undefined}
      >
        {status === "failed" ? (
          <button
            type="button"
            disabled={rerunning}
            onClick={() => void handleRerun()}
            className="rounded border border-rose-700 bg-rose-700 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-800 disabled:cursor-wait disabled:opacity-50"
          >
            {rerunning ? "Rerunning" : "Rerun"}
          </button>
        ) : (
          <span className="text-slate-400">-</span>
        )}
      </td>
    </tr>
  );
});

const LoadGeoInfoReverse = memo(({ tile }: { tile: CoverageJob }) => {
  const [latlng] = useState(() => {
    return tileZxyToCenterLatlng(tile.z, tile.x, tile.y);
  });
  const [displayName, setDisplayName] = useState(tile.display_name);
  const [rawData, setRawData] = useState<unknown>(null);
  const [hasUnsavedReverseResult, setHasUnsavedReverseResult] = useState(false);
  const [loadingReverse, setLoadingReverse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (displayName !== null || loadingReverse) {
      return;
    }

    setLoadingReverse(true);
    setError(null);
    try {
      const payload = await fetchGeoReverse(latlng.lat, latlng.lng);
      const name = getDisplayName(payload);
      if (!name) {
        throw new Error("Geo reverse response did not contain display_name");
      }

      setDisplayName(name);
      setRawData(payload);
      setHasUnsavedReverseResult(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Geo reverse failed");
    } finally {
      setLoadingReverse(false);
    }
  };

  const handleSave = async () => {
    if (!displayName || rawData === null || saving) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const stored = await saveZ12GeoInfo(tile.key, displayName, rawData);
      setDisplayName(stored.display_name);
      setRawData(stored.raw_data);
      setHasUnsavedReverseResult(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save geo info",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex text-xs items-center gap-2 px-4 py-2.5">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loadingReverse || displayName !== null}
        title={error ?? undefined}
        className="max-w-64 rounded px-2 py-1 text-left disabled:cursor-default disabled:opacity-70"
      >
        {loadingReverse
          ? "Loading..."
          : (displayName ?? (
              <i className=" cursor-pointer text-sky-600 hover:underline">
                (load from Nominatim)
              </i>
            ))}
      </button>
      {hasUnsavedReverseResult && displayName !== null && rawData !== null ? (
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="border border-emerald-700 bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      ) : null}
    </div>
  );
});

function getDisplayName(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const displayName = (payload as { display_name?: unknown }).display_name;
  return typeof displayName === "string" && displayName.trim()
    ? displayName
    : null;
}

const JobLatlng = memo(({ job }: { job: CoverageJob }) => {
  const [latlng] = useState(() => {
    return tileZxyToCenterLatlng(job.z, job.x, job.y);
  });
  const [copied, setCopied] = useState(false);
  const coordinateText = `${latlng.lat.toFixed(3)},${latlng.lng.toFixed(3)}`;

  const handleCopy = async () => {
    const text = `${latlng.lat.toFixed(6)},${latlng.lng.toFixed(6)}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="font-mono text-xs hover:underline"
      title="Copy coordinates"
    >
      {copied ? "Copied" : coordinateText}
    </button>
  );
});

const JobTileArea = memo(({ job }: { job: CoverageJob }) => {
  const { widthKm, heightKm } = getTileSizeKm(job);
  const areaKm2 = widthKm * heightKm;

  return (
    <span>
      {areaKm2.toFixed(1)} km<sup>2</sup>
    </span>
  );
});

const JobTileSize = memo(({ job }: { job: CoverageJob }) => {
  const { widthKm, heightKm } = getTileSizeKm(job);

  return (
    <span>
      {widthKm.toFixed(1)} km x {heightKm.toFixed(1)} km
    </span>
  );
});

function getTileSizeKm(job: CoverageJob) {
  const extent = tileExtent(job.z, job.x, job.y);
  const centerLatRadians =
    ((extent.north + extent.south) / 2) * (Math.PI / 180);
  const kilometersPerDegree = 111.32;
  const widthKm =
    Math.abs(extent.east - extent.west) *
    kilometersPerDegree *
    Math.cos(centerLatRadians);
  const heightKm = Math.abs(extent.north - extent.south) * kilometersPerDegree;

  return { widthKm, heightKm };
}

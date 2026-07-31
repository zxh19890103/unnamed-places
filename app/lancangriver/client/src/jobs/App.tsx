import { useEffect, useState } from "react";

import {
  fetchCoverageJobs,
  fetchCoverageStatus,
  rerunFailedCoverageJob,
  type CoverageJob,
  type CoverageJobsPage,
  type CoverageJobStatus,
} from "./api";
import { JobStatus } from "./JobStatus";

const PAGE_SIZE = 100;

export default function App() {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<CoverageJobsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rerunningKey, setRerunningKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError(null);

    void fetchCoverageJobs({ limit: PAGE_SIZE, offset })
      .then((nextPage) => {
        if (active) {
          setPage(nextPage);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [offset]);

  const total = page?.total ?? 0;
  const canGoBack = offset > 0 && !loading;
  const canGoForward = offset + PAGE_SIZE < total && !loading;

  const updateJobStatus = (key: string, status: CoverageJobStatus) => {
    setPage((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        jobs: current.jobs.map((job) =>
          job.key === key ? { ...job, status } : job,
        ),
      };
    });
  };

  const refreshJobStatus = async (job: CoverageJob) => {
    try {
      const response = await fetchCoverageStatus(job.x, job.y);
      if (!response.status) {
        throw new Error(`Coverage job no longer exists: ${job.key}`);
      }

      updateJobStatus(job.key, response.status);
      setError(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const rerunJob = async (job: CoverageJob) => {
    setRerunningKey(job.key);

    try {
      const response = await rerunFailedCoverageJob(job.x, job.y);
      updateJobStatus(job.key, response.status);
      setError(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRerunningKey(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-slate-300 pb-4">
          <div>
            <a
              href="/portal.html"
              className="text-sm font-medium text-emerald-700 hover:text-emerald-900"
            >
              Lancangriver Portal
            </a>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">
              Vector Ingest Jobs
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Zoom-12 OSM coverage status and failed-job controls.
            </p>
          </div>

          <div className="text-right">
            <div className="text-xs font-medium uppercase text-slate-500">
              Jobs total
            </div>
            <div className="text-2xl font-semibold tabular-nums text-slate-950">
              {total.toLocaleString()}
            </div>
          </div>
        </header>

        {error ? (
          <div className="border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto border border-slate-300 bg-white">
          <table className="w-full min-w-190 border-collapse text-left text-sm">
            <thead className="bg-slate-900 text-slate-100">
              <tr>
                <th className="px-4 py-3 font-medium">Tile ID</th>
                <th className="px-4 py-3 font-medium">Zoom</th>
                <th className="px-4 py-3 font-medium">X</th>
                <th className="px-4 py-3 font-medium">Y</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {page?.jobs.map((job) => (
                <tr key={job.key} className="hover:bg-emerald-50">
                  <td className="px-4 py-2.5 font-mono text-slate-950">
                    {job.key}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-700">
                    {job.z}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-700">
                    {job.x}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-700">
                    {job.y}
                  </td>
                  <td className="px-4 py-2.5">
                    <JobStatus
                      label={job.key}
                      status={job.status}
                      onRefresh={() => refreshJobStatus(job)}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    {job.status === "failed" ? (
                      <button
                        type="button"
                        disabled={rerunningKey !== null}
                        onClick={() => void rerunJob(job)}
                        className="border border-rose-700 bg-rose-700 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-800 disabled:cursor-wait disabled:opacity-50"
                      >
                        {rerunningKey === job.key ? "Rerunning" : "Rerun"}
                      </button>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

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

        <footer className="mt-4 flex items-center justify-between gap-4">
          <div className="text-sm tabular-nums text-slate-600">
            {total === 0
              ? "0 results"
              : `${offset + 1}-${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={() =>
                setOffset((current) => Math.max(0, current - PAGE_SIZE))
              }
              className="border border-slate-400 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!canGoForward}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
              className="border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}

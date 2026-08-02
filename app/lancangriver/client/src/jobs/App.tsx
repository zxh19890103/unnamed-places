import { useEffect, useState } from "react";

import {
  defaultCoverageApi,
  highwaysCoverageApi,
  type CoverageJob,
  type CoverageJobsPage,
  type CoverageJobStatus,
} from "./api";
import { JobsTable } from "./JobsTable";

const PAGE_SIZE = 100;

type TabKey = "default" | "highways";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "default", label: "Default" },
  { key: "highways", label: "Highways" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("default");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<CoverageJobsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rerunningKey, setRerunningKey] = useState<string | null>(null);

  const api =
    activeTab === "highways" ? highwaysCoverageApi : defaultCoverageApi;

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError(null);

    void api
      .fetchCoverageJobs({ limit: PAGE_SIZE, offset })
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
  }, [api, offset]);

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
      const response = await api.fetchCoverageStatus(job.x, job.y);
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
      const response = await api.rerunFailedCoverageJob(job.x, job.y);
      updateJobStatus(job.key, response.status);
      setError(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRerunningKey(null);
    }
  };

  const switchTab = (tab: TabKey) => {
    if (tab === activeTab) {
      return;
    }

    setActiveTab(tab);
    setOffset(0);
    setPage(null);
    setError(null);
    setRerunningKey(null);
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
              Zoom-12 OSM coverage status and failed-job controls for default
              and highways targets.
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

        <nav
          className="mb-4 flex items-center gap-2"
          aria-label="Ingest target"
        >
          {tabs.map((tab) => {
            const selected = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => switchTab(tab.key)}
                className={`border px-4 py-2 text-sm font-semibold ${
                  selected
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                aria-pressed={selected}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {error ? (
          <div className="border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        <JobsTable
          page={page}
          loading={loading}
          error={error}
          rerunningKey={rerunningKey}
          onRefreshJobStatus={refreshJobStatus}
          onRerunJob={rerunJob}
        />

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

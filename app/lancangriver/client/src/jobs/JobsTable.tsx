import { JobStatus } from "./JobStatus";
import type { CoverageJob, CoverageJobsPage, CoverageJobStatus } from "./api";

type JobsTableProps = {
  page: CoverageJobsPage | null;
  loading: boolean;
  error: string | null;
  rerunningKey: string | null;
  onRefreshJobStatus: (job: CoverageJob) => Promise<void>;
  onRerunJob: (job: CoverageJob) => Promise<void>;
};

type StatusUpdater = (key: string, status: CoverageJobStatus) => void;

function hasJobs(page: CoverageJobsPage | null): page is CoverageJobsPage {
  return Boolean(page && page.jobs.length > 0);
}

export function JobsTable({
  page,
  loading,
  error,
  rerunningKey,
  onRefreshJobStatus,
  onRerunJob,
}: JobsTableProps) {
  return (
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
          {hasJobs(page)
            ? page.jobs.map((job) => (
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
                      onRefresh={() => onRefreshJobStatus(job)}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    {job.status === "failed" ? (
                      <button
                        type="button"
                        disabled={rerunningKey !== null}
                        onClick={() => void onRerunJob(job)}
                        className="border border-rose-700 bg-rose-700 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-800 disabled:cursor-wait disabled:opacity-50"
                      >
                        {rerunningKey === job.key ? "Rerunning" : "Rerun"}
                      </button>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))
            : null}
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
  );
}

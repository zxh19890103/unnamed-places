import { useState } from "react";

import type { CoverageJobStatus } from "./api";

type JobStatusProps = {
  label: string;
  status: CoverageJobStatus;
  onRefresh: () => Promise<void>;
};

const statusClasses: Record<CoverageJobStatus, string> = {
  queued: "border-amber-400/30 bg-amber-400/15 text-amber-200",
  running: "border-sky-400/30 bg-sky-400/15 text-sky-200",
  done: "border-emerald-400/30 bg-emerald-400/15 text-emerald-200",
  failed: "border-rose-400/30 bg-rose-400/15 text-rose-200",
};

export function JobStatus({ label, status, onRefresh }: JobStatusProps) {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);

    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`rounded-lg border px-2 py-0.5 text-xs font-semibold uppercase ${statusClasses[status]}`}
      >
        {status}
      </span>
      <button
        type="button"
        disabled={refreshing}
        onClick={() => void refresh()}
        title="Refresh status"
        aria-label={`Refresh ${label} status; current status ${status}`}
        className="grid size-6 place-items-center rounded-lg border border-white/10 text-sm text-slate-400 hover:bg-white/10 hover:text-slate-200 disabled:cursor-wait disabled:opacity-60"
      >
        {refreshing ? "..." : "↻"}
      </button>
    </div>
  );
}

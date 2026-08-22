import { useState } from "react";

import type { CoverageJobStatus } from "./api";

type JobStatusProps = {
  label: string;
  status: CoverageJobStatus;
  onRefresh: () => Promise<void>;
};

const statusClasses: Record<CoverageJobStatus, string> = {
  queued: "border-jade-silt/30 bg-jade-silt/10 text-jade-silt",
  running: "border-jade-sky/30 bg-jade-sky-soft text-jade-sky",
  done: "border-jade-success/30 bg-jade-success/10 text-jade-success",
  failed: "border-jade-error/30 bg-jade-error/10 text-jade-error",
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
        className="grid size-6 place-items-center rounded-lg border border-jade-border-soft text-sm text-jade-text-muted hover:bg-jade-control hover:text-jade-text disabled:cursor-wait disabled:opacity-60"
      >
        {refreshing ? "..." : "↻"}
      </button>
    </div>
  );
}

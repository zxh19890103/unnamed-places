import { useState } from "react";

import type { CoverageJobStatus } from "./api";

type JobStatusProps = {
  label: string;
  status: CoverageJobStatus;
  onRefresh: () => Promise<void>;
};

const statusClasses: Record<CoverageJobStatus, string> = {
  queued: "border-amber-300 bg-amber-50 text-amber-800",
  running: "border-sky-300 bg-sky-50 text-sky-800",
  done: "border-emerald-300 bg-emerald-50 text-emerald-800",
  failed: "border-rose-300 bg-rose-50 text-rose-800",
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
    <button
      type="button"
      disabled={refreshing}
      onClick={() => void refresh()}
      title="Refresh status"
      aria-label={`Refresh ${label} status; current status ${status}`}
      className={`min-w-20 border px-2.5 py-1 text-xs font-semibold uppercase disabled:cursor-wait disabled:opacity-60 ${statusClasses[status]}`}
    >
      {refreshing ? "Refreshing" : status}
    </button>
  );
}

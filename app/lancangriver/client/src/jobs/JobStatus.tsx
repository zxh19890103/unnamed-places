import { useState } from "react";

import type { CoverageJobStatus } from "./api";
import { IconButton, Tag } from "@/_components";
import { DotsHorizontalIcon, ReloadIcon } from "@radix-ui/react-icons";

type JobStatusProps = {
  label: string;
  status: CoverageJobStatus;
  onRefresh: () => Promise<void>;
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

  const tagVariant =
    status === "done"
      ? "success"
      : status === "failed"
        ? "destructive"
        : status === "running"
          ? "primary"
          : "silt";

  return (
    <div className="flex items-center gap-1.5">
      <Tag
        size="sm"
        variant={tagVariant}
        running={status === "running"}
        uppercase
      >
        {status}
      </Tag>
      <IconButton
        disabled={refreshing}
        onClick={() => void refresh()}
        title="Refresh status"
        aria-label={`Refresh ${label} status; current status ${status}`}
        size="xs"
      >
        {refreshing ? <DotsHorizontalIcon /> : <ReloadIcon />}
      </IconButton>
    </div>
  );
}

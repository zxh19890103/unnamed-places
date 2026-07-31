import { BASE_URL } from "../calc/constants";

export type LoadedCoverageTile = {
  key: string;
  z: number;
  x: number;
  y: number;
};

export type LoadedCoveragePage = {
  tiles: LoadedCoverageTile[];
  limit: number;
  offset: number;
  total: number;
};

export type CoverageJobStatus = "queued" | "running" | "done" | "failed";

export type CoverageJob = LoadedCoverageTile & {
  status: CoverageJobStatus;
};

export type CoverageJobsPage = {
  jobs: CoverageJob[];
  limit: number;
  offset: number;
  total: number;
};

export type CoverageStatusResponse = {
  key: string;
  status: CoverageJobStatus | null;
  loaded: boolean;
};

export type RerunCoverageJobResponse = {
  key: string;
  status: "queued";
};

type FetchLoadedCoverageOptions = {
  limit: number;
  offset: number;
};

export async function fetchLoadedCoverage({
  limit,
  offset,
}: FetchLoadedCoverageOptions): Promise<LoadedCoveragePage> {
  const search = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const response = await fetch(
    `${BASE_URL}/vector/coverage/loaded?${search.toString()}`,
  );

  if (!response.ok) {
    throw new Error(`Loaded coverage API failed: ${response.status}`);
  }

  return (await response.json()) as LoadedCoveragePage;
}

export async function fetchCoverageJobs({
  limit,
  offset,
}: FetchLoadedCoverageOptions): Promise<CoverageJobsPage> {
  const search = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const response = await fetch(
    `${BASE_URL}/vector/coverage/jobs?${search.toString()}`,
  );

  if (!response.ok) {
    throw new Error(`Coverage jobs API failed: ${response.status}`);
  }

  return (await response.json()) as CoverageJobsPage;
}

export async function fetchCoverageStatus(
  x: number,
  y: number,
): Promise<CoverageStatusResponse> {
  const response = await fetch(`${BASE_URL}/vector/coverage/12/${x}/${y}`);

  if (!response.ok) {
    throw new Error(`Coverage status API failed: ${response.status}`);
  }

  return (await response.json()) as CoverageStatusResponse;
}

export async function rerunFailedCoverageJob(
  x: number,
  y: number,
): Promise<RerunCoverageJobResponse> {
  const response = await fetch(
    `${BASE_URL}/vector/coverage/12/${x}/${y}/rerun`,
    { method: "POST" },
  );

  if (!response.ok) {
    throw new Error(`Coverage rerun API failed: ${response.status}`);
  }

  return (await response.json()) as RerunCoverageJobResponse;
}

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

type CoverageApi = {
  fetchLoadedCoverage: (
    options: FetchLoadedCoverageOptions,
  ) => Promise<LoadedCoveragePage>;
  fetchCoverageJobs: (
    options: FetchLoadedCoverageOptions,
  ) => Promise<CoverageJobsPage>;
  fetchCoverageStatus: (
    x: number,
    y: number,
  ) => Promise<CoverageStatusResponse>;
  rerunFailedCoverageJob: (
    x: number,
    y: number,
  ) => Promise<RerunCoverageJobResponse>;
};

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (!trimmed) {
    return "/vector";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

function createCoverageApi(prefix: string): CoverageApi {
  const routePrefix = normalizePrefix(prefix);

  return {
    async fetchLoadedCoverage({ limit, offset }: FetchLoadedCoverageOptions) {
      const search = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      const response = await fetch(
        `${BASE_URL}${routePrefix}/coverage/loaded?${search.toString()}`,
      );

      if (!response.ok) {
        throw new Error(`Loaded coverage API failed: ${response.status}`);
      }

      return (await response.json()) as LoadedCoveragePage;
    },

    async fetchCoverageJobs({ limit, offset }: FetchLoadedCoverageOptions) {
      const search = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      const response = await fetch(
        `${BASE_URL}${routePrefix}/coverage/jobs?${search.toString()}`,
      );

      if (!response.ok) {
        throw new Error(`Coverage jobs API failed: ${response.status}`);
      }

      return (await response.json()) as CoverageJobsPage;
    },

    async fetchCoverageStatus(x: number, y: number) {
      const response = await fetch(
        `${BASE_URL}${routePrefix}/coverage/12/${x}/${y}`,
      );

      if (!response.ok) {
        throw new Error(`Coverage status API failed: ${response.status}`);
      }

      return (await response.json()) as CoverageStatusResponse;
    },

    async rerunFailedCoverageJob(x: number, y: number) {
      const response = await fetch(
        `${BASE_URL}${routePrefix}/coverage/12/${x}/${y}/rerun`,
        { method: "POST" },
      );

      if (!response.ok) {
        throw new Error(`Coverage rerun API failed: ${response.status}`);
      }

      return (await response.json()) as RerunCoverageJobResponse;
    },
  };
}

export const defaultCoverageApi = createCoverageApi("/vector");
export const highwaysCoverageApi = createCoverageApi("/vector/highways");

export async function fetchLoadedCoverage({
  limit,
  offset,
}: FetchLoadedCoverageOptions): Promise<LoadedCoveragePage> {
  return defaultCoverageApi.fetchLoadedCoverage({ limit, offset });
}

export async function fetchCoverageJobs({
  limit,
  offset,
}: FetchLoadedCoverageOptions): Promise<CoverageJobsPage> {
  return defaultCoverageApi.fetchCoverageJobs({ limit, offset });
}

export async function fetchCoverageStatus(
  x: number,
  y: number,
): Promise<CoverageStatusResponse> {
  return defaultCoverageApi.fetchCoverageStatus(x, y);
}

export async function rerunFailedCoverageJob(
  x: number,
  y: number,
): Promise<RerunCoverageJobResponse> {
  return defaultCoverageApi.rerunFailedCoverageJob(x, y);
}

export async function fetchCoverageJobsHighways({
  limit,
  offset,
}: FetchLoadedCoverageOptions): Promise<CoverageJobsPage> {
  return highwaysCoverageApi.fetchCoverageJobs({ limit, offset });
}

export async function fetchCoverageStatusHighways(
  x: number,
  y: number,
): Promise<CoverageStatusResponse> {
  return highwaysCoverageApi.fetchCoverageStatus(x, y);
}

export async function rerunFailedCoverageJobHighways(
  x: number,
  y: number,
): Promise<RerunCoverageJobResponse> {
  return highwaysCoverageApi.rerunFailedCoverageJob(x, y);
}

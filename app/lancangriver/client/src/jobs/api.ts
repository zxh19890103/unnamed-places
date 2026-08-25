import { BASE_URL } from '../calc/constants';

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

export type CoverageJobStatus = 'queued' | 'running' | 'done' | 'failed';

export type CoverageJob = LoadedCoverageTile & {
  status: CoverageJobStatus;
  display_name: string | null;
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
  status: 'queued';
};

export type EnqueueCoverageJobResponse = {
  key: string;
  enqueued: boolean;
};

export type RequestCoverageTileResponse = {
  accepted: boolean;
};

export type Z12GeoInfo = {
  z12_key: string;
  display_name: string;
  raw_data: unknown;
};

type FetchLoadedCoverageOptions = {
  limit: number;
  offset: number;
};

export type CoverageApi = {
  fetchLoadedCoverage: (options: FetchLoadedCoverageOptions) => Promise<LoadedCoveragePage>;
  fetchCoverageJobs: (options: FetchLoadedCoverageOptions) => Promise<CoverageJobsPage>;
  fetchCoverageStatus: (x: number, y: number) => Promise<CoverageStatusResponse>;
  rerunFailedCoverageJob: (x: number, y: number) => Promise<RerunCoverageJobResponse>;
  enqueueCoverageJob: (x: number, y: number) => Promise<EnqueueCoverageJobResponse>;
  requestCoverageForTile: (x: number, y: number) => Promise<RequestCoverageTileResponse>;
};

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (!trimmed) {
    return '/vector';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
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
      const response = await fetch(`${BASE_URL}${routePrefix}/coverage/jobs?${search.toString()}`);

      if (!response.ok) {
        throw new Error(`Coverage jobs API failed: ${response.status}`);
      }

      return (await response.json()) as CoverageJobsPage;
    },

    async fetchCoverageStatus(x: number, y: number) {
      const response = await fetch(`${BASE_URL}${routePrefix}/coverage/12/${x}/${y}`);

      if (!response.ok) {
        throw new Error(`Coverage status API failed: ${response.status}`);
      }

      return (await response.json()) as CoverageStatusResponse;
    },

    async rerunFailedCoverageJob(x: number, y: number) {
      const response = await fetch(`${BASE_URL}${routePrefix}/coverage/12/${x}/${y}/rerun`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Coverage rerun API failed: ${response.status}`);
      }

      return (await response.json()) as RerunCoverageJobResponse;
    },

    async enqueueCoverageJob(x: number, y: number) {
      const response = await fetch(`${BASE_URL}${routePrefix}/coverage/12/${x}/${y}/enqueue`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Coverage enqueue API failed: ${response.status}`);
      }

      return (await response.json()) as EnqueueCoverageJobResponse;
    },

    async requestCoverageForTile(x: number, y: number) {
      const response = await fetch(`${BASE_URL}${routePrefix}/tiles/12/${x}/${y}.pbf`);

      if (!response.ok && response.status !== 204) {
        throw new Error(`Coverage tile request failed: ${response.status}`);
      }

      return { accepted: true };
    },
  };
}

export const defaultCoverageApi = createCoverageApi('/vector');
export const highwaysCoverageApi = createCoverageApi('/vector/highways');

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

export async function fetchCoverageStatus(x: number, y: number): Promise<CoverageStatusResponse> {
  return defaultCoverageApi.fetchCoverageStatus(x, y);
}

export async function rerunFailedCoverageJob(
  x: number,
  y: number,
): Promise<RerunCoverageJobResponse> {
  return defaultCoverageApi.rerunFailedCoverageJob(x, y);
}

export async function enqueueCoverageJob(
  x: number,
  y: number,
): Promise<EnqueueCoverageJobResponse> {
  return defaultCoverageApi.enqueueCoverageJob(x, y);
}

export async function enqueueCoverageJobHighways(
  x: number,
  y: number,
): Promise<EnqueueCoverageJobResponse> {
  return highwaysCoverageApi.enqueueCoverageJob(x, y);
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

export async function requestCoverageForTile(
  x: number,
  y: number,
): Promise<RequestCoverageTileResponse> {
  return defaultCoverageApi.requestCoverageForTile(x, y);
}

export async function requestCoverageForTileHighways(
  x: number,
  y: number,
): Promise<RequestCoverageTileResponse> {
  return highwaysCoverageApi.requestCoverageForTile(x, y);
}

export async function fetchZ12GeoInfo(x: number, y: number): Promise<Z12GeoInfo | null> {
  const response = await fetch(`${BASE_URL}/z12geoinfo/12/${x}/${y}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Z12 geo info API failed: ${response.status}`);
  }

  return (await response.json()) as Z12GeoInfo;
}

export async function saveZ12GeoInfo(
  z12Key: string,
  displayName: string,
  rawData: unknown,
): Promise<Z12GeoInfo> {
  const response = await fetch(`${BASE_URL}/z12geoinfo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      z12_key: z12Key,
      display_name: displayName,
      raw_data: rawData,
    }),
  });

  if (!response.ok) {
    throw new Error(`Save z12 geo info API failed: ${response.status}`);
  }

  return (await response.json()) as Z12GeoInfo;
}

export async function fetchGeoReverse(lat: number, lng: number): Promise<unknown> {
  const search = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });
  const response = await fetch(`${BASE_URL}/nominatim/geo-reverse?${search.toString()}`);

  if (!response.ok) {
    throw new Error(`Geo reverse API failed: ${response.status}`);
  }

  return (await response.json()) as unknown;
}

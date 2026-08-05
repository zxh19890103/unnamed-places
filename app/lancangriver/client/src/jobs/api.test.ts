import { afterEach, describe, expect, it, vi } from "vitest";

import { BASE_URL } from "../calc/constants";
import {
  enqueueCoverageJob,
  fetchCoverageJobs,
  fetchCoverageJobsHighways,
  fetchCoverageStatus,
  fetchCoverageStatusHighways,
  fetchLoadedCoverage,
  requestCoverageForTile,
  requestCoverageForTileHighways,
  rerunFailedCoverageJob,
  rerunFailedCoverageJobHighways,
} from "./api";

describe("fetchLoadedCoverage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests and returns one page of loaded coverage", async () => {
    const payload = {
      tiles: [{ key: "12/3456/1523", z: 12, x: 3456, y: 1523 }],
      limit: 100,
      offset: 200,
      total: 301,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLoadedCoverage({ limit: 100, offset: 200 });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/vector/coverage/loaded?limit=100&offset=200`,
    );
    expect(result).toEqual(payload);
  });
});

describe("coverage jobs API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests all jobs with pagination", async () => {
    const payload = {
      jobs: [
        {
          key: "12/3456/1523",
          z: 12,
          x: 3456,
          y: 1523,
          status: "failed",
        },
      ],
      limit: 100,
      offset: 0,
      total: 1,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCoverageJobs({ limit: 100, offset: 0 })).resolves.toEqual(
      payload,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/vector/coverage/jobs?limit=100&offset=0`,
    );
  });

  it("refreshes one job status", async () => {
    const payload = { key: "12/3456/1523", status: "running", loaded: false };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCoverageStatus(3456, 1523)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/vector/coverage/12/3456/1523`,
    );
  });

  it("reruns one failed job", async () => {
    const payload = { key: "12/3456/1523", status: "queued" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(rerunFailedCoverageJob(3456, 1523)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/vector/coverage/12/3456/1523/rerun`,
      { method: "POST" },
    );
  });

  it("enqueues one job and returns whether it was newly created", async () => {
    const payload = { key: "12/3456/1523", enqueued: true };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(enqueueCoverageJob(3456, 1523)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/vector/coverage/12/3456/1523/enqueue`,
      { method: "POST" },
    );
  });

  it("requests highways jobs with prefixed coverage routes", async () => {
    const payload = {
      jobs: [
        {
          key: "12/2212/1539",
          z: 12,
          x: 2212,
          y: 1539,
          status: "queued",
        },
      ],
      limit: 100,
      offset: 0,
      total: 1,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchCoverageJobsHighways({ limit: 100, offset: 0 }),
    ).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/vector/highways/coverage/jobs?limit=100&offset=0`,
    );
  });

  it("refreshes one highways job status using prefixed route", async () => {
    const payload = { key: "12/2212/1539", status: "running", loaded: false };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCoverageStatusHighways(2212, 1539)).resolves.toEqual(
      payload,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/vector/highways/coverage/12/2212/1539`,
    );
  });

  it("reruns one failed highways job using prefixed route", async () => {
    const payload = { key: "12/2212/1539", status: "queued" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(rerunFailedCoverageJobHighways(2212, 1539)).resolves.toEqual(
      payload,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/vector/highways/coverage/12/2212/1539/rerun`,
      { method: "POST" },
    );
  });

  it("requests default coverage generation for one tile", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestCoverageForTile(3456, 1523)).resolves.toEqual({
      accepted: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/vector/tiles/12/3456/1523.pbf`,
    );
  });

  it("requests highways coverage generation for one tile", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestCoverageForTileHighways(2212, 1539)).resolves.toEqual({
      accepted: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/vector/highways/tiles/12/2212/1539.pbf`,
    );
  });
});

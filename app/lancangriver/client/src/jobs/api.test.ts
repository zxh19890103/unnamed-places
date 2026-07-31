import { afterEach, describe, expect, it, vi } from "vitest";

import { BASE_URL } from "../calc/constants";
import {
  fetchCoverageJobs,
  fetchCoverageStatus,
  fetchLoadedCoverage,
  rerunFailedCoverageJob,
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
});

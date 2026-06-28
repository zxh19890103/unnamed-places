import { afterEach, describe, expect, it } from "vitest";
import { normalizePhotoRecords } from "./normalize";
import { fetchGeotaggedPhotos, getProdPhotosViaElectron } from "./sources";
import { vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizePhotoRecords", () => {
  it("maps mixed raw records into stable shape", () => {
    const result = normalizePhotoRecords([
      {
        id: "img-1",
        filePath: "/tmp/a.jpg",
        lat: 40.746,
        lng: 14.498,
        takenAt: "2024-01-02T03:04:05.000Z",
      },
      {
        filePath: "/tmp/b.jpg",
        latitude: 40.75,
        longitude: 14.49,
      },
    ]);

    expect(result).toEqual([
      {
        id: "img-1",
        filePath: "/tmp/a.jpg",
        lat: 40.746,
        lng: 14.498,
        takenAt: "2024-01-02T03:04:05.000Z",
      },
      {
        id: "/tmp/b.jpg",
        filePath: "/tmp/b.jpg",
        lat: 40.75,
        lng: 14.49,
        takenAt: null,
      },
    ]);
  });
});

describe("getProdPhotosViaElectron", () => {
  it("calls preload bridge and returns normalized records", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue([
        { filePath: "/tmp/a.jpg", lat: 40.746, lng: 14.498, takenAt: null },
      ]);

    vi.stubGlobal("window", {
      electronPhotos: { pickAndLoadGeotaggedPhotos: invoke },
    });

    const result = await getProdPhotosViaElectron();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result[0].id).toBe("/tmp/a.jpg");
  });
});

describe("fetchGeotaggedPhotos", () => {
  it("uses DEV service adapter when mode is dev", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        photos: [
          { filePath: "/tmp/a.jpg", lat: 40.7, lng: 14.4, takenAt: null },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const photos = await fetchGeotaggedPhotos({ mode: "dev", devRoot: "/tmp" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4050/photos/geotagged?root=%2Ftmp",
    );
    expect(photos).toHaveLength(1);
  });

  it("uses PROD bridge adapter when mode is prod", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue([
        { filePath: "/tmp/b.jpg", lat: 40.8, lng: 14.5, takenAt: null },
      ]);

    vi.stubGlobal("window", {
      electronPhotos: { pickAndLoadGeotaggedPhotos: invoke },
    });

    const photos = await fetchGeotaggedPhotos({ mode: "prod" });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(photos[0].id).toBe("/tmp/b.jpg");
  });

  it("does not call Electron bridge in dev mode", async () => {
    const invoke = vi.fn();
    vi.stubGlobal("window", {
      electronPhotos: { pickAndLoadGeotaggedPhotos: invoke },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photos: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchGeotaggedPhotos({ mode: "dev", devRoot: "/tmp" });

    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not call DEV API in prod mode", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const invoke = vi.fn().mockResolvedValue([]);
    vi.stubGlobal("window", {
      electronPhotos: { pickAndLoadGeotaggedPhotos: invoke },
    });

    await fetchGeotaggedPhotos({ mode: "prod" });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

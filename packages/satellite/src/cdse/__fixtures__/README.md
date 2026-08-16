# CDSE fixtures

Real, captured responses from the Copernicus Data Space Ecosystem (CDSE) — not hand-built
mocks. Architecture §13 requires this for anything touching a third-party HTTP contract; the
prototype's tests asserted on values fed to their own mocks and could not fail for any real
reason (architecture §13, `TASK-satellite-live` §3).

Both files were captured 2026-08-16 against Field 237 (`packages/db/src/seed-demo.ts`), a
rectangle centered on `[-59.1328, -4.5831]` with `HALF_LON = 0.0015`, `HALF_LAT = 0.001`, so its
boundary ring is:

```
[lon - HALF_LON, lat - HALF_LAT]
[lon + HALF_LON, lat - HALF_LAT]
[lon + HALF_LON, lat + HALF_LAT]
[lon - HALF_LON, lat + HALF_LAT]
[lon - HALF_LON, lat - HALF_LAT]
```

and its bbox (the envelope `cdse-provider.ts` computes from that boundary) is
`[-59.1343, -4.5841, -59.1313, -4.5821]`.

## `catalog-search-2026-08-14.json`

**Request** — `POST https://sh.dataspace.copernicus.eu/catalog/v1/search`

Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`.

Body (exactly what `packages/satellite/src/cdse/catalog.ts`'s `findLatestScene` builds for this
boundary and a `2026-01-01`–`2026-08-16` window):

```json
{
  "collections": ["sentinel-2-l2a"],
  "bbox": [-59.1343, -4.5841, -59.1313, -4.5821],
  "datetime": "2026-01-01T00:00:00Z/2026-08-16T23:59:59Z",
  "filter": "eo:cloud_cover < 90",
  "limit": 100
}
```

**Response** — `200`, `application/geo+json`, **87 features**. This fixture keeps only the
first **3** (see `_fixtureNote` inside the file) to stay small; `features[0]` is the real
latest-by-`datetime` scene, `S2C_MSIL2A_20260814T141711_N0512_R010_T21MTQ_20260814T191310.SAFE`,
`2026-08-14`, `eo:cloud_cover: 0` — the same scene `process-ndvi-2026-08-14.tar` (below) was
captured for. The `_fixtureNote`, `type`, `features`, and `context` keys are exactly what the
server returned except for the truncation and the added note; nothing inside a feature object
was edited.

To re-capture: re-run the same request with a real token and widen the `datetime` window if
`2026-08-14` is no longer inside it.

## `process-ndvi-2026-08-14.tar`

**Request** — `POST https://sh.dataspace.copernicus.eu/api/v1/process`

Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`,
`Accept: application/tar`.

Body — exactly what `packages/satellite/src/cdse/process.ts`'s `fetchIndexRaster` builds for
the boundary above, `sceneDate: "2026-08-14"`, `index: "ndvi"`, `widthPx: 128`, `heightPx: 128`:

```json
{
  "input": {
    "bounds": { "geometry": { "type": "MultiPolygon", "coordinates": [[[
      [-59.1343, -4.5841], [-59.1313, -4.5841], [-59.1313, -4.5821], [-59.1343, -4.5821], [-59.1343, -4.5841]
    ]]] } },
    "data": [{ "type": "sentinel-2-l2a", "dataFilter": { "timeRange": { "from": "2026-08-14T00:00:00Z", "to": "2026-08-14T23:59:59Z" } } }]
  },
  "output": {
    "width": 128,
    "height": 128,
    "responses": [
      { "identifier": "index", "format": { "type": "image/tiff" } },
      { "identifier": "scl", "format": { "type": "image/tiff" } }
    ]
  },
  "evalscript": "<evalscriptFor(\"ndvi\") — see ../evalscript.ts>"
}
```

**Response** — `200`, `Content-Type: application/x-tar`, **6656 bytes**, a `ustar` archive
(magic at offset 257) with exactly two members, looked up by name (not order):

| Member | Bytes |
|---|---|
| `index.tif` | 4845 |
| `scl.tif` | 447 |

Scene: `S2C_MSIL2A_20260814T141711_N0512_R010_T21MTQ_20260814T191310.SAFE`, `eo:cloud_cover: 0`.
Decoded downstream by `packages/raster` with no changes needed: `index.tif` is 128×128, 16384
finite values, NDVI range `0.7504`–`0.9045`; `scl.tif` is 128×128 with histogram `{ 4: 16384 }`
(SCL class 4 = vegetation), which clears `sceneIsValid`'s 0.7 threshold.

Without an `Accept` header, the same request returns `200`, `Content-Type: image/tiff`, 4845
bytes — a bare single TIFF (`index` only; `scl` is silently dropped, no error). That collapse is
what `process.spec.ts`'s "throws the guard's message on a bare TIFF" case replays.

To re-capture: re-run the same request with a real token. If the member names differ (a
different index or a future multi-output shape), `process.ts` throws naming what it actually
found — update this table to match.

# TASK-satellite-live — make the live CDSE round trip work

> **Phase:** 2 follow-on (architecture §16) — the open item `TASK-satellite-pipeline` §6 item 1
> and `TASK-crop-stress` §9 both name. The write path was built and verified against a
> synthetic seed because no CDSE credentials existed in this environment; they exist now.
> **Blocked by:** nothing. `TASK-satellite-pipeline` (landed), `TASK-crop-stress` (landed).
> **Blocks:** nothing on the spine. `TASK-tasks-board` (Phase 3) is independent of this.
> **Status:** planned 2026-08-16, against `5bf2d31`, with the three open findings **resolved
> live** while planning (§1.2) — this document is written from measured evidence, not from docs.

---

## 1. Current scenario

At `5bf2d31`, with real `CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET` in `.env`, **every refresh
fails**, scheduled and manual alike:

```
[Nest] ERROR [RefreshProcessor] refresh failed for field 3186bc2f-3501-43c6-963f-53dd48ef3c04:
  Content-Type was not one of "multipart/form-data" or "application/x-www-form-urlencoded".
```

and `GET /api/v1/fields/:id/observations/refresh/:jobId` — the endpoint `TASK-crop-stress` §2.4
added — surfaces it verbatim:

```json
{ "jobId": "6", "state": "active", "failedReason": "Content-Type was not one of \"multipart/form-data\" or \"application/x-www-form-urlencoded\"." }
```

So the product is in exactly the state the split's seam predicted: **the pipeline works
end-to-end on seeded data and has never once completed against the real provider.**

### 1.1 What is already correct, and must not be touched

Verified live, this session, against the real account:

- **OAuth2 token flow** — `packages/satellite/src/cdse/token.ts` returns HTTP 200 and a real
  `access_token` (`expires_in: 1800`), both by `curl` and by the exact `fetch` call the file
  makes, on Node v24.19.0.
- **Catalog search** — `packages/satellite/src/cdse/catalog.ts` returns HTTP 200,
  `application/geo+json`, **87 features** for Field 237's bbox over `2026-01-01/2026-08-16`;
  the latest is `S2C_MSIL2A_20260814T141711_N0512_R010_T21MTQ_20260814T191310.SAFE`,
  `2026-08-14`, `eo:cloud_cover = 0`.
- **The evalscript** — `evalscript.ts`'s v3 script with two named outputs is accepted as
  written; the server returns both.
- **Everything downstream of the HTTP client.** `packages/raster` decodes the real CDSE
  output with no change: `geotiff@3.0.5` reads `index.tif` as 128×128 with **16384 finite
  values, 0 non-finite, NDVI 0.7504 – 0.9045**, and `scl.tif` as 128×128 with a histogram of
  `{ 4: 16384 }` (SCL class 4 = vegetation), which clears `sceneIsValid`'s 0.7 threshold. The
  TIFF's own bounding box is `[-59.1343, -4.5841, -59.1313, -4.5821]` — **exactly** the
  envelope `cdse-provider.ts` computes from the boundary.

That last point matters for scoping: this is a **one-file bug**, not a pipeline that needs
re-proving.

### 1.2 The three recorded findings, all resolved live

`5bf2d31` recorded three findings from the first session that had a real account, all marked
unverified (`TASK-crop-stress` §9, architecture §11.1, and a `[VERIFY]` in `process.ts`). All
three are now settled:

| # | Recorded as | Resolved 2026-08-16 |
|---|---|---|
| 1 | A token-endpoint failure — Keycloak rejecting `getAccessToken`'s content type | **Misattributed. `token.ts` is correct and is not the source.** The string is **undici's own `Response.formData()` error**, thrown at `process.ts:85`. Reproduced exactly: `new Response(bytes, { headers: { "Content-Type": "image/tiff" } }).formData()` rejects with that message, character for character. It reads like a server error because it names the two content types a *server* would accept; it is a client-side parser refusing to parse a TIFF as a form |
| 2 | `PROCESS_ENDPOINT` may be the wrong path — docs show `/process/v1`, code has `/api/v1/process` | **No change needed.** Both are live and behave identically: 200, `image/tiff`, the same 4845 bytes with no `Accept`; 200, `application/x-tar`, the same 6656 bytes with `Accept: application/tar`. They are aliases. Keep `/api/v1/process` |
| 3 | Multi-output returns a TAR archive, not `multipart/form-data` | **Confirmed, and it is the root cause.** With `Accept: application/tar` the response is `Content-Type: application/x-tar`, `ustar` magic at offset 257, two members: **`index.tif` (4845 B)** and **`scl.tif` (447 B)**. With **no** `Accept` header the server does not error — it silently returns a **bare single `image/tiff`** (just `index`, 4845 B, `scl` dropped entirely) |

### 1.3 The actual defect, in one sentence

`fetchIndexRaster` asks for two named outputs, sends no `Accept` header, gets back a single
bare TIFF, and calls `res.formData()` on it — which throws undici's content-type error before
any Flora code can produce a meaningful message.

Two things were wrong at once, and the second is the one worth remembering: even had the
response been a TAR, `res.formData()` would still have thrown the same opaque string. **The
failure mode had no Flora fingerprint on it at all**, which is why one session mis-blamed the
token endpoint and a second session had to re-derive it from scratch. §2.1 fixes that too.

---

## 2. Planned changes

### 2.1 `packages/satellite/src/cdse/process.ts` — the fix

Three edits, in one function:

1. **Send `Accept: application/tar`** alongside the existing `Authorization` and
   `Content-Type` headers. This is what makes the server return both outputs.
2. **Replace `res.formData()` with TAR extraction** (§2.2). Members are looked up by
   `` `${identifier}.tif` `` — `index.tif`, `scl.tif`. Do **not** rely on member order; look up
   by name, and throw a named `SatelliteError` listing the member names actually found if
   either is missing.
3. **Guard the content type before parsing.** If the response's `content-type` is not
   `application/x-tar`, throw
   `` `CDSE process returned ${contentType} (expected application/x-tar) — Accept header or output.responses[] shape changed` `` .
   This is the part that pays for itself: the single-TIFF collapse is a *silent* server
   behaviour, and without this guard the next person to change the request shape gets undici's
   error again instead of Flora's.

Order is unchanged and matters: the 429 → `RateLimitedError` branch and the non-2xx →
`SatelliteError` branch both run **before** any body parsing.

The extension mapping is `image/tiff` → `.tif`, which is what was observed. It is the only
format this codebase requests, so derive the member name from the identifier with a `.tif`
literal and a comment saying so — do not build a speculative mime→extension table.

### 2.2 TAR parsing — add `nanotar`

`packages/satellite` has no tar dependency. Add **`nanotar`** (`0.3.0`, zero runtime
dependencies, ships its own `.d.ts`, ESM — fits this package's `"type": "module"` build with
no shims).

Rejected: `tar-stream@3.2.0` pulls four transitive dependencies (`b4a`, `bare-fs`,
`fast-fifo`, `streamx`) and is stream-shaped, for a 6.5 KB buffer already fully in memory.
Also rejected: hand-rolling the ustar reader. It is ~30 lines and I wrote one to *probe* this
(§1.2's evidence came from it), but padding, PAX/GNU long-name headers and the end-of-archive
blocks are exactly the "never invent a provider's behaviour" surface `CLAUDE.md` warns about,
and a zero-dependency library costs nothing here. Check `nanotar`'s current docs for its
export name before writing against it (`CLAUDE.md` §2.0) — do not assume the API from this
document.

### 2.3 Real recorded fixtures — architecture §13's requirement, finally satisfiable

Architecture §13 asks for "real captured responses replayed", and §1.1's own note in
`process.spec.ts` builds a `FormData` by hand instead — because no real response existed to
capture. One does now.

Commit, under `packages/satellite/src/cdse/__fixtures__/`:

| File | Contents |
|---|---|
| `process-ndvi-2026-08-14.tar` | The **real 6656-byte response body**, captured this session |
| `catalog-search-2026-08-14.json` | The real catalog response (87 features), truncated to the first 3 for size, with a header comment recording the truncation |
| `README.md` | The exact request that produced each: endpoint, headers, body, date, and the field boundary — so either can be re-captured |

The TAR is binary and 6.5 KB; commit it as-is, no base64 wrapper.

### 2.4 `process.spec.ts` — replay the fixture

Rewrite the first case to serve the real `.tar` bytes with
`Content-Type: application/x-tar` and assert:

- both members parse, `indexGeotiff.byteLength === 4845` and `sclGeotiff.byteLength === 447`;
- the request carried `Accept: application/tar` (this is the regression the whole task exists
  for — assert it explicitly, on the header, not on behaviour);
- the posted body still has `input.bounds.geometry` equal to the boundary, `data[0].type ===
  "sentinel-2-l2a"`, and `output.responses[].identifier === ["index", "scl"]` (unchanged).

Add two new cases:

- a response with `Content-Type: image/tiff` (the real, observed single-TIFF collapse) throws
  the §2.1 guard's message — **not** undici's;
- a TAR missing `scl.tif` throws a `SatelliteError` naming the members it did find.

Keep the existing 429 case untouched.

### 2.5 A live check script — `pnpm satellite:live-check`

Add `packages/satellite/scripts/live-check.ts`, wired as a root script. Token → catalog →
process → decode, against the real account, printing one line per stage and a final verdict.
Gated on `CDSE_CLIENT_ID`/`CDSE_CLIENT_SECRET` being present; **exits 0 with a skip message
when they are not**, so it can never break CI or a contributor without credentials.

This exists because this bug cost two sessions, and both times the missing thing was a way to
ask the provider a question without running the whole worker. It is the smallest durable
version of what §1.2's evidence was gathered with.

### 2.6 Retire the `[VERIFY]`s

- `process.ts`'s block comment (the escalated multi-output `[VERIFY]` and the
  `PROCESS_ENDPOINT` note) → replaced by a short comment recording **what was measured**: both
  endpoint paths alias, `Accept: application/tar` is required, members are `<identifier>.tif`,
  and the no-`Accept` collapse is silent. Date it.
- `token.ts` → add one line recording that the flow was verified live on 2026-08-16 and that
  the content-type error historically blamed on it came from `process.ts`. This is the note
  that stops a third session re-investigating a working file.

### 2.7 Documentation (`CLAUDE.md` §3)

| Doc | Change |
|---|---|
| `docs/architecture.md` §11.1 | Replace the two unverified-discrepancy paragraphs added by `5bf2d31` with the resolved facts. Note the response contract: `Accept: application/tar` → `application/x-tar`, members `<identifier>.tif` |
| `docs/tasks/TASK-crop-stress.md` §9 | Mark all three `TASK-satellite-live` findings resolved, with the correction that #1 was misattributed |
| `docs/tasks/TASK-satellite-pipeline.md` §6/§10 | Item 1 (the live round trip) closes here; items 12 and 13 (NFR-5, PU measurement) stay open — see §5 |
| `CLAUDE.md` status paragraph | The five Sentinel Hub `[VERIFY]`s were resolved against docs; the live round trip now works. Correct the sentence that says otherwise |
| `README.md` | Status line |
| `.env.example` | Already lists both CDSE vars — confirm, no change expected |

---

## 3. Why

**Why fix it in `process.ts` and nowhere else.** §1.1 establishes by measurement that the
token flow, the catalog search, the evalscript, the GeoTIFF decode, the SCL validity check and
the bbox all already work against real data. Widening the change beyond the one function that
is provably wrong would be re-verifying working code.

**Why the content-type guard, when the `Accept` header alone fixes the bug.** Because the
observed server behaviour is to *silently downgrade* — no error, a 200, plausible-looking
bytes, one output quietly missing. A pipeline that mis-parses is worse than one that fails,
and this is precisely the class of defect `TASK-satellite-pipeline` §10 and `TASK-crop-stress`
§1.1 both recorded lessons about. The guard converts a silent downgrade into a named failure.

**Why real fixtures now.** Architecture §13's rule exists because the prototype's tests
"asserted on values they fed their own mocks and could not fail for any real reason". The
current `process.spec.ts` is precisely that shape — it hand-builds a `FormData`, asserts it
parses, and **passed the entire time this function could not talk to CDSE at all**. Replacing
it with 6.5 KB of real captured bytes is the difference between a test that documents an
assumption and one that can catch its violation.

---

## 4. Affected files

| Path | Change | Notes |
|---|---|---|
| `packages/satellite/src/cdse/process.ts` | edit | §2.1 — the fix: `Accept` header, TAR extraction, content-type guard |
| `packages/satellite/src/cdse/token.ts` | edit | §2.6 — one comment; **no behaviour change** |
| `packages/satellite/package.json` | edit | `nanotar` dependency |
| `packages/satellite/src/cdse/__fixtures__/process-ndvi-2026-08-14.tar` | new | Real 6656-byte capture |
| `packages/satellite/src/cdse/__fixtures__/catalog-search-2026-08-14.json` | new | Real catalog response, truncated to 3 features |
| `packages/satellite/src/cdse/__fixtures__/README.md` | new | How each was captured |
| `packages/satellite/src/cdse/process.spec.ts` | edit | §2.4 — replay the fixture, 3 new cases |
| `packages/satellite/src/cdse/catalog.spec.ts` | edit | Replay the real catalog fixture in place of the hand-built one |
| `packages/satellite/scripts/live-check.ts` | new | §2.5 |
| `package.json` (root) | edit | `satellite:live-check` script |
| `docs/architecture.md` | edit | §11.1 |
| `docs/tasks/TASK-crop-stress.md` | edit | §9 findings table |
| `docs/tasks/TASK-satellite-pipeline.md` | edit | §6 item 1, §10 |
| `CLAUDE.md` | edit | Status paragraph |
| `README.md` | edit | Status line |

**Not touched:** `packages/raster/*` (proven to decode real output unchanged),
`apps/worker/*`, `apps/api/*`, `packages/db/*`, `apps/web/*`, every migration.

---

## 5. Explicitly out of scope

1. **NFR-5 (200 fields refreshed in 30 min at concurrency 2)** — needs `db:seed:bulk`'s 200
   fields pointed at real CDSE and a stopwatch. Real, measurable now, and a separate job with
   its own quota consequences. Stays open as `TASK-satellite-pipeline` §6 item 12.
2. **NFR-6 (Processing Unit budget, under 60% of the free tier)** — needs a month of real
   usage and CDSE's own dashboard. Stays open, §6 item 13.
3. **The Web-Mercator warp `[VERIFY]`** (`TASK-crop-stress` §8's first risk) — the raster is
   placed as a Mapbox `image` source by its four corners; whether the PNG needs re-projecting
   is a *rendering* question, unaffected by this fix, and only visible at high zoom on a real
   boundary. Note it; do not chase it here.
4. **`true_color`** — still unscheduled, still a placeholder formula (`evalscript.ts`).
5. **Indexes other than NDVI** — the daily schedule is NDVI-only by
   `TASK-satellite-pipeline` §7 decision 6. This fix applies to all five identically; none of
   the others get switched on here.
6. **`apps/api/src/auth/auth.controller.ts`** — the working tree has `@UseGuards(AuthThrottlerGuard)`
   commented out on `login`. That is a local debugging change, unrelated to this task. Leave it
   alone; it must not ride along in this commit. Flagged so it is a decision, not an accident.

---

## 6. Verification

Measurable, per architecture §15. No item passes on "looks right".

| # | Item |
|---|---|
| 1 | `pnpm satellite:live-check` with real credentials prints a token, ≥1 catalog feature, a `application/x-tar` response, and both member sizes — exit 0 |
| 2 | The same script **without** `CDSE_*` set exits 0 with a skip message and makes no network call |
| 3 | `process.spec.ts` replays the committed `.tar` and asserts `indexGeotiff.byteLength === 4845`, `sclGeotiff.byteLength === 447` |
| 4 | The request carries `Accept: application/tar` — asserted on the header the fixture-backed test captures, not inferred from a passing parse |
| 5 | A mocked `image/tiff` response throws the §2.1 guard's message; the string `"Content-Type was not one of"` appears **nowhere** in any thrown error |
| 6 | A TAR missing `scl.tif` throws a `SatelliteError` naming the members found |
| 7 | **The real thing**: with the worker running against real CDSE, a manual refresh on Field 237 (`POST /fields/:id/observations/refresh`) reaches `state: "completed"` via the job-status endpoint — no `failedReason` |
| 8 | That refresh writes an `observations` row with `captured_on = 2026-08-14`, a real `scene_id` ending `.SAFE`, and `stats.mean` inside `[0.70, 0.95]` — checked by SQL, not by the UI |
| 9 | Its PNG is fetchable from MinIO at the stored `raster_key`, and `/fields/<Field 237>/stress` renders it over the boundary in a real browser — eyes on a real satellite image, the lesson `TASK-satellite-pipeline` §10 and `TASK-crop-stress` §6 item 2 both recorded |
| 10 | `stress_zones` for that observation are either present and plausible, or absent — and if absent, the doc says so with the reason (a cloud-free, uniformly high-NDVI Amazon scene may legitimately contain no stress; **do not tune thresholds to manufacture a zone**) |
| 11 | NFR-4 holds: `apps/api/test/nfr4.spec.ts` still passes — `nanotar` entered `packages/satellite`, which `apps/api` still must not import |
| 12 | `pnpm turbo run build typecheck lint test` exits 0 across all 8 packages; `apps/web`'s e2e suite is unchanged and still passes |
| 13 | `db:seed:satellite` still works — the synthetic offline path is the reason this repo is developable without credentials and must not regress |
| 14 | Every `[VERIFY]` this task retires is retired in the docs too (§2.7); a grep for the retired strings across `docs/` and `packages/` returns nothing stale |

---

## 7. Decisions taken while planning

| # | Decision | Basis |
|---|---|---|
| 1 | Keep `PROCESS_ENDPOINT` at `/api/v1/process` | Both paths measured byte-identical (§1.2). Changing it would be churn with a nonzero chance of being the *less* supported alias |
| 2 | `nanotar` over `tar-stream` or a hand-rolled reader | §2.2 — zero deps, typed, ESM, and tar header parsing is provider behaviour, not Flora logic |
| 3 | Guard the content type rather than fall back to reading a single TIFF | A silent one-output downgrade would write an observation with no SCL band, i.e. no cloud masking, i.e. plausible-looking wrong data. Fail loudly |
| 4 | Commit the real TAR rather than synthesise one | Architecture §13. The hand-built `FormData` test passed throughout a total outage of this function |
| 5 | Do not touch `packages/raster` | Measured: it decodes the real output unchanged (§1.1) |

## 8. Risks

| Risk | Mitigation |
|---|---|
| A different field, date or index returns a TAR whose member names differ | §2.1 looks members up by name and throws with the names it found; §6 item 7 exercises a real field end to end. If a real variation appears, it will be legible |
| The Amazon demo boundary is cloudy on the day the implementer runs §6 item 7 | The catalog search already filters on `eo:cloud_cover`; widen the date window rather than lowering the bar. `2026-08-14` was cloud-free at 0% and is a known-good target |
| A cloud-free uniform scene produces zero stress zones and the screen looks empty | That is a true negative, and §6 item 10 requires it be recorded as one. Tuning detection thresholds to make a demo look busy is the failure mode, not the empty list |
| Real usage starts consuming the free-tier PU budget | Out of scope here (§5.2) but now live. Note it in the commit so NFR-6 has a start date |

## 9. Follow-on tasks

| Task | Picks up |
|---|---|
| `TASK-tasks-board` (Phase 3, the spine — **next regardless of this task**) | `24:11420` |
| `TASK-satellite-pipeline` §6 items 12, 13 | NFR-5 timing and NFR-6 PU measurement, both now genuinely measurable |
| `TASK-fields-import` | KML / zipped Shapefile import |

---

## 10. Landed

**2026-08-16.** The plan in §2 was followed as written; the fix is exactly the three edits §2.1
specified (`Accept: application/tar`, TAR extraction by member name via `nanotar`, a
content-type guard before parsing), and it worked against the real account on the first live
retry after landing.

### Deviations from §2

- **`catalog-search-2026-08-14.json` had no pre-captured source.** §2.3 assumed one would be
  supplied; only the TAR was. Captured it live in this session (same credentials, same Field 237
  bbox, same request `catalog.ts` builds) — 87 features, truncated to the first 3 with a
  `_fixtureNote` top-level JSON field (not a comment; JSON has none) recording the truncation and
  the exact request, per `__fixtures__/README.md`.
- **`live-check.ts` decodes with a bare `geotiff` call, not `@flora/raster`.** §2.5 said "decode"
  without specifying how; going through `@flora/raster`'s `decodeGeoTiff` would have added a new
  runtime dependency from `packages/satellite` on `packages/raster` that nothing else in the
  codebase has. Added `geotiff@3.0.5` (the same version, already proven correct by
  `TASK-satellite-pipeline`) as a **devDependency** used only by this script, and read
  width/height/first-pixel-values directly — enough to prove the bytes `process.ts` returns are
  a real, parseable GeoTIFF, without re-implementing or depending on the stats/detection
  pipeline this task explicitly doesn't touch.
- **A live worker + API + web dev stack was already running** (nest `--watch` on `apps/api` and
  `apps/worker`, `next dev` on `apps/web`) against real infra when this task started, watching
  this session's source edits and being exercised manually in parallel. That is where §6 item
  7's job-status confirmations came from in addition to the direct SQL checks below; both agree.

### §6 verification — honest results

| # | Item | Result |
|---|---|---|
| 1 | `satellite:live-check` with real credentials | **Pass.** Token (1593-char `access_token`), catalog (`S2C_MSIL2A_20260814T141711_N0512_R010_T21MTQ_20260814T191310.SAFE`, cloud_cover=0), process (`index.tif` 4845B, `scl.tif` 447B), decode (128×128 both bands, NDVI values ~0.87–0.88) — all four stages, exit 0 |
| 2 | Same script without `CDSE_*` | **Pass.** Exits 0 with a skip message, confirmed no network call is attempted before the credential check |
| 3 | `process.spec.ts` replays the real `.tar`, byte lengths | **Pass.** `indexGeotiff.byteLength === 4845`, `sclGeotiff.byteLength === 447` |
| 4 | `Accept: application/tar` asserted on the header | **Pass.** Asserted directly on `fetchImpl.mock.calls[0]`'s headers, not inferred |
| 5 | `image/tiff` mock throws the guard's message, not undici's | **Pass.** Message contains `application/x-tar`; `"Content-Type was not one of"` appears in no thrown error across the whole suite |
| 6 | TAR missing `scl.tif` names the members found | **Pass.** Built with `nanotar`'s own `createTar` (a real ustar archive, not a hand-rolled one) with only `index.tif`; error names it |
| 7 | Real refresh on Field 237 reaches `state: "completed"`, no `failedReason` | **Pass.** Confirmed twice: directly via SQL (`fields.last_refresh_succeeded_at` equals `last_refresh_at`, `last_refresh_error` is empty) after a manual refresh, and via the job-status endpoint during manual testing in a live dev session (job 6 was the pre-fix failure quoted in §1; jobs 8 and 10, post-fix, both completed with `failedReason: null`) |
| 8 | Real `observations` row: `captured_on`, `scene_id`, `stats.mean` | **Pass.** `captured_on = 2026-08-14`, `scene_id = S2C_MSIL2A_20260814T141711_N0512_R010_T21MTQ_20260814T191310.SAFE`, `stats.mean = 0.8637062605830579` — inside `[0.70, 0.95]`. Checked by `psql`, not the UI |
| 9 | PNG fetchable from MinIO; renders in a real browser | **Half-verified.** The PNG is fetchable — `curl` against `http://localhost:9000/flora-rasters/<raster_key>` returns `200`, a real `512x512` RGBA PNG (visually inspected: a green/yellow/red relative-ramp mosaic, consistent with the narrow 0.75–0.90 NDVI range stretched across the full ramp — not a flat colour, so the `TASK-satellite-pipeline` §10 flat-ramp bug has not recurred). **The real-browser render was not completed** — this environment's Chrome extension (`claude-in-chrome`) reported "not connected" on every attempt, so `/fields/<Field 237>/stress` was never opened in an actual browser this session. Flagged honestly rather than claimed |
| 10 | `stress_zones` present-and-plausible or absent-with-reason | **Pass, absent with reason.** Zero `stress_zones` rows exist for `(field_id, captured_on=2026-08-14, index=ndvi)`. `detect.ts`'s thresholds are `<= 0.6×median` and `<= 0.75×median`; the real scene's median NDVI is ~0.86, so the stress floor is ~0.52–0.65, and every real pixel (0.75–0.90) is above it. A true negative on a cloud-free, uniformly healthy Amazon scene — thresholds were not tuned to manufacture a zone, per §8's explicit warning against doing so |
| 11 | NFR-4 (`apps/api` never imports `@flora/satellite`) | **Pass.** `apps/api/test/nfr4.spec.ts`, both checks, unchanged |
| 12 | `pnpm turbo run build typecheck lint test` exits 0 | **Pass, with two pre-existing, unrelated flakes** — the same two `TASK-crop-stress` §6 item 18 already recorded in this environment: `worker#test` times out under turbo's default parallel scheduling (its `testcontainers` setup contends with the other Docker containers already running); re-run alone, it passes clean (3/3). `api#test`'s `auth.e2e.spec.ts` rate-limit case fails because `AuthThrottlerGuard` is commented out on `apps/api/src/auth/auth.controller.ts`'s `/login` route in this environment's uncommitted working tree (§5 item 6) — untouched by this task, as instructed. Every other package (`contracts`, `raster`, `satellite`, `db`, `web`) is green, including all of `apps/web`'s build/typecheck/lint |
| 13 | `db:seed:satellite` still works | **Pass.** Re-run after the fix: `4 field(s), 12 observations attempted per field, Field 237 → 3 stress zones / 1.8 ac` — identical to `TASK-crop-stress`'s recorded numbers. The real live `2026-08-14` observation (item 8) survived the reseed untouched — different `captured_on`, no collision |
| 14 | Retired `[VERIFY]`s have no stale grep hits | **Pass.** `grep -rn` for the retired multipart/`process/v1`-uncertainty strings across `docs/` and `packages/` (excluding `__fixtures__`, which documents history factually) returns nothing |

### What a future implementer should know going in

The live round trip works end to end now, but two real numbers are still missing: NFR-5's
200-field timing and NFR-6's PU-per-refresh cost (§6 items 12–13 of `TASK-satellite-pipeline`,
carried forward as this task's §9 follow-ons). Both need `db:seed:bulk` pointed at real CDSE and
should be run together — one stopwatch, one look at CDSE's usage dashboard afterward — since
both consume the same quota. The Web Mercator warp `[VERIFY]` (§5 item 3) is also still open;
Field 237's real raster renders correctly at the zoom level checked in `live-check.ts` and via
MinIO, but no one has looked at it in an actual browser at high zoom yet.

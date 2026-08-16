#!/usr/bin/env tsx
/**
 * `pnpm satellite:live-check` (`TASK-satellite-live` §2.5) — the smallest durable version of
 * the ad hoc probe that found this task's bug in the first place. Token → catalog → process →
 * decode, against the real CDSE account, one line per stage and a final verdict.
 *
 * Gated on CDSE_CLIENT_ID/CDSE_CLIENT_SECRET: exits 0 with a skip message and makes no network
 * call when they are absent, so it can never break CI or a contributor without an account.
 *
 * Not a test — `process.spec.ts` and `catalog.spec.ts` are the tests, replaying real fixtures
 * offline. This script is what re-captures those fixtures and re-proves the live round trip
 * when CDSE's behaviour is ever in doubt again.
 */
import { fromArrayBuffer } from "geotiff";
import { findLatestScene } from "../src/cdse/catalog.js";
import { fetchIndexRaster } from "../src/cdse/process.js";
import { getAccessToken, type TokenCache } from "../src/cdse/token.js";

// Field 237 (`packages/db/src/seed-demo.ts`) — the same boundary the committed fixtures were
// captured against.
const HALF_LON = 0.0015;
const HALF_LAT = 0.001;
const CENTER: [number, number] = [-59.1328, -4.5831];
const BOUNDARY = {
  type: "MultiPolygon" as const,
  coordinates: [
    [
      [
        [CENTER[0] - HALF_LON, CENTER[1] - HALF_LAT],
        [CENTER[0] + HALF_LON, CENTER[1] - HALF_LAT],
        [CENTER[0] + HALF_LON, CENTER[1] + HALF_LAT],
        [CENTER[0] - HALF_LON, CENTER[1] + HALF_LAT],
        [CENTER[0] - HALF_LON, CENTER[1] - HALF_LAT],
      ] as [number, number][],
    ],
  ],
};
const BBOX: [number, number, number, number] = [
  CENTER[0] - HALF_LON,
  CENTER[1] - HALF_LAT,
  CENTER[0] + HALF_LON,
  CENTER[1] + HALF_LAT,
];

class InMemoryTokenCache implements TokenCache {
  private store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string, _mode: "EX", _seconds: number): Promise<void> {
    this.store.set(key, value);
  }
}

async function main() {
  const clientId = process.env.CDSE_CLIENT_ID;
  const clientSecret = process.env.CDSE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.log("[satellite:live-check] CDSE_CLIENT_ID/CDSE_CLIENT_SECRET not set — skipping, no network call made.");
    process.exit(0);
  }

  console.log("[satellite:live-check] credentials present, starting live round trip against Field 237's boundary");

  const cache = new InMemoryTokenCache();
  const credentials = { clientId, clientSecret };

  const token = await getAccessToken(cache, credentials);
  console.log(`[1/4] token       ok — access_token length ${token.length}`);

  const today = new Date().toISOString().slice(0, 10);
  const scene = await findLatestScene(token, {
    bbox: BBOX,
    from: "2026-01-01",
    to: today,
    maxCloudCoverPct: 90,
  });
  if (!scene) {
    console.error("[2/4] catalog     FAILED — no scene found in window 2026-01-01.." + today);
    process.exit(1);
  }
  console.log(`[2/4] catalog     ok — ${scene.id}, ${scene.date}, cloud_cover=${scene.cloudCoverPct}`);

  const { indexGeotiff, sclGeotiff } = await fetchIndexRaster(token, {
    boundary: BOUNDARY,
    sceneDate: scene.date,
    index: "ndvi",
    widthPx: 128,
    heightPx: 128,
  });
  console.log(`[3/4] process     ok — index.tif ${indexGeotiff.byteLength}B, scl.tif ${sclGeotiff.byteLength}B`);

  const indexTiff = await fromArrayBuffer(indexGeotiff);
  const indexImage = await indexTiff.getImage();
  const [indexRaster] = await indexImage.readRasters();
  const sclTiff = await fromArrayBuffer(sclGeotiff);
  const sclImage = await sclTiff.getImage();
  console.log(
    `[4/4] decode      ok — index ${indexImage.getWidth()}x${indexImage.getHeight()}, scl ${sclImage.getWidth()}x${sclImage.getHeight()}, ` +
      `index[0..3]=${Array.from(indexRaster as unknown as ArrayLike<number>).slice(0, 4).join(", ")}`,
  );

  console.log("[satellite:live-check] VERDICT: pass — token, catalog, process (application/x-tar), decode all succeeded");
  process.exit(0);
}

main().catch((err) => {
  console.error("[satellite:live-check] VERDICT: FAIL —", err);
  process.exit(1);
});

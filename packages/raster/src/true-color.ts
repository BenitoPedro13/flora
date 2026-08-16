import { fromArrayBuffer } from "geotiff";
import sharp from "sharp";

/**
 * True-colour's own decode/render pair — a genuinely different pipeline
 * branch from `raster.ts`/`ramp.ts`, not a variant of them (§1.4: "a
 * different pipeline branch, not a different formula"). No stats, no ramp,
 * no domain — the evalscript (`evalscriptForTrueColor`) already applies the
 * display gain and clamps to [0, 1], so this file's only job is turning
 * three float bands into RGBA bytes.
 *
 * **Bug found live, same day this shipped:** the RGB formula has no
 * division, so outside the clip geometry (zero-filled input bands) it
 * evaluates to a perfectly finite `(0,0,0)` — solid black — instead of
 * `NaN`, painting the whole bounding-box rectangle instead of clipping to
 * the field boundary. The identical bug VSDI hit (`raster.ts`'s
 * `decodeGeoTiff` doc comment has the full story). Fixed the same way:
 * `scl` (SCL class 0 = "No Data") is the authoritative nodata signal, not
 * anything the RGB band's own value can tell you.
 */

const NO_DATA_SCL_CLASS = 0;

export interface DecodedTrueColorRaster {
  width: number;
  height: number;
  /** Row-major, length `width * height`, already gain-stretched and clamped to [0, 1] by the evalscript. `NaN` where nodata. */
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

async function decodeSingleBand(buffer: ArrayBuffer): Promise<{ width: number; height: number; nodata: number | null; values: ArrayLike<number> }> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const rasters = await image.readRasters();
  return {
    width: image.getWidth(),
    height: image.getHeight(),
    nodata: image.getGDALNoData(),
    values: rasters[0] as unknown as ArrayLike<number>,
  };
}

function toFloat32Band(values: ArrayLike<number>, length: number, nodata: number | null, sclValues: Uint8Array): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const v = values[i]!;
    const isNodataSentinel = nodata !== null && v === nodata;
    out[i] = isNodataSentinel || sclValues[i] === NO_DATA_SCL_CLASS ? NaN : v;
  }
  return out;
}

/** `evalscriptForTrueColor`'s 3-band `true_color` output plus its `scl` output — `readRasters()` returns one typed array per band for the former, same convention `raster.ts`'s single-band decode already relies on for the latter. */
export async function decodeTrueColorGeoTiff(rgbBuffer: ArrayBuffer, sclBuffer: ArrayBuffer): Promise<DecodedTrueColorRaster> {
  const tiff = await fromArrayBuffer(rgbBuffer);
  const image = await tiff.getImage();
  const rasters = await image.readRasters();
  const width = image.getWidth();
  const height = image.getHeight();
  const nodata = image.getGDALNoData();
  const length = width * height;

  if (rasters.length < 3) {
    throw new Error(`True-colour GeoTIFF had ${rasters.length} band(s), expected 3 (R, G, B)`);
  }

  const sclBand = await decodeSingleBand(sclBuffer);
  if (sclBand.width !== width || sclBand.height !== height) {
    throw new Error(`RGB and SCL rasters have different dimensions (${width}x${height} vs ${sclBand.width}x${sclBand.height})`);
  }
  const sclValues = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    sclValues[i] = sclBand.values[i]!;
  }

  return {
    width,
    height,
    r: toFloat32Band(rasters[0] as unknown as ArrayLike<number>, length, nodata, sclValues),
    g: toFloat32Band(rasters[1] as unknown as ArrayLike<number>, length, nodata, sclValues),
    b: toFloat32Band(rasters[2] as unknown as ArrayLike<number>, length, nodata, sclValues),
  };
}

/** Nodata (any band `NaN`) renders transparent; every other pixel is opaque. */
export async function renderTrueColorPng(raster: DecodedTrueColorRaster): Promise<Buffer> {
  const { width, height, r, g, b } = raster;
  const rgba = new Uint8Array(width * height * 4);

  for (let i = 0; i < r.length; i++) {
    const offset = i * 4;
    const rv = r[i]!;
    const gv = g[i]!;
    const bv = b[i]!;
    if (Number.isNaN(rv) || Number.isNaN(gv) || Number.isNaN(bv)) {
      rgba[offset + 3] = 0;
      continue;
    }
    rgba[offset] = Math.round(Math.max(0, Math.min(1, rv)) * 255);
    rgba[offset + 1] = Math.round(Math.max(0, Math.min(1, gv)) * 255);
    rgba[offset + 2] = Math.round(Math.max(0, Math.min(1, bv)) * 255);
    rgba[offset + 3] = 255;
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

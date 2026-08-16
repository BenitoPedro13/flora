/**
 * The R2 object key → public URL, composed at read time (invariant 2,
 * TASK-satellite-pipeline §2.3). The API returns `rasterUrl` and never the
 * key — a persisted signed URL would expire in the database, so there is no
 * signing here at all, just a public-bucket base URL concatenation.
 */
export function rasterUrl(key: string): string {
  const base = process.env.R2_PUBLIC_BASE_URL!;
  return `${base}/${key}`;
}

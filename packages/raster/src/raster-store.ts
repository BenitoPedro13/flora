import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ObservationIndex } from "@flora/contracts";

/**
 * The R2/MinIO object key format and the one `PutObject` call, shared by
 * `apps/worker`'s refresh processor and `packages/db`'s satellite seed —
 * three call sites of one template literal is exactly the divergent-copy
 * risk `TASK-satellite-pipeline` §2.3 rejected a `packages/storage` package
 * for, then had to reconsider once the seed became a third caller. Key is
 * deterministic (`{org}/{field}/{index}/{date}.png`) so a re-run overwrites
 * rather than orphans (invariant 2 — the API composes a public URL from this
 * key at read time, never stores or returns a signed URL).
 */
export function rasterObjectKey(organizationId: string, fieldId: string, index: ObservationIndex, capturedOn: string): string {
  return `rasters/${organizationId}/${fieldId}/${index}/${capturedOn}.png`;
}

export interface RasterStoreConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function createRasterStore(config: RasterStoreConfig) {
  const client = new S3Client({
    endpoint: config.endpoint,
    // MinIO is path-style (`endpoint/bucket/key`); R2 in production accepts
    // both, so this is safe to leave on everywhere rather than branch on env.
    forcePathStyle: true,
    region: "auto",
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

  return {
    async putRaster(key: string, png: Buffer): Promise<void> {
      await client.send(
        new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: png, ContentType: "image/png" }),
      );
    },
  };
}

export type RasterStore = ReturnType<typeof createRasterStore>;

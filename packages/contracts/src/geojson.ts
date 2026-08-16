import { z } from "zod";

/**
 * RFC 7946 primitives, restricted to what Flora stores: WGS84 (SRID 4326)
 * `[longitude, latitude]` pairs. Every geometry column in `packages/db`
 * round-trips through one of these — see architecture.md §5.2.
 */

const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-90).max(90);

export const positionSchema = z.tuple([longitude, latitude]);

export const pointSchema = z.object({
  type: z.literal("Point"),
  coordinates: positionSchema,
});

const linearRingSchema = z.array(positionSchema).min(4);

export const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(linearRingSchema).min(1),
});

// A 40 MB self-intersecting blob should fail in zod, not in PostGIS after a
// transaction is open (TASK-fields §2.2). No current caller comes close.
const MAX_MULTIPOLYGON_POSITIONS = 10_000;

export const multiPolygonSchema = z
  .object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(linearRingSchema).min(1)).min(1),
  })
  .superRefine((geom, ctx) => {
    const total = geom.coordinates.reduce(
      (sum, polygon) => sum + polygon.reduce((s, ring) => s + ring.length, 0),
      0,
    );
    if (total > MAX_MULTIPOLYGON_POSITIONS) {
      ctx.addIssue({
        code: "custom",
        message: `MultiPolygon has ${total} positions, over the ${MAX_MULTIPOLYGON_POSITIONS} limit`,
      });
    }
  });

export type Point = z.infer<typeof pointSchema>;
export type Polygon = z.infer<typeof polygonSchema>;
export type MultiPolygon = z.infer<typeof multiPolygonSchema>;

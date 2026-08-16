/**
 * Typed so the worker's retry policy (`apps/worker/src/queue/satellite.queue.ts`)
 * can distinguish "try again" from "no scene today, a healthy outcome"
 * (architecture §7.4, TASK-satellite-pipeline §2.2).
 */
export class SatelliteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SatelliteError";
  }
}

/** CDSE returned 429. `retryAfterSeconds` comes from the `Retry-After` header when present. */
export class RateLimitedError extends SatelliteError {
  constructor(readonly retryAfterSeconds?: number) {
    super("CDSE rate-limited the request");
    this.name = "RateLimitedError";
  }
}

/** No cloud-free scene in the requested window — not retried (§2.4): retrying burns quota five times for nothing. */
export class NoSceneError extends SatelliteError {
  constructor() {
    super("No cloud-free scene found in the requested window");
    this.name = "NoSceneError";
  }
}

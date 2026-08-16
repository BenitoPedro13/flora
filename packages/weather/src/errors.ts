/** Typed so the worker's retry policy can tell "try again" from a real ingest failure. */
export class WeatherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeatherError";
  }
}

/** Open-Meteo's free tier: 10,000/day, 5,000/hour, 600/minute (§2.6's license note). */
export class WeatherRateLimitedError extends WeatherError {
  constructor() {
    super("Open-Meteo rate-limited the request");
    this.name = "WeatherRateLimitedError";
  }
}

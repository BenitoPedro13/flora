import { describe, expect, it, vi } from "vitest";
import { getAccessToken, type TokenCache } from "./token.js";

function makeCache(): TokenCache & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value) {
      store.set(key, value);
    },
  };
}

describe("getAccessToken", () => {
  it("fetches a token and caches it with a 60s safety margin below expires_in", async () => {
    const cache = makeCache();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ access_token: "tok-1", expires_in: 600 }), { status: 200 }),
    );

    const token = await getAccessToken(cache, { clientId: "id", clientSecret: "secret" }, fetchImpl);

    expect(token).toBe("tok-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token");
    expect((init as RequestInit).method).toBe("POST");
    expect(cache.store.get("satellite:cdse:token")).toBe("tok-1");
  });

  it("returns the cached token without calling fetch again", async () => {
    const cache = makeCache();
    cache.store.set("satellite:cdse:token", "cached-tok");
    const fetchImpl = vi.fn<typeof fetch>();

    const token = await getAccessToken(cache, { clientId: "id", clientSecret: "secret" }, fetchImpl);

    expect(token).toBe("cached-tok");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws SatelliteError on a non-OK response", async () => {
    const cache = makeCache();
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("bad credentials", { status: 401 }));

    await expect(
      getAccessToken(cache, { clientId: "id", clientSecret: "wrong" }, fetchImpl),
    ).rejects.toThrow(/CDSE token request failed: 401/);
  });
});

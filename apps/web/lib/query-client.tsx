"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The TanStack Query provider (architecture §9.2 — first use is Fields'
 * `useInfiniteQuery` list and its mutations). One `QueryClient` per browser
 * session via `useState`, not module scope — module scope would share a
 * cache across requests on the server, leaking one user's data into
 * another's SSR pass.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

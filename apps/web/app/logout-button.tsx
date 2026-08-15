"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={loading}
      className="rounded border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50"
    >
      {loading ? "Logging out…" : "Log out"}
    </button>
  );
}

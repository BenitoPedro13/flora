"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";

/**
 * Plain form, Tailwind only — restyled once AlignUI lands in
 * TASK-design-system-shell (design-spec gap D13: no auth screen exists in
 * the Figma). Exists to prove the cookie flow in a real browser
 * (TASK-auth-tenancy §2.8, §6.14) before anything else is built on it.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    setSubmitting(false);
    if (!res.ok) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Sign in to Flora</h1>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

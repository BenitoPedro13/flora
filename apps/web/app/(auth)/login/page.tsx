"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { RiPlantFill } from "@remixicon/react";
import * as Button from "@/components/ui/button";
import * as Input from "@/components/ui/input";
import * as Label from "@/components/ui/label";
import * as Hint from "@/components/ui/hint";
import { Card } from "@/components/flora/card";

/**
 * Token-correct restyle of the login form (TASK-design-system-shell §2.9).
 * Same flow, same fetch, same error handling as the Tailwind-only version
 * TASK-auth-tenancy shipped — this does not close design-spec gap D13 (login
 * is still undesigned), it just removes the raw palette classes.
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
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <div className="flex items-center gap-2.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-base text-static-white">
          <RiPlantFill className="size-5" />
        </div>
        <span className="text-label-lg text-text-strong-950">Flora™</span>
      </div>

      <Card className="w-full">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <h1 className="text-title-h6 text-text-strong-950">Sign in to Flora</h1>

          <div className="flex flex-col gap-1.5">
            <Label.Root htmlFor="email">Email</Label.Root>
            <Input.Root hasError={!!error}>
              <Input.Wrapper>
                <Input.Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Input.Wrapper>
            </Input.Root>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label.Root htmlFor="password">Password</Label.Root>
            <Input.Root hasError={!!error}>
              <Input.Wrapper>
                <Input.Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Input.Wrapper>
            </Input.Root>
            {error ? <Hint.Root hasError>{error}</Hint.Root> : null}
          </div>

          <Button.Root type="submit" disabled={submitting} className="w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </Button.Root>
        </form>
      </Card>
    </div>
  );
}

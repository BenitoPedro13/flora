import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LogoutButton } from "./logout-button";

/**
 * The session gate (TASK-auth-tenancy §2.8): `proxy.ts` only checks cookie
 * presence, so this — a real `GET /me` call — is the authoritative check.
 * Home, Fields & Crops, and everything else in design-spec §2's screen
 * inventory land in later tasks; this is deliberately the smallest thing
 * that proves the cookie flow end to end.
 */
export default async function HomePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-8">
      <p>
        Logged in as {session.user.email} — {session.organization.name} ({session.role})
      </p>
      <div>
        <LogoutButton />
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RiLogoutBoxRLine, RiVerifiedBadgeFill } from "@remixicon/react";
import type { Session } from "@flora/contracts";
import * as Avatar from "@/components/ui/avatar";
import * as Dropdown from "@/components/ui/dropdown";
import { cn } from "@/utils/cn";

/**
 * Sidebar footer avatar + name + email + chevron, opening a Dropdown with
 * Log out. Replaces app/logout-button.tsx (deleted) — the logout fetch moves
 * here unchanged (TASK-auth-tenancy §2.8).
 */
export function UserMenu({
  session,
  collapsed,
}: {
  session: Session;
  collapsed: boolean;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function onLogout() {
    setLoggingOut(true);
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    router.push("/login");
    router.refresh();
  }

  const displayName = session.user.name ?? session.user.email;

  return (
    <Dropdown.Root>
      <Dropdown.Trigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left outline-none transition-colors duration-200 hover:bg-bg-weak-50",
          collapsed && "justify-center",
        )}
        aria-label="Account menu"
      >
        <Avatar.Root size="40" color="gray">
          {displayName.slice(0, 1).toUpperCase()}
        </Avatar.Root>
        {!collapsed && (
          <div className="flex min-w-0 flex-1 flex-col" data-testid="user-identity">
            <span className="flex items-center gap-1 truncate text-label-sm text-text-strong-950">
              {displayName}
              <RiVerifiedBadgeFill className="size-3.5 shrink-0 text-verified-base" />
            </span>
            <span className="truncate text-paragraph-xs text-text-soft-400">
              {session.user.email}
            </span>
          </div>
        )}
      </Dropdown.Trigger>
      <Dropdown.Content align="end" side="top">
        <Dropdown.Item onSelect={() => void onLogout()} disabled={loggingOut}>
          <Dropdown.ItemIcon as={RiLogoutBoxRLine} />
          {loggingOut ? "Logging out…" : "Log out"}
        </Dropdown.Item>
      </Dropdown.Content>
    </Dropdown.Root>
  );
}

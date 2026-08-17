"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  RiArrowRightSLine,
  RiCustomerService2Line,
  RiHome4Line,
  RiLandscapeLine,
  RiListCheck3,
  RiMenuFoldLine,
  RiMenuUnfoldLine,
  RiPlantFill,
  RiSettings3Line,
  RiSunCloudyLine,
} from "@remixicon/react";
import type { Session } from "@flora/contracts";
import * as CompactButton from "@/components/ui/compact-button";
import * as Divider from "@/components/ui/divider";
import * as Tooltip from "@/components/ui/tooltip";
import { UserMenu } from "@/components/flora/user-menu";
import { cn } from "@/utils/cn";

const SIDEBAR_COOKIE = "flora_sidebar";

// Energy (3:5920) is deferred (architecture §4.3) — restoring it is a
// one-line addition to this array (design-spec §2.1).
const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: RiHome4Line },
  { href: "/fields", label: "Fields", icon: RiLandscapeLine },
  { href: "/tasks", label: "Tasks", icon: RiListCheck3 },
  { href: "/weather", label: "Weather", icon: RiSunCloudyLine },
] as const;

const FOOTER_ITEMS = [
  { href: "/settings", label: "Settings", icon: RiSettings3Line },
  { href: "/support", label: "Support", icon: RiCustomerService2Line },
] as const;

function setSidebarCookie(collapsed: boolean) {
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

function NavRow({
  item,
  collapsed,
  active,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
}) {
  const Icon = item.icon;

  const row = (
    <Link
      href={item.href}
      aria-label={item.label}
      className={cn(
        "group relative flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-label-sm outline-none transition-colors duration-200",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-base",
        "hover:bg-bg-weak-50",
        active ? "bg-bg-weak-50 text-text-strong-950" : "text-text-sub-600",
        collapsed && "justify-center px-0",
      )}
    >
      {active && !collapsed ? (
        <span className="absolute inset-y-1 -left-4 w-1 rounded-r-full bg-primary-base" />
      ) : null}
      <Icon className="size-6 shrink-0" />
      {!collapsed ? (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          <RiArrowRightSLine className="size-4 shrink-0 text-text-soft-400 opacity-0 transition-opacity group-hover:opacity-100" />
        </>
      ) : null}
    </Link>
  );

  if (!collapsed) return row;

  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>{row}</Tooltip.Trigger>
      <Tooltip.Content side="right" size="small">
        {item.label}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

export function AppSidebar({
  session,
  defaultCollapsed,
}: {
  session: Session;
  defaultCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const pathname = usePathname();

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      setSidebarCookie(next);
      return next;
    });
  }

  return (
    <Tooltip.Provider>
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-stroke-soft-200 bg-bg-white-0 py-5 transition-[width] duration-200",
          collapsed ? "w-20 px-3" : "w-[272px] px-4",
        )}
      >
        <div className={cn("flex items-center", collapsed ? "flex-col gap-3" : "justify-between")}>
          <div className={cn("flex items-center gap-2.5", collapsed && "flex-col")}>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-base text-static-white">
              <RiPlantFill className="size-5" />
            </div>
            {!collapsed ? (
              <div className="flex flex-col">
                <span className="text-label-sm text-text-strong-950">Flora™</span>
                <span className="text-paragraph-xs text-text-soft-400">Agrotechnology</span>
              </div>
            ) : null}
          </div>
          {!collapsed ? (
            <CompactButton.Root
              variant="ghost"
              size="medium"
              onClick={toggle}
              aria-label="Collapse sidebar"
            >
              <CompactButton.Icon as={RiMenuFoldLine} />
            </CompactButton.Root>
          ) : null}
        </div>

        <Divider.Root className="my-4" />

        {!collapsed ? (
          <div className="mb-2 px-2.5 text-subheading-2xs text-text-soft-400">MAIN</div>
        ) : null}
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavRow key={item.href} item={item} collapsed={collapsed} active={pathname === item.href} />
          ))}
        </nav>

        <div className="flex-1" />

        <nav className="flex flex-col gap-1">
          {FOOTER_ITEMS.map((item) => (
            <NavRow key={item.href} item={item} collapsed={collapsed} active={pathname === item.href} />
          ))}
        </nav>

        <Divider.Root className="my-4" />

        {collapsed ? (
          <CompactButton.Root
            variant="ghost"
            size="medium"
            onClick={toggle}
            aria-label="Expand sidebar"
            className="mb-3 self-center"
          >
            <CompactButton.Icon as={RiMenuUnfoldLine} />
          </CompactButton.Root>
        ) : null}

        <UserMenu session={session} collapsed={collapsed} />
      </aside>
    </Tooltip.Provider>
  );
}

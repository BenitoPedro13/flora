import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getSidebarCollapsed } from "@/lib/sidebar-state";
import { AppSidebar } from "@/components/flora/app-sidebar";

/**
 * The Flora shell (TASK-design-system-shell §2.8): AppSidebar + a fluid
 * content column. Both the session and the sidebar's collapsed state are
 * read server-side so first paint is already correct — no flash, no layout
 * shift (design-spec §10.6).
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const collapsed = await getSidebarCollapsed();

  return (
    <div className="flex h-screen w-full">
      <AppSidebar session={session} defaultCollapsed={collapsed} />
      <div className="flex min-w-0 flex-1 justify-center">
        <div className="w-full max-w-[1110px] px-8">{children}</div>
      </div>
    </div>
  );
}

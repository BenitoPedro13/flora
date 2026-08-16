/**
 * Centred auth shell — no sidebar, no page header. Login is the only route
 * here today; forgot-password and invite-acceptance are undesigned
 * (design-spec gap D13).
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-bg-weak-50 p-8">
      {children}
    </div>
  );
}

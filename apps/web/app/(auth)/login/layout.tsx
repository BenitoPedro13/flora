import { createPageMetadata } from "@/lib/seo/metadata";

export const metadata = createPageMetadata({
  title: "Sign in",
  description: "Sign in to Flora to manage fields, crop stress, tasks, and weather.",
  path: "/login",
  ogImageAlt: "Sign in to Flora",
});

export default function LoginLayout({ children }: LayoutProps<"/">) {
  return children;
}

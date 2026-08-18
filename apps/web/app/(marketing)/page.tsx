import { Hero } from "@/components/flora/landing/hero";
import { Features } from "@/components/flora/landing/features";
import { Footer } from "@/components/flora/landing/footer";
import { createPageMetadata, PUBLIC_ROBOTS } from "@/lib/seo/metadata";
import { MARKETING_DESCRIPTION } from "@/lib/seo/site";

export const metadata = createPageMetadata({
  title: "Regenerative farm operations",
  description: MARKETING_DESCRIPTION,
  path: "/",
  robots: PUBLIC_ROBOTS,
  ogImageAlt: "Flora — regenerative farm operations platform",
});

export default function LandingPage() {
  return (
    // Locked light regardless of the visitor's system theme — see
    // `globals.css`'s `.light-locked` for why (TASK-landing-page).
    <main className="light-locked">
      <Hero />
      <Features />
      <Footer />
    </main>
  );
}

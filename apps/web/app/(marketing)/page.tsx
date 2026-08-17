import { Hero } from "@/components/flora/landing/hero";
import { Features } from "@/components/flora/landing/features";
import { Footer } from "@/components/flora/landing/footer";

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

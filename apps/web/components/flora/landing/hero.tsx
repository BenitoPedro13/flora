import Image from "next/image";
import Link from "next/link";
import * as Button from "@/components/ui/button";
import { AppPreview } from "./app-preview";

/**
 * `2175:15729` in the landing Figma (TASK-landing-page). Two deliberate
 * departures from the design: the "Backed by Y Combinator" badge is dropped
 * (Flora isn't — nothing here fabricates a funding claim), and the app
 * preview below the nav strip is `AppPreview` — the real `components/flora/*`
 * dashboard composites with representative sample data, not a flattened
 * image — instead of the Figma template's generic Energy-dashboard mockup.
 * Energy is explicitly deferred (architecture §4.3) and was never built.
 * The preview nav strip below drops "Energy" for the same reason.
 */
export function Hero() {
  return (
    <div className="relative flex flex-col items-center gap-[53px] overflow-hidden px-8 pb-8 pt-8">
      <div className="absolute inset-x-0 top-0 -z-10 h-[1332px]">
        <Image
          src="/landing/hero-bg.png"
          alt=""
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-white to-white/0 to-[35%]" />
      </div>

      <div className="flex w-full max-w-[1200px] flex-col items-center gap-[53px]">
        <header className="flex w-full items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative size-[42px] shrink-0 overflow-clip rounded-full bg-primary-base">
              <Image src="/landing/logo-leaf.svg" alt="" fill className="p-2" />
            </div>
            <p className="text-title-h6 text-text-strong-950">Flora™</p>
          </Link>

          {/* Use Cases and Blog point at "#" too, not real anchors — both
              sections are deferred (TASK-landing-page §5), same as About Us
              and Contact Us, which have no pages yet either. */}
          <nav className="flex items-center gap-8 text-label-lg text-text-soft-400">
            <a href="#" aria-disabled>
              Use Cases
            </a>
            <a href="#" aria-disabled>
              About Us
            </a>
            <a href="#" aria-disabled>
              Contact Us
            </a>
            <a href="#" aria-disabled>
              Blog
            </a>
          </nav>

          <Button.Root asChild variant="primary" mode="filled" size="medium">
            <Link href="/login">Open App</Link>
          </Button.Root>
        </header>

        <div className="flex w-full max-w-[726px] flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-[27px]">
            <h1 className="max-w-[648px] text-center text-title-h1 text-text-strong-950">
              Sustainability isn&rsquo;t more an option, be regenerative
            </h1>
            <p className="max-w-[498px] text-center text-label-lg text-text-sub-600">
              Our platform empowers agriculture to restore ecosystems, turning your farm into a
              regenerative success story.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button.Root asChild variant="primary" mode="filled" size="medium">
              <Link href="/login">Get Started</Link>
            </Button.Root>
            <Button.Root asChild variant="neutral" mode="stroke" size="medium">
              <a href="#features">Explore Features</a>
            </Button.Root>
          </div>
        </div>

        <div className="flex w-full flex-col items-center justify-center gap-8">
          <div className="flex items-center gap-6 rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 text-label-sm text-text-sub-600">
            <span>Home</span>
            <span>Fields</span>
            <span>Tasks</span>
            <span>Weather</span>
          </div>

          <div className="w-full rounded-[37px] border border-stroke-soft-200 bg-[rgba(253,242,222,0.39)] p-3.5 backdrop-blur-md">
            <AppPreview />
          </div>
        </div>
      </div>
    </div>
  );
}

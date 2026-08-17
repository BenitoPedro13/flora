import Image from "next/image";
import Link from "next/link";

/**
 * `2247:6098` in the landing Figma, deliberately narrowed (TASK-landing-page
 * §5): the design's "Cases" column names four fictional companies
 * (Biosyntesix™, Callgods™, Evergreen™, Kolygari™) as if they were real
 * customers, and its closing line credits the Figma template's own author —
 * neither is true of Flora, so neither ships. Real, working links only.
 */
export function Footer() {
  return (
    <footer className="bg-bg-white-0">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-8 py-12">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative size-[42px] shrink-0 overflow-clip rounded-full bg-primary-base">
              <Image src="/landing/logo-leaf.svg" alt="" fill className="p-2" />
            </div>
            <p className="text-title-h6 text-text-strong-950">Flora™</p>
          </Link>

          <nav className="flex items-center gap-6 text-label-md text-text-sub-600">
            <Link href="/">Home</Link>
            <Link href="/login">Log in</Link>
          </nav>
        </div>

        <p className="text-paragraph-sm text-text-soft-400">
          Flora™ © {new Date().getFullYear()}. All rights reserved.
        </p>
      </div>

      <div className="relative h-[140px] w-full overflow-hidden">
        <Image src="/landing/hero-bg.png" alt="" fill className="object-cover object-bottom" />
      </div>
    </footer>
  );
}

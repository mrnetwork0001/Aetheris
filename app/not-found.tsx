import Link from "next/link";
import { Compass } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/**
 * Root 404. Renders outside the route-group layouts, so it paints its own
 * dark band and `#main` landmark for the skip link.
 */
export default function NotFound() {
  return (
    <main
      id="main"
      className="band band--dark dot-grid flex min-h-screen items-center justify-center"
    >
      <div className="fl-container flex flex-col items-center text-center">
        <Link href="/" aria-label="Aetheris home" className="rounded-[10px]">
          <Logo size={32} />
        </Link>
        <span
          aria-hidden="true"
          className="mt-10 inline-flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#079ab740] bg-[#079ab71f] text-fl-accent"
        >
          <Compass className="h-5 w-5" />
        </span>
        <p className="mono-label mt-6">404 · Not found</p>
        <h1 className="display-2 mt-3 max-w-2xl fg">No agency at that address.</h1>
        <p className="lede mt-4 max-w-xl">
          Nothing on this route - check the agency address or ENS name, or head back to Mission
          Control to watch the agency work.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" href="/dashboard">
            Back to Mission Control
          </Button>
          <Button variant="secondary" href="/">
            Landing page
          </Button>
        </div>
      </div>
    </main>
  );
}

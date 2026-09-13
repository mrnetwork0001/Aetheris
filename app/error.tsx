"use client";

import * as React from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/**
 * Root error boundary. Renders in place of every route-group layout, so it
 * paints its own dark band and `#main` landmark for the skip link.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Surfaced in the server logs / browser console for debugging the demo.
    console.error("[aetheris] route error:", error);
  }, [error]);

  return (
    <main
      id="main"
      className="band band--dark dot-grid flex min-h-screen items-center justify-center"
    >
      <div className="fl-container flex flex-col items-center text-center">
        <Logo size={32} />
        <span
          aria-hidden="true"
          className="mt-10 inline-flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#ef444440] bg-[#ef44441f] text-fl-rose"
        >
          <AlertOctagon className="h-5 w-5" />
        </span>
        <p className="mono-label mt-6">Route error</p>
        <h1 className="display-2 mt-3 max-w-2xl fg">Something broke mid-settlement.</h1>
        <p className="lede mt-4 max-w-xl">
          A data source failed in a way the page could not recover from. The integrations degrade to
          demo fixtures wherever possible - this one did not.
        </p>
        {error.digest ? (
          <p className="mt-4 font-mono text-[0.78rem] tabular-nums fg-3">digest {error.digest}</p>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" onClick={reset}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
          <Button variant="secondary" href="/dashboard">
            Back to Mission Control
          </Button>
        </div>
      </div>
    </main>
  );
}

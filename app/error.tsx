"use client";

import * as React from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
    <div className="aether-container flex min-h-[60vh] items-center justify-center py-20">
      <Card className="max-w-lg p-8 text-center">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-500/10 text-rose-300">
          <AlertOctagon className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-white">Something broke in orbit</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          A data source failed in a way the page could not recover from. The integrations degrade
          to demo fixtures wherever possible — this one did not.
        </p>
        {error.digest ? (
          <p className="mt-3 data-mono text-slate-500">digest {error.digest}</p>
        ) : null}
        <Button className="mt-6" onClick={reset}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </Card>
    </div>
  );
}

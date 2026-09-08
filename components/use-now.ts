"use client";

import * as React from "react";

/**
 * Client-only clock. Starts as `null` so the server-rendered HTML and the first
 * client render agree — relative timestamps only appear after hydration.
 */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}

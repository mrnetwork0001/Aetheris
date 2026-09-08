import Link from "next/link";
import { Compass } from "lucide-react";

import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="aether-container flex min-h-[60vh] items-center justify-center py-20">
      <Card className="max-w-lg p-8 text-center">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-aether-cyan">
          <Compass className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-white">Off the star chart</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          No route matches that address. Head back to mission control to watch the agency work.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-xl border border-white/20 bg-gradient-to-b from-aether-glow to-[#4a58e0] px-5 text-sm font-medium text-white transition hover:brightness-110"
        >
          Open Mission Control
        </Link>
      </Card>
    </div>
  );
}

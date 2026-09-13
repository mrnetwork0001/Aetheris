import * as React from "react";

import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";

export interface AppShellProps {
  agencyAddress: string;
  children: React.ReactNode;
}

/**
 * Black app shell (DESIGN.md §4): sidebar on the left, `#main` landmark on the
 * right. Server component - the interactive pieces are client children.
 */
export function AppShell({ agencyAddress, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-fl-bg text-fl-fg">
      <Sidebar agencyAddress={agencyAddress} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav agencyAddress={agencyAddress} />
        <main id="main" tabIndex={-1} className="flex-1 px-5 py-6 md:px-12 md:py-10">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

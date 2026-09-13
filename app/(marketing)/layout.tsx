import { Footer } from "@/components/marketing/footer";
import { Nav } from "@/components/marketing/nav";

/**
 * Marketing shell: sticky nav, the scooped landing bands, and the dark
 * footer. `#main` is the skip-link target declared in the root layout.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Nav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}

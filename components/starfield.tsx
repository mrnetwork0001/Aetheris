/**
 * Purely decorative deep-space backdrop. CSS-only (no canvas, no rAF) so it
 * costs nothing on low-end devices and respects `prefers-reduced-motion` via
 * the global reset in `app/globals.css`.
 */
export function Starfield() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Base vertical wash */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#05060f_0%,#080b1c_45%,#05060f_100%)]" />

      {/* Nebulae */}
      <div className="absolute -left-[18%] -top-[22%] h-[46rem] w-[46rem] rounded-full bg-aether-glow/[0.13] blur-[140px] animate-breathe" />
      <div
        className="absolute -right-[14%] top-[6%] h-[38rem] w-[38rem] rounded-full bg-aether-cyan/[0.09] blur-[150px] animate-breathe"
        style={{ animationDelay: "-3.5s" }}
      />
      <div
        className="absolute bottom-[-20%] left-[28%] h-[34rem] w-[34rem] rounded-full bg-aether-gold/[0.05] blur-[160px] animate-breathe"
        style={{ animationDelay: "-6s" }}
      />

      {/* Two parallax star layers built from repeating radial gradients */}
      <div
        className="absolute -inset-[30%] opacity-[0.55] animate-drift"
        style={{
          backgroundImage: [
            "radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.9), transparent)",
            "radial-gradient(1px 1px at 63% 8%, rgba(199,214,255,0.8), transparent)",
            "radial-gradient(1.4px 1.4px at 84% 41%, rgba(255,255,255,0.75), transparent)",
            "radial-gradient(1px 1px at 27% 62%, rgba(160,200,255,0.7), transparent)",
            "radial-gradient(1px 1px at 47% 87%, rgba(255,255,255,0.65), transparent)",
            "radial-gradient(1.2px 1.2px at 91% 76%, rgba(255,232,180,0.6), transparent)",
            "radial-gradient(1px 1px at 6% 46%, rgba(255,255,255,0.55), transparent)",
            "radial-gradient(1px 1px at 71% 55%, rgba(190,205,255,0.6), transparent)",
          ].join(","),
          backgroundSize: "520px 520px",
          backgroundRepeat: "repeat",
        }}
      />
      <div
        className="absolute -inset-[30%] opacity-30 animate-drift"
        style={{
          animationDuration: "220s",
          backgroundImage: [
            "radial-gradient(1px 1px at 33% 29%, rgba(255,255,255,0.7), transparent)",
            "radial-gradient(1px 1px at 78% 66%, rgba(56,232,255,0.55), transparent)",
            "radial-gradient(1px 1px at 55% 12%, rgba(255,255,255,0.5), transparent)",
            "radial-gradient(1px 1px at 18% 81%, rgba(109,124,255,0.6), transparent)",
          ].join(","),
          backgroundSize: "310px 310px",
          backgroundRepeat: "repeat",
        }}
      />

      {/* Horizon glow anchoring the fold */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aether-cyan/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-aether-void to-transparent" />
    </div>
  );
}

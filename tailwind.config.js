/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        fl: {
          bg: "#000000",
          card: "#0a0a0a",
          raised: "#111111",
          border: "#1a1a1a",
          borderHi: "#222222",
          fg: "#ffffff",
          fg2: "#999999",
          fg3: "#666666",
          // AA-safe stand-in for fg3 wherever it colours readable text (4.6:1+ on every dark surface).
          dim: "#7d7d7d",
          accent: "#079ab7",
          accentSoft: "#079ab71f",
          // Accent darkened just enough for 4.5:1 with white / on white (small text, filled buttons).
          accentInk: "#047a91",
          accentHover: "#06869e",
          warn: "#f59e0b",
          warnSoft: "#f59e0b1f",
          emerald: "#10b981",
          rose: "#ef4444",
          eco: "#0d0d0d",
          ecoBorder: "#1e1e1e",
        },
        light: {
          bg: "#ffffff",
          heading: "#111111",
          body: "#5b5b5b",
          border: "#0000001a",
          pill: "#0000000a",
        },
      },
      fontFamily: {
        display: [
          "var(--font-montserrat)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "sans-serif",
        ],
        mono: [
          "var(--font-jetbrains)",
          "ui-monospace",
          "SFMono-Regular",
          "SF Mono",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        scoop: "200px",
        "scoop-sm": "96px",
      },
    },
  },
  plugins: [],
};

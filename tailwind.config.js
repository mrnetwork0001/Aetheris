/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        aether: {
          void: "#05060f",
          deep: "#0b1022",
          glow: "#6d7cff",
          cyan: "#38e8ff",
          gold: "#ffc857",
        },
      },
    },
  },
  plugins: [],
};

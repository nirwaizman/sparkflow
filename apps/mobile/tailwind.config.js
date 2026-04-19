/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0b0b0f",
        surface: "#131320",
        surfaceAlt: "#1a1a2b",
        border: "#2a2a3a",
        text: "#f5f5f7",
        muted: "#9ca0b3",
        accent: "#7c5cff",
        accentAlt: "#22d3ee",
        danger: "#ef4444",
      },
    },
  },
  plugins: [],
};

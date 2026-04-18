import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f8ff",
          500: "#3b82f6",
          600: "#2563eb",
          900: "#1e3a8a",
        },
      },
      keyframes: {
        // Used by the message-streaming indicator (3 dots, staggered).
        "pulse-dot": {
          "0%, 80%, 100%": { opacity: "0.2", transform: "scale(0.8)" },
          "40%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

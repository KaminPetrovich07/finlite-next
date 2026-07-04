import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "fl-charcoal": "#14110D",
        "fl-charcoal-2": "#1C1812",
        "fl-gold": "#C9A227",
        "fl-gold-bright": "#E8C547",
        "fl-cream": "#F2EDE4",
        "fl-red": "#B23B3B",
        "fl-green": "#4F7942",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  plugins: [],
};
export default config;

import type { Config } from "tailwindcss";

// Every colour is a CSS variable (see app/globals.css), so the whole app — old
// pages included — follows the light / dark theme without per-page changes.
// Token names are kept from the first dark-only design; read them by role:
//   fl-charcoal   = page background      fl-charcoal-2 = card surface
//   fl-cream      = text ink             fl-gold       = accent text / borders
//   fl-accent     = primary button fill  fl-line       = hairlines
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "fl-charcoal": v("bg"),
        "fl-charcoal-2": v("surface"),
        "fl-surface-2": v("surface-2"),
        "fl-cream": v("ink"),
        "fl-gold": v("gold"),
        "fl-gold-bright": v("gold-strong"),
        "fl-accent": v("accent"),
        "fl-accent-hover": v("accent-hover"),
        "fl-on-accent": v("on-accent"),
        "fl-line": v("line"),
        "fl-red": v("neg"),
        "fl-green": v("pos"),
        "fl-amber": v("warn"),
        "fl-info": v("info"),
      },
      fontFamily: {
        display: ["Manrope", "system-ui", "sans-serif"],
        body: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Sans", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(var(--c-shadow) / 0.06), 0 1px 1px rgb(var(--c-shadow) / 0.04)",
        lift: "0 12px 32px -12px rgb(var(--c-shadow) / 0.28)",
      },
    },
  },
  plugins: [],
};
export default config;

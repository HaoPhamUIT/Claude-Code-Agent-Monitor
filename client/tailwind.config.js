/**
 * @file tailwind.config.js
 * @description Tailwind CSS configuration — content globs and the Pharmacity
 * design tokens. Every color resolves through a CSS variable so one class name
 * renders in both themes: light (default, Pharmacity Dashboard Design System)
 * and dark (`<html data-theme="dark">`). The UI was authored dark-first, so in
 * light mode each Tailwind hue ramp is mirrored (400 → 600, 300 → 700, …) —
 * the "inverted neutral ramp" the design system prescribes — which keeps
 * `text-*-400` labels and `text-gray-100` headings legible on white.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import colors from "tailwindcss/colors";
import plugin from "tailwindcss/plugin";

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const HUES = [
  "gray",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];

/** "#rrggbb" → "r g b" so Tailwind's `/<alpha>` modifiers keep working. */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

// Brand + surface tokens. Light: Pharmacity Dashboard DS (app bg #F3F4F6,
// white paper, #E5E7EB borders) with the logo blue as primary. Dark: the DS
// dark palette (#0A0A0A app, #171717 paper, #262626 dividers).
const TOKENS = {
  light: {
    "surface-0": "#F3F4F6",
    "surface-1": "#FFFFFF",
    "surface-2": "#F9FAFB",
    "surface-3": "#FFFFFF",
    "surface-4": "#F1F5F9",
    "surface-5": "#E5E7EB",
    border: "#E5E7EB",
    "border-light": "#D1D5DB",
    accent: "#0072BC",
    "accent-hover": "#0B86D4",
    brand: "#0072BC",
    "brand-green": "#5FAA46",
  },
  dark: {
    "surface-0": "#0A0A0A",
    "surface-1": "#121212",
    "surface-2": "#1C1C1C",
    "surface-3": "#171717",
    "surface-4": "#222222",
    "surface-5": "#2C2C2C",
    border: "#262626",
    "border-light": "#3F3F46",
    accent: "#3B9BE0",
    "accent-hover": "#64B2EA",
    brand: "#3B9BE0",
    "brand-green": "#7CC35F",
  },
};

function themeVars(theme) {
  const out = {};
  for (const [k, hex] of Object.entries(TOKENS[theme])) out[`--${k}`] = rgb(hex);
  for (const hue of HUES) {
    SHADES.forEach((shade, i) => {
      const src = theme === "light" ? SHADES[SHADES.length - 1 - i] : shade;
      out[`--${hue}-${shade}`] = rgb(colors[hue][src]);
    });
  }
  return out;
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ...Object.fromEntries(
          HUES.map((hue) => [hue, Object.fromEntries(SHADES.map((s) => [s, v(`${hue}-${s}`)]))])
        ),
        surface: Object.fromEntries([0, 1, 2, 3, 4, 5].map((n) => [n, v(`surface-${n}`)])),
        border: {
          DEFAULT: v("border"),
          light: v("border-light"),
        },
        accent: {
          DEFAULT: v("accent"),
          hover: v("accent-hover"),
          muted: "rgb(var(--accent) / 0.15)",
        },
        brand: {
          DEFAULT: v("brand"),
          green: v("brand-green"),
        },
      },
      fontFamily: {
        sans: ["Manrope", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgb(0 0 0 / 0.05)",
        "card-hover": "0 12px 32px rgb(0 0 0 / 0.12)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ":root": { ...themeVars("light"), colorScheme: "light" },
        '[data-theme="dark"]': { ...themeVars("dark"), colorScheme: "dark" },
      });
    }),
  ],
};

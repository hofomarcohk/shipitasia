import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // W6 — Direction A「工場日勤」design tokens (claude-design handoff).
        // Warm-concrete bg × signage black × safety-yellow accent;
        // solid status colours, squared corners, offset solid shadows.
        wms: {
          bg: "#ECEAE6",
          surface: "#FFFFFF",
          "surface-alt": "#F1EFEA",
          border: "#D4D0C8",
          "border-strong": "#C9C5BD",
          ink: "#16181B",
          "ink-2": "#3C4046",
          muted: "#6A6E75",
          faint: "#83878D",
          brand: "#3A6FB5",
          "brand-soft": "#DBE7F5",
          accent: "#F6C945",
          ok: "#1D8A4E",
          "ok-strong": "#157A42",
          "ok-bg": "#DDEFE3",
          "ok-fg": "#157A42",
          warn: "#E07C12",
          "warn-bg": "#FBE9D2",
          "warn-fg": "#C8690A",
          danger: "#CF3326",
          "danger-bg": "#FDF3F2",
          "danger-fg": "#CF3326",
          "info-bg": "#DBE7F5",
          "info-fg": "#2E62A6",
          "purple-bg": "#EDE9FE",
          "purple-fg": "#6D28D9",
          "row-hover": "#F6F4EF",
          "row-select": "#DBE7F5",
          "urgent-amber": "#C8690A",
          // dark signage sidebar / CTA bar
          "side-bg": "#1D1F23",
          "side-ink": "#F2F1EE",
          "side-ink2": "#B6B9BE",
          "side-ink3": "#7D8187",
          "side-sep": "#34373C",
        },
      },
      fontFamily: {
        // W6 — Noto Sans HK body, Archivo display, IBM Plex Mono for IDs.
        wms: [
          "Noto Sans HK",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        "wms-disp": ["Archivo", "Noto Sans HK", "system-ui", "sans-serif"],
        "wms-mono": [
          "IBM Plex Mono",
          "JetBrains Mono",
          "ui-monospace",
          "monospace",
        ],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // WMS NextCTA ready-state pulse (brand-color halo).
        "wms-cta-pulse": {
          "0%, 100%": {
            boxShadow:
              "0 0 0 0 var(--cta-accent-50), 0 6px 20px var(--cta-accent-30)",
          },
          "50%": {
            boxShadow:
              "0 0 0 12px var(--cta-accent-00), 0 8px 22px var(--cta-accent-40)",
          },
        },
        // WMS NextCTA urgent-state pulse (Direction A orange).
        "wms-cta-urgent": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(200, 105, 10, 0.55)" },
          "50%": { boxShadow: "0 0 0 7px rgba(200, 105, 10, 0)" },
        },
        // Scanner red-dot blink.
        "wms-blink": {
          "0%, 55%": { opacity: "1" },
          "70%, 100%": { opacity: "0.25" },
        },
        // Page entry fade.
        "wms-page-fade": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Done-state pop on state flip locked → ready.
        "wms-done-pop": {
          from: { transform: "scale(0.6)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "wms-cta-pulse": "wms-cta-pulse 1.8s ease-in-out infinite",
        "wms-cta-urgent": "wms-cta-urgent 1.4s ease-in-out infinite",
        "wms-blink": "wms-blink 1.4s infinite",
        "wms-page-fade": "wms-page-fade 0.22s ease-out",
        "wms-done-pop":
          "wms-done-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;

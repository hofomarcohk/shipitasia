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
        // P17 WMS redesign tokens (handoff). Hex values match the
        // prototype so the production build matches the design canvas
        // pixel-for-pixel.
        wms: {
          bg: "#F3F4F6",
          surface: "#FFFFFF",
          "surface-alt": "#FAFAFB",
          border: "#E5E7EB",
          "border-strong": "#D4D4D8",
          ink: "#0B0B0F",
          "ink-2": "#27272A",
          muted: "#6B7280",
          faint: "#9CA3AF",
          brand: "#5887C4",
          "brand-soft": "#E8F0FB",
          "ok-bg": "#DCFCE7",
          "ok-fg": "#15803D",
          "warn-bg": "#FEF3C7",
          "warn-fg": "#A16207",
          "danger-bg": "#FEE2E2",
          "danger-fg": "#B91C1C",
          "info-bg": "#DBEAFE",
          "info-fg": "#1D4ED8",
          "purple-bg": "#EDE9FE",
          "purple-fg": "#6D28D9",
          "row-hover": "#F8FAFC",
          "row-select": "#F1F5F9",
          "urgent-amber": "#B45309",
        },
      },
      fontFamily: {
        // WMS redesign — Geist for body, Geist Mono for numbers/code.
        wms: [
          "Geist",
          "Plus Jakarta Sans",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        "wms-mono": [
          "Geist Mono",
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
        // WMS NextCTA urgent-state pulse (amber).
        "wms-cta-urgent": {
          "0%, 100%": { boxShadow: "0 6px 18px rgba(180, 83, 9, 0.25)" },
          "50%": { boxShadow: "0 6px 18px rgba(180, 83, 9, 0.55)" },
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

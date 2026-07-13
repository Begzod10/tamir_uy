import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#1E40AF",
        "brand-light": "#3B63DE",
        "brand-tint": "#EEF2FF",
        orange: "#F97316",
        "orange-tint": "#FFF1E7",
        paper: "#F3F4F6",
        surface: "#FFFFFF",
        success: "#159C5B",
        "success-bright": "#34D399",
        muted: "#6B7280",
        subtle: "#9CA3AF",
        border: "#E5E7EB",
      },
      fontFamily: {
        sans: ["Inter", "SF Pro Display", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        "card-lg": "22px",
        chip: "20px",
        sheet: "28px",
      },
      boxShadow: {
        card: "0 8px 20px -12px rgba(17,24,39,.16)",
        "card-hero": "0 18px 40px -18px rgba(30,64,175,.28)",
        nav: "0 -10px 26px rgba(17,24,39,.06)",
        fab: "0 14px 26px -6px rgba(30,64,175,.6)",
        btn: "0 14px 28px -10px rgba(30,64,175,.55)",
      },
      animation: {
        "pop-in": "popIn 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        "fade-slide": "fadeSlide 0.25s ease-out",
        "slide-up": "slideUp 0.28s cubic-bezier(0.16,1,0.3,1)",
        "scan-sweep": "scanSweep 2.6s linear infinite",
        "pulse-ring": "pulseRing 1.4s ease-out infinite",
      },
      keyframes: {
        popIn: {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        fadeSlide: {
          "0%": { transform: "translateY(-8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scanSweep: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(600%)" },
        },
        pulseRing: {
          "0%": { transform: "scale(1)", opacity: "0.8" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

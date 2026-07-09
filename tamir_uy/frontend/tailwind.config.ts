import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#D85A30",
        paper: "#F6F4EF",
        success: "#1D9E75",
        blueprint: "#185FA5",
        surface: "#FFFFFF",
        muted: "#6B7280",
        "amber-warn": "#F59E0B",
      },
      fontFamily: {
        sans: ["Manrope", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
        chip: "20px",
      },
      animation: {
        "pop-in": "popIn 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        "count-up": "countUp 0.7s ease-out",
        "fade-slide": "fadeSlide 0.25s ease-out",
      },
      keyframes: {
        popIn: {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        countUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeSlide: {
          "0%": { transform: "translateY(-8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

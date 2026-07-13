import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function LidarPage() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          return 100;
        }
        return p + 1;
      });
    }, 80);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress === 100) {
      const t = setTimeout(() => navigate("/wizard"), 800);
      return () => clearTimeout(t);
    }
  }, [progress, navigate]);

  const C = 2 * Math.PI * 52;
  const offset = C * (1 - progress / 100);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "radial-gradient(ellipse at center, #1A2230 0%, #0B0E13 100%)" }}
    >
      {/* Faint grid */}
      <svg className="absolute inset-0 w-full h-full opacity-10" aria-hidden="true">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#34D399" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)"/>
      </svg>

      {/* Scan sweep line */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute left-0 right-0"
          style={{
            background: "linear-gradient(to bottom, transparent, rgba(52,211,153,0.6) 50%, transparent)",
            height: 60,
            animation: "scanSweep 2.6s linear infinite",
          }}
        />
      </div>

      {/* Corner brackets */}
      {(["top-16 left-5", "top-16 right-5 rotate-90", "bottom-40 left-5 -rotate-90", "bottom-40 right-5 rotate-180"] as const).map((pos, i) => (
        <svg
          key={i}
          className={`absolute ${pos} w-9 h-9`}
          viewBox="0 0 34 34"
          fill="none"
          aria-hidden="true"
        >
          <path d="M2 14 L2 2 L14 2" stroke="#34D399" strokeWidth="3" strokeLinecap="round"/>
        </svg>
      ))}

      {/* Close button */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-14 left-5 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}
        aria-label="Yopish"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
          <path d="M2 2l12 12M14 2L2 14"/>
        </svg>
      </button>

      {/* Progress ring */}
      <div className="relative flex items-center justify-center mb-8">
        <svg width="120" height="120" viewBox="0 0 120 120" aria-label={`${progress}% skanerlandi`}>
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="6"/>
          <circle
            cx="60" cy="60" r="52"
            fill="none"
            stroke="#34D399"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            transform="rotate(-90 60 60)"
            style={{ transition: "stroke-dashoffset 0.1s linear" }}
          />
        </svg>
        <span className="absolute text-[30px] font-extrabold text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
          {progress}%
        </span>
      </div>

      {/* Pulsing text */}
      <p
        className="text-[18px] font-bold text-white mb-8"
        style={{ animation: "pulse 1.5s ease-in-out infinite" }}
      >
        {progress === 100 ? "Tayyor! ✓" : "Skanerlanyapti..."}
      </p>

      {/* Bottom hint */}
      <div
        className="absolute bottom-12 flex items-center gap-2 px-4 py-2 rounded-full"
        style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5">
          <path d="M8 1v6M8 13v2M1 8h2M13 8h2" strokeLinecap="round"/>
          <circle cx="8" cy="8" r="3" stroke="white"/>
        </svg>
        <span className="text-white text-[13px] font-medium">Telefonni sekin harakatlantiring</span>
      </div>
    </div>
  );
}

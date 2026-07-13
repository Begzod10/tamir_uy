import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

type PointState = "captured" | "current" | "remaining";

const INITIAL_POINTS: PointState[] = [
  "captured",
  "captured",
  "captured",
  "current",
  "remaining",
  "remaining",
  "remaining",
  "remaining",
];

const POINT_ANGLES = [270, 315, 0, 45, 90, 135, 180, 225];

function ellipsePoint(deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: 170 + 150 * Math.cos(rad), y: 120 + 58 * Math.sin(rad) };
}

export default function Photo360Page() {
  const navigate = useNavigate();
  const [points, setPoints] = useState<PointState[]>(INITIAL_POINTS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, []);

  const currentIdx = points.findIndex((p) => p === "current");
  const capturedCount = points.filter((p) => p === "captured").length;

  function handleCapture() {
    if (currentIdx === -1) return;
    const next = [...points];
    next[currentIdx] = "captured";
    const nextTarget = next.findIndex((p) => p === "remaining");
    if (nextTarget !== -1) {
      next[nextTarget] = "current";
      setPoints(next);
    } else {
      setPoints(next.map(() => "captured" as PointState));
      timerRef.current = setTimeout(() => navigate("/wizard"), 800);
    }
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center overflow-hidden"
      style={{ background: "radial-gradient(ellipse at center, #1A2230 0%, #0B0E13 100%)" }}
    >
      {/* Close */}
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

      {/* Top pill */}
      <div
        className="absolute top-14 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full"
        style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5">
          <circle cx="8" cy="8" r="7"/>
          <path d="M8 4v1M8 11v1M4 8H3M13 8h-1" strokeLinecap="round"/>
          <path d="M10 6L8 8l-2-2" stroke="#34D399" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span className="text-white text-[14px] font-semibold">{capturedCount}/8 nuqta</span>
      </div>

      {/* Guide ring */}
      <div className="flex-1 flex items-center justify-center w-full">
        <svg width="340" height="240" viewBox="0 0 340 240" aria-label="360° nuqtalar xaritasi">
          <ellipse
            cx="170" cy="120" rx="150" ry="58"
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />
          {points.map((state, i) => {
            const { x, y } = ellipsePoint(POINT_ANGLES[i]);
            if (state === "captured") {
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r="13" fill="#159C5B" filter="url(#glow)"/>
                  <path d={`M${x-5} ${y} l4 4 7-7`} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </g>
              );
            }
            if (state === "current") {
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r="18" fill="rgba(249,115,22,0.25)" style={{ animation: "pulse 1.4s ease-out infinite" }}/>
                  <circle cx={x} cy={y} r="13" fill="#F97316"/>
                  <path d={`M${x} ${y-6} L${x} ${y+6} M${x-5} ${y-2} L${x} ${y-6} L${x+5} ${y-2}`} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </g>
              );
            }
            return <circle key={i} cx={x} cy={y} r="10" fill="rgba(255,255,255,0.2)"/>;
          })}
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
        </svg>
      </div>

      {/* Hint */}
      <div
        className="flex items-center gap-2 px-4 py-2 rounded-full mb-6"
        style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="1.5">
          <path d="M7 1v5M7 12v2M3 5l4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-white text-[13px] font-medium">Telefonni keyingi nuqtaga burang</span>
      </div>

      {/* Shutter */}
      <button
        onClick={handleCapture}
        className="mb-14 flex items-center gap-3 px-6 py-3 bg-white rounded-[18px] shadow-lg active:scale-95 transition-transform"
        aria-label="Suratga olish"
      >
        <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: "#F97316" }}/>
        <span className="text-[16px] font-bold text-gray-900">Suratga olish</span>
      </button>
    </div>
  );
}

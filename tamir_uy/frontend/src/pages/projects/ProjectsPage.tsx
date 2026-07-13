import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getApartments } from "@/lib/api";
import type { Apartment } from "@/lib/api";

// ─── Stage Hero Card ──────────────────────────────────────────────────────────

const STAGES = [
  "Korobka", "Suvoq", "Shpaklovka", "Bo'yoq / Oboi",
  "Pol yotqizish", "Elektr / Santexnika", "Mebel", "Tayyor",
];

function HeroCard({ apartment }: { apartment?: Apartment }) {
  const [activeStage, setActiveStage] = useState(0);
  const navigate = useNavigate();

  const firstRoom = apartment?.rooms?.[0];

  return (
    <div
      className="rounded-[22px] border border-[#E7ECFA] p-4 mb-5"
      style={{
        background: "linear-gradient(158deg,#EEF2FF,#F4F6FB,#F3F4F6)",
      }}
    >
      {/* 3D room placeholder */}
      <div className="rounded-2xl bg-[#EEF1F7] h-48 flex items-center justify-center mb-4 overflow-hidden relative">
        {apartment ? (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="160" height="120" viewBox="0 0 160 120" fill="none">
                <polygon points="80,10 150,50 150,110 80,110 10,110 10,50" fill="#C9CFDD" stroke="#A0AAC0" strokeWidth="1.5"/>
                <polygon points="80,10 150,50 80,50" fill="#D8DEE9" stroke="#A0AAC0" strokeWidth="1.5"/>
                <polygon points="80,10 10,50 80,50" fill="#BFC8D9" stroke="#A0AAC0" strokeWidth="1.5"/>
                <rect x="65" y="80" width="30" height="30" fill="#A0B4D6" rx="2"/>
                <rect x="30" y="65" width="22" height="18" fill="#B8C8E8" rx="2"/>
                <rect x="108" y="65" width="22" height="18" fill="#B8C8E8" rx="2"/>
              </svg>
            </div>
            <div
              className="absolute bottom-0 left-0 right-0 rounded-b-2xl px-3 py-2.5 flex items-center justify-between"
              style={{ background: "rgba(17,24,39,.72)", backdropFilter: "blur(8px)" }}
            >
              <div>
                <p className="text-white text-base font-bold leading-tight">{apartment.name}</p>
                <p className="text-[12px] mt-0.5" style={{ color: "#C7D0E0" }}>
                  {apartment.rooms?.[0]
                    ? `${apartment.rooms[0].name}`
                    : "Xona yo'q"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-white/60 text-[11px]">Yaratilgan</p>
                <p className="text-white text-[11px] font-semibold">
                  {new Date(apartment.created_at).toLocaleDateString("uz-UZ")}
                </p>
              </div>
            </div>
          </>
        ) : (
          <svg width="160" height="120" viewBox="0 0 160 120" fill="none">
            <polygon points="80,10 150,50 150,110 80,110 10,110 10,50" fill="#C9CFDD" stroke="#A0AAC0" strokeWidth="1.5"/>
            <polygon points="80,10 150,50 80,50" fill="#D8DEE9" stroke="#A0AAC0" strokeWidth="1.5"/>
            <polygon points="80,10 10,50 80,50" fill="#BFC8D9" stroke="#A0AAC0" strokeWidth="1.5"/>
          </svg>
        )}
      </div>

      {/* Stage dots */}
      <div className="flex items-center gap-2 mb-3">
        {STAGES.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveStage(i)}
            className={`transition-all ${
              i === activeStage
                ? "w-6 h-2 rounded-full bg-brand"
                : "w-2 h-2 rounded-full bg-gray-300"
            }`}
          />
        ))}
      </div>

      {/* Stage info + play button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] text-muted font-semibold">
            Bosqich {activeStage + 1} / {STAGES.length}
          </p>
          <p className="text-base font-bold text-gray-900 mt-0.5">
            {activeStage + 1}-bosqich: {STAGES[activeStage]}
          </p>
        </div>
        <button
          onClick={() => firstRoom && navigate(`/studio/${firstRoom.id}/ichkarida`)}
          className="w-11 h-11 rounded-full bg-brand flex items-center justify-center flex-shrink-0"
          style={{ boxShadow: "0 14px 28px -10px rgba(30,64,175,.55)" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M6 4l8 5-8 5V4z" fill="white"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ apt }: { apt: Apartment }) {
  const navigate = useNavigate();
  const firstRoom = apt.rooms?.[0];

  return (
    <div className="flex items-center gap-3 bg-white border border-[#EEF0F4] rounded-[18px] p-3">
      <div className="w-14 h-14 rounded-xl bg-[#EEF1F7] flex-shrink-0 flex items-center justify-center">
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <polygon points="18,4 32,12 32,30 18,30 4,30 4,12" fill="#C9CFDD"/>
          <polygon points="18,4 32,12 18,12" fill="#D8DEE9"/>
          <polygon points="18,4 4,12 18,12" fill="#BFC8D9"/>
          <rect x="14" y="20" width="8" height="10" fill="#A0B4D6" rx="1"/>
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold text-gray-900 truncate">{apt.name}</p>
        <p className="text-[12px] text-muted mt-0.5">
          {new Date(apt.created_at).toLocaleDateString("uz-UZ")}
          {apt.rooms && apt.rooms.length > 0 && ` · ${apt.rooms.length} xona`}
        </p>
      </div>
      <button
        onClick={() => firstRoom && navigate(`/studio/${firstRoom.id}/ichkarida`)}
        className="px-3 py-1.5 rounded-xl text-[13px] font-bold text-brand flex-shrink-0"
        style={{ background: "#EEF2FF" }}
      >
        Ochish
      </button>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyProjects() {
  return (
    <div
      className="rounded-[20px] p-8 flex flex-col items-center text-center"
      style={{ border: "2px dashed #D6DAE2", background: "#FBFCFD" }}
    >
      <div className="w-14 h-14 rounded-2xl bg-[#F3F4F6] flex items-center justify-center mb-3">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
          <path d="M22 19.5H6a2 2 0 01-2-2V8a2 2 0 012-2h4l2 3h10a2 2 0 012 2v8.5a2 2 0 01-2 2z"/>
        </svg>
      </div>
      <p className="text-[14px] text-muted">
        Hali loyiha yo'q — pastdagi{" "}
        <span className="font-bold text-brand">+</span> tugmasini bosing
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { data: apartments = [], isLoading } = useQuery({
    queryKey: ["apartments"],
    queryFn: async () => {
      try {
        return await getApartments();
      } catch (err) {
        if (err instanceof Error && err.message === "Unauthorized") return [];
        throw err;
      }
    },
    retry: false,
  });

  const latest = apartments[0];

  return (
    <div className="min-h-screen bg-paper px-5 pt-12 pb-4">
      {/* Greeting row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[15px] text-muted font-medium">Xush kelibsiz</p>
          <p className="text-[25px] font-extrabold text-gray-900">Salom! 👋</p>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-[14px]"
          style={{ background: "#F3F4F6" }}
        >
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#F97316" }} />
          <span className="text-[14px] font-bold text-brand">UyRemont</span>
        </div>
      </div>

      {/* Hero card */}
      {isLoading ? (
        <div className="rounded-[22px] bg-gray-200 h-64 animate-pulse mb-5" />
      ) : (
        <HeroCard apartment={latest} />
      )}

      {/* Project list header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[17px] font-extrabold text-gray-900">Mening loyihalarim</h2>
        {apartments.length > 0 && (
          <button className="text-[13px] font-semibold text-brand">Barchasi</button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-[18px] animate-pulse" />
          ))}
        </div>
      ) : apartments.length === 0 ? (
        <EmptyProjects />
      ) : (
        <div className="flex flex-col gap-3">
          {apartments.map((apt) => (
            <ProjectCard key={apt.id} apt={apt} />
          ))}
        </div>
      )}
    </div>
  );
}

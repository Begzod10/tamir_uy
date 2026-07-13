import { useState } from "react";
import { useRoomStore } from "@/store/roomStore";

type Section = "wallpaper" | "lyustra" | "furniture";
type RoomTab = "Mehmonxona" | "Oshxona" | "Yotoqxona" | "Vanna";

interface AddObjectSheetProps {
  onClose: () => void;
  initialSection?: Section;
}

const WALLPAPER_SWATCHES = [
  { label: "Ko'k",    color: "#3B63DE" },
  { label: "Bej",     color: "#E8D9C0" },
  { label: "Siren",   color: "#C4A0D4" },
  { label: "Zaytun",  color: "#8FAD6A" },
  { label: "Naqsh",   color: "pattern" },
] as const;

const LYUSTRA_ITEMS = [
  { id: "lyustra_modern",   name: "Modern",     price: "250 000", bg: "#FFF1E7" },
  { id: "lyustra_klassik",  name: "Klassik",    price: "180 000", bg: "#EEF2FF" },
  { id: "lyustra_led",      name: "LED Panel",  price: "95 000",  bg: "#EAF7F0" },
];

const FURNITURE_BY_ROOM: Record<RoomTab, Array<{ id: string; name: string; size: string }>> = {
  Mehmonxona: [
    { id: "sofa",    name: "Divan",        size: "2.2 × 0.9 m" },
    { id: "coffee",  name: "Jurnal stol",  size: "1.0 × 0.6 m" },
    { id: "tv",      name: "TV stend",     size: "1.8 × 0.45 m" },
  ],
  Oshxona: [
    { id: "table",   name: "Ovqat stoli",  size: "1.2 × 0.8 m" },
    { id: "cabinet", name: "Shkaf",        size: "0.6 × 0.6 m" },
  ],
  Yotoqxona: [
    { id: "bed",      name: "Karavot",      size: "2.0 × 1.8 m" },
    { id: "wardrobe", name: "Kiyim shkafi", size: "2.0 × 0.6 m" },
  ],
  Vanna: [
    { id: "bath",    name: "Vanna",        size: "1.7 × 0.75 m" },
    { id: "toilet",  name: "Unitas",       size: "0.7 × 0.4 m" },
  ],
};

const ROOM_TABS: RoomTab[] = ["Mehmonxona", "Oshxona", "Yotoqxona", "Vanna"];

const SECTION_TABS: { key: Section; label: string }[] = [
  { key: "wallpaper", label: "Devor" },
  { key: "lyustra",   label: "Chiroq" },
  { key: "furniture", label: "Mebel" },
];

function LyustraIcon({ bg }: { bg: string }) {
  return (
    <div className="h-24 rounded-2xl flex items-center justify-center mb-2" style={{ background: bg }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <ellipse cx="20" cy="18" rx="8" ry="5" stroke="#1E40AF" strokeWidth="1.8" fill="#EEF2FF"/>
        <path d="M20 23v10" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="20" cy="14" r="3" fill="#FDE68A" stroke="#F59E0B" strokeWidth="1.2"/>
        <path d="M14 30h12" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
        {[13, 17, 23, 27].map((x) => (
          <line key={x} x1={x} y1="30" x2={x} y2="35" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
        ))}
      </svg>
    </div>
  );
}

export function AddObjectSheet({ onClose, initialSection = "wallpaper" }: AddObjectSheetProps) {
  const [section, setSection] = useState<Section>(initialSection);
  const [roomTab, setRoomTab] = useState<RoomTab>("Mehmonxona");
  const [selectedSwatch, setSelectedSwatch] = useState<string | null>(null);
  const { setWallCovering } = useRoomStore();

  function applyWallpaper() {
    if (!selectedSwatch) return;
    const swatch = WALLPAPER_SWATCHES.find((s) => s.label === selectedSwatch);
    if (!swatch) return;
    if (swatch.color === "pattern") {
      setWallCovering("ALL", { kind: "oboy", patternId: "stripes", baseColor: "#E8D9C0", accentColor: "#C4A0D4" });
    } else {
      setWallCovering("ALL", { kind: "paint", color: swatch.color });
    }
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[rgba(17,24,39,.45)] backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white animate-slide-up flex flex-col"
        style={{ borderRadius: "28px 28px 0 0", maxHeight: "72vh" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-11 h-1.5 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
          <h2 className="text-[20px] font-extrabold text-gray-900">Buyum qo'shish</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
            aria-label="Yopish"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13"/>
            </svg>
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-2 px-5 pb-3 flex-shrink-0">
          {SECTION_TABS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`px-4 py-1.5 rounded-full text-[14px] font-semibold transition-colors ${
                section === s.key ? "bg-brand text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">

          {/* ── Wallpaper section ─────────────────────────────────────── */}
          {section === "wallpaper" && (
            <div>
              <p className="text-[13px] text-muted mb-3">Barcha devorlar uchun rang</p>
              <div className="flex gap-3 flex-wrap">
                {WALLPAPER_SWATCHES.map((sw) => (
                  <button
                    key={sw.label}
                    onClick={() => setSelectedSwatch(sw.label)}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div
                      className={`w-14 h-14 rounded-2xl border-[3px] transition-all active:scale-95 ${
                        selectedSwatch === sw.label ? "border-brand shadow-btn" : "border-gray-200"
                      }`}
                      style={{
                        background:
                          sw.color === "pattern"
                            ? "repeating-linear-gradient(45deg,#E8D9C0 0,#E8D9C0 4px,#C4A0D4 4px,#C4A0D4 8px)"
                            : sw.color,
                      }}
                    />
                    <span className="text-[11px] font-semibold text-gray-700">{sw.label}</span>
                  </button>
                ))}
              </div>
              {selectedSwatch && (
                <button
                  onClick={applyWallpaper}
                  className="mt-5 w-full py-3 bg-brand text-white rounded-[18px] font-bold text-[16px] active:scale-[0.98] transition-transform"
                >
                  Qo'llash
                </button>
              )}
            </div>
          )}

          {/* ── Lyustra section ───────────────────────────────────────── */}
          {section === "lyustra" && (
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: "x mandatory" }}>
              {LYUSTRA_ITEMS.map((item) => (
                <div
                  key={item.id}
                  className="flex-shrink-0 w-40 bg-[#F7F8FA] rounded-[20px] p-3 border border-gray-100"
                  style={{ scrollSnapAlign: "start" }}
                >
                  <LyustraIcon bg={item.bg} />
                  <p className="text-[14px] font-bold text-gray-900">{item.name}</p>
                  <p className="text-[12px] text-muted mt-0.5">{item.price} so'm</p>
                  <button className="mt-2 w-full py-1.5 bg-brand text-white rounded-xl text-[13px] font-semibold active:scale-95 transition-transform">
                    Qo'shish
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Furniture section ─────────────────────────────────────── */}
          {section === "furniture" && (
            <div>
              <div className="flex gap-2 mb-4 overflow-x-auto">
                {ROOM_TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setRoomTab(tab)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                      roomTab === tab ? "bg-brand-tint text-brand" : "bg-gray-100 text-muted"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                {FURNITURE_BY_ROOM[roomTab].map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 bg-[#F7F8FA] rounded-[16px]"
                  >
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="14" rx="2"/>
                        <path d="M16 7V5a2 2 0 00-8 0v2"/>
                        <line x1="12" y1="12" x2="12" y2="16"/>
                        <line x1="10" y1="14" x2="14" y2="14"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-bold text-gray-900">{item.name}</p>
                      <p className="text-[12px] text-muted">{item.size}</p>
                    </div>
                    <button className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center flex-shrink-0 font-bold text-xl active:scale-90 transition-transform">
                      +
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

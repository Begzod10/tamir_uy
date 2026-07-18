import { useRoomStore } from "@/store/roomStore";
import type { WallElement } from "@/store/roomStore";

const WALL_LABELS: Record<string, string> = {
  A: "Devor A (uzunlik)",
  B: "Devor B (kenglik)",
  C: "Devor C (uzunlik)",
  D: "Devor D (kenglik)",
};

const DEFAULT_WINDOW = { type: "deraza" as const, width: 900, height: 1200, sill_height: 800, position: 0 };
const DEFAULT_DOOR   = { type: "eshik"  as const, width: 900, height: 2100, sill_height: 0,   position: 0 };

function MiniStepper({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        className="w-6 h-6 rounded-full bg-[#EDEEF1] text-gray-600 text-base font-bold flex items-center justify-center leading-none"
      >
        −
      </button>
      <span className="text-[12px] font-bold text-gray-800 w-12 text-center">
        {(value / 1000).toFixed(2)} m
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        className="w-6 h-6 rounded-full bg-[#EDEEF1] text-gray-600 text-base font-bold flex items-center justify-center leading-none"
      >
        +
      </button>
    </div>
  );
}

function DimStepper({
  label,
  sub,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  sub?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#EDEEF1] last:border-0">
      <div>
        <p className="text-[14px] font-semibold text-gray-800">{label}</p>
        {sub && <p className="text-[11px] text-muted">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className="w-8 h-8 rounded-full bg-[#EDEEF1] text-gray-700 text-lg font-bold flex items-center justify-center"
        >
          −
        </button>
        <span className="text-[15px] font-bold text-gray-900 w-14 text-center">
          {(value / 1000).toFixed(1)} m
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          className="w-8 h-8 rounded-full bg-[#EDEEF1] text-gray-700 text-lg font-bold flex items-center justify-center"
        >
          +
        </button>
      </div>
    </div>
  );
}

function ElementRow({
  wallId,
  el,
}: {
  wallId: string;
  el: WallElement;
}) {
  const updateElement = useRoomStore((s) => s.updateElement);
  const removeElement = useRoomStore((s) => s.removeElement);
  const isWindow = el.type === "deraza";

  return (
    <div className="py-3 border-b border-[#EDEEF1] last:border-0">
      {/* Top row: icon + name + delete */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[18px]">{isWindow ? "🪟" : "🚪"}</span>
          <p className="text-[13px] font-semibold text-gray-800">
            {isWindow ? "Deraza" : "Eshik"}
          </p>
        </div>
        <button
          onClick={() => removeElement(wallId, el.id)}
          className="text-[12px] font-semibold text-red-500 px-3 py-1 rounded-xl bg-red-50"
        >
          O'chirish
        </button>
      </div>

      {/* Dimension steppers */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted font-semibold uppercase tracking-wide">Kenglik</span>
          <MiniStepper
            value={el.width}
            onChange={(v) => updateElement(wallId, el.id, { width: v })}
            min={400} max={3000} step={100}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted font-semibold uppercase tracking-wide">Balandlik</span>
          <MiniStepper
            value={el.height}
            onChange={(v) => updateElement(wallId, el.id, { height: v })}
            min={400} max={3000} step={100}
          />
        </div>
        {isWindow && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted font-semibold uppercase tracking-wide">Poldan</span>
            <MiniStepper
              value={el.sill_height}
              onChange={(v) => updateElement(wallId, el.id, { sill_height: v })}
              min={0} max={2000} step={100}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function RoomSettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const geometry     = useRoomStore((s) => s.geometry);
  const ceilingHeight = useRoomStore((s) => s.ceilingHeight);
  const setWallLength = useRoomStore((s) => s.setWallLength);
  const setCeilingH   = useRoomStore((s) => s.setCeilingHeight);
  const addElement    = useRoomStore((s) => s.addElement);

  const wallA = geometry.walls.find((w) => w.id === "A")?.length ?? 4000;
  const wallB = geometry.walls.find((w) => w.id === "B")?.length ?? 3000;

  function setLength(axis: "AC" | "BD", val: number) {
    if (axis === "AC") { setWallLength("A", val); setWallLength("C", val); }
    else               { setWallLength("B", val); setWallLength("D", val); }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: "rgba(0,0,0,.35)" }}
      onClick={onClose}
    >
      <div
        className="w-full bg-white rounded-t-[24px] shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-5 pb-10">
          {/* header */}
          <div className="flex items-center justify-between py-3 mb-1">
            <h2 className="text-[18px] font-extrabold text-gray-900">Xona sozlamalari</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center text-gray-500 text-[13px] font-bold"
            >
              ✕
            </button>
          </div>

          {/* ── Room dimensions ──────────────────────────────── */}
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">
            O'lchamlar
          </p>
          <div className="bg-[#F9FAFB] rounded-2xl px-4 mb-5">
            <DimStepper
              label="Uzunlik" sub="A – C devorlar"
              value={wallA} onChange={(v) => setLength("AC", v)}
              min={1000} max={15000} step={100}
            />
            <DimStepper
              label="Kenglik" sub="B – D devorlar"
              value={wallB} onChange={(v) => setLength("BD", v)}
              min={1000} max={15000} step={100}
            />
            <DimStepper
              label="Shift balandligi"
              value={ceilingHeight} onChange={setCeilingH}
              min={2000} max={4500} step={100}
            />
          </div>

          {/* ── Windows & Doors ──────────────────────────────── */}
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">
            Derazalar va Eshiklar
          </p>
          <div className="space-y-3">
            {geometry.walls.map((wall) => (
              <div key={wall.id} className="bg-[#F9FAFB] rounded-2xl px-4 py-3">
                <p className="text-[13px] font-bold text-gray-600 mb-1">
                  {WALL_LABELS[wall.id] ?? `Devor ${wall.id}`}
                </p>

                {wall.elements.length === 0 && (
                  <p className="text-[12px] text-muted mb-2">Element yo'q</p>
                )}

                {wall.elements.map((el) => (
                  <ElementRow key={el.id} wallId={wall.id} el={el} />
                ))}

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => addElement(wall.id, DEFAULT_WINDOW)}
                    className="flex-1 py-2 rounded-xl text-[13px] font-bold text-brand bg-brand-tint"
                  >
                    + Deraza
                  </button>
                  <button
                    onClick={() => addElement(wall.id, DEFAULT_DOOR)}
                    className="flex-1 py-2 rounded-xl text-[13px] font-bold text-gray-700 bg-[#EDEEF1]"
                  >
                    + Eshik
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

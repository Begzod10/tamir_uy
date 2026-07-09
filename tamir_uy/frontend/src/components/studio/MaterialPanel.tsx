import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMaterials } from "@/lib/api";
import { uz } from "@/locale/uz";
import { cn } from "@/lib/utils";
import type { Material } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type PanelTab = "boyoq" | "oboy" | "pol" | "mebel";

interface MaterialPanelProps {
  activeSurface: string | null;
  selectedMaterialId: string | null;
  onApply: (material: Material) => void;
  onClose: () => void;
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { key: PanelTab; label: string; category: string }[] = [
  { key: "boyoq", label: "Bo'yoq", category: "boyoq" },
  { key: "oboy", label: "Oboy", category: "oboy" },
  { key: "pol", label: "Pol", category: "laminat" },
  { key: "mebel", label: "Mebel", category: "mebel" },
];

// ─── Material item ────────────────────────────────────────────────────────────

function MaterialItem({
  material,
  isSelected,
  onSelect,
}: {
  material: Material;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const color = material.image_url?.startsWith("#") ? material.image_url : "#CCCCCC";

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-card border-2 transition-all text-left",
        isSelected
          ? "border-brand bg-brand/5 shadow-sm"
          : "border-transparent hover:border-gray-200 hover:bg-gray-50",
      )}
    >
      {/* Color swatch */}
      <div
        className="w-8 h-8 rounded-card border border-gray-200 flex-shrink-0"
        style={{
          backgroundColor: color,
          backgroundImage: !material.image_url?.startsWith("#") && material.image_url
            ? `url(${material.image_url})`
            : undefined,
          backgroundSize: "cover",
        }}
      />

      {/* Name + price */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{material.name}</p>
        <p className="text-xs text-muted">
          {Math.round(material.price_per_unit / 100).toLocaleString("uz-UZ")} soʻm/{material.unit}
        </p>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <span className="text-brand text-xs font-bold flex-shrink-0">✓</span>
      )}
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function MaterialPanel({
  activeSurface,
  selectedMaterialId,
  onApply,
  onClose,
}: MaterialPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("boyoq");
  const [pendingMaterial, setPendingMaterial] = useState<Material | null>(null);

  const currentCategory = TABS.find((t) => t.key === activeTab)?.category ?? "boyoq";

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["materials", currentCategory],
    queryFn: () => getMaterials({ category: currentCategory }),
  });

  function handleApply() {
    if (!pendingMaterial) return;
    onApply(pendingMaterial);
    setPendingMaterial(null);
  }

  return (
    <>
      {/* Desktop: right-side drawer */}
      <div className="hidden lg:flex flex-col w-80 h-full bg-surface border-l border-gray-200">
        <PanelContent
          activeSurface={activeSurface}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          materials={materials}
          isLoading={isLoading}
          selectedMaterialId={selectedMaterialId}
          pendingMaterial={pendingMaterial}
          setPendingMaterial={setPendingMaterial}
          onApply={handleApply}
          onClose={onClose}
        />
      </div>

      {/* Mobile: bottom sheet */}
      <div className="flex lg:hidden">
        <MobileBottomPanel
          activeSurface={activeSurface}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          materials={materials}
          isLoading={isLoading}
          selectedMaterialId={selectedMaterialId}
          pendingMaterial={pendingMaterial}
          setPendingMaterial={setPendingMaterial}
          onApply={handleApply}
          onClose={onClose}
        />
      </div>
    </>
  );
}

// ─── Shared panel content ─────────────────────────────────────────────────────

interface PanelContentProps {
  activeSurface: string | null;
  activeTab: PanelTab;
  setActiveTab: (tab: PanelTab) => void;
  materials: Material[];
  isLoading: boolean;
  selectedMaterialId: string | null;
  pendingMaterial: Material | null;
  setPendingMaterial: (m: Material | null) => void;
  onApply: () => void;
  onClose: () => void;
}

function PanelContent({
  activeSurface,
  activeTab,
  setActiveTab,
  materials,
  isLoading,
  selectedMaterialId,
  pendingMaterial,
  setPendingMaterial,
  onApply,
  onClose,
}: PanelContentProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Material tanlash</h3>
          {activeSurface && (
            <p className="text-xs text-muted">{activeSurface}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-gray-900 transition-colors text-lg"
          aria-label={uz.common.yopish}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              activeTab === tab.key
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-gray-900",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Material list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 bg-gray-100 rounded-card animate-pulse"
            />
          ))}

        {!isLoading && materials.length === 0 && (
          <p className="text-center text-muted text-sm py-8">
            {uz.empty.material_yoq}
          </p>
        )}

        {!isLoading &&
          materials.map((m) => (
            <MaterialItem
              key={m.id}
              material={m}
              isSelected={
                pendingMaterial?.id === m.id || (!pendingMaterial && selectedMaterialId === m.id)
              }
              onSelect={() => setPendingMaterial(m)}
            />
          ))}
      </div>

      {/* Apply button */}
      <div className="px-4 py-3 border-t border-gray-200 flex-shrink-0">
        <button
          onClick={onApply}
          disabled={!pendingMaterial}
          className="w-full bg-brand text-white py-2.5 rounded-card text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-40"
        >
          {uz.studio.qollash}
        </button>
      </div>
    </>
  );
}

// ─── Mobile bottom panel ──────────────────────────────────────────────────────

function MobileBottomPanel(props: PanelContentProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface rounded-t-2xl shadow-2xl border-t border-gray-200 flex flex-col max-h-[70vh]">
      {/* Grab handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>
      <PanelContent {...props} />
    </div>
  );
}

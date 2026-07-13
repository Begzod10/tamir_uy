import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMaterials, getStores } from "@/lib/api";
import type { Material, Store } from "@/lib/api";

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "all",        label: "Barchasi",   emoji: "🏪" },
  { id: "boyoq",      label: "Bo'yoq",     emoji: "🎨" },
  { id: "oboy",       label: "Oboy",       emoji: "🖼️" },
  { id: "eshik",      label: "Eshiklar",   emoji: "🚪" },
  { id: "deraza",     label: "Derazalar",  emoji: "🪟" },
  { id: "laminat",    label: "Laminat",    emoji: "🪵" },
  { id: "parket",     label: "Parket",     emoji: "🪵" },
  { id: "plitka",     label: "Plitka",     emoji: "⬜" },
  { id: "gips",       label: "Gips",       emoji: "🧱" },
  { id: "sement",     label: "Sement",     emoji: "🏗️" },
  { id: "santexnika", label: "Santexnika", emoji: "🚿" },
  { id: "elektr_mat", label: "Elektrika",  emoji: "⚡" },
  { id: "dekorativ",  label: "Dekor",      emoji: "✨" },
];

const CATEGORY_IDS = CATEGORIES.slice(1).map((c) => c.id);

function formatPrice(p: number) {
  return new Intl.NumberFormat("uz-UZ").format(p);
}

// ─── Store badge ──────────────────────────────────────────────────────────────

function StoreBadge({ store, storeMap }: { store: string; storeMap: Map<string, Store> }) {
  const s = storeMap.get(store);
  if (!s) return null;
  return (
    <span className="text-[10px] text-muted bg-gray-100 rounded-full px-2 py-0.5 truncate max-w-[120px]">
      {s.name}
    </span>
  );
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  storeMap,
  onAdd,
}: {
  product: Material;
  storeMap: Map<string, Store>;
  onAdd: (id: string) => void;
}) {
  const color = product.color_hex ?? "#E5E7EB";
  const isLight = isLightColor(color);

  return (
    <div
      className="bg-white rounded-[18px] overflow-hidden flex flex-col"
      style={{ boxShadow: "0 8px 20px -12px rgba(17,24,39,.16)" }}
    >
      {/* Color / texture preview */}
      <div
        className="h-[96px] flex items-center justify-center relative overflow-hidden"
        style={{ backgroundColor: color }}
      >
        <CategoryIcon category={product.category} light={!isLight} />
      </div>

      <div className="p-3 flex flex-col flex-1">
        <p className="text-[13px] font-bold text-gray-900 leading-snug line-clamp-2 flex-1">
          {product.name_uz}
        </p>

        <div className="flex items-center gap-1 mt-1.5 mb-2">
          <StoreBadge store={String(product.store_id)} storeMap={storeMap} />
          <span className="text-[10px] text-muted ml-auto">{product.unit}</span>
        </div>

        <p className="text-[15px] font-extrabold text-brand">
          {formatPrice(product.price_uzs)} so'm
        </p>

        <button
          onClick={() => onAdd(product.id)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[12px] font-bold transition-colors text-orange"
          style={{ background: "#FFF1E7" }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M1 1h2l1.68 8.39a1 1 0 001 .81h5.64a1 1 0 00.98-.8L13 5H3.12" />
            <circle cx="5.5" cy="12" r="1" /><circle cx="11.5" cy="12" r="1" />
          </svg>
          Savatga
        </button>
      </div>
    </div>
  );
}

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length < 6) return true;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 180;
}

function CategoryIcon({ category, light }: { category: string; light: boolean }) {
  const stroke = light ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.2)";
  const icons: Record<string, JSX.Element> = {
    boyoq: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth="1.5">
        <path d="M10 26l6-6 10-10-4-4-10 10-6 6h4z" /><path d="M6 30s0-4 4-4" />
      </svg>
    ),
    oboy: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth="1.5">
        <rect x="6" y="6" width="24" height="24" rx="2" /><path d="M6 14h24M6 22h24" />
      </svg>
    ),
    eshik: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth="1.5">
        <rect x="8" y="4" width="20" height="28" rx="1" /><circle cx="25" cy="18" r="1.5" fill={stroke} />
      </svg>
    ),
    deraza: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth="1.5">
        <rect x="6" y="6" width="24" height="24" rx="1" /><line x1="18" y1="6" x2="18" y2="30" /><line x1="6" y1="18" x2="30" y2="18" />
      </svg>
    ),
    santexnika: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth="1.5">
        <path d="M10 24c0-4 4-8 8-8s8 4 8 8" /><path d="M18 16v-8M14 12l4-4 4 4" />
      </svg>
    ),
    elektr_mat: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth="1.5">
        <path d="M20 4l-8 16h8l-4 12 12-18h-8z" />
      </svg>
    ),
  };

  const icon = icons[category] ?? (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth="1.5">
      <rect x="6" y="6" width="24" height="24" rx="4" /><path d="M12 18h12M18 12v12" />
    </svg>
  );

  return icon;
}

// ─── All-categories data fetch ────────────────────────────────────────────────

function useAllMaterials(activeCategory: string, search: string) {
  const categories = activeCategory === "all" ? CATEGORY_IDS : [activeCategory];

  const results = useQuery({
    queryKey: ["materials", activeCategory],
    queryFn: async () => {
      if (activeCategory === "all") {
        // Fetch all pages at once with higher per_page
        return getMaterials({ per_page: 100 });
      }
      return getMaterials({ category: activeCategory, per_page: 50 });
    },
    staleTime: 5 * 60 * 1000,
  });

  const filtered = (results.data ?? []).filter((m) =>
    search.length < 2 ? true : m.name_uz.toLowerCase().includes(search.toLowerCase())
  );

  return { data: filtered, isLoading: results.isLoading, categories };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DokonPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Set<string>>(new Set());

  const { data: materials, isLoading } = useAllMaterials(activeCategory, search);

  const { data: stores = [] } = useQuery({
    queryKey: ["stores"],
    queryFn: getStores,
    staleTime: 10 * 60 * 1000,
  });

  const storeMap = new Map(stores.map((s) => [s.id, s]));

  function handleAdd(id: string) {
    setCart((prev) => new Set([...prev, id]));
  }

  return (
    <div className="min-h-screen bg-paper pb-24">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-0 lg:pt-8 sticky top-0 z-20 shadow-sm">
        <div className="lg:max-w-6xl lg:mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-[24px] font-extrabold text-gray-900">Do'kon</h1>
            <button className="relative w-11 h-11 rounded-[14px] bg-[#F3F4F6] flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#111827" strokeWidth="1.75">
                <path d="M3 3h2l1.68 8.39a1 1 0 001 .81h5.64a1 1 0 00.98-.8L16 7H4.12" />
                <circle cx="7.5" cy="18.5" r="1.5" /><circle cx="14.5" cy="18.5" r="1.5" />
              </svg>
              {cart.size > 0 && (
                <span
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full border-2 border-white text-white text-[10px] font-bold flex items-center justify-center"
                  style={{ background: "#F97316" }}
                >
                  {cart.size}
                </span>
              )}
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" />
            </svg>
            <input
              type="search"
              placeholder="Material qidirish..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-[#F3F4F6] rounded-xl text-[14px] outline-none focus:ring-2 focus:ring-brand/30 transition"
            />
          </div>

          {/* Category chips */}
          <div
            className="flex gap-2 overflow-x-auto pb-3 -mx-5 px-5"
            style={{ scrollbarWidth: "none" }}
          >
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-chip text-[13px] font-semibold transition-colors ${
                  activeCategory === cat.id
                    ? "bg-brand text-white"
                    : "bg-white text-gray-700 border border-[#EAECEF]"
                }`}
              >
                <span>{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 pt-4 lg:max-w-6xl lg:mx-auto lg:px-8">
        {/* Stats bar */}
        <p className="text-[12px] text-muted mb-3">
          {isLoading ? "Yuklanmoqda..." : `${materials.length} ta mahsulot topildi`}
        </p>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-[18px] overflow-hidden animate-pulse">
                <div className="h-[96px] bg-gray-100" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                  <div className="h-4 bg-gray-100 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && materials.length === 0 && (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">🔍</p>
            <p className="text-gray-500 font-medium">Mahsulot topilmadi</p>
            <p className="text-muted text-sm mt-1">Boshqa kalit so'z sinab ko'ring</p>
          </div>
        )}

        {/* Product grid */}
        {!isLoading && materials.length > 0 && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {materials.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                storeMap={storeMap}
                onAdd={handleAdd}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
}

const PRODUCTS: Product[] = [
  { id: "1", name: "Akril bo'yoq 5L", price: 245000, category: "boyoq" },
  { id: "2", name: "Vinil oboi", price: 128000, category: "oboi" },
  { id: "3", name: "Laminat 33-klass", price: 189000, category: "pol" },
  { id: "4", name: "LED lyustra", price: 432000, category: "elektr" },
  { id: "5", name: "Santexnika to'plami", price: 380000, category: "santexnika" },
  { id: "6", name: "Vinyl pol", price: 210000, category: "pol" },
];

const FILTERS = [
  { id: "all", label: "Barchasi" },
  { id: "boyoq", label: "Bo'yoq" },
  { id: "oboi", label: "Oboi" },
  { id: "pol", label: "Pol" },
  { id: "santexnika", label: "Santexnika" },
  { id: "elektr", label: "Elektrika" },
  { id: "mebel", label: "Mebel" },
];

function formatPrice(p: number) {
  return new Intl.NumberFormat("uz-UZ").format(p);
}

function ProductCard({ product }: { product: Product }) {
  const [inCart, setInCart] = useState(false);
  return (
    <div className="bg-white rounded-[18px] overflow-hidden" style={{ boxShadow: "0 8px 20px -12px rgba(17,24,39,.16)" }}>
      <div className="h-[104px] bg-[#F3F4F6] flex items-center justify-center">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="8" y="8" width="32" height="32" rx="6" fill="#E5E7EB"/>
          <path d="M16 24h16M24 16v16" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="p-3">
        <p className="text-[13.5px] font-bold text-gray-900 leading-snug">{product.name}</p>
        <p className="text-[14px] font-extrabold text-brand mt-1">
          {formatPrice(product.price)} so'm
        </p>
        <button
          onClick={() => setInCart(!inCart)}
          className={`mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[12px] font-bold transition-colors ${
            inCart ? "bg-brand text-white" : "text-orange"
          }`}
          style={inCart ? {} : { background: "#FFF1E7" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 1h2l1.68 8.39a1 1 0 001 .81h5.64a1 1 0 00.98-.8L13 5H3.12"/>
            <circle cx="5.5" cy="12" r="1"/><circle cx="11.5" cy="12" r="1"/>
          </svg>
          {inCart ? "Savatda" : "Savatga"}
        </button>
      </div>
    </div>
  );
}

export default function DokonPage() {
  const [activeFilter, setActiveFilter] = useState("all");
  const cartCount = 3;

  const filtered = activeFilter === "all"
    ? PRODUCTS
    : PRODUCTS.filter((p) => p.category === activeFilter);

  return (
    <div className="min-h-screen bg-paper pb-4">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[24px] font-extrabold text-gray-900">Do'kon</h1>
          <button className="relative w-11 h-11 rounded-[14px] bg-[#F3F4F6] flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#111827" strokeWidth="1.75">
              <path d="M3 3h2l1.68 8.39a1 1 0 001 .81h5.64a1 1 0 00.98-.8L16 7H4.12"/>
              <circle cx="7.5" cy="18.5" r="1.5"/><circle cx="14.5" cy="18.5" r="1.5"/>
            </svg>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full border-2 border-white text-white text-[10px] font-bold flex items-center justify-center" style={{ background: "#F97316" }}>
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="px-5 pt-4">
        {/* Banner */}
        <div
          className="rounded-[20px] p-4 mb-4"
          style={{ background: "linear-gradient(135deg,#1E40AF,#3B63DE)" }}
        >
          <p className="text-white/70 text-[13px] font-medium">Loyihangiz uchun</p>
          <p className="text-white text-[20px] font-extrabold mt-0.5">Kerakli materiallar</p>
          <p className="text-white/80 text-[13px] mt-1">Bo'yoq: ~14 litr kerak</p>
          <div className="flex justify-end mt-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2">
                <path d="M6 3l5 5-5 5"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-5 px-5" style={{ scrollbarWidth: "none" }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-chip text-[13px] font-semibold transition-colors ${
                activeFilter === f.id
                  ? "bg-brand text-white"
                  : "bg-white text-gray-700 border border-[#EAECEF]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

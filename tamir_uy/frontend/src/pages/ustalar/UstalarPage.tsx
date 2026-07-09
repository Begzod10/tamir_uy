import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getUstalar, createLead } from "@/lib/api";
import { uz } from "@/locale/uz";
import { cn } from "@/lib/utils";
import type { Usta, UstalarParams } from "@/lib/api";

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-amber-warn font-semibold text-sm">
      {"★".repeat(Math.round(rating))}
      {"☆".repeat(5 - Math.round(rating))} {rating.toFixed(1)}
    </span>
  );
}

function UstaCard({
  usta,
  onContact,
}: {
  usta: Usta;
  onContact: (usta: Usta) => void;
}) {
  return (
    <div className="bg-surface rounded-card shadow-sm p-4 flex flex-col gap-3 animate-pop-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden">
          {usta.avatar_url ? (
            <img
              src={usta.avatar_url}
              alt={usta.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl font-bold text-muted">
              {usta.name?.[0] ?? "U"}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900 truncate">{usta.name}</h3>
            {usta.verified && (
              <span className="bg-success/10 text-success text-xs font-semibold px-2 py-0.5 rounded-chip">
                {uz.ustalar.verified}
              </span>
            )}
          </div>
          <StarRating rating={usta.rating} />
        </div>
      </div>

      {/* Meta */}
      <div className="text-sm text-muted space-y-1">
        <p>
          {uz.ustalar.tajriba}: {usta.jobs_count}{" "}
          
        </p>
        <p>
          {uz.ustalar.narx}: {usta.price_min.toLocaleString()}{" "}
          – {usta.price_max.toLocaleString()}{" "}
          {uz.ustalar.soum_m2}
        </p>

      </div>

      {/* Action */}
      <button
        onClick={() => onContact(usta)}
        className="w-full bg-brand text-white py-2 rounded-card text-sm font-semibold hover:bg-brand/90 transition-colors"
      >
        {uz.ustalar.usta_chaqirish}
      </button>
    </div>
  );
}

interface ContactModalProps {
  usta: Usta;
  onClose: () => void;
}

function ContactModal({ usta, onClose }: ContactModalProps) {
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      createLead({ usta_id: usta.id, message, contact_phone: phone }),
    onSuccess: () => setSuccess(true),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface rounded-card shadow-xl w-full max-w-md p-6 animate-fade-slide">
        {success ? (
          <div className="text-center py-6">
            <p className="text-4xl mb-4">✓</p>
            <h3 className="text-lg font-bold text-success mb-2">
              {uz.ustalar.muvaffaqiyat}
            </h3>
            <button
              onClick={onClose}
              className="mt-4 bg-brand text-white px-6 py-2 rounded-card text-sm font-semibold"
            >
              {uz.common.yopish}
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {usta.name} {uz.ustalar.boglaning}
            </h2>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  {uz.auth.telefon}
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={uz.auth.telefon_placeholder}
                  className="mt-1 block w-full rounded-card border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  {uz.ustalar.izoh}
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-card border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                  placeholder="Xona haqida ma'lumot..."
                />
              </label>
            </div>
            {mutation.isError && (
              <p className="mt-3 text-sm text-red-600">{uz.errors.nomalum_xato}</p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 border-2 border-gray-300 py-2 rounded-card text-sm font-medium hover:border-brand transition-colors"
              >
                {uz.common.bekor}
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !phone}
                className="flex-1 bg-brand text-white py-2 rounded-card text-sm font-semibold hover:bg-brand/90 disabled:opacity-60 transition-colors"
              >
                {mutation.isPending ? uz.common.yuklanmoqda : uz.ustalar.yuborish}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const SORT_OPTIONS: { key: UstalarParams["sort"]; label: string }[] = [
  { key: undefined, label: uz.ustalar.hammasi },
  { key: "rating", label: uz.ustalar.eng_yaxshi },
  { key: "price_asc", label: uz.ustalar.narxi_arzon },
  { key: "price_desc", label: uz.ustalar.narxi_qimmat },
];

export default function UstalarPage() {
  const [sort, setSort] = useState<UstalarParams["sort"]>(undefined);
  const [selectedUsta, setSelectedUsta] = useState<Usta | null>(null);

  const { data: ustalar = [], isLoading, isError } = useQuery({
    queryKey: ["ustalar", sort],
    queryFn: () => getUstalar({ sort }),
  });

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="bg-surface shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">{uz.ustalar.sarlavha}</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Sort bar */}
        <div className="flex gap-2 flex-wrap mb-6">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={String(opt.key)}
              onClick={() => setSort(opt.key)}
              className={cn(
                "px-4 py-1.5 rounded-chip text-sm font-medium border-2 transition-colors",
                sort === opt.key
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-gray-200 hover:border-brand/40"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-surface rounded-card shadow-sm p-4 animate-pulse h-48"
              />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-center text-red-600 py-8">{uz.errors.tarmoq_xatosi}</p>
        )}

        {!isLoading && !isError && ustalar.length === 0 && (
          <p className="text-center text-muted py-12">{uz.empty.ustalar_yoq}</p>
        )}

        {!isLoading && !isError && ustalar.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ustalar.map((usta) => (
              <UstaCard
                key={usta.id}
                usta={usta}
                onContact={setSelectedUsta}
              />
            ))}
          </div>
        )}
      </main>

      {selectedUsta && (
        <ContactModal
          usta={selectedUsta}
          onClose={() => setSelectedUsta(null)}
        />
      )}
    </div>
  );
}

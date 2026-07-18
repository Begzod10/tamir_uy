import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createEstimate, getEstimatePDF, getRoom } from "@/lib/api";
import { formatUZS } from "@/lib/utils";
import { uz } from "@/locale/uz";
import type { EstimateResponse } from "@/lib/api";
import { SmetaAskDrawer } from "@/components/smeta/SmetaAskDrawer";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SmetaPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [highlightedLines, setHighlightedLines] = useState<Set<string>>(new Set());

  const { data: room } = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => getRoom(roomId!),
    enabled: !!roomId,
  });

  const mutation = useMutation({
    mutationFn: () => createEstimate(roomId!),
    onSuccess: (data) => setEstimate(data),
  });

  async function handlePDF() {
    if (!roomId) return;
    setPdfLoading(true);
    try {
      const blob = await getEstimatePDF(roomId);
      downloadBlob(blob, `smeta-${roomId}.pdf`);
    } catch {
      alert(uz.errors.pdf_xato);
    } finally {
      setPdfLoading(false);
    }
  }

  function handleHighlight(lineIds: string[]) {
    setHighlightedLines(new Set(lineIds));
    setTimeout(() => setHighlightedLines(new Set()), 8000);
  }

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="bg-surface shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            to={`/studio/${roomId}`}
            className="text-muted hover:text-gray-900 text-sm"
          >
            ← {uz.common.orqaga}
          </Link>
          <h1 className="text-xl font-bold text-gray-900">{uz.smeta.sarlavha}</h1>
          {room && (
            <span className="ml-auto text-sm text-muted">
              {room.name} · {room.area} m²
            </span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Calculate button */}
        {!estimate && (
          <div className="text-center py-12">
            <p className="text-muted mb-6">{uz.empty.smeta_yoq}</p>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="bg-brand text-white px-8 py-3 rounded-card font-semibold hover:bg-brand/90 transition-colors disabled:opacity-60"
            >
              {mutation.isPending ? uz.common.yuklanmoqda : uz.smeta.hisoblash}
            </button>
            {mutation.isError && (
              <p className="mt-4 text-red-600 text-sm">{uz.errors.smeta_xato}</p>
            )}
          </div>
        )}

        {/* Estimate display */}
        {estimate && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-surface rounded-card p-4 shadow-sm">
                <p className="text-xs text-muted mb-1">Minimal narx</p>
                <p className="text-lg font-bold text-gray-900">
                  {formatUZS(estimate.total_min)}
                </p>
              </div>
              <div className="bg-surface rounded-card p-4 shadow-sm">
                <p className="text-xs text-muted mb-1">Maksimal narx</p>
                <p className="text-lg font-bold text-gray-900">
                  {formatUZS(estimate.total_max)}
                </p>
              </div>
              <div className="bg-surface rounded-card p-4 shadow-sm col-span-2 sm:col-span-1">
                <p className="text-xs text-muted mb-1">Elektr ishlari</p>
                <p className="text-lg font-bold text-gray-900">
                  {estimate.has_electrical ? "Ha" : "Yo'q"}
                </p>
              </div>
            </div>

            {/* Total */}
            <div className="bg-brand/10 border-2 border-brand rounded-card p-5 flex items-center justify-between">
              <p className="text-lg font-semibold text-brand">{uz.smeta.jami}</p>
              <p className="text-2xl font-extrabold text-brand">
                {formatUZS(estimate.total_uzs)}
              </p>
            </div>

            {/* Line items */}
            <div className="bg-surface rounded-card shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                        Ish / material
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                        Formula
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                        {uz.smeta.miqdori}
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                        {uz.smeta.birlik}
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                        {uz.smeta.narxi}
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                        {uz.smeta.summa}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimate.lines.map((line, idx) => (
                      <tr
                        key={idx}
                        className={[
                          "border-b border-gray-100 transition-colors",
                          highlightedLines.has(String(idx))
                            ? "bg-yellow-50 ring-1 ring-yellow-300"
                            : "hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {line.label}
                          {line.is_approximate && (
                            <span className="ml-2 text-xs text-orange-500">~taxminiy</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted max-w-[200px] truncate">
                          {line.formula}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {line.quantity.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-muted">{line.unit}</td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {formatUZS(line.unit_price)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatUZS(line.total_uzs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handlePDF}
                disabled={pdfLoading}
                className="flex items-center gap-2 bg-blueprint text-white px-5 py-2.5 rounded-card text-sm font-semibold hover:bg-blueprint/90 transition-colors disabled:opacity-60"
              >
                {pdfLoading ? uz.common.yuklanmoqda : uz.smeta.pdf_yuklab}
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="flex items-center gap-2 border-2 border-gray-300 px-5 py-2.5 rounded-card text-sm font-semibold hover:border-brand transition-colors disabled:opacity-60"
              >
                {uz.smeta.qayta_hisoblash}
              </button>
              {/* AI ask button — only shown when estimate is available */}
              <button
                onClick={() => setAskOpen(true)}
                className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2.5 rounded-card text-sm font-semibold hover:bg-purple-700 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>
                </svg>
                {uz.ai.smeta_sarlavha}
              </button>
              <Link
                to="/ustalar"
                className="flex items-center gap-2 bg-success text-white px-5 py-2.5 rounded-card text-sm font-semibold hover:bg-success/90 transition-colors"
              >
                {uz.ustalar.usta_chaqirish}
              </Link>
            </div>

            <p className="text-xs text-muted">
              Hisoblab chiqildi:{" "}
              {new Date(estimate.created_at).toLocaleString("uz-UZ")}
            </p>
          </div>
        )}
      </main>

      {roomId && (
        <SmetaAskDrawer
          open={askOpen}
          onOpenChange={setAskOpen}
          roomId={roomId}
          onHighlight={handleHighlight}
        />
      )}
    </div>
  );
}

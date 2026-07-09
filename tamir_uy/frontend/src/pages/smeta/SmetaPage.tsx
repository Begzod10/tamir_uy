import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createEstimate, getEstimatePDF, getRoom } from "@/lib/api";
import { formatUZS } from "@/lib/utils";
import { uz } from "@/locale/uz";
import type { EstimateResponse } from "@/lib/api";

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
          <div className="space-y-6 animate-fade-slide">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-surface rounded-card p-4 shadow-sm">
                <p className="text-xs text-muted mb-1">{uz.smeta.material_xarajat}</p>
                <p className="text-lg font-bold text-gray-900 animate-count-up">
                  {formatUZS(estimate.material_total)}
                </p>
              </div>
              <div className="bg-surface rounded-card p-4 shadow-sm">
                <p className="text-xs text-muted mb-1">{uz.smeta.mehnat}</p>
                <p className="text-lg font-bold text-gray-900 animate-count-up">
                  {formatUZS(estimate.labor_total)}
                </p>
              </div>
              <div className="bg-surface rounded-card p-4 shadow-sm col-span-2 sm:col-span-1">
                <p className="text-xs text-muted mb-1">{uz.smeta.chiqindi}</p>
                <p className="text-lg font-bold text-gray-900 animate-count-up">
                  {formatUZS(estimate.waste_total)}
                </p>
              </div>
            </div>

            {/* Total */}
            <div className="bg-brand/10 border-2 border-brand rounded-card p-5 flex items-center justify-between">
              <p className="text-lg font-semibold text-brand">{uz.smeta.jami}</p>
              <p className="text-2xl font-extrabold text-brand">
                {formatUZS(estimate.grand_total)}
              </p>
            </div>

            {/* Line items */}
            <div className="bg-surface rounded-card shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                        {uz.smeta.material}
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
                    {estimate.items.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {item.name}
                          <span className="ml-2 text-xs text-muted">
                            [{item.category}]
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {item.quantity.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-muted">{item.unit}</td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {formatUZS(item.unit_price)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatUZS(item.total)}
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
              <Link
                to={`/ustalar`}
                className="flex items-center gap-2 bg-success text-white px-5 py-2.5 rounded-card text-sm font-semibold hover:bg-success/90 transition-colors"
              >
                {uz.ustalar.usta_chaqirish}
              </Link>
            </div>

            <p className="text-xs text-muted">
              Hisoblab chiqildi:{" "}
              {new Date(estimate.generated_at).toLocaleString("uz-UZ")}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

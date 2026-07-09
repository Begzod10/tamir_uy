import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getApartments } from "@/lib/api";
import { formatArea } from "@/lib/utils";
import { uz } from "@/locale/uz";

function ApartmentCard({
  id,
  name,
  address,
  total_area,
}: {
  id: string;
  name: string;
  address: string | null;
  total_area: number;
}) {
  return (
    <Link
      to={`/studio/${id}`}
      className="group bg-surface rounded-card shadow-sm p-5 flex flex-col gap-2 hover:shadow-md transition-shadow animate-pop-in border-2 border-transparent hover:border-brand/20"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold text-gray-900 text-base truncate">{name}</h3>
        <span className="text-sm text-muted bg-paper px-2 py-0.5 rounded-chip flex-shrink-0">
          {formatArea(total_area)}
        </span>
      </div>
      {address && <p className="text-sm text-muted truncate">{address}</p>}
      <div className="mt-auto pt-3 border-t border-gray-100">
        <span className="text-xs text-brand font-medium group-hover:underline">
          {uz.studio.bezash} →
        </span>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">🏠</div>
      <p className="text-muted mb-6">{uz.empty.loyihalar_yoq}</p>
      <Link
        to="/wizard"
        className="inline-block bg-brand text-white px-8 py-3 rounded-card font-semibold hover:bg-brand/90 transition-colors"
      >
        {uz.nav.wizard}
      </Link>
    </div>
  );
}

export default function ProjectsPage() {
  const { data: apartments = [], isLoading, isError } = useQuery({
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

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="bg-surface shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">{uz.nav.loyihalar}</h1>
          <Link
            to="/wizard"
            className="bg-brand text-white px-4 py-2 rounded-card text-sm font-semibold hover:bg-brand/90 transition-colors"
          >
            + {uz.nav.wizard}
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-surface rounded-card shadow-sm p-5 h-36 animate-pulse"
              />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-center text-red-600 py-8">{uz.errors.tarmoq_xatosi}</p>
        )}

        {!isLoading && !isError && apartments.length === 0 && <EmptyState />}

        {!isLoading && !isError && apartments.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {apartments.map((apt) => (
              <ApartmentCard
                key={apt.id}
                id={apt.id}
                name={apt.name}
                address={apt.address}
                total_area={apt.total_area}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

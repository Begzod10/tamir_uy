import { Suspense, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getRoom, getDraftRoom, createApartment, createRoom, updateRoom } from "@/lib/api";
import type { Room } from "@/lib/api";
import { uz } from "@/locale/uz";
import { cn } from "@/lib/utils";
import { useRoomStore, computeFloorArea } from "@/store/roomStore";

function StudioNav({ roomId }: { roomId: string }) {
  return (
    <nav className="flex gap-2 border-b border-gray-200 bg-surface px-4 pt-3">
      <NavLink
        to={`/studio/${roomId}/ichkarida`}
        className={({ isActive }) =>
          cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            isActive
              ? "border-brand text-brand"
              : "border-transparent text-muted hover:text-gray-900"
          )
        }
      >
        {uz.studio.ichkarida}
      </NavLink>
      <NavLink
        to={`/studio/${roomId}/elektr`}
        className={({ isActive }) =>
          cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            isActive
              ? "border-brand text-brand"
              : "border-transparent text-muted hover:text-gray-900"
          )
        }
      >
        ⚡ Elektr
      </NavLink>
      <NavLink
        to={`/studio/${roomId}/aylanish`}
        className={({ isActive }) =>
          cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            isActive
              ? "border-brand text-brand"
              : "border-transparent text-muted hover:text-gray-900"
          )
        }
      >
        🚶 Aylanish
      </NavLink>
    </nav>
  );
}

export default function StudioPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const storeState = useRoomStore();
  const { draftId, loadDraftState } = useRoomStore();
  const isDirty = useRoomStore((s) => s.isDirty);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  async function handleSave() {
    if (saveStatus === 'saving') return;
    setSaveStatus('saving');
    try {
      const s = useRoomStore.getState();

      // Build the full state blob to persist
      const stateBlob = {
        geometry: s.geometry,
        ceilingHeight: s.ceilingHeight,
        name: s.name,
        designState: s.designState,
        furniture: s.furniture,
        electricals: s.electricals,
        lights: s.lights,
      };

      // Geometry in backend format: lengths in metres, positions 0-1 fraction
      const geometryPayload = {
        walls: s.geometry.walls.map(w => ({
          id: w.id,
          length: w.length / 1000,
          elements: w.elements.map(e => ({
            type: e.type,
            width: e.width / 1000,
            height: e.height / 1000,
            sill_height: (e.sill_height ?? 0) / 1000,
            position: e.position > 0 ? Math.min(1, e.position / w.length) : 0.5,
          })),
        })),
      };

      // Try to update existing DB room first
      if (roomId) {
        try {
          await updateRoom(roomId, {
            name: s.name,
            ceiling_h: s.ceilingHeight / 1000,
            geometry: geometryPayload,
            state: stateBlob as unknown as Record<string, unknown>,
          });
          useRoomStore.getState().markSaved();
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2500);
          return;
        } catch {
          // Room doesn't exist in DB yet — fall through to create
        }
      }

      // Room not in DB — create apartment + room
      let aptId = s.apartmentId;
      if (!aptId) {
        const apt = await createApartment({ name: s.name || 'Kvartira' });
        aptId = apt.id;
      }
      const newRoom = await createRoom(aptId, {
        name: s.name || 'Xona',
        ceiling_h: s.ceilingHeight / 1000,
        geometry: geometryPayload,
      });
      // Save full state to the new room
      await updateRoom(newRoom.id, {
        state: stateBlob as unknown as Record<string, unknown>,
      });
      useRoomStore.getState().setRoomId(newRoom.id);
      useRoomStore.getState().markSaved();
      setSaveStatus('saved');
      // Replace stale URL with the real room ID
      const currentTab = location.pathname.split('/').pop() ?? 'ichkarida';
      navigate(`/studio/${newRoom.id}/${currentTab}`, { replace: true });
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('idle');
    }
  }

  // Fallback: restore from draft-room when draftId is set but apiRoom has no state
  useEffect(() => {
    if (!draftId) return;
    const hasElements = storeState.geometry.walls.some(w => w.elements.length > 0);
    if (hasElements) return;
    getDraftRoom(draftId)
      .then(draft => { if (draft?.state) loadDraftState(draft.state as Record<string, unknown>) })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // Build a synthetic Room from store data for offline/local use
  const localRoom = useMemo<Room>(() => {
    const wallA = storeState.geometry.walls.find((w) => w.id === "A");
    const wallB = storeState.geometry.walls.find((w) => w.id === "B");
    const lengthM = (wallA?.length ?? 4000) / 1000;
    const widthM = (wallB?.length ?? 3000) / 1000;
    return {
      id: roomId ?? "local",
      apartment_id: storeState.apartmentId ?? "local",
      name: storeState.name,
      room_type: "mehmonxona",
      area: computeFloorArea(storeState.geometry) / 1e6,
      ceiling_height: storeState.ceilingHeight / 1000,
      width: widthM,
      length: lengthM,
      num_doors: storeState.geometry.walls.reduce(
        (s, w) => s + w.elements.filter((e) => e.type === "eshik").length, 0,
      ),
      num_windows: storeState.geometry.walls.reduce(
        (s, w) => s + w.elements.filter((e) => e.type === "deraza").length, 0,
      ),
      has_balcony: storeState.geometry.walls.some((w) =>
        w.elements.some((e) => e.type === "balkon"),
      ),
      renovation_level: "orta",
      design_state: {},
      created_at: new Date().toISOString(),
    };
  }, [roomId, storeState]);

  type FetchStatus = "ok" | "auth" | "notfound" | "offline";

  const { data: apiRoom, isLoading, error } = useQuery({
    queryKey: ["room", roomId],
    queryFn: async (): Promise<Room | null> => {
      try {
        return await getRoom(roomId!);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "Unauthorized" || msg.includes("401")) {
          throw Object.assign(new Error("auth"), { code: "AUTH_REQUIRED" });
        }
        if (msg.includes("404") || msg.includes("HTTP 404")) {
          throw Object.assign(new Error("notfound"), { code: "NOT_FOUND" });
        }
        return null; // offline / network error → fall back to local
      }
    },
    enabled: !!roomId,
    retry: false,
  });

  const fetchStatus: FetchStatus = !error
    ? "ok"
    : (error as { code?: string }).code === "AUTH_REQUIRED" ? "auth"
    : (error as { code?: string }).code === "NOT_FOUND" ? "notfound"
    : "offline";

  const room = (fetchStatus === "auth" || fetchStatus === "offline")
    ? localRoom
    : (apiRoom ?? localRoom);

  // When a saved room loads from API and has a full state blob, restore it into the store.
  useEffect(() => {
    if (!apiRoom) return;
    const state = (apiRoom as unknown as { state?: Record<string, unknown> }).state;
    if (!state) return;
    const hasElements = storeState.geometry.walls.some(w => w.elements.length > 0);
    if (hasElements) return;
    loadDraftState(state);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRoom]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-paper">
        <span className="text-muted animate-pulse">{uz.common.yuklanmoqda}</span>
      </div>
    );
  }

  // 404 with no local data → show not-found
  if (fetchStatus === "notfound" && !storeState.isDirty) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-paper gap-4">
        <p className="text-gray-500 text-lg">Xona topilmadi</p>
        <a href="/wizard" className="bg-brand text-white px-6 py-2 rounded-card font-semibold hover:bg-brand/90">
          Yangi xona yaratish
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-paper">
      {/* Header */}
      <header className="bg-surface shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <NavLink
            to="/projects"
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            title="Loyihalarga qaytish"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </NavLink>
          <h1 className="text-lg font-bold text-gray-900 truncate">{room.name}</h1>
          <span className="text-sm text-muted ml-auto">
            {room.area} m² · {room.renovation_level}
          </span>
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving' || (fetchStatus !== 'notfound' && !isDirty)}
            className={[
              "ml-3 px-4 py-1.5 rounded-card text-sm font-semibold transition-colors",
              saveStatus === 'saved'
                ? "bg-green-500 text-white"
                : (isDirty || fetchStatus === 'notfound')
                  ? "bg-brand text-white hover:bg-brand/90"
                  : "bg-gray-100 text-gray-400 cursor-default",
            ].join(' ')}
          >
            {saveStatus === 'saving' ? 'Saqlanmoqda…' : saveStatus === 'saved' ? 'Saqlandi ✓' : 'Saqlash'}
          </button>
        </div>
        <StudioNav roomId={room.id} />
      </header>

      {/* Offline / auth hint banner */}
      {(fetchStatus === "auth" || fetchStatus === "offline") && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-700 flex items-center gap-2">
          <span>
            {fetchStatus === "auth"
              ? "Oflayn rejim — kirish qilsangiz, loyihangiz bulutga saqlanadi."
              : "Tarmoq xatosi — mahalliy ma'lumotlar ko'rsatilmoqda."}
          </span>
          {fetchStatus === "auth" && (
            <a href="/auth" className="underline font-medium ml-1">Kirish</a>
          )}
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <span className="text-muted animate-pulse">{uz.common.yuklanmoqda}</span>
            </div>
          }
        >
          <Outlet context={{ room }} />
        </Suspense>
      </main>
    </div>
  );
}

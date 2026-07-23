import * as React from "react"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { uz } from "@/locale/uz"
import { aiBuildStream } from "@/lib/api"
import type { AiBuildEvent, AiRoomPatch } from "@/lib/api"
import { useRoomStore } from "@/store/roomStore"

interface AiBuilderSheetProps {
  open: boolean
  onOpenChange(open: boolean): void
  roomId: string
}

interface LogEntry {
  id: number
  type: AiBuildEvent["type"]
  text: string
}

export function AiBuilderSheet({ open, onOpenChange, roomId }: AiBuilderSheetProps) {
  const [prompt, setPrompt] = React.useState("")
  const [running, setRunning] = React.useState(false)
  const [log, setLog] = React.useState<LogEntry[]>([])
  const [pendingPatch, setPendingPatch] = React.useState<AiRoomPatch | null>(null)
  const [summary, setSummary] = React.useState("")
  const [error, setError] = React.useState("")
  const logRef = React.useRef<HTMLDivElement>(null)
  const idRef = React.useRef(0)
  const abortRef = React.useRef(false)

  const store = useRoomStore()

  function reset() {
    setLog([])
    setPendingPatch(null)
    setSummary("")
    setError("")
  }

  function addLog(type: AiBuildEvent["type"], text: string) {
    setLog((prev) => [...prev, { id: idRef.current++, type, text }])
  }

  React.useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || running) return
    reset()
    setRunning(true)
    abortRef.current = false

    try {
      for await (const event of aiBuildStream(roomId, prompt.trim())) {
        if (abortRef.current) break
        switch (event.type) {
          case "thinking":
            addLog("thinking", event.text ?? uz.ai.fikrlanmoqda)
            break
          case "tool_call":
            addLog("tool_call", `${uz.ai.tool_call}: ${event.name}`)
            break
          case "tool_result":
            if (!event.ok) addLog("error", event.result ?? "")
            break
          case "done":
            setSummary(event.summary ?? "")
            if (event.patch && Object.keys(event.patch).length > 0) {
              setPendingPatch(event.patch)
              addLog("done", uz.ai.draft_tayyor)
            } else {
              addLog("done", event.summary ?? "Tayyor.")
            }
            break
          case "error":
            setError(event.message ?? uz.ai.xato)
            addLog("error", event.message ?? uz.ai.xato)
            break
        }
      }
    } catch (exc: unknown) {
      const msg = exc instanceof Error ? exc.message : uz.ai.xato
      setError(msg)
      addLog("error", msg)
    } finally {
      setRunning(false)
    }
  }

  function handleApply() {
    if (!pendingPatch) return
    // Apply ceiling height
    if (pendingPatch.ceiling_h != null) {
      store.setCeilingHeight(Math.round(pendingPatch.ceiling_h * 1000))
    }

    // Apply wall lengths
    if (pendingPatch.wall_lengths) {
      for (const [wallId, lengthM] of Object.entries(pendingPatch.wall_lengths)) {
        store.setWallLength(wallId, Math.round(lengthM * 1000))
      }
    }

    // Apply surfaces
    if (pendingPatch.surfaces) {
      for (const [surfaceId, materialId] of Object.entries(pendingPatch.surfaces)) {
        store.applySurface(surfaceId, materialId)
      }
    }

    // Apply material colors (must be separate so paint color is applied)
    if (pendingPatch.material_colors) {
      for (const [surfaceId, hexColor] of Object.entries(pendingPatch.material_colors)) {
        store.setWallCovering(surfaceId, { kind: 'paint', color: hexColor })
      }
    }

    // Apply furniture
    if (pendingPatch.furniture) {
      for (const item of pendingPatch.furniture) {
        store.placeFurniture({
          id: item.id,
          furniture_id: item.furniture_id,
          x: item.x,
          y: item.y,
          rotation: item.rotation,
        })
      }
    }

    setPendingPatch(null)
    setLog((prev) => [...prev, { id: idRef.current++, type: "done", text: uz.ai.qollandi }])
  }

  function handleDiscard() {
    setPendingPatch(null)
    setSummary("")
    abortRef.current = true
  }

  function handleClose() {
    abortRef.current = true
    reset()
    setPrompt("")
    onOpenChange(false)
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={handleClose}
      title={uz.ai.builder_title}
      defaultSnap="full"
    >
      <div className="flex flex-col h-full pb-4 px-4 gap-3">
        {/* Log area */}
        {log.length > 0 && (
          <div
            ref={logRef}
            className="flex-1 min-h-0 overflow-y-auto rounded-xl bg-[#F3F4F6] p-3 space-y-1 text-sm"
          >
            {log.map((entry) => (
              <div
                key={entry.id}
                className={
                  entry.type === "error"
                    ? "text-red-600"
                    : entry.type === "done"
                    ? "text-green-700 font-semibold"
                    : entry.type === "tool_call"
                    ? "text-blue-700"
                    : "text-gray-600"
                }
              >
                {entry.type === "tool_call" ? "⚙ " : entry.type === "done" ? "✓ " : entry.type === "error" ? "✗ " : "· "}
                {entry.text}
              </div>
            ))}
            {running && (
              <div className="text-gray-400 animate-pulse">· ...</div>
            )}
          </div>
        )}

        {/* Summary */}
        {summary && !pendingPatch && (
          <p className="text-sm text-gray-700 rounded-xl bg-blue-50 px-3 py-2">{summary}</p>
        )}

        {/* Pending patch actions */}
        {pendingPatch && (
          <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 space-y-2">
            <p className="text-sm font-semibold text-green-800">{summary || uz.ai.draft_tayyor}</p>
            <div className="flex gap-2">
              <button
                onClick={handleApply}
                className="flex-1 bg-green-600 text-white text-sm font-semibold py-2 rounded-xl hover:bg-green-700 transition-colors"
              >
                {uz.ai.qollash}
              </button>
              <button
                onClick={handleDiscard}
                className="flex-1 bg-white border border-gray-300 text-gray-700 text-sm font-semibold py-2 rounded-xl hover:bg-gray-50 transition-colors"
              >
                {uz.ai.bekor}
              </button>
            </div>
          </div>
        )}

        {/* Input form */}
        {!pendingPatch && (
          <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={uz.ai.builder_placeholder}
              disabled={running}
              rows={3}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={running || !prompt.trim()}
              className="w-full bg-brand text-white text-sm font-semibold py-3 rounded-xl hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              {running ? uz.ai.fikrlanmoqda : uz.ai.yuborish}
            </button>
          </form>
        )}

        {error && !running && (
          <p className="text-xs text-red-600">{error}</p>
        )}
      </div>
    </BottomSheet>
  )
}

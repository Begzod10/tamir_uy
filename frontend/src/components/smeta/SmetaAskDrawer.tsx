import * as React from "react"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { uz } from "@/locale/uz"
import { smetaAsk } from "@/lib/api"

interface SmetaAskDrawerProps {
  open: boolean
  onOpenChange(open: boolean): void
  roomId: string
  /** Callback to highlight estimate lines by index. */
  onHighlight?: (lineIds: string[]) => void
}

interface ChatMessage {
  id: number
  role: "user" | "ai"
  text: string
}

const SUGGESTED = [
  uz.ai.tavsiya_1,
  uz.ai.tavsiya_2,
  uz.ai.tavsiya_3,
]

export function SmetaAskDrawer({
  open,
  onOpenChange,
  roomId,
  onHighlight,
}: SmetaAskDrawerProps) {
  const [input, setInput] = React.useState("")
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const idRef = React.useRef(0)
  const bottomRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleAsk(question: string) {
    if (!question.trim() || loading) return
    setError("")
    const userMsg: ChatMessage = { id: idRef.current++, role: "user", text: question }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)
    try {
      const res = await smetaAsk(roomId, question)
      setMessages((prev) => [
        ...prev,
        { id: idRef.current++, role: "ai", text: res.answer_uz },
      ])
      if (onHighlight && res.related_line_ids.length > 0) {
        onHighlight(res.related_line_ids)
      }
    } catch (exc: unknown) {
      const msg = exc instanceof Error ? exc.message : uz.errors.nomalum_xato
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    handleAsk(input)
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={uz.ai.smeta_sarlavha}
      defaultSnap="full"
    >
      <div className="flex flex-col h-full pb-4 px-4 gap-3">
        {/* Chat messages */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
          {messages.length === 0 && (
            <div className="space-y-2 mt-2">
              <p className="text-sm text-muted">{uz.ai.smeta_savol_hint}</p>
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => handleAsk(s)}
                  disabled={loading}
                  className="w-full text-left text-sm bg-[#F3F4F6] hover:bg-[#EAECF0] rounded-xl px-3 py-2 transition-colors disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  msg.role === "user"
                    ? "bg-brand text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2 max-w-[80%]"
                    : "bg-[#F3F4F6] text-gray-800 text-sm rounded-2xl rounded-tl-sm px-4 py-2 max-w-[85%] whitespace-pre-wrap"
                }
              >
                {msg.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#F3F4F6] text-gray-400 text-sm rounded-2xl px-4 py-2 animate-pulse">
                · · ·
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 text-center">{error}</p>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={uz.ai.smeta_placeholder}
            disabled={loading}
            className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-brand text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-50"
          >
            {uz.ai.yuborish}
          </button>
        </form>
      </div>
    </BottomSheet>
  )
}

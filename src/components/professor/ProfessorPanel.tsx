import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { GraduationCap, Loader2, Send, Sparkles, Clock3, Newspaper, Compass } from 'lucide-react'
import { useScalperTf } from '@/hooks/useData'
import { useSymbol } from '@/hooks/useSymbol'
import { useTimezone } from '@/hooks/useTimezone'
import { askProfessor, buildProfessorContext } from '@/lib/professor'
import type { ProfessorChatMessage, ProfessorMode } from '@/lib/professor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

/**
 * GoldCast Phase 16 Track B — "Professor ประจำสถานี" (AI explainer panel).
 *
 * Floating action button (GraduationCap) on every route; opens a bottom
 * drawer (mobile-first) with three quick actions (explain / brief / coach)
 * and a free-form chat. The panel ONLY talks to /api/professor — context is
 * assembled from the app's real data via buildProfessorContext(). Chat
 * history is session state: reset when the drawer closes or the route
 * changes, never persisted.
 *
 * The permanent honesty banner above the chat is non-negotiable: Professor
 * explains — it never predicts direction (the engine proved direction is
 * not predictable) and it is never a trade signal.
 */

interface PanelMessage extends ProfessorChatMessage {
  /** error-tone assistant messages (fallback states) render amber/red. */
  tone?: 'error'
}

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/sessions': 'Session Radar',
  '/scalper-clock': "Scalper's Clock",
  '/truth': 'The Truth',
  '/methodology': 'Methodology',
}

const HONESTY_BANNER =
  'คำอธิบายจาก AI — ไม่ใช่สัญญาณเทรด · Professor ไม่ทำนายทิศทางราคา (engine พิสูจน์แล้วว่าทำนายไม่ได้)'

/** Chat history sent with a chat request — short, errors excluded. */
function historyForApi(messages: PanelMessage[]): ProfessorChatMessage[] {
  return messages.filter((m) => m.tone !== 'error').slice(-6).map(({ role, content }) => ({ role, content }))
}

/* ── Mini markdown renderer ───────────────────────────────────────────────
   The Professor (Kimi) answers in markdown, but the project deliberately
   avoids adding react-markdown/remark (npmjs-registry-only lockfile). This
   tiny renderer covers exactly the subset Professor emits — #/##/###
   headings, **bold**, - bullet lists, > blockquotes, --- rules and plain
   paragraphs — styled on the GoldCast dark/gold tokens. Anything outside
   the subset falls through as plain text; it can never throw on weird
   model output. */

/** Inline `**bold**` → <strong>. Returns plain text nodes untouched. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part)
    if (bold != null) {
      return (
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-text0">
          {bold[1]}
        </strong>
      )
    }
    return <Fragment key={`${keyPrefix}-t${i}`}>{part}</Fragment>
  })
}

const HEADING_CLS: Record<number, string> = {
  1: 'font-display text-[15px] font-semibold text-goldhi',
  2: 'font-display text-[14px] font-semibold text-goldhi',
  3: 'font-display text-[13px] font-semibold text-gold',
}

function ProfessorMarkdown({ content }: { content: string }) {
  const blocks: ReactNode[] = []
  let key = 0
  let para: string[] = []
  let list: string[] = []
  let quote: string[] = []

  const flushPara = () => {
    if (para.length === 0) return
    const k = `p${key++}`
    blocks.push(
      <p key={k} className="leading-5">
        {para.map((line, i) => (
          <Fragment key={`${k}-l${i}`}>
            {i > 0 && <br />}
            {renderInline(line, `${k}-l${i}`)}
          </Fragment>
        ))}
      </p>,
    )
    para = []
  }
  const flushList = () => {
    if (list.length === 0) return
    const k = `ul${key++}`
    blocks.push(
      <ul key={k} className="list-disc space-y-1 pl-4 marker:text-golddim">
        {list.map((item, i) => (
          <li key={`${k}-i${i}`} className="leading-5">
            {renderInline(item, `${k}-i${i}`)}
          </li>
        ))}
      </ul>,
    )
    list = []
  }
  const flushQuote = () => {
    if (quote.length === 0) return
    const k = `q${key++}`
    blocks.push(
      <blockquote key={k} className="border-l-2 border-gold/50 pl-2.5 text-text2">
        {quote.map((line, i) => (
          <Fragment key={`${k}-l${i}`}>
            {i > 0 && <br />}
            {renderInline(line, `${k}-l${i}`)}
          </Fragment>
        ))}
      </blockquote>,
    )
    quote = []
  }
  const flushAll = () => {
    flushPara()
    flushList()
    flushQuote()
  }

  for (const raw of content.split('\n')) {
    const line = raw.trimEnd()
    if (line.trim() === '') {
      flushAll()
      continue
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushAll()
      blocks.push(<hr key={`hr${key++}`} className="border-line" />)
      continue
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading != null) {
      flushAll()
      const level = heading[1].length
      const k = `h${key++}`
      blocks.push(
        <p key={k} className={HEADING_CLS[level]}>
          {renderInline(heading[2], k)}
        </p>,
      )
      continue
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (bullet != null) {
      flushPara()
      flushQuote()
      list.push(bullet[1])
      continue
    }
    const quoted = /^\s*>\s?(.*)$/.exec(line)
    if (quoted != null) {
      flushPara()
      flushList()
      quote.push(quoted[1])
      continue
    }
    flushList()
    flushQuote()
    para.push(line)
  }
  flushAll()

  return <div className="flex flex-col gap-2">{blocks}</div>
}

export default function ProfessorPanel() {
  const { pathname } = useLocation()
  const symbolState = useSymbol()
  const { tz } = useTimezone()
  const { stf } = useScalperTf()

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<PanelMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)

  /* Session-only history: reset when the route changes or the drawer closes. */
  useEffect(() => {
    setMessages([])
    setDraft('')
  }, [pathname])
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (!next) {
      setMessages([])
      setDraft('')
    }
  }, [])

  /* Keep the newest message in view. */
  useEffect(() => {
    const el = scrollRef.current
    if (el != null) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const send = useCallback(
    async (mode: ProfessorMode, history: PanelMessage[]) => {
      setBusy(true)
      try {
        const context = await buildProfessorContext({
          mode,
          route: pathname,
          symbolState,
          stf,
          tz,
        })
        const result = await askProfessor({
          mode,
          symbol: symbolState.entry.param,
          tf: symbolState.tf.toLowerCase(),
          route: pathname,
          tz: tz.toLowerCase(),
          messages: mode === 'chat' ? historyForApi(history) : undefined,
          context,
        })
        if (result.ok) {
          setMessages((prev) => [...prev, { role: 'assistant', content: result.text }])
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', content: result.message, tone: 'error' }])
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Professor ตอบไม่ได้: ${err instanceof Error ? err.message : String(err)}`,
            tone: 'error',
          },
        ])
      } finally {
        setBusy(false)
      }
    },
    [pathname, symbolState, stf, tz],
  )

  const runQuickAction = useCallback(
    (mode: Exclude<ProfessorMode, 'chat'>, label: string) => {
      if (busy) return
      /* Coach honesty: a market without a Scalper's Clock export says so
         directly instead of asking the backend to improvise. */
      if (mode === 'coach' && symbolState.entry.scalperM15 == null) {
        setMessages((prev) => [
          ...prev,
          { role: 'user', content: label },
          {
            role: 'assistant',
            content: `ขออภัย — ตลาด ${symbolState.entry.label} ยังไม่มี Scalper's Clock research export เลยไม่มีข้อมูลจริงให้โค้ชครับ`,
            tone: 'error',
          },
        ])
        return
      }
      setMessages((prev) => {
        const next: PanelMessage[] = [...prev, { role: 'user', content: label }]
        void send(mode, next)
        return next
      })
    },
    [busy, send, symbolState.entry],
  )

  const submitChat = useCallback(() => {
    const text = draft.trim()
    if (text === '' || busy) return
    setDraft('')
    setMessages((prev) => {
      const next: PanelMessage[] = [...prev, { role: 'user', content: text }]
      void send('chat', next)
      return next
    })
  }, [draft, busy, send])

  const routeLabel = ROUTE_LABELS[pathname] ?? pathname

  return (
    <>
      {/* Floating action button — bottom-right on every route, clear of the
          dashboard status bar (which sits at the very bottom edge). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Professor ประจำสถานี — AI ผู้ช่วยอธิบาย"
        className="fixed bottom-16 right-4 z-40 flex items-center justify-center rounded-full border border-goldhi/60 bg-gold text-bg0 shadow-[0_4px_24px_rgba(232,178,58,0.45)] transition-transform hover:scale-105 active:scale-95 md:bottom-6 md:right-6"
        style={{ height: 52, width: 52 }}
      >
        <GraduationCap size={26} strokeWidth={1.9} />
      </button>

      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent className="mx-auto flex h-[88dvh] w-full max-w-2xl flex-col border-line bg-bg1 text-text0">
          <DrawerHeader className="border-b border-line pb-3 text-left">
            <DrawerTitle className="flex items-center gap-2 font-display text-[16px] font-semibold text-gold">
              <GraduationCap size={18} />
              Professor ประจำสถานี
            </DrawerTitle>
            <DrawerDescription className="font-mono text-[11px] text-text2">
              {symbolState.entry.label} · {symbolState.tf} · {routeLabel} · {tz}
            </DrawerDescription>
          </DrawerHeader>

          {/* Permanent honesty banner — above the chat, always visible. */}
          <div className="mx-4 mt-3 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 font-mono text-[11px] leading-4 text-warn">
            {HONESTY_BANNER}
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => runQuickAction('explain', 'อธิบายหน้านี้')}
              className="border-gold/50 bg-transparent font-mono text-[12px] text-gold hover:bg-gold/10 hover:text-goldhi"
            >
              <Compass size={13} className="mr-1.5" />
              อธิบายหน้านี้
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => runQuickAction('brief', 'บรีฟวันนี้')}
              className="border-gold/50 bg-transparent font-mono text-[12px] text-gold hover:bg-gold/10 hover:text-goldhi"
            >
              <Newspaper size={13} className="mr-1.5" />
              บรีฟวันนี้
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => runQuickAction('coach', 'โค้ช Scalper')}
              className="border-gold/50 bg-transparent font-mono text-[12px] text-gold hover:bg-gold/10 hover:text-goldhi"
            >
              <Clock3 size={13} className="mr-1.5" />
              โค้ช Scalper ({symbolState.entry.label} {stf})
            </Button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="mt-3 flex-1 overflow-y-auto px-4 pb-3" aria-live="polite">
            {messages.length === 0 && !busy && (
              <div className="mt-8 flex flex-col items-center gap-2 text-center">
                <Sparkles size={20} className="text-golddim" />
                <p className="max-w-sm font-mono text-[12px] leading-5 text-text2">
                  สวัสดีครับ ผม Professor ประจำสถานี — เลือก quick action ด้านบน หรือพิมพ์คำถามได้เลย
                  ผมอธิบายจากข้อมูลจริงของแอปเท่านั้น
                </p>
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    'max-w-[88%] rounded-lg px-3 py-2 text-[13px] leading-5',
                    m.role === 'user'
                      ? 'self-end whitespace-pre-wrap border border-gold/40 bg-gold/15 text-text0'
                      : m.tone === 'error'
                        ? 'self-start whitespace-pre-wrap border border-warn/40 bg-warn/10 font-mono text-[12px] text-warn'
                        : 'self-start border border-line bg-bg2 text-text1',
                  )}
                >
                  {m.role === 'assistant' && m.tone !== 'error' ? (
                    <ProfessorMarkdown content={m.content} />
                  ) : (
                    m.content
                  )}
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 self-start rounded-lg border border-line bg-bg2 px-3 py-2 font-mono text-[12px] text-text2">
                  <Loader2 size={13} className="animate-spin text-gold" />
                  Professor กำลังคิด…
                </div>
              )}
            </div>
          </div>

          {/* Chat input */}
          <div className="flex items-center gap-2 border-t border-line p-3">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitChat()
              }}
              placeholder="ถาม Professor…"
              aria-label="ถาม Professor"
              disabled={busy}
              className="h-10 border-line bg-bg2 font-mono text-[13px] text-text0 placeholder:text-text3"
            />
            <Button
              type="button"
              onClick={submitChat}
              disabled={busy || draft.trim() === ''}
              aria-label="ส่งคำถาม"
              className="h-10 w-10 shrink-0 bg-gold text-bg0 hover:bg-goldhi"
              size="icon"
            >
              <Send size={16} />
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}

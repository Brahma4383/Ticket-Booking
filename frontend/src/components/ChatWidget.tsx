import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Input } from '@/components/ui/input'
import { useChat } from '@/hooks/useChat'
import { BRAND } from '@/constants'
import { ChatIcon, CloseIcon, SendIcon, SpinnerIcon } from '@/icons'
import { ApiError } from '@/services/api'
import { askAssistant, fetchGreeting } from '@/services/chat.services'
import type {
  ChatAction,
  ChatMessage,
  ChatTurn,
} from '@/types/chat.types'
import { cn } from '@/utils'

/**
 * The support assistant, as a bubble in the corner of every page.
 *
 * It answers from a script first and reaches for a model only when nothing
 * fits — which is a server-side decision, invisible from here. What *is*
 * visible from here is that it degrades: with no model configured the replies
 * are the scripted ones and the placeholder stops inviting free-text
 * questions, but every button still works and nothing shows an error.
 *
 * The transcript lives in this component's state and nowhere else. Close the
 * tab and the conversation is gone, which is the right default for a window
 * people paste PNRs and phone numbers into.
 */

/** Where an action button goes. The server names a route; this spells it. */
const ACTION_ROUTES: Record<ChatAction, { label: string; href: string }> = {
  account: { label: 'Open my bookings', href: '/account' },
  refunds: { label: 'Read the cancellation policy', href: '/legal#refunds' },
  contact: { label: 'Contact support', href: '/about#contact' },
  search: { label: 'Start a search', href: '/' },
}

/** How many turns are sent back up as context. The server caps it too. */
const HISTORY_TURNS = 12

let messageSeq = 0
const nextId = () => `chat-${(messageSeq += 1)}`

export function ChatWidget() {
  const { open, openChat, closeChat } = useChat()
  const navigate = useNavigate()
  const titleId = useId()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  /** Null until the first open; the greeting call decides it. */
  const [aiOn, setAiOn] = useState<boolean | null>(null)

  const input = useRef<HTMLInputElement>(null)
  const log = useRef<HTMLDivElement>(null)

  // The opening message is fetched rather than hardcoded, because only the
  // server knows whether the model half is configured — and that changes what
  // it is honest to invite the traveller to type.
  useEffect(() => {
    if (!open || messages.length > 0) return

    const controller = new AbortController()

    fetchGreeting(controller.signal)
      .then((greeting) => {
        setAiOn(greeting.ai)
        setMessages([
          {
            id: nextId(),
            role: 'assistant',
            text: greeting.reply,
            quickReplies: greeting.quickReplies,
            action: greeting.action,
          },
        ])
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        // Even the greeting failing is not worth an error screen: the widget
        // says hello itself and the first real message will either work or
        // report its own failure.
        setAiOn(false)
        setMessages([
          {
            id: nextId(),
            role: 'assistant',
            text:
              error instanceof ApiError && error.status === 0
                ? 'I cannot reach the support service from here. The phone number in the header is answered 24×7.'
                : 'Hello! Ask me about a booking, a cancellation, a refund or a payment.',
            quickReplies: ['Cancel a booking', 'Refund status', 'Talk to a person'],
          },
        ])
      })

    return () => controller.abort()
  }, [open, messages.length])

  // A new message should be readable without scrolling for it.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  // Opening a chat means wanting to type in it.
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  // One Escape closes the panel from anywhere inside it.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeChat()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closeChat])

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || sending) return

    // The history is taken before the new message is added: it is what came
    // *before* the question, which is what the server expects.
    const history: ChatTurn[] = messages
      .slice(-HISTORY_TURNS)
      .map((entry) => ({ role: entry.role, content: entry.text }))

    setMessages((current) => [
      ...current,
      { id: nextId(), role: 'user', text: message },
    ])
    setDraft('')
    setSending(true)

    try {
      const answer = await askAssistant(message, history)
      setMessages((current) => [
        ...current,
        {
          id: nextId(),
          role: 'assistant',
          text: answer.reply,
          quickReplies: answer.quickReplies,
          action: answer.action,
        },
      ])
    } catch (error) {
      const throttled = error instanceof ApiError && error.status === 429
      setMessages((current) => [
        ...current,
        {
          id: nextId(),
          role: 'assistant',
          failed: true,
          text: throttled
            ? `That is a lot of questions in one hour. Give it a little while, or call ${BRAND.supportPhone} — a person answers at any hour.`
            : `I could not get an answer just then. The support line is ${BRAND.supportPhone}, staffed 24×7.`,
        },
      ])
    } finally {
      setSending(false)
      input.current?.focus()
    }
  }

  return (
    <>
      {/* The launcher. Hidden while the panel is open on a phone, where the
          panel covers the whole screen and the button would sit on top of
          its own input. */}
      <button
        type="button"
        onClick={openChat}
        aria-expanded={open}
        aria-label="Open support chat"
        className={cn(
          'fixed right-4 bottom-4 z-40 grid h-14 w-14 cursor-pointer place-items-center rounded-full',
          'bg-brand-600 text-white shadow-lift transition-transform duration-200',
          'hover:bg-brand-700 active:scale-95 sm:right-6 sm:bottom-6',
          'print:hidden',
          open && 'pointer-events-none scale-0 opacity-0',
        )}
      >
        <ChatIcon className="h-6 w-6" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden bg-surface shadow-lift ring-1 ring-hairline',
            // A sheet on a phone, a panel on a desktop.
            'inset-x-0 bottom-0 top-0 rounded-none',
            'sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[34rem] sm:max-h-[calc(100vh-3rem)] sm:w-[23rem] sm:rounded-[1.75rem]',
            'print:hidden',
          )}
        >
          <header className="flex items-center gap-3 bg-gradient-to-br from-brand-700 to-brand-900 px-5 py-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15">
              <ChatIcon className="h-5 w-5 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-base text-white">
                {BRAND.name} support
              </h2>
              <p className="truncate text-xs text-white/75">
                {aiOn === false
                  ? 'Bookings, refunds and payments'
                  : 'Ask in any language · replies in seconds'}
              </p>
            </div>
            <button
              type="button"
              onClick={closeChat}
              aria-label="Close support chat"
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </header>

          <div
            ref={log}
            // Polite rather than assertive: a reply arriving should be read
            // out after whatever the traveller is doing, not over it.
            aria-live="polite"
            className="flex-1 space-y-4 overflow-y-auto bg-canvas px-4 py-5"
          >
            {messages.map((message) => (
              <Bubble
                key={message.id}
                message={message}
                onQuickReply={send}
                onAction={(href) => {
                  closeChat()
                  navigate(href)
                }}
              />
            ))}

            {sending ? <Typing /> : null}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void send(draft)
            }}
            className="flex items-center gap-2 border-t border-hairline bg-surface px-3 py-3"
          >
            <Input
              ref={input}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              // With the model off the assistant matches keywords, so asking
              // for a sentence in Tamil would be a promise it cannot keep.
              placeholder={
                aiOn === false
                  ? 'Booking, refund, payment…'
                  : 'Type in any language…'
              }
              aria-label="Your message"
              maxLength={1000}
              autoComplete="off"
              className="h-11 min-w-0 flex-1 rounded-full border-0 bg-surface-muted px-4 text-sm text-ink-900 shadow-none placeholder:text-ink-400 focus-visible:border-0 focus-visible:ring-2 focus-visible:ring-brand-500 md:text-sm dark:bg-surface-muted"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Send"
              className={cn(
                'grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full',
                'bg-brand-600 text-white transition-colors hover:bg-brand-700',
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </form>
        </div>
      ) : null}
    </>
  )
}

/** One message, plus whatever it offers to do next. */
function Bubble({
  message,
  onQuickReply,
  onAction,
}: {
  message: ChatMessage
  onQuickReply: (text: string) => void
  onAction: (href: string) => void
}) {
  const mine = message.role === 'user'
  const route = message.action ? ACTION_ROUTES[message.action] : null

  return (
    <div className={cn('flex flex-col gap-2', mine && 'items-end')}>
      <p
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line',
          mine
            ? 'rounded-br-md bg-brand-600 text-white'
            : 'rounded-bl-md bg-surface text-ink-700 ring-1 ring-hairline',
          message.failed && 'bg-danger-surface text-danger-fg ring-danger-border',
        )}
      >
        {message.text}
      </p>

      {route ? (
        <button
          type="button"
          onClick={() => onAction(route.href)}
          className="cursor-pointer rounded-full bg-brand-surface px-4 py-2 text-xs font-semibold text-brand-fg-strong ring-1 ring-brand-border transition-colors hover:bg-brand-border/40"
        >
          {route.label}
        </button>
      ) : null}

      {message.quickReplies?.length ? (
        <div className="flex flex-wrap gap-2">
          {message.quickReplies.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => onQuickReply(reply)}
              className="cursor-pointer rounded-full bg-surface px-3.5 py-2 text-xs font-semibold text-ink-600 ring-1 ring-hairline transition-colors hover:text-ink-900 hover:ring-brand-border"
            >
              {reply}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** The pause between a question and its answer, made visible. */
function Typing() {
  return (
    <p className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-surface px-4 py-2.5 text-sm text-ink-500 ring-1 ring-hairline">
      <SpinnerIcon className="h-4 w-4 animate-spin" />
      Typing…
    </p>
  )
}

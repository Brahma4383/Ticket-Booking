import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Whether the support chat is open.
 *
 * Only the open/closed flag lives here. The transcript stays inside
 * `ChatWidget`, because nothing else in the app has any business reading it —
 * what the rest of the site needs is a way to *start* a conversation, which is
 * the support card on the home page and the widget's own launcher.
 *
 * Same shape as `useAuth`, for the same reason: the thing that opens the panel
 * is nowhere near the thing that renders it.
 */
interface ChatState {
  open: boolean
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void
}

const ChatContext = createContext<ChatState | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  const value = useMemo<ChatState>(
    () => ({
      open,
      openChat: () => setOpen(true),
      closeChat: () => setOpen(false),
      toggleChat: () => setOpen((current) => !current),
    }),
    [open],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatState {
  const value = useContext(ChatContext)
  if (!value) {
    throw new Error('useChat must be used inside a <ChatProvider>.')
  }
  return value
}

/**
 * Opens the chat, for a component that only wants to start one.
 *
 * Returns a no-op outside the provider rather than throwing: a button that
 * offers to open a chat should not be able to take the page down with it.
 */
export function useOpenChat() {
  const value = useContext(ChatContext)
  const open = value?.openChat
  return useCallback(() => open?.(), [open])
}

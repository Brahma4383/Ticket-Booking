/**
 * The support assistant's side of `/api/chat/`.
 *
 * The transcript lives in the widget's own state and nowhere else — the server
 * keeps none of it, which is why every request carries the history back.
 */

/** Where an answer came from. Shown to nobody; useful when reading the network tab. */
export type ChatSource = 'scripted' | 'ai' | 'fallback'

/**
 * A route the assistant offers as a button under its reply.
 *
 * The server names a destination rather than a URL, for the same reason the
 * navbar does: only the front end knows how its own routes are spelled.
 */
export type ChatAction = 'account' | 'refunds' | 'contact' | 'search'

/** One answer from the server. */
export interface ChatReply {
  reply: string
  /** Tappable follow-up questions, shown as chips under the message. */
  quickReplies: string[]
  action: ChatAction | null
  source: ChatSource
  /** Which scripted intent matched, or `''` when the model answered. */
  intent: string
}

/** What the assistant says before anything has been asked. */
export interface ChatGreeting {
  /**
   * Whether the AI half is configured on the server.
   *
   * The opening line changes on it: with the model off the assistant is a
   * menu, and inviting free-text questions it cannot parse wastes the
   * traveller's time.
   */
  ai: boolean
  signedIn: boolean
  reply: string
  quickReplies: string[]
  action: ChatAction | null
}

/** One line of the transcript, as the widget holds it. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Only an assistant message carries these. */
  quickReplies?: string[]
  action?: ChatAction | null
  /** Set when the send failed, so the bubble can say so. */
  failed?: boolean
}

/** What is sent back up as context. Capped server-side at the last 12 turns. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

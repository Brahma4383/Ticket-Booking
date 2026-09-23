import { apiGet, apiPost } from '@/services/api'
import type { ChatGreeting, ChatReply, ChatTurn } from '@/types/chat.types'

/**
 * The support assistant, under `/api/chat/`.
 *
 * Open to anyone — a traveller who cannot sign in is exactly who most needs to
 * ask something. The bearer token goes up with every request anyway (see
 * `services/api.ts`), which is what lets the assistant answer "where is my
 * booking" with the real answer rather than a description of one.
 */

/** The opening message, and whether free-text understanding is switched on. */
export function fetchGreeting(signal?: AbortSignal): Promise<ChatGreeting> {
  return apiGet<ChatGreeting>('/chat/', undefined, signal)
}

/**
 * Ask one question.
 *
 * `history` is the conversation so far: the server stores nothing between
 * requests, so this is what gives the assistant a memory of the last few
 * turns. Only the tail is kept server-side.
 *
 * Throws an `ApiError`; `throttled` means too many messages from this address
 * in an hour.
 */
export function askAssistant(
  message: string,
  history: ChatTurn[],
  signal?: AbortSignal,
): Promise<ChatReply> {
  return apiPost<ChatReply>('/chat/', { message, history }, signal)
}

import { apiPost } from '@/services/api'

/**
 * The contact form, under `/api/contact/`.
 *
 * Nothing is stored: the server validates the message, mails it to the
 * support inbox and forgets it. There is no booking, no account and no row to
 * read back afterwards, which is why this module has no `fetch` half.
 */

export interface ContactMessage {
  name: string
  email: string
  /** Optional; blank is accepted. */
  phone: string
  topic: string
  message: string
  /**
   * The honeypot. Left empty by a person, filled in by a bot that types into
   * every input it finds, and thrown away by the server when it is set.
   */
  website: string
}

export interface ContactResult {
  sent: boolean
  /** The inbox it went to, so the page can say where to expect a reply from. */
  inbox: string
}

/**
 * Send a message to the support inbox.
 *
 * Throws an `ApiError`. `invalid_message` carries a `detail` map of field
 * names, `message_not_sent` means the mail server refused it, and DRF's
 * `throttled` means this address has sent too many in the last hour.
 */
export function sendContactMessage(
  message: ContactMessage,
  signal?: AbortSignal,
): Promise<ContactResult> {
  return apiPost<ContactResult>('/contact/', message, signal)
}
